const { sleep } = require('../lib/common')
const { initModule, taskreply } = require('../lib/commandModule')
const wms = require('../lib/wms/wms')
const { createDepositIntake } = require('../lib/wms/intake')
const Status = require('./modules/botstatus');
const containerOperation = require('../lib/containerOperation');
const { Vec3 } = require('vec3');
const pathfinder = require('../lib/pathfinder');
const barrel = require('../lib/wms/barrel');
let logger, mcData, bot_id, bot

// 把 task.detail 寫成 warehouse 結構;payload 走 spread merge,只覆蓋有傳的欄位。
function setWmsDetail(task, status, payload = {}) {
    if (!task) return;
    const prev = task.detail || {};
    const prevPayload = prev.payload || {};
    task.detail = {
        type: 'warehouse',
        state: status === 'paused'  ? 'paused'
             : status === 'stopped' ? 'stopped'
             : status === 'idle'    ? 'idle'
             : 'running',
        status,
        updatedAt: Date.now(),
        payload: { ...prevPayload, ...payload },
    };
}

// 從 executeOrder 的回傳值萃取搬運統計,組成 finish 的 payload。
// 只有 transfer 訂單會帶 stats;其餘訂單回傳沒有 stats → 回空物件,finish 行為不變。
function transferStatsExtra(execRes) {
    const s = execRes && execRes.stats;
    if (!s) return {};
    return {
        transfer_moved: s.sellQty || 0,
        transfer_cost: s.totalCost || 0,
        transfer_income: s.totalIncome || 0,
    };
}

// 建立給 wms.executeOrder 的 onProgress。
//  - 一般訂單(deposit/withdraw/...):payload 直接 merge 進 WMS detail(type:'warehouse')。
//  - 分工單元(build/clear):worker 會把整張子 detail(type:litematic/mapart/cleararea)透傳上來,
//    這裡直接把它設成 task.detail,並掛上 WMS 來源資訊(整體運行時間 + 本單元運行時間),
//    讓 TUI 渲染出 clear/build 自己的細節,第一行則改顯示來源與時間。
//  source: { mode: 'single' | 'running', wmsStartedAt }
function makeOnProgress(task, source) {
    return (payload) => {
        if (payload && payload.subDetail) {
            task.detail = {
                ...payload.subDetail,
                source: {
                    name: 'WMS',
                    mode: source.mode,
                    wmsStartedAt: source.wmsStartedAt,   // 整段 WMS 任務起算(running 模式跨多單仍連續)
                    opStartedAt: payload.opStartedAt,    // 本 clear/build 單元起算
                },
            };
        } else {
            // 子 detail 尚未產生(剛開工)或非分工單元 → 照常寫 WMS detail。
            setWmsDetail(task, 'executing', payload);
        }
    };
}

