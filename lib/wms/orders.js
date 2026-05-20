// High-level order orchestration. Each subtype (withdraw / deposit / transfer / packing /
// unpacking / fix / buy_at_shop) is a distinct function; executeOrder dispatches.

const { Vec3 } = require('vec3');
const { sleep } = require('../common');
const pathfinder = require('../pathfinder');
const containerOperation = require('../containerOperation');
const mcFallout = require('../mcFallout');

// ── Entry point ──────────────────────────────────────────────────────────────
// onProgress(payload):呼叫者(src/warehouse.js)注入,讓 sub-routine 可以在執行中
//   把即時進度推回去寫進 task.detail。payload 直接 spread merge 進現有的 detail.payload。
async function executeOrder(wms, bot, order, onProgress) {
    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);

    switch (order.optype) {
        case 'deposit':
            return wms.depositPickingArea(bot, order.picking_area);

        case 'withdraw': {
            if (!order.content.length) return true;
            const tgs = order.content.map(i => ({ itemName: i.item, quantity: i.quantity, type: i.type }));
            await wms.depositInventory(bot);
            return wms.withdrawPickingArea(bot, order.picking_area, tgs);
        }

        case 'unpacking': {
            if (!order.content.length) return true;
            const tgs = order.content.map(i => ({ itemName: i.item, quantity: i.quantity, type: i.type }));
            return unpackingOrder(wms, bot, tgs);
        }

        case 'packing': {
            if (!order.content.length) return true;
            const tgs = order.content.map(i => ({
                itemName: i.item, quantity: i.quantity, type: i.type, stacksize: i.stacksize ?? 64,
            }));
            return packingOrder(wms, bot, tgs);
        }

        case 'fix':
            return fixOrder(wms, bot, order.content);

        case 'buy_at_shop':
            return buyAtShop(wms, bot, order);

        case 'transfer':
            return orderTransfer(wms, bot, order, onProgress);

        default:
            wms.log(true, 'WARN', 'WMS', `不支援的操作類型 ${order.optype}`);
            return false;
    }
}

// ── Pack / Unpack / Fix ──────────────────────────────────────────────────────

async function unpackingOrder(wms, bot, tgs) {
    for (const tg of tgs) {
        for (let i = 0; i < tg.quantity; i++) {
            try {
                wms.log(false, 'INFO', bot.username, `處理拆箱: ${tg.itemName} ${i + 1} / ${tg.quantity}`);

                const winfo = wms.toWithdrawInfo(tg.itemName, 1, 'full_shulker');
                const operations = await wms.getDeposit(wms.cfg, winfo);
                if (!operations || operations.length === 0) continue;

                for (const operation of operations) {
                    const success = await wms.executeOperation(bot, operation);
                    if (success) await wms.commit(wms.cfg, operation.id);
                    else await wms.rollback(wms.cfg, operation.id);
                }

                await containerOperation.closeWindow(bot);
                for (let s = 0; s < 45; s++) {
                    const item = bot.inventory.slots[s];
                    if (!item) continue;
                    const p = containerOperation.parseItem(item, bot);
                    if (p.isShulkerBox) {
                        await wms.unpackShulker(bot, s);
                        await wms.depositInventory(bot);
                    }
                }
            } catch (err) {
                wms.log(false, 'ERROR', bot.username, `處理拆箱: ${tg.itemName} ${i + 1} / ${tg.quantity} 錯誤: ${err.message}`);
            }
        }
    }
    await wms.depositInventory(bot);
}

