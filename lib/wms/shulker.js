// Shulker pack / unpack + item-kind validators.
// All functions receive the wms facade as the first argument so they can reach
// state (cfg, warehouse_info) and sibling operations (depositInventory, gotoOrigin).

const { Vec3 } = require('vec3');
const { sleep } = require('../common');
const pathfinder = require('../pathfinder');
const utils = require('../util');
const containerOperation = require('../containerOperation');

// ── Validators ──
function canDepositFullShulker(itemP) {
    return !!(itemP.isShulkerBox && itemP.sameItemInShulkerBox && itemP.fullBox);
}
function canUnpackShulker(itemP) {
    return !!(
        !canDepositFullShulker(itemP) &&
        itemP.isShulkerBox &&
        itemP.shulkerUsedSlot > 0 &&
        !itemP.hasCustomName &&
        !itemP.contentsHaveNBT
    );
}
function canDepositNormal(itemP) {
    return itemP.isShulkerBox === false && itemP.notSameVersion === false && itemP.haveNBT === false;
}

// ── Operations ──
async function unpackShulker(wms, bot, slot) {
    await containerOperation.closeWindow(bot);
    const targetSlot = bot.inventory.slots[slot];
    if (!targetSlot) return false;
    const pr = containerOperation.parseItem(targetSlot, bot);
    if (!pr.isShulkerBox) return false;

    const unpackPos = new Vec3(
        wms.warehouse_info.unpack.x,
        wms.warehouse_info.unpack.y,
        wms.warehouse_info.unpack.z,
    );

    let inv = null;
    outer: for (let attempt = 0; attempt < 27; attempt++) {
        place: for (let t = 0; t < 5; t++) {
            const pfr = await pathfinder.astarfly(bot, unpackPos.offset(0, 2, 0), null, null, null, true);
            await sleep(100);
            if (!pfr) {
                // 尋路失敗 bot 不在拆箱站附近 → 先回 origin 復位再重試,否則下面 blockAt 拿到 null
                const bp = bot.entity.position;
                wms.log(false, 'WARN', bot.username, `[unpack] 尋路到拆箱站失敗 @(${unpackPos.x},${unpackPos.y},${unpackPos.z}) bot=(${bp.x.toFixed(1)},${bp.y.toFixed(1)},${bp.z.toFixed(1)}) → gotoOrigin 復位重試`);
                await wms.gotoOrigin(bot);
                continue place;
            }
            await utils.equipShulker(bot, slot);
            await sleep(100);
            await utils.placeShulker(bot, unpackPos);
            await sleep(500);
            const bb = bot.blockAt(unpackPos);
            if (!bb) {
                // chunk 未載入 (bot 離拆箱站太遠/被傳走) → 復位重試,不能直接讀 .name
                const bp = bot.entity.position;
                wms.log(false, 'WARN', bot.username, `[unpack] 拆箱站 chunk 未載入 @(${unpackPos.x},${unpackPos.y},${unpackPos.z}) bot=(${bp.x.toFixed(1)},${bp.y.toFixed(1)},${bp.z.toFixed(1)}) → gotoOrigin 復位重試`);
                await wms.gotoOrigin(bot);
                continue place;
            }
            if (bb.name === 'air') continue place;
            if (bb.name.includes('shulker_box')) {
                inv = await containerOperation.openContainerWithTimeout(bot, unpackPos, 1000);
                await sleep(50);
                if (inv) break place;
            } else {
                await utils.digBlock(bot, unpackPos, 5000);
            }
        }
        if (!inv) return false;

        for (let i = 0; i < inv.inventoryStart; i++) {
            const item = inv.slots[i];
            if (!item) continue;
            const emptySlot = inv.firstEmptyInventorySlot();
            if (emptySlot === null) {
                await wms.depositInventory(bot);
                continue;
            }
            await bot.simpleClick.leftMouse(i);
            await bot.simpleClick.leftMouse(emptySlot);
        }
        const btn = bot.blockAt(unpackPos.offset(2, 1, 0));
        if (!btn) return false;
        await bot.activateBlock(btn);
        await sleep(3000);
        break outer;
    }

    await wms.depositInventory(bot);
    await wms.depositInventory(bot);
    await wms.gotoOrigin(bot);
}

async function packShulker(wms, bot, tg) {
    const mcData = require('minecraft-data')(bot.version);
    const tgID = mcData.itemsByName[tg.itemName].id;
    const packPos = new Vec3(
        wms.warehouse_info.pack.x,
        wms.warehouse_info.pack.y,
        wms.warehouse_info.pack.z,
    );

    loop: for (let t = 0; t < 8; t++) {
        await pathfinder.astarfly(bot, packPos.offset(1, 0, 0), null, null, null, true);
        await collectNearby(bot, packPos, 3);

        const block = bot.blockAt(packPos);
        if (!block) { t--; continue loop; }

        // No shulker in place yet — press the dispenser button to drop one.
        if (!block.name.includes('shulker_box')) {
            const btn = bot.blockAt(packPos.offset(0, -2, 0));
            if (!btn) continue loop;
            await bot.activateBlock(btn);
            await sleep(200);
            continue loop;
        }

        const inv = await containerOperation.openContainerWithTimeout(bot, packPos, 1000);
        await sleep(100);
        if (!inv) continue loop;

        const targetCount  = tg.stacksize * 27;
        const currentCount = inv.countRange(0, 27, tgID, null);
        if (targetCount - currentCount > 0) {
            await containerOperation.deposit(bot, inv, tg.itemName, targetCount - currentCount, true);
        } else if (currentCount === targetCount) {
            const btn = bot.blockAt(packPos.offset(0, 1, -1));
            if (!btn) continue loop;
            await bot.activateBlock(btn);
            await sleep(200);
            await collectNearby(bot, packPos, 3);
        }
    }
}

// Local helper for collecting dropped items near a position.
async function collectNearby(bot, center, radius) {
    const entities = bot.entities;
    for (const k in entities) {
        const e = entities[k];
        if (e?.name === 'item' && e?.onGround && center.distanceTo(e.position) <= radius) {
            await pathfinder.astarfly(
                bot,
                new Vec3(
                    Math.round(e.position.x - 0.5),
                    Math.round(e.position.y),
                    Math.round(e.position.z - 0.5),
                ),
                null, null, null, true,
            );
            await sleep(100);
        }
    }
}

module.exports = {
    canDepositFullShulker,
    canUnpackShulker,
    canDepositNormal,
    unpackShulker,
    packShulker,
    collectNearby,
};