const warehouse = {
    identifier: [
        "wms",
    ],
    cmd: [
        {
            name: "wms update",
            identifier: [
                "update",
                "u"
            ],
            execute: update,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms query",
            identifier: [
                "query",
                "q"
            ],
            execute: query,
            vaild: true,
            longRunning: false,
        },
        {
            name: "wms withdraw",
            identifier: [
                "withdraw",
                "w"
            ],
            execute: withdraw,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms order",
            identifier: [
                "order",
                "o"
            ],
            execute: order,
            vaild: true,
        },
        {
            name: "wms deposit",
            identifier: [
                "deposit",
                "d"
            ],
            execute: deposit,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms sort",
            identifier: [
                "sort",
                "s"
            ],
            execute: sort,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms deposit pickingarea",
            identifier: [
                "dp",
            ],
            execute: depositPickingArea,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms pa (列出揀貨區 / 占用者)",
            identifier: [
                "pa",
            ],
            execute: listPickingArea,
            vaild: true,
            longRunning: false,
        },
        {
            name: "wms clean <id> (清場揀貨區)",
            identifier: [
                "clean",
            ],
            execute: cleanPickingArea,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms test",
            identifier: [
                "test",
                "t"
            ],
            execute: test,
            vaild: true,
            longRunning: false,
        },
        {
            name: "wms debug (open a barrel and dump parseItem + 預期處理)",
            identifier: [
                "debug",
            ],
            execute: debug,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms run",
            identifier: [
                "run",
                "r"
            ],
            execute: run,
            vaild: true,
            longRunning: true,
        },
        {
            name: "wms stop",
            identifier: [
                "stop",
                "s"
            ],
            execute: stop,
            vaild: true,
            longRunning: false,
        }
    ],
    async init(ctx) {
        const result = await initModule(ctx, [
            { key: 'cfg', filename: 'warehouse.json', scope: 'global', default: wms.cfg }
        ]);
        logger = result.logger;
        mcData = result.mcData;
        bot_id = result.bot_id;
        bot = result.bot;
        wms.cfg = result.configs.cfg;
        // bot_name is the key used by /api/v1/order to match config.storage.staff (wmsapi.md §2.1).
        wms.bot_name = bot.username;
        wms.setLogger(logger);
        // 連線 + 權限檢查:running 才註冊;連不上 → 背景持續重試;invalid-token → 直接停。
        // await 第一次嘗試(不卡啟動:error-connect 時 connect 內部改背景重連立即返回)。
        await wms.connect();
        // 綠寶石入金監聽(server /pay):僅在 deposit_enabled 且此帳號是出納時掛載,避免每隻 bot 都處理。
        // 出納名單由 WMS 經 warehousegetinfo 下發(wms.isCashier,來源 WMS config.toml api.cashierStaff)。
        // 連線/出納狀態另由監聽內 canServe()+isCashier 動態把關(WMS 重連、名單變動後也正確)。
        if (wms.cfg.deposit_enabled !== false && wms.isCashier(bot.username)) {
            createDepositIntake(wms, bot, logger);
        }
    },
    async link(username, verify) {
        return await wms.linkUser(wms.cfg, username, verify)
    }
}
async function order(task) {
    const wmsStartedAt = Date.now()
    // 有權限才領單:沒連上 / 無權限時不打 WMS,並嘗試(背景)重連(invalid-token 不會重試)。
    if (!wms.canServe()) {
        logger(true, 'WARN', bot_id, `WMS 未啟用(${wms.warehouse_info?.status || 'unknown'}),無法領單`)
        setWmsDetail(task, 'idle', { currentOrder: null, warehouseStatus: wms.warehouse_info?.status })
        wms.connect()
        return
    }
    setWmsDetail(task, 'fetching', { warehouseStatus: wms.warehouse_info?.status, mode: 'single' })
    const order = await wms.getOrder('get')
    if (!order || !order.order_id || order.order_id === 'Default-001') {
        logger(false, 'INFO', bot_id, '目前沒有可領取的訂單')
        setWmsDetail(task, 'idle', { currentOrder: null })
        return
    }
    logger(false, 'INFO', bot_id, `領取訂單 ${order.order_id} optype=${order.optype}`)
    setWmsDetail(task, 'executing', { currentOrder: summarizeOrder(order), transferLive: null })

    wms.setActiveOrder(order)
    const endHandler = async () => await disconnectHandler(order)
    bot.once('end', endHandler)

    const onProgress = makeOnProgress(task, { mode: 'single', wmsStartedAt })
    const execRes = await wms.executeOrder(bot, order, onProgress)
    // transfer 缺貨已自行回報 reportFail(後端標記完成)→ 不再送 finish,避免重覆回報。
    // 一般完成 → 帶搬運統計送 finish(非 transfer 訂單 statsExtra 為空,行為不變)。
    if (!execRes || !execRes.reported) await wms.reportFinish(order.order_id, transferStatsExtra(execRes))
    wms.setActiveOrder(null)

    bot.off('end', endHandler)
    setWmsDetail(task, 'idle', { currentOrder: null, transferLive: null })
}
async function disconnectHandler(order) {
    logger(true, 'WARN', bot_id, `斷線 取消訂單 ${order.order_id}`)
    // 經 releaseActiveOrder 退回(冪等);避免與關機路徑重複 disconnect。
    await wms.releaseActiveOrder()
}
async function stop(task) {
    wms.standby = false
}
async function run(task) {
    let lastglist = Date.now();
    const wmsStartedAt = Date.now()   // 整段 standby 起算;running 模式接連多單時來源行時間持續累計
    wms.standby = true
    // 還沒連上 / 無權限就進 standby:啟動(背景)重連,連上後迴圈內 getOrderPendingCount 會自動開始領單。
    // invalid-token 不會重連,迴圈會空轉(等於不註冊),不會狂打 WMS。
    if (!wms.canServe()) {
        logger(true, 'WARN', bot_id, `WMS 未啟用(${wms.warehouse_info?.status || 'unknown'}),standby 等待連線/授權`)
        wms.connect()
    }
    process.send({ type: 'setStatus', value: Status.WAREHOUSE_STANDBY })
    setWmsDetail(task, 'standby', {
        mode: 'standby',
        warehouseStatus: wms.warehouse_info?.status,
        pendingOrders: 0,
        currentOrder: null,
    })
    try {
        while (wms.standby) {
            if (Date.now() - lastglist > 30_000) {
                lastglist = Date.now();
                wms.getGlist(bot, wms.cfg)
            }
            const pending = await wms.getOrderPendingCount()
            setWmsDetail(task, wms.standby ? (pending > 0 ? 'standby' : 'standby') : 'stopped',
                { pendingOrders: pending, warehouseStatus: wms.warehouse_info?.status })
            if (pending > 0) {
                const order = await wms.getOrder('get')
                if (!order || !order.order_id || order.order_id === 'Default-001') {
                    await sleep(1000)
                    continue
                }
                logger(false, 'INFO', bot_id, `領取訂單 ${order.order_id} optype=${order.optype}`)
                setWmsDetail(task, 'executing', { currentOrder: summarizeOrder(order), transferLive: null })

                wms.setActiveOrder(order)
                const endHandler = async () => await disconnectHandler(order)
                bot.once('end', endHandler)

                const onProgress = makeOnProgress(task, { mode: 'running', wmsStartedAt })
                const execRes = await wms.executeOrder(bot, order, onProgress)
                // transfer 缺貨已自行回報 reportFail(後端標記完成)→ 不再送 finish,避免重覆回報。
                // 一般完成 → 帶搬運統計送 finish(非 transfer 訂單 statsExtra 為空,行為不變)。
                if (!execRes || !execRes.reported) await wms.reportFinish(order.order_id, transferStatsExtra(execRes))
                wms.setActiveOrder(null)

                bot.off('end', endHandler)
                setWmsDetail(task, 'standby', { currentOrder: null, transferLive: null })
            }
            await sleep(1000)
        }
    } finally {
        setWmsDetail(task, 'stopped', { currentOrder: null })
    }
}

