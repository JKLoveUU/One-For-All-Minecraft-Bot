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
    },
    standby: false,
    warehouse_info: {},
    bot_name: '',        // Set by consumers (e.g. src/warehouse.js init) — must match config.storage.staff.
    lastGlist: Date.now(),
    glistCD: 60_000,

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
        if (!info) return false;
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
        return true;
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
            // 現在記錄真正原因(network / 401 / 403 / 形狀解析皆會落這),方便排查 error-connect。
            this.log(true, 'ERROR', 'WMS', `getWarehouseInfo 失敗 (${err.name}): ${err.message}`);
            const fallback = {
                position: { x: -3520, y: 0, z: -3520 },
                size:     { x: 128, y: 15, z: 128 },
                status:   'error-connect',
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
    async getOrderPendingCount() {
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
    async executeOperation(bot, operation) {
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
                this.log(true, 'WARN', 'WMS', `無法開啟桶子 ${barrelPos}`);
                return false;
            }

            let rs;
            if (operation.type === 'deposit') {
                rs = await containerOperation.wms_deposit(bot, barrel, operation.item, operation.quantity, operation.extra_info);
            } else if (operation.type === 'withdraw') {
                rs = await containerOperation.wms_withdraw(bot, barrel, operation.item, operation.quantity, operation.extra_info);
            } else {
                this.log(true, 'WARN', 'WMS', `不支援的 operation.type: ${operation.type}`);
                return false;
            }

            if (rs === false) {
                await this.rollback(this.cfg, operation.id);
                await this.upbyPos(bot, barrelPos);
                return false;
            }
            return rs;
        } catch (err) {
            await this.rollback(this.cfg, operation.id);
            await this.upbyPos(bot, new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z));
            this.log(true, 'ERROR', 'WMS', `executeOperation ${err.name}: ${err.message}`);
            return false;
        }
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
                    const ok = await this.executeOperation(bot, result);
                    if (ok) await this.commit(this.cfg, result.id);
                    else    await this.rollback(this.cfg, result.id);
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
                const ok = await this.executeOperation(bot, result);
                if (ok) await this.commit(this.cfg, result.id);
                else    await this.rollback(this.cfg, result.id);
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
                const ok = await this.executeOperation(bot, result);
                if (ok) await this.commit(this.cfg, result.id);
                else    await this.rollback(this.cfg, result.id);
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
