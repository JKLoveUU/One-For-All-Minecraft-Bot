// Experimental TUI for One-For-All (enabled via config.setting.enableEXPTUI).
// Requires: neo-blessed
const blessed = require('neo-blessed')
const fs = require('fs')
const path = require('path')
const pkg = require('../../package.json')
const { setSink, cleanupOldLogs, logger } = require('../logger')
const discordbot = require('./discordbot')
const { configPath, profilesPath } = require('./runtimeFiles')

const { T, TOP_H, CMD_H, STATUS_H, TABS_H, TAB_NAMES, TIPS } = require('./tui/theme')
const { ansiToBlessed } = require('./tui/ansi')
const { isMissing, val, fmtTask, fmtPos, ageSec, fmtEta, statusColor } = require('./tui/format')
const { renderAutoQuestDetail, renderClearAreaDetail, renderVillagerDetail, renderWarehouseDetail, renderBuildLikeDetail, fmtWmsSourceLine } = require('./tui/detailRenderers')
const { buildHelps, helpsTocItem } = require('./tui/helpsContent')


function start(botManager, config, callbacks = {}) {
    const { onCommand, onExit, startedAt } = callbacks

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

    // Shutdown state machine.  0=idle, 1=confirming (Ctrl-C 等第二次), 2=graceful (handleClose 跑中), 3=forced.
    let shutdownPhase = 0
    let confirmTimer = null
    let shutdownPoller = null
    const CONFIRM_WINDOW_MS = 5000

    function cleanExit(code = 0, opts = {}) {
        const skipConfirm = !!(opts && opts.skipConfirm)

        // Phase 2 → Phase 3: 在 graceful 期間再按 Ctrl-C → 強制 SIGKILL。
        if (shutdownPhase === 2) {
            shutdownPhase = 3
            try {
                for (const b of botManager.bots) {
                    if (b.childProcess) try { b.childProcess.kill('SIGKILL') } catch (_) {}
                }
            } catch (_) {}
            try { clearInterval(shutdownPoller) } catch (_) {}
            try { screen.program.disableMouse() } catch (_) {}
            try { screen.program.showCursor() } catch (_) {}
            try { screen.program.normalBuffer() } catch (_) {}
            try { screen.destroy() } catch (_) {}
            process.exit(1)
            return
        }

        // Phase 3: 已強制結束中,什麼都不做。
        if (shutdownPhase === 3) return

        // Phase 1 → Phase 2: 第二次 Ctrl-C 確認,進入 graceful。
        if (shutdownPhase === 1) {
            try { clearTimeout(confirmTimer) } catch (_) {}
            confirmTimer = null
            // fall through 到 Phase 2 啟動段
        }
        // Phase 0 + skipConfirm (例如 /exit /quit) 也直接進 Phase 2。
        if (shutdownPhase === 0 && !skipConfirm) {
            // Phase 0 → Phase 1: 跳出確認提示,5 秒內等第二次 Ctrl-C。
            shutdownPhase = 1
            try { appendLog(`{${T.warning}-fg}[TUI] 再按一次 Ctrl-C 確認結束程式 (${CONFIRM_WINDOW_MS / 1000}s 內){/}`) } catch (_) {}
            try { notify(`再按一次 Ctrl-C 確認結束 (${CONFIRM_WINDOW_MS / 1000}s)`, 'warning', CONFIRM_WINDOW_MS) } catch (_) {}
            confirmTimer = setTimeout(() => {
                if (shutdownPhase === 1) {
                    shutdownPhase = 0
                    confirmTimer = null
                    try { appendLog(`{${T.muted}-fg}[TUI] 結束已取消 (${CONFIRM_WINDOW_MS / 1000}s 未確認){/}`) } catch (_) {}
                    try { notify('結束已取消', 'info', 2500) } catch (_) {}
                }
            }, CONFIRM_WINDOW_MS)
            return
        }

        // ── Phase 2: 開始 graceful 關閉 ──
        shutdownPhase = 2

        const aliveAtStart = botManager.bots.filter((b) => b.childProcess).length
        try { appendLog(`{${T.warning}-fg}[TUI] Shutting down — waiting for ${aliveAtStart} bot${aliveAtStart === 1 ? '' : 's'}... (再按 Ctrl-C 強制結束){/}`) } catch (_) {}
        try { notify(`正在關閉 ${aliveAtStart} 個 bot... (Ctrl-C 強制結束)`, 'warning', 30000) } catch (_) {}
        try { screen.render() } catch (_) {}

        // Live progress while handleClose awaits each child's exit.
        shutdownPoller = setInterval(() => {
            const alive = botManager.bots.filter((b) => b.childProcess).length
            if (alive > 0) {
                try { notify(`正在關閉 bot... 剩餘 ${alive} 個 (Ctrl-C 強制結束)`, 'warning', 30000) } catch (_) {}
            } else {
                try { notify('所有 bot 已結束,清理 TUI 中...', 'success', 5000) } catch (_) {}
            }
            try { updateBotList(); screen.render() } catch (_) {}
        }, 1000)

        const origExit = process.exit.bind(process)
        // Swallow process.exit calls made during onExit() (e.g. handleClose's own exit)
        // so the TUI controls the final teardown order.
        process.exit = () => {}

        const tearDown = () => {
            try { clearInterval(shutdownPoller) } catch (_) {}
            try { clearInterval(refreshTimer) } catch (_) {}
            try { clearInterval(infoPollTimer) } catch (_) {}
            try { clearInterval(detailPollTimer) } catch (_) {}
            try { clearInterval(tipTimer) } catch (_) {}
            try { botManager.handle.off('data', onBotData) } catch (_) {}
            try { setSink(null) } catch (_) {}
            try { screen.program.disableMouse() } catch (_) {}
            try { screen.program.showCursor() } catch (_) {}
            try { screen.program.normalBuffer() } catch (_) {}
            try { screen.destroy() } catch (_) {}
            // Flush any lines queued via setPendingOutput — written after normal buffer
            // is restored so they persist in the terminal instead of being lost with the
            // alternate buffer.
            if (_pendingStdoutLines.length) {
                try { process.stdout.write(_pendingStdoutLines.join('\n') + '\n') } catch (_) {}
                _pendingStdoutLines = []
            }
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
        width: '36%', height: TOP_H,
        border: { type: 'line' },
        tags: true,
        style: {
            border: { fg: T.overlay },
            selected: { bg: T.surface },
            label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary }, selected: { bg: T.overlay } },
        },
        keys: true, vi: true, mouse: false, scrollable: true,
    })

    // Bottom-of-Bots hint row (rendered inside the Bots frame, overlaying the last item slot).
    const botListHint = blessed.box({
        parent: screen,
        top: TABS_H + TOP_H - 2,
        left: 1,
        width: '36%-2',
        height: 1,
        tags: true,
        style: { bg: T.bg },
        content: ` {${T.muted}-fg}l:log  d:dbg  t:chat{/}`,
    })

    const infoBox = blessed.box({
        parent: screen,
        label: ' Infos ',
        top: TABS_H, left: '36%',
        width: '32%', height: TOP_H,
        border: { type: 'line' },
        tags: true, scrollable: true, mouse: false,
        style: { border: { fg: T.overlay }, label: { fg: T.subtext }, fg: T.text },
    })

    const detailBox = blessed.box({
        parent: screen,
        label: ' Detail ',
        top: TABS_H, left: '68%',
        width: '32%', height: TOP_H,
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
        // keys:false → 不裝內建 vi 捲動;捲動全由下方 logBox.key 手動綁定處理(避免雙重捲動,
        // 並正確維護 followBottom/unseen)。手動 .key() 在 keys:false 下仍會在 focus 時觸發。
        mouse: false, keys: false,
    })
    // neo-blessed Log schedules setScrollPerc(100) via nextTick on every 'set content',
    // and resets _userScrolled=false after each call — making the _userScrolled guard
    // unreliable. Remove it entirely; appendLog owns all scroll decisions.
    logBox.removeAllListeners('set content')

    // Copy-mode hint, overlaid on the right of the Logs top border.
    const logHint = blessed.box({
        parent: screen,
        top: TABS_H + TOP_H,
        right: 2,
        width: 18,
        height: 1,
        tags: true,
        style: { bg: T.bg },
    })

    // ── Shared full-content box for non-Console tabs ──
    const tabContent = blessed.box({
        parent: screen,
        label: ' Dashboard ',
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

    // ── Profiles tab widgets (interactive) ──
    const PROFILES_HEADER_H = 5
    const profilesAutoStart = blessed.box({
        parent: screen,
        label: ' Auto-Start (config.account.id) ',
        top: TABS_H, left: 0,
        width: '100%', height: PROFILES_HEADER_H,
        border: { type: 'line' },
        tags: true,
        style: { border: { fg: T.overlay }, label: { fg: T.subtext }, fg: T.text, bg: T.bg },
        hidden: true,
    })

    const profilesList = blessed.list({
        parent: screen,
        label: ' Profiles ',
        top: TABS_H + PROFILES_HEADER_H, left: 0,
        width: '100%',
        height: `100%-${TABS_H + PROFILES_HEADER_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true,
        style: {
            border: { fg: T.overlay },
            selected: { bg: T.surface },
            item: { fg: T.text },
            label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary }, selected: { bg: T.overlay } },
        },
        keys: true, vi: true, mouse: false, scrollable: true,
        hidden: true,
    })

    // ── Profiles tab — Connection sub-view (Tab to toggle) ──
    const profilesConnBox = blessed.box({
        parent: screen,
        label: ' Connection ',
        top: TABS_H, left: 0,
        width: '100%',
        height: `100%-${TABS_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true, scrollable: true, mouse: false, keys: false,
        style: {
            border: { fg: T.overlay }, label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary } },
            fg: T.text, bg: T.bg,
        },
        hidden: true,
    })

    // ── Helps tab — TOC (left) + Content (right) split ──
    const HELPS_TOC_W = 32
    const helpsTocList = blessed.list({
        parent: screen,
        label: ' Contents ',
        top: TABS_H, left: 0,
        width: HELPS_TOC_W,
        height: `100%-${TABS_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true,
        style: {
            border: { fg: T.overlay },
            selected: { bg: T.surface },
            item: { fg: T.text },
            label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary }, selected: { bg: T.overlay } },
        },
        // 不啟用 keys / mouse:此 list 完全用滑鼠滾輪 (見 screen.on('mouse')) 來移動選擇,
        // 配合 element 層 Tab/Enter 綁定。沒有方向鍵介入。
        keys: false, mouse: false, scrollable: true,
        hidden: true,
    })
    const helpsContentBox = blessed.box({
        parent: screen,
        label: ' Helps ',
        top: TABS_H, left: HELPS_TOC_W,
        width: `100%-${HELPS_TOC_W}`,
        height: `100%-${TABS_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        // wrap:false 讓每行內容只佔 1 個 visual line — 這樣 getScroll() 直接等於 source line,
        // TOC 對應內容 1:1,不會因 wrap 偏移 (長行右側被裁掉,但本頁 row() 排版本來就在 60 字內)
        tags: true, scrollable: true, mouse: false, keys: false, wrap: false,
        style: {
            border: { fg: T.overlay }, label: { fg: T.subtext },
            focus: { border: { fg: T.primary }, label: { fg: T.primary } },
            fg: T.text, bg: T.bg,
        },
        hidden: true,
    })

    // ── Settings tab — interactive (replaces the static tabContent for n=4) ──
    const settingsBox = blessed.box({
        parent: screen,
        label: ' Settings ',
        top: TABS_H, left: 0,
        width: '100%',
        height: `100%-${TABS_H + CMD_H + STATUS_H}`,
        border: { type: 'line' },
        tags: true, scrollable: true, mouse: false, keys: false,
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
        top: 0, left: 0, width: 0, height: 0,
    })

    // ── State ──
    const logEnabled = {}    // per-bot-name log filter (toggled by 'l')
    const debugEnabled = {}  // per-bot-name DEBUG visibility (toggled by 'd')
    let mode = 'normal'
    let cmdBuffer = ''
    let cmdCursorPos = 0   // cursor position within cmdBuffer (0 = start, cmdBuffer.length = end)
    let mouseOn = true       // can be toggled (m) so the user can copy text from the log
    let followBottom = true  // auto-scroll log to new entries only when user is already at bottom
    let unseen = 0           // lines arrived while not following bottom
    const cmdHistory = []   // newest-last
    let histIdx = -1        // -1 = not navigating (editing live buffer)
    let pendingBuffer = ''  // buffer saved when user starts walking history
    let currentTip = TIPS[Math.floor(Math.random() * TIPS.length)]

    // Wizard state — repurposes the command bar as a multi-step prompt.
    let wizardActive = false
    let wizardLabel = ''
    let wizardOnSubmit = null
    let wizardOnCancel = null

    // Settings tab + Profiles connection sub-view: per-list interactive state.
    const interactiveStates = {
        settings:     { selected: 0, editing: false, editBuffer: '' },
        profilesConn: { selected: 0, editing: false, editBuffer: '' },
    }
    let profilesView = 'profiles' // 'profiles' | 'connection'
    let helpsFocus = 'content' // 'content' | 'toc'
    // Console 分頁:↑/↓ 操作 Bots、滾輪捲動 Logs(焦點切換見 applyConsoleFocus)。

    // Global log overrides (Settings tab).
    let globalDebugAll = false
    let globalChatHide = false
    const botChatHidden = new Set()  // per-bot: 已關閉 chat 的 bot 集合

    // For Dashboard "Up" display. Prefer program start time passed from index.js.
    const tuiStartedAt = startedAt || Date.now()

    // Lines to write to stdout after normal buffer is restored on exit.
    let _pendingStdoutLines = []
    function setPendingOutput(line) { _pendingStdoutLines.push(String(line)) }

    // Transient status-bar flash (overrides tip for a few seconds).
    let flashMessage = null  // { text, fg }
    let flashTimer = null
    function notify(text, type = 'info', durationMs = 4000) {
        const fg = type === 'success' ? T.success
                 : type === 'error'   ? T.error
                 : type === 'warning' ? T.warning
                 :                      T.accent
        flashMessage = { text, fg }
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = setTimeout(() => {
            flashMessage = null; flashTimer = null
            try { renderStatusBar(); screen.render() } catch (_) {}
        }, durationMs)
        try { renderStatusBar(); screen.render() } catch (_) {}
    }

    function isLogEnabled(name) {
        if (logEnabled[name] === undefined) logEnabled[name] = true
        return logEnabled[name]
    }
    function isDebugVisible(name) {
        return !!debugEnabled[name]
    }

    // ── Smart append ──
    function appendLog(msg) {
        const lines = String(msg).split(/\r?\n/).filter(l => l.trim().length > 0)
        if (lines.length === 0) return

        const wasAtBottom = followBottom
        const savedScroll = logBox.getScroll()
        for (const line of lines) logBox.pushLine(line)

        // pushLine bypasses neo-blessed's Log.log() scrollback trim — enforce ourselves.
        // 注意:
        //   1) Element.prototype.shiftLine(n) 只吃單一參數,呼叫 shiftLine(0, trimmed) 會把 0 當 n,實際只刪 1 行。
        //   2) getScroll() 是「visual 行」索引,fake.length 是「source 行」數;wrap:true 下兩者不一致,
        //      必須改用 _clines.length(visual)差值來補償,否則長行被 trim 時 view 會逐步往底部漂。
        const cap = logBox.scrollback || 500
        const fake = logBox._clines && logBox._clines.fake
        let visualTrimmed = 0
        if (fake && fake.length > cap) {
            const sourceTrim = fake.length - cap
            const visualBefore = (logBox._clines && logBox._clines.length) || 0
            logBox.shiftLine(sourceTrim)
            const visualAfter = (logBox._clines && logBox._clines.length) || 0
            visualTrimmed = Math.max(0, visualBefore - visualAfter)
        }

        if (!wasAtBottom) {
            // 砍掉頂端 visualTrimmed 個 visual 行後,絕對 visual 索引整體往上移,要扣回去才會 pin 到原本同一行內容
            logBox.scrollTo(Math.max(0, savedScroll - visualTrimmed))
            unseen += lines.length
            updateLogLabel()
        } else {
            logBox.setScrollPerc(100)
        }
        screen.render()
    }
    function updateLogLabel() {
        if (followBottom) logBox.setLabel(' Logs ')
        else              logBox.setLabel(` Logs  {${T.warning}-fg}↑ ${unseen} new{/} `)
    }
    function updateLogHint() {
        logHint.setContent(mouseOn
            ? `{${T.muted}-fg}m: copy mode{/}`
            : `{${T.warning}-fg}m: resume mouse{/}`)
    }

    // ── Bot list render ──
    function formatBotItem(bot) {
        // L: log filter (runtime, 'l').  C: chat visible (runtime 't' overrides profile).  D: DEBUG visibility (runtime, 'd').
        const lIcon = isLogEnabled(bot.name)
            ? `{${T.success}-fg}L{/}`
            : `{${T.muted}-fg}L{/}`
        const cIcon = (bot.chat && !botChatHidden.has(bot))
            ? `{${T.success}-fg}C{/}`
            : `{${T.muted}-fg}C{/}`
        const dIcon = isDebugVisible(bot.name)
            ? `{${T.success}-fg}D{/}`
            : `{${T.muted}-fg}D{/}`
        const state = bot.childProcess
            ? `{${T.success}-fg}▶{/}`
            : `{${T.muted}-fg}◦{/}`
        const status = bot.status || '-'
        const sCol = statusColor(bot.status)
        return ` ${lIcon} ${cIcon} ${dIcon} ${state} ${bot.name.padEnd(10)} {${sCol}-fg}${String(status).padEnd(18)}{/}`
    }
    function updateBotList() {
        const prevSelected = botList.selected
        botList.setItems(botManager.bots.map(formatBotItem))
        if (botManager.bots.length === 0) return
        const currentIdx = botManager.currentBot
            ? botManager.bots.indexOf(botManager.currentBot)
            : -1
        if (currentIdx >= 0) {
            botList.select(currentIdx)
        } else {
            botList.select(Math.min(prevSelected, botManager.bots.length - 1))
        }
    }

    // ── Info panel (Infos) ──
    const infoCache = {}   // bot.name -> { data, receivedAt }


    // 離線 bot 的 task.json 快取。TTL=2s,但 mtime 變化立即失效 — 方便 .task remove 立即看到結果。
    const offlineTaskCache = {}   // botName -> { tasks, readAt, ok, err, mtimeMs }
    const OFFLINE_TASK_TTL_MS = 2000
    function readOfflineTasks(botName) {
        const taskPath = path.join(process.cwd(), 'config', botName, 'task.json')
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(taskPath).mtimeMs } catch (_) {}
        const cached = offlineTaskCache[botName]
        const now = Date.now()
        if (cached && (now - cached.readAt) < OFFLINE_TASK_TTL_MS && cached.mtimeMs === mtimeMs) {
            return cached
        }
        let entry
        if (mtimeMs === 0) {
            entry = { tasks: [], readAt: now, mtimeMs, ok: false, err: 'no_file' }
        } else {
            try {
                const data = JSON.parse(fs.readFileSync(taskPath, 'utf8'))
                entry = { tasks: Array.isArray(data.tasks) ? data.tasks : [], readAt: now, mtimeMs, ok: true }
            } catch (e) {
                entry = { tasks: [], readAt: now, mtimeMs, ok: false, err: e.message }
            }
        }
        offlineTaskCache[botName] = entry
        return entry
    }

    function renderInfos() {
        const sel = botManager.bots[botList.selected]
        if (!sel) {
            infoBox.setContent(`\n  {${T.muted}-fg}No bot selected.{/}`)
            return
        }
        // bot offline — show only name + status, do NOT surface stale cached data.
        if (!sel.childProcess) {
            const status = sel.status || 'offline'
            const sCol = statusColor(sel.status)
            const offline = readOfflineTasks(sel.name)
            const rows = [
                `  {${T.primary}-fg}{bold}${sel.name}{/bold}{/}  {${T.muted}-fg}(offline){/}`,
                `  {${T.subtext}-fg}Status{/} {${sCol}-fg}${status}{/}`,
                '',
            ]
            // 啟動提示 (.c 是 .create 的別名)
            rows.push(`  {${T.muted}-fg}— bot 未執行 —{/}`)
            rows.push(`  {${T.subtext}-fg}啟動{/} {${T.accent}-fg}.c{/} 或 {${T.accent}-fg}.create ${sel.name}{/}`)
            rows.push(`  {${T.subtext}-fg}重啟{/} {${T.accent}-fg}.reload{/}    {${T.subtext}-fg}終止重啟計時{/} {${T.accent}-fg}.exit{/}`)
            if (sel.reloadCancel && sel.reloadScheduledAt) {
                const cd = sel.reloadCD ?? 20_000
                const remainMs = Math.max(0, sel.reloadScheduledAt + cd - Date.now())
                rows.push(`  {${T.warning}-fg}自動重啟倒數: ${fmtEta(remainMs)}{/}`)
            }
            rows.push('')
            // 離線佇列 (從 config/<bot>/task.json 讀)
            if (!offline.ok && offline.err === 'no_file') {
                rows.push(`  {${T.subtext}-fg}Tasks{/} {${T.muted}-fg}- (尚無 task.json){/}`)
            } else if (!offline.ok) {
                rows.push(`  {${T.subtext}-fg}Tasks{/} {${T.error}-fg}讀取失敗: ${offline.err}{/}`)
            } else if (offline.tasks.length === 0) {
                rows.push(`  {${T.subtext}-fg}Tasks{/}  {${T.muted}-fg}- (空佇列){/}`)
            } else {
                rows.push(`  {${T.subtext}-fg}Tasks{/} {${T.muted}-fg}${offline.tasks.length} 個 (啟動後會自動執行){/}`)
                const innerH = (typeof infoBox.height === 'number' ? infoBox.height : TOP_H) - 2
                const budget = Math.max(1, innerH - rows.length)
                const items = offline.tasks.map((t, i) =>
                    `    {${T.muted}-fg}${String(i + 1).padStart(2)}.{/} {${T.text}-fg}${fmtTask(t)}{/}`
                )
                if (items.length <= budget) {
                    rows.push(...items)
                } else {
                    const shown = budget - 1
                    rows.push(...items.slice(0, shown))
                    rows.push(`    {${T.muted}-fg}... +${items.length - shown} more (用 .task list 看完整){/}`)
                }
            }
            infoBox.setContent(rows.join('\n'))
            return
        }
        const entry = infoCache[sel.name]
        const data  = (entry && entry.data) || {}
        const freshness = entry ? ageSec(entry.receivedAt) : null
        const freshText = freshness == null
            ? `{${T.muted}-fg}(awaiting){/}`
            : `{${T.muted}-fg}${freshness}s ago{/}`

        const pingTxt = isMissing(data.ping) ? '-' : data.ping + 'ms'
        const rows = [
            `  {${T.primary}-fg}{bold}${sel.name}{/bold}{/}  ${freshText}`,
            `  {${T.subtext}-fg}Pos{/} ${fmtPos(data.position)}`,
            `  {${T.subtext}-fg}Server{/} ${val(data.server)}   {${T.subtext}-fg}Ping{/} ${pingTxt}`,
            `  {${T.subtext}-fg}Balance{/} ${val(data.balance)}   {${T.subtext}-fg}Coin{/} ${val(data.coin)}`,
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

    function renderDetail() {
        const sel = botManager.bots[botList.selected]
        if (!sel) {
            detailBox.setContent(`\n  {${T.muted}-fg}-{/}`)
            return
        }
        if (!sel.childProcess) {
            const offline = readOfflineTasks(sel.name)
            const lines = []
            if (!offline.ok && offline.err === 'no_file') {
                lines.push(`  {${T.muted}-fg}尚無 task.json{/}`)
            } else if (!offline.ok) {
                lines.push(`  {${T.error}-fg}讀取 task.json 失敗: ${offline.err}{/}`)
            } else if (offline.tasks.length === 0) {
                lines.push(`  {${T.muted}-fg}佇列為空{/}`)
            } else {
                lines.push(`  {${T.subtext}-fg}佇列{/} ${offline.tasks.length} 筆 {${T.muted}-fg}(啟動後會自動執行){/}`)
                lines.push('')
                offline.tasks.forEach((t, i) => {
                    const idx   = String(i + 1).padStart(2)
                    const prio  = (typeof t.priority === 'number') ? `P${t.priority}` : 'P-'
                    const src   = t.source || '-'
                    const name  = fmtTask(t)
                    const argsArr = Array.isArray(t.content) ? t.content : []
                    const argsStr = argsArr.length > 1 ? argsArr.slice(1).join(' ') : ''
                    const ts    = (typeof t.timestamp === 'number')
                        ? new Date(t.timestamp).toISOString().slice(5, 19).replace('T', ' ')
                        : null
                    const head = `  {${T.muted}-fg}${idx}.{/} {${T.accent}-fg}[${prio}]{/} {${T.text}-fg}${name}{/} {${T.muted}-fg}<- ${src}${ts ? ` @ ${ts}` : ''}{/}`
                    lines.push(head)
                    if (argsStr) lines.push(`       {${T.muted}-fg}args: ${argsStr}{/}`)
                })
            }
            detailBox.setContent(lines.join('\n'))
            return
        }
        if (sel.msaAuth) {
            const auth = sel.msaAuth
            const remaining = Math.max(0, Math.floor((auth.receivedAt + auth.expiresIn * 1000 - Date.now()) / 1000))
            detailBox.setContent([
                ``,
                `  {${T.error}-fg}⚠  需要 Microsoft 授權{/}`,
                ``,
                `  {${T.subtext}-fg}前往:{/}  {${T.accent}-fg}${auth.verificationUri}{/}`,
                `  {${T.subtext}-fg}代碼:{/}  {${T.warning}-fg}{bold}${auth.userCode}{/bold}{/}`,
                ``,
                `  {${T.accent}-fg}http://microsoft.com/link?otc=${auth.userCode}{/}`,
                ``,
                remaining > 0
                    ? `  {${T.muted}-fg}剩餘 ${remaining} 秒{/}`
                    : `  {${T.error}-fg}代碼已過期，請重啟 bot{/}`,
            ].join('\n'))
            return
        }
        const entry = infoCache[sel.name]
        const data  = (entry && entry.data) || {}
        const running = data.runingTask && typeof data.runingTask === 'object' ? data.runingTask : null
        const detail = running ? running.detail : null
        if (!detail || typeof detail !== 'object' || !detail.type) {
            detailBox.setContent(`\n  {${T.muted}-fg}No active task detail.{/}`)
            return
        }
        let content
        switch (detail.type) {
            case 'autoquest':  content = renderAutoQuestDetail(detail); break
            case 'cleararea':  content = renderClearAreaDetail(detail); break
            case 'villager':   content = renderVillagerDetail(detail); break
            case 'warehouse':  content = renderWarehouseDetail(detail); break
            case 'litematic':
            case 'mapart':     content = renderBuildLikeDetail(detail); break
            default:
                content = `\n  {${T.muted}-fg}Unknown detail type: ${detail.type}{/}`
        }
        // 第一行統一顯示「來源 + 運行時間」:
        //  - WMS 分工單元(detail 帶 source):兩段式 [WMS整體運行]WMS <mode> [本單元運行]<op>,取代標題行。
        //  - 其餘所有型別:在既有標題行(已含模組名=來源)前面加上 [運行時間],時間取任務開工 startedAt。
        const lines = content.split('\n')
        if (detail.source) {
            lines[0] = fmtWmsSourceLine(detail)
            content = lines.join('\n')
        } else if (running && running.startedAt && lines[0] && lines[0].trim()) {
            lines[0] = `  {${T.accent}-fg}[${fmtEta(Date.now() - running.startedAt)}]{/} ` + lines[0].replace(/^\s+/, '')
            content = lines.join('\n')
        }
        detailBox.setContent(content)
    }

    // Cache incoming `data` events from botmanager (child -> parent via IPC: 'dataToParent').
    const onBotData = (data, name) => {
        if (!name) return
        infoCache[name] = { data, receivedAt: Date.now() }
        if (activeTab === 1) {
            const sel = botManager.bots[botList.selected]
            if (sel && sel.name === name) { renderInfos(); renderDetail() }
            screen.render()
        }
    }
    try { botManager.handle.on('data', onBotData) } catch (_) {}

    // Periodic pull: ask each live child for fresh data. 同時觸發 redraw 讓離線 bot 的
    // task.json 變動 (來自 .task remove 或外部編輯) 也能在 ~3s 內反映出來。
    const TRAFFIC_SPARK_LEN = 40           // 約 40 × 3s ≈ 2 分鐘的即時頻寬走勢
    const trafficSpark = []                // 每筆 = 當下所有 bot 的 Σ即時速率 (rx+tx) bytes/s
    const infoPollTimer = setInterval(() => {
        for (const b of botManager.bots) {
            if (b.childProcess) {
                try { b.childProcess.send({ type: 'dataRequire' }) } catch (_) {}
            }
        }
        // 取樣聚合即時頻寬(離線 bot 速率為 0),推進 sparkline ring buffer
        let agg = 0
        for (const b of botManager.bots) {
            if (!b.childProcess) continue
            const r = b.trafficRate || { rx: 0, tx: 0 }
            agg += (r.rx || 0) + (r.tx || 0)
        }
        trafficSpark.push(agg)
        if (trafficSpark.length > TRAFFIC_SPARK_LEN) trafficSpark.shift()
        if (activeTab === 0) { tabContent.setContent(dashboardContent()); screen.render() }
        if (activeTab === 1) {
            const sel = botManager.bots[botList.selected]
            if (sel && !sel.childProcess) { renderInfos(); renderDetail(); screen.render() }
        }
    }, 3000)

    // 高頻 detail 刷新:只對「Console 分頁 + 當前選取 + 在線」的單一 bot 送 dataRequire,
    // 讓右上角 detail 接近即時。離線 bot 的 task.json 已由上方 3s poll 處理,這裡略過。
    // 收到回傳後由 onBotData 觸發 renderInfos/renderDetail,故此處不需自行 render。
    const detailPollTimer = setInterval(() => {
        if (activeTab !== 1) return
        const sel = botManager.bots[botList.selected]
        if (sel && sel.childProcess) {
            try { sel.childProcess.send({ type: 'dataRequire' }) } catch (_) {}
        }
    }, 500)

    // ── Tab content generators ──
    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '-'
        if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + ' GB'
        if (n >= 1024 * 1024)        return (n / 1048576).toFixed(1)    + ' MB'
        if (n >= 1024)               return (n / 1024).toFixed(0)       + ' KB'
        return n + ' B'
    }
    function fmtUptime(ms) {
        if (!Number.isFinite(ms) || ms < 0) return '-'
        const s = Math.floor(ms / 1000)
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
        const m = Math.floor((s % 3600) / 60), ss = s % 60
        if (d > 0) return `${d}d${h}h${m}m`
        if (h > 0) return `${h}h${m}m`
        if (m > 0) return `${m}m${ss}s`
        return `${ss}s`
    }
    const SPARK_CHARS = '▁▂▃▄▅▆▇█'
    function sparkline(arr) {
        if (!arr || arr.length === 0) return ''
        const max = Math.max(...arr, 1)
        return arr.map(v => SPARK_CHARS[Math.min(SPARK_CHARS.length - 1, Math.floor((v / max) * (SPARK_CHARS.length - 1)))]).join('')
    }
    function dashboardContent() {
        const bots = botManager.bots || []
        const parentMem = process.memoryUsage()
        const ds = discordbot.getStatus()
        const ip = botManager._bestIP
        const ipLine = ip
            ? `{${T.success}-fg}${ip}{/}`
            : ((config.setting && config.setting.selectBestIP) ? `{${T.muted}-fg}(偵測中){/}` : `{${T.muted}-fg}(disabled){/}`)
        const dcLine = !ds.activated ? `{${T.muted}-fg}disabled{/}`
            : ds.ready ? `{${T.success}-fg}${ds.tag || 'ready'}{/}  {${T.muted}-fg}ping ${ds.ping == null ? '?' : ds.ping + 'ms'}{/}`
            : `{${T.warning}-fg}connecting...{/}`
        const header = [
            '',
            `  {${T.primary}-fg}{bold}Dashboard{/bold}{/}  {${T.muted}-fg}v${pkg.version}  (${bots.length} bot${bots.length === 1 ? '' : 's'}){/}`,
            '',
            `  {${T.subtext}-fg}Parent{/}  PID ${process.pid}   RSS ${fmtBytes(parentMem.rss)}   Heap ${fmtBytes(parentMem.heapUsed)} / ${fmtBytes(parentMem.heapTotal)}   {${T.subtext}-fg}Up{/} ${fmtUptime(Date.now() - tuiStartedAt)}`,
            `  {${T.subtext}-fg}Best IP{/}  ${ipLine}   {${T.subtext}-fg}Discord{/}  ${dcLine}`,
            '',
            `  {${T.surface}-bg}{${T.subtext}-fg} ${'Bot'.padEnd(14)} ${'PID'.padEnd(8)} ${'RSS'.padEnd(10)} ${'Heap Used'.padEnd(11)} ${'Heap Total'.padEnd(11)} ${'External'.padEnd(9)} Status {/}`,
        ]
        if (bots.length === 0) {
            header.push(`  {${T.muted}-fg}  no bots registered{/}`)
            return header.join('\n')
        }
        let online = 0, sumRss = 0, sumUsed = 0, sumTot = 0, sumExt = 0
        for (const b of bots) {
            const pid = (b.childProcess && b.childProcess.pid) || '-'
            // Gate memory snapshot on a live child — old cached numbers shouldn't show after exit.
            const mem = b.childProcess
                ? ((infoCache[b.name] && infoCache[b.name].data && infoCache[b.name].data.memory) || null)
                : null
            const rss  = mem ? fmtBytes(mem.rss)        : '-'
            const used = mem ? fmtBytes(mem.heapUsed)   : '-'
            const tot  = mem ? fmtBytes(mem.heapTotal)  : '-'
            const ext  = mem ? fmtBytes(mem.external)   : '-'
            if (b.childProcess) online++
            if (mem) { sumRss += mem.rss; sumUsed += mem.heapUsed; sumTot += mem.heapTotal; sumExt += mem.external }
            const sCol = statusColor(b.status)
            const status = b.status || '-'
            // 重啟倒數:離線且已排定重連的 bot 顯示 restart in Ns
            let statusSeg = `{${sCol}-fg}${status}{/}`
            if (!b.childProcess && b.reloadScheduledAt && b.reloadCD) {
                const remain = b.reloadScheduledAt + b.reloadCD - Date.now()
                if (remain > 0) statusSeg += ` {${T.muted}-fg}(restart in ${Math.ceil(remain / 1000)}s){/}`
            }
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
                statusSeg
            )
        }
        // 記憶體合計列
        header.push(
            `  {${T.subtext}-fg}${'Σ'.padEnd(14)}{/} ` +
            `{${T.muted}-fg}${(online + '/' + bots.length).padEnd(8)}{/} ` +
            `{${T.accent}-fg}${fmtBytes(sumRss).padEnd(10)}{/} ` +
            `{${T.accent}-fg}${fmtBytes(sumUsed).padEnd(11)}{/} ` +
            `{${T.muted}-fg}${fmtBytes(sumTot).padEnd(11)}{/} ` +
            `{${T.muted}-fg}${fmtBytes(sumExt).padEnd(9)}{/} ` +
            `{${T.subtext}-fg}online{/}`
        )

        // ── 網路流量區(獨立於記憶體表下方):即時速率 vs 歷史累計 ──
        const fmtRate = n => fmtBytes(Math.round(n)) + '/s'
        header.push('')
        header.push(`  {${T.primary}-fg}{bold}Network Traffic{/bold}{/}  {${T.muted}-fg}(Live=即時速率 · Total=歷史累計;↓下行 ↑上行){/}`)
        header.push(`  {${T.surface}-bg}{${T.subtext}-fg} ${'Bot'.padEnd(14)} ${'Live ↓'.padEnd(12)} ${'Live ↑'.padEnd(12)} ${'Total ↓'.padEnd(11)} ${'Total ↑'.padEnd(11)} ${'Total'.padEnd(11)} {/}`)
        let liveRxSum = 0, liveTxSum = 0, totRxSum = 0, totTxSum = 0
        for (const b of bots) {
            const tc = b.trafficCommitted || { rx: 0, tx: 0 }
            const ts = b.trafficSession   || { rx: 0, tx: 0 }
            const rate = b.trafficRate    || { rx: 0, tx: 0 }
            const rxT = (tc.rx || 0) + (ts.rx || 0), txT = (tc.tx || 0) + (ts.tx || 0)
            totRxSum += rxT; totTxSum += txT
            // 即時速率只有在線時有意義;離線顯示 '-'。歷史累計永遠顯示。
            const liveRx = b.childProcess ? fmtRate(rate.rx) : '-'
            const liveTx = b.childProcess ? fmtRate(rate.tx) : '-'
            if (b.childProcess) { liveRxSum += (rate.rx || 0); liveTxSum += (rate.tx || 0) }
            header.push(
                `  {${T.text}-fg}${b.name.padEnd(14)}{/} ` +
                `{${T.success}-fg}${liveRx.padEnd(12)}{/} ` +
                `{${T.warning}-fg}${liveTx.padEnd(12)}{/} ` +
                `{${T.accent}-fg}${fmtBytes(rxT).padEnd(11)}{/} ` +
                `{${T.accent}-fg}${fmtBytes(txT).padEnd(11)}{/} ` +
                `{${T.secondary}-fg}${fmtBytes(rxT + txT).padEnd(11)}{/}`
            )
        }
        // 流量合計列
        header.push(
            `  {${T.subtext}-fg}${'Σ'.padEnd(14)}{/} ` +
            `{${T.success}-fg}${fmtRate(liveRxSum).padEnd(12)}{/} ` +
            `{${T.warning}-fg}${fmtRate(liveTxSum).padEnd(12)}{/} ` +
            `{${T.accent}-fg}${fmtBytes(totRxSum).padEnd(11)}{/} ` +
            `{${T.accent}-fg}${fmtBytes(totTxSum).padEnd(11)}{/} ` +
            `{${T.secondary}-fg}${fmtBytes(totRxSum + totTxSum).padEnd(11)}{/}`
        )
        // 聚合即時頻寬走勢 sparkline(最近約 2 分鐘)
        if (trafficSpark.length > 0) {
            const cur  = trafficSpark[trafficSpark.length - 1]
            const peak = Math.max(...trafficSpark)
            header.push('')
            header.push(`  {${T.subtext}-fg}Throughput{/}  {${T.primary}-fg}${sparkline(trafficSpark)}{/}  {${T.muted}-fg}now ${fmtRate(cur)} · peak ${fmtRate(peak)}{/}`)
        }
        return header.join('\n')
    }

    let helpsTocs = []  // [{ level, label, lineNo }]
    function renderHelps() {
        const { lines, tocs } = buildHelps()
        helpsTocs = tocs
        helpsContentBox.setContent(lines.join('\n'))
        helpsTocList.setItems(tocs.map(helpsTocItem))
        helpsContentBox.setLabel(` Helps  {${T.muted}-fg}滾輪滾動內容  Tab 切換到目錄{/} `)
        helpsTocList.setLabel(` Contents (${tocs.length})  {${T.muted}-fg}↑↓/Enter{/} `)
        updateHelpsTocSelection()
    }
    // wrap:false on helpsContentBox means source line == visual line, so getScroll() is
    // directly the source-line index of the top row.
    function updateHelpsTocSelection() {
        const top = helpsContentBox.getScroll() || 0
        let idx = 0
        for (let i = 0; i < helpsTocs.length; i++) {
            if (helpsTocs[i].lineNo <= top) idx = i
            else break
        }
        helpsTocList.select(idx)
    }
    function helpsScroll(delta) {
        helpsContentBox.scroll(delta)
        updateHelpsTocSelection()
        screen.render()
    }
    function helpsJumpTo(srcLineNo) {
        helpsContentBox.scrollTo(srcLineNo)
        updateHelpsTocSelection()
        screen.render()
    }
    // Tab toggles focus between content and TOC.
    // helpsTocList has keys:false so blessed's auto Enter→'select' is off; we wire Enter ourselves.
    helpsContentBox.key(['tab'], () => { helpsFocus = 'toc';     helpsTocList.focus();    screen.render() })
    helpsTocList.key(['tab'],    () => { helpsFocus = 'content'; helpsContentBox.focus(); screen.render() })
    helpsTocList.key(['enter', 'return'], () => {
        const idx = helpsTocList.selected
        const t = helpsTocs[idx]
        if (t) helpsJumpTo(t.lineNo)
    })
    // Helper used by mouse-wheel routing on the TOC list — moves selection ±1 and immediately
    // scrolls the content pane to the new section.
    function helpsTocStep(dir) {
        if (!helpsTocs.length) return
        const cur = helpsTocList.selected || 0
        const next = Math.max(0, Math.min(helpsTocs.length - 1, cur + dir))
        if (next === cur) return
        helpsTocList.select(next)
        const t = helpsTocs[next]
        if (t) helpsContentBox.scrollTo(t.lineNo)
        screen.render()
    }

    function showTab(n) {
        // Avoid letting hide() rewind focus history to empty. If the history is
        // empty, neo-blessed may auto-focus label/list child boxes while their
        // constructor has not initialized position yet.
        focusSink.focus()
        const isConsole  = n === 1
        const isProfiles = n === 2
        const isHelps    = n === 3
        const isSettings = n === 4
        const isOther    = !isConsole && !isProfiles && !isHelps && !isSettings
        const toggle = (w, show) => show ? w.show() : w.hide()
        toggle(botList,          isConsole)
        toggle(botListHint,      isConsole)
        toggle(infoBox,          isConsole)
        toggle(detailBox,        isConsole)
        toggle(logBox,           isConsole)
        toggle(logHint,          isConsole)
        toggle(profilesAutoStart, isProfiles && profilesView === 'profiles')
        toggle(profilesList,      isProfiles && profilesView === 'profiles')
        toggle(profilesConnBox,   isProfiles && profilesView === 'connection')
        toggle(helpsTocList,      isHelps)
        toggle(helpsContentBox,   isHelps)
        toggle(settingsBox,       isSettings)
        toggle(tabContent,        isOther)

        if (isConsole) {
            applyConsoleFocus()
            renderInfos()
            renderDetail()
        } else if (isProfiles) {
            if (profilesView === 'profiles') {
                renderProfilesAutoStart()
                renderProfilesList()
                profilesList.focus()
            } else {
                renderProfilesConn()
                profilesConnBox.focus()
            }
        } else if (isHelps) {
            renderHelps()
            if (helpsFocus === 'toc') helpsTocList.focus()
            else helpsContentBox.focus()
        } else if (isSettings) {
            renderSettings()
            settingsBox.focus()
        } else {
            const gen = [dashboardContent, null, null, null, null][n]
            tabContent.setLabel(` ${TAB_NAMES[n]} `)
            if (gen) tabContent.setContent(gen())
            tabContent.focus()
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
            if (wizardActive) {
                commandBar.setLabel(` ${wizardLabel} `)
                commandBar.setContent(' ' + cmdBuffer)
            } else {
                commandBar.setLabel(' Command ')
                commandBar.setContent(isEmpty ? CMD_PLACEHOLDER_CMD : ' ' + cmdBuffer)
            }
            screen.program.showCursor()
        } else {
            commandBar.setLabel(' Command ')
            commandBar.style.border.fg = T.overlay
            commandBar.style.label.fg  = T.subtext
            commandBar.setContent(CMD_PLACEHOLDER_NORMAL)
            screen.program.hideCursor()
        }
    }

    function positionCursor() {
        if (mode !== 'command') return
        const left = commandBar.aleft + 1 + 1 + cmdCursorPos
        const top  = commandBar.atop  + 1
        if (!Number.isFinite(top) || !Number.isFinite(left)) return
        screen.program.cup(top, left)
    }

    function renderStatusBar() {
        const seg = (bg, fg, text) => `{${bg}-bg}{${fg}-fg}${text}{/}`
        let tipText, tipFg
        if (flashMessage) {
            tipText = flashMessage.text
            tipFg = flashMessage.fg
        } else if (mode === 'command') {
            tipText = 'Enter submit  -  ↑/↓ history  -  Esc cancel'; tipFg = T.muted
        } else {
            tipText = `tip: ${currentTip}`; tipFg = T.muted
        }
        const tipSeg  = seg(T.bg, tipFg, ` ${tipText} `)
        const exitSeg = seg(T.overlay, T.subtext, ` Ctrl-C: quit `)
        const tail    = seg(T.surface, T.subtext, ` ONE-FOR-ALL v${pkg.version} By JKLove `)
        const ofaSeg = seg(T.primary, T.bg, ' OFA ')
        statusBar.setContent(ofaSeg + tipSeg + `{|}` + exitSeg + tail)
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
        cmdBuffer = ''; cmdCursorPos = 0
        if (activeTab === 1) applyConsoleFocus()
        else if (activeTab === 2) {
            if (profilesView === 'connection') profilesConnBox.focus()
            else                                profilesList.focus()
        }
        else if (activeTab === 3) {
            if (helpsFocus === 'toc') helpsTocList.focus()
            else                       helpsContentBox.focus()
        }
        else if (activeTab === 4) settingsBox.focus()
        else tabContent.focus()
        redraw()
    }

    function setCommandMode() {
        mode = 'command'
        cmdBuffer = ''; cmdCursorPos = 0
        focusSink.focus()
        redraw()
    }

    // ── Profiles tab: rendering, persistence, and edit wizards ──
    function getAutoStartIds() {
        return (config.account && Array.isArray(config.account.id)) ? config.account.id : []
    }
    function renderProfilesAutoStart() {
        const ids = getAutoStartIds()
        const intro = `  {${T.subtext}-fg}啟動順序{/}  {${T.muted}-fg}(${ids.length} 個 — 下次開啟會載入){/}`
        const order = ids.length === 0
            ? `  {${T.muted}-fg}(空){/}`
            : '  ' + ids.map((id, i) => `{${T.muted}-fg}${i + 1}.{/}{${T.success}-fg}${id}{/}`).join('   ')
        const hint = `  {${T.muted}-fg}s: 切換選取 profile 的啟動狀態  (寫入 config.toml){/}`
        profilesAutoStart.setContent([intro, order, hint].join('\n'))
    }
    function renderProfilesList() {
        const profiles = botManager.profiles || {}
        const keys = Object.keys(profiles)
        const ids = getAutoStartIds()
        const items = keys.map((name) => {
            const p = profiles[name] || {}
            const isAuto = ids.includes(name)
            const star  = isAuto ? `{${T.warning}-fg}★{/}` : ' '
            const order = isAuto ? `{${T.muted}-fg}${String(ids.indexOf(name) + 1).padStart(2)}{/}` : '  '
            const typ  = String(p.type || '-').padEnd(8)
            const user = String(p.username || '-').padEnd(18)
            const host = String(p.host || '-').padEnd(28)
            const port = String(p.port || '-').padEnd(6)
            const flags = (p.debug ? `{${T.warning}-fg}D{/}` : `{${T.muted}-fg}-{/}`)
                        + (p.chat  ? `{${T.success}-fg}C{/}` : `{${T.muted}-fg}-{/}`)
            return ` ${star} ${order} {${T.text}-fg}${name.padEnd(14)}{/} `
                 + `{${T.accent}-fg}${typ}{/} {${T.subtext}-fg}${user}{/} `
                 + `{${T.subtext}-fg}${host}{/} {${T.subtext}-fg}${port}{/} ${flags}`
        })
        if (items.length === 0) {
            profilesList.setItems([` {${T.muted}-fg}(no profiles — press 'a' to add){/}`])
        } else {
            profilesList.setItems(items)
        }
        profilesList.setLabel(` Profiles  {${T.muted}-fg}a:add  e:edit  d:del  J/K:reorder  s:auto-start  ★=auto-start{/} `)
    }

    function saveProfilesToDisk() {
        try {
            fs.writeFileSync(profilesPath, JSON.stringify(botManager.profiles, null, 2) + '\n', 'utf8')
            appendLog(`{${T.muted}-fg}[Profiles] Saved to profiles.json{/}`)
            notify('✓ 已儲存 profiles.json', 'success')
        } catch (err) {
            appendLog(`{${T.error}-fg}[Profiles] Save failed: ${err.message}{/}`)
            notify(`✗ 儲存 profiles.json 失敗: ${err.message}`, 'error')
        }
    }

    // Format any JS value into its TOML literal form.
    function formatTomlValue(value) {
        if (Array.isArray(value)) return '[' + value.map(formatTomlValue).join(',') + ']'
        if (typeof value === 'string')  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
        if (typeof value === 'boolean') return value ? 'true' : 'false'
        if (typeof value === 'number')  return Number.isFinite(value) ? String(value) : '0'
        if (value == null)              return '""'
        return JSON.stringify(value)
    }

    // Surgically replace the value of [section].key in config.toml, preserving comments,
    // indentation, and the trailing inline comment on that line. Falls back to inserting
    // a new line under [section] (or creating the section) when the key isn't found.
    function saveTomlValue(section, key, value) {
        const formatted = formatTomlValue(value)
        try {
            const text = fs.readFileSync(configPath, 'utf8')
            const lines = text.split(/\r?\n/)
            const sectionRe = new RegExp(`^\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*(?:#.*)?$`)
            const keyEsc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const keyRe = new RegExp(`^(\\s*${keyEsc}\\s*=\\s*)(\\[[^\\]]*\\]|"[^"]*"|true|false|-?\\d+(?:\\.\\d+)?)(.*)$`)
            let inSection = false
            let replaced = false
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim()
                if (/^\[/.test(trimmed)) { inSection = sectionRe.test(trimmed); continue }
                if (!inSection) continue
                if (trimmed.startsWith('#')) continue
                const m = lines[i].match(keyRe)
                if (m) { lines[i] = m[1] + formatted + m[3]; replaced = true; break }
            }
            if (!replaced) {
                const idx = lines.findIndex((l) => sectionRe.test(l.trim()))
                if (idx >= 0) lines.splice(idx + 1, 0, `  ${key} = ${formatted}`)
                else { lines.push(`[${section}]`); lines.push(`  ${key} = ${formatted}`) }
            }
            fs.writeFileSync(configPath, lines.join('\n'), 'utf8')
            const sec = config[section] = config[section] || {}
            sec[key] = Array.isArray(value) ? value.slice() : value
            appendLog(`{${T.muted}-fg}[Config] [${section}].${key} saved{/}`)
            notify(`✓ config.toml: [${section}].${key} 已寫入`, 'success')
            return true
        } catch (err) {
            appendLog(`{${T.error}-fg}[Config] save [${section}].${key} failed: ${err.message}{/}`)
            notify(`✗ 寫入 config.toml 失敗: ${err.message}`, 'error')
            return false
        }
    }
    function toggleAutoStart() {
        const name = getSelectedProfileName()
        if (!name) return
        const ids = getAutoStartIds().slice()
        const i = ids.indexOf(name)
        if (i >= 0) ids.splice(i, 1)
        else ids.push(name)
        saveTomlValue('account', 'id', ids)
        renderProfilesAutoStart()
        renderProfilesList()
        redraw()
    }

    // ── Interactive multi-section panel (Settings tab + Profiles connection sub-view) ──
    // Row types:
    //   { type: 'header',    label }
    //   { type: 'spacer' }
    //   { type: 'toggle',    label, get, set }
    //   { type: 'text',      label, get, set, mask?: bool }
    //   { type: 'display',   label, get }
    //   { type: 'action',    label, run, hint? }
    //   { type: 'list-item', label, value, listKey, index, onDelete, onMoveUp?, onMoveDown? }
    //   { type: 'list-add',  label?, listKey, onAdd }
    function isSelectableRow(r) { return r && r.type !== 'header' && r.type !== 'spacer' }
    function maskString(s, keep = 4) {
        s = String(s || '')
        if (s.length <= keep) return s
        return '*'.repeat(Math.max(0, s.length - keep)) + s.slice(-keep)
    }
    function formatPanelRow(row, isSel, editing, buf) {
        if (row.type === 'header') return `  {${T.primary}-fg}{bold}▎${row.label}{/bold}{/}`
        if (row.type === 'spacer') return ''
        const marker = isSel ? `{${T.primary}-fg}▶{/}` : ' '
        const cursor = editing ? `{${T.warning}-fg}_{/}` : ''
        const labelW = 22
        const labelStr = row.label ? `{${T.subtext}-fg}${row.label.padEnd(labelW)}{/}` : ''.padEnd(labelW + 1)
        const hint = row.hint ? `   {${T.muted}-fg}${row.hint}{/}` : ''
        let val = ''
        switch (row.type) {
            case 'toggle':
                val = row.get() ? `{${T.success}-fg}[✓]{/}` : `{${T.muted}-fg}[ ]{/}`
                break
            case 'text': {
                let v = String(row.get() == null ? '' : row.get())
                if (row.mask) v = maskString(v)
                val = editing
                    ? `{${T.warning}-fg}${buf}${cursor}{/}`
                    : `{${T.subtext}-fg}${v || '-'}{/}`
                break
            }
            case 'display':
                val = String(row.get() == null ? '-' : row.get())
                break
            case 'action':
                val = `{${T.accent}-fg}[Enter]{/}`
                break
            case 'list-item':
                val = `{${T.text}-fg}${(row.index + 1).toString().padStart(2)}.{/} {${T.subtext}-fg}${row.value}{/}`
                if (!isSel) break
                val += `   {${T.muted}-fg}d:刪${row.onMoveUp || row.onMoveDown ? '  J/K:序' : ''}{/}`
                break
            case 'list-add':
                val = editing
                    ? `{${T.warning}-fg}${buf}${cursor}{/}`
                    : `{${T.muted}-fg}+ a 加入新項目${isSel ? ' (Enter 也可)' : ''}{/}`
                break
        }
        if (row.type === 'list-item' || row.type === 'list-add') {
            return ` ${marker}      ${val}${hint}`
        }
        return ` ${marker}  ${labelStr}  ${val}${hint}`
    }
    function panelMoveSel(state, rows, delta) {
        if (!rows.length) { state.selected = 0; return }
        const idxs = rows.map((r, i) => isSelectableRow(r) ? i : -1).filter((i) => i >= 0)
        if (!idxs.length) { state.selected = 0; return }
        let cur = idxs.indexOf(state.selected)
        if (cur === -1) { state.selected = idxs[0]; return }
        cur = Math.max(0, Math.min(idxs.length - 1, cur + delta))
        state.selected = idxs[cur]
    }
    function panelClampSel(state, rows) {
        if (!rows.length) { state.selected = 0; return }
        if (!isSelectableRow(rows[state.selected])) {
            const first = rows.findIndex(isSelectableRow)
            state.selected = first >= 0 ? first : 0
        }
    }
    function panelRender(box, state, rows) {
        panelClampSel(state, rows)
        const lines = rows.map((r, i) =>
            formatPanelRow(r, i === state.selected, state.editing && i === state.selected, state.editBuffer)
        )
        box.setContent(lines.join('\n'))
        const innerH = (typeof box.height === 'number' ? box.height : 20) - 2
        const top = box.getScroll()
        if (state.selected < top) box.scrollTo(state.selected)
        else if (state.selected >= top + innerH) box.scrollTo(state.selected - innerH + 1)
    }
    // Returns true if the key was handled.
    function panelHandleKey(box, state, getRows, ch, key, onAfter) {
        if (!key) return false
        const rows = getRows()
        if (state.editing) {
            if (key.name === 'enter' || key.name === 'return') {
                const value = state.editBuffer
                state.editing = false
                state.editBuffer = ''
                const row = rows[state.selected]
                try {
                    if (row && row.type === 'text' && row.set) row.set(value.trim())
                    else if (row && row.type === 'list-add' && row.onAdd) row.onAdd(value.trim())
                } catch (e) { appendLog(`{${T.error}-fg}[Panel] commit failed: ${e.message}{/}`) }
                if (onAfter) onAfter()
                panelRender(box, state, getRows())
                return true
            }
            if (key.name === 'escape') {
                state.editing = false; state.editBuffer = ''
                panelRender(box, state, rows); return true
            }
            if (key.name === 'backspace') {
                state.editBuffer = state.editBuffer.slice(0, -1)
                panelRender(box, state, rows); return true
            }
            if (ch && ch.length === 1 && !key.ctrl && !key.meta && ch >= ' ') {
                state.editBuffer += ch
                panelRender(box, state, rows); return true
            }
            return true // swallow everything else while editing
        }
        if (key.name === 'up')       { panelMoveSel(state, rows, -1); panelRender(box, state, rows); return true }
        if (key.name === 'down')     { panelMoveSel(state, rows,  1); panelRender(box, state, rows); return true }
        if (key.name === 'pageup')   { panelMoveSel(state, rows, -5); panelRender(box, state, rows); return true }
        if (key.name === 'pagedown') { panelMoveSel(state, rows,  5); panelRender(box, state, rows); return true }
        if (key.name === 'home')     { const first = rows.findIndex(isSelectableRow); if (first >= 0) state.selected = first; panelRender(box, state, rows); return true }
        if (key.name === 'end')      { for (let i = rows.length - 1; i >= 0; i--) if (isSelectableRow(rows[i])) { state.selected = i; break } panelRender(box, state, rows); return true }
        const row = rows[state.selected]
        if (!row) return false
        if (key.name === 'enter' || key.name === 'return') {
            if (row.type === 'action') {
                const now = Date.now()
                if (now - (panelHandleKey._lastAction || 0) < 600) return true
                panelHandleKey._lastAction = now
                try { Promise.resolve(row.run && row.run()).catch((e) => appendLog(`{${T.error}-fg}[Panel] action failed: ${e.message}{/}`)) }
                catch (e) { appendLog(`{${T.error}-fg}[Panel] action failed: ${e.message}{/}`) }
                return true
            }
            if (row.type === 'toggle') { row.set && row.set(!row.get()); if (onAfter) onAfter(); panelRender(box, state, getRows()); return true }
            if (row.type === 'text')   { state.editing = true; state.editBuffer = String(row.get() == null ? '' : row.get()); panelRender(box, state, rows); return true }
            if (row.type === 'list-add') { state.editing = true; state.editBuffer = ''; panelRender(box, state, rows); return true }
            return true
        }
        if (ch === 'e' && row.type === 'text') {
            state.editing = true; state.editBuffer = String(row.get() == null ? '' : row.get()); panelRender(box, state, rows); return true
        }
        if ((ch === 's' || ch === ' ') && row.type === 'toggle') {
            row.set && row.set(!row.get()); if (onAfter) onAfter(); panelRender(box, state, getRows()); return true
        }
        if (ch === 'a') {
            const listKey = row.listKey
            const target = (row.type === 'list-add')
                ? row
                : (listKey ? rows.find(r => r.type === 'list-add' && r.listKey === listKey) : null)
            if (target) {
                state.selected = rows.indexOf(target)
                state.editing = true; state.editBuffer = ''
                panelRender(box, state, rows); return true
            }
        }
        if (ch === 'd' && row.type === 'list-item' && row.onDelete) {
            try { row.onDelete() } catch (e) { appendLog(`{${T.error}-fg}[Panel] delete failed: ${e.message}{/}`) }
            if (onAfter) onAfter(); panelRender(box, state, getRows()); return true
        }
        if (ch === 'J' && row.type === 'list-item' && row.onMoveDown) {
            try { row.onMoveDown() } catch (e) { appendLog(`{${T.error}-fg}[Panel] move failed: ${e.message}{/}`) }
            if (onAfter) onAfter(); panelRender(box, state, getRows()); return true
        }
        if (ch === 'K' && row.type === 'list-item' && row.onMoveUp) {
            try { row.onMoveUp() } catch (e) { appendLog(`{${T.error}-fg}[Panel] move failed: ${e.message}{/}`) }
            if (onAfter) onAfter(); panelRender(box, state, getRows()); return true
        }
        return false
    }

    // ── Settings rows + actions ──
    function applyGlobalDebugToAllBots(value) {
        for (const b of botManager.bots) debugEnabled[b.name] = !!value
        updateBotList()
    }
    function setGlobalDebugAll(v) { globalDebugAll = !!v; if (globalDebugAll) applyGlobalDebugToAllBots(true) }
    function setGlobalChatHide(v) { globalChatHide = !!v }

    function fmtDiscordStatus(s) {
        if (!s.activated) return `{${T.muted}-fg}未啟用 (activate=false){/}`
        if (!s.ready)     return `{${T.warning}-fg}未連線{/}  {${T.muted}-fg}(activate=true){/}`
        const ping = s.ping == null ? '?' : s.ping + 'ms'
        const since = s.readyAt ? `${Math.round((Date.now() - s.readyAt) / 1000)}s` : '-'
        return `{${T.success}-fg}已連線{/}  {${T.subtext}-fg}${s.tag || '-'}{/}  ping ${ping}  since ${since}  ${s.channelOk ? `{${T.success}-fg}channel OK{/}` : `{${T.error}-fg}channel ✗{/}`}`
    }
    async function actionGenerateInviteLink() {
        const tok = (config.discord_setting || {}).token
        if (!tok) {
            appendLog(`{${T.error}-fg}[Discord] token 未設定，無法產生邀請連結{/}`)
            notify('✗ token 未設定', 'error')
            return
        }
        const appId = discordbot.getAppIdFromToken(tok)
        if (!appId || !/^\d+$/.test(appId)) {
            appendLog(`{${T.error}-fg}[Discord] 無法從 token 解析 App ID{/}`)
            notify('✗ 無法解析 App ID', 'error')
            return
        }
        // VIEW_CHANNEL(1024) + SEND_MESSAGES(2048) + EMBED_LINKS(16384) + READ_MESSAGE_HISTORY(65536)
        const perms = 85504
        const url = `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot%20applications.commands&permissions=${perms}`
        appendLog(`{${T.success}-fg}[Discord] App ID: ${appId}{/}`)
        appendLog(`{${T.accent}-fg}${url}{/}`)
        notify('✓ 邀請連結已顯示於 Console', 'success', 12000)
    }
    async function actionTestDiscordToken() {
        const tok = (config.discord_setting || {}).token
        if (!tok) {
            appendLog(`{${T.error}-fg}[Discord] token 未設定{/}`)
            notify('✗ token 未設定', 'error')
            return
        }
        appendLog(`{${T.muted}-fg}[Discord] testing token...{/}`)
        notify('Discord token 測試中...', 'info', 6000)
        const res = await discordbot.testToken(tok)
        if (res.ok) {
            appendLog(`{${T.success}-fg}[Discord] token OK — logged in as ${res.tag}{/}`)
            notify(`✓ token 有效 — ${res.tag}`, 'success', 6000)
        } else {
            const errMsg = res.error || ''
            appendLog(`{${T.error}-fg}[Discord] token failed — ${errMsg}{/}`)
            if (/disallowed intent/i.test(errMsg))
                appendLog(`{${T.warning}-fg}[Discord] → 請至 Developer Portal > Bot > Privileged Gateway Intents 開啟 Message Content Intent 後重啟程式。{/}`)
            else if (/invalid token/i.test(errMsg))
                appendLog(`{${T.warning}-fg}[Discord] → 請確認 token 是 Bot Token（非 Client Secret / Application ID）。可至 Developer Portal > Bot > Reset Token 重新產生。{/}`)
            else if (/login timeout|timed? ?out/i.test(errMsg))
                appendLog(`{${T.warning}-fg}[Discord] → 請確認目前環境能連到 discord.com / gateway.discord.gg，是否被防火牆、代理或 DNS 阻擋。{/}`)
            notify(`✗ token 失效: ${errMsg}`, 'error', 6000)
        }
    }
    async function actionSendDiscordTest() {
        notify('Discord 測試訊息發送中...', 'info', 10000)
        try {
            await discordbot.sendTestMessage()
            appendLog(`{${T.success}-fg}[Discord] 測試訊息已送出{/}`)
            notify('✓ Discord 測試訊息已送出', 'success')
        } catch (e) {
            appendLog(`{${T.error}-fg}[Discord] 發送失敗 — ${e.message}{/}`)
            notify(`✗ Discord 發送失敗: ${e.message}`, 'error')
        }
    }
    let discordToggledThisSession = false
    async function actionToggleDiscordRuntime() {
        const s = discordbot.getStatus()
        if (s.ready) {
            try {
                await discordbot.DiscordBotStop(0)
                appendLog(`{${T.warning}-fg}[Discord] stopped (此 session 不支援重啟,請重新執行程式){/}`)
                notify('⚠ Discord 已停止 (此 session 無法重啟)', 'warning')
            } catch (e) {
                appendLog(`{${T.error}-fg}[Discord] stop failed: ${e.message}{/}`)
                notify(`✗ Discord 停止失敗: ${e.message}`, 'error')
            }
            discordToggledThisSession = true
        } else if (discordToggledThisSession) {
            appendLog(`{${T.error}-fg}[Discord] client 已被停止,請重啟程式 (config.activate 已寫入,下次自動啟動){/}`)
            notify('✗ 已停過 client,需重啟程式', 'error')
        } else {
            try {
                discordbot.DiscordBotStart(botManager)
                discordToggledThisSession = true
                appendLog(`{${T.success}-fg}[Discord] starting...{/}`)
                notify('Discord 啟動中...', 'info')
            } catch (e) {
                appendLog(`{${T.error}-fg}[Discord] start failed: ${e.message}{/}`)
                notify(`✗ Discord 啟動失敗: ${e.message}`, 'error')
            }
        }
    }

    function listMutator(section, key, getter) {
        const replace = (newArr) => saveTomlValue(section, key, newArr)
        return {
            del: (i) => { const a = getter().slice(); a.splice(i, 1); replace(a) },
            up:  (i) => { const a = getter().slice(); if (i <= 0) return; const [m] = a.splice(i, 1); a.splice(i - 1, 0, m); replace(a) },
            down:(i) => { const a = getter().slice(); if (i >= a.length - 1) return; const [m] = a.splice(i, 1); a.splice(i + 1, 0, m); replace(a) },
            add: (v) => { if (!v) return; const a = getter().slice(); a.push(v); replace(a) },
        }
    }

    function buildSettingsRows() {
        const D = config.discord_setting || (config.discord_setting = {})
        const S = config.setting         || (config.setting = {})
        const ds = discordbot.getStatus()
        const rows = []

        rows.push({ type: 'header', label: 'Discord' })
        rows.push({ type: 'toggle', label: 'activate',
            get: () => !!D.activate,
            set: (v) => saveTomlValue('discord_setting', 'activate', v) })
        rows.push({ type: 'action', label: '套用啟用變更',
            run: actionToggleDiscordRuntime,
            hint: '立即啟動或停止 Discord client' })
        rows.push({ type: 'text', label: 'Token', mask: true,
            get: () => D.token || '',
            set: (v) => saveTomlValue('discord_setting', 'token', v),
            hint: 'discord.com/developers > 應用程式 > Bot > Reset Token' })
        rows.push({ type: 'action', label: '測試 Token',
            run: actionTestDiscordToken,
            hint: '臨時 client 嘗試登入,不影響現有連線' })
        rows.push({ type: 'display', label: 'App ID',
            get: () => { const t = D.token; if (!t) return '-'; const id = discordbot.getAppIdFromToken(t); return (id && /^\d+$/.test(id)) ? id : '-' } })
        rows.push({ type: 'action', label: '產生邀請連結',
            run: actionGenerateInviteLink,
            hint: '從 token 解析 App ID 並輸出 OAuth2 邀請 URL' })
        rows.push({ type: 'text', label: 'Guild ID',
            get: () => D.guildId || '',
            set: (v) => saveTomlValue('discord_setting', 'guildId', v),
            hint: '伺服器右鍵 > 複製ID  (需開啟開發者模式)' })
        rows.push({ type: 'text', label: 'Channel ID',
            get: () => D.channelId || '',
            set: (v) => saveTomlValue('discord_setting', 'channelId', v),
            hint: '頻道右鍵 > 複製ID  (需開啟開發者模式)' })
        rows.push({ type: 'toggle', label: 'MC DM Forward',
            get: () => !!D.enable_MC_DM_Forward,
            set: (v) => saveTomlValue('discord_setting', 'enable_MC_DM_Forward', v) })
        rows.push({ type: 'text', label: 'MC DM Channel',
            get: () => D.MC_DM_Forward_channelId || '',
            set: (v) => saveTomlValue('discord_setting', 'MC_DM_Forward_channelId', v) })
        rows.push({ type: 'text', label: 'Owners',
            get: () => D.owners || '',
            set: (v) => saveTomlValue('discord_setting', 'owners', v) })
        rows.push({ type: 'display', label: '連線狀態', get: () => fmtDiscordStatus(ds) })
        rows.push({ type: 'action', label: '發送測試訊息',
            run: actionSendDiscordTest,
            hint: '對 channelId 發送一則測試訊息' })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: 'Discord 使用者白名單 (whitelist_members)' })
        const dm = D.whitelist_members || []
        const dmM = listMutator('discord_setting', 'whitelist_members', () => D.whitelist_members || [])
        dm.forEach((v, i) => rows.push({
            type: 'list-item', value: v, index: i, listKey: 'd_members',
            onDelete: () => dmM.del(i),
        }))
        rows.push({ type: 'list-add', listKey: 'd_members', onAdd: dmM.add })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: 'Discord 身分組白名單 (whitelist_roles)' })
        const dr = D.whitelist_roles || []
        const drM = listMutator('discord_setting', 'whitelist_roles', () => D.whitelist_roles || [])
        dr.forEach((v, i) => rows.push({
            type: 'list-item', value: v, index: i, listKey: 'd_roles',
            onDelete: () => drM.del(i),
        }))
        rows.push({ type: 'list-add', listKey: 'd_roles', onAdd: drM.add })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: '全域日誌 (套用至所有 bot,不寫入 config)' })
        rows.push({ type: 'toggle', label: 'DEBUG 顯示', get: () => globalDebugAll, set: setGlobalDebugAll, hint: 'on=強制顯示所有 bot 的 DEBUG' })
        rows.push({ type: 'toggle', label: 'CHAT  隱藏', get: () => globalChatHide, set: setGlobalChatHide, hint: 'on=隱藏所有 CHAT 類型訊息' })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: 'MC 玩家白名單 (setting.whitelist) — /m 操作 bot 的權限' })
        const mcw = S.whitelist || []
        const mcwM = listMutator('setting', 'whitelist', () => S.whitelist || [])
        mcw.forEach((v, i) => rows.push({
            type: 'list-item', value: v, index: i, listKey: 'mc_whitelist',
            onDelete: () => mcwM.del(i),
        }))
        rows.push({ type: 'list-add', listKey: 'mc_whitelist', onAdd: mcwM.add })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: '日誌 (logs/)' })
        rows.push({ type: 'text', label: 'log_retain_days',
            get: () => S.log_retain_days == null ? '30' : String(S.log_retain_days),
            set: (v) => {
                const n = parseInt(String(v).replace(/_/g, ''), 10)
                if (Number.isFinite(n) && n >= 0) saveTomlValue('setting', 'log_retain_days', n)
            },
            hint: '0 = 停用;>=1 = 啟動時刪除 mtime 早於 N 天的 *.log' })
        rows.push({ type: 'action', label: '立即清理舊 log',
            run: () => {
                const n = Number.isFinite(S.log_retain_days) ? S.log_retain_days : 30
                const r = cleanupOldLogs(n)
                if (r.error) {
                    appendLog(`{${T.error}-fg}[Log] cleanup 失敗: ${r.error}{/}`)
                    notify(`✗ log 清理失敗: ${r.error}`, 'error')
                } else {
                    appendLog(`{${T.success}-fg}[Log] 清理 ${r.deleted}/${r.scanned} 個過期 log (retain=${n}d, 跳過開啟中=${r.skippedActive}){/}`)
                    notify(`✓ 已刪 ${r.deleted} 個過期 log`, 'success')
                }
            },
            hint: '依目前的 log_retain_days 立刻掃 logs/' })

        return rows
    }

    function buildProfilesConnRows() {
        const S = config.setting || (config.setting = {})
        const rows = []
        rows.push({ type: 'header', label: '連線設定' })
        rows.push({ type: 'toggle', label: 'selectBestIP',
            get: () => !!S.selectBestIP,
            set: (v) => saveTomlValue('setting', 'selectBestIP', v) })
        rows.push({ type: 'text', label: 'reconnect_CD (ms)',
            get: () => S.reconnect_CD == null ? '' : String(S.reconnect_CD),
            set: (v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) saveTomlValue('setting', 'reconnect_CD', n) } })
        rows.push({ type: 'text', label: 'CheckPing (ms)',
            get: () => S.CheckPing == null ? '' : String(S.CheckPing),
            set: (v) => { const n = parseInt(String(v).replace(/_/g, ''), 10); if (Number.isFinite(n)) saveTomlValue('setting', 'CheckPing', n) } })
        rows.push({ type: 'text', label: 'pingThreshold (ms)',
            get: () => S.pingThreshold == null ? '' : String(S.pingThreshold),
            set: (v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) saveTomlValue('setting', 'pingThreshold', n) } })
        rows.push({ type: 'display', label: '目前最佳 IP',
            get: () => botManager._bestIP ? `{${T.success}-fg}${botManager._bestIP}{/}` : `{${T.muted}-fg}-{/}` })
        rows.push({ type: 'action', label: '重新偵測最佳 IP',
            run: async () => {
                appendLog(`{${T.muted}-fg}[Conn] 偵測中 (取決於 selectBestIP / ips 設定)...{/}`)
                notify('IP 偵測中...', 'info', 8000)
                try {
                    await botManager.updateBestIP()
                    if (botManager._bestIP) notify(`✓ 最佳 IP: ${botManager._bestIP}`, 'success', 5000)
                    else notify('IP 偵測完成 (未取得結果)', 'warning')
                } catch (e) {
                    appendLog(`{${T.error}-fg}[Conn] 偵測失敗: ${e.message}{/}`)
                    notify(`✗ IP 偵測失敗: ${e.message}`, 'error')
                }
                renderProfilesConn(); redraw()
            } })

        rows.push({ type: 'spacer' })
        rows.push({ type: 'header', label: 'IP 清單 (setting.ips) — 啟動時挑選最低延遲' })
        const ips = S.ips || []
        const ipsM = listMutator('setting', 'ips', () => S.ips || [])
        ips.forEach((v, i) => rows.push({
            type: 'list-item', value: v, index: i, listKey: 'ips',
            onDelete:   () => ipsM.del(i),
            onMoveUp:   () => ipsM.up(i),
            onMoveDown: () => ipsM.down(i),
        }))
        rows.push({ type: 'list-add', listKey: 'ips', onAdd: ipsM.add })

        return rows
    }

    function renderSettings() {
        settingsBox.setLabel(` Settings  {${T.muted}-fg}↑/↓ k/j 導航  e:編輯  s:切換  Enter:觸發  a:加  d:刪{/} `)
        panelRender(settingsBox, interactiveStates.settings, buildSettingsRows())
    }
    function renderProfilesConn() {
        profilesConnBox.setLabel(` Connection  {${T.muted}-fg}Tab=回 Profiles  ↑/↓ e:編輯 s:切換 Enter:觸發 a:加 d:刪 J/K:序{/} `)
        panelRender(profilesConnBox, interactiveStates.profilesConn, buildProfilesConnRows())
    }

    // Multi-step prompt that hijacks the command bar.
    function startPrompt(label, defaultVal, onSubmit, onCancel) {
        wizardActive = true
        wizardLabel = label
        wizardOnSubmit = onSubmit || null
        wizardOnCancel = onCancel || null
        if (mode !== 'command') setCommandMode()
        cmdBuffer = defaultVal == null ? '' : String(defaultVal)
        cmdCursorPos = cmdBuffer.length
        redraw()
    }
    function cancelPrompt() {
        const onCancel = wizardOnCancel
        wizardActive = false
        wizardOnSubmit = null
        wizardOnCancel = null
        wizardLabel = ''
        try { onCancel && onCancel() } catch (_) {}
        setNormalMode()
    }

    function profileTypeOk(type) {
        return ['general', 'raid', 'auto', 'material'].includes(type)
    }
    function parseBool(s, fallback) {
        const v = String(s || '').trim().toLowerCase()
        if (!v) return fallback
        return /^(y|yes|t|true|1)$/.test(v)
    }
    function getSelectedProfileName() {
        const keys = Object.keys(botManager.profiles || {})
        return keys[profilesList.selected] || null
    }

    function addProfileWizard() {
        const data = {}
        const step = (lbl, def, save, next) => () => startPrompt(lbl, def, (val) => { save(val); next() })
        const finish = () => {
            const name = data.__name
            delete data.__name
            // Preserve insertion order: a fresh object appends the new key at the end.
            const merged = {}
            for (const k of Object.keys(botManager.profiles || {})) merged[k] = botManager.profiles[k]
            merged[name] = data
            botManager.profiles = merged
            saveProfilesToDisk()
            renderProfilesList()
            profilesList.select(Object.keys(merged).indexOf(name))
            redraw()
            appendLog(`{${T.success}-fg}[Profiles] Added "${name}"{/}`)
            notify(`✓ 新增 profile: ${name}`, 'success')
        }
        const askName = () => startPrompt('Add (1/7) Name', '', (raw) => {
            const name = raw.trim()
            if (!name) {
                appendLog(`{${T.error}-fg}[Profiles] Name 不可空白{/}`)
                notify('✗ Name 不可空白', 'error')
                return
            }
            if ((botManager.profiles || {})[name]) {
                appendLog(`{${T.error}-fg}[Profiles] "${name}" 已存在{/}`)
                notify(`✗ "${name}" 已存在`, 'error')
                return
            }
            data.__name = name
            askType()
        })
        const askType = step('Add (2/7) Type (general/raid/auto/material)', 'general', (v) => {
            const t = v.trim() || 'general'
            data.type = profileTypeOk(t) ? t : 'general'
        }, () => askUser())
        // Inline so the default mirrors the just-entered name at execution time.
        const askUser = () => startPrompt('Add (3/7) Username', data.__name || '', (v) => {
            data.username = v.trim() || data.__name
            askHost()
        })
        const askHost = step('Add (4/7) Host', 'proxy-nrt.mcfallout.net', (v) => {
            data.host = v.trim() || 'proxy-nrt.mcfallout.net'
        }, () => askPort())
        const askPort = step('Add (5/7) Port (空白=預設)', '', (v) => {
            data.port = v.trim()
        }, () => askDebug())
        const askDebug = step('Add (6/7) Debug (y/n)', 'n', (v) => {
            data.debug = parseBool(v, false)
        }, () => askChat())
        const askChat = step('Add (7/7) Chat (y/n)', 'n', (v) => {
            data.chat = parseBool(v, false)
        }, finish)
        askName()
    }

    function editProfileWizard() {
        const name = getSelectedProfileName()
        if (!name) return
        const orig = (botManager.profiles || {})[name] || {}
        const upd = { ...orig }
        const step = (lbl, def, save, next) => () => startPrompt(lbl, def, (val) => { save(val); next() })
        const finish = () => {
            botManager.profiles[name] = upd
            saveProfilesToDisk()
            renderProfilesList()
            redraw()
            appendLog(`{${T.success}-fg}[Profiles] Updated "${name}"{/}`)
            notify(`✓ 更新 profile: ${name}`, 'success')
        }
        const askType = step(`Edit ${name} (1/6) Type`, orig.type || 'general', (v) => {
            const t = v.trim() || 'general'
            upd.type = profileTypeOk(t) ? t : 'general'
        }, () => askUser())
        const askUser = step(`Edit ${name} (2/6) Username`, orig.username || '', (v) => {
            upd.username = v.trim()
        }, () => askHost())
        const askHost = step(`Edit ${name} (3/6) Host`, orig.host || '', (v) => {
            upd.host = v.trim()
        }, () => askPort())
        const askPort = step(`Edit ${name} (4/6) Port`, orig.port || '', (v) => {
            upd.port = v.trim()
        }, () => askDebug())
        const askDebug = step(`Edit ${name} (5/6) Debug (y/n)`, orig.debug ? 'y' : 'n', (v) => {
            upd.debug = parseBool(v, !!orig.debug)
        }, () => askChat())
        const askChat = step(`Edit ${name} (6/6) Chat (y/n)`, orig.chat ? 'y' : 'n', (v) => {
            upd.chat = parseBool(v, !!orig.chat)
        }, finish)
        askType()
    }

    function deleteProfileWizard() {
        const name = getSelectedProfileName()
        if (!name) return
        const inAuto = getAutoStartIds().includes(name)
        const tail = inAuto ? '  (在啟動清單中!)' : ''
        startPrompt(`Delete "${name}"? (y/n)${tail}`, 'n', (val) => {
            if (!parseBool(val, false)) {
                appendLog(`{${T.muted}-fg}[Profiles] Delete cancelled{/}`)
                notify('已取消刪除', 'info')
                return
            }
            const idx = profilesList.selected
            delete botManager.profiles[name]
            saveProfilesToDisk()
            renderProfilesList()
            const remain = Object.keys(botManager.profiles || {}).length
            if (remain > 0) profilesList.select(Math.min(idx, remain - 1))
            redraw()
            appendLog(`{${T.warning}-fg}[Profiles] Deleted "${name}"{/}`)
            notify(`⚠ 已刪除 profile: ${name}`, 'warning')
        })
    }

    function reorderProfile(direction) {
        const profiles = botManager.profiles || {}
        const keys = Object.keys(profiles)
        const idx = profilesList.selected
        const newIdx = idx + direction
        if (idx < 0 || newIdx < 0 || newIdx >= keys.length) return
        const [moved] = keys.splice(idx, 1)
        keys.splice(newIdx, 0, moved)
        const reordered = {}
        for (const k of keys) reordered[k] = profiles[k]
        botManager.profiles = reordered
        saveProfilesToDisk()
        renderProfilesList()
        profilesList.select(newIdx)
        redraw()
    }

    function toggleMouse() {
        mouseOn = !mouseOn
        try {
            if (mouseOn) screen.program.enableMouse()
            else         screen.program.disableMouse()
        } catch (_) {}
        // Re-apply Console focus so copy mode focuses the log (wheel→arrows scroll log),
        // and normal mode focuses the bot list (↑/↓ moves selection). See applyConsoleFocus.
        if (activeTab === 1) applyConsoleFocus()
        updateLogHint()
        redraw()
    }

    function toggleDebug() {
        const idx = botList.selected
        const bot = botManager.bots[idx]
        if (!bot) return
        debugEnabled[bot.name] = !isDebugVisible(bot.name)
        try { bot.childProcess?.send({ type: 'setDebug', value: debugEnabled[bot.name] }) } catch (_) {}
        updateBotList()
        botList.select(idx)
        appendLog(`{${T.muted}-fg}[TUI] DEBUG logs ${debugEnabled[bot.name] ? 'shown' : 'hidden'} for ${bot.name}{/}`)
        notify(`${bot.name} DEBUG: ${debugEnabled[bot.name] ? '顯示' : '隱藏'}`, 'info')
        redraw()
    }

    function toggleLogFilterForSelected() {
        const idx = botList.selected
        const bot = botManager.bots[idx]
        if (!bot) return
        logEnabled[bot.name] = !isLogEnabled(bot.name)
        updateBotList()
        botList.select(idx)
        appendLog(`{${T.muted}-fg}[TUI] Log ${logEnabled[bot.name] ? 'enabled' : 'disabled'} for ${bot.name}{/}`)
        notify(`${bot.name} 日誌: ${logEnabled[bot.name] ? '顯示' : '隱藏'}`, 'info')
        redraw()
    }

    function toggleGlobalChat() {
        globalChatHide = !globalChatHide
        for (const b of botManager.bots) {
            try { b.childProcess?.send({ type: 'setChat', value: !globalChatHide }) } catch (_) {}
        }
        appendLog(`{${T.muted}-fg}[TUI] CHAT ${globalChatHide ? 'hidden' : 'shown'}{/}`)
        notify(`CHAT: ${globalChatHide ? '隱藏' : '顯示'}`, 'info')
        redraw()
    }

    function toggleSelectedBotChat() {
        const idx = botList.selected
        const bot = botManager.bots[idx]
        if (!bot) return
        const nowHidden = !botChatHidden.has(bot)
        if (nowHidden) botChatHidden.add(bot); else botChatHidden.delete(bot)
        try { bot.childProcess?.send({ type: 'setChat', value: !nowHidden }) } catch (_) {}
        updateBotList()
        botList.select(idx)
        appendLog(`{${T.muted}-fg}[TUI] ${bot.name} CHAT ${nowHidden ? 'hidden' : 'shown'}{/}`)
        notify(`${bot.name} CHAT: ${nowHidden ? '隱藏' : '顯示'}`, 'info')
        redraw()
    }

    // ── Keypress ──
    function historyPrev() {
        if (cmdHistory.length === 0) return
        if (histIdx === -1) { pendingBuffer = cmdBuffer; histIdx = cmdHistory.length - 1 }
        else if (histIdx > 0) { histIdx -= 1 }
        cmdBuffer = cmdHistory[histIdx]
        cmdCursorPos = cmdBuffer.length
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
        cmdCursorPos = cmdBuffer.length
        redraw()
    }
    screen.on('keypress', (ch, key) => { try {
        if (!key) return
        if (mode === 'command') {
            if (key.name === 'enter' || key.name === 'return') {
                if (wizardActive) {
                    const value = cmdBuffer
                    const handler = wizardOnSubmit
                    wizardActive = false
                    wizardOnSubmit = null
                    wizardOnCancel = null
                    wizardLabel = ''
                    cmdBuffer = ''
                    try { handler && handler(value) }
                    catch (e) { appendLog(`{${T.error}-fg}[Wizard ERROR] ${e.message}{/}`) }
                    if (!wizardActive) setNormalMode()
                    else redraw()
                    return
                }
                const cmd = cmdBuffer.trim()
                if (cmd && cmdHistory[cmdHistory.length - 1] !== cmd) cmdHistory.push(cmd)
                if (cmdHistory.length > 200) cmdHistory.shift()
                histIdx = -1; pendingBuffer = ''
                setNormalMode()
                if (cmd === 'exit' || cmd === 'quit') { cleanExit(0, { skipConfirm: true }); return }
                if (cmd === '.clear') {
                    logBox.setContent('')
                    if (logBox._clines) { logBox._clines.fake = []; logBox._clines.ftor = []; logBox._clines.rtof = [] }
                    unseen = 0; followBottom = true; updateLogLabel()
                    screen.render(); return
                }
                if (cmd && typeof onCommand === 'function') {
                    try { onCommand(cmd) } catch (e) { appendLog(`{${T.error}-fg}[TUI ERROR] ${e.message}{/}`) }
                }
                updateBotList()
                redraw()
                return
            }
            if (key.name === 'escape') {
                if (wizardActive) { cancelPrompt(); return }
                histIdx = -1; pendingBuffer = ''; setNormalMode(); return
            }
            if (key.name === 'up')       { if (wizardActive) return; historyPrev(); return }
            if (key.name === 'down')     { if (wizardActive) return; historyNext(); return }
            if (key.name === 'left') {
                if (cmdCursorPos > 0) { cmdCursorPos--; redraw() }
                return
            }
            if (key.name === 'right') {
                if (cmdCursorPos < cmdBuffer.length) { cmdCursorPos++; redraw() }
                return
            }
            if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
                cmdCursorPos = 0; redraw(); return
            }
            if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
                cmdCursorPos = cmdBuffer.length; redraw(); return
            }
            if (key.name === 'backspace') {
                if (cmdCursorPos === 0) return
                cmdBuffer = cmdBuffer.slice(0, cmdCursorPos - 1) + cmdBuffer.slice(cmdCursorPos)
                cmdCursorPos--
                if (histIdx !== -1) { pendingBuffer = cmdBuffer; histIdx = -1 }
                redraw(); return
            }
            if (key.name === 'delete') {
                if (cmdCursorPos >= cmdBuffer.length) return
                cmdBuffer = cmdBuffer.slice(0, cmdCursorPos) + cmdBuffer.slice(cmdCursorPos + 1)
                if (histIdx !== -1) { pendingBuffer = cmdBuffer; histIdx = -1 }
                redraw(); return
            }
            if (ch && ch.length === 1 && !key.ctrl && !key.meta && ch >= ' ') {
                if (histIdx !== -1) { pendingBuffer = cmdBuffer; histIdx = -1 }
                cmdBuffer = cmdBuffer.slice(0, cmdCursorPos) + ch + cmdBuffer.slice(cmdCursorPos)
                cmdCursorPos++
                redraw()
            }
            return
        }
        // Console tab: ↑/↓ 由 botList(keys:true,一般模式被 focus)內建移動選擇;
        // 滾輪捲動日誌(見 screen.on('mouse') → userScrolled)。不需在此攔截方向鍵。
        // Settings tab: route ALL keys (including a/e/d/s/J/K) to the interactive panel
        // first; tab-switching, '/' and Ctrl-C are still handled below if the panel
        // didn't consume them.
        if (activeTab === 4) {
            const handled = panelHandleKey(settingsBox, interactiveStates.settings,
                                           buildSettingsRows, ch, key,
                                           () => renderSettings())
            if (handled) { redraw(); return }
        }
        // Profiles connection sub-view: same routing.
        if (activeTab === 2 && profilesView === 'connection') {
            // Tab toggles back to Profiles list view (intercept before panel)
            if (key.name === 'tab' && !interactiveStates.profilesConn.editing) {
                profilesView = 'profiles'; showTab(2); return
            }
            const handled = panelHandleKey(profilesConnBox, interactiveStates.profilesConn,
                                           buildProfilesConnRows, ch, key,
                                           () => renderProfilesConn())
            if (handled) { redraw(); return }
        }
        // Helps tab: scroll keys + Tab handled at element level (helpsContentBox.key / helpsTocList.key).
        // Screen handler only forwards '/', tab-switching, Ctrl-C etc. — see fall-through below.
        if (ch === '/') { setCommandMode(); return }
        // Profiles list view (default sub-view of Profiles tab)
        if (activeTab === 2 && profilesView === 'profiles' && !key.ctrl && !key.meta) {
            if (key.name === 'tab') { profilesView = 'connection'; showTab(2); return }
            if (ch === 'a') { addProfileWizard();    return }
            if (ch === 'e') { editProfileWizard();   return }
            if (ch === 'd') { deleteProfileWizard(); return }
            if (ch === 's') { toggleAutoStart();     return }
            if (ch === 'J') { reorderProfile(1);     return }
            if (ch === 'K') { reorderProfile(-1);    return }
        }
        if (key.name === 'left')  { switchTab(activeTab - 1); return }
        if (key.name === 'right') { switchTab(activeTab + 1); return }
        if (ch && ch >= '1' && ch <= '5') { switchTab(parseInt(ch) - 1); return }
        if (ch === 'm' && !key.ctrl && !key.meta) { toggleMouse(); return }
        if (ch === 'd' && !key.ctrl && !key.meta && activeTab === 1) { toggleDebug(); return }
        if (ch === 'l' && !key.ctrl && !key.meta && activeTab === 1) { toggleLogFilterForSelected(); return }
        if (ch === 't' && !key.ctrl && !key.meta && activeTab === 1) { toggleSelectedBotChat(); return }
        if (key.full === 'C-c') cleanExit(0)
    } catch (e) { logger(true, 'DEBUG', 'TUI', `keypress error: ${e.message}\n${e.stack}`) } })

    // Tab is reserved for future command-bar autocomplete.

    // Screen-level wheel (elements have mouse:false so click can't steal focus).
    // ── Console 分頁焦點 ──
    // 固定模型:↑/↓ 操作 Bots 清單、滾輪捲動 Logs。
    //   一般模式 → 焦點放 botList(keys:true 內建 ↑/↓ 移動選擇);滾輪走下方 screen.on('mouse') → userScrolled。
    //   copy 模式(mouseOn=false,滑鼠追蹤關閉)→ 終端把滾輪轉成 ↑/↓ 方向鍵送給焦點 widget,
    //                                            故改把焦點放 logBox,讓滾輪(→方向鍵)捲動日誌。
    function applyConsoleFocus() {
        if (mouseOn) botList.focus()
        else         logBox.focus()
        botListHint.setContent(` {${T.muted}-fg}↑/↓:bot  滾輪:log  l:log d:dbg t:chat{/}`)
        screen.render()
    }
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
        // Console tab — 滾輪只捲動日誌;bot 選擇用 ↑/↓。
        if (activeTab === 1) {
            const dir = data.action === 'wheelup' ? -1 : data.action === 'wheeldown' ? 1 : 0
            if (!dir) return
            userScrolled(dir * 3)
            return
        }
        // Helps tab — wheel behavior depends on which sub-widget has focus:
        //   focus=content → 1 行 / 滾動格
        //   focus=toc     → 1 個目錄條目 / 滾動格,目錄選擇變動會把內容跳到該節
        if (activeTab === 3) {
            const dir = data.action === 'wheelup' ? -1 : data.action === 'wheeldown' ? +1 : 0
            if (!dir) return
            if (helpsFocus === 'toc') helpsTocStep(dir)
            else                       helpsScroll(dir)
            return
        }
    })
    logBox.key(['up', 'k'],        () => userScrolled(-1))
    logBox.key(['down', 'j'],      () => userScrolled(1))
    logBox.key(['pageup'],         () => userScrolled(-Math.floor(logBox.height / 2)))
    logBox.key(['pagedown'],       () => userScrolled(Math.floor(logBox.height / 2)))
    logBox.key(['end', 'G'],       () => { logBox.setScrollPerc(100); followBottom = true; unseen = 0; updateLogLabel(); screen.render() })
    logBox.key(['home', 'g'],      () => { logBox.setScrollPerc(0);   followBottom = false; updateLogLabel(); screen.render() })

    // ── Bot list: 'l' toggles log filter for the highlighted bot (handled at screen-level keypress).
    // Enter is intentionally a no-op here so users can move selection without flipping the filter.

    // Keep info panel + botManager.currentBot in sync with selection (no log message).
    botList.on('select item', (_item, idx) => {
        try {
            const bot = botManager.bots[idx]
            if (bot && botManager.currentBot !== bot) {
                botManager.currentBot = bot
            }
            renderInfos()
            renderDetail()
        } catch (e) { logger(true, 'DEBUG', 'TUI', `botList select error: ${e.message}`) }
    })
    botList.key(['up', 'down', 'k', 'j'], () => setTimeout(() => { renderInfos(); renderDetail() }, 0))

    // ── Wire logger sink ──
    setSink((formatted, meta) => {
        const name = (meta && meta.name) || ''
        const type = (meta && meta.type) || ''
        const isSystem = name === 'CONSOLE' || name === 'BOTMANAGER' || !name
        const botName  = isSystem ? null
            : botManager.bots.find(b => name.startsWith(b.name.substring(0, 4)))?.name
        // Global CHAT hide takes precedence over per-bot toggles.
        if (type === 'CHAT' && globalChatHide) return
        // DEBUG: hidden by default unless per-bot 'd' toggle OR global force-on.
        if (type === 'DEBUG' && botName && !globalDebugAll && !isDebugVisible(botName)) return
        // Filter bot-specific logs by toggle; always show CONSOLE / BOTMANAGER / SYSTEM
        if (botName && !isLogEnabled(botName)) return
        // Lines whose visible text ends with ) can bleed into subsequent lines as a
        // blessed right-edge artifact; append a newline so the ) keeps its own line
        // boundary (no trailing-space residual).
        const visible = formatted.replace(/\x1b\[[0-9;]*m/g, '')
        const out = /\)\s*$/.test(visible) ? formatted + '\n' : formatted
        appendLog(ansiToBlessed(out))
    })

    // Suppress stray console.log so it doesn't corrupt the TUI buffer
    const origLog = console.log
    console.log = (...args) => appendLog(ansiToBlessed(args.join(' ')))
    const origErr = console.error
    console.error = (...args) => appendLog(`{${T.error}-fg}${ansiToBlessed(args.join(' '))}{/}`)

    // ── Periodic refresh (bot list changes, status updates) ──
    const refreshTimer = setInterval(() => {
        try {
        // Drop infoCache for any bot that's no longer running so re-creation starts fresh.
        for (const b of botManager.bots) {
            if (!b.childProcess && infoCache[b.name]) delete infoCache[b.name]
        }
        updateBotList()
        if (activeTab === 1) { renderInfos(); renderDetail() }
        else if (activeTab === 0) tabContent.setContent(dashboardContent())
        else if (activeTab === 4) renderSettings()  // Discord status / mem snapshots
        else if (activeTab === 2 && profilesView === 'connection') renderProfilesConn()
        redraw()
        } catch (e) { logger(true, 'DEBUG', 'TUI', `refreshTimer error: ${e.message}\n${e.stack}`) }
    }, 1000)

    // Rotate footer tips so the user passively learns shortcuts.
    const tipTimer = setInterval(() => {
        if (TIPS.length <= 1) return
        let next = currentTip
        while (next === currentTip) {
            next = TIPS[Math.floor(Math.random() * TIPS.length)]
        }
        currentTip = next
        renderStatusBar()
        screen.render()
    }, 60000)

    // ── Exit cleanup ──
    process.on('SIGINT',  () => cleanExit(0))                          // 鍵盤 Ctrl-C → 走確認
    process.on('SIGTERM', () => cleanExit(0, { skipConfirm: true }))  // 系統 kill → 直接 graceful
    process.on('exit', () => {
        try { screen.program.disableMouse(); screen.program.normalBuffer() } catch (_) {}
        try { console.log = origLog; console.error = origErr } catch (_) {}
        clearInterval(refreshTimer)
        clearInterval(infoPollTimer)
        clearInterval(detailPollTimer)
        clearInterval(tipTimer)
        try { botManager.handle.off('data', onBotData) } catch (_) {}
    })

    // ── Init ──
    updateBotList()
    if (botManager.bots.length > 0) botList.select(0)
    updateLogHint()
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
        setPendingOutput,
    }
}

module.exports = { start }