// 把 order 的關鍵欄位壓成 plain object,避免循環/Vec3 之類序列化問題
function summarizeOrder(order) {
    if (!order) return null;
    const c = Array.isArray(order.content) ? order.content : [];
    const result = {
        id:           order.order_id,
        optype:       order.optype,
        pickingArea:  order.picking_area ?? null,
        itemCount:    c.length,
        firstItem:    c[0] ? { item: c[0].item, quantity: c[0].quantity, type: c[0].type } : null,
        totalQty:     c.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    };
    if (order.optype === 'transfer' && order.extra_info) {
        const ex = order.extra_info;
        result.transfer = {
            buyWarp:  ex.transfer_from || null,
            sellWarp: ex.transfer_to   || null,
            count:    typeof ex.transfer_quantity === 'number' ? ex.transfer_quantity : null,
        };
    }
    if (order.optype === 'update_barrels' && order.extra_info) {
        result.barrelRange = {
            start: order.extra_info.start ?? null,
            end:   order.extra_info.end   ?? null,
        };
    }
    return result;
}
async function update(task) {
    if (task.content.length < 4) {
        taskreply(bot, task,
            '請輸入起始座標和結束座標',
            '請輸入起始座標和結束座標',
            '請輸入起始座標和結束座標')
        return
    }
    const start = parseInt(task.content[2])
    const end   = parseInt(task.content[3])
    setWmsDetail(task, 'updating_barrels', { mode: 'single', barrelRange: { start, end }, warehouseStatus: wms.warehouse_info?.status })
    await wms.updateBarrels(bot, start, end)
    setWmsDetail(task, 'idle')
}
async function test(task) {
    logger(false, 'INFO', bot_id, JSON.stringify(wms.warehouse_info))
    for (let i = bot.inventory.inventoryStart; i < bot.inventory.inventoryEnd; i++) {
        const item = bot.inventory.slots[i]
        if (!item) continue
        if (containerOperation.getSignature(item) === bot.username) continue
        const p = containerOperation.parseItem(item, bot)
        logger(false, 'INFO', bot_id, JSON.stringify(p))
    }
}

