// Picking-area operations: deposit into / withdraw from the accept+reject chest pairs
// associated with a picking area in warehouse_info.pickingArea.

const { Vec3 } = require('vec3');
const { sleep } = require('../common');
const pathfinder = require('../pathfinder');
const containerOperation = require('../containerOperation');
const mcFallout = require('../mcFallout');
const shulker = require('./shulker');

// 判斷 acceptStand 是否落在倉庫範圍盒內(對齊 wms.gotoWarehouse 的盒子算法)。
function withinWarehouseBounds(wms, pos) {
    const info = wms.warehouse_info;
    if (!pos || !info || !info.position || !info.size) return false;
    const p1 = new Vec3(info.position.x, info.position.y, info.position.z);
    const p2 = new Vec3(info.position.x + info.size.x, info.position.y, info.position.z + info.size.z);
    if (pos.x >= p1.x && pos.x <= p2.x && pos.z >= p1.z && pos.z <= p2.z) return true;
    // 不在盒內但離盒角很近也算同區(與 gotoWarehouse 的 <100 判定一致)
    return pos.distanceTo(p1) < 100 || pos.distanceTo(p2) < 100;
}

// 判斷一個 PA 是否與倉庫同 warp(= 不需要 PA 專屬傳送)。
function isPaLocalToWarehouse(wms, pa) {
    const info = wms.warehouse_info || {};
    const sameServer = !pa.server || String(pa.server) === String(info.server);
    const whWarp = info.warp || wms.cfg.warp;
    const sameWarp = !pa.warp || pa.warp === whWarp;
    return sameServer && sameWarp && withinWarehouseBounds(wms, pa.acceptStand);
}

// arriveAtPickingArea:把 bot 帶到指定 PA 的 acceptStand。
// 目前主要 PA 都與倉庫同 warp,所以先按倉庫信息算距離,只有真正遠程才重新傳送。
async function arriveAtPickingArea(wms, bot, pa) {
    if (!pa) return;
    const dest = pa.acceptStand;

    // 1) 已在同分流且在 acceptStand 附近 → 直接 astarfly,不傳送。
    //    (座標是分流內相對座標,故需確認分流相符才能用距離判斷。)
    const sameServer = !pa.server || String(pa.server) === String(bot.botinfo.server);
    if (sameServer && dest && bot.entity && bot.entity.position.distanceTo(dest) < 16) {
        await pathfinder.astarfly(bot, dest, null, null, null, true);
        return;
    }

    // 2) 與倉庫同 warp → 走既有 gotoWarehouse(其內部「在盒內/夠近就不 warp」會避免多餘傳送)。
    if (isPaLocalToWarehouse(wms, pa)) {
        await wms.gotoWarehouse(bot);
        if (dest) await pathfinder.astarfly(bot, dest, null, null, null, true);
        return;
    }

    // 3) 真正遠程:切分流 → 到達指令 / warp → (檢查維度) → astarfly。
    if (pa.server && String(pa.server) !== String(bot.botinfo.server)) {
        await mcFallout.promiseTeleportServer(bot, pa.server, 30_000);
        await sleep(2000);
    }
    if (pa.arrival_command) {
        bot.chat(pa.arrival_command);
        await sleep(2500);
    } else if (pa.warp) {
        await mcFallout.warp(bot, pa.warp);
    }
    if (pa.dimension && bot.game && bot.game.dimension &&
        !String(bot.game.dimension).includes(pa.dimension)) {
        wms.log(true, 'WARN', 'WMS', `PA ${pa.id} 期望維度 ${pa.dimension},目前 ${bot.game.dimension}`);
    }
    if (dest) await pathfinder.astarfly(bot, dest, null, null, null, true);
}

