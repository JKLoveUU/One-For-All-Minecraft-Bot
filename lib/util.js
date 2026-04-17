const pathfinder = require(`../lib/pathfinder`);
const containerOperation = require(`../lib/containerOperation`);
const { QUICKBAR_WHITELIST, HOE_BLOCKS } = require('./constants')
let quickbar_whitelist = [...QUICKBAR_WHITELIST]
const { Vec3 } = require('vec3')
const v = require('vec3')
const wait = () => new Promise(setImmediate)
const { sleep } = require('./common')
const { once } = require('events')
const utils = {
    collectDropItem: async function (bot, p1, p2, item) {
        let et = bot.entities
        for (i in et) {
            if (et[i]?.name == 'item') {//&& et[i]?.onGround
                if (!this.itemInPos(et[i].position, p1, p2)) continue
                await pathfinder.astarfly(bot, new Vec3(Math.round(et[i].position.x - 0.5), Math.round(et[i].position.y), Math.round(et[i].position.z - 0.5)), null, null, null, true)
                await sleep(100)
            }
        }
    },
    itemInPos: function (itempos, p1, p2) {
        if (p1.x > p2.x) [p1.x, p2.x] = [p2.x, p1.x]
        if (p1.y > p2.y) [p1.y, p2.y] = [p2.y, p1.y]
        if (p1.z > p2.z) [p1.z, p2.z] = [p2.z, p1.z]
        if (itempos.x < p1.x - 0.5 || itempos.y < p1.y || itempos.z < p1.z) return false;
        if (itempos.x > p2.x + 0.5 || itempos.y > p2.y + 1 || itempos.z > p2.z) return false;
        return true;
    },
    placeShulker: async function (bot, pos) {
        Item = require('prismarine-item')(bot.version)
        mcData = require('minecraft-data')(bot.version)
        const packet = {
            location: pos,
            direction: 1,
            heldItem: Item.toNotch(bot.inventory.slots[bot.quickBarSlot + 36]),
            hand: 0,
            cursorX: 0.5,
            cursorY: 0.5,
            cursorZ: 0.5
        }
        bot._client.write('block_place', packet);
    },
    digBlock: async function (bot, pos, dt = 500, cheat = true) {
        targetBlock = bot.blockAt(pos)
        await this.prepareTool(bot, targetBlock)
        if (cheat) {
            bot._client.write("abilities", {
                flags: 0b0000,
                flyingSpeed: 1.0,
                walkingSpeed: 1.0
            })
        }
        bot._client.write('block_dig', {
            status: 0,
            location: targetBlock.position,
            face: 1
        })
        let dd = bot.digTime(targetBlock)
        if (dd == 0) dd = dt
        await sleep(dd)
        bot._client.write('block_dig', {
            status: 2,
            location: targetBlock.position,
            face: 1
        })
    },
    
    clearSecond: async function (bot) {
        if (!bot.inventory.slots[45]) return
        let free = null
        for (let idx = 9; idx <= 44; idx++) {
            if (bot.inventory.slots[idx] == null) {
                free = idx;
                break;
            }
    
        }
        if (free) {
            await bot.simpleClick.leftMouse(45)
            await bot.simpleClick.leftMouse(free)
        }
    
    
    },
    
    prepareTool: async function (bot, targetBlock) {
        let hoelist = HOE_BLOCKS
        let needTool = targetBlock.material//最佳材料
        // console.log(needTool);
        if (needTool == 'default') {
    
        } else {
            let chosetool, allTool
            try {
                let toolAllmumber = needTool.toString().split('/');
                chosetool = toolAllmumber[1]
                if (chosetool == undefined) chosetool = "pickaxe"
                allTool = "netherite_" + chosetool
                if (hoelist.includes(targetBlock.name)) allTool = "netherite_hoe"
                let bestTool = bot.inventory.findInventoryItem(mcData.itemsByName[allTool].id, null, false)
                await this.equip(bot, allTool)
                // await bot.equip(bestTool, "hand")
                // await sleep(50)
            } catch (e) {
            }
        }
    },
    placePlant: async function (bot, itemname, pos) {
        Item = require('prismarine-item')(bot.version)
        mcData = require('minecraft-data')(bot.version)
        await this.equip(bot, itemname, false);
        const packet = {
            location: pos,
            direction: 1,
            // face: 0,
            heldItem: Item.toNotch(bot.inventory.slots[bot.quickBarSlot + 36]),
            hand: 0,
            cursorX: 0.5,
            cursorY: 1,
            cursorZ: 0.5,
            insideBlock: true
        }
        bot._client.write('block_place', packet);
    }, 
    placeBlock: async function (bot, itemname, pos) {
        Item = require('prismarine-item')(bot.version)
        mcData = require('minecraft-data')(bot.version)
        await this.equip(bot, itemname, false);
        const packet = {
            location: pos,
            direction: 1,
            heldItem: Item.toNotch(bot.inventory.slots[bot.quickBarSlot + 36]),
            cursorX: 0.5,
            cursorY: 0.5,
            cursorZ: 0.5
        }
        bot._client.write('block_place', packet);
    },
    equipFortune: async function (bot, silk = false) {
        await containerOperation.closeWindow(bot)      
        let tg = false ? 45 : bot.quickBarSlot + 36
        let sel = null
        // quickbar
        for (let i = 36; i <= 44; i++) {
            if (bot.inventory.slots[i]&&bot.inventory.slots[i].enchants?.length) {
                for (const en of bot.inventory.slots[i].enchants) {
                    if (!silk && en.name == 'fortune') {
                        if(bot.quickBarSlot + 36!=i){
                            await bot.setQuickBarSlot(i - 36)
                            return
                        }
                    } else if (silk && en.name == 'silk_touch') {
                        if(bot.quickBarSlot + 36!=i){
                            await bot.setQuickBarSlot(i - 36)
                            return
                        }
                    }
                }
            }
        }
        const items = bot.inventory.items()
        for (const sw of items) {
            if (sw?.enchants?.length && sw.slot != tg) {
                for (const en of sw?.enchants) {
                    if (!silk && en.name == 'fortune') {
                        sel = sw.slot
                        break
                    } else if (silk && en.name == 'silk_touch') {
                        sel = sw.slot
                        break
                    }
                }
            }
        }
        if (sel>36 && sel<45) {
            await bot.setQuickBarSlot(sel-36)
            return
        }
        if (sel) {
            await bot.simpleClick.leftMouse(sel)
            await bot.simpleClick.leftMouse(tg)
            await bot.simpleClick.leftMouse(sel)
        }
    }
    ,
    equipByambName: async function (bot, itemname, secondHand = false) {
        const items = bot.inventory.items()
        let tg = secondHand ? 45 : bot.quickBarSlot + 36
        let sel = null
        for (const sw of items) {
            if (sw?.name.includes(itemname) && sw.slot != tg) {
                sel = sw.slot
                break;
            }
        }
        if (sel) {
            await bot.simpleClick.leftMouse(sel)
            await bot.simpleClick.leftMouse(tg)
            await bot.simpleClick.leftMouse(sel)
        }
    }
    ,
    addQuickbarWhitelist: async function (bot, itemname) {
        if(quickbar_whitelist.includes(itemname)) return
        quickbar_whitelist.push(itemname);
    },
    equip: async function (bot, itemname, secondHand = false) {
        await containerOperation.closeWindow(bot) 
        let tg = secondHand ? 45 : bot.quickBarSlot + 36;
        let emptySlot = bot.quickBarSlot + 36;
        let findMaterialSlot = -1
        for (let idx = 45; idx >= 9; idx--) {
            const item = bot.inventory.slots[idx];	
            if (idx!=45 && idx>=36 && (!item || !quickbar_whitelist.includes(item.name))) {
                emptySlot = idx;	// 找一個不在白名單的快捷欄位置作為交換目標
            }
            if (bot.inventory.slots[idx] && bot.inventory.slots[idx].name === itemname) {
                findMaterialSlot = idx
                break
            }
        }
        if (findMaterialSlot !== -1) {
            if(findMaterialSlot == tg) return
            if(!secondHand){
                if(findMaterialSlot>=36&&findMaterialSlot!=45){
                    await bot.setQuickBarSlot(findMaterialSlot - 36)
                    // console.log(`切換hotbar到 ${findMaterialSlot - 36}`)
                    return
                }
                tg = emptySlot
            }
            // console.log(`切換slot ${findMaterialSlot} 到 ${tg}`)
            await bot.simpleClick.leftMouse(findMaterialSlot)
            await bot.simpleClick.leftMouse(tg) 
            await bot.simpleClick.leftMouse(findMaterialSlot)
        }
    },
    equipShulker: async function (bot, slot) {
        await containerOperation.closeWindow(bot)
        let tg = bot.quickBarSlot + 36
        if(slot == tg) return
        if(slot >= 36 && slot != 45) {
            await bot.setQuickBarSlot(slot - 36)
            return
        }
        await bot.simpleClick.leftMouse(slot)
        await bot.simpleClick.leftMouse(tg)
        await bot.simpleClick.leftMouse(slot)
    },
    unwrap: unwrap,
    titleToJsonMsg: function(title,ChatMessage) {
        const clean = unwrap(title)
        return new ChatMessage(clean);
    }
}
function unwrap(node) {
    if (node == null) return null;

    // 如果是 { type: 'xxx', value: ... }
    if (typeof node === 'object' && node.type && 'value' in node) {
        if (node.type === 'list') {
            // 根據 NBT list 的定義，value 是 { type: 'compound', value: [...] }
            // 或者 value 就是陣列 (如果已經被 partially parsed)
            if (node.value && node.value.value && Array.isArray(node.value.value)) {
                 return node.value.value.map(unwrap);
            } else if (Array.isArray(node.value)) {
                 return node.value.map(unwrap);
            } else {
                // 處理空 list 或其他情況
                return [];
            }
        } else if (node.type === 'compound') {
            const out = {};
            for (const [k, v] of Object.entries(node.value)) {
                out[k] = unwrap(v);
            }
            return out;
        } else {
            // 其他類型如 string, int 等，直接遞歸解包 value
            // 但要注意某些 type 的 value 本身就是 primitive，unwrap 會在下一次遞歸處理
            return unwrap(node.value);
        }
    }

    // 普通物件 (非 NBT type wrapper)
    if (typeof node === 'object') {
        if (Array.isArray(node)) {
            return node.map(unwrap);
        }
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            out[k] = unwrap(v);
        }
        return out;
    }

    // 基本型別 (string, number, boolean)
    return node;
}
module.exports = utils