const { sleep } = require('./common')
const { Vec3 } = require('vec3')
const wait = () => new Promise(setImmediate)
const { once } = require('events')
const mcFallout = require(`../lib/mcFallout`);
const containerOperation = {
    /**
     * 
     */
    async openContainerWithTimeout(bot, containerVec3, timeout) {
        await this.closeWindow(bot)
        await mcFallout.openPreventSpecItem(bot)
        const block = bot.blockAt(containerVec3)
        if (!block) {
            console.log("目標不可見")
            return null
        }
        // 自己掛 windowOpen listener 才能在 timeout 時 removeListener,
        // 用 bot.openBlock 的話它內部 bot.once 不會被清掉,失敗多次就 MaxListenersExceeded
        let onOpen = null
        let timer = null
        const cleanup = () => {
            if (timer) { clearTimeout(timer); timer = null }
            if (onOpen) { bot.removeListener('windowOpen', onOpen); onOpen = null }
        }
        try {
            const ct = await new Promise((resolve, reject) => {
                onOpen = (window) => resolve(window)
                bot.once('windowOpen', onOpen)
                timer = setTimeout(() => reject(new Error("開啟容器超時")), timeout)
                Promise.resolve(bot.activateBlock(block)).catch(reject)
            })
            cleanup()
            await sleep(50)
            if (String(ct.title ?? '').includes("跟您確認件事")) {
                console.log('點擊容器同意規範')
                await bot.simpleClick.leftMouse(30)
            }
            return ct
        } catch (e) {
            cleanup()
            console.log('[container] openContainerWithTimeout failed:', e.message)
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
        // bot.openVillager 必須保留 (callers 依賴 window.trades 與 villager.trade)。
        // 它內部 await once(bot, 'windowOpen') 註冊一次性 listener,timeout 時無法主動移除。
        // 對策: 背景 drain — 在 windowOpen 真的觸發時讓 listener 自然消費並關掉孤兒視窗。
        let timer = null
        let timedOut = false
        const openP = bot.openVillager(et)
        openP.then(win => {
            if (timedOut && win) {
                try { (win.close ? win.close() : bot.closeWindow(win)) } catch (_) { }
            }
        }, () => { /* swallow late rejection */ })
        try {
            const ct = await new Promise((resolve, reject) => {
                openP.then(resolve, reject)
                timer = setTimeout(() => {
                    timedOut = true
                    reject(new Error("開啟容器超時"))
                }, timeout)
            })
            clearTimeout(timer)
            await sleep(50)
            if (String(ct.title ?? '').includes("跟您確認件事")) {
                console.log('點擊容器同意規範')
                await bot.simpleClick.leftMouse(30)
            }
            return ct
        } catch (e) {
            if (timer) clearTimeout(timer)
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
                    const found = this.getShulkerMatchNBT(bot, container, item, 'withdraw')
                    if (!found) return false
                    await container.withdraw(realItemData.id, null, 1, typeof found === 'object' ? found : null);
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
                    const found = this.getShulkerMatchNBT(bot, container, item, 'deposit')
                    if (!found) return false
                    await container.deposit(realItemData.id, null, 1, typeof found === 'object' ? found : null);
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
        let st, ed
        if (t == 'withdraw') { st = 0; ed = container.inventoryStart }
        else { st = container.inventoryStart; ed = container.inventoryEnd }
        for (let i = st; i < ed; i++) {
            const it = container.slots[i]
            if (!it) continue
            const itemData = this.parseItem(it, bot)
            if (itemData.isShulkerBox && itemData.sameItemInShulkerBox && itemData.item == item) {
                // 1.21.4: it.nbt is null; return true to signal "found" with no nbt filter
                return it.nbt || true
            }
        }
        return null
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
            nbt: item.nbt || null,
        }
        if (item.name === 'shulker_box') result.isShulkerBox = true;

        // ── 1.21.4+ component path ────────────────────────────────────────
        if (item.componentMap && item.componentMap.size > 0) {
            // Components that indicate an item has been modified
            const haveNbtComponents = new Set([
                'custom_name','lore','enchantments','stored_enchantments',
                'damage','repair_cost','attribute_modifiers','unbreakable',
                'potion_contents','profile','custom_model_data','fireworks',
                'written_book_content','bundle_contents','hide_additional_tooltip',
                'map_id','suspicious_stew_effects','charged_projectiles',
            ]);
            for (const [type, comp] of item.componentMap) {
                if (type === 'container') {
                    if (result.isShulkerBox) {
                        const map = this.containerComponentToMap(comp.data, bot);
                        result.shulkerUsedSlot = this.containerComponentUsedSlot(comp.data);
                        if (map.size === 0) {
                            result.sameItemInShulkerBox = true;
                            result.count = 1;
                        } else if (map.size !== 1) {
                            result.sameItemInShulkerBox = false;
                        } else {
                            result.sameItemInShulkerBox = true;
                            result.item = map.keys().next().value;
                            result.count = map.get(result.item).count;
                        }
                    } else {
                        result.haveNBT = true;
                    }
                } else if (haveNbtComponents.has(type)) {
                    result.haveNBT = true;
                } else if (type === 'custom_data') {
                    // custom_data replaces old Bukkit/plugin NBT keys
                    const raw = JSON.stringify(comp.data || {});
                    if (raw.includes('blockllamaplugin') || raw.includes('PublicBukkitValues') ||
                        raw.includes('VV|') || raw.includes('VB|Protocol')) {
                        if (!result.isShulkerBox) result.haveNBT = true;
                    } else {
                        result.haveNBT = true;
                    }
                }
                // max_stack_size, max_damage, tool, food, equippable etc. are default item
                // properties sent by server — not "modified" in the WMS sense, ignore them.
            }
            if (result.isShulkerBox && result.sameItemInShulkerBox) {
                const tgmcdata = mcData.itemsByName[result.item];
                if (tgmcdata) {
                    if (result.count === tgmcdata.stackSize * 27) result.fullBox = true;
                } else {
                    console.log('找不到物品', result.item);
                }
            }
            return result;
        }

        // ── Legacy NBT path (pre-1.20.5) ─────────────────────────────────
        if (item.nbt) {
            const nbtValue = item.nbt.value;
            if (nbtValue) {
                for (const key in nbtValue) {
                    if (key === 'BlockEntityTag' && item.name === 'shulker_box') {
                        const map = this.blockEntityTagToMap(nbtValue[key])
                        result.shulkerUsedSlot = this.blockEntityTagUsedSlot(nbtValue[key])
                        if (map.size === 0) {
                            result.sameItemInShulkerBox = true; result.count = 1;
                        } else if (map.size !== 1) {
                            result.sameItemInShulkerBox = false;
                        } else {
                            result.sameItemInShulkerBox = true;
                            result.item = map.keys().next().value;
                            result.count = map.get(result.item).count;
                        }
                    } else if (key === 'BlockEntityTag') {
                        result.haveNBT = true;
                    } else if (key.includes('blockllamaplugin') || key.includes('PublicBukkitValues')) {
                        if (!result.isShulkerBox) result.haveNBT = true;
                    } else if (key.includes('VV|custom_data')) {
                        result.haveNBT = true;
                    } else if (key.includes('VV|DataComponents')) {
                        // stack size override, ignore
                    } else if (key.includes('VB|Protocol')) {
                        if (item.name !== 'shulker_box') result.notSameVersion = true;
                    } else if (key === 'display') {
                        if (result.notSameVersion) {
                            try {
                                const jsonv = JSON.parse(nbtValue[key].value.Name.value);
                                const parts = jsonv.text.split(' ');
                                result.crossVersion = parts[0];
                                result.crossVersionName = parts.slice(1).join(' ');
                            } catch (_) {}
                        } else {
                            result.haveNBT = true;
                        }
                    } else if (['RepairCost','Enchantments','Damage','Potion','CustomPotionEffects',
                                'HideFlags','SkullOwner','StoredEnchantments','map','CustomModelData',
                                'Fireworks','SafariNetData','AttributeModifiers','Unbreakable'].includes(key)) {
                        result.haveNBT = true;
                    } else {
                        console.log('未知NBT:', key, nbtValue[key]);
                        result.haveNBT = true;
                    }
                }
            }
        } else if (item.name === 'shulker_box') {
            result.count = item.count;
        }

        if (result.isShulkerBox && result.sameItemInShulkerBox) {
            const tgmcdata = mcData.itemsByName[result.item];
            if (!tgmcdata) { console.log('找不到物品', result.item); return result; }
            if (result.count === tgmcdata.stackSize * 27) result.fullBox = true;
        }
        return result;
    },
    getLores(item) {
        // 1.21.4+: customLore getter reads from 'lore' component
        const lore = item.customLore;
        if (lore != null) return lore;
        // Legacy NBT
        if (item.nbt?.value?.display?.value?.Lore?.value?.value) {
            return item.nbt.value.display.value.Lore.value.value;
        }
        return null;
    },
    getSignature(item) {
        const lores = this.getLores(item);
        if (!lores) return null;
        const nbtLib = require('prismarine-nbt');

        // 把任意 lore 行(NBT compound / NBT string / JSON 字串 / 已 simplify 的 chat component)
        // 攤平成 reading-order 的純 text 陣列。在這個陣列上找 [個人物品簽章] marker,後 2 格是 username。
        // 1.18.2 → 1.21.4 升版後 customLore 從 JSON 字串改成 compound,新舊路徑都得吃。
        const flatten = (raw) => {
            const out = [];
            if (raw == null) return out;
            let obj = raw;
            if (typeof raw === 'string') {
                // 既可能是純字串簽章內容,也可能是舊版 JSON-encoded chat component
                if (raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
                    try { obj = JSON.parse(raw); } catch { return [raw]; }
                } else {
                    return [raw];
                }
            } else if (raw && typeof raw === 'object' && raw.type && 'value' in raw) {
                // protodef NBT wrapper:用 prismarine-nbt simplify 攤成原生 JS
                try { obj = nbtLib.simplify(raw); } catch { return out; }
            }
            const visit = (v) => {
                if (v == null) return;
                if (typeof v === 'string') { out.push(v); return; }
                if (Array.isArray(v)) { for (const e of v) visit(e); return; }
                if (typeof v === 'object') {
                    if (typeof v.text === 'string') out.push(v.text);
                    if (Array.isArray(v.extra)) for (const e of v.extra) visit(e);
                }
            };
            visit(obj);
            return out;
        };

        const MARKER = '[個人物品簽章]';
        for (const rawLine of lores) {
            const texts = flatten(rawLine);
            for (let i = 0; i < texts.length; i++) {
                const t = texts[i];
                if (typeof t !== 'string') continue;
                if (!t.includes(MARKER)) continue;
                // marker 在 texts[i],下一格通常是分隔符,再下一格是 username
                const candidate = (texts[i + 2] || '').trim();
                if (candidate) return candidate;
                // 後援:整行 marker+username 合併寫成同一個 text 的情況
                const m = t.match(/\[個人物品簽章\][\s|│:：\-—]*\s*([\w一-鿿]+)/);
                if (m) return m[1];
            }
        }
        return null;
    },
    // 1.21.4+: container component → item name→count map (replaces blockEntityTagToMap)
    containerComponentToMap(containerData, bot) {
        const map = new Map();
        if (!containerData?.contents) return map;
        const mcData = require('minecraft-data')(bot.version);
        for (const rawSlot of containerData.contents) {
            if (!rawSlot || rawSlot.itemCount === 0) continue;
            const itemDef = mcData.items[rawSlot.itemId];
            if (!itemDef) continue;
            const key = itemDef.name;
            const count = rawSlot.itemCount;
            if (map.has(key)) {
                map.get(key).count += count;
            } else {
                map.set(key, { count, name: key });
            }
        }
        return map;
    },
    containerComponentUsedSlot(containerData) {
        if (!containerData?.contents) return 0;
        return containerData.contents.filter(s => s && s.itemCount > 0).length;
    },
    blockEntityTagUsedSlot(BlockEntityTag) {
        let u = 0;
        const items = BlockEntityTag.value.Items.value?.value;
        for (const item of items) {
            if (item.Count?.value == 0) continue;
            u++;
        }
        return u;
    },
    blockEntityTagToMap(BlockEntityTag) {
        const map = new Map();
        const items = BlockEntityTag.value.Items.value?.value;
        for (const item of items) {
            const key = item.id.value.replace('minecraft:', '');
            const count = item.Count.value;
            if (!map.has(key)) {
                map.set(key, { count, name: key });
            } else {
                map.get(key).count += count;
            }
        }
        return map;
    }
}
module.exports = containerOperation 
