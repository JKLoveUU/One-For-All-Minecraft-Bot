// Picking-area operations: deposit into / withdraw from the accept+reject chest pairs
// associated with a picking area in warehouse_info.pickingArea.

const { sleep } = require('../common');
const pathfinder = require('../pathfinder');
const containerOperation = require('../containerOperation');
const mcFallout = require('../mcFallout');
const shulker = require('./shulker');

async function depositPickingArea(wms, bot, pickingAreaId) {
    await wms.gotoWarehouse(bot);
    if (bot.inventory.slots[45]) await bot.unequip('off-hand');
    await mcFallout.openPreventSpecItem(bot);

    const area = wms.warehouse_info.pickingArea.find(a => a.id === pickingAreaId);
    if (!area) {
        wms.log(true, 'WARN', 'WMS', `找不到 picking area ${pickingAreaId}`);
        return;
    }
    const { acceptStand, accepts, rejectStand, rejects } = area;

    let rejectIndex = 0;
    for (let acceptIndex = 0; acceptIndex < accepts.length; /* advanced inside */) {
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

        // Re-arm for the next iteration.
        await pathfinder.astarfly(bot, acceptStand, null, null, null, true);
        await containerOperation.openContainerWithTimeout(bot, accept, 1000);
    }
    await wms.depositInventory(bot);
    containerOperation.closeWindow(bot);
}

async function withdrawPickingArea(wms, bot, pickingAreaId = 'A00', tgs = []) {
    await wms.gotoWarehouse(bot);
    if (bot.inventory.slots[45]) await bot.unequip('off-hand');
    await mcFallout.openPreventSpecItem(bot);

    const area = wms.warehouse_info.pickingArea.find(a => a.id === pickingAreaId);
    if (!area) {
        wms.log(true, 'WARN', 'WMS', `找不到 picking area ${pickingAreaId}`);
        return;
    }
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

            // Offload into the accept chest chain.
            await pathfinder.astarfly(bot, acceptStand, null, null, null, true);
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

module.exports = { depositPickingArea, withdrawPickingArea };
