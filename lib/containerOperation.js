const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const { Vec3 } = require('vec3')
const wait = () => new Promise(setImmediate)
const { once } = require('events')
const mcFallout = require(`../lib/mcFallout`);
const containerOperation = {
    /**
     * 
     */
    async openContainerWithTimeout(bot, containerVec3, timeout) {
        await mcFallout.openPreventSpecItem(bot)
        let block = bot.blockAt(containerVec3)
        if (!block) {
            console.log("目標不可見")
            return null
        }
        let fail = false
        try {
            let result = await new Promise(async (res, rej) => {
                const to = setTimeout(() => {
                    fail = true;
                    rej(new Error("開啟容器超時"))
                }, timeout)
                let ct = await bot.openBlock(block)
                if (!fail) {
                    await sleep(50)
                    if (ct.title.includes("跟您確認件事")) {
                        console.log('點擊容器同意規範')
                        await bot.simpleClick.leftMouse(30)
                    }
                    res(ct)
                }
            })
            return result  // why not just return the promise?

        } catch (e) {
            // console.log("開啟容器失敗", e)
            return null
        }
    },
    /**
    * 
    */
    async openVillagerWithTimeout(bot, et, timeout) {
        await mcFallout.openPreventSpecItem(bot)
        if (!bot.entities[et.id]) {
            //   console.log(`[${bot.username}] 村民 ${villager.id} 實體已消失，無法開啟視窗。`);
            return false;
        }
        if (et.name != 'villager') {
            return false;
        }
        let fail = false
        // console.log(et)
        try {
            let result = await new Promise(async (res, rej) => {
                const to = setTimeout(() => {
                    fail = true;
                    rej(new Error("開啟容器超時"))
                }, timeout)
                let ct = await bot.openVillager(et)
                // let ct = await bot.openEntity(et)
                if (!fail) {
                    await sleep(50)
                    if (ct.title.includes("跟您確認件事")) {
                        console.log('點擊容器同意規範')
                        await bot.simpleClick.leftMouse(30)
                    }
                    res(ct)
                }
            })
            return result  // why not just return the promise?

        } catch (e) {
            // console.log("開啟容器失敗", e)
            return null
        }
    },
    /**
     * 從容器中提取指定數量物品
     * @param  {object} bot - bot.
     * @param  {object} container - container實例.
     * @param  {(number|string)} id - id或name都可以.
     * @param {number} count - 數量
     * @param {boolean} dontlog - 不顯示信息
     * @param {number} reserve - 預留空間
     * @returns {number} - 未完成數量(如inv還夠)
     */
    async withdraw(bot, container, id, count, dontlog, reserve) {
        //count -1 to withdraw ALL
        //id -1 to withdraw ALL type 
        //console.log(container)
        const mcData = require('minecraft-data')(bot.version)
        let targerItem;
        let remain = 0;
        if (Number.isInteger(id)) targerItem = mcData.items[id];
        else targerItem = mcData.itemsByName[id];
        if (reserve == null || reserve == undefined) reserve = 0;
        if (dontlog == null || dontlog == undefined) dontlog = false;
        let targetItemInContainerCount = container.countRange(0, container.inventoryStart, targerItem.id, null);
        //console.log(`容器內有 ${targetItemInContainerCount}`);
        if (count > targetItemInContainerCount) {
            remain = count - targetItemInContainerCount;
            count = targetItemInContainerCount;
        }
        let withdrawNeedSlot = Math.ceil(count / targerItem.stackSize);
        let invEmptySlot = bot.inventory.emptySlotCount() - reserve;
        //console.log(`withdrawNeedSlot ${withdrawNeedSlot} invEmptySlot ${invEmptySlot}`);
        if (invEmptySlot < 1) {
            console.log('背包已滿 取消')
            return -1;
        }
        if (withdrawNeedSlot > invEmptySlot) {
            console.log(`背包空間不足 現有${invEmptySlot} 需要 ${withdrawNeedSlot} 最多取出 ${targerItem.stackSize * invEmptySlot} 數量`)
            count = targerItem.stackSize * invEmptySlot;
            remain = 0;
        }
        try {
            if (count == 0) return -2; //盒內無
            try {
                await container.withdraw(targerItem.id, null, count, null);
            } catch (error) {
                //if(error.toString().include('destination full')){}
                // else throw error 
            }
            if (!dontlog) console.log(`\x1b[31m取出 x${count} \x1b[36m${targerItem.name}\x1b[0m`);
        } catch (e) {
            console.log('提取失敗 Reason:', e)
            //console.log(e)
        }
        return remain;
    },
    /**
     * 放入容器指定數量物品
     * @param  {object} bot - bot.
     * @param  {object} container - container實例.
     * @param  {(number|string)} id - id或name都可以.
     * @param {number} count - 數量 (-1 全放)
     * @param {boolean} dontlog - 不顯示信息
     * @returns {number} - 未完成數量
     */
    async deposit(bot, container, id, count, dontlog) {
        //count -1 to deposit ALL
        //id -1 to deposit ALL type 
        const mcData = require('minecraft-data')(bot.version)
        let targerItem;
        let remain = 0;
        if (Number.isInteger(id)) targerItem = mcData.items[id];
        else targerItem = mcData.itemsByName[id];
        if (dontlog == null || dontlog == undefined) dontlog = false;
        //console.log(container)
        let targetItemInInvCount = container.countRange(container.inventoryStart, container.inventoryEnd, targerItem.id, null);
        let targetItemInContainerCount = container.countRange(0, container.inventoryStart, targerItem.id, null);
        if (count == -1) count = targetItemInInvCount;
        if (count == 0) return 0;
        else if (count > targetItemInInvCount) count = targetItemInInvCount;
        let maxCanDeposit = container.inventoryStart * targerItem.stackSize - targetItemInContainerCount;
        if (count > maxCanDeposit) {
            remain = count - maxCanDeposit;
            count = maxCanDeposit;
        }
        if (count <= 0) {
            console.log('盒子滿了')
            return -1;
        }
        try {
            await container.deposit(targerItem.id, null, count, null);
            if (!dontlog) console.log(`\x1b[32m放入 x${count} \x1b[36m${targerItem.name}\x1b[0m`);
        } catch (e) {
            console.log(`放入失敗 Reason: ${e}`)
            //console.log(e.stack)
        }
        return remain;
    },
    async throw_slot(bot, slot, dontlog = false) {
        //5-8 armor 
        //9-44 inv
        //45 second-hand
        if (slot < 5 || slot > 45) return;
        if (bot.currentWindow) {
            console.log(bot.currentWindow?.title ?? 'Inventory');
            console.log("嘗試關閉當前視窗")
            bot.closeWindow(bot.currentWindow)
        }
        if (bot.inventory.slots[slot] != null) {
            if (!dontlog) {
                bot.logger(false, 'INFO', process.argv[2], `丟棄 slot: ${slot} - ${bot.inventory.slots[slot].name} x${bot.inventory.slots[slot].count}`)
            }
            bot.tossStack(bot.inventory.slots[slot])
            await sleep(50);
        }

    },
    async name(params) {

    },
    async closeWindow(bot) {
        if (bot.currentWindow) {
            // console.log(bot.currentWindow?.title ?? 'Inventory');
            // console.log("嘗試關閉當前視窗")
            bot.closeWindow(bot.currentWindow)
        }
    },
    async updateInventory(bot) {
        await new Promise((resolve, reject) => {
            // 使用 interval 定期發送請求
            const interval = setInterval(() => {
                bot.chat('/bank')
            }, 1500);

            const timeout = setTimeout(() => {
                // 移除監聽器避免記憶體洩漏
                bot._client.removeListener('set_slot', onWindowItems);
                reject(new Error('更新物品欄超時'));
            }, 7000);

            const onWindowItems = () => {
                clearTimeout(timeout);
                clearInterval(interval);
                bot._client.removeListener('set_slot', onWindowItems);
                resolve();
            };

            bot.chat('/bank')
            bot._client.on('set_slot', onWindowItems);
        });
        try {
            bot.closeWindow(bot.currentWindow);
        } catch (err) {
            // console.log(err)
        }
    },
    // 還沒寫檢查背包空間
    async wms_withdraw(bot, container, item, count, extra_info) {
        const mcData = require('minecraft-data')(bot.version)
        if (!container) return false
        let realItem = item   // 要找的東西 可能是盒子
        let realItemStackSize = 64
        let itemdata = mcData.itemsByName[realItem]
        let stacksize = itemdata.stackSize // 實際數量
        if (extra_info == 'full_shulker') {
            realItem = 'shulker_box'
            realItemStackSize = 1
        }
        let realItemData = mcData.itemsByName[realItem]
        let containerRealItemCount = container.countRange(0, 27, realItemData.id, null)
        if (count > containerRealItemCount) {
            return false
        }
        try {
            if (extra_info == 'full_shulker') {
                for (let c = 0; c < count; c++) {
                    let nbt = this.getShulkerMatchNBT(bot, container, item, 'withdraw')
                    if (!nbt) return false
                    await container.withdraw(realItemData.id, null, 1, nbt);
                }
            } else {
                await container.withdraw(realItemData.id, null, count, null);
            }
            return true
        } catch (err) {
            console.log(err.name, err.message)
            return false
        }

    },
    async wms_deposit(bot, container, item, count, extra_info) {
        const mcData = require('minecraft-data')(bot.version)
        if (!container) return false
        let realItem = item   // 要找的東西 可能是盒子
        let realItemStackSize = 64
        let itemdata = mcData.itemsByName[realItem]
        let stacksize = itemdata.stackSize // 實際數量
        if (extra_info == 'full_shulker') {
            realItem = 'shulker_box'
            realItemStackSize = 1
        }
        let realItemData = mcData.itemsByName[realItem]
        let containerRealItemCount = container.countRange(0, 27, realItemData.id, null)
        let inventoryCap = 27 * realItemStackSize
        let canStoreCount = inventoryCap - containerRealItemCount
        if (count > canStoreCount) {
            return false
        }
        try {
            if (extra_info == 'full_shulker') {
                for (let c = 0; c < count; c++) {
                    let nbt = this.getShulkerMatchNBT(bot, container, item, 'deposit')
                    if (!nbt) return false
                    await container.deposit(realItemData.id, null, 1, nbt);
                }
            } else {
                await container.deposit(realItemData.id, null, count, null);
            }
            return true
        } catch (err) {
            // console.log(err)
            console.log(err.name, err.message)
            return false
        }
    },
    getShulkerMatchNBT(bot, container, item, t) {
        let nbt = null
        let st, end
        if (t == 'withdraw') {
            st = 0
            ed = container.inventoryStart
        } else {
            st = container.inventoryStart
            ed = container.inventoryEnd
        }
        for (let i = st; i < ed; i++) {
            let it = container.slots[i]
            if (!it) continue
            let itemData = this.parseItem(it, bot)
            if (itemData.isShulkerBox && itemData.sameItemInShulkerBox && itemData.item == item) {
                nbt = it.nbt
                break;
            }
        }
        return nbt
    },
    parseItem(item, bot) {
        const mcData = require('minecraft-data')(bot.version)
        const result = {
            isShulkerBox: false,
            sameItemInShulkerBox: null,
            shulkerUsedSlot: 0,
            item: item.name,
            count: item.count,
            haveNBT: false,
            notSameVersion: false,
            crossVersionName: null,
            crossVersion: null,
            fullBox: false,
            nbt: null,
        }
        if (item.name == "shulker_box") {
            result.isShulkerBox = true
        } else {
            result.count = item.count
        }
        if (item.nbt) {
            result.nbt = item.nbt
            // 遍歷 NBT 結構
            const nbtValue = item.nbt?.value
            if (nbtValue) {
                // 遍歷所有 NBT key
                for (const key in nbtValue) {
                    // console.log(key)
                    if (key == "BlockEntityTag" && item.name == "shulker_box") {
                        const map = this.blockEntityTagToMap(nbtValue[key])
                        result.shulkerUsedSlot = this.blockEntityTagUsedSlot(nbtValue[key])
                        if (map.size === 0) {
                            // 這裡應該不會執行到 空盒直接沒有nbt
                            // console.log("盒子內沒有物品")
                            result.sameItemInShulkerBox = true
                            result.count = 1;
                        } else if (map.size !== 1) {
                            result.sameItemInShulkerBox = false
                        } else {
                            result.sameItemInShulkerBox = true
                            result.item = map.keys().next().value
                            result.count = map.get(result.item).count
                        }
                    } else if (key == "BlockEntityTag") {
                        result.haveNBT = true
                    } else if (key.includes("blockllamaplugin")) {
                        result.haveNBT = true
                    } else if (key.includes("PublicBukkitValues")) {
                        if (result.isShulkerBox) {
                            //result.haveNBT = true
                        } else {
                            result.haveNBT = true
                        }
                    } else if (key.includes("VV|custom_data")) {
                        result.haveNBT = true
                    } else if (key.includes("VV|DataComponents")) {
                        // 這裡可以重新設定stacksize    
                    } else if (key.includes("VB|Protocol")) {
                        if (item.name != "shulker_box") {
                            result.notSameVersion = true
                            // if (key.includes("|custom_data")) {
                            //     result.crossVersionName = nbtValue[key]
                            // } else if (key.includes("|id")) {
                            //     result.crossVersionName = nbtValue[key]
                            // } else if (key.includes("|added_custom_name")) {
                            //     result.crossVersionName = nbtValue[key]
                            //     // console.log(nbtValue[key]?.value?.display?.value)
                            // }
                        }
                    } else if (key == "display") {
                        // console.log(key)
                        // console.log(nbtValue[key])
                        if (result.notSameVersion) {
                            try {
                            // value: '{"color":"white","text":"1.21 Heavy Core","italic":false}'
                            let jsonv = JSON.parse(nbtValue[key].value.Name.value)
                                // console.log(nbtValue[key].value.Lore.value.value)
                                // let jsonv = JSON.parse(nbtValue[key].value.Lore.value.value[0])
                                let parts = jsonv.text.split(" ")
                                result.crossVersion = parts[0]
                                result.crossVersionName = parts.slice(1).join(" ")
                            } catch (err) {
                                // console.log(err)
                            }
                        } else {
                            result.haveNBT = true
                        }
                    } else if (key == "RepairCost") {
                        result.haveNBT = true
                    } else if (key == "Enchantments") {
                        result.haveNBT = true
                    } else if (key == "Damage") {
                        result.haveNBT = true
                    } else if (key == "Potion") {
                        result.haveNBT = true
                    } else if (key == "CustomPotionEffects") {
                        result.haveNBT = true
                    } else if (key == "HideFlags") {
                        result.haveNBT = true
                    } else if (key == "SkullOwner") {
                        result.haveNBT = true
                    } else if (key == "StoredEnchantments") {
                        result.haveNBT = true
                    } else if (key == "map") {
                        result.haveNBT = true
                    } else if (key == "CustomModelData") {
                        result.haveNBT = true
                    } else if (key == "Fireworks") {
                        result.haveNBT = true
                    } else if (key == "SafariNetData") {
                        result.haveNBT = true // spawn_egg
                    } else if (key == "AttributeModifiers") {
                        result.haveNBT = true // spawn_egg
                    } else if (key == "Unbreakable") {
                        result.haveNBT = true // 耐久
                    } else {
                        console.log("未知NBT:", key, nbtValue[key])
                        result.haveNBT = true
                        // console.log(`${key}:`, nbtValue[key])
                    }
                }
            }
        } else {
            if (item.name == "shulker_box") {
                // console.log("空盒")
                result.count = item.count;
            }
        }
        if (result.isShulkerBox && result.sameItemInShulkerBox) {
            let tgmcdata = mcData.itemsByName[result.item]
            if (!tgmcdata) {
                console.log('找不到物品', result.item)
                return result
            }
            let max = tgmcdata.stackSize * 27
            if (result.count == max) {
                result.fullBox = true
            }
        }
        return result
    },
    getLores(item) {
        if (item.nbt?.value?.display?.value?.Lore?.value?.value) {
            return item.nbt?.value?.display?.value?.Lore?.value?.value
        }
        return null
    },
    getSignature(item) {
        let lores = this.getLores(item)
        if (lores) {
            for (let i = 0; i < lores.length; i++) {
                if (lores[i].indexOf('[個人物品簽章]') >= 0) {
                    let json = JSON.parse(lores[i])
                    for (let j = 0; j < json.extra.length; j++) {
                        if (json.extra[j].text === '[個人物品簽章] ') {
                            return json.extra[j + 2].text
                        }
                    }
                    return null
                }
            }
        }
        return null
    },
    blockEntityTagUsedSlot(BlockEntityTag) {
        let u = 0;
        const items = BlockEntityTag.value.Items.value?.value;
        for (const item of items) {
            // console.log(item)
            if (item.Count?.value == 0) continue;
            u++;
        }
        return u;
    },
    blockEntityTagToMap(BlockEntityTag) {
        // BlockEntityTag: {
        //     type: 'compound',
        //     value: { Items: { type: 'list', value: [Object] } }
        //   }
        const map = new Map();
        const items = BlockEntityTag.value.Items.value?.value;
        for (const item of items) {
            const key = item.id.value.replace('minecraft:', '');
            const count = item.Count.value;
            if (!map.has(key)) {
                map.set(key, {
                    count: count,
                    name: key,
                });
            } else {
                const existing = map.get(key);
                existing.count += count;
            }
        }
        return map;
    }
}
module.exports = containerOperation 
