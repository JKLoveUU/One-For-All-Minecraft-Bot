// MC-WMS facade. State + navigation + inventory + barrel maintenance live here;
// heavy subsystems (HTTP / orders / picking area / shulker) are imported.
//
// Public API is preserved: every method previously on `wms.*` is still reachable
// (cfg, warehouse_info, standby, getOrder, executeOrder, depositInventory, …).

const { Vec3 } = require('vec3');
const { sleep } = require('../common');
const pathfinder = require('../pathfinder');
const containerOperation = require('../containerOperation');
const mcFallout = require('../mcFallout');
const { getBarrelAbsolutePos, getStandPos, inventoryToBarrelInfo } = require('./barrel');

const api     = require('./api');
const shulker = require('./shulker');
const picking = require('./picking');
const orders  = require('./orders');
const afk     = require('./afk');

const wms = {
    // ── State ────────────────────────────────────────────────────────────────
    cfg: {
        ip: 'localhost',
        port: '8080',
        token: 'token',
        warp: 'JKLoveJK_6',
        // wms debug 用:預設要打開的 barrel 座標
        debug_barrel: { x: -3521, y: 3, z: -3521 },
        // afk slot 掛機時的 viewDistance(省流量);claim 成功時套用、release 時還原。
        // 數字(chunk 數,例 1)或字串('tiny'|'short'|'normal'|'far')。設 0 或 null 則不調整(維持登入預設 far=12)。
        afk_view_distance: 1,
        // ── 綠寶石出入金(server /pay)──
        // 玩家用伺服器經濟 /pay <bot> 付款,bot 解析收款訊息回報 WMS 入帳;未綁定者自動退款。
        // 出金則由玩家私訊 bot「出金 <數量>」,WMS 扣款後 bot /pay 付出綠寶石。
        // 注意:「哪些帳號擔任出納」由 WMS config.toml 的 api.cashierStaff 設定,經 warehousegetinfo 下發(見 isCashier)。
        deposit_enabled: true,
        // 收款訊息解析:group1=付款者、group2=金額(可含千分位逗號)。
        // 預設對應 mcfallout:「[系統] 您收到了 JKeqing 轉帳的 20,000,000 綠寶石 (目前擁有 ...)」
        deposit_regex: '您收到了\\s+(\\S+)\\s+轉帳的\\s+([\\d,]+)\\s+綠寶石',
    },
    standby: false,
    warehouse_info: {},
    bot_name: '',        // Set by consumers (e.g. src/warehouse.js init) — must match config.storage.staff.
    lastGlist: Date.now(),
    glistCD: 60_000,
    // 目前正在執行的 work order;關機/重載時要主動退回後端(disconnect),否則後端會卡住
    // 直到 watchdog 逾時才重派。由 src/warehouse.js 在領單/收單時 set/clear。
    activeOrder: null,

    // ── Logger injection ─────────────────────────────────────────────────────
    // Default logger is plain stdout; consumers override via setLogger(bot.logger).
    log: (_file, level, name, ...args) => {
        console.log(`[${level || 'INFO'}][${name || 'WMS'}]`, ...args);
    },
    setLogger(fn) {
        if (typeof fn !== 'function') return;
        this.log = fn;
        api.setLogger(fn);
        afk.setLogger(fn);
    },

    // ── Connection / permission gating ───────────────────────────────────────
    // 只有「連上且具權限」(getWarehouseInfo 回 status==='running')時,bot 才註冊到 WMS
    // (進 standby 領單)並真的去 getOrder。連線失敗會背景持續重試;token 無效(無權限)直接停。
    connected: false,    // 最近一次 getWarehouseInfo 是否 running
    _reconnecting: false, // 背景重連迴圈是否在跑(避免重複啟動)

    // canServe:是否已連上且有權限。沒授權 / 沒連上時不註冊、不領單。
    canServe() { return this.warehouse_info && this.warehouse_info.status === 'running'; },

    // isCashier:此 bot 帳號是否為出納(負責綠寶石出入金)。名單由 WMS 經 warehousegetinfo 下發
    // (warehouse_info.cashier_staff,來源是 WMS config.toml 的 api.cashierStaff)。空 / 未下發 = 不限。
    isCashier(botName) {
        const list = this.warehouse_info && this.warehouse_info.cashier_staff;
        if (!Array.isArray(list) || list.length === 0) return true;
        return list.includes(botName);
    },

    // connect:做一次連線嘗試並依結果決定後續。
    //   running       → connected=true,完成。
    //   invalid-token → 無權限,直接停止、不重試(需換有效 token 重啟)。
    //   error-connect → 連不上 WMS,啟動背景退避重連直到連上(或變 invalid-token)。
    // 回傳當前是否 canServe()。init 時 await 一次(背景迴圈為 fire-and-forget,不卡啟動)。
    async connect() {
        await this.getWarehouseInfo(this.cfg);
        const st = this.warehouse_info?.status;
        if (st === 'running') {
            this.connected = true;
            this.log(true, 'INFO', 'WMS', '已連線且具權限,全物品加載成功');
            return true;
        }
        this.connected = false;
        if (st === 'invalid-token') {
            this.log(true, 'WARN', 'WMS', 'token 無效 / 無權限,停止重試(不註冊、不領單)。請更換有效 token 後重啟。');
            return false;
        }
        this.startReconnectLoop();
        return false;
    },

    // startReconnectLoop:背景退避重連(3s→最多 60s)。只在 error-connect 類失敗時跑;
    // 連上(running)或確認無權限(invalid-token)即停。可重複呼叫,已在跑則略過。
    startReconnectLoop() {
        if (this._reconnecting) return;
        this._reconnecting = true;
        let delay = 3_000;
        const maxDelay = 60_000;
        const loop = async () => {
            while (true) {
                await sleep(delay);
                await this.getWarehouseInfo(this.cfg);
                const st = this.warehouse_info?.status;
                if (st === 'running') {
                    this.connected = true;
                    this._reconnecting = false;
                    this.log(true, 'INFO', 'WMS', 'WMS 重連成功,已啟用');
                    return;
                }
                if (st === 'invalid-token') {
                    this.connected = false;
                    this._reconnecting = false;
                    this.log(true, 'WARN', 'WMS', 'token 無效 / 無權限,停止重試。');
                    return;
                }
                delay = Math.min(delay * 2, maxDelay);
                this.log(false, 'WARN', 'WMS', `WMS 連線失敗,${Math.round(delay / 1000)}s 後重試…`);
            }
        };
        loop().catch(() => { this._reconnecting = false; });
    },

    // ── AFK 租約協調(子模組,呼叫 wms.afk.claim(bot) / wms.afk.release(bot) 等)──
    afk: {
        setOptions: afk.setOptions,
        claim:      (bot) => afk.claim(bot, wms.cfg),
        renew:      (bot) => afk.renew(bot, wms.cfg),
        release:    (bot) => afk.release(bot, wms.cfg),
        status:     (bot) => afk.status(bot, wms.cfg),
        isActive:   afk.isActive,
        getCurrent: afk.getCurrent,
    },

    // ── Navigation ───────────────────────────────────────────────────────────
    async gotoWarehouse(bot) {
        if (bot.botinfo.server !== parseInt(this.warehouse_info.server)) {
            await mcFallout.promiseTeleportServer(bot, this.warehouse_info.server, 30_000);
            await sleep(2000);
        }
        const botpos = bot.entity.position;
        const p1 = new Vec3(this.warehouse_info.position.x, this.warehouse_info.position.y, this.warehouse_info.position.z);
        const p2 = new Vec3(
            this.warehouse_info.position.x + this.warehouse_info.size.x,
            this.warehouse_info.position.y,
            this.warehouse_info.position.z + this.warehouse_info.size.z,
        );
        if (botpos.distanceTo(p1) < 100 || botpos.distanceTo(p2) < 100) return;
        if (
            botpos.x < p1.x || botpos.x > p2.x ||
            botpos.z < p1.z || botpos.z > p2.z ||
            botpos.distanceTo(p1) > 300 || botpos.distanceTo(p2) > 300
        ) {
            // 用 mcFallout.warp 取代裸 bot.chat,內部會等 warp 完成 + 偵測 cooldown / 失敗。
            // 重試一次的舊行為由 mcFallout 內建處理,不需手動再打第二次。
            await mcFallout.warp(bot, this.cfg.warp);
        }
    },
    async gotoOrigin(bot) {
        const origin = new Vec3(
            this.warehouse_info.position.x,
            this.warehouse_info.position.y + this.warehouse_info.size.aisle + this.warehouse_info.size.bottom + this.warehouse_info.size.top,
            this.warehouse_info.position.z,
        );
        await pathfinder.astarfly(bot, origin, null, null, null, true);
    },

    // ── Barrel maintenance ───────────────────────────────────────────────────
    async upbyPos(bot, barrelPos) {
        let inventory = null;
        for (let j = 0; j < 3; j++) {
            await sleep(50);
            inventory = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000);
            if (inventory) break;
        }
        const info = inventoryToBarrelInfo(bot, inventory);
        if (!info) return null;
        info.x = barrelPos.x;
        info.y = barrelPos.y;
        info.z = barrelPos.z;
        if (info.barreltype === 'normal' || info.barreltype === 'empty' || info.barreltype === 'full_shulker') {
            info.requiretype = 'update';
            await this.updateBarrel(this.cfg, info);
        } else if (info.barreltype === 'error') {
            info.requiretype = 'update';
            this.log(false, 'INFO', 'WMS', `error barrel: ${JSON.stringify(info)}`);
            await this.updateBarrel(this.cfg, info);
        }
        return info;
    },
    async updateBarrels(bot, start, end) {
        await this.gotoWarehouse(bot);
        for (let i = start; i <= end; i++) {
            const barrelPos = getBarrelAbsolutePos(i, this.warehouse_info);
            const standPos  = getStandPos(i, this.warehouse_info);

            let inventory = null;
            for (let j = 0; j < 3; j++) {
                await pathfinder.astarfly(bot, standPos, null, null, null, true);
                await sleep(50);
                inventory = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000);
                await sleep(150);
                if (inventory) break;
            }
            const info = inventoryToBarrelInfo(bot, inventory);
            if (!info) continue;
            info.x = barrelPos.x; info.y = barrelPos.y; info.z = barrelPos.z;

            if (info.barreltype === 'normal' || info.barreltype === 'empty' || info.barreltype === 'full_shulker') {
                info.requiretype = 'update';
                await this.updateBarrel(this.cfg, info);
            } else if (info.barreltype === 'error') {
                info.requiretype = 'update';
                this.log(false, 'INFO', 'WMS', `error barrel: ${JSON.stringify(info)}`);
                await this.updateBarrel(this.cfg, info);
            }
        }
    },

    // ── HTTP wrappers (all call api.* underneath) ────────────────────────────
    async updateBarrel(cfg, barrelInfo) {
        const content = Array.isArray(barrelInfo) ? [...barrelInfo] : [barrelInfo];
        try {
            return await api.warehouse(cfg, content);
        } catch (_) { /* already logged inside api.js */ }
    },
    async getWarehouseInfo(cfg) {
        try {
            const data = await api.warehouseInfo(cfg);
            if (data && Array.isArray(data.pickingArea)) {
                // 防呆:後端 PA 形狀升級後座標可能不再是裸 {x,y,z}。toVec 容忍多種形狀:
                //   {x,y,z} / {X,Y,Z}(Go) / [x,y,z] / 巢狀 {pos|position|chest|block|location:{...}}。
                const num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(v) ? Number(v) : undefined));
                const toVec = (p) => {
                    if (!p) return null;
                    if (Array.isArray(p) && p.length >= 3) return new Vec3(num(p[0]), num(p[1]), num(p[2]));
                    const x = num(p.x ?? p.X), y = num(p.y ?? p.Y), z = num(p.z ?? p.Z);
                    if (x !== undefined && y !== undefined && z !== undefined) return new Vec3(x, y, z);
                    const inner = p.pos ?? p.position ?? p.Pos ?? p.Position ?? p.chest ?? p.block ?? p.location;
                    return inner ? toVec(inner) : null;
                };
                const toVecList = (arr) => Array.isArray(arr) ? arr.map(toVec).filter(Boolean) : [];
                // 診斷:若 accepts 有原始資料卻一個都轉不出來,印出第一筆原始元素以便對齊欄位。
                const first = data.pickingArea[0];
                if (first && Array.isArray(first.accepts) && first.accepts.length > 0 && toVecList(first.accepts).length === 0) {
                    this.log(true, 'WARN', 'WMS', `pickingArea.accepts 座標形狀無法解析,原始首筆 = ${JSON.stringify(first.accepts[0])}`);
                }
                data.pickingArea = data.pickingArea.map(area => ({
                    id: area.id,
                    acceptStand: toVec(area.acceptStand ?? area.pos),
                    accepts:     toVecList(area.accepts),
                    rejectStand: toVec(area.rejectStand),
                    rejects:     toVecList(area.rejects),
                    // 遠程 PA 到達資訊(全部 optional;後端沒給就 undefined,arriveAtPickingArea 會視為同倉庫區)
                    warp:            area.warp,
                    server:          area.server,
                    dimension:       area.dimension,
                    arrival_command: area.arrival_command,
                    // 占用資訊(欄位名以後端為準,先寬鬆透傳供 `wms pa` 顯示)
                    occupied_by:     area.occupied_by,
                    occupant:        area.occupant,
                    lease:           area.lease,
                }));
            }
            this.warehouse_info = data;
            return data;
        } catch (err) {
            // 之前是 catch(_) 靜默吞掉,導致「請求成功但解析/映射拋錯」也被當成連線失敗。
            // 現在記錄真正原因(network / 401 / 403 / 形狀解析皆會落這),方便排查。
            // token 失效(401/403):WMS 不啟用,status 設為 'invalid-token',getGlist / getOrderPendingCount 會據此直接 ret。
            const authErr = err && (err.status === 401 || err.status === 403);
            if (authErr) {
                this.log(true, 'WARN', 'WMS', `getWarehouseInfo token 無效 (${err.status}),WMS 不啟用`);
            } else {
                this.log(true, 'ERROR', 'WMS', `getWarehouseInfo 失敗 (${err.name}): ${err.message}`);
            }
            const fallback = {
                position: { x: -3520, y: 0, z: -3520 },
                size:     { x: 128, y: 15, z: 128 },
                status:   authErr ? 'invalid-token' : 'error-connect',
                warp:     'JKLoveJK_6',
                pickingArea: [],
            };
            return fallback;
        }
    },
    async queryQuantity(cfg, itemName) {
        try {
            const data = await api.warehouse(cfg, [{ id: itemName, requiretype: 'query_quantity' }]);
            const qty = data?.operations?.[0]?.quantity;
            this.log(false, 'INFO', 'WMS', `查詢庫存 ${itemName} ${qty}`);
            return qty;
        } catch (_) { return 0; }
    },
    async getDeposit(cfg, dinfo) {
        const content = Array.isArray(dinfo) ? [...dinfo] : [dinfo];
        try {
            const data = await api.warehouse(cfg, content);
            return data?.operations ?? [];
        } catch (_) { return []; }
    },
    async commit(cfg, id) {
        try {
            const data = await api.warehouse(cfg, [{ id, requiretype: 'commit' }]);
            return data?.operations;
        } catch (_) { return 0; }
    },
    async rollback(cfg, id) {
        try {
            const data = await api.warehouse(cfg, [{ id, requiretype: 'rollback' }]);
            return data?.operations;
        } catch (_) { return 0; }
    },
    async prepare(bot, itemName, quantity) {
        this.log(true, 'INFO', bot.username, `[倉儲] 請求準備物品 ${itemName} ${quantity}`);
        try {
            const data = await api.warehouse(this.cfg, [{
                id: itemName, requiretype: 'prepare', quantity, barrelType: 'normal',
            }]);
            return data?.operations;
        } catch (_) { return 0; }
    },

    // ── Order API ───────────────────────────────────────────────────────────
    async getOrder(type = 'get', id = '') {
        // 有權限才真的去領單 / 查 pending(沒連上或無權限時不打 WMS)。
        // finish / fail / progress / disconnect 仍放行(收尾回報,best-effort)。
        if ((type === 'get' || type === 'pendingcount') && !this.canServe()) return {};
        try {
            const data = await api.order(this.cfg, {
                bot_name: this.bot_name || '',
                type,
                order_id: id,
            });
            if (data && data.reassign_count > 0) {
                this.log(false, 'INFO', 'WMS', `訂單 ${data.order_id} 重新分配次數: ${data.reassign_count}`);
            }
            return data;
        } catch (err) {
            // 401/403 means the token is not going to recover by retrying — stop the loop so
            // ops can cut a new token without us hammering the server (spec §4).
            if (err && (err.status === 401 || err.status === 403)) {
                // this.log(true, 'ERROR', 'WMS', `訂單輪詢停止: ${err.message}`);
                this.standby = false;
            }
            return {};
        }
    },
    // Worker 進度回報(spec §3「新增 progress」)。best-effort:WMS 沒實作此 type 或
    // 連線失敗都不應影響正在進行的建造/清理,因此吞掉所有錯誤回 false。
    async reportProgress(orderId, payload) {
        try {
            const data = await api.order(this.cfg, {
                bot_name: this.bot_name || '',
                type: 'progress',
                order_id: orderId,
                ...payload,
            });
            return data;
        } catch (_) {
            return false;
        }
    },
    // 回報單元失敗。reason='no_permission'(領地無建造權等)→ WMS 直接標 error 不重派;
    // transfer 缺貨 reason='source_empty'/'dest_full' → WMS 冷卻該牌 + 訂單標記完成;
    // 其餘 reason → WMS 比照斷線自動重新分配。extra 可夾帶搬運統計(transfer_moved/cost/income)。
    // best-effort,吞錯回 false。
    async reportFail(orderId, reason, extra = {}) {
        try {
            return await api.order(this.cfg, {
                bot_name: this.bot_name || '',
                type: 'fail',
                order_id: orderId,
                reason,
                ...extra,
            });
        } catch (_) {
            return false;
        }
    },
    // 回報訂單完成,extra 可夾帶搬運統計(transfer_moved/cost/income),WMS 存進歷史。
    // 等同 getOrder('finish') 但允許帶 payload。best-effort。
    async reportFinish(orderId, extra = {}) {
        try {
            const data = await api.order(this.cfg, {
                bot_name: this.bot_name || '',
                type: 'finish',
                order_id: orderId,
                ...extra,
            });
            if (data && data.reassign_count > 0) {
                this.log(false, 'INFO', 'WMS', `訂單 ${data.order_id} 重新分配次數: ${data.reassign_count}`);
            }
            return data;
        } catch (_) {
            return false;
        }
    },
    // 標記/清除目前在執行的 order(供關機退回用)。
    setActiveOrder(order) { this.activeOrder = order || null; },
    // 退回目前 order 給後端。冪等:先清 activeOrder 再送 disconnect,所以即使 bot 'end'
    // handler 與關機路徑同時呼叫也只會真正退回一次。失敗吞掉(關機中,盡力而為)。
    async releaseActiveOrder() {
        const order = this.activeOrder;
        if (!order || !order.order_id) return;
        this.activeOrder = null;
        try {
            this.log(true, 'WARN', 'WMS', `關機/重載 退回訂單 ${order.order_id}`);
            await this.getOrder('disconnect', order.order_id);
        } catch (_) { /* 盡力而為 */ }
    },
    async getOrderPendingCount() {
        // 與 getGlist 一致:倉庫未啟用(token 失效 / 連線失敗等,status !== 'running')就直接 ret,不打 WMS。
        if (this.warehouse_info.status !== 'running') return 0;
        try {
            const order = await this.getOrder('pendingcount');
            return order.pendingcount || 0;
        } catch (err) {
            this.log(true, 'ERROR', 'WMS', `pendingcount 失敗: ${err.message}`);
            return 0;
        }
    },

    // ── Operation-info helpers ──────────────────────────────────────────────
    toOperationInfo(item, quantity, barrelType, requiretype = 'deposit') {
        if (barrelType !== 'normal' && barrelType !== 'full_shulker') {
            this.log(true, 'WARN', 'WMS', `不支援的類型: ${barrelType}`);
            return;
        }
        return { id: item, requiretype, quantity, barrelType };
    },
    toDepositInfo(item, quantity, barrelType)  { return this.toOperationInfo(item, quantity, barrelType, 'deposit'); },
    toWithdrawInfo(item, quantity, barrelType) { return this.toOperationInfo(item, quantity, barrelType, 'withdraw'); },

    // ── Inventory ops ───────────────────────────────────────────────────────
    // 回傳 { ok, moved, reason, steps }。steps 為本次執行的逐步流程描述,
    // 不再在這裡逐筆 log(成功/失敗皆然);完整流程改由 executeOpCommit 結束後以 tree 一次輸出。
    async executeOperation(bot, operation) {
        const steps = [];
        try {
            await this.gotoWarehouse(bot);
            await containerOperation.closeWindow(bot);

            const standPos  = new Vec3(operation.stand.x,  operation.stand.y,  operation.stand.z);
            const barrelPos = new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z);

            let barrel = null;
            for (let j = 0; j < 3; j++) {
                await pathfinder.astarfly(bot, standPos, null, null, null, true);
                await sleep(50);
                barrel = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000);
                await sleep(150);
                if (barrel) break;
            }
            if (!barrel) {
                steps.push('✗ 無法開啟桶子');
                return { ok: false, reason: 'open_failed', moved: 0, steps };
            }

            let rs;
            if (operation.type === 'deposit') {
                rs = await containerOperation.wms_deposit(bot, barrel, operation.item, operation.quantity, operation.extra_info);
            } else if (operation.type === 'withdraw') {
                rs = await containerOperation.wms_withdraw(bot, barrel, operation.item, operation.quantity, operation.extra_info);
            } else {
                steps.push(`✗ 不支援的 operation.type: ${operation.type}`);
                return { ok: false, reason: 'unsupported_type', moved: 0, steps };
            }

            if (rs && Array.isArray(rs.steps)) steps.push(...rs.steps);

            // 結構化結果:只有 ok 且實際搬動量等於 operation.quantity 才算成功。
            // rollback / 更新桶子 / 重新申請 一律交給 executeOpCommit 處理,本函式只負責執行與回報。
            if (!rs || !rs.ok || rs.moved !== operation.quantity) {
                return { ok: false, reason: rs?.reason || 'mismatch', moved: rs?.moved ?? 0, steps };
            }
            return { ok: true, moved: rs.moved, steps };
        } catch (err) {
            steps.push(`✗ executeOperation 例外 ${err.name}: ${err.message}`);
            return { ok: false, reason: `exception:${err.name}`, moved: 0, steps };
        }
    },

    // 由失敗的 operation 重建「重新申請」用的 winfo (同 item/數量/桶型/方向)。
    opToWinfo(op) {
        const bt = (op.extra_info === 'full_shulker') ? 'full_shulker' : 'normal';
        if (op.type === 'withdraw') return this.toWithdrawInfo(op.item, op.quantity, bt);
        if (op.type === 'deposit')  return this.toDepositInfo(op.item, op.quantity, bt);
        return null;
    },

    // 執行單筆 operation 並負責 commit/rollback。
    // 失敗的處理(= 一次 retry):rollback → 更新桶子真實狀態(upbyPos)→ 直接向 WMS 申請新的 op → 再試。
    // 最高 5 次;因為每次失敗都先 upbyPos 修正桶況,重新申請可能換到別的桶。
    // 背包滿了 (inventory_full) 不重試(重試也收不下)。成功回 true。
    async executeOpCommit(bot, operation) {
        const MAX_RETRY = 5;
        let ops = [operation];
        const trace = [];   // 收集每次嘗試的流程,結束後以 tree 一次輸出完整流程
        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
            const failed = [];
            let bagFull = false;
            let noRetryNote = '';
            for (const op of ops) {
                const node = { attempt, op, ok: false, steps: [] };
                const r = await this.executeOperation(bot, op);
                node.steps.push(...(r.steps || []));
                if (r && r.ok) {
                    await this.commit(this.cfg, op.id);
                    node.ok = true;
                    node.steps.push('commit');
                } else {
                    // 失敗:rollback + 更新桶子真實狀態(下一輪重新申請才能避開這個桶)
                    await this.rollback(this.cfg, op.id);
                    node.steps.push(`rollback (${r?.reason || 'mismatch'})`);
                    const info = await this.upbyPos(bot, new Vec3(op.barrel.x, op.barrel.y, op.barrel.z));
                    node.steps.push(info
                        ? `upbyPos 更新桶況 → ${info.barreltype}${info.id ? ` ${info.id}` : ''}${info.quantity != null ? ` ×${info.quantity}` : ''}`
                        : 'upbyPos 失敗(無法解析桶況)');
                    // inventory_full(背包滿)/ inventory_short(來源缺料):重試/重新申請都無濟於事,直接放棄。
                    if (r && (r.reason === 'inventory_full' || r.reason === 'inventory_short')) {
                        bagFull = true;
                        noRetryNote = r.reason === 'inventory_full' ? '背包已滿,不重試' : '背包缺料(來源不足),不重試';
                    }
                    failed.push(op);
                }
                trace.push(node);
            }
            if (failed.length === 0) { this.logOpFlowTree(operation, trace, true); return true; }
            if (bagFull) {
                this.logOpFlowTree(operation, trace, false, noRetryNote || '不重試');
                return false;
            }
            if (attempt >= MAX_RETRY) {
                this.logOpFlowTree(operation, trace, false, `重試 ${MAX_RETRY} 次仍失敗,放棄`);
                return false;
            }
            // 重新申請失敗 op 的同等需求
            const fresh = [];
            for (const op of failed) {
                const winfo = this.opToWinfo(op);
                const got = winfo ? await this.getDeposit(this.cfg, winfo) : [];
                if (got && got.length) fresh.push(...got);
            }
            if (fresh.length === 0) {
                this.logOpFlowTree(operation, trace, false, '重新申請 op 無可用結果,放棄');
                return false;
            }
            ops = fresh;
        }
        this.logOpFlowTree(operation, trace, false, '未知終止');
        return false;
    },

    // 把一筆 operation 的完整執行流程(多次 attempt × 每次子步驟)以 tree 形式一次輸出。
    // 成功走 INFO 不寫檔,失敗走 WARN 寫檔,取代過去散落各處的單行 log。
    logOpFlowTree(operation, trace, ok, note) {
        const lines = [];
        lines.push(
            `operation ${operation.type} ${operation.item} ×${operation.quantity}` +
            ` [${ok ? '成功' : '失敗'}${note ? `:${note}` : ''}]`);
        trace.forEach((node, i) => {
            const last = i === trace.length - 1;
            const branch = last ? '└─' : '├─';
            const indent = last ? '   ' : '│  ';
            const b = node.op.barrel;
            lines.push(`${branch} 第 ${node.attempt} 次 @(${b.x},${b.y},${b.z}) ${node.ok ? '✓' : '✗'}`);
            node.steps.forEach((s, j) => {
                const sLast = j === node.steps.length - 1;
                lines.push(`${indent}${sLast ? '└─' : '├─'} ${s}`);
            });
        });
        this.log(!ok, ok ? 'INFO' : 'WARN', 'WMS', '\n' + lines.join('\n'));
    },

    async depositInventory(bot) {
        await containerOperation.closeWindow(bot);
        const itemCountMap = new Map();

        // Tally deposit-able normal items across the bot's full inventory.
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i];
            if (!item) continue;
            if (containerOperation.getSignature(item) === bot.username) continue;
            const p = containerOperation.parseItem(item, bot);
            if (shulker.canDepositNormal(p)) {
                itemCountMap.set(p.item, (itemCountMap.get(p.item) || 0) + p.count);
            }
        }

        if (itemCountMap.size > 0) {
            this.log(false, 'INFO', bot.username, '本次存儲物品統計:');
            for (const [itemName, count] of itemCountMap) {
                this.log(false, 'INFO', bot.username, `${itemName}: ${count} 個`);
                const results = await this.getDeposit(this.cfg, {
                    id: itemName, quantity: count, barreltype: 'normal', requiretype: 'deposit',
                });
                for (const result of results) {
                    await this.executeOpCommit(bot, result);
                }
            }
        }

        // Second pass: anything left over from splits.
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i];
            if (!item) continue;
            if (containerOperation.getSignature(item)) continue;
            const p = containerOperation.parseItem(item, bot);
            if (!shulker.canDepositNormal(p)) continue;

            const results = await this.getDeposit(this.cfg, {
                id: p.item, quantity: p.count, barreltype: 'normal', requiretype: 'deposit',
            });
            for (const result of results) {
                await this.executeOpCommit(bot, result);
            }
        }

        // Full-shulker pass.
        const shulkerCountMap = new Map();
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i];
            if (!item) continue;
            const p = containerOperation.parseItem(item, bot);
            if (!shulker.canDepositFullShulker(p)) continue;
            shulkerCountMap.set(p.item, (shulkerCountMap.get(p.item) || 0) + 1);
        }
        for (const [itemName, count] of shulkerCountMap) {
            const results = await this.getDeposit(this.cfg, {
                id: itemName, quantity: count, barreltype: 'full_shulker', requiretype: 'deposit',
            });
            for (const result of results) {
                await this.executeOpCommit(bot, result);
            }
        }

        await containerOperation.closeWindow(bot);

        // Unpack anything left and recurse so the contents get stored too.
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i];
            if (!item) continue;
            const p = containerOperation.parseItem(item, bot);
            if (shulker.canUnpackShulker(p)) {
                await this.unpackShulker(bot, i);
                await this.depositInventory(bot);
            }
        }
        await this.gotoOrigin(bot);
    },

    // ── Validators (re-exported from shulker for callers using wms.xxx) ─────
    canDepositFullShulker: shulker.canDepositFullShulker,
    canUnpackShulker:      shulker.canUnpackShulker,
    canDepositNormal:      shulker.canDepositNormal,

    // ── Shulker ops ─────────────────────────────────────────────────────────
    unpackShulker(bot, slot) { return shulker.unpackShulker(this, bot, slot); },
    packShulker(bot, tg)     { return shulker.packShulker(this, bot, tg); },

    // ── Picking area ops ────────────────────────────────────────────────────
    depositPickingArea(bot, id, onProgress) { return picking.depositPickingArea(this, bot, id, onProgress); },
    withdrawPickingArea(bot, id, tgs)    { return picking.withdrawPickingArea(this, bot, id, tgs); },
    arriveAtPickingArea(bot, pa)         { return picking.arriveAtPickingArea(this, bot, pa); },

    // ── Order orchestration ─────────────────────────────────────────────────
    executeOrder(bot, order, onProgress)  { return orders.executeOrder(this, bot, order, onProgress); },
    unpackingorder(bot, tgs)              { return orders.unpackingOrder(this, bot, tgs); },
    packingorder(bot, tgs)                { return orders.packingOrder(this, bot, tgs); },
    fixorder(bot, contents)               { return orders.fixOrder(this, bot, contents); },
    buyAtShop(bot, order)                 { return orders.buyAtShop(this, bot, order); },
    orderTransfer(bot, order, onProgress) { return orders.orderTransfer(this, bot, order, onProgress); },

    // ── Link + /glist relay ─────────────────────────────────────────────────
    // 回報一筆綠寶石入金(server /pay)。不吞錯:呼叫端(intake)需區分三種結果——
    //   正常回應 {ok:true}  → 已入帳;
    //   正常回應 {ok:false} → 未綁定,呼叫端應退款;
    //   throw                → 連線/系統錯誤,呼叫端應保留金額並通知(勿亂退,避免重複入帳)。
    async reportDeposit(mcName, mcUUID, amount, ref) {
        return await api.walletDeposit(this.cfg, { mc_name: mcName, mc_uuid: mcUUID || '', amount, ref });
    },
    // 代玩家出金(錢包提領)。不吞錯:呼叫端需區分 ok:true(已扣款,應 /pay)、
    // ok:false(not_linked / insufficient)、throw(系統錯誤,勿付款)。
    async reportWithdraw(mcName, mcUUID, amount, ref) {
        return await api.walletWithdraw(this.cfg, { mc_name: mcName, mc_uuid: mcUUID || '', amount, ref });
    },
    async linkUser(cfg, username, verify) {
        this.log(true, 'INFO', 'WMS', `綁定帳號 ${username} / ${verify}`);
        try {
            const data = await api.link(cfg, username, verify);
            return data?.result === true || data?.result === 'ok' || data?.result === 'true';
        } catch (_) {
            return false;
        }
    },
    async getGlist(bot, cfg) {
        if (this.warehouse_info.status !== 'running') return;
        if (Date.now() - this.lastGlist < this.glistCD) return;
        this.lastGlist = Date.now();

        const result = {};
        const glistReg = /\[\w+\] \(\d+\): ([\s\w(,)*])*/g;
        const glistEnd = /Total players online: (\d+)/g;
        let waitMSG = true;

        const onMsg = (jsonMsg) => {
            const msg = jsonMsg.toString();
            const crtServer = msg.split(']')[0].substr(1);
            if (msg.match(glistReg)) {
                const m2 = msg.replace(/\s+/g, '');
                const users = m2.split(':')[1].split(',');
                result[crtServer] = users;
            }
            if (msg.match(glistEnd)) {
                bot.off('message', onMsg);
                clearTimeout(stopTimer);
                waitMSG = false;
            }
        };

        bot.on('message', onMsg);
        bot.chat('/glist');
        const stopTimer = setTimeout(() => {
            try { bot.off('message', onMsg); } catch (_) {}
            this.log(false, 'INFO', 'WMS', 'glist timeout');
            waitMSG = false;
        }, 3000);

        while (waitMSG) await sleep(50);
        if (Object.keys(result).length === 0) return;

        try {
            await api.mcfallout(cfg, { datatype: 'glist', data: result });
        } catch (_) { /* already logged */ }
    },
};

module.exports = wms;
