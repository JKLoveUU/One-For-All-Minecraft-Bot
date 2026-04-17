//console.log(process.argv)
if (!process.argv[2]) { //為了讓打包能加入這個檔案 所以先require
    return
}
// Route all console.* through the shared logger → parent via IPC (must run before other requires).
require("../src/logger").installChildConsoleCapture();
let debug = process.argv.includes("--debug");
let enableChat = process.argv.includes("--chat");
let ip = null;
for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i].indexOf("--ip") !== -1) {
        let rawip = process.argv[i].split("=")[1];
        if (rawip == 'undefined' || rawip == 'null') continue
        ip = rawip;
    }
}
let login = false
let config
const path = require('path');
const EventEmitter = require('events');
const mineflayer = require("mineflayer");
const sd = require('silly-datetime');
const { sleep, readConfig } = require('../lib/common')
const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const profiles = require(`${baseDir}/profiles.json`);
const fs = require('fs');
const fsp = require('fs').promises
let mcv = "1.18.2"
const { version } = require("os");
const CNTA = require('chinese-numbers-to-arabic');


const registry = require("prismarine-registry")(mcv)
const ChatMessage = require("prismarine-chat")(registry);

// const commandsPath = path.join(__dirname, 'src');
// const commandFiles = fs.readdirSync(commandsPath)//.filter(file => file.endsWith('.js'));
// console.log(commandsPath)
// const commands = []
// for(c of commandFiles){
//     if(c=='basicCommand.js') continue
//     // else console.log("load",commandFiles[c])
//     // if(commandFiles[c]=='mapart.js') commands.push(require(`./lib/mapart`))
//     // if(commandFiles[c]=='craftAndExchange.js') commands.push(require(`./lib/craftAndExchange`))
//     const filePath = path.join(commandsPath,c);
//     console.log(c)
//     commands.push(require(filePath))
// }
// 因為打包可能遺漏 所以不使用以上方法
//lib
//這裡應該改成從lib自動載入 加入commands 並init
// const template = require(`../src/template`);
const mapart = require(`../src/mapart`);
// const clearArea = require(`../src/clearArea`);
// const autoQuest = require(`../src/autoQuest`);
// const buildtool = require(`../src/buildtool`);
// const craftAndExchange = require(`../src/craftAndExchange`);     // 兌換功能已移除
const warehouse = require(`../src/warehouse`);
const { logger } = require("../src/logger");
const villager = require(`../src/villager`);
// const commands = [mapart, buildtool, clearArea, autoQuest, warehouse, villager]
const commands = [mapart, warehouse, villager]
const basicCommand = require(`../src/basicCommand`);
const utils = require('../lib/util');
const Status = require('../src/modules/botstatus');
const Task = require('./lib/Task');
const createChatManager = require('./lib/chatManager');
const createMapManager = require('./lib/mapManager');
const createTaskManager = require('./lib/taskManager');
if (!profiles[process.argv[2]]) {
    //已經在parent檢查過了 這邊沒有必要
    console.log(`profiles中無 ${process.argv[2]} 資料`)
    process.send({ type: 'setStatus', value: Status.CLOSED_PROFILE_NOT_FOUND })
    process.exit(2001)
}
if (!fs.existsSync(`config/${process.argv[2]}`)) {
    fs.mkdirSync(`config/${process.argv[2]}`, { recursive: true });
    console.log(`未發現配置文件 請至 config/${process.argv[2]} 配置`)
}
process.send({ type: 'setReloadCD', value: config?.setting?.reconnect_CD ? config.setting.reconnect_CD : 20_000 })
process.send({ type: 'setStatus', value: Status.LOGGING_IN })
const watchDog = {
    //tab: setTimeout(showTabError, 30_000),
}

function showTabError() {
    logger(true, 'WARN', process.argv[2], `Tab過久未更新 或 格式改變無法載入`)
    kill(101)
}

