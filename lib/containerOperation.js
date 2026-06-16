const { sleep } = require('./common')
const { Vec3 } = require('vec3')
const wait = () => new Promise(setImmediate)
const { once } = require('events')
const mcFallout = require(`../lib/mcFallout`);
const containerOperation = {
    // 由 openContainerWithTimeout 掛上的 container.containerPos 產生 log 用的座標標籤
    posTag(container) {
        const p = container && container.containerPos
        return p ? ` @(${p.x}, ${p.y}, ${p.z})` : ''
    },
    // 判斷是否為「跟您確認件事」規範同意視窗。
    // window.title 可能是字串(1.18.2 的 JSON 字串)或 chat component 物件(1.20.3+ NBT);
    // 用 String() 對物件會得到 "[object Object]" 比不到中文,故一律 JSON.stringify 後再比。
    _isRulesWindow(w) {
        let s = ''
        try { s = typeof w?.title === 'string' ? w.title : JSON.stringify(w?.title ?? '') } catch (_) { s = '' }
        return s.includes("跟您確認件事")
    },
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
        // 把「等下一個 windowOpen」抽成可重用片段:自己掛/清 listener,逾時 reject。
        // (不用 bot.openBlock,因其內部 bot.once 在逾時時無法清除 → MaxListenersExceeded)
        // mineflayer 是在整批 window_items 套用完才 emit windowOpen,故 resolve 時 slot 已填好。
        const waitOpen = (ms) => {
            let onOpen = null, timer = null
            const cleanup = () => {
                if (timer) { clearTimeout(timer); timer = null }
                if (onOpen) { bot.removeListener('windowOpen', onOpen); onOpen = null }
            }
            const promise = new Promise((resolve, reject) => {
                onOpen = (w) => { cleanup(); resolve(w) }
                bot.once('windowOpen', onOpen)
                timer = setTimeout(() => { cleanup(); reject(new Error("開啟容器超時")) }, ms)
            })
            return { promise, cleanup }
        }
        try {
            // 第一次:先掛 listener 再 activateBlock,避免漏接事件。
            const first = waitOpen(timeout)
            Promise.resolve(bot.activateBlock(block)).catch(() => { })
            let ct = await first.promise

            // 規範視窗:同意後「真正的容器」是下一個 windowOpen,必須重等,否則回傳的是規範 GUI
            // 而非桶子,後續 countRange 會讀錯。最多處理 2 輪(同意 → 可能再彈一次)。
            for (let guard = 0; guard < 2 && this._isRulesWindow(ct); guard++) {
                console.log('點擊容器同意規範')
                const next = waitOpen(timeout)
                await bot.simpleClick.leftMouse(30)
                try {
                    ct = await next.promise            // 同意後伺服器自動開的真正容器
                } catch (_) {
                    // 沒自動開 → 主動再點一次方塊重開
                    const retry = waitOpen(timeout)
                    Promise.resolve(bot.activateBlock(block)).catch(() => { })
                    ct = await retry.promise
                }
            }

            await sleep(50)
            // 記住此 window 對應的方塊座標,讓後續 withdraw/deposit 等 log 能標出容器位置
            try { ct.containerPos = containerVec3 } catch (_) { }
            return ct
        } catch (e) {
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
            if (this._isRulesWindow(ct)) {
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
            console.log(`背包已滿 取消${this.posTag(container)}`)
            return -1;
        }
        if (withdrawNeedSlot > invEmptySlot) {
            console.log(`背包空間不足 現有${invEmptySlot} 需要 ${withdrawNeedSlot} 最多取出 ${targerItem.stackSize * invEmptySlot} 數量${this.posTag(container)}`)
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
            if (!dontlog) console.log(`\x1b[31m取出 x${count} \x1b[36m${targerItem.name}\x1b[0m${this.posTag(container)}`);
        } catch (e) {
            console.log(`提取失敗${this.posTag(container)} Reason:`, e)
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
        container = await this.prepareDepositOffhand(bot, container, targerItem, count);
        if (!container) return -1;
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
            console.log(`盒子滿了${this.posTag(container)}`)
            return -1;
        }
        try {
            await container.deposit(targerItem.id, null, count, null);
            if (!dontlog) console.log(`\x1b[32m放入 x${count} \x1b[36m${targerItem.name}\x1b[0m${this.posTag(container)}`);
        } catch (e) {
            console.log(`放入失敗${this.posTag(container)} Reason: ${e}`)
            //console.log(e.stack)
        }
        return remain;
    },
    async prepareDepositOffhand(bot, container, targetItem, count) {
        if (count !== -1) return container;
        const offhand = bot.inventory?.slots?.[45];
        if (!offhand || offhand.type !== targetItem.id) return container;
        const containerPos = container?.containerPos;
        if (!containerPos) return container;
        try {
            await this.closeWindow(bot);
            await sleep(50);
            if (bot.inventory?.slots?.[45]?.type === targetItem.id) {
                await bot.unequip('off-hand');
                await sleep(100);
            }
            return await this.openContainerWithTimeout(bot, containerPos, 1000) || container;
        } catch (e) {
            console.log(`offhand deposit prepare failed${this.posTag(container)} Reason: ${e}`);
            return container;
        }
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
    // 回傳結構化結果 { ok, moved, expected, reason, steps }
    // steps: 給上層(executeOpCommit)組 tree 用的本次流程逐步描述。
    async wms_withdraw(bot, container, item, count, extra_info) {
        const steps = []
        const ret = (r) => ({ ...r, expected: count, steps })
        const mcData = require('minecraft-data')(bot.version)
        if (!container) { steps.push('✗ 無容器'); return ret({ ok: false, moved: 0, reason: 'no_container' }) }
        let realItem = item   // 要找的東西 可能是盒子
        let itemdata = mcData.itemsByName[realItem]
        if (!itemdata) { steps.push(`✗ 未知物品 ${realItem}`); return ret({ ok: false, moved: 0, reason: 'unknown_item' }) }
        let stackSize = itemdata.stackSize // 實際 stackSize
        if (extra_info == 'full_shulker') {
            realItem = 'shulker_box'
            stackSize = 1
        }
        let realItemData = mcData.itemsByName[realItem]
        const st = 0, ed = container.inventoryStart
        // P0: 桶子剛開啟時 window slot 尚未同步完成,直接 countRange 會讀到偏低(常為 0)的值,
        //     於是誤判 precheck_barrel_short。失敗後 rollback + upbyPos 會重開桶子讀到「真實有貨」
        //     並回報後端,後端再把同一個有貨的桶派回來 → 搬運又撞到同樣的同步競態,形成
        //     「桶內其實有貨卻一直短缺、永遠不前進」的死循環。改用 settleCount 等 slot 穩定再判斷。
        const containerRealItemCount = await this.settleCount(container, st, ed, realItemData.id)
        steps.push(`盒內 ${realItem} ×${containerRealItemCount}(需 ${count})`)
        // 桶內數量不足
        if (count > containerRealItemCount) {
            steps.push('✗ 桶內數量不足 → precheck_barrel_short')
            return ret({ ok: false, moved: 0, reason: 'precheck_barrel_short' })
        }
        // full_shulker: 上面數的是「任何 shulker_box」,桶內若混入別種內容的盒會在
        // moveShulkers 撞 no_match 才失敗。settleCount 已等過 slot 同步,這裡再用
        // 內容比對數一次「符合盒」,不足直接回 precheck_barrel_short,不浪費重試。
        if (extra_info == 'full_shulker') {
            const matchBoxes = this.countMatchingShulkers(bot, container, item, st, ed)
            if (matchBoxes !== containerRealItemCount) steps.push(`盒內符合盒 ×${matchBoxes}`)
            if (count > matchBoxes) {
                steps.push('✗ 桶內符合盒不足 → precheck_barrel_short')
                return ret({ ok: false, moved: 0, reason: 'precheck_barrel_short' })
            }
        }
        // P1: 開搬前先確認背包收得下,避免 partial / throw 進入不穩定狀態
        const invFree = this.invFreeSpaceFor(bot, realItemData.id, stackSize, extra_info)
        if (invFree < count) {
            steps.push(`✗ 背包空間不足 free=${invFree} → inventory_full`)
            return ret({ ok: false, moved: 0, reason: 'inventory_full' })
        }
        try {
            if (extra_info == 'full_shulker') {
                const r = await this.moveShulkers(bot, container, item, realItemData.id, count, 'withdraw')
                steps.push(r.ok ? `✓ 搬出整盒 ×${r.moved}` : `✗ 整盒搬運失敗 moved=${r.moved} ${r.reason}`)
                return { ...r, steps }
            }
            const before = container.countRange(st, ed, realItemData.id, null)
            await container.withdraw(realItemData.id, null, count, null);
            const after = await this.settleCount(container, st, ed, realItemData.id)
            const moved = Math.abs(before - after)
            if (moved !== count) {
                steps.push(`✗ 搬運量不符 moved=${moved} → delta_mismatch`)
                return ret({ ok: false, moved, reason: 'delta_mismatch' })
            }
            steps.push(`✓ 取出 ×${moved} ${realItem}`)
            return ret({ ok: true, moved })
        } catch (err) {
            steps.push(`✗ 例外 ${err.name}: ${err.message}`)
            return ret({ ok: false, moved: 0, reason: `exception:${err.name}` })
        }
    },
    async wms_deposit(bot, container, item, count, extra_info) {
        const steps = []
        const ret = (r) => ({ ...r, expected: count, steps })
        const mcData = require('minecraft-data')(bot.version)
        if (!container) { steps.push('✗ 無容器'); return ret({ ok: false, moved: 0, reason: 'no_container' }) }
        let realItem = item   // 要找的東西 可能是盒子
        let itemdata = mcData.itemsByName[realItem]
        if (!itemdata) { steps.push(`✗ 未知物品 ${realItem}`); return ret({ ok: false, moved: 0, reason: 'unknown_item' }) }
        let realItemStackSize = itemdata.stackSize // P1: 用真實 stackSize 而非固定 64
        if (extra_info == 'full_shulker') {
            realItem = 'shulker_box'
            realItemStackSize = 1
        }
        let realItemData = mcData.itemsByName[realItem]
        const st = 0, ed = container.inventoryStart
        // 同 wms_withdraw:settle 後再算桶內現有量,避免未同步的低讀數誤算可存空間。
        const containerRealItemCount = await this.settleCount(container, st, ed, realItemData.id)
        let inventoryCap = ed * realItemStackSize          // ed = 桶 slot 數 (27)
        let canStoreCount = inventoryCap - containerRealItemCount
        steps.push(`盒內 ${realItem} ×${containerRealItemCount} 可再放 ${canStoreCount}(需 ${count})`)
        if (count > canStoreCount) {
            steps.push('✗ 桶內空間不足 → precheck_barrel_full')
            return ret({ ok: false, moved: 0, reason: 'precheck_barrel_full' })
        }
        // P0: 來源側(背包)預檢。先前只檢查桶子空間,於是「背包其實沒有這個物品」的(過期/幽靈)
        //     存入請求會直接打到 container.deposit → mineflayer 在背包欄找不到該 type 而拋
        //     "Can't find <item> in slots [27 - 63]",且被重試 5 次反覆拋同樣的錯。
        //     這裡先確認背包確有足量;不足就回 inventory_short 且不動任何方塊
        //     (避免 partial 搬運造成 WMS 記錄與實體脫鉤)。
        //     full_shulker 同樣要做來源側預檢:之前漏檢,導致「盒子其實已全數入桶」的殘留
        //     重派單直接打進 moveShulkers → 背包找不到符合盒 → no_match 反覆重試 5 次。
        //     用 countMatchingShulkers 數背包內「內容為指定物品的 full shulker」盒數。
        if (extra_info == 'full_shulker') {
            const invBoxes = this.countMatchingShulkers(bot, container, item, ed, container.inventoryEnd)
            steps.push(`背包符合盒 ×${invBoxes}`)
            if (invBoxes < count) {
                steps.push('✗ 背包符合盒不足 → inventory_short')
                return ret({ ok: false, moved: 0, reason: 'inventory_short' })
            }
        } else {
            const invHave = container.countRange(ed, container.inventoryEnd, realItemData.id, null)
            steps.push(`背包 ${realItem} ×${invHave}`)
            if (invHave < count) {
                steps.push('✗ 背包數量不足 → inventory_short')
                return ret({ ok: false, moved: 0, reason: 'inventory_short' })
            }
        }
        try {
            if (extra_info == 'full_shulker') {
                const r = await this.moveShulkers(bot, container, item, realItemData.id, count, 'deposit')
                steps.push(r.ok ? `✓ 存入整盒 ×${r.moved}` : `✗ 整盒搬運失敗 moved=${r.moved} ${r.reason}`)
                return { ...r, steps }
            }
            const before = container.countRange(st, ed, realItemData.id, null)
            await container.deposit(realItemData.id, null, count, null);
            const after = await this.settleCount(container, st, ed, realItemData.id)
            const moved = Math.abs(after - before)
            if (moved !== count) {
                steps.push(`✗ 搬運量不符 moved=${moved} → delta_mismatch`)
                return ret({ ok: false, moved, reason: 'delta_mismatch' })
            }
            steps.push(`✓ 放入 ×${moved} ${realItem}`)
            return ret({ ok: true, moved })
        } catch (err) {
            steps.push(`✗ 例外 ${err.name}: ${err.message}`)
            return ret({ ok: false, moved: 0, reason: `exception:${err.name}` })
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
    // 等待 window slot 同步:連續讀 countRange 直到兩次一致或逾時 (~500ms)
    async settleCount(container, st, ed, id) {
        let prev = container.countRange(st, ed, id, null)
        for (let i = 0; i < 5; i++) {
            await sleep(100)
            const cur = container.countRange(st, ed, id, null)
            if (cur === prev) return cur
            prev = cur
        }
        return prev
    },
    // 計算 bot 背包可容納指定 item 的數量 (含未滿 stack 剩餘空間 + 空 slot)
    invFreeSpaceFor(bot, itemId, stackSize, extra_info) {
        const emptySlots = bot.inventory.emptySlotCount()
        if (extra_info == 'full_shulker') return emptySlots // shulker 不可疊,stackSize=1
        let free = emptySlots * stackSize
        for (const it of bot.inventory.items()) {
            if (it.type === itemId && it.count < stackSize) free += (stackSize - it.count)
        }
        return free
    },
    // 計算某側 (slots [st,ed)) 內「內容為 item 的 full shulker」盒數
    countMatchingShulkers(bot, container, item, st, ed) {
        let n = 0
        for (let i = st; i < ed; i++) {
            const it = container.slots[i]
            if (!it) continue
            const itemData = this.parseItem(it, bot)
            if (itemData.isShulkerBox && itemData.sameItemInShulkerBox && itemData.item == item) n++
        }
        return n
    },
    // 逐顆搬 full shulker,每顆驗證搬的是「指定內容」的盒 (來源 -1 / 目的 +1)
    async moveShulkers(bot, container, item, shulkerId, count, dir) {
        let srcSt, srcEd, dstSt, dstEd
        if (dir === 'withdraw') {
            srcSt = 0; srcEd = container.inventoryStart
            dstSt = container.inventoryStart; dstEd = container.inventoryEnd
        } else {
            srcSt = container.inventoryStart; srcEd = container.inventoryEnd
            dstSt = 0; dstEd = container.inventoryStart
        }
        for (let c = 0; c < count; c++) {
            const found = this.getShulkerMatchNBT(bot, container, item, dir)
            if (!found) return { ok: false, moved: c, expected: count, reason: 'no_match' }
            const beforeSrc = this.countMatchingShulkers(bot, container, item, srcSt, srcEd)
            const beforeDst = this.countMatchingShulkers(bot, container, item, dstSt, dstEd)
            const matcher = typeof found === 'object' ? found : null
            if (dir === 'withdraw') await container.withdraw(shulkerId, null, 1, matcher)
            else await container.deposit(shulkerId, null, 1, matcher)
            // P0: 不能用 settleCount(0, inventoryEnd, shulkerId) 等同步 —— 搬運是窗內換邊,
            //     整窗 shulker 總數搬前搬後不變,settleCount 第一輪就回報「穩定」,等於沒等。
            //     接著讀到未同步的 slot → delta 0/0 → 誤判 mismatch,但盒子實際已搬成功,
            //     於是上層 rollback + 重派,而貨已不在來源側 → 後續全部 no_match 死循環。
            //     改成輪詢「匹配盒的兩側計數」直到反映本次搬運(src -1 且 dst +1)或逾時。
            let afterSrc = beforeSrc, afterDst = beforeDst
            for (let i = 0; i < 15; i++) {
                await sleep(100)
                afterSrc = this.countMatchingShulkers(bot, container, item, srcSt, srcEd)
                afterDst = this.countMatchingShulkers(bot, container, item, dstSt, dstEd)
                if (beforeSrc - afterSrc === 1 && afterDst - beforeDst === 1) break
            }
            if (beforeSrc - afterSrc !== 1 || afterDst - beforeDst !== 1) {
                // 兩側計數逾時仍無變化 → 很可能 click 沒生效(沒搬動);有變化但 delta 不是
                // -1/+1 → 搬錯盒(非指定內容)。分開回報,方便上層與 log 判讀。
                const untouched = (afterSrc === beforeSrc && afterDst === beforeDst)
                return { ok: false, moved: c, expected: count, reason: untouched ? 'move_not_observed' : 'shulker_content_mismatch' }
            }
        }
        return { ok: true, moved: count, expected: count }
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
            hasCustomName: false,
            contentsHaveNBT: false,
            notSameVersion: false,
            crossVersionName: null,
            crossVersion: null,
            fullBox: false,
            nbt: item.nbt || null,
        }
        if (item.name.includes('shulker_box')) result.isShulkerBox = true;

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
                        result.contentsHaveNBT = this.containerComponentContentsHaveNBT(comp.data);
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
                    if (result.isShulkerBox && type === 'custom_name') result.hasCustomName = true;
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
                        result.contentsHaveNBT = this.blockEntityTagContentsHaveNBT(nbtValue[key]);
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
                            if (result.isShulkerBox) result.hasCustomName = true;
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
    containerComponentContentsHaveNBT(containerData) {
        if (!containerData?.contents) return false;
        const nbtTypes = new Set([
            'custom_name','lore','enchantments','stored_enchantments',
            'damage','repair_cost','attribute_modifiers','unbreakable',
            'potion_contents','profile','custom_model_data','fireworks',
            'written_book_content','bundle_contents','hide_additional_tooltip',
            'map_id','suspicious_stew_effects','charged_projectiles',
            'custom_data','container',
        ]);
        for (const rawSlot of containerData.contents) {
            if (!rawSlot || rawSlot.itemCount === 0) continue;
            if (Array.isArray(rawSlot.components)) {
                for (const comp of rawSlot.components) {
                    if (nbtTypes.has(comp.type)) return true;
                }
            }
        }
        return false;
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
    blockEntityTagContentsHaveNBT(BlockEntityTag) {
        const items = BlockEntityTag.value.Items?.value?.value;
        if (!items) return false;
        for (const item of items) {
            if (item.tag) return true;
        }
        return false;
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
