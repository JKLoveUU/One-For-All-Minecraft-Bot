// Experimental TUI for One-For-All (enabled via config.setting.enableEXPTUI).
// Requires: neo-blessed
const blessed = require('neo-blessed')
const pkg = require('../../package.json')
const { setSink } = require('../logger')

const TOP_H    = 12
const CMD_H    = 3
const STATUS_H = 1
const TABS_H   = 2

const T = {
    bg:        '#1e1e2e',
    surface:   '#313244',
    overlay:   '#45475a',
    text:      '#cdd6f4',
    subtext:   '#bac2de',
    muted:     '#6c7086',
    primary:   '#c6a0f6',
    secondary: '#f5c2e7',
    success:   '#a6e3a1',
    warning:   '#f9e2af',
    error:     '#eba0ac',
    accent:    '#89b4fa',
}

const TAB_NAMES = ['Dashboard', 'Console', 'Profiles', 'Helps', 'Settings']

// ANSI → blessed tag converter (for piping pre-formatted logger output)
const ANSI_MAP = {
    '30': T.bg,        '31': T.error,     '32': T.success,
    '33': T.warning,   '34': T.accent,    '35': T.secondary,
    '36': T.accent,    '37': T.text,      '90': T.muted,
    '91': T.error,     '92': T.success,   '93': T.warning,
    '94': T.accent,    '95': T.secondary, '96': T.accent,
    '97': T.text,
}
function ansiToBlessed(str) {
    return String(str).replace(/\x1b\[(\d+)m/g, (_m, code) => {
        if (code === '0') return '{/}'
        const col = ANSI_MAP[code]
        return col ? `{${col}-fg}` : ''
    })
}

function start(botManager, config, callbacks = {}) {
    const { onCommand, onExit } = callbacks

    const screen = blessed.screen({
        smartCSR: true,
        title: 'ONE-FOR-ALL',
        fullUnicode: true,
        dockBorders: false,
        useBCE: true,
        forceUnicode: true,
        autoPadding: true,
        terminal: process.env.TERM || 'xterm-256color',
    })

    screen.program.alternateBuffer()
    screen.program.hideCursor()
    screen.program.clear()
    screen.enableMouse()

    let exiting = false
    function cleanExit(code = 0) {
        if (exiting) return
        exiting = true

        // Announce + flush a final frame while the TUI is still up.
        try { appendLog(`{${T.warning}-fg}[TUI] Shutting down...{/}`) } catch (_) {}
        try { screen.render() } catch (_) {}

        const origExit = process.exit.bind(process)
        // Swallow process.exit calls made during onExit() (e.g. handleClose's own exit)
        // so the TUI controls the final teardown order.
        process.exit = () => {}

        const tearDown = () => {
            try { clearInterval(refreshTimer) } catch (_) {}
            try { clearInterval(infoPollTimer) } catch (_) {}
            try { botManager.handle.off('data', onBotData) } catch (_) {}
            try { setSink(null) } catch (_) {}
            try { screen.program.disableMouse() } catch (_) {}
            try { screen.program.showCursor() } catch (_) {}
            try { screen.program.normalBuffer() } catch (_) {}
            try { screen.destroy() } catch (_) {}
            // Tiny delay so the terminal flushes the mode/buffer switch before node quits.
            setTimeout(() => origExit(code), 80)
        }

        const done = () => {
            try { screen.render() } catch (_) {}
            // One extra tick for any in-flight IPC messages / appendLog calls.
            setTimeout(tearDown, 120)
        }

        if (typeof onExit === 'function') {
            Promise.resolve()
                .then(() => onExit())
                .catch(() => {})
                .finally(done)
        } else {
            done()
        }
    }

    // ── Tabs ──
    let activeTab = 1
    const tabsBar = blessed.box({
        parent: screen,
        top: 0, left: 0, width: '100%', height: TABS_H,
        tags: true,
        style: { bg: T.bg },
    })

    function renderTabs() {
        let labels = '  '
        for (let i = 0; i < TAB_NAMES.length; i++) {
            const name = TAB_NAMES[i]
            labels += i === activeTab
                ? `{${T.primary}-fg}{bold}${name}{/bold}{/}`
                : `{${T.muted}-fg}${name}{/}`
            if (i < TAB_NAMES.length - 1)
                labels += `  {${T.overlay}-fg}│{/}  `
        }
        const sep = `{white-fg}${'─'.repeat(300)}{/}`
        tabsBar.setContent(labels + '\n' + sep)
    }

    // ── Console tab widgets ──
    const botList = blessed.list({
        parent: screen,
        label: ' Bots ',
        top: TABS_H, left: 0,
        width: '40%', height: TOP_H,
        border: { type: 'line' },
        tags: true,
        style: {
            border: { fg: T.overlay },
            selected: { bg: T.primary, fg: T.bg },
            item: { fg: T.text },
            label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary } },
        },
        keys: true, vi: true, mouse: false, scrollable: true,
    })

    const infoBox = blessed.box({
        parent: screen,
        label: ' Infos ',
        top: TABS_H, left: '40%',
        width: '60%', height: TOP_H,
        border: { type: 'line' },
        tags: true, scrollable: true, mouse: false,
        style: { border: { fg: T.overlay }, label: { fg: T.subtext }, fg: T.text },
    })

    const logBox = blessed.log({
        parent: screen,
        label: ' Logs ',
        top: TABS_H + TOP_H, left: 0,
        width: '100%',
        height: `100%-${TABS_H + TOP_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true,
        style: {
            border: { fg: T.overlay }, label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary } },
        },
        scrollable: true, alwaysScroll: false, scrollback: 500,
        scrollbar: { ch: ' ', style: { bg: T.primary } },
        mouse: false, keys: true, vi: true,
    })

    // ── Shared full-content box for non-Console tabs ──
    const tabContent = blessed.box({
        parent: screen,
        top: TABS_H, left: 0,
        width: '100%',
        height: `100%-${TABS_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true, scrollable: true, mouse: false, keys: true,
        style: {
            border: { fg: T.overlay }, label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary } },
            fg: T.text, bg: T.bg,
        },
        hidden: true,
    })

    // ── Command bar + status bar ──
    const commandBar = blessed.box({
        parent: screen,
        label: ' Command ',
        bottom: STATUS_H, left: 0,
        width: '100%', height: CMD_H,
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: T.overlay }, label: { fg: T.subtext } },
    })

    const statusBar = blessed.box({
        parent: screen,
        bottom: 0, left: 0, width: '100%', height: STATUS_H,
        tags: true,
        style: { bg: T.bg, fg: T.text },
    })

    const focusSink = blessed.box({
        parent: screen,
        top: 0, left: 0, width: 0, height: 0, hidden: true,
    })

    // ── State ──
    const logEnabled = {}   // per-bot-name log filter
    let mode = 'normal'
    let cmdBuffer = ''
    let mouseOn = true      // can be toggled (m) so the user can copy text from the log
    let followBottom = true // auto-scroll log to new entries only when user is already at bottom
    let unseen = 0          // lines arrived while not following bottom
    const cmdHistory = []   // newest-last
    let histIdx = -1        // -1 = not navigating (editing live buffer)
    let pendingBuffer = ''  // buffer saved when user starts walking history

    function isLogEnabled(name) {
        if (logEnabled[name] === undefined) logEnabled[name] = true
        return logEnabled[name]
    }

    // ── Smart append ──
    // neo-blessed's log widget schedules setScrollPerc(100) on every 'set content'
    // event unless _userScrolled is true. Toggle it ourselves so a scrolled-up user
    // doesn't get yanked back to the bottom every time a new line arrives.
    function appendLog(msg) {
        const lines = String(msg).split(/\r?\n/).filter(l => l.trim().length > 0)
        if (lines.length === 0) return

        if (!followBottom) {
            logBox._userScrolled = true
        } else {
            logBox._userScrolled = false
        }

        const savedScroll = logBox.getScroll()
        for (const line of lines) logBox.pushLine(line)

        // pushLine bypasses neo-blessed's Log.log() scrollback trim — enforce ourselves.
        const cap = logBox.scrollback || 500
        const fake = logBox._clines && logBox._clines.fake
        if (fake && fake.length > cap) {
            logBox.shiftLine(0, fake.length - cap)
        }

        if (!followBottom) {
            // The widget's deferred auto-scroll is suppressed by _userScrolled; still pin
            // the viewport explicitly in case pushLine reflowed the content.
            logBox.scrollTo(savedScroll)
            unseen += lines.length
            updateLogLabel()
        }
        screen.render()
    }
    function updateLogLabel() {
        if (followBottom) logBox.setLabel(' Logs ')
        else              logBox.setLabel(` Logs  {${T.warning}-fg}↑ ${unseen} new{/} `)
    }

    // ── Bot list render ──
    function statusColor(status) {
        const s = String(status || '').toLowerCase()
        if (!status) return T.muted
        if (s.includes('error') || s.includes('fail') || s.includes('closed')) return T.error
        if (s.includes('login') || s.includes('connect') || s.includes('joining')) return T.warning
        if (s.includes('ready') || s.includes('online') || s.includes('running')) return T.success
        return T.subtext
    }
    function formatBotItem(bot) {
        const enabled = isLogEnabled(bot.name)
        const dot = enabled ? `{${T.success}-fg}●{/}` : `{${T.muted}-fg}○{/}`
        const state = bot.childProcess
            ? `{${T.success}-fg}▶{/}`
            : `{${T.muted}-fg}◦{/}`
        const status = bot.status || '-'
        const sCol = statusColor(bot.status)
        return ` ${dot} ${state} ${bot.name.padEnd(10)} {${sCol}-fg}${String(status).padEnd(18)}{/}`
    }
    function updateBotList() {
        const selected = botList.selected
        botList.setItems(botManager.bots.map(formatBotItem))
        if (botManager.bots.length > 0)
            botList.select(Math.min(selected, botManager.bots.length - 1))
    }

    // ── Info panel (Infos) ──
    const infoCache = {}   // bot.name -> { data, receivedAt }

    function isMissing(v) { return v == null || v === '-' || v === '' || v === -1 || v === '-1' }
    function val(v)       { return isMissing(v) ? '-' : v }
    function fmtTask(t) {
        if (isMissing(t)) return '-'
        if (typeof t !== 'object') return '-'                   // reject booleans, numbers etc
        if (typeof t.displayName === 'string' && t.displayName) return t.displayName
        if (typeof t.name        === 'string' && t.name)        return t.name
        if (typeof t.type        === 'string' && t.type)        return t.type
        if (Array.isArray(t.content) && t.content.length)       return t.content.join(' ')
        return '-'
    }
    function fmtPos(p) {
        if (!p || typeof p !== 'object') return '-'
        const x = Number(p.x), y = Number(p.y), z = Number(p.z)
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            return `${x | 0}, ${y | 0}, ${z | 0}`
        }
        return '-'
    }
    function ageSec(t) {
        return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null
    }

    function renderInfos() {
        const sel = botManager.bots[botList.selected]
        if (!sel) {
            infoBox.setContent(`\n  {${T.muted}-fg}No bot selected.{/}`)
            return
        }
        const entry = infoCache[sel.name]
        const data  = (entry && entry.data) || {}
        const freshness = entry ? ageSec(entry.receivedAt) : null
        const freshText = freshness == null
            ? `{${T.muted}-fg}(awaiting data){/}`
            : `{${T.muted}-fg}updated ${freshness}s ago{/}`

        const running = sel.childProcess
            ? `{${T.success}-fg}running{/}`
            : `{${T.muted}-fg}stopped{/}`

        const pingTxt    = isMissing(data.ping) ? '-' : data.ping + 'ms'
        const rows = [
            `  {${T.primary}-fg}{bold}${sel.name}{/bold}{/}  ${running}  ${freshText}`,
            `  {${T.subtext}-fg}Server{/} ${val(data.server)}   {${T.subtext}-fg}Pos{/} ${fmtPos(data.position)}`,
            `  {${T.subtext}-fg}Ping{/} ${pingTxt}   {${T.subtext}-fg}Balance{/} ${val(data.balance)}   {${T.subtext}-fg}Coin{/} ${val(data.coin)}`,
            '',
        ]

        const upcoming = Array.isArray(data.tasks) ? data.tasks : []
        const hasCurrent = !isMissing(data.runingTask)
        const total = (hasCurrent ? 1 : 0) + upcoming.length
        if (total === 0) {
            rows.push(`  {${T.subtext}-fg}Tasks{/}  {${T.muted}-fg}-{/}`)
        } else {
            // Available rows for task lines = infoBox height - border(2) - header rows above.
            const innerH = (typeof infoBox.height === 'number' ? infoBox.height : TOP_H) - 2
            const reserved = rows.length
            const budget = Math.max(1, innerH - reserved)

            const items = []
            if (hasCurrent) {
                items.push(`  {${T.warning}-fg}>{/} {${T.warning}-fg}${fmtTask(data.runingTask)}{/}`)
            }
            upcoming.forEach((t, i) => {
                items.push(`    {${T.muted}-fg}${String(i + 1).padStart(2)}.{/} {${T.text}-fg}${fmtTask(t)}{/}`)
            })

            if (items.length <= budget) {
                rows.push(...items)
            } else {
                // Too many to fit — keep the first (current) line, then compress into a summary.
                const shown = budget - 1 // leave one slot for the "+N more" tail
                rows.push(...items.slice(0, shown))
                rows.push(`    {${T.muted}-fg}... +${items.length - shown} more{/}`)
            }
        }
        infoBox.setContent(rows.join('\n'))
    }

    // Cache incoming `data` events from botmanager (child -> parent via IPC: 'dataToParent').
    const onBotData = (data, name) => {
        if (!name) return
        infoCache[name] = { data, receivedAt: Date.now() }
        if (activeTab === 1) {
            const sel = botManager.bots[botList.selected]
            if (sel && sel.name === name) renderInfos()
            screen.render()
        }
    }
    try { botManager.handle.on('data', onBotData) } catch (_) {}

    // Periodic pull: ask each live child for fresh data.
    const infoPollTimer = setInterval(() => {
        for (const b of botManager.bots) {
            if (b.childProcess) {
                try { b.childProcess.send({ type: 'dataRequire' }) } catch (_) {}
            }
        }
    }, 3000)

    // ── Tab content generators ──
    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '-'
        if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB'
        if (n >= 1024 * 1024)        return (n / 1048576).toFixed(1)    + ' MB'
        if (n >= 1024)               return (n / 1024).toFixed(0)       + ' KB'
        return n + ' B'
    }
    function dashboardContent() {
        const bots = botManager.bots || []
        const parentMem = process.memoryUsage()
        const header = [
            '',
            `  {${T.primary}-fg}{bold}Dashboard{/bold}{/}  {${T.muted}-fg}(${bots.length} bot${bots.length === 1 ? '' : 's'}){/}`,
            '',
            `  {${T.subtext}-fg}Parent{/}  PID ${process.pid}   RSS ${fmtBytes(parentMem.rss)}   Heap ${fmtBytes(parentMem.heapUsed)} / ${fmtBytes(parentMem.heapTotal)}`,
            '',
            `  {${T.surface}-bg}{${T.subtext}-fg} ${'Bot'.padEnd(14)} ${'PID'.padEnd(8)} ${'RSS'.padEnd(10)} ${'Heap Used'.padEnd(11)} ${'Heap Total'.padEnd(11)} ${'External'.padEnd(9)} Status {/}`,
        ]
        if (bots.length === 0) {
            header.push(`  {${T.muted}-fg}  no bots registered{/}`)
            return header.join('\n')
        }
        for (const b of bots) {
            const pid = (b.childProcess && b.childProcess.pid) || '-'
            const mem = (infoCache[b.name] && infoCache[b.name].data && infoCache[b.name].data.memory) || null
            const rss  = mem ? fmtBytes(mem.rss)        : '-'
            const used = mem ? fmtBytes(mem.heapUsed)   : '-'
            const tot  = mem ? fmtBytes(mem.heapTotal)  : '-'
            const ext  = mem ? fmtBytes(mem.external)   : '-'
            const sCol = statusColor(b.status)
            const status = b.status || '-'
            const pidStr = b.childProcess
                ? `{${T.success}-fg}${String(pid).padEnd(8)}{/}`
                : `{${T.muted}-fg}${'-'.padEnd(8)}{/}`
            header.push(
                `  {${T.text}-fg}${b.name.padEnd(14)}{/} ` +
                pidStr + ' ' +
                `{${T.accent}-fg}${rss.padEnd(10)}{/} ` +
                `{${T.accent}-fg}${used.padEnd(11)}{/} ` +
                `{${T.muted}-fg}${tot.padEnd(11)}{/} ` +
                `{${T.muted}-fg}${ext.padEnd(9)}{/} ` +
                `{${sCol}-fg}${status}{/}`
            )
        }
        return header.join('\n')
    }

    function profilesContent() {
        const profiles = botManager.profiles || {}
        const names = Object.keys(profiles)
        if (names.length === 0) {
            return `\n  {${T.muted}-fg}No profiles loaded from profiles.json{/}`
        }
        const lines = [
            '',
            `  {${T.primary}-fg}{bold}Profiles{/bold}{/}  {${T.muted}-fg}(${names.length} total){/}`,
            '',
            `  {${T.surface}-bg}{${T.subtext}-fg} ${'Name'.padEnd(14)} ${'Type'.padEnd(10)} ${'Username'.padEnd(26)} ${'IP'.padEnd(28)} ${'Port'.padEnd(6)} Ver {/}`,
        ]
        for (const name of names) {
            const p = profiles[name] || {}
            lines.push(
                `  {${T.text}-fg}${name.padEnd(14)}{/} ` +
                `{${T.accent}-fg}${String(p.type || '-').padEnd(10)}{/} ` +
                `{${T.subtext}-fg}${String(p.username || '-').padEnd(26)}{/} ` +
                `{${T.subtext}-fg}${String(p.ip || p.host || '-').padEnd(28)}{/} ` +
                `{${T.subtext}-fg}${String(p.port || '-').padEnd(6)}{/} ` +
                `{${T.muted}-fg}${p.version || '-'}{/}`
            )
        }
        return lines.join('\n')
    }

    function helpsContent() {
        return [
            '',
            `  {${T.primary}-fg}{bold}Helps{/bold}{/}`,
            '',
            `  {${T.muted}-fg}(coming soon){/}`,
        ].join('\n')
    }

    function settingsContent() {
        return [
            '',
            `  {${T.primary}-fg}{bold}Settings{/bold}{/}`,
            '',
            `  {${T.muted}-fg}(coming soon){/}`,
        ].join('\n')
    }

    function showTab(n) {
        const isConsole = n === 1
        const toggle = (w, show) => show ? w.show() : w.hide()
        toggle(botList,    isConsole)
        toggle(infoBox,    isConsole)
        toggle(logBox,     isConsole)
        toggle(tabContent, !isConsole)

        if (!isConsole) {
            const gen = [dashboardContent, null, profilesContent, helpsContent, settingsContent][n]
            tabContent.setLabel(` ${TAB_NAMES[n]} `)
            if (gen) tabContent.setContent(gen())
            tabContent.focus()
        } else {
            botList.focus()
            renderInfos()
        }
    }

    // ── Command bar render ──
    const CMD_PLACEHOLDER_NORMAL = ` {${T.muted}-fg}press {${T.accent}-fg}/{${T.muted}-fg} to enter a command{/}`
    const CMD_PLACEHOLDER_CMD    = ` {${T.muted}-fg}type a command... esc to cancel{/}`

    function renderCommandBar() {
        const isEmpty = cmdBuffer.length === 0
        if (mode === 'command') {
            commandBar.style.border.fg = T.primary
            commandBar.style.label.fg  = T.primary
            commandBar.setContent(isEmpty ? CMD_PLACEHOLDER_CMD : ' ' + cmdBuffer)
            screen.program.showCursor()
        } else {
            commandBar.style.border.fg = T.overlay
            commandBar.style.label.fg  = T.subtext
            commandBar.setContent(CMD_PLACEHOLDER_NORMAL)
            screen.program.hideCursor()
        }
    }

    function positionCursor() {
        if (mode !== 'command') return
        const left = commandBar.aleft + 1 + 1 + cmdBuffer.length
        const top  = commandBar.atop  + 1
        screen.program.cup(top, left)
    }

    function renderStatusBar() {
        const seg = (bg, fg, text) => `{${bg}-bg}{${fg}-fg}${text}{/}`
        const modeSeg = mode === 'command'
            ? seg(T.secondary, T.bg, ' CMD ')
            : seg(T.primary,   T.bg, ' NORMAL ')
        const active = botManager.bots.filter(b => isLogEnabled(b.name)).length
        const total  = botManager.bots.length
        const tabSeg = seg(T.surface, T.text,    ` ${TAB_NAMES[activeTab]} `)
        const botSeg = seg(T.overlay, T.subtext, ` ${active}/${total} logging `)
        const copyHint = mouseOn ? 'm: copy mode' : 'm: resume mouse'
        const hints  = mode === 'command'
            ? ' Enter submit  -  Up/Down history  -  Esc cancel '
            : ` ${copyHint}  -  Ctrl-C / /exit: quit `
        const hintSeg = seg(T.bg, T.muted, hints)
        const tail    = seg(T.surface, T.subtext, ` ONE-FOR-ALL v${pkg.version} By JKLove `)
        // Tail goes right — pad via a wide muted spacer.
        statusBar.setContent(modeSeg + tabSeg + botSeg + hintSeg + `{|}` + tail)
    }

    function redraw() {
        renderTabs()
        renderCommandBar()
        renderStatusBar()
        screen.render()
        positionCursor()
    }

    function switchTab(n) {
        activeTab = (n + TAB_NAMES.length) % TAB_NAMES.length
        showTab(activeTab)
        redraw()
    }

    function setNormalMode() {
        mode = 'normal'
        cmdBuffer = ''
        if (activeTab === 1) botList.focus()
        else tabContent.focus()
        redraw()
    }

    function setCommandMode() {
        mode = 'command'
        cmdBuffer = ''
        focusSink.focus()
        redraw()
    }

    function toggleMouse() {
        mouseOn = !mouseOn
        try {
            if (mouseOn) screen.program.enableMouse()
            else         screen.program.disableMouse()
        } catch (_) {}
        redraw()
    }

    // ── Keypress ──
    function historyPrev() {
        if (cmdHistory.length === 0) return
        if (histIdx === -1) { pendingBuffer = cmdBuffer; histIdx = cmdHistory.length - 1 }
        else if (histIdx > 0) { histIdx -= 1 }
        cmdBuffer = cmdHistory[histIdx]
        redraw()
    }
    function historyNext() {
        if (histIdx === -1) return
        if (histIdx < cmdHistory.length - 1) {
            histIdx += 1
            cmdBuffer = cmdHistory[histIdx]
        } else {
            histIdx = -1
            cmdBuffer = pendingBuffer
            pendingBuffer = ''
        }
        redraw()
    }
    screen.on('keypress', (ch, key) => {
        if (mode === 'command') {
            if (key.name === 'enter' || key.name === 'return') {
                const cmd = cmdBuffer.trim()
                if (cmd && cmdHistory[cmdHistory.length - 1] !== cmd) cmdHistory.push(cmd)
                if (cmdHistory.length > 200) cmdHistory.shift()
                histIdx = -1; pendingBuffer = ''
                setNormalMode()
                if (cmd === 'exit' || cmd === 'quit') { cleanExit(0); return }
                if (cmd && typeof onCommand === 'function') {
                    try { onCommand(cmd) } catch (e) { appendLog(`{${T.error}-fg}[TUI ERROR] ${e.message}{/}`) }
                }
                return
            }
            if (key.name === 'escape')   { histIdx = -1; pendingBuffer = ''; setNormalMode(); return }
            if (key.name === 'up')       { historyPrev(); return }
            if (key.name === 'down')     { historyNext(); return }
            if (key.name === 'backspace') {
                cmdBuffer = cmdBuffer.slice(0, -1)
                if (histIdx !== -1) { pendingBuffer = cmdBuffer; histIdx = -1 }
                redraw(); return
            }
            if (ch && ch.length === 1 && !key.ctrl && !key.meta && ch >= ' ') {
                if (histIdx !== -1) { pendingBuffer = cmdBuffer; histIdx = -1 }
                cmdBuffer += ch; redraw()
            }
            return
        }
        if (ch === '/') { setCommandMode(); return }
        if (key.name === 'left')  { switchTab(activeTab - 1); return }
        if (key.name === 'right') { switchTab(activeTab + 1); return }
        if (ch && ch >= '1' && ch <= '5') { switchTab(parseInt(ch) - 1); return }
        if (ch === 'm' && !key.ctrl && !key.meta) { toggleMouse(); return }
        if (key.full === 'C-c') cleanExit(0)
    })

    // Tab is reserved for future command-bar autocomplete.

    // Screen-level wheel (elements have mouse:false so click can't steal focus).
    function userScrolled(dir) {
        if (activeTab !== 1) return
        logBox.scroll(dir)
        followBottom = logBox.getScrollPerc() >= 100
        if (followBottom) { unseen = 0 }
        updateLogLabel()
        screen.render()
    }
    // Listen to raw mouse events at screen level — fires regardless of each widget's mouse setting,
    // so wheel keeps working even though elements have mouse:false (to stop click from stealing focus).
    screen.on('mouse', (data) => {
        if (!data) return
        if (data.action === 'wheelup')   userScrolled(-3)
        if (data.action === 'wheeldown') userScrolled(3)
    })
    logBox.key(['up', 'k'],        () => userScrolled(-1))
    logBox.key(['down', 'j'],      () => userScrolled(1))
    logBox.key(['pageup'],         () => userScrolled(-Math.floor(logBox.height / 2)))
    logBox.key(['pagedown'],       () => userScrolled(Math.floor(logBox.height / 2)))
    logBox.key(['end', 'G'],       () => { logBox.setScrollPerc(100); followBottom = true; unseen = 0; updateLogLabel(); screen.render() })
    logBox.key(['home', 'g'],      () => { logBox.setScrollPerc(0);   followBottom = false; updateLogLabel(); screen.render() })

    // ── Bot list: Enter toggles log filter (no confirm) ──
    botList.on('select', (_item, idx) => {
        const bot = botManager.bots[idx]
        if (!bot) return
        logEnabled[bot.name] = !isLogEnabled(bot.name)
        updateBotList()
        botList.select(idx)
        appendLog(`{${T.muted}-fg}[TUI] Log ${logEnabled[bot.name] ? 'enabled' : 'disabled'} for ${bot.name}{/}`)
        redraw()
    })

    // Keep info panel in sync with selection
    botList.on('select item', () => renderInfos())
    botList.key(['up', 'down', 'k', 'j'], () => setTimeout(renderInfos, 0))

    // ── Wire logger sink ──
    setSink((formatted, meta) => {
        const name = (meta && meta.name) || ''
        // Filter bot-specific logs by toggle; always show CONSOLE / BOTMANAGER / SYSTEM
        const isSystem = name === 'CONSOLE' || name === 'BOTMANAGER' || !name
        if (!isSystem) {
            const botName = botManager.bots.find(b => name.startsWith(b.name.substring(0, 4)))?.name
            if (botName && !isLogEnabled(botName)) return
        }
        appendLog(ansiToBlessed(formatted))
    })

    // Suppress stray console.log so it doesn't corrupt the TUI buffer
    const origLog = console.log
    console.log = (...args) => appendLog(ansiToBlessed(args.join(' ')))
    const origErr = console.error
    console.error = (...args) => appendLog(`{${T.error}-fg}${ansiToBlessed(args.join(' '))}{/}`)

    // ── Periodic refresh (bot list changes, status updates) ──
    const refreshTimer = setInterval(() => {
        updateBotList()
        if (activeTab === 1) renderInfos()
        else if (activeTab === 0) tabContent.setContent(dashboardContent())
        redraw()
    }, 1000)

    // ── Exit cleanup ──
    process.on('SIGINT',  () => cleanExit(0))
    process.on('SIGTERM', () => cleanExit(0))
    process.on('exit', () => {
        try { screen.program.disableMouse(); screen.program.normalBuffer() } catch (_) {}
        try { console.log = origLog; console.error = origErr } catch (_) {}
        clearInterval(refreshTimer)
        clearInterval(infoPollTimer)
        try { botManager.handle.off('data', onBotData) } catch (_) {}
    })

    // ── Init ──
    updateBotList()
    if (botManager.bots.length > 0) botList.select(0)
    showTab(activeTab)
    // ── Startup: EULA ──
    const eulaLines = [
        ``,
        `{${T.primary}-fg}{bold}EULA 終端使用者授權合約{/bold}{/}`,
        `{${T.subtext}-fg}End-User License Agreement (EULA){/}`,
        ``,
        `{${T.text}-fg}使用本程序即表示您同意遵守本最終用戶許可協議的條款與條件。如果您不同意這些條款，請不要使用本程序。{/}`,
        ``,
        `{${T.warning}-fg}免責聲明：{/}{${T.text}-fg}本Bot的開發者和維護者對於使用本Bot生成的任何損失、糾紛或責任不承擔任何責任。使用者應自行承擔使用本Bot的所有風險和後果。{/}`,
        ``,
        `{${T.warning}-fg}法律法規：{/}{${T.text}-fg}本程序受到使用本程序所在地的法律的管轄和解釋。{/}`,
        ``,
    ]
    for (const line of eulaLines) logBox.pushLine(line)
    logBox.setScrollPerc(100)
    screen.realloc()
    redraw()

    return {
        appendLog,
        refresh: () => { updateBotList(); redraw() },
        cleanExit,
    }
}

module.exports = { start }
