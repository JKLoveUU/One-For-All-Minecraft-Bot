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
            execute: cmd_test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "help",
            identifier: [
                "help",
                "?"
            ],
            execute: cmd_help,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地鳴宣言",
            identifier: [
                "地鳴宣言",
                "地鳴",
                "rumbling",
                "therumbling"
            ],
            execute: cmd_TheRumbling,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "Show Player List",
            identifier: [
                "plist",
            ],
            execute: cmd_playerlist,
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
            name: "say",
            identifier: [
                "say",
            ],
            execute: cmd_say,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "warp",
            identifier: [
                "warp",
                "/warp",
            ],
            execute: cmd_warp,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "tpc",
            identifier: [
                "tpc",
            ],
            execute: cmd_tpc,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "findPlayer",
            identifier: [
                "find",
                "findplayer",
            ],
            execute: cmd_findPlayer,
            vaild: true,
            longRunning: false,
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
async function cmd_help(task) {
    await notImplemented(task);
}
async function cmd_test(task) {
    const crypto = require('crypto');
    for (let i = 0; i < 100; i++) {
        //const str = JSON.stringify(i);
        //const hash = crypto.createHash('sha256').update(str).digest('hex');
        //bot.chatManager.chat(hash)
        bot.chatManager.chat(i + " rate limit test")
    }

    //let result = await bot.tabComplete('/tpa ')
    //console.log(result)
    // mcFallout.tpc(bot,"JKLoveJK",1)
}
async function cmd_TheRumbling(task) {
    let lang = task.content[1] ? task.content[1] : "ch";
    let speech_cooldown = task.content[2] ? parseInt(task.content[2]) : 1000;
    let speech_prefix = task.content[3] ? task.content[3] : '';
    //https://inewsdb.com/%E5%8B%95%E6%BC%AB/%E5%9C%B0%E9%B3%B4%E5%AE%A3%E8%A8%80-%E7%BE%85%E9%A6%AC%E9%9F%B3/
    const theRumbling_text = {
        "ch": [
            "致全體尤彌爾的子民",
            "我是艾倫·耶格爾",
            "通過始祖巨人之力",
            "向全體尤彌爾的子民對話",
            "帕拉迪島上",
            "所有牆壁的硬質化都已解除",
            "那其中埋藏的所有巨人",
            "已經開始行動",
            "我的目的是  保護生我養我的",
            "帕拉迪島上的人民",
            "但是，這個世界",
            "都盼望著帕拉迪島上的人死絕",
            "經歷漫長的歲月  不斷滋生的仇恨",
            "不止針對這座島",
            "在殺光所有尤彌爾的子民之前",
            "不會斷絕",
            "我無法接受那樣的願景",
            "牆之巨人會把島外的一切",
            "所有的土地踏平",
            "直到所有的生靈",
            "從這世上  驅逐殆盡"
        ],
        "jp": [
            "すべてのユミルの民に告ぐ",
            "オレの名はエレン・イェーガー",
            "始祖の巨人の力を介し",
            "すべてのユミルの民へ話しかけている",
            "パラディ島にある",
            "すべての壁の硬質化が解かれ",
            "その中に埋められていた",
            "すべての巨人は歩み始めた",
            "オレの目的は   オレの生まれ育った",
            "パラディ島の人々を  守ることにある",
            "しかし、世界は",
            "パラディ島の人々が  死滅することを望み",
            "永い時間をかけ  膨れ上がった憎悪は",
            "この島のみならず",
            "すべてのユミルの民が　殺され尽くすまで",
            "止まらないだろう",
            "オレはその望みを拒む",
            "壁の巨人はこの島の外にある",
            "すべての地表を踏み鳴らす",
            "そこにある命を",
            "この世から　駆逐するまで",
        ]
    }
    if (theRumbling_text[lang] != undefined) {
        for (let l = 0; l < theRumbling_text[lang].length; l++) {
            bot.chat(speech_prefix + theRumbling_text[lang][l])
            await sleep(speech_cooldown);
        }
    } else {
        taskreply(task, `lang ${lang} not implemented`)
    }
}
async function cmd_playerlist(task) {
    let result = await bot.tabComplete('/tpa ')
    let plist = result.map((json) => json.match)
    plist.sort();
    console.log(plist)
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
    if (targetIndexs.length == 0) {
        await taskreply(task, "請指定slot 或 使用throwall", "請指定slot 或 使用throwall", null)
        return
    }
    for (let i = 0; i < targetIndexs.length; i++) {
        await throw_slot(targetIndexs[i])
    }
}
async function cmd_throwall(task) {
    for (let i = 9; i <= 45; i++) {
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
    if (bot.inventory.slots[slot] != null) {
        logger(true, 'INFO', `丟棄 slot: ${slot} - ${bot.inventory.slots[slot].name} x${bot.inventory.slots[slot].count}`)
        bot.tossStack(bot.inventory.slots[slot])
        await sleep(50);
    }
}
async function cmd_exit(task) {
    process.send({ type: 'setStatus', value: 0 })
    await bot.gkill(0)
}
async function cmd_say(task) {
    let text = task.content.slice(1).join(' ')
    if (task.source == 'minecraft-dm') logger(true, 'INFO', `轉發 ${task.minecraftUser} 消息: ${text}`)
    else if (task.source == 'console') logger(true, 'INFO', `轉發消息: ${text}`)
    bot.chat(text)
    //console.log(text)
}
async function cmd_warp(task) {
    let wpTarget = task.content[1] ? task.content[1] : ' ';
    console.log(wpTarget)
    await mcFallout.warp(bot, wpTarget)
}   
async function cmd_tpc(task) {
    let landOwner = task.content[1] ? task.content[1] : ' ';
    let index = task.content[2] ? parseInt(task.content[2]) : 1;
    await mcFallout.tpc(bot, landOwner, index)
}
async function cmd_findPlayer(task) {
    if (task.content.length != 2) taskreply(task, "Invaild Args Length", "Invaild Args Length", "Invaild Args Length")
    let ps = await mcFallout.getPlayerServer(bot, task.content[1]);
    //console.log(ps)
    if (ps != -1) {
        taskreply(task, `Found ${task.content[1]} At ${ps}`, `Found ${task.content[1]} At ${ps}`, `Found ${task.content[1]} At ${ps}`)
    } else taskreply(task, `Player ${task.content[1]} Not Found`, `Player ${task.content[1]} Not Found`, `Player ${task.content[1]} Not Found`)
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
    taskreply(task, "Not Implemented", "Not Implemented", "Not Implemented")
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
module.exports = basicCommand