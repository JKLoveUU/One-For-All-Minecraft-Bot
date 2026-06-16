// 任務 Detail 面板的純渲染器（輸入 detail，輸出字串；由 tui.js 抽出）
const { T } = require('./theme')
const { isMissing, val, fmtEta } = require('./format')

    function detailStateColor(state) {
        switch (state) {
            case 'running':    return T.success
            case 'waiting':    return T.warning
            case 'refreshing': return T.accent
            case 'paused':     return T.warning
            case 'protect':    return T.secondary
            case 'idle':       return T.muted
            case 'stopping':
            case 'stopped':    return T.muted
            case 'error':      return T.error
            default:           return T.subtext
        }
    }
    function renderAutoQuestDetail(detail) {
        const p = detail.payload || {}
        const sCol = detailStateColor(detail.state)
        const progressTxt = (p.progress && p.progress.total)
            ? `${p.progress.done}/${p.progress.total}`
            : '-'
        const nextTxt = (p.next === 0 || p.next === '0') ? `{${T.success}-fg}已就緒{/}`
            : isMissing(p.next) ? '-' : p.next
        const afkTxt = isMissing(p.afkWarp) ? '' : `   {${T.subtext}-fg}AFK{/} ${p.afkWarp}`
        // protect 時把顯示文字換成「等待拉霸 / 等待冷卻」,讓使用者一眼看出在等什麼
        const stateTxt = detail.state === 'protect'
            ? (p.protect && p.protect.reason === 'cooldown' ? '等待冷卻' : '等待拉霸')
            : detail.state
        const elapsedTxt = !isMissing(p.currentTaskDurationMs)
            ? `   {${T.subtext}-fg}已執行{/} {${T.warning}-fg}${fmtEta(p.currentTaskDurationMs)}{/}`
            : ''
        return [
            `  {${T.primary}-fg}{bold}AutoQuest{/bold}{/}  {${sCol}-fg}${stateTxt}{/}  {${T.muted}-fg}(${detail.phase}){/}`,
            `  {${T.subtext}-fg}任務{/} ${val(p.questName)}`,
            `  {${T.subtext}-fg}目標{/} ${val(p.target)}`,
            `  {${T.subtext}-fg}進度{/} ${progressTxt}   {${T.subtext}-fg}獎勵{/} ${val(p.reward)}${elapsedTxt}`,
            `  {${T.subtext}-fg}期限{/} ${val(p.remain)}   {${T.subtext}-fg}下個{/} ${nextTxt}`,
            `  {${T.subtext}-fg}剩餘跳過{/} ${val(p.skipAvailableUses)}${afkTxt}`,
        ].join('\n')
    }
    const CA_STATUS_LABEL = {
        tnt:      { text: 'TNT 清理',   col: 'warning' },
        dig:      { text: '挖掘中',     col: 'warning' },
        liquid:   { text: '封堵液體',   col: 'accent'  },
        obsidian: { text: '黑曜石',     col: 'secondary' },
        restock:  { text: '倉庫補貨',   col: 'accent'  },
        collect:  { text: '回收掉落物', col: 'success' },
        navigate: { text: '導航中',     col: 'accent'  },
        wait_tnt: { text: '等待爆炸',   col: 'muted'   },
        init:     { text: '初始化',     col: 'muted'   },
        paused:   { text: '已暫停',     col: 'warning' },
        stopped:  { text: '已停止',     col: 'muted'   },
        finished: { text: '已完成',     col: 'success' },
    }
    const VT_JOB_LABEL = {
        iron:         '鐵村民交易',
        melonpumpkin: '雙瓜交易',
        train:        '村民訓練',
        cure:         '治療改名',
        put:          '放置村民',
    }
    const VT_STATUS_LABEL = {
        navigate:        { text: '導航中',     col: 'accent'    },
        trading:         { text: '交易中',     col: 'success'   },
        restocking:      { text: '補貨中',     col: 'warning'   },
        no_iron:         { text: '鐵不足',     col: 'error'     },
        sort:            { text: '分類村民',   col: 'accent'    },
        summon:          { text: '召喚村民',   col: 'secondary' },
        capture_good:    { text: '收取好村民', col: 'success'   },
        reject_bad:      { text: '拒絕爛村民', col: 'error'     },
        zombify_summon:  { text: '感染-放村民', col: 'secondary' },
        zombify_capture: { text: '感染-抓殭屍', col: 'warning'   },
        cure_weak:       { text: '治療-虛弱',   col: 'accent'    },
        cure_apple:      { text: '治療-金蘋果', col: 'warning'   },
        cure_rename:     { text: '治療-改名',   col: 'secondary' },
        cure_capture:    { text: '治療-抓村民', col: 'success'   },
        cure_summon:     { text: '治療-放殭屍', col: 'secondary' },
        placing:         { text: '放置中',     col: 'success'   },
        removing:        { text: '移除中',     col: 'warning'   },
        paused:          { text: '已暫停',     col: 'warning'   },
        stopped:         { text: '已停止',     col: 'muted'     },
    }
    function renderVillagerDetail(detail) {
        const p = detail.payload || {}
        const jobLbl = VT_JOB_LABEL[detail.job] || detail.job || '-'
        const stLbl = VT_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[stLbl.col] || T.subtext
        const place = (!isMissing(p.warp) || !isMissing(p.server))
            ? `s${val(p.server)} ${val(p.warp)}`
            : '-'
        const extra = !isMissing(p.vtype)
            ? `   {${T.muted}-fg}vtype ${p.vtype}{/}`
            : ''
        const lines = [
            `  {${T.primary}-fg}{bold}Villager{/bold}{/}  {${T.subtext}-fg}${jobLbl}{/}`,
            `  {${T.subtext}-fg}場地{/} ${place}${extra}`,
            `  {${T.subtext}-fg}狀態{/} {${stColRaw}-fg}${stLbl.text}{/}`,
        ]
        if (detail.job === 'melonpumpkin' || detail.job === 'iron') {
            if (!isMissing(p.totalEarn)) {
                const perMin  = isMissing(p.earnPerMin)  ? '-' : p.earnPerMin
                const perHour = isMissing(p.earnPerHour) ? '-' : p.earnPerHour
                lines.push(`  {${T.subtext}-fg}收益{/} {${T.success}-fg}${p.totalEarn}{/}  {${T.muted}-fg}~${perMin}/min  ~${perHour}/hr{/}`)
            }
            if (!isMissing(p.tradePairs))
                lines.push(`  {${T.subtext}-fg}交易{/} {${T.accent}-fg}${p.tradePairs}{/}`)
            if (!isMissing(p.chunkName))
                lines.push(`  {${T.subtext}-fg}區塊{/} ${p.chunkName}  {${T.muted}-fg}村民 ${isMissing(p.villagerCount) ? '-' : p.villagerCount}{/}`)
        }
        return lines.join('\n')
    }
    const BUILD_STATUS_LABEL = {
        init:     { text: '初始化',   col: 'muted'   },
        placing:  { text: '放置中',   col: 'success' },
        restock:  { text: '材料補充', col: 'accent'  },
        navigate: { text: '導航中',   col: 'accent'  },
        paused:   { text: '已暫停',   col: 'warning' },
        finished: { text: '已完成',   col: 'success' },
        stopped:  { text: '已停止',   col: 'muted'   },
    }
    function renderBuildLikeDetail(detail) {
        const p = detail.payload || {}
        const blocks = p.blocks || {}
        const palette = p.palette || {}
        const lbl = BUILD_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[lbl.col] || T.subtext
        const title = detail.type === 'mapart' ? 'Mapart' : 'Build'
        const modelTxt = detail.type === 'mapart'
            ? `{${T.muted}-fg}mapart{/}`
            : `{${T.muted}-fg}${val(p.model)}{/}`
        const sch = (p.schematic || '-').split(/[\\\/]/).pop()
        const place = p.placement
            ? `${p.placement.x|0},${p.placement.y|0},${p.placement.z|0}`
            : '-'
        // building 的 palette 是「該層的材料」,mapart 是「整體材料」
        const paletteScopeTxt = detail.type === 'mapart' ? '材料' : '層內材料'
        const paletteTxt = (palette.total != null)
            ? `${val(palette.current + 1)}/${val(palette.total)}`
            : '-'
        const speedTxt = !isMissing(p.blocksPerHour) ? `${p.blocksPerHour} blk/h` : '-'

        const rows = [
            `  {${T.primary}-fg}{bold}${title}{/bold}{/} ${modelTxt}  {${stColRaw}-fg}${lbl.text}{/}`,
            `  {${T.subtext}-fg}投影{/} ${sch}`,
            `  {${T.subtext}-fg}原點{/} ${place}   {${T.subtext}-fg}s{/}${val(p.server)}`,
            `  {${T.subtext}-fg}方塊{/} ${val(blocks.placed)}/${val(blocks.total)} (${val(blocks.percent)}%)`,
        ]
        // building 有層,mapart 沒有
        if (detail.type !== 'mapart' && p.layer && p.layer.total != null) {
            rows.push(`  {${T.subtext}-fg}層{/} ${val(p.layer.current + 1)}/${val(p.layer.total)}   {${T.subtext}-fg}${paletteScopeTxt}{/} ${paletteTxt}`)
        } else {
            rows.push(`  {${T.subtext}-fg}${paletteScopeTxt}{/} ${paletteTxt}`)
        }
        if (palette.name) {
            rows.push(`  {${T.subtext}-fg}材料名{/} {${T.muted}-fg}${palette.name}{/}`)
        }
        rows.push(`  {${T.subtext}-fg}ETA{/} ${fmtEta(p.etaMs)}   {${T.muted}-fg}${speedTxt}{/}`)
        return rows.join('\n')
    }
    const WMS_STATUS_LABEL = {
        standby:            { text: '待機',         col: 'success' },
        idle:               { text: '空閒',         col: 'muted'   },
        fetching:           { text: '查詢訂單',     col: 'accent'  },
        executing:          { text: '執行訂單',     col: 'warning' },
        updating_barrels:   { text: '更新桶子',     col: 'accent'  },
        querying:           { text: '查詢庫存',     col: 'accent'  },
        withdrawing:        { text: '出貨',         col: 'warning' },
        depositing:         { text: '入庫',         col: 'warning' },
        depositing_picking: { text: '入庫(揀貨區)', col: 'warning' },
        sorting:            { text: '整理拒收',     col: 'accent'  },
        stopped:            { text: '已停止',       col: 'muted'   },
    }
    const WMS_OPTYPE_LABEL = {
        deposit:     '入庫',
        withdraw:    '出貨',
        unpacking:   '拆箱',
        packing:     '裝箱',
        fix:         '修復',
        buy_at_shop: '商店購買',
        transfer:    '搬運',
    }
    function renderWarehouseDetail(detail) {
        const p = detail.payload || {}
        const lbl = WMS_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[lbl.col] || T.subtext
        const wsCol = p.warehouseStatus === 'running' ? T.success
                    : isMissing(p.warehouseStatus)    ? T.muted
                    :                                    T.error
        const headLine = `  {${T.primary}-fg}{bold}WMS{/bold}{/} {${T.muted}-fg}${val(p.mode) || '-'}{/}  {${stColRaw}-fg}${lbl.text}{/}`
        const wsLineBase = `  {${T.subtext}-fg}倉庫{/} {${wsCol}-fg}${val(p.warehouseStatus)}{/}`

        const order = p.currentOrder
        if (order) {
            const optTxt = WMS_OPTYPE_LABEL[order.optype] || order.optype || '-'

            // Transfer 訂單 — 顯示兩個 warp / 兩個分流 / 剩餘次數 / 累積金額。
            if (order.optype === 'transfer') {
                const live = p.transferLive || {}
                const tInit = order.transfer || {}
                const buyWarp  = live.buyWarp  || tInit.buyWarp  || '-'
                const sellWarp = live.sellWarp || tInit.sellWarp || '-'
                const buyServerTxt  = live.buyServer  != null ? `s${live.buyServer}`  : `{${T.muted}-fg}s?{/}`
                const sellServerTxt = live.sellServer != null ? `s${live.sellServer}` : `{${T.muted}-fg}s?{/}`
                const count = (live.count != null) ? live.count : (tInit.count != null ? tInit.count : null)
                const remaining = live.remaining
                const remainTxt = (count === -1)
                    ? `{${T.success}-fg}∞{/}`
                    : (remaining != null ? `${remaining}` : (count != null ? `${count}` : '-'))
                const sideTxt = live.side === 'buy'  ? `{${T.warning}-fg}搬運-購買中{/}`
                              : live.side === 'sell' ? `{${T.success}-fg}搬運-出售中{/}`
                              :                        `{${T.muted}-fg}搬運-{/}`
                const reward = live.totalReward != null ? live.totalReward : 0
                const cost   = live.totalCost   != null ? live.totalCost   : 0
                const income = live.totalIncome != null ? live.totalIncome : 0
                const profit = income - cost
                const profitCol = profit >= 0 ? T.success : T.error
                const buyTrips  = live.buyTrips  ?? 0
                const sellTrips = live.sellTrips ?? 0
                const buyQty    = live.buyQty    ?? 0
                const sellQty   = live.sellQty   ?? 0
                const totalTrips = buyTrips + sellTrips
                const buySellTxt = `  {${T.warning}-fg}買{/} {${T.text}-fg}${buyTrips}趟/${buyQty}個{/}  {${T.success}-fg}賣{/} {${T.text}-fg}${sellTrips}趟/${sellQty}個{/}`
                return [
                    headLine,
                    `${wsLineBase}   ${sideTxt}`,
                    `  {${T.subtext}-fg}訂單{/} ${val(order.id)}`,
                    `  {${T.subtext}-fg}買{/} ${buyServerTxt} {${T.text}-fg}${buyWarp}{/}`,
                    `  {${T.subtext}-fg}賣{/} ${sellServerTxt} {${T.text}-fg}${sellWarp}{/}`,
                    `  {${T.subtext}-fg}剩餘{/} ${remainTxt}   {${T.muted}-fg}共${totalTrips}趟{/}`,
                    buySellTxt,
                    `  {${T.subtext}-fg}拉霸{/} {${T.success}-fg}${reward}{/}   {${T.subtext}-fg}搬運收益{/} {${profitCol}-fg}${profit}{/}`,
                    `  {${T.subtext}-fg}支出{/} ${cost}   {${T.subtext}-fg}收入{/} ${income}`,
                ].join('\n')
            }

            const itemTxt = order.firstItem
                ? `${order.firstItem.item} x${order.firstItem.quantity}` + (order.itemCount > 1 ? ` (+${order.itemCount - 1})` : '')
                : '-'
            const orderLines = [
                headLine,
                wsLineBase,
                `  {${T.subtext}-fg}訂單{/} ${val(order.id)}`,
                `  {${T.subtext}-fg}類型{/} {${T.muted}-fg}${optTxt}{/}   {${T.subtext}-fg}揀貨區{/} ${val(order.pickingArea)}`,
                `  {${T.subtext}-fg}物品{/} ${itemTxt}`,
                `  {${T.subtext}-fg}總量{/} ${val(order.totalQty)}`,
            ]
            if (p.acceptRemaining != null) {
                const remCol = p.acceptRemaining === 0 ? T.success : T.warning
                orderLines.push(`  {${T.subtext}-fg}待處理箱{/} {${remCol}-fg}${p.acceptRemaining}{/} {${T.muted}-fg}/ ${p.acceptTotal}{/}`)
            }
            return orderLines.join('\n')
        }

        // Single-op modes (update / query / withdraw / deposit / sort / dp)
        const lines = [headLine, wsLineBase]
        if (p.barrelRange) {
            lines.push(`  {${T.subtext}-fg}桶子{/} #${val(p.barrelRange.start)} ~ #${val(p.barrelRange.end)}`)
        } else if (p.currentItem) {
            lines.push(`  {${T.subtext}-fg}物品{/} ${val(p.currentItem.name)} x${val(p.currentItem.quantity)}`)
        } else if (!isMissing(p.queryItem)) {
            lines.push(`  {${T.subtext}-fg}查詢{/} ${p.queryItem}` + (isMissing(p.queryResult) ? '' : `   {${T.success}-fg}${p.queryResult}{/}`))
        } else if (!isMissing(p.pickingAreaId)) {
            lines.push(`  {${T.subtext}-fg}揀貨區{/} ${p.pickingAreaId}`)
        }
        if (p.acceptRemaining != null) {
            const remCol = p.acceptRemaining === 0 ? T.success : T.warning
            lines.push(`  {${T.subtext}-fg}待處理箱{/} {${remCol}-fg}${p.acceptRemaining}{/} {${T.muted}-fg}/ ${p.acceptTotal}{/}`)
        }
        return lines.join('\n')
    }
    function renderClearAreaDetail(detail) {
        if (detail.mode === 'tnt2') return renderClearAreaTnt2Detail(detail)
        if (detail.mode === 'dig') return renderClearAreaDigDetail(detail)
        const p = detail.payload || {}
        const layer = p.layer || {}
        const overall = p.overall || {}
        const lbl = CA_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[lbl.col] || T.subtext
        const layerPct = (layer.total ? Math.round(layer.done / layer.total * 1000) / 10 : 0)
        const yRange = (!isMissing(p.layerYTop) && !isMissing(p.layerYBottom))
            ? `${p.layerYTop}~${p.layerYBottom}` : '-'
        const areaY = (p.area && !isMissing(p.area.p1?.y) && !isMissing(p.area.p2?.y))
            ? `  {${T.muted}-fg}(全 ${p.area.p1.y}~${p.area.p2.y}){/}` : ''
        // collect 模式：●●●○ 視覺
        const COLLECT_LEVELS = { low: 1, medium: 2, high: 3, max: 4 }
        const COLLECT_COLS   = { low: T.muted, medium: T.warning, high: T.success, max: T.primary }
        const cEnable = !!p.collectEnable
        const cFreq   = p.collectFreq || 'off'
        const cN      = cEnable ? (COLLECT_LEVELS[cFreq] || 0) : 0
        const cCol    = cEnable ? (COLLECT_COLS[cFreq] || T.muted) : T.muted
        const cDots   = `{${cCol}-fg}${'●'.repeat(cN)}{/}{${T.muted}-fg}${'○'.repeat(4 - cN)}{/}`
        const cLabel  = cEnable ? cFreq : '關閉'
        // 優先顯示「TNT 間隔」(實測);沒樣本時退回 avg child
        const placeMs = (p.avgPlaceMs > 0) ? p.avgPlaceMs : p.avgChildMs
        const placeLabel = (p.avgPlaceMs > 0)
            ? `TNT 間隔 ${fmtEta(placeMs)} (n=${val(p.tntSamples)})`
            : `avg ${fmtEta(placeMs)}/cell`
        return [
            `  {${T.primary}-fg}{bold}ClearArea{/bold}{/} {${T.muted}-fg}TNT{/}  {${stColRaw}-fg}${lbl.text}{/}`,
            `  {${T.subtext}-fg}層 Y{/} ${yRange}${areaY}`,
            `  {${T.subtext}-fg}bit{/} ${val(p.currentBit)}   {${T.subtext}-fg}本 bit{/} ${val(p.currentBitDone)}/${val(p.currentBitTotal)} cells`,
            `  {${T.subtext}-fg}該層{/} ${val(layer.done)}/${val(layer.total)} (${layerPct}%)  {${T.muted}-fg}~${fmtEta(layer.etaMs)}{/}`,
            `  {${T.subtext}-fg}整體{/} ${val(overall.layersDone)}/${val(overall.totalLayers)} 層 ${val(overall.percent)}%  {${T.muted}-fg}~${fmtEta(overall.etaMs)}{/}`,
            `  {${T.subtext}-fg}剩餘 TNT{/} ${val(p.tntsRemaining)} 發  {${T.muted}-fg}${placeLabel}{/}`,
            `  {${T.subtext}-fg}採集{/} ${cDots}  {${T.muted}-fg}${cLabel}{/}`,
            `  {${T.subtext}-fg}場地{/} {${T.subtext}-fg}s{/}${val(p.area && p.area.server)} ${val(p.area && p.area.warp)}`,
        ].join('\n')
    }
    function renderClearAreaTnt2Detail(detail) {
        const p = detail.payload || {}
        const overall = p.overall || {}
        const sc = p.statusCount || {}
        const grid = p.grid || {}
        const lbl = CA_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[lbl.col] || T.subtext
        const yRange = (!isMissing(p.yMax) && !isMissing(p.yMin))
            ? `${p.yMax}~${p.yMin}` : '-'
        const yBounds = (!isMissing(p.yTop) && !isMissing(p.yBot))
            ? ` {${T.muted}-fg}(頂 ${p.yTop} 底 ${p.yBot}){/}` : ''
        const childrenLine = `${val(p.finishedChildren)}/${val(p.totalChildren)} 完成` +
            (!isMissing(p.inProgressChildren) ? `   {${T.subtext}-fg}進行{/} ${p.inProgressChildren}` : '')
        const breakdown = [
            sc.scan     ? `{${T.muted}-fg}掃{/} ${sc.scan}` : null,
            sc.tnt      ? `{${T.warning}-fg}TNT{/} ${sc.tnt}` : null,
            sc.liquid   ? `{${T.accent}-fg}液{/} ${sc.liquid}` : null,
            sc.obsidian ? `{${T.secondary}-fg}黑{/} ${sc.obsidian}` : null,
            sc.cooling  ? `{${T.muted}-fg}冷{/} ${sc.cooling}` : null,
        ].filter(Boolean).join('  ')
        const gridStr = (!isMissing(grid.x_size) && !isMissing(grid.z_size))
            ? `${grid.x_size}x${grid.z_size} (${grid.length} cells)` : '-'
        // 優先顯示「TNT 間隔」(實測);沒樣本時退回 avg child
        const placeMs = (p.avgPlaceMs > 0) ? p.avgPlaceMs : p.avgChildMs
        const placeLabel = (p.avgPlaceMs > 0)
            ? `TNT 間隔 ${fmtEta(placeMs)} (n=${val(p.tntSamples)})`
            : `avg ${fmtEta(placeMs)}/層`
        return [
            `  {${T.primary}-fg}{bold}ClearArea{/bold}{/} {${T.muted}-fg}TNT2 獨立Y{/}  {${stColRaw}-fg}${lbl.text}{/}`,
            `  {${T.subtext}-fg}進度{/} ${val(overall.percent)}%  {${T.muted}-fg}~${fmtEta(overall.etaMs)}{/}`,
            `  {${T.subtext}-fg}子區{/} ${childrenLine}   {${T.subtext}-fg}剩餘 TNT{/} ${val(p.tntsRemaining)} 發`,
            `  {${T.subtext}-fg}Y 範圍{/} ${yRange}${yBounds}`,
            breakdown ? `  {${T.subtext}-fg}狀態{/} ${breakdown}` : null,
            `  {${T.subtext}-fg}網格{/} ${gridStr}  {${T.muted}-fg}${placeLabel}{/}`,
            `  {${T.subtext}-fg}場地{/} {${T.subtext}-fg}s{/}${val(p.area && p.area.server)} ${val(p.area && p.area.warp)}`,
        ].filter(Boolean).join('\n')
    }
    function renderClearAreaDigDetail(detail) {
        const p = detail.payload || {}
        const overall = p.overall || {}
        const children = p.children || {}
        const cell = p.cell || {}
        const grid = p.grid || {}
        const cci = p.currentChildIndex || {}
        const ccp = p.currentChildPos
        const lbl = CA_STATUS_LABEL[detail.status] || { text: detail.status, col: 'subtext' }
        const stColRaw = T[lbl.col] || T.subtext
        const childrenLine = `${val(children.done)}/${val(children.total)} 完成` +
            (!isMissing(children.failed) && children.failed > 0 ? `   {${T.error}-fg}失敗{/} ${children.failed}` : '') +
            (!isMissing(children.remaining) ? `   {${T.subtext}-fg}剩餘{/} ${children.remaining}` : '')
        const childIdx = (!isMissing(cci.x) && !isMissing(cci.z)) ? `(${cci.x},${cci.z})` : '-'
        const childPos = ccp ? ` {${T.muted}-fg}@ ${ccp.x},${ccp.y},${ccp.z}{/}` : ''
        const breakdown = [
            cell.scan   ? `{${T.muted}-fg}掃{/} ${cell.scan}` : null,
            cell.dig    ? `{${T.warning}-fg}挖{/} ${cell.dig}` : null,
            cell.liquid ? `{${T.accent}-fg}液{/} ${cell.liquid}` : null,
            cell.done   ? `{${T.success}-fg}完{/} ${cell.done}` : null,
        ].filter(Boolean).join('  ')
        const gridStr = (!isMissing(grid.x_size) && !isMissing(grid.z_size))
            ? `${grid.x_size}x${grid.z_size} (${grid.length} 子區)` : '-'
        const digMs = p.avgDigMs > 0 ? p.avgDigMs : 0
        const digLabel = digMs > 0
            ? `cell 間隔 ${fmtEta(digMs)} (n=${val(p.digSamples)})`
            : `avg ${fmtEta(p.avgChildMs)}/子區`
        const sb = p.supportblock
        const bsb = p.borderSupportBlock
        const sbLine = (!isMissing(sb) || !isMissing(bsb))
            ? `  {${T.subtext}-fg}封堵{/} {${T.muted}-fg}內{/} ${val(sb)}` +
              (bsb && bsb !== sb ? `  {${T.muted}-fg}外{/} ${val(bsb)}` : '')
            : null
        return [
            `  {${T.primary}-fg}{bold}ClearArea{/bold}{/} {${T.muted}-fg}挖掘{/}  {${stColRaw}-fg}${lbl.text}{/}`,
            `  {${T.subtext}-fg}進度{/} ${val(overall.percent)}%  {${T.muted}-fg}~${fmtEta(overall.etaMs)}{/}`,
            `  {${T.subtext}-fg}子區{/} ${childrenLine}`,
            `  {${T.subtext}-fg}當前{/} ${childIdx}${childPos}`,
            breakdown ? `  {${T.subtext}-fg}cell{/} ${breakdown}` : null,
            `  {${T.subtext}-fg}已挖{/} ${val(p.cellsDug)} 格  {${T.muted}-fg}${digLabel}{/}`,
            `  {${T.subtext}-fg}網格{/} ${gridStr}`,
            sbLine,
            `  {${T.subtext}-fg}場地{/} {${T.subtext}-fg}s{/}${val(p.area && p.area.server)} ${val(p.area && p.area.warp)}`,
        ].filter(Boolean).join('\n')
    }
    // WMS 分工單元的來源行:取代 clear/build detail 的第一行(標題行)。
    // 形如:  [12m0s] WMS single   [3m0s] ClearArea
    const WMS_SOURCE_OP_LABEL = { cleararea: 'ClearArea', mapart: 'Mapart', litematic: 'Build' }
    function fmtWmsSourceLine(detail) {
        const src = detail.source || {}
        const upWms = src.wmsStartedAt ? fmtEta(Date.now() - src.wmsStartedAt) : '-'
        const upOp  = src.opStartedAt  ? fmtEta(Date.now() - src.opStartedAt)  : '-'
        const modeLbl = src.mode || '-'
        const opLbl = WMS_SOURCE_OP_LABEL[detail.type] || detail.type || '-'
        return `  {${T.accent}-fg}[${upWms}]{/} {${T.primary}-fg}{bold}WMS ${modeLbl}{/bold}{/}   {${T.accent}-fg}[${upOp}]{/} {${T.subtext}-fg}${opLbl}{/}`
    }

module.exports = {
  renderAutoQuestDetail, renderClearAreaDetail, renderVillagerDetail,
  renderWarehouseDetail, renderBuildLikeDetail, fmtWmsSourceLine,
}
