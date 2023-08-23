//console.log(process.argv)
if (!process.argv[2]) {
    return
}
let debug = process.argv.includes("--debug");
let enableChat = process.argv.includes("--chat");
let login = false
let config
const path = require('path');
const EventEmitter = require('events');
const mineflayer = require("mineflayer");
const sd = require('silly-datetime');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const profiles = require(`${process.cwd()}/profiles.json`);
const fs = require('fs');
const fsp = require('fs').promises
const { version } = require("os");
const CNTA = require('chinese-numbers-to-arabic');
function logger(logToFile = false, type = "INFO", ...args) {
    if (logToFile) {
        process.send({ type: 'logToFile', value: { type: type, msg: args.join(' ') } })
        return
    }
    let fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss')
    let colortype
    switch (type) {
        case "DEBUG":
            colortype = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "INFO":
            colortype = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "WARN":
            colortype = "\x1b[33m" + type + "\x1b[0m";
            break;
        case "ERROR":
            type = "\x1b[31m" + type + "\x1b[0m";
            colortype;
        case "CHAT":
            colortype = "\x1b[93m" + type + "\x1b[0m";
            break;
        default:
            colortype = type;
            break;
    }
    console.log(`[${fmtTime}][${colortype}][${process.argv[2]}] ${args.join(' ')}`);
}

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
//console.log(commands.length)
//lib
//這裡應該改成從lib自動載入 加入commands 並init
const template = require(`./src/mapart`);
const mapart = require(`./src/mapart`);
const craftAndExchange = require(`./src/craftAndExchange`);;
const commands = [mapart, craftAndExchange,template]
const basicCommand = require(`./src/basicCommand`)
if (!profiles[process.argv[2]]) {
    //已經在parent檢查過了 這邊沒有必要
    console.log(`profiles中無 ${process.argv[2]} 資料`)
    process.send({ type: 'setStatus', value: 1000 })
    process.exit(2001)
}
if (!fs.existsSync(`config/${process.argv[2]}`)) {
    fs.mkdirSync(`config/${process.argv[2]}`, { recursive: true });
    console.log(`未發現配置文件 請至 config/${process.argv[2]} 配置`)
}
process.send({ type: 'setReloadCD', value: config?.setting?.reconnect_CD ? config.setting.reconnect_CD :20_000})
process.send({ type: 'setStatus', value: 3001 })
const botinfo = {
    server: -1,
    serverCH: -1,
    balance: -1,
    coin: -1,
    tabUpdateTime: new Date(),
}
const bot = (() => { // createMcBot
    logger(true, 'INFO', `Initializing | type:${process.argv[3]}`)
    const bot = mineflayer.createBot({
        host: profiles[process.argv[2]].host,
        port: profiles[process.argv[2]].port,
        username: profiles[process.argv[2]].username,
        auth: "microsoft",
        version: "1.20"
    })
    const ChatMessage = require('prismarine-chat')("1.20")
    if(debug){
        bot.on("windowOpen",async (window)=>{
            //console.log(window)
            // console.log(window.title)
            // for(i in window.slots){
            //     if(!window.slots[i]) continue
            //     else console.log(`${window.slots[i].slot} ${window.slots[i].name} ${window.slots[i].displayName}`)
            // }
        })
    }
    bot.once('spawn', async () => {
        logger(true, 'INFO', `login as ${bot.username}`)
        bot.logger = logger
        bot.gkill = kill;
        bot.botinfo= botinfo;
        bot.debugMode = debug
        taskManager.init();
        chatManager.init();
        mapManager.init();
        await basicCommand.init(bot, process.argv[2], logger);
        for(c in commands){
            await commands[c].init(bot, process.argv[2], logger);
        }
        bot._client.write('client_command', { payload: 0 })     //fix death bug
        process.send({ type: 'setStatus', value: 3201 })
        process.send({ type: 'setReloadCD', value: config?.setting?.reconnect_CD ? config.setting.reconnect_CD :20_000})
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
            if(jsonMsg.toString().includes("目標生命 : ❤❤❤❤❤❤❤❤❤❤")) return
            logger(false, 'CHAT', jsonMsg.toAnsi())
        }
    })
    bot.on('forcedMove', () => {   //FM
        if(bot.debugMode) logger(false,'DEBUG',`\x1b[31m強制移動\x1b[0m ${bot.entity.position} 分流 ${botinfo.server}`);
    });

    bot.on('dm', async (jsonMsg) => {
        let args = jsonMsg.toString().split(' ')
        let playerID = args[0].slice(1, args[0].length);
        let cmds = args.slice(3, args.length);
        let isTask = taskManager.isTask(cmds)
        if (!config.setting.whitelist.includes(playerID)) {
            logger(true, 'CHAT', jsonMsg.toString())
            return
        }
        if (isTask.vaild) {
            let tk = new Task(taskManager.defaultPriority, isTask.name, 'minecraft-dm', cmds, undefined, undefined, playerID, undefined)
            taskManager.assign(tk, isTask.longRunning)
            // console.log(taskManager.isImm(cmds))
        }else{
            bot.chat(`/m ${playerID} 無效的指令 輸入 help 查看幫助 若要轉發消息使用 say <text>`)
        }
        //console.log(jsonMsg.toString())
        logger(true, 'CHAT', jsonMsg.toString())
    })
    bot.on('tpa', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', `${config.setting.whitelist.includes(p) ? "\x1b[32mAccept\x1b[0m" : "\x1b[31mDeny\x1b[0m"} ${p}'s tpa request`);
    })
    bot.on('tpahere', p => {
        bot.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
        logger(true, 'INFO', `${config.setting.whitelist.includes(p) ? "\x1b[32mAccept\x1b[0m" : "\x1b[31mDeny\x1b[0m"} ${p}'s tpahere request`);
    })
    bot._client.on('playerlist_header', () => {
        botTabhandler(bot.tablist)
    })
    //---------------
    bot.on('error', async (error) => {
        if (error?.message?.includes('RateLimiter disallowed request')) {
            process.send({ type: 'setReloadCD', value: 60_000 })
            process.send({ type: 'setStatus', value: 4 })
            await kill(1900)
        } else if (error?.message?.includes('Failed to obtain profile data for')) {
            process.send({ type: 'setStatus', value: 4 })
            await kill(1901)
        } else if (error?.message?.includes('request to https://sessionserver.mojang.com/session/minecraft/join failed')) {
            process.send({ type: 'setStatus', value: 4 })
            await kill(1902)
        } else if (error?.message?.includes('read ECONNRESET')) {
            process.send({ type: 'setStatus', value: 4 })
            await kill(1903)
        }
        console.log('[ERROR]name:\n' + error.name)
        console.log('[ERROR]msg:\n' + error.message)
        console.log('[ERROR]code:\n' + error.code)
        logger(true, 'ERROR', error+'\n'+error.stack);
        await kill(1000)
    })
    bot.on('kicked', async (reason, loggedIn) => {
        logger(true, 'WARN', `${loggedIn}, kick reason ${reason}`)
        if(reason.includes("The proxy server is restarting")){
            process.send({ type: 'setReloadCD', value: 120_000 })
            process.send({ type: 'setStatus', value: 100 })
            await kill(1003)
        }
        await kill(1000)
    })
    bot.on('death', () => {
        logger(true, 'INFO', `Death at Location: ${bot.entity.position} server: ${botinfo.server}`)
    })
    bot.once('end', async () => {
        logger(true, 'WARN', `${process.argv[2]} disconnect`)
        await kill(1000)
    })
    bot.once('wait', async () => {
        process.send({ type: 'setReloadCD', value: 120_000 })
        logger(true, 'INFO', `send to wait`)
        await kill(1001)
    })
    //init()
    return bot
})()