async function depositPickingArea(wms, bot, pickingAreaId, onProgress) {
    const area = wms.warehouse_info.pickingArea.find(a => a.id === pickingAreaId);
    if (!area) {
        wms.log(true, 'WARN', 'WMS', `找不到 picking area ${pickingAreaId}`);
        return;
    }
    await arriveAtPickingArea(wms, bot, area);
    if (bot.inventory.slots[45]) await bot.unequip('off-hand');
    await mcFallout.openPreventSpecItem(bot);

    const { acceptStand, accepts, rejectStand, rejects } = area;

    let rejectIndex = 0;
    for (let acceptIndex = 0; acceptIndex < accepts.length; /* advanced inside */) {
        if (typeof onProgress === 'function') {
            onProgress({ acceptRemaining: accepts.length - acceptIndex, acceptTotal: accepts.length });
        }
        const accept = accepts[acceptIndex];
        await pathfinder.astarfly(bot, acceptStand, null, null, null, true);
        const inventory = await containerOperation.openContainerWithTimeout(bot, accept, 1000);
        await sleep(50);
        if (!inventory) continue;

        // Skip empty accept chests.
        let hasItems = false;
        for (let i = 0; i < inventory.inventoryStart; i++) {
            if (inventory.slots[i]) { hasItems = true; break; }
        }
        if (!hasItems) { acceptIndex++; continue; }

        // Drain the accept chest into the bot's inventory until it's full.
        for (let i = 0; i < inventory.inventoryStart; i++) {
            const item = inventory.slots[i];
            if (!item) continue;
            const p = containerOperation.parseItem(item, bot);
            const emptySlotCount = inventory.emptySlotCount();
            const emptySlot = inventory.firstEmptyInventorySlot();
            if (p.isShulkerBox && p.shulkerUsedSlot + 1 > emptySlotCount + 9) break;
            if (emptySlot === null) break;

            await bot.simpleClick.leftMouse(i);
            await bot.simpleClick.leftMouse(emptySlot);
        }

        // Move unwanted items into the reject chest chain.
        await pathfinder.astarfly(bot, rejectStand, null, null, null, true);
        rjchest: for (; rejectIndex < rejects.length; /* advanced inside */) {
            const reject = rejects[rejectIndex];
            const rejectInv = await containerOperation.openContainerWithTimeout(bot, reject, 1000);
            if (!rejectInv) continue;

            for (let i = rejectInv.inventoryStart; i < rejectInv.inventoryEnd; i++) {
                const item = rejectInv.slots[i];
                if (!item) continue;
                const p = containerOperation.parseItem(item, bot);
                if (shulker.canUnpackShulker(p) || shulker.canDepositNormal(p) || shulker.canDepositFullShulker(p)) continue;

                const signature = containerOperation.getSignature(item);
                if (signature && signature === bot.username) continue;
                if (!p.haveNBT) continue;

                const emptySlot = rejectInv.firstEmptyContainerSlot();
                if (emptySlot === null) {
                    rejectIndex++;
                    continue rjchest;
                }
                await bot.simpleClick.leftMouse(i);
                await bot.simpleClick.leftMouse(emptySlot);
            }
            break rjchest;
        }
        await containerOperation.closeWindow(bot);

        // Anything left that's a shulker gets unpacked before storing.
        for (let i = bot.inventory.inventoryStart; i < bot.inventory.inventoryEnd; i++) {
            const item = bot.inventory.slots[i];
            if (!item) continue;
            const p = containerOperation.parseItem(item, bot);
            if (shulker.canUnpackShulker(p)) {
                await shulker.unpackShulker(wms, bot, i);
            }
        }

        await wms.depositInventory(bot);

        // Re-arm for the next iteration. depositInventory 可能已切回倉庫端 / 移到 origin,
        // 遠程 PA 需先回到 PA(同倉庫 PA 時 arriveAtPickingArea 會判定為已在附近,不會多餘傳送)。
        await arriveAtPickingArea(wms, bot, area);
        await pathfinder.astarfly(bot, acceptStand, null, null, null, true);
        await containerOperation.openContainerWithTimeout(bot, accept, 1000);
    }
    await wms.depositInventory(bot);
    if (typeof onProgress === 'function') {
        onProgress({ acceptRemaining: 0, acceptTotal: accepts.length });
    }
    containerOperation.closeWindow(bot);
}

async function withdrawPickingArea(wms, bot, pickingAreaId = 'A00', tgs = []) {
    const area = wms.warehouse_info.pickingArea.find(a => a.id === pickingAreaId);
    if (!area) {
        wms.log(true, 'WARN', 'WMS', `找不到 picking area ${pickingAreaId}`);
        return;
    }
    await wms.gotoWarehouse(bot);
    if (bot.inventory.slots[45]) await bot.unequip('off-hand');
    await mcFallout.openPreventSpecItem(bot);

    const { acceptStand, accepts } = area;
    let acceptIndex = 0;

    for (const tg of tgs) {
        const winfo = wms.toWithdrawInfo(tg.itemName, tg.quantity, tg.type || 'normal');
        const operations = await wms.getDeposit(wms.cfg, winfo);
        if (!operations || operations.length === 0) continue;

        for (const operation of operations) {
            const success = await wms.executeOperation(bot, operation);
            if (success) await wms.commit(wms.cfg, operation.id);
            else         await wms.rollback(wms.cfg, operation.id);
            await containerOperation.closeWindow(bot);

            // Offload into the accept chest chain. executeOperation 走的是倉庫端,
            // 遠程 PA 需先回到 PA 才能存進 accept 箱(同倉庫 PA 不會多餘傳送)。
            await arriveAtPickingArea(wms, bot, area);
            acc: for (; acceptIndex < accepts.length; /* advanced inside */) {
                const accept = accepts[acceptIndex];
                await pathfinder.astarfly(bot, acceptStand, null, null, null, true);
                const acceptInv = await containerOperation.openContainerWithTimeout(bot, accept, 1000);
                await sleep(50);
                if (!acceptInv) continue;

                let needPutAccept = false;
                for (let i = acceptInv.inventoryStart; i < acceptInv.inventoryEnd; i++) {
                    const item = acceptInv.slots[i];
                    if (!item) continue;
                    if (containerOperation.getSignature(item) === bot.username) continue;
                    needPutAccept = true;
                    const emptySlot = acceptInv.firstEmptyContainerSlot();
                    if (emptySlot === null) {
                        acceptIndex++;
                        continue acc;
                    }
                    await bot.simpleClick.leftMouse(i);
                    await bot.simpleClick.leftMouse(emptySlot);
                }
                if (!needPutAccept) break acc;
            }
            await containerOperation.closeWindow(bot);
        }
    }
    return true;
}

module.exports = { depositPickingArea, withdrawPickingArea, arriveAtPickingArea };