async function packingOrder(wms, bot, tgs) {
    for (const tg of tgs) {
        for (let i = 0; i < tg.quantity; i++) {
            try {
                wms.log(false, 'INFO', bot.username, `處理裝箱: ${tg.itemName} ${i + 1} / ${tg.quantity}`);

                const winfo = wms.toWithdrawInfo(tg.itemName, tg.stacksize * 27, 'normal');
                const operations = await wms.getDeposit(wms.cfg, winfo);
                if (!operations || operations.length === 0) continue;

                for (const operation of operations) {
                    const success = await wms.executeOperation(bot, operation);
                    if (success) await wms.commit(wms.cfg, operation.id);
                    else await wms.rollback(wms.cfg, operation.id);
                }

                await containerOperation.closeWindow(bot);
                await sleep(100);
                await wms.packShulker(bot, tg);
                await containerOperation.updateInventory(bot);
                await sleep(200);
                await wms.depositInventory(bot);
            } catch (err) {
                wms.log(false, 'ERROR', bot.username, `處理裝箱: ${tg.itemName} ${i + 1} / ${tg.quantity} 錯誤: ${err.message}`);
            }
        }
    }
    await wms.depositInventory(bot);
}

async function fixOrder(wms, bot, contents) {
    for (const operation of contents) {
        const standPos = new Vec3(operation.stand.x, operation.stand.y, operation.stand.z);
        const barrelPos = new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z);

        attempt: for (let tryCount = 0; tryCount < 8; tryCount++) {
            await wms.depositInventory(bot);
            await pathfinder.astarfly(bot, standPos, null, null, null, true);

            let barrel = null;
            for (let j = 0; j < 3; j++) {
                await pathfinder.astarfly(bot, standPos, null, null, null, true);
                await sleep(50);
                barrel = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000);
                await sleep(50);
                if (barrel) break;
            }
            if (!barrel) continue attempt;

            let allClear = true;
            for (let i = 0; i < 27; i++) {
                const item = barrel.slots[i];
                if (!item) continue;
                const emptySlot = barrel.firstEmptyInventorySlot();
                if (emptySlot === null) allClear = false;
                await bot.simpleClick.leftMouse(i);
                await bot.simpleClick.leftMouse(emptySlot);
            }
            await wms.depositInventory(bot);
            if (allClear) {
                await pathfinder.astarfly(bot, standPos, null, null, null, true);
                await wms.upbyPos(bot, barrelPos);
                break attempt;
            }
        }
    }
}

// ── Buy-at-shop ──────────────────────────────────────────────────────────────

async function buyAtShop(wms, bot, order) {
    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);

    const warp = order.picking_area;
    const quantity = order.content[0].quantity;
    await mcFallout.warp(bot, warp, 8000);

    const first = order.content[0];
    const standPos = new Vec3(first.stand.x, first.stand.y, first.stand.z);
    const barrelPos = new Vec3(first.barrel.x, first.barrel.y, first.barrel.z);

    await pathfinder.astarfly(bot, standPos.offset(0, 30, 0), null, null, null, true);
    for (let t = 0; t < 3; t++) {
        await pathfinder.astarfly(bot, standPos, null, null, null, true);
        await sleep(150);
    }

    try {
        bot._client.write('block_dig', { status: 0, location: barrelPos, face: 1 });
        bot._client.write('block_dig', { status: 2, location: barrelPos, face: 1 });
        await sleep(2000);
        bot.chat(`${quantity}`);
    } catch (err) {
        wms.log(true, 'ERROR', bot.username, `buyAtShop error: ${err.message}`);
    }

    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);
    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);
}

// ── Transfer (buy here, sell there) ──────────────────────────────────────────

