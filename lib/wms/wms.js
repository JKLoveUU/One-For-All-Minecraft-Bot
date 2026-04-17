const { Vec3 } = require('vec3')
const { getBarrelAbsolutePos, getStandPos, inventoryToBarrelInfo } = require('./barrel')
const { sleep } = require('../common')
const pathfinder = require('../pathfinder')
const utils = require('../util')
const containerOperation = require('../containerOperation')
const mcFallout = require('../mcFallout')

const wms = {
    cfg: {
        ip: "localhost",
        port: "8080",
        token: "token",
        warp: "JKLoveJK_6",
    },
    standby: false,
    warehouse_info: {
    },
    // ── Navigation ──
    gotoWarehouse: async function (bot) {
        if (bot.botinfo.server != parseInt(this.warehouse_info.server)) {
            await mcFallout.promiseTeleportServer(bot, this.warehouse_info.server, 30_000)
            await sleep(2000)
        }
        let botpos = bot.entity.position
        let storageP1 = new Vec3(this.warehouse_info.position.x, this.warehouse_info.position.y, this.warehouse_info.position.z)
        let storageP2 = new Vec3(this.warehouse_info.position.x + this.warehouse_info.size.x, this.warehouse_info.position.y, this.warehouse_info.position.z + this.warehouse_info.size.z)
        if (botpos.distanceTo(storageP1) < 100 || botpos.distanceTo(storageP2) < 100) return;
        if (botpos.x < storageP1.x || botpos.x > storageP2.x ||
            botpos.z < storageP1.z || botpos.z > storageP2.z ||
            botpos.distanceTo(storageP1) > 300 || botpos.distanceTo(storageP2) > 300) {
            bot.chat(`/warp ${this.cfg.warp}`)
            await sleep(3000)
        }
    },
    gotoOrigin: async function (bot) {
        let storageP1 = new Vec3(
            this.warehouse_info.position.x,
            this.warehouse_info.position.y + this.warehouse_info.size.aisle + this.warehouse_info.size.bottom + this.warehouse_info.size.top,
            this.warehouse_info.position.z)
        await pathfinder.astarfly(bot, storageP1, null, null, null, true)
    },
    // ── Barrel Operations ──
    upbyPos: async function (bot, barrelPos) {
        let inventory = null
        for (let j = 0; j < 3; j++) {
            // await pathfinder.astarfly(bot, standPos, null, null, null, true)
            await sleep(50)
            inventory = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000)
            if (inventory) {
                break
            }
        }
        const barrelinfo = inventoryToBarrelInfo(bot, inventory)
        if (!barrelinfo) return false
        if (barrelinfo.barreltype == 'normal' || barrelinfo.barreltype == 'empty' || barrelinfo.barreltype == 'full_shulker') {
            barrelinfo.x = barrelPos.x
            barrelinfo.y = barrelPos.y
            barrelinfo.z = barrelPos.z
            barrelinfo.requiretype = 'update'
            this.updateBarrel(this.cfg, barrelinfo)
        } else if (barrelinfo.barreltype == 'error') {
            barrelinfo.x = barrelPos.x
            barrelinfo.y = barrelPos.y
            barrelinfo.z = barrelPos.z
            barrelinfo.requiretype = 'update'
            console.log(barrelinfo)
            this.updateBarrel(this.cfg, barrelinfo)

        } else if (barrelinfo) {
            barrelinfo.x = barrelPos.x
            barrelinfo.y = barrelPos.y
            barrelinfo.z = barrelPos.z
            console.log(barrelinfo)
        }
        return true
    },
    updateBarrels: async function (bot, start, end) {
        await this.gotoWarehouse(bot)
        for (let i = start; i <= end; i++) {
            const barrelPos = getBarrelAbsolutePos(i, this.warehouse_info)
            const standPos = getStandPos(i, this.warehouse_info)
            // console.log(barrelPos)
            let inventory = null
            for (let j = 0; j < 3; j++) {
                await pathfinder.astarfly(bot, standPos, null, null, null, true)
                await sleep(50)
                inventory = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000)
                await sleep(150)
                if (inventory) {
                    break
                }
            }
            const barrelinfo = inventoryToBarrelInfo(bot, inventory)
            if (!barrelinfo) continue
            if (barrelinfo.barreltype == 'normal' || barrelinfo.barreltype == 'empty' || barrelinfo.barreltype == 'full_shulker') {
                barrelinfo.x = barrelPos.x
                barrelinfo.y = barrelPos.y
                barrelinfo.z = barrelPos.z
                barrelinfo.requiretype = 'update'
                this.updateBarrel(this.cfg, barrelinfo)
            } else if (barrelinfo.barreltype == 'error') {
                barrelinfo.x = barrelPos.x
                barrelinfo.y = barrelPos.y
                barrelinfo.z = barrelPos.z
                barrelinfo.requiretype = 'update'
                console.log(barrelinfo)
                this.updateBarrel(this.cfg, barrelinfo)

            } else if (barrelinfo) {
                barrelinfo.x = barrelPos.x
                barrelinfo.y = barrelPos.y
                barrelinfo.z = barrelPos.z
                console.log(barrelinfo)
            }
        }
        return
    },

    // 傳給server用的 
    // ── API ──
    updateBarrel: async function (cfg, barrelInfo) {
        contents = []
        if (Array.isArray(barrelInfo)) {
            contents.push(...barrelInfo);
        } else {
            contents.push(barrelInfo);
        }
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            }).then(res => {
                if (!res.ok) {
                    console.log('WMS API 錯誤:', res.status);
                    resolve();
                    return;
                }
                return res.json();
            }).then(data => {
                resolve(data);
            }).catch(err => {
                console.log('WMS API 錯誤:', err.message);
                resolve();
            })
        })
    },
    // 獲取倉庫基本訊息
    getWarehouseInfo: async function (cfg) {
        return new Promise((resolve, reject) => {
            try {
                fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehousegetinfo`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `${cfg.token}`
                    },
                    body: JSON.stringify({
                        token: cfg.token
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        // pickingArea 結構解析
                        if (data.pickingArea) {
                            data.pickingArea = data.pickingArea.map(area => ({
                                id: area.id,
                                acceptStand: new Vec3(area.acceptStand.x, area.acceptStand.y, area.acceptStand.z),
                                accepts: area.accepts.map(pos => new Vec3(pos.x, pos.y, pos.z)),
                                rejectStand: new Vec3(area.rejectStand.x, area.rejectStand.y, area.rejectStand.z),
                                rejects: area.rejects.map(pos => new Vec3(pos.x, pos.y, pos.z))
                            }));
                        }
                        this.warehouse_info = data;
                        resolve(data);
                    })
                    .catch(err => {
                        // console.log('WMS API 錯誤，使用預設值:', err.message);
                        resolve({
                            position: { x: -3520, y: 0, z: -3520 },
                            size: { x: 128, y: 15, z: 128 },
                            status: 'error-connect',
                            warp: 'JKLoveJK_6',
                            pickingArea: []
                        });
                    })
            } catch (err) {
                resolve({
                    position: { x: -3520, y: 0, z: -3520 },
                    size: { x: 128, y: 15, z: 128 },
                    status: 'error-connect',
                    warp: 'JKLoveJK_6',
                    pickingArea: []
                });
            }
        })
    },
    queryQuantity: async function (cfg, itemName) {
        contents = []
        contents.push({
            id: itemName,
            requiretype: 'query_quantity'
        })
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            })
                .then(res => res.json())
                .then(data => {
                    // console.log('查詢結果:', data);
                    console.log(`查詢庫存 ${itemName} ${data.operations[0]?.quantity}`)
                    resolve(data.operations[0]?.quantity);
                })
                .catch(err => {
                    console.log('WMS API 錯誤 查詢庫存:', err.message);
                    resolve(0);
                })
        })
    },
    toOperationInfo: function (item, quantity, barrelType, requiretype = 'deposit') {
        if (barrelType !== 'normal' && barrelType !== 'full_shulker') {
            console.log(`不支援的類型: ${barrelType}`)
            return
        }
        return { id: item, requiretype, quantity, barrelType }
    },
    toDepositInfo: function (item, quantity, barrelType) {
        return this.toOperationInfo(item, quantity, barrelType, 'deposit')
    },
    toWithdrawInfo: function (item, quantity, barrelType) {
        return this.toOperationInfo(item, quantity, barrelType, 'withdraw')
    },
    getDeposit: async function (cfg, dinfo) {
        contents = []
        if (Array.isArray(dinfo)) {
            contents = contents.concat(dinfo)
        } else {
            contents.push(dinfo)
        }
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            })
                .then(res => res.json())
                .then(data => {
                    // console.log('查詢結果:', data);
                    resolve(data.operations);
                })
                .catch(err => {
                    console.log('WMS API 錯誤:', err.message);
                    resolve(0);
                })
        })
    },
    // ── Inventory Operations ──
    executeOperation: async function (bot, operation) {
        try {
            await this.gotoWarehouse(bot)
            await containerOperation.closeWindow(bot)
            let standPos = new Vec3(operation.stand.x, operation.stand.y, operation.stand.z)
            let barrelPos = new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z)
            let barrel = null
            for (let j = 0; j < 3; j++) {
                // console.log('前往', standPos)
                await pathfinder.astarfly(bot, standPos, null, null, null, true)
                await sleep(50)
                // console.log('開啟', barrelPos)
                barrel = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000)
                await sleep(150)
                // console.log('開啟結果', barrel)
                if (barrel) {
                    break
                }
            }
            if (barrel) {
                if (operation.type == 'deposit') {
                    // 這個不夠精準 deposit
                    let rs = await containerOperation.wms_deposit(bot, barrel, operation.item, operation.quantity, operation.extra_info)
                    if (rs == false) {
                        await this.rollback(this.cfg, operation.id)
                        await this.upbyPos(bot, new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z))
                        return false
                    }
                    return rs
                } else if (operation.type == 'withdraw') {
                    let rs = await containerOperation.wms_withdraw(bot, barrel, operation.item, operation.quantity, operation.extra_info)
                    if (rs == false) {
                        await this.rollback(this.cfg, operation.id)
                        await this.upbyPos(bot, new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z))
                        return false
                    }
                    return rs
                }
            }
            console.log('操作失敗', operation)
            return false
        } catch (err) {
            await this.rollback(this.cfg, operation.id)
            await this.upbyPos(bot, new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z))
            console.log(err.name, err.message)
            return false
        }
    },
    commit: async function (cfg, id) {
        contents = []
        contents.push({
            id: id,
            requiretype: 'commit'
        })
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            })
                .then(res => res.json())
                .then(data => {
                    // console.log('查詢結果:', data);
                    resolve(data.operations);
                })
                .catch(err => {
                    console.log('WMS API 錯誤:', err.message);
                    resolve(0);
                })
        })
    },
    rollback: async function (cfg, id) {
        contents = []
        contents.push({
            id: id,
            requiretype: 'rollback'
        })
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            })
                .then(res => res.json())
                .then(data => {
                    // console.log('查詢結果:', data);
                    resolve(data.operations);
                })
                .catch(err => {
                    console.log('WMS API 錯誤:', err.message);
                    resolve(0);
                })
        })
    },
    depositInventory: async function (bot) {
        // console.log("分類開始")
        await containerOperation.closeWindow(bot)
        // 統計物品數量的 Map
        let itemCountMap = new Map();

        // 第一次遍歷：統計所有物品數量
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i]
            if (!item) continue
            let s = containerOperation.getSignature(item)
            if (s === bot.username) continue;
            let p = containerOperation.parseItem(item, bot)
            if (this.canDepositNormal(p)) {
                const key = p.item;
                const currentCount = itemCountMap.get(key) || 0;
                itemCountMap.set(key, currentCount + p.count);
            }
        }

        // 輸出統計結果
        if (itemCountMap.size > 0) {
            bot.logger(false, 'INFO', bot.username, '本次存儲物品統計:');
            for (let [itemName, count] of itemCountMap) {
                bot.logger(false, 'INFO', bot.username, `${itemName}: ${count} 個`);
                let rq = {
                    id: itemName,
                    quantity: count,
                    barreltype: "normal", // 'full_shulker', 'normal', 'nbt', 'empty', 'error'
                    requiretype: 'deposit'
                }
                let results = await this.getDeposit(this.cfg, rq)
                for (let result of results) {
                    // await containerOperation.updateInventory(bot)
                    let opr = await this.executeOperation(bot, result)
                    if (opr) {
                        await this.commit(this.cfg, result.id)
                    } else {
                        await this.rollback(this.cfg, result.id)
                    }
                }
            }
        }
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i]
            if (!item) continue
            let p = containerOperation.parseItem(item, bot)
            // console.log(p)
            if (this.canDepositNormal(p)) {
                let rq = {
                    id: p.item,
                    quantity: p.count,
                    barreltype: "normal", // 'full_shulker', 'normal', 'nbt', 'empty', 'error'
                    requiretype: 'deposit'
                }
                let results = await this.getDeposit(this.cfg, rq)
                for (let result of results) {
                    // await containerOperation.updateInventory(bot)
                    let opr = await this.executeOperation(bot, result)
                    if (opr) {
                        await this.commit(this.cfg, result.id)
                    } else {
                        await this.rollback(this.cfg, result.id)
                    }
                }
            }

        }
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i]
            if (!item) continue
            let p = containerOperation.parseItem(item, bot)
            if (this.canDepositFullShulker(p)) {
                let rq = {
                    id: p.item,
                    quantity: 1,
                    barreltype: "full_shulker", // 'full_shulker', 'normal', 'nbt', 'empty', 'error'
                    requiretype: 'deposit'
                }
                let results = await this.getDeposit(this.cfg, rq)
                for (let result of results) {
                    // await containerOperation.updateInventory(bot)
                    // console.log(`操作${result.id} ${result.quantity} ${result.type}`)
                    let opr = await this.executeOperation(bot, result)
                    if (opr) {
                        await this.commit(this.cfg, result.id)
                    } else {
                        await this.rollback(this.cfg, result.id)
                    }
                }
            }
        }
        await containerOperation.closeWindow(bot)
        for (let i = 0; i <= 44; i++) {
            const item = bot.inventory.slots[i]
            if (!item) continue
            let p = containerOperation.parseItem(item, bot)
            if (this.canUnpackShulker(p)) {
                await this.unpackShulker(bot, i)
                await this.depositInventory(bot)
            }
        }
        await this.gotoOrigin(bot)
        // console.log("分類 done")
    },
    // wms dp
    depositPickingArea: async function (bot, pickingAreaId) {
        await this.gotoWarehouse(bot)
        if (bot.inventory.slots[45]) await bot.unequip("off-hand")
        await mcFallout.openPreventSpecItem(bot)
        // 找到對應的 picking area
        let pickingArea = this.warehouse_info.pickingArea.find(area => area.id === pickingAreaId)
        if (!pickingArea) {
            console.log(`找不到 picking area ${pickingAreaId}`)
            return
        }
        let acceptStand = pickingArea.acceptStand
        let accepts = pickingArea.accepts
        let rejectStand = pickingArea.rejectStand
        let rejects = pickingArea.rejects
        let rejectIndex = 0;
        for (let acceptIndex = 0; acceptIndex < accepts.length;) {
            let accept = accepts[acceptIndex];
            await pathfinder.astarfly(bot, acceptStand, null, null, null, true)
            let inventory = await containerOperation.openContainerWithTimeout(bot, accept, 1000)
            await sleep(50)
            if (!inventory) continue
            // 檢查是否有物品需要處理
            let hasItemsToProcess = false
            for (let i = 0; i < inventory.inventoryStart; i++) {
                if (inventory.slots[i]) {
                    hasItemsToProcess = true
                    break
                }
            }
            if (!hasItemsToProcess) {
                acceptIndex++;
                continue
            }
            // 從箱子取物品直到背包滿
            for (let i = 0; i < inventory.inventoryStart; i++) {
                let item = inventory.slots[i]
                if (!item) continue
                let p = containerOperation.parseItem(item, bot)
                let emptyslotcount = inventory.emptySlotCount()
                let emptySlot = inventory.firstEmptyInventorySlot()
                if (p.isShulkerBox && p.shulkerUsedSlot + 1 > emptyslotcount + 9) break;
                if (emptySlot === null) break

                await bot.simpleClick.leftMouse(i)
                await bot.simpleClick.leftMouse(emptySlot)
            }
            // 前往reject區並放入物品
            await pathfinder.astarfly(bot, rejectStand, null, null, null, true)
            rjchest: for (; rejectIndex < rejects.length;) {
                let reject = rejects[rejectIndex];
                let rejectInv = await containerOperation.openContainerWithTimeout(bot, reject, 1000)
                if (!rejectInv) continue

                // 將背包物品放入reject箱
                for (let i = rejectInv.inventoryStart; i < rejectInv.inventoryEnd; i++) {
                    let item = rejectInv.slots[i]
                    if (!item) continue
                    let p = containerOperation.parseItem(item, bot)
                    if (this.canUnpackShulker(p) || this.canDepositNormal(p) || this.canDepositFullShulker(p)) {
                        continue;
                    }
                    // 檢查是否有簽章
                    let signature = containerOperation.getSignature(item)
                    if (signature && signature === bot.username) continue
                    if (!p.haveNBT) continue;
                    let emptySlot = rejectInv.firstEmptyContainerSlot()
                    if (emptySlot === null) {
                        rejectIndex++
                        continue rjchest;
                    }
                    await bot.simpleClick.leftMouse(i)
                    await bot.simpleClick.leftMouse(emptySlot)
                }
                break rjchest;
            }
            await containerOperation.closeWindow(bot)
            for (let i = bot.inventory.inventoryStart; i < bot.inventory.inventoryEnd; i++) {
                let item = bot.inventory.slots[i]
                if (!item) continue
                let p = containerOperation.parseItem(item, bot)
                if (this.canUnpackShulker(p)) {
                    await this.unpackShulker(bot, i)
                }
            }
            // 存入倉庫
            await this.depositInventory(bot)
            // 回到 accept 箱子繼續處理
            await pathfinder.astarfly(bot, acceptStand, null, null, null, true)
            inventory = await containerOperation.openContainerWithTimeout(bot, accept, 1000)
        }
        // 存入倉庫
        await this.depositInventory(bot)
        containerOperation.closeWindow(bot)
    },
    withdrawPickingArea: async function (bot, pickingAreaId = "A00", tgs = [], winfos = []) {
        await this.gotoWarehouse(bot)
        if (bot.inventory.slots[45]) await bot.unequip("off-hand")
        await mcFallout.openPreventSpecItem(bot)
        // 找到對應的 picking area
        let pickingArea = this.warehouse_info.pickingArea.find(area => area.id === pickingAreaId)
        if (!pickingArea) {
            console.log(`找不到 picking area ${pickingAreaId}`)
            return
        }
        let acceptStand = pickingArea.acceptStand
        let accepts = pickingArea.accepts
        let rejectStand = pickingArea.rejectStand
        let rejects = pickingArea.rejects
        let acceptIndex = 0
        // 一次處理一個目標物品
        for (let tg of tgs) {
            // 轉換為提取資訊
            let winfo = await this.toWithdrawInfo(tg.itemName, tg.quantity, tg.type || 'normal')
            // 取得物品
            let operations = await this.getDeposit(this.cfg, winfo)
            if (!operations || operations.length == 0) continue;
            for (let operation of operations) {
                let success = await this.executeOperation(bot, operation)
                if (success) {
                    await this.commit(this.cfg, operation.id)
                } else {
                    await this.rollback(this.cfg, operation.id)
                }
                await containerOperation.closeWindow(bot)
                // 前往accept區並放入物品
                await pathfinder.astarfly(bot, acceptStand, null, null, null, true)
                let needPutAccept = false;
                acc: for (; acceptIndex < accepts.length;) {
                    let accept = accepts[acceptIndex];
                    await pathfinder.astarfly(bot, acceptStand, null, null, null, true)
                    let acceptInv = await containerOperation.openContainerWithTimeout(bot, accept, 1000)
                    await sleep(50)
                    if (!acceptInv) continue;
                    // 將背包物品放入accept箱
                    needPutAccept = false;
                    for (let i = acceptInv.inventoryStart; i < acceptInv.inventoryEnd; i++) {
                        let item = acceptInv.slots[i]
                        if (!item) continue
                        // 檢查物品是否有簽名
                        if (containerOperation.getSignature(item) === bot.username) continue
                        needPutAccept = true;
                        let emptySlot = acceptInv.firstEmptyContainerSlot()
                        if (emptySlot === null) {
                            acceptIndex++;
                            continue acc;
                        }
                        await bot.simpleClick.leftMouse(i)
                        await bot.simpleClick.leftMouse(emptySlot)
                    }
                    if (!needPutAccept) {
                        break acc;
                    }
                }
                await containerOperation.closeWindow(bot)
            }
        }
        return true;
    },
    unpackShulker: async function (bot, slot) {
        await containerOperation.closeWindow(bot)
        let targetSlot = bot.inventory.slots[slot]
        if (!targetSlot) return false;
        let pr = containerOperation.parseItem(targetSlot, bot)
        if (!pr.isShulkerBox) return false;
        let unpackPos = new Vec3(this.warehouse_info.unpack.x, this.warehouse_info.unpack.y, this.warehouse_info.unpack.z)
        let emptySlotCount = bot.inventory.emptySlotCount()
        let prUsedSlot = pr.shulkerUsedSlot + 1
        // if(emptySlotCount < prUsedSlot) return false
        let inv = null;
        tt: for (let ttt = 0; ttt < 27; ttt++) {
            // console.log("嘗試拆箱", ttt)
            pt: for (let t = 0; t < 5; t++) {
                await pathfinder.astarfly(bot, unpackPos.offset(0, 2, 0), null, null, null, true)
                await sleep(100)
                await utils.equipShulker(bot, slot)
                await sleep(100)
                await utils.placeShulker(bot, unpackPos)
                await sleep(500)
                let bb = bot.blockAt(unpackPos)
                if (bb.name == 'air') {
                    continue pt;
                }
                if (bb.name.includes("shulker_box")) {
                    inv = await containerOperation.openContainerWithTimeout(bot, unpackPos, 1000)
                    await sleep(50)
                    if (inv != null) break;
                } else {
                    await utils.digBlock(bot, unpackPos, 5000);
                }

            }
            if (!inv) return false;
            for (let i = 0; i < inv.inventoryStart; i++) {
                let item = inv.slots[i]
                if (!item) continue;
                let emptySlot = inv.firstEmptyInventorySlot()
                if (emptySlot === null) {
                    await this.depositInventory(bot)
                    // i--
                    continue;
                };
                await bot.simpleClick.leftMouse(i)
                await bot.simpleClick.leftMouse(emptySlot)
            }
            let btn = bot.blockAt(unpackPos.offset(2, 1, 0))
            if (!btn) return false;
            await bot.activateBlock(btn)
            await sleep(3000)
            break tt;
        }
        await this.depositInventory(bot)
        await this.depositInventory(bot)
        await this.gotoOrigin(bot)
        // await utils.collectDropItem(bot, unpackPos.offset(-1,-1,-1), unpackPos.offset(1,2,1))

    },
    packShulker: async function (bot, tg) {
        const mcData = require('minecraft-data')(bot.version)
        let tgID = mcData.itemsByName[tg.itemName].id
        let packPos = new Vec3(this.warehouse_info.pack.x, this.warehouse_info.pack.y, this.warehouse_info.pack.z)
        tr: for (let t = 0; t < 8; t++) {
            await pathfinder.astarfly(bot, packPos.offset(1, 0, 0), null, null, null, true)
            await collectItem(bot, packPos, 3)
            // 確認盒子
            let b = bot.blockAt(packPos)
            if (!b) {
                t--
                continue tr;
            }
            // 空氣按按鈕
            if (!b.name.includes('shulker_box')) {
                let btn = bot.blockAt(packPos.offset(0, -2, 0))
                if (!btn) continue tr;
                await bot.activateBlock(btn)
                await sleep(200)
                continue tr;
            }
            let inv = await containerOperation.openContainerWithTimeout(bot, packPos, 1000)
            await sleep(100)
            if (!inv) continue tr;
            let fc = tg.stacksize * 27
            let sc = inv.countRange(0, 27, tgID, null)
            // console.log(`${tg.itemName} ${fc} ${sc}`)
            if (fc - sc > 0) {
                await containerOperation.deposit(bot, inv, tg.itemName, fc - sc, true)
            } else if (sc == fc) {
                let btn = bot.blockAt(packPos.offset(0, 1, -1))
                if (!btn) continue tr;
                await bot.activateBlock(btn)
                await sleep(200)
                await collectItem(bot, packPos, 3)
            }
        }
    },
    // ── Validation ──
    canDepositFullShulker: function (itemP) {
        return (itemP.isShulkerBox && itemP.sameItemInShulkerBox && itemP.fullBox)
    },
    canUnpackShulker: function (itemP) {
        return (!this.canDepositFullShulker(itemP) && itemP.isShulkerBox && itemP.shulkerUsedSlot > 0 && !itemP.haveNBT)
    },
    canDepositNormal: function (itemP) {
        return (itemP.isShulkerBox == false && itemP.notSameVersion == false && itemP.haveNBT == false)
    },
    // ── Order Management ──
    getOrder: async function (type = 'get', id = '') {
        return new Promise((resolve, reject) => {
            try {
                fetch(`http://${this.cfg.ip}:${this.cfg.port}/api/v1/order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `${this.cfg.token}`
                    },
                    body: JSON.stringify({
                        token: this.cfg.token,
                        bot_name: this.cfg.token,
                        type: type,
                        order_id: id
                    })
                })
                    .then(res => res.json())
                    .then(data => {
                        // console.log('查詢結果:', data);
                        resolve(data);
                    })
                    .catch(err => {
                        // console.log('WMS API 錯誤:', err.message);
                        resolve({});
                    })
            } catch (err) {
                // console.log(err)
                resolve({});
            }
        })
    },
    getOrderPendingCount: async function () {
        let rs = 0;
        try {
            let order = await this.getOrder('pendingcount')
            // console.log(order)
            rs = order.pendingcount
            // console.log(`有 ${rs} 個訂單待處理`)
        } catch (err) {
            console.log('WMS API 錯誤:', err.message);
            rs = 0;
        }
        return rs;
    },
    prepare: async function (bot, itemName, quantity) {
        let cfg = this.cfg;
        bot.logger(true, 'INFO', bot.username, `[倉儲] 請求準備物品 ${itemName} ${quantity}`);
        let contents = [
            {
                id: itemName,
                requiretype: 'prepare',
                quantity: quantity,
                barrelType: 'normal',
            }

        ]
        return new Promise((resolve, reject) => {
            fetch(`http://${cfg.ip}:${cfg.port}/api/v1/warehouse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${cfg.token}`
                },
                body: JSON.stringify({
                    token: cfg.token,
                    content: contents,
                })
            })
                .then(res => res.json())
                .then(data => {
                    // console.log('查詢結果:', data);
                    resolve(data.operations);
                })
                .catch(err => {
                    console.log('WMS API 錯誤:', err.message);
                    resolve(0);
                })
        })
    },
    executeOrder: async function (bot, order) {
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)
        if (order.optype == 'deposit') {
            let result = await this.depositPickingArea(bot, order.picking_area);
            return result;
        } else if (order.optype == 'withdraw') {
            if (order.content.length == 0) return true;
            // {
            //     order_id: 'TEST-001',
            //     date: '2025-08-08T13:19:09.4383496+08:00',
            //     content: [
            //       { item: 'clay', quantity: 64, type: 'normal' },
            //       { item: 'clay', quantity: 1, type: 'full_shulker' }
            //     ],
            //     bot_name: '',
            //     picking_area: 'A0',
            //     status: 'pending'
            //   }
            // 將 order.content 的 item 重新命名為 itemName
            let tgs = order.content.map(item => ({
                itemName: item.item,
                quantity: item.quantity,
                type: item.type
            }));
            // 執行提取作業
            await this.depositInventory(bot)
            let result = await this.withdrawPickingArea(bot, order.picking_area, tgs);

            return result;
        } else if (order.optype == 'unpacking') { // 拆箱
            if (order.content.length == 0) return true;
            let tgs = order.content.map(item => ({
                itemName: item.item,
                quantity: item.quantity,
                type: item.type
            }));
            let rs = await this.unpackingorder(bot, tgs)
            return rs;
        } else if (order.optype == 'packing') { // 打包
            if (order.content.length == 0) return true;
            let tgs = order.content.map(item => ({
                itemName: item.item,
                quantity: item.quantity,
                type: item.type,
                stacksize: item.stacksize ?? 64
            }));
            let rs = await this.packingorder(bot, tgs);
            return rs;
        } else if (order.optype == 'fix') {
            let rs = await this.fixorder(bot, order.content);
            return rs;
        } else if (order.optype == 'buy_at_shop') {
            let rs = await this.buyAtShop(bot, order);
            return rs;
        } else if (order.optype == 'transfer') {
            let rs = await this.orderTransfer(bot, order);
            return rs;
        } else {
            console.log("不支援的操作類型", order.optype)
            return false;
        }
    },
    /**
     * buyWarp
     * buyMode: sign | chest
     * buySignPos
     * buyStandPos
     * sellWarp
     * sellMode: sign | chest
     * sellSignPos
     * sellStandPos
     * count (-1 no limit)
     */
    orderTransfer: async function (bot, order) {
        // 0.清空背包
        // 1.先傳送過去確認分流 位置 售價 是否可見
        // loop
        // 1. 
        await sleep(18000);
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)
        await containerOperation.updateInventory(bot)
        await this.depositInventory(bot)
        // INFO from order
        const buyWarp = order.extra_info.transfer_from
        const sellWarp = order.extra_info.transfer_to
        const itemmode = order.extra_info.transfer_type
        const buySignPos = order.extra_info.from_sign_pos ? new Vec3(order.extra_info.from_sign_pos.x, order.extra_info.from_sign_pos.y, order.extra_info.from_sign_pos.z) :
            new Vec3(0, 0, 0);
        const sellSignPos = order.extra_info.to_sign_pos ? new Vec3(order.extra_info.to_sign_pos.x, order.extra_info.to_sign_pos.y, order.extra_info.to_sign_pos.z) :
            new Vec3(0, 0, 0);
        let buyStandPos = order.extra_info.from_stand_pos ?
            new Vec3(order.extra_info.from_stand_pos.x, order.extra_info.from_stand_pos.y, order.extra_info.from_stand_pos.z) : buySignPos.offset(0, 1, 0);
        let sellStandPos = order.extra_info.to_stand_pos ?
            new Vec3(order.extra_info.to_stand_pos.x, order.extra_info.to_stand_pos.y, order.extra_info.to_stand_pos.z) : sellSignPos.offset(0, 1, 0);
        const count = order.extra_info.transfer_quantity
        // info from bot
        let buyServer, sellServer, selltype, buytype
        let buyPrice, sellPrice
        await sleep(17000)
        bot.logger(true, 'INFO', bot.username, `前往購買位置: ${buyWarp} 檢測資訊...`);
        bot.chat(buyWarp)
        await sleep(5000)
        buyServer = bot.botinfo.server
        for (let i = 0; i < 3; i++) {
            await pathfinder.astarfly(bot, buyStandPos, true)
            await sleep(500)
        }
        let buyBlock = bot.blockAt(buySignPos)
        if (buyBlock) {
            if (buyBlock.name.includes('sign')) {
                bot.logger(true, 'INFO', bot.username, `購買位置為sign`);
                buytype = 'sign';
                let shopInfo = await mcFallout.touchChestShop(bot, buySignPos, 5_000)
                if (shopInfo.owner == null) {
                    console.log(shopInfo)
                    bot.logger(true, 'ERROR', bot.username, `購買位置為sign 但商店不可見`);
                    return false;
                }
                if (shopInfo.count == 0) {
                    bot.logger(true, 'ERROR', bot.username, `購買位置為sign 但商店庫存為0`);
                    return false;
                }
            } else if (buyBlock.name.includes('chest') || buyBlock.name.includes('barrel')) {
                bot.logger(true, 'INFO', bot.username, `購買位置為barrel 或 chest`);
                buytype = 'chest';
            }
        } else {
            bot.logger(true, 'ERROR', bot.username, `購買位置不可見`);
            return false;
        }
        await sleep(17000)
        bot.logger(true, 'INFO', bot.username, `前往出售位置: ${sellWarp} 檢測資訊...`);
        bot.chat(sellWarp)
        await sleep(5000)
        sellServer = bot.botinfo.server
        for (let i = 0; i < 3; i++) {
            await pathfinder.astarfly(bot, sellStandPos, true)
            await sleep(500)
        }
        let sellBlock = bot.blockAt(sellSignPos)
        if (sellBlock) {
            if (sellBlock.name.includes('sign')) {
                bot.logger(true, 'INFO', bot.username, `出售位置為sign`);
                selltype = 'sign';
                let shopInfo = await mcFallout.touchChestShop(bot, sellSignPos, 5_000)
                if (shopInfo.owner == null) {
                    bot.logger(true, 'ERROR', bot.username, `出售位置為sign 但商店不可見`);
                    console.log(shopInfo)
                    return false;
                }
                // if(shopInfo.count == 0) {
                //     bot.logger(true, 'ERROR', bot.username, `出售位置為sign 但商店庫存為0`);
                //     return false;
                // }
            } else if (sellBlock.name.includes('chest') || sellBlock.name.includes('barrel')) {
                bot.logger(true, 'INFO', bot.username, `出售位置為barrel 或 chest`);
                selltype = 'chest';
            }
        } else {
            bot.logger(true, 'ERROR', bot.username, `出售位置不可見`);
            return false;
        }
        await sleep(7000) // to avoid disconnect
        bot.logger(true, 'INFO', bot.username, `購買分流: ${buyServer} 出售分流: ${sellServer}`);
        bot.logger(true, 'INFO', bot.username, `開始搬運`);
        let shouldEnd = false;
        let crtModeBit = 0, noslot = false, noitem = false;
        let sellShopNoFund = false
        bot.on("message", checkShopResult)
        for (let i = 0; i < 99999; i++) {
            if (shouldEnd) break;
            if (count != -1 && i >= count) break;
            if (sellShopNoFund) {
                bot.logger(true, 'INFO', bot.username, `店主 ${sellWarp} 收購金額不足`);
                break;
            }
            if (crtModeBit == 0) {
                // buy
                if (buyServer != bot.botinfo.server) {
                    await sleep(5000);
                    await mcFallout.teleportServer(bot, buyServer)
                }
                await sleep(1000)
                if (bot.entity.position.distanceTo(buySignPos) > 6) {
                    bot.chat(buyWarp)
                    await sleep(3000)
                    for (let i = 0; i < 3; i++) {
                        await pathfinder.astarfly(bot, buyStandPos, true)
                        await sleep(500)
                    }
                }
                let buyShopInfo = await mcFallout.touchChestShop(bot, buySignPos)
                // console.log(buyShopInfo)
                if (buyShopInfo.commodity_count > 0) {
                    bot.chat("/qs amount all")
                    await sleep(4000)
                } else if (buyShopInfo.commodity_count == 0) {
                    if (noitem) {
                        bot.logger(true, 'INFO', bot.username, `商店售出庫存為0 停止`);
                        shouldEnd = true;
                    } else {
                        noitem = true;
                        await sleep(5000);
                    }
                    continue
                }
                crtModeBit = !crtModeBit;
                noitem = false;
            } else if (crtModeBit == 1) {
                // sell
                if (sellServer != bot.botinfo.server) {
                    await sleep(5000);
                    await mcFallout.teleportServer(bot, sellServer)
                }
                await sleep(1000)
                await sleep(1000)
                if (bot.entity.position.distanceTo(sellSignPos) > 6) {
                    bot.chat(sellWarp)
                    await sleep(3000)
                    for (let i = 0; i < 3; i++) {
                        await pathfinder.astarfly(bot, sellStandPos, true)
                        await sleep(500)
                    }
                }
                let sellShopInfo = await mcFallout.touchChestShop(bot, sellSignPos)
                // console.log(sellShopInfo)
                if (sellShopInfo.space > 0) {
                    bot.chat("/qs amount all")
                    await sleep(4000)
                } else if (sellShopInfo.space == 0) {
                    if (noslot) {
                        bot.logger(true, 'INFO', bot.username, `商店收購空間為 0 停止`);
                        shouldEnd = true;
                    } else {
                        noslot = true;
                        await sleep(5000);
                    }
                    continue
                }
                crtModeBit = !crtModeBit;
                noslot = false;
            }
        }
        bot.logger(true, 'INFO', bot.username, `結束搬運`);
        bot.off("message", checkShopResult)
        await sleep(7000) // to avoid disconnect
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)
        await containerOperation.updateInventory(bot)
        await this.depositInventory(bot)
        function checkShopResult(jsonMsg) {
            let msg = jsonMsg.toString();
            // 檢測特定訊息並提取出數字
            // 帶商店prefix的僅提取括號內數字，並去掉逗號
            if (/這個商店僅能再購買\s*(\d+)\s*個該商品/.test(msg)) {
                let result = msg.match(/這個商店僅能再購買\s*(\d+)\s*個該商品/);
                if (result) {
                    // 應該是這裡沒錢停止
                    sellShopNoFund = true;
                    // shouldEnd = true;
                    let buyLimit = parseInt(result[1]);
                    bot.logger(false, 'INFO', bot.username, `商店剩餘可購買數量: ${buyLimit}`);
                    return buyLimit;
                }
            }
            // [JDLoveJD] ◆ 店主餘額不足。交易金額為 ＄650 元，但店主僅剩 ＄0.2 元
            if(msg.includes('店主餘額不足')){
                bot.logger(false, 'INFO', bot.username, `店主餘額不足`);
                shouldEnd = true
                return
            }
            // [商店]訊息，提取括號內金額，去除逗號
            if (/^\[商店\]/.test(msg)) {
                let money = msg.match(/[\(（]＄?([0-9\.,]+)元[\)）]/);
                if (money) {
                    let val = parseInt(money[1].replace(/,/g, ''));
                    bot.logger(false, 'INFO', bot.username, `獎勵金額: ${val}`);
                    return val;
                }
            }
            // 稅前收入行，提取稅前收入金額
            if (/稅前收入\s*([0-9,]+)元/.test(msg)) {
                let result = msg.match(/稅前收入\s*([0-9,]+)元/);
                if (result) {
                    let preTax = parseInt(result[1].replace(/,/g, ''));
                    bot.logger(false, 'INFO', bot.username, `稅前收入: ${preTax}`);
                    return preTax;
                }
            }

        }
    },
    unpackingorder: async function (bot, tgs) {
        for (let tg of tgs) {
            for (let i = 0; i < tg.quantity; i++) {
                try {
                    bot.logger(false, 'INFO', bot.username, `處理拆箱: ${tg.itemName} ${i + 1} / ${tg.quantity}`);
                    let winfo = await this.toWithdrawInfo(tg.itemName, 1, 'full_shulker')
                    // 取得物品
                    let operations = await this.getDeposit(this.cfg, winfo)
                    if (!operations || operations.length == 0) continue;
                    for (let operation of operations) {
                        let success = await this.executeOperation(bot, operation)
                        if (success) {
                            await this.commit(this.cfg, operation.id)
                        } else {
                            await this.rollback(this.cfg, operation.id)
                        }
                    }
                    // 拆箱
                    await containerOperation.closeWindow(bot)
                    for (let i = 0; i < 45; i++) {
                        let item = bot.inventory.slots[i]
                        if (!item) continue
                        let p = containerOperation.parseItem(item, bot)
                        if (p.isShulkerBox) {
                            await this.unpackShulker(bot, i)
                            await this.depositInventory(bot)
                        }
                    }
                } catch (err) {
                    bot.logger(false, 'ERROR', bot.username, `處理拆箱: ${tg.itemName} ${i + 1} / ${tg.quantity} 錯誤: ${err.message}`);
                }
            }
        }
        await this.depositInventory(bot)
    },
    packingorder: async function (bot, tgs) {
        for (let tg of tgs) {
            for (let i = 0; i < tg.quantity; i++) {
                try {
                    bot.logger(false, 'INFO', bot.username, `處理裝箱: ${tg.itemName} ${i + 1} / ${tg.quantity}`);
                    let winfo = await this.toWithdrawInfo(tg.itemName, tg.stacksize * 27, 'normal')
                    // 取得物品
                    let operations = await this.getDeposit(this.cfg, winfo)
                    if (!operations || operations.length == 0) continue;
                    for (let operation of operations) {
                        let success = await this.executeOperation(bot, operation)
                        if (success) {
                            await this.commit(this.cfg, operation.id)
                        } else {
                            await this.rollback(this.cfg, operation.id)
                        }
                    }
                    // 裝箱
                    await containerOperation.closeWindow(bot)
                    await sleep(100)
                    await this.packShulker(bot, tg)
                    await containerOperation.updateInventory(bot)
                    await sleep(200)
                    await this.depositInventory(bot)
                } catch (err) {
                    bot.logger(false, 'ERROR', bot.username, `處理裝箱: ${tg.itemName} ${i + 1} / ${tg.quantity} 錯誤: ${err.message}`);
                }
            }
        }
        await this.depositInventory(bot)
    },
    fixorder: async function (bot, contents) {
        for (let operation of contents) {
            // console.log(content)
            let standPos = new Vec3(operation.stand.x, operation.stand.y, operation.stand.z)
            let barrelPos = new Vec3(operation.barrel.x, operation.barrel.y, operation.barrel.z)
            tr: for (let tryCount = 0; tryCount < 8; tryCount++) {
                await this.depositInventory(bot)
                await pathfinder.astarfly(bot, standPos, null, null, null, true)
                let barrel = null
                for (let j = 0; j < 3; j++) {
                    await pathfinder.astarfly(bot, standPos, null, null, null, true)
                    await sleep(50)
                    barrel = await containerOperation.openContainerWithTimeout(bot, barrelPos, 1000)
                    await sleep(50)
                    if (barrel) {
                        break
                    }
                }
                if (barrel) {
                    let allclear = true;
                    for (let i = 0; i < 27; i++) {
                        let item = barrel.slots[i]
                        if (!item) continue;
                        let emptySlot = barrel.firstEmptyInventorySlot()
                        if (emptySlot === null) {
                            allclear = false;
                        }
                        await bot.simpleClick.leftMouse(i)
                        await bot.simpleClick.leftMouse(emptySlot)
                    }
                    await this.depositInventory(bot)
                    if (allclear) {
                        await pathfinder.astarfly(bot, standPos, null, null, null, true)
                        await this.upbyPos(bot, barrelPos)
                        break tr;
                    }
                }
            }

        }
    },
    // ── User & Misc ──
    linkUser: async function (cfg, username, verify) {
        console.log("綁定帳號", username, verify)
        let rs = await fetch(`http://${cfg.ip}:${cfg.port}/api/v1/link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `${cfg.token}`,
            },
            body: JSON.stringify({
                token: cfg.token,
                mcid: username,
                verify_code: verify
            })
        })
        let data = await rs.json()
        console.log(data)
        if (data.result == true || data.result == "ok" || data.result == "true") {
            return true
        } else {
            return false
        }
    },
    lastGlist: Date.now(),
    glistCD: 60_000,
    getGlist: async function (bot, cfg) {
        try {
            if (wms.warehouse_info.status != 'running') return;
            if (Date.now() - this.lastGlist < this.glistCD) {
                return
            }
            this.lastGlist = Date.now()
            let result = {}
            bot.on("message", mtTarget)
            bot.chat("/glist")
            let waitMSG = true;
            let stopMTTARGET = setTimeout(() => {
                try {
                    bot.off('message', mtTarget);
                    console.log("glist Timeout")
                } catch (e) {
                    console.log("glist Timeout 強制結束錯誤")
                }
                waitMSG = false
            }, 3000);
            async function mtTarget(jsonMsg) {
                let msg = jsonMsg.toString();
                let glistReg = /\[\w+\] \(\d+\): ([\s\w(,)*])*/g;
                let glistEnd = /Total players online: (\d+)/g;
                let crtServer = msg.split(']')[0].substr(1, this.length)
                if (msg.match(glistReg)) {
                    let m2 = msg.replace(/\s+/g, '')
                    let users = m2.split(':')[1].split(',');
                    result[crtServer] = users
                }
                if (msg.match(glistEnd)) {
                    bot.off('message', mtTarget);
                    clearTimeout(stopMTTARGET);
                    waitMSG = false
                }
            }
            while (waitMSG) {
                await sleep(50)
            }
            if (Object.keys(result).length == 0) return;
            return new Promise((resolve, reject) => {
                try {
                    fetch(`http://${cfg.ip}:${cfg.port}/api/v1/mcfallout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `${cfg.token}`
                        },
                        body: JSON.stringify({
                            token: cfg.token,
                            datatype: 'glist',
                            data: result,
                        })
                    })
                        .then(res => {
                            resolve(res)
                        })
                        .catch(err => {
                            // console.log('WMS API 錯誤:', err.message)
                            resolve()
                        })
                } catch (err) {
                    resolve()
                }
            })
        } catch (err) {
            // console.log(err)
        }
    },
    buyAtShop: async function (bot, order) {
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)
        const warp = order.picking_area
        const quantity = order.content[0].quantity
        bot.chat(`/warp ${warp}`)
        await sleep(3000)
        let firstcontent = order.content[0]
        let standpos = new Vec3(firstcontent.stand.x, firstcontent.stand.y, firstcontent.stand.z)
        let barrelpos = new Vec3(firstcontent.barrel.x, firstcontent.barrel.y, firstcontent.barrel.z)
        await pathfinder.astarfly(bot, standpos.offset(0, 30, 0), null, null, null, true)
        for (let tryCount = 0; tryCount < 3; tryCount++) {
            await pathfinder.astarfly(bot, standpos, null, null, null, true)
            await sleep(150)
        }
        try {
            bot._client.write('block_dig', {
                status: 0,
                location: barrelpos,
                face: 1
            })
            bot._client.write('block_dig', {
                status: 2,
                location: barrelpos,
                face: 1
            })
            await sleep(2000)
            bot.chat(`${quantity}`)
        } catch (err) {
            console.log(err)
        }
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)
        await this.gotoWarehouse(bot)
        await this.depositInventory(bot)

    }
}
async function collectItem(bot, p1, d) {
    let et = bot.entities;
    for (i in et) {
        let item = et[i];
        if (item?.name == 'item' && item?.onGround) {
            if (p1.distanceTo(item.position) > d) continue
            await pathfinder.astarfly(bot, new Vec3(Math.round(item.position.x - 0.5), Math.round(item.position.y), Math.round(item.position.z - 0.5)), null, null, null, true)
            await sleep(100)
        }
    }
}

module.exports = wms 
