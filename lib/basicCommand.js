const fs = require('fs');
const fsp = require('fs').promises
const crypto = require('crypto');
const containerOperation = require(`../lib/containerOperation`);
const mcFallout = require(`../lib/mcFallout`);
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
var whetherPause = false, stop = false;
let logger
let mcData
let bot_id
let bot
const basicCommand = {
    cmd: [
        {
            name: "test",
            identifier: [
                "test"
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "info",
            identifier: [
                "info",
                "i"
            ],
            execute: cmd_info,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "Balance Query",
            identifier: [
                "balance",
                "bal",
                "money",
                "emerald",
                "coin"
            ],
            execute: cmd_balinfo,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "Experience query",
            identifier: [
                "xp",
                "exp",
                "experience",
            ],
            execute: cmd_expinfo,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "Throw Item",
            identifier: [
                "throw",
            ],
            execute: cmd_throw,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "Throw All Item",
            identifier: [
                "throwall",
            ],
            execute: cmd_throwall,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "Exit",
            identifier: [
                "exit",
            ],
            execute: cmd_exit,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
    ],
    async init(bott, user_id, lg) {
        logger = lg
        bot_id = user_id;
        bot = bott
        mcData = require('minecraft-data')(bot.version)
    }
}
async function cmd_info(task) {
    let binfo = "";
    let currentPostion = bot.entity.position;
    let expLevel = bot.experience.level
    let expPoint = bot.experience.points
    let expProgress = Math.round(bot.experience.progress * 1000) / 10;
    let inv = bot.inventory;
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} &b分流 &7${bot.botinfo.server}&r|&b座標 &7${currentPostion}&r|&a綠 &7${bot.botinfo.balance}&r|&6村 &7${bot.botinfo.coin}`);
            break;
        case 'console':
            //binfo+=(`\x1b[96m[\x1b[0m-----\x1b[36mBOT資訊\x1b[0m-----\x1b[96m]\x1b[0m\n`)
            binfo += (`\x1b[96m分流 \x1b[0m${bot.botinfo.server} \x1b[96m座標 \x1b[0m${currentPostion}\x1b[0m\n`)
            binfo += (`\x1b[96m綠 \x1b[0m${bot.botinfo.balance} \x1b[96m村 \x1b[0m${bot.botinfo.coin}\x1b[0m\n`)
            binfo += (`\x1b[96mLevel \x1b[0m${expLevel} \x1b[96mPoint \x1b[0m${expPoint} \x1b[96mProgress \x1b[0m${expProgress}%\x1b[0m\n`)
            binfo += (`\x1b[96m裝備欄 \x1b[0m\n`)
            for (let i = 5; i <= 8; i++) {
                displaySlot(inv.slots[i])
            }
            binfo += (`\x1b[96m物品欄(${bot.inventory.inventoryEnd - 9}-${bot.inventory.inventoryEnd - 1})\x1b[92m quickbar - ${bot.quickBarSlot + 36}(${bot.quickBarSlot})\x1b[0m\n`)
            for (let i = 36; i <= 45; i++) {	//45 offhand
                displaySlot(inv.slots[i])
            }
            binfo += (`\x1b[96m背包(${bot.inventory.inventoryStart}-${bot.inventory.inventoryEnd - 10})\x1b[0m\n`)
            for (let i = 9; i <= 35; i++) {	//45 offhand
                displaySlot(inv.slots[i])
            }
            //binfo+=(`\x1b[96m[\x1b[0m---------------\x1b[96m]\x1b[0m`)
            logger(false, "INFO", `BOT信息如下\n${binfo.slice(0, -1)}`)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented`);
            break;
        default:
            break;
    }
    function displaySlot(item) {
        if (item != null) {
            let logString = `${(item.slot - 36 == bot.quickBarSlot) ? '\x1b[33mslot:\x1b[0m' : 'slot:'} ${(item.slot).toString().padEnd(2, ' ')} ${(item.name).padEnd(18, ' ')} `;
            //console.log(item.nbt.value.Damage.value)
            let itemTemplate = mcData.items[item.type]
            if (itemTemplate.stackSize != 1) {
                logString += `x \x1b[33m${item.count}\x1b[0m `
            } else logString += `\x1b[33m${''.padEnd(4, ' ')}\x1b[0m `
            if (itemTemplate.enchantCategories && itemTemplate.enchantCategories.includes('breakable')) {
                let damagePercentage = Math.round((itemTemplate.maxDurability - item.nbt.value.Damage.value) * 1000 / itemTemplate.maxDurability) / 10;
                if (damagePercentage > 95) logString += `\x1b[32m${damagePercentage}%\x1b[0m `
                else if (damagePercentage > 50) logString += `\x1b[33m${damagePercentage}%\x1b[0m `
                else logString += `\x1b[31m${damagePercentage}%\x1b[0m `
            }
            //console.log(logString)
            binfo += logString + '\n';
        }
    }
}
async function cmd_balinfo(task) {
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} &b綠&r: &6${bot.botinfo.balance}&r, &b村&r: &6${bot.botinfo.coin}`);
            break;
        case 'console':
            logger(false, "INFO", `\x1b[96m綠 \x1b[37m${bot.botinfo.balance} \x1b[96m村 \x1b[37m${bot.botinfo.coin}\x1b[0m`)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented`);
            break;
        default:
            break;
    }

}
async function cmd_expinfo(task) {
    let expLevel = bot.experience.level
    let expPoint = bot.experience.points
    let expProgress = Math.round(bot.experience.progress * 1000) / 10;
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} &b等級&r: &6${expLevel}&r, &b總經驗值&r: &6${expPoint}&r, &b當前進度&r: &6${expProgress}%`);
            break;
        case 'console':
            logger(false, "INFO", `\x1b[96mLevel \x1b[37m${expLevel} \x1b[96mPoint \x1b[37m${expPoint} \x1b[96mProgress \x1b[37m${expProgress}%\x1b[0m`)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented`);
            break;
        default:
            break;
    }

}
async function cmd_throw(task) {
    let targetIndexs = task.content.slice(1).map((str) => parseInt(str))
    if(targetIndexs.length==0){
        await taskreply(task,"請指定slot 或 使用throwall","請指定slot 或 使用throwall",null)
        return
    }
    for(let i=0;i<targetIndexs.length;i++){
        await throw_slot(targetIndexs[i])
    }
}
async function cmd_throwall(task) {
    for(let i=9;i<=45;i++){
        await throw_slot(i)
    }
}
async function throw_slot(slot) {
    //5-8 armor 
    //9-44 inv
    //45 second-hand
    if (slot < 5 || slot > 45) return;
    if (bot.currentWindow) {
        console.log(bot.currentWindow?.title ?? 'Inventory');
        console.log("嘗試關閉當前視窗")
        bot.closeWindow(bot.currentWindow)
    }
    if(bot.inventory.slots[slot]!=null){
        logger(true,'INFO',`丟棄 slot: ${slot} - ${bot.inventory.slots[slot].name} x${bot.inventory.slots[slot].count}`)
        bot.tossStack(bot.inventory.slots[slot])
        await sleep(50);
    }
}
async function cmd_exit(task){
    process.send({ type: 'setStatus', value: 0 })
    await bot.gkill(0)
}
async function taskreply(task, mc_msg, console_msg, discord_msg) {
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
    console.log("Not Implemented")
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
module.exports = basicCommand