// 對單一 slot 的 parseItem 結果回傳 "預期處理方式" 一句話。
// 對齊 wms/barrel.js inventoryToBarrelInfo 與 wms/shulker.js 的分類邏輯。
function describeExpectedHandling(p, signature) {
    if (signature) return `跳過 (個人簽章=${signature})`
    if (p.notSameVersion) return `跨版本物品 (v=${p.crossVersion} name=${p.crossVersionName}),會被 barrel 視為 error`
    if (p.isShulkerBox) {
        if (p.sameItemInShulkerBox === null) return `空盒,merge 入 itemMap (count=${p.count})`
        if (!p.sameItemInShulkerBox) return `盒內混裝,allSameItem=false → barrel error`
        if (p.fullBox) return `滿盒同物 (${p.item}),計入 full_shulker (+1 shulker)`
        return `同物未滿盒 (${p.item} x${p.count}),allShulkerFull=false → barrel error`
    }
    if (p.haveNBT) return `散物有 NBT (${p.item}),someHaveNBT=true,通常 picking 區才處理`
    return `普通散物 (${p.item} x${p.count}),若整桶同 id 則 barrel normal`
}

async function debug(task) {
    const cfgPos = wms.cfg.debug_barrel || { x: -3521, y: 3, z: -3521 }
    const pos = new Vec3(cfgPos.x, cfgPos.y, cfgPos.z)
    const standPos = pos.offset(0, 1, 0)
    setWmsDetail(task, 'debug', { mode: 'single', target: { x: pos.x, y: pos.y, z: pos.z } })
    logger(true, 'INFO', bot_id, `[wms debug] target barrel = ${pos}`)

    await containerOperation.closeWindow(bot)
    try { await pathfinder.astarfly(bot, standPos, null, null, null, true) } catch (e) {
        logger(true, 'WARN', bot_id, `[wms debug] astarfly 失敗: ${e.message}`)
    }
    const win = await containerOperation.openContainerWithTimeout(bot, pos, 5000)
    if (!win) {
        logger(true, 'ERROR', bot_id, `[wms debug] 無法開啟 barrel @ ${pos}`)
        setWmsDetail(task, 'idle')
        return
    }

    logger(true, 'INFO', bot_id, `[wms debug] ====== barrel @${pos} dump begin ======`)
    let used = 0
    for (let i = 0; i < 27; i++) {
        const item = win.slots?.[i]
        if (!item) continue
        used++
        const p = containerOperation.parseItem(item, bot)
        const sig = containerOperation.getSignature(item)
        const verdict = describeExpectedHandling(p, sig)
        logger(true, 'INFO', bot_id, `[wms debug] slot=${String(i).padStart(2)} ${item.name} x${item.count}`)
        logger(false, 'INFO', bot_id, `[wms debug]   parseItem=${JSON.stringify({
            item: p.item, count: p.count, isShulkerBox: p.isShulkerBox,
            sameItemInShulkerBox: p.sameItemInShulkerBox, shulkerUsedSlot: p.shulkerUsedSlot,
            fullBox: p.fullBox, haveNBT: p.haveNBT, notSameVersion: p.notSameVersion,
            crossVersion: p.crossVersion, crossVersionName: p.crossVersionName,
        })}`)
        logger(true, 'INFO', bot_id, `[wms debug]   → ${verdict}`)
    }
    if (used === 0) logger(true, 'INFO', bot_id, `[wms debug] barrel 空`)

    // 用 barrel.js 的整桶分類器跑一次,得到 wms 對這桶的最終判定
    try {
        const verdict = barrel.inventoryToBarrelInfo(win, bot)
        logger(true, 'INFO', bot_id, `[wms debug] 整桶判定 = ${JSON.stringify(verdict)}`)
    } catch (e) {
        logger(true, 'ERROR', bot_id, `[wms debug] inventoryToBarrelInfo 失敗: ${e.message}`)
    }
    logger(true, 'INFO', bot_id, `[wms debug] ====== dump end ======`)

    await containerOperation.closeWindow(bot)
    setWmsDetail(task, 'idle')
}
async function query(task) {
    const itemName = task.content[2]
    if (itemName == undefined) {
        taskreply(bot, task, '請輸入物品名稱', '請輸入物品名稱', '請輸入物品名稱')
        return
    }
    setWmsDetail(task, 'querying', { mode: 'single', queryItem: itemName, warehouseStatus: wms.warehouse_info?.status })
    const result = await wms.queryQuantity(wms.cfg, itemName)
    logger(false, 'INFO', bot_id, `query result: ${itemName} ${result}`)
    setWmsDetail(task, 'idle', { queryResult: result })
}
async function depositPickingArea(task) {
    const pickingAreaId = wms.warehouse_info.pickingArea[0].id
    setWmsDetail(task, 'depositing_picking', { mode: 'single', pickingAreaId, warehouseStatus: wms.warehouse_info?.status })
    const onProgress = (payload) => setWmsDetail(task, 'depositing_picking', payload)
    await wms.depositPickingArea(bot, pickingAreaId, onProgress)
    setWmsDetail(task, 'idle')
}
async function listPickingArea(task) {
    // 重新抓一次倉儲設定,確保顯示的是最新 PA(也會觸發座標形狀診斷 log)。
    await wms.getWarehouseInfo(wms.cfg)
    let areas = wms.warehouse_info?.pickingArea || []
    if (areas.length === 0) {
        logger(false, 'INFO', bot_id, '目前沒有揀貨區 (pickingArea 為空)')
        return
    }
    // wms pa <id>：只顯示指定 PA
    const filterId = task.content[2]
    if (filterId) {
        areas = areas.filter(a => a.id === filterId)
        if (areas.length === 0) {
            logger(false, 'INFO', bot_id, `找不到 picking area ${filterId}`)
            return
        }
    }
    const fmt = (v) => v ? `${v.x},${v.y},${v.z}` : '—'
    const fmtList = (arr) => (Array.isArray(arr) && arr.length) ? arr.map(fmt).join(' | ') : '(空)'
    logger(false, 'INFO', bot_id, `===== 揀貨區 (共 ${areas.length}) =====`)
    for (const a of areas) {
        const occ = a.occupied_by || a.occupant || (a.lease && a.lease.holder) || '空閒'
        const loc = a.warp ? `遠程 warp=${a.warp}${a.server ? ` server=${a.server}` : ''}` : '同倉庫區'
        logger(false, 'INFO', bot_id, `PA ${a.id} | ${loc} | 占用: ${occ}`)
        if (a.dimension)        logger(false, 'INFO', bot_id, `  dimension: ${a.dimension}`)
        if (a.arrival_command)  logger(false, 'INFO', bot_id, `  arrival_command: ${a.arrival_command}`)
        logger(false, 'INFO', bot_id, `  acceptStand: ${fmt(a.acceptStand)}`)
        logger(false, 'INFO', bot_id, `  accepts(${(a.accepts || []).length}): ${fmtList(a.accepts)}`)
        logger(false, 'INFO', bot_id, `  rejectStand: ${fmt(a.rejectStand)}`)
        logger(false, 'INFO', bot_id, `  rejects(${(a.rejects || []).length}): ${fmtList(a.rejects)}`)
    }
}
async function cleanPickingArea(task) {
    // clean = 清空指定揀貨區(沿用 depositPickingArea);可帶 id,不帶則用第一個 PA。
    const pickingAreaId = task.content[2] || wms.warehouse_info.pickingArea[0]?.id
    if (!pickingAreaId) {
        taskreply(bot, task, '請輸入 picking area id', '請輸入 picking area id', '請輸入 picking area id')
        return
    }
    setWmsDetail(task, 'cleaning_picking', { mode: 'single', pickingAreaId, warehouseStatus: wms.warehouse_info?.status })
    const onProgress = (payload) => setWmsDetail(task, 'cleaning_picking', payload)
    await wms.depositPickingArea(bot, pickingAreaId, onProgress)
    setWmsDetail(task, 'idle')
}
async function sort(task) {
    setWmsDetail(task, 'sorting', { mode: 'single', warehouseStatus: wms.warehouse_info?.status })
    await wms.depositInventory(bot)
    const rejectPos = new Vec3(-3519, 5, -3547)
    await pathfinder.astarfly(bot, rejectPos)
    const inv = await containerOperation.openContainerWithTimeout(bot, rejectPos, 1000)
    if (!inv) { setWmsDetail(task, 'idle'); return }
    for (let i = inv.inventoryStart; i < inv.inventoryEnd; i++) {
        const item = inv.slots[i]
        if (!item) continue
        const lores = containerOperation.getLores(item)
        if (lores && containerOperation.getSignature(item) === bot.username) continue
        const emptySlot = inv.firstEmptyContainerSlot()
        if (emptySlot === null) continue
        await bot.simpleClick.leftMouse(i)
        await bot.simpleClick.leftMouse(emptySlot)
        await bot.simpleClick.leftMouse(i)
    }
    setWmsDetail(task, 'idle')
}
async function withdraw(task) {
    const pickingAreaId = wms.warehouse_info.pickingArea[0].id
    const itemName = task.content[2]
    const quantity = parseInt(task.content[3])
    setWmsDetail(task, 'withdrawing', { mode: 'single', currentItem: { name: itemName, quantity }, pickingAreaId, warehouseStatus: wms.warehouse_info?.status })
    await wms.withdrawPickingArea(bot, pickingAreaId, [{ itemName, quantity }])
    setWmsDetail(task, 'idle')
}
async function deposit(task) {
    const itemName = task.content[2]
    const quantity = parseInt(task.content[3])
    setWmsDetail(task, 'depositing', { mode: 'single', currentItem: { name: itemName, quantity }, warehouseStatus: wms.warehouse_info?.status })
    const dinfo = wms.toDepositInfo(itemName, quantity, 'normal')
    const operations = await wms.getDeposit(wms.cfg, dinfo)
    if (!operations || operations.length === 0) {
        logger(false, 'INFO', bot_id, `deposit: ${itemName} x${quantity} 沒有可用的 operation`)
        setWmsDetail(task, 'idle')
        return
    }
    for (const op of operations) {
        await wms.executeOpCommit(bot, op)
    }
    setWmsDetail(task, 'idle')
}
module.exports = warehouse