async function orderTransfer(wms, bot, order, onProgress) {
    const log = (file, level, msg) => wms.log(file, level, bot.username, msg);

    await sleep(3000);
    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);
    await containerOperation.updateInventory(bot);
    await wms.depositInventory(bot);

    const ex = order.extra_info;
    const buyWarp = ex.transfer_from.replace(/^\/warp\s+/i, '');
    const sellWarp = ex.transfer_to.replace(/^\/warp\s+/i, '');

    const buySignPos = ex.from_sign_pos ? new Vec3(ex.from_sign_pos.x, ex.from_sign_pos.y, ex.from_sign_pos.z) : new Vec3(0, 0, 0);
    const sellSignPos = ex.to_sign_pos ? new Vec3(ex.to_sign_pos.x, ex.to_sign_pos.y, ex.to_sign_pos.z) : new Vec3(0, 0, 0);
    const buyStandPos = ex.from_stand_pos ? new Vec3(ex.from_stand_pos.x, ex.from_stand_pos.y, ex.from_stand_pos.z) : buySignPos.offset(0, 1, 0);
    const sellStandPos = ex.to_stand_pos ? new Vec3(ex.to_stand_pos.x, ex.to_stand_pos.y, ex.to_stand_pos.z) : sellSignPos.offset(0, 1, 0);

    const count = ex.transfer_quantity;

    // Live progress state (pushed to TUI via onProgress when changed).
    let buyServer = null, sellServer = null;
    let remaining = (count === -1) ? -1 : count;   // -1 = 無限
    let totalReward = 0;                            // 獎勵
    let totalCost = 0;                              // buy 階段累積成本
    let totalIncome = 0;                            // sell 階段累積收入
    let side = 'buy';                               // 'buy' | 'sell'
    let buyTrips = 0, sellTrips = 0;                // 完成趟數
    let buyQty = 0, sellQty = 0;                    // 商店訊息個數加總
    function emit() {
        if (typeof onProgress !== 'function') return;
        try {
            onProgress({
                transferLive: {
                    buyWarp, sellWarp, buyServer, sellServer,
                    count, remaining, side,
                    totalReward, totalCost, totalIncome,
                    buyTrips, sellTrips, buyQty, sellQty,
                }
            });
        } catch (_) { }
    }
    emit();

    // Inspect buy side.
    // 尋路 + touchChestShop 重試 helper（最多 maxRetry 次，失敗時重新 warp + 尋路）
    async function inspectShop(warpName, signPos, standPos, maxRetry = 3) {
        for (let r = 0; r < maxRetry; r++) {
            const dist = bot.entity.position.distanceTo(signPos);
            if (dist > 4) {
                if (r > 0) log(true, 'WARN', `商店讀取失敗，重新warp retry=${r}/${maxRetry}`);
                await mcFallout.warp(bot, warpName, 8000);
                for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, standPos, true); await sleep(500); }
            } else if (r > 0) {
                log(true, 'WARN', `商店讀取失敗，距離近只重新尋路 retry=${r}/${maxRetry} dist=${dist.toFixed(1)}`);
                for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, standPos, true); await sleep(500); }
            }
            const info = await mcFallout.touchChestShop(bot, signPos, 5000);
            if (info?.owner != null) return info;
            await sleep(1000);
        }
        return null;
    }

    await sleep(500);
    log(true, 'INFO', `前往購買位置: ${buyWarp} 檢測資訊...`);
    await mcFallout.warp(bot, buyWarp, 8000);
    await sleep(5000)
    await mcFallout.warp(bot, buyWarp, 8000);
    await sleep(5000)
    buyServer = bot.botinfo.server;
    emit();

    let buytype;
    {
        const buyBlock = bot.blockAt(buySignPos);
        if (!buyBlock) { log(true, 'ERROR', `購買位置不可見`); return false; }
        if (buyBlock.name.includes('chest') || buyBlock.name.includes('barrel')) {
            log(true, 'INFO', `購買位置為barrel 或 chest`);
            buytype = 'chest';
            for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, buyStandPos, true); await sleep(500); }
        } else if (buyBlock.name.includes('sign')) {
            log(true, 'INFO', `購買位置為sign`);
            buytype = 'sign';
            const shopInfo = await inspectShop(buyWarp, buySignPos, buyStandPos);
            if (!shopInfo) { log(true, 'ERROR', `購買位置為sign 但商店不可見`); return false; }
            if (shopInfo.count === 0) { log(true, 'ERROR', `購買位置為sign 但商店庫存為0`); return false; }
        }
    }

    log(true, 'INFO', `前往出售位置: ${sellWarp} 檢測資訊...`);
    await mcFallout.warp(bot, sellWarp, 8000);
    await sleep(5000)
    await mcFallout.warp(bot, sellWarp, 8000);
    await sleep(5000)
    sellServer = bot.botinfo.server;
    emit();

    let selltype;
    {
        const sellBlock = bot.blockAt(sellSignPos);
        if (!sellBlock) { log(true, 'ERROR', `出售位置不可見`); return false; }
        if (sellBlock.name.includes('chest') || sellBlock.name.includes('barrel')) {
            log(true, 'INFO', `出售位置為barrel 或 chest`);
            selltype = 'chest';
            for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, sellStandPos, true); await sleep(500); }
        } else if (sellBlock.name.includes('sign')) {
            log(true, 'INFO', `出售位置為sign`);
            selltype = 'sign';
            const shopInfo = await inspectShop(sellWarp, sellSignPos, sellStandPos);
            if (!shopInfo) { log(true, 'ERROR', `出售位置為sign 但商店不可見`); return false; }
        }
    }

    await sleep(500);
    log(true, 'INFO', `購買分流: ${buyServer} 出售分流: ${sellServer}`);
    // 兩個分流都檢測完成 — 此時 buyServer / sellServer 已就位,推一次更新讓 TUI 立即顯示。
    emit();
    log(true, 'INFO', `開始搬運`);

    let shouldEnd = false;
    let crtModeBit = 0, noslot = false, noitem = false;
    let sellShopNoFund = false;
    // 循環即將開始 — 把初始 side / remaining 推給 TUI,避免要等到第一次迭代才更新。
    remaining = (count === -1) ? -1 : count;
    side = 'buy';
    emit();

    function checkShopResult(jsonMsg) {
        const msg = jsonMsg.toString();
        // "這個商店僅能再購買 N 個該商品" — shop owner running low on funds.
        let m = msg.match(/這個商店僅能再購買\s*(\d+)\s*個該商品/);
        if (m) {
            sellShopNoFund = true;
            log(false, 'INFO', `商店剩餘可購買數量: ${parseInt(m[1])}`);
            return;
        }
        if (msg.includes('店主餘額不足')) {
            log(false, 'INFO', `店主餘額不足`);
            shouldEnd = true;
            return;
        }
        if (/^\[商店\]/.test(msg)) {
            const money = msg.match(/[\(（]＄?([0-9\.,]+)元[\)）]/);
            if (money) {
                const v = parseInt(money[1].replace(/,/g, ''));
                log(false, 'INFO', `獎勵金額: ${v}`);
                totalReward += v;
                emit();
            }
            const qty = msg.match(/(\d[\d,]*)\s*個/);
            if (qty) {
                const q = parseInt(qty[1].replace(/,/g, ''));
                if (side === 'buy') buyQty += q;
                else                sellQty += q;
                emit();
            }
        }
        // "交易成功" 格式: │ 以 0.0 元 交易了 30 個 xxx（無 [商店] 前綴）
        const tradeM = msg.match(/以\s*([\d.,]+)\s*元\s*交易了\s*([\d,]+)\s*個/);
        if (tradeM) {
            const v = parseFloat(tradeM[1].replace(/,/g, ''));
            const q = parseInt(tradeM[2].replace(/,/g, ''));
            if (side === 'buy') { totalCost += v; buyQty += q; }
            else {
                // totalIncome += v;
                sellQty += q;
            }
            emit();
        }
        m = msg.match(/稅前收入\s*([0-9,]+)元/);
        if (m) {
            const v = parseInt(m[1].replace(/,/g, ''));
            log(false, 'INFO', `稅前收入: ${v}`);
            totalIncome += v;
            emit();
        }
    }

    bot.on('message', checkShopResult);
    for (let i = 0; i < 99999; i++) {
        if (shouldEnd) break;
        if (count !== -1 && i >= count) break;
        if (sellShopNoFund) { log(true, 'INFO', `店主 ${sellWarp} 收購金額不足`); break; }

        // 推 i (各買賣半步) 後的剩餘次數;count=-1 表示不限制。
        remaining = (count === -1) ? -1 : Math.max(0, count - i);
        side = (crtModeBit === 0) ? 'buy' : 'sell';
        emit();

        if (crtModeBit === 0) {
            // Buy.
            if (buyServer !== bot.botinfo.server) {
                await sleep(3000);
                await mcFallout.teleportServer(bot, buyServer);
            }
            await sleep(2000);
            let info = null;
            for (let r = 0; r < 3; r++) {
                const dist = bot.entity.position.distanceTo(buySignPos);
                if (dist > 4) {
                    await mcFallout.warp(bot, buyWarp, 8000);
                    await sleep(3000);
                    for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, buyStandPos, true); await sleep(500); }
                } else if (r > 0) {
                    log(false, 'WARN', `購買 touchChestShop 失敗，距離近只重新尋路 retry=${r} dist=${dist.toFixed(1)}`);
                    for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, buyStandPos, true); await sleep(500); }
                }
                info = await mcFallout.touchChestShop(bot, buySignPos);
                if (info?.owner != null) break;
                log(false, 'WARN', `購買 touchChestShop 失敗 retry=${r}`);
                info = null; await sleep(1000);
            }
            if (!info) { log(true, 'ERROR', `購買商店無法讀取，跳過本輪`); continue; }
            if (info.commodity_count > 0) {
                bot.chat('/qs amount all');
                await sleep(4000);
            } else if (info.commodity_count === 0) {
                if (noitem) { log(true, 'INFO', `商店售出庫存為0 停止`); shouldEnd = true; }
                else { noitem = true; await sleep(5000); }
                continue;
            }
            crtModeBit = 1; noitem = false;
            buyTrips++; emit();
        } else {
            // Sell.
            if (sellServer !== bot.botinfo.server) {
                await sleep(3000);
                await mcFallout.teleportServer(bot, sellServer);
            }
            await sleep(2000);
            let info = null;
            for (let r = 0; r < 3; r++) {
                const dist = bot.entity.position.distanceTo(sellSignPos);
                if (dist > 4) {
                    await mcFallout.warp(bot, sellWarp, 8000);
                    await sleep(3000);
                    for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, sellStandPos, true); await sleep(500); }
                } else if (r > 0) {
                    log(false, 'WARN', `出售 touchChestShop 失敗，距離近只重新尋路 retry=${r} dist=${dist.toFixed(1)}`);
                    for (let j = 0; j < 3; j++) { await pathfinder.astarfly(bot, sellStandPos, true); await sleep(500); }
                }
                info = await mcFallout.touchChestShop(bot, sellSignPos);
                if (info?.owner != null) break;
                log(false, 'WARN', `出售 touchChestShop 失敗 retry=${r}`);
                info = null; await sleep(1000);
            }
            if (!info) { log(true, 'ERROR', `出售商店無法讀取，跳過本輪`); continue; }
            if (info.space > 0) {
                bot.chat('/qs amount all');
                await sleep(4000);
            } else if (info.space === 0) {
                if (noslot) { log(true, 'INFO', `商店收購空間為 0 停止`); shouldEnd = true; }
                else { noslot = true; await sleep(5000); }
                continue;
            }
            crtModeBit = 0; noslot = false;
            sellTrips++; emit();
        }
    }

    remaining = 0;
    emit();
    bot.off('message', checkShopResult);
    const profit = totalIncome - totalCost;
    log(true, 'INFO', `結束搬運 | 購買 ${buyTrips} 趟 ${buyQty} 個 成本 ${totalCost.toFixed(2)} | 出售 ${sellTrips} 趟 ${sellQty} 個 收入 ${totalIncome.toFixed(2)} | 淨利 ${profit.toFixed(2)}`);
    await sleep(3200);
    await wms.gotoWarehouse(bot);
    await wms.depositInventory(bot);
    await containerOperation.updateInventory(bot);
    await wms.depositInventory(bot);
    // Silence unused-var warnings for vars kept for diagnostic parity.
    void buytype; void selltype;
}

module.exports = {
    executeOrder,
    unpackingOrder,
    packingOrder,
    fixOrder,
    buyAtShop,
    orderTransfer,
};