const botinfo = {
    server: -1,
    serverCH: -1,
    balance: -1,
    coin: -1,
    tabUpdateTime: new Date(),
}
const bot = (() => { // createMcBot
    logger(true, 'INFO', process.argv[2], `Initializing | type: ${process.argv[3]} | IP: ${ip ? ip : profiles[process.argv[2]].host}`)
    // console.log(ip ? ip : profiles[process.argv[2]].host)
    // console.log(profiles[process.argv[2]].port)
    // console.log(profiles[process.argv[2]].username)
    // console.log(mcv)
    const bot = mineflayer.createBot({
        host: ip ? ip : profiles[process.argv[2]].host,
        port: "25565", //profiles[process.argv[2]].port ?? "25565",
        username: profiles[process.argv[2]].username,
        auth: "microsoft",
        version: mcv
    })
    let loginWatchDog = setTimeout(() => {
        logger(true, 'WARN', process.argv[2], `登陸超時 重新嘗試`)
        kill(1003)
    }, 300000)
    const ChatMessage = require('prismarine-chat')(mcv)
    if (debug) {
        bot.on("windowOpen", async (window) => {
            //console.log(window)
            // console.log(window.title)
            // for(i in window.slots){
            //     if(!window.slots[i]) continue
            //     else console.log(`${window.slots[i].slot} ${window.slots[i].name} ${window.slots[i].displayName}`)
            // }
        })
    }
    bot.once('spawn', async () => {
        // console.log(bot.entity)
        // bot.physicsEnabled = true
        logger(true, 'INFO', process.argv[2], `login as ${bot.username}`)
        // await sleep(10000)
        bot._client.write("abilities", {
            flags: 0b0111,
            flyingSpeed: 4.0,
            walkingSpeed: 4.0
        })
        bot.entity.onGround = false;
        bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        bot.logger = logger
        bot.gkill = kill;
        bot.botinfo = botinfo;
        bot.debugMode = debug
        clearTimeout(loginWatchDog)
        taskManager.init(bot);
        chatManager.init(bot);
        mapManager.init(bot);
        const botContext = { bot, bot_id: process.argv[2], logger };
        await basicCommand.init(botContext);
        for (c in commands) {
            await commands[c].init(botContext);
        }
        bot._client.write('client_command', { payload: 0 })     //fix death bug
        process.send({ type: 'setStatus', value: Status.IDLE })
        process.send({ type: 'setReloadCD', value: config?.setting?.reconnect_CD ? config.setting.reconnect_CD : 20_000 })
        bot.chatAddPattern(
            /^(\[[A-Za-z0-9-_您]+ -> [A-Za-z0-9-_您]+\] .+)$/,
            'dm'
        )
        bot.chatAddPattern(
            /^\[系統\] (\S+) 想要傳送到 你 的位置$/,
            'tpa'
        )
        bot.chatAddPattern(
            /^\[系統\] (\S+) 想要你傳送到 該玩家 的位置$/,
            'tpahere'
        )
        bot.chatAddPattern(
            /^Summoned to wait by CONSOLE$/,
            'wait'
        )
        login = true
    })
    bot.on('message', async (jsonMsg) => {
        if (enableChat) {
            if (jsonMsg.toString().includes("目標生命 : ❤❤❤❤❤❤❤❤❤❤")) return
            if (jsonMsg.toString().startsWith("[server")) return
            if (jsonMsg.toString().startsWith("[challenge]")) return
            if (jsonMsg.toString().startsWith("Total players online:")) return
            if (jsonMsg.toString().startsWith("[wait]")) return
            logger(true, 'CHAT', process.argv[2], jsonMsg.toAnsi())
        }
    })
    // bot.on("title", (title, type) => {
    //     const msg = utils.titleToJsonMsg(title, ChatMessage);
    //     let text = msg.toAnsi();
    //     console.log(`[${type}] ${text}`);

    // });

    bot.on('forcedMove', () => {   //FM
        if (bot.debugMode) logger(false, 'DEBUG', process.argv[2], `\x1b[31m強制移動\x1b[0m ${bot.entity.position} 分流 ${botinfo.server}`);
    });

    bot.on('dm', async (jsonMsg) => {
        let args = jsonMsg.toString().split(' ')
        let playerID = args[0].slice(1, args[0].length);
        let cmds = args.slice(3, args.length);
        let isTask = taskManager.isTask(cmds)
        if (cmds[0] == '無效的指令') {
            return
        }
        if (cmds[0] == 'link') {
            let result = await warehouse.link(playerID, cmds[1])
            if (result) {
                bot.chat(`/m ${playerID} 連結成功`)
            } else {
                bot.chat(`/m ${playerID} 連結失敗`)
            }
            return
        }
        if (cmds[0] == 'reload' && config.setting.whitelist.includes(playerID)) {
            bot.chat(`/m ${playerID} 正在重新載入`)
            process.send({ type: 'setStatus', value: Status.RESTARTING })
            await kill(75)
            return
        }
        if (!config.setting.whitelist.includes(playerID)) {
            logger(true, 'CHAT', process.argv[2], jsonMsg.toString())
            return
        }
        if (isTask.vaild) {
            let tk = new Task(taskManager.defaultPriority, isTask.name, 'minecraft-dm', cmds, undefined, undefined, playerID, undefined)
            taskManager.assign(tk, isTask.longRunning)
            // console.log(taskManager.isImm(cmds))
        } else {
            bot.chat(`/m ${playerID} 無效的指令 輸入 help 查看幫助 若要轉發消息使用 say <text>`)
            // enableChat = !enableChat
        }
        //console.log(jsonMsg.toString())
        logger(true, 'CHAT', process.argv[2], jsonMsg.toString())
    })
    bot.on('tpa', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', process.argv[2], `${config.setting.whitelist.includes(p) ? "\x1b[32mAccept\x1b[0m" : "\x1b[31mDeny\x1b[0m"} ${p}'s tpa request`);
    })
    bot.on('tpahere', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', process.argv[2], `${config.setting.whitelist.includes(p) ? "\x1b[32mAccept\x1b[0m" : "\x1b[31mDeny\x1b[0m"} ${p}'s tpahere request`);
    })
    bot._client.on('playerlist_header', (data) => {
        botTabhandler(data)
        botScoreBoardhandler(bot.scoreboard['1'])
    })
    //   bot.on('scoreUpdated', (scoreboard, item) => {
    //     console.log(scoreboard,item)
    //     // botScoreBoardhandler(bot.scoreboard['1'])
    // })
    //---------------
    bot.on('error', async (error) => {
        if (error?.message?.includes('RateLimiter disallowed request')) {
            process.send({ type: 'setReloadCD', value: 60_000 })
            process.send({ type: 'setStatus', value: Status.RELOAD_COOLDOWN })
            await kill(1900)
        } else if (error?.message?.includes('Failed to obtain profile data for')) {
            process.send({ type: 'setStatus', value: Status.RELOAD_COOLDOWN })
            await kill(1901)
        } else if (error?.message?.includes('request to https://sessionserver.mojang.com/session/minecraft/join failed')) {
            process.send({ type: 'setStatus', value: Status.RELOAD_COOLDOWN })
            await kill(1902)
        } else if (error?.message?.includes('read ECONNRESET')) {
            process.send({ type: 'setStatus', value: Status.RELOAD_COOLDOWN })
            await kill(1903)
        }
        console.log('[ERROR]name:\n' + error.name)
        console.log('[ERROR]msg:\n' + error.message)
        console.log('[ERROR]code:\n' + error.code)
        logger(true, 'ERROR', process.argv[2], error + '\n' + error.stack);
        await kill(1000)
    })
    bot.on('kicked', async (reason, loggedIn) => {
        logger(true, 'ERROR', process.argv[2], `kick reason ${reason}`)
        if (reason.includes("The proxy server is restarting")) {
            process.send({ type: 'setReloadCD', value: 120_000 })
            process.send({ type: 'setStatus', value: Status.PROXY_RESTARTING })
        }
        await sleep(1000)
        await kill(1000)
    })
    bot.on('death', () => {
        logger(true, 'WARN', process.argv[2], `Death at Location: ${bot.entity.position} server: ${botinfo.server}`)
    })
    bot.once('end', async () => {
        logger(true, 'WARN', process.argv[2], `${process.argv[2]} disconnect`)
        await sleep(1000)
        await kill(1000)
    })
    bot.once('wait', async () => {
        process.send({ type: 'setReloadCD', value: 120_000 })
        logger(true, 'INFO', process.argv[2], `was sent to waiting room`)
        await kill(11)
    })
    //init()
    return bot
})()

