const fsp = require('fs').promises
const { Vec3 } = require('vec3')
const pathfinder = require('../pathfinder')
const { sleep } = require('../common')
const { mapartState } = require('./core')

function getItemFrame(tg_pos) {
    const { bot } = mapartState
    for (let etsIndex in bot.entities) {
        if (!(bot.entities[etsIndex].displayName == 'Glow Item Frame' || bot.entities[etsIndex].displayName == 'Item Frame')) continue
        if (tg_pos.equals(new Vec3(
            Math.round(bot.entities[etsIndex].position.x - 0.5),
            Math.round(bot.entities[etsIndex].position.y - 0.5),
            Math.round(bot.entities[etsIndex].position.z - 0.5)
        ))) return bot.entities[etsIndex]
    }
}

function getMapItemByMapIDInInventory(mpID) {
    const { bot } = mapartState
    return bot.inventory.slots.find(item => item?.nbt?.value?.map?.value == mpID);
}

async function pickMapItem(mpID) {
    const { bot, mcData } = mapartState
    let timeout = false
    let to = setTimeout(() => {
        timeout = true;
    }, 15000);
    while (true) {
        if (timeout) break;
        let ck = getMapItemByMapIDInInventory(mpID);
        if (ck) break;
        let et = bot.entities;
        for (let i in et) {
            if (et[i]?.displayName == 'Item' && et[i]?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id && et[i]?.metadata[8].nbtData?.value?.map?.value == mpID) {
                if (et[i].onGround) await pathfinder.astarfly(bot, new Vec3(Math.round(et[i].position.x - 0.5), Math.round(et[i].position.y - 1), Math.round(et[i].position.z - 0.5)), null, null, null, true)
                else await pathfinder.astarfly(bot, new Vec3(Math.round(et[i].position.x - 0.5), Math.round(et[i].position.y), Math.round(et[i].position.z - 0.5)), null, null, null, true)
            }
        }
        await sleep(10)
    }
    if (timeout) throw new Error("撿起地圖畫超時");
    try { clearTimeout(to) } catch (e) { }
}

async function save(caec) {
    const { bot_id } = mapartState
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('mapart save error', err);
    });
}

async function inv_sort() {
    const { bot } = mapartState
    if (bot.inventory.slots[44]) {
        await moveToEmptySlot(44)
    }
    if (bot.inventory?.slots[43]?.name != 'map') {
        for (let i = 9; i <= 42; i++) {
            if (bot.inventory?.slots[i]?.name == 'map') {
                await bot.simpleClick.leftMouse(i)
                await bot.simpleClick.leftMouse(43)
                await bot.simpleClick.leftMouse(i)
                break;
            }
        }
    }
}

async function moveToEmptySlot(slot) {
    const { bot } = mapartState
    let emptySlots = getEmptySlot();
    if (emptySlots.length == 0) {
        throw new Error("Can't find empty slot to use")
    }
    await bot.simpleClick.leftMouse(slot)
    await bot.simpleClick.leftMouse(emptySlots[0])
}

function getEmptySlot() {
    const { bot } = mapartState
    let result = []
    for (let i = 9; i < 44; i++) {
        if (!bot.inventory.slots[i]) {
            result.push(i)
        }
    }
    return result
}

async function taskreply(task, mc_msg, console_msg, discord_msg) {
    const { bot } = mapartState
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} ${mc_msg}`);
            break;
        case 'console':
            console.log(console_msg)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented ${discord_msg}`);
            break;
        default:
            break;
    }
}

async function notImplemented(task) {
    taskreply(task, "Not Implemented", "Not Implemented", "Not Implemented")
}

module.exports = {
    getItemFrame,
    getMapItemByMapIDInInventory,
    pickMapItem,
    save,
    inv_sort,
    moveToEmptySlot,
    getEmptySlot,
    taskreply,
    notImplemented,
}