async function kill(code = 1000) {
    //process.send({ type: 'restartcd', value: restartcd })
    //logger(true, 'WARN', `exiting in status ${code}`)
    process.send({ type: 'setStatus', value: 4 })
    bot.end()
    process.exit(code)
}
const mapManager = {
    maplist: [],
    init: function(){
        bot.mapManager = this
        bot._client.on('map', (mapdata) => {
            //console.log(mapdata)
        })
    }
}
const chatManager = {
    q: [],
    pq: [],
    cd: 400,
    lastSend: Date.now(),
    checker: setInterval(async () => {
        if(chatManager.q.length==0&&chatManager.pq.length==0) return
        if(Date.now() - chatManager.lastSend<chatManager.cd) return
        if(chatManager.pq.length!=0){
            bot.chat(chatManager.pq.shift());
            chatManager.lastSend= Date.now()
            return
        }
        if(chatManager.q.length!=0){
            bot.chat(chatManager.q.shift());
            chatManager.lastSend= Date.now()
            return
        }
    }, 10),
    chat: async function(text){
        this.q.push(text)
    },
    cmd: async function(text){
        this.pq.push(text)
    },
    init: function(){
        bot.chatManager = this
    }
}
class Task {
    priority = 10;
    displayName = '';
    source = '';
    content = '';
    timestamp = Date.now();
    sendNotification = true;
    //MC-DM
    minecraftUser = '';
    //DC
    discordUser = null;
    //Console
    /**
     * 
     * @param {*} priority 
     * @param {*} displayName 
     * @param {string} source AcceptSource: console, minecraft-dm, discord
     * @param {string[]} content 
     * @param {Date} timestamp 
     * @param {boolean} sendNotification 
     * @param {string | null} minecraftUser 
     * @param {string | null} discordUser 
     */
    constructor(priority = 10, displayName = '未命名', source = '', content = '', timestamp = Date.now(), sendNotification = true, minecraftUser = '', discordUser = null) {
        this.priority = priority;
        this.displayName = displayName;
        this.source = source;
        this.content = content;
        this.timestamp = timestamp;
        this.sendNotification = sendNotification;
        this.minecraftUser = minecraftUser;
        this.discordUser = discordUser;
    }
}
const taskManager = {
    // eventl: new EventEmitter(),
    tasks: [],
    err_tasks: [],
    defaultPriority: 10,
    tasking: false,
    commands: commands,
    basicCommand: basicCommand,
    //
    tasksort() {
        this.tasks.sort((a, b) => {
            if (a.priority === b.priority) {
                return a.timestamp - b.timestamp;
            } else {
                return a.priority - b.priority;
            }
        });
    },
    async init() {
        bot.taskManager = this;
        if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/task.json`)) {
            this.save()
        } else {
            try{
                let tt = await readConfig(`${process.cwd()}/config/${process.argv[2]}/task.json`)
                this.tasks = tt.tasks
                this.err_tasks = tt.err_tasks
            }catch(e){
                await this.save()
            }
    
        }
        //console.log(`task init complete / ${this.tasks.length} tasks now`)
        //自動執行
        if (this.tasks.length != 0 && !this.tasking) {
            logger(false, 'INFO', `Found ${this.tasks.length} Task, will run at 3 second later.`)
            await sleep(3000)
            await this.loop(false)
        }
    },
    isTask(args) {
        let result
        for (let fc = 0; fc < this.commands.length && !result; fc++) {
            if (this.commands[fc].identifier.includes(args[0])) {
                for (let cmd_index = 0; cmd_index < this.commands[fc].cmd.length && !result; cmd_index++) {
                    let args2 = args.slice(1, args.length)[0];
                    if (this.commands[fc].cmd[cmd_index].identifier.includes(args2)) {
                        result = this.commands[fc].cmd[cmd_index];
                    }
                }
                if (!result) {
                    result = this.commands[fc].cmdhelper
                }
            }
        }
        if (!result) {
            for (let cmd_index = 0; cmd_index < basicCommand.cmd.length && !result; cmd_index++) {
                //console.log(args[0],basicCommand.cmd[cmd_index].identifier)
                if (basicCommand.cmd[cmd_index].identifier.includes(args[0])) {
                    result = basicCommand.cmd[cmd_index];
                }
            }
        }
        if (!result) result = { vaild: false };
        return result
        //return false
    },
    async execute(task) {
        logger(true, 'INFO', `execute task ${task.displayName}`) //\n${task.content}
        let args = task.content
        //console.log(task)
        if (task.source == 'console') task.console = logger;
        let result
        for (let fc = 0; fc < this.commands.length && !result; fc++) {
            if (this.commands[fc].identifier.includes(args[0])) {
                for (let cmd_index = 0; cmd_index < this.commands[fc].cmd.length && !result; cmd_index++) {
                    let args2 = args.slice(1, args.length)[0];
                    if (this.commands[fc].cmd[cmd_index].identifier.includes(args2)) {
                        result = this.commands[fc].cmd[cmd_index];
                    }
                }
                if (!result) {
                    result = this.commands[fc].cmdhelper
                }
            }
        }
        if (!result) {
            for (let cmd_index = 0; cmd_index < basicCommand.cmd.length && !result; cmd_index++) {
                //console.log(args[0],basicCommand.cmd[cmd_index].identifier)
                if (basicCommand.cmd[cmd_index].identifier.includes(args[0])) {
                    result = basicCommand.cmd[cmd_index];
                }
            }
        }
        if (result.vaild != true) {
            console.log(task)
            logger(true, 'ERROR', `task ${task.displayName} not found`)
            return
        }
        await result.execute(task)
        logger(true, 'INFO', `任務 ${task.displayName} \x1b[32mcompleted\x1b[0m`)
    },
    async assign(task, longRunning = true) {
        if (longRunning) {
            if(task.sendNotification){
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} Receive Task Success Add To The Queue`);
                        break;
                    case 'console':
                        logger(true,'INFO',"Receive Task \x1b[33mSuccess Add To The Queue\x1b[0m")
                        break;
                    case 'discord':
                        logger(true,'INFO',"Receive Task \x1b[33mSuccess Add To The Queue\x1b[0m")
                        break;
                    default:
                        break;
                }
            }
            this.tasks.push(task)
            if (login) await this.save();
            if (!this.tasking) await this.loop(true)
        } else {
            this.execute(task)
        }
    },
    async loop(sort = true) {
        if (this.tasking) return
        this.tasking = true;
        process.send({ type: 'setStatus', value: 3202 })
        if(sort) this.tasksort()
        let crtTask = this.tasks[0]
        if (login) await this.save();
        await this.execute(crtTask)
        this.tasks.shift()
        if (login) await this.save();
        this.tasking = false;
        process.send({ type: 'setStatus', value: 3201 })
        if (this.tasks.length) await this.loop(true)
    },
    async save() {
        let data = {
            'tasks': this.tasks,
            'err_tasks': this.err_tasks,
        }
        // console.log('tasks saving..')
        // console.log(data)
        await fsp.writeFile(`${process.cwd()}/config/${process.argv[2]}/task.json`, JSON.stringify(data, null, '\t'), function (err, result) {
            if (err) console.log('tasks save error', err);
        });
        //console.log('task complete')
    }
    // commit(task) {
    //     this.eventl.emit('commit', task);
    // },
}
function botTabhandler(tab) {
    const header = tab.header.extra
    if (!header) return
    let si = false, ci = false, bi = false
    let serverIdentifier = -1;
    let coinIdentifier = -1;
    let balanceIdentifier = -1;
    for (i in header) {
        if (header[i].text == '所處位置 ') {            //+2
            serverIdentifier = parseInt(i);            // 不知道為啥之前用parseInt
        } else if (header[i].text == '村民錠餘額') {    //+2
            coinIdentifier = parseInt(i);
        } else if (header[i].text == '綠寶石餘額') {    //+3
            balanceIdentifier = parseInt(i);
        }
    }
    if (serverIdentifier != -1 && header[serverIdentifier + 2]?.text?.startsWith('分流')) {
        botinfo.serverCH = header[serverIdentifier + 2].text
        let serverCH = header[serverIdentifier + 2].text.slice(2, header[serverIdentifier + 2].text.length);
        let s = -1;
        try {
            s = CNTA.toInteger(serverCH);
        } catch (e) {
            //return -1;
        }
        botinfo.server = s
        si = true;
    }
    if (coinIdentifier != -1) {
        coin = parseInt(header[coinIdentifier + 2]?.text.replace(/,/g, ''));
        if (coin != NaN) {
            botinfo.coin = coin
            ci = true
        }
    }
    if (balanceIdentifier != -1) {
        bal = parseFloat(header[balanceIdentifier + 2]?.text.replace(/,/g, ''));
        if (bal != NaN) {
            botinfo.balance = bal
            bi = true;
        }
    }
    if (si && ci && bi) botinfo.tabUpdateTime = new Date();
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
process.on('uncaughtException', async(err) => {
    logger(true, 'ERROR', err+"\n"+err.stack);
    //console.log(err)
    //if (login) try{await taskManager.save()}catch(e){};
    kill(1000)
});
process.on('message', async (message) => {
    switch (message.type) {
        case 'init':
            config = message.config;
            break;
        case 'dataRequire':
            dataRequiredata = {
                name: bot.username,
                server: botinfo.server,
                coin: botinfo.coin,
                balance: botinfo.balance,
                position: bot.entity.position,
                tasks: taskManager.tasks,
                runingTask: taskManager.tasking
            }
            process.send({ type: 'dataToParent', value: dataRequiredata })
            break;
        case 'cmd':
            let args = message.text.slice(1).split(' ')
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
            try{
                bot.chat(message.text)
                console.log(`已傳送訊息至 ${bot.username}: ${message.text}`);
            }catch(e){
                logger(false,"ERROR","訊息發送失敗 try again")
            }

            break;
        case 'reload':
            process.send({ type: 'setStatus', value: 3002 })
            await kill(1002)
            break;
        case 'exit':
            process.send({ type: 'setStatus', value: 0 })
            await kill(0)
            break;
        default:
            console.log('message from parent:', message);
    }
});