async function kill(code = 9) {
    //process.send({ type: 'restartcd', value: restartcd })
    //logger(true, 'WARN', process.argv[2], `exiting in status ${code}`)
    bot.end()
    process.exit(code)
}
const mapManager = createMapManager()
const chatManager = createChatManager()
const taskManager = createTaskManager({
    commands, basicCommand, logger, getLogin: () => login
})
const serverRegex = /分流(\d+)/g
const emeraldRegex = /綠寶石餘額 : ([\d,]+)/g
const coinRegex = /村民錠餘額 : ([\d,]+)/g

function botTabhandler(data) {
    const tabMsg = new ChatMessage(JSON.parse(data.header));
    const tabData = tabMsg.toString();
    const serverData = serverRegex.exec(tabData);
    if (serverData != null && serverData.length > 0) botinfo.server = parseInt(serverData[1])
    // const emeraldData = emeraldRegex.exec(tabData);
    // if (emeraldData != null && emeraldData.length > 0) botinfo.balance = parseInt(emeraldData[1].replace(/,/g, ''))
    // const coinData = coinRegex.exec(tabData);
    // if (coinData != null && coinData.length > 0) botinfo.coin = parseInt(coinData[1].replace(/,/g, ''))
    // botinfo.tabUpdateTime = new Date()
}
const SBserverRegex = /分流(\d+)/;
const SBemeraldRegex = /綠寶石.*?(\d+(?:,\d+)*)元/;
const SBcoinRegex = /村民錠.*?(\d+(?:,\d+)*)個.*?每個.*?(\d+(?:,\d+)*)元/;
function botScoreBoardhandler(data) {
    // console.log(data)
    //console.log(data.itemsMap)
    if (!data?.itemsMap) return;

    Object.values(data.itemsMap).forEach(item => {
        //console.log(item)
        const text = item.displayName?.text || '';

        // const serverMatch = text.match(SBserverRegex);
        // if (serverMatch) {
        //     botinfo.server = parseInt(serverMatch[1]);
        // }

        const emeraldMatch = text.match(SBemeraldRegex);
        if (emeraldMatch) {
            botinfo.balance = parseInt(emeraldMatch[1].replace(/,/g, ''));
        }

        const coinMatch = text.match(SBcoinRegex);
        if (coinMatch) {
            botinfo.coin = parseInt(coinMatch[1].replace(/,/g, ''));
        }
        //console.log(serverMatch,emeraldMatch,coinMatch)
    });
    botinfo.tabUpdateTime = new Date();
}
process.on('uncaughtException', async (err) => {
    logger(true, 'ERROR', process.argv[2], err + "\n" + err.stack);
    //console.log(err)
    //if (login) try{await taskManager.save()}catch(e){};
    kill(70)
});
process.on('message', async (message) => {
    switch (message.type) {
        case 'init':
            config = message.config;
            break;
        case 'dataRequire':
            try {
                const _tm    = (typeof taskManager !== 'undefined') ? taskManager : null;
                const _queue = (_tm && Array.isArray(_tm.tasks)) ? _tm.tasks : [];
                const _run   = (_tm && _tm.tasking && _queue.length > 0) ? _queue[0] : null;
                const _rest  = _run ? _queue.slice(1) : _queue;
                dataRequiredata = {
                    name:       bot && bot.username       != null ? bot.username       : '-',
                    server:     botinfo && botinfo.server != null ? botinfo.server     : '-',
                    coin:       botinfo && botinfo.coin   != null ? botinfo.coin       : '-',
                    balance:    botinfo && botinfo.balance!= null ? botinfo.balance    : '-',
                    position:   (bot && bot.entity && bot.entity.position) ? bot.entity.position : '-',
                    tasks:      _rest,
                    runingTask: _run || '-',
                    ping:       (bot && bot.player && bot.player.ping != null) ? bot.player.ping : '-',
                    memory:     process.memoryUsage(),
                }
            } catch (_) {
                dataRequiredata = { name: '-', server: '-', coin: '-', balance: '-', position: '-', tasks: [], runingTask: '-', ping: '-', memory: process.memoryUsage() }
            }
            process.send({ type: 'dataToParent', value: dataRequiredata })
            break;
        case 'cmd':
            let args = message.text.slice(1).split(' ')
            if (args[0] === 'chat') {
                enableChat = !enableChat
                console.log(`聊天功能已${enableChat ? "開啟" : "關閉"}`)
                break;
            } else if (args[0] === 'debug') {
                debug = !debug
                console.log(`debug功能已${debug ? "開啟" : "關閉"}`)
                bot.debugMode = debug
                break;
            }
            //console.log(args)
            let isTask = taskManager.isTask(args)
            if (isTask.vaild) {
                let tk = new Task(taskManager.defaultPriority, isTask.name, 'console', args, undefined, undefined, undefined, undefined)
                taskManager.assign(tk, isTask.longRunning)
            } else {
                console.log("無效的指令 輸入.help 查看幫助 若要轉發消息使用 .say <text>")
            }
            break;
        case 'chat':
            try {
                bot.chat(message.text)
                console.log(`訊息已由 ${bot.username} 送出: ${message.text}`);
            } catch (e) {
                logger(false, "ERROR", process.argv[2], "訊息發送失敗 try again")
            }
            break;
        case 'reload':
            process.send({ type: 'setStatus', value: Status.RESTARTING })
            await kill(75)
            break;
        case 'exit':
            process.send({ type: 'setStatus', value: Status.CLOSED })
            await kill(0)
            break;
        default:
            console.log('message from parent:', message);
    }
});
