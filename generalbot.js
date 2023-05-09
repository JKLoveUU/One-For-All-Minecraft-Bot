// console.log(process.argv)
const EventEmitter = require('events');
const mineflayer = require("mineflayer");
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const profiles = require(`${process.cwd()}/profiles.json`);
const fs = require('fs');
const fsp = require('fs').promises
const { version } = require("os");
const data = require('toml-require');
if (!profiles[process.argv[2]]) {
    console.log(`profiles中無 ${process.argv[2]} 資料`)
    process.send({ type: 'setStatus', value: 1000 })
    process.exit(2001)
}
if (!fs.existsSync(`config/${process.argv[2]}`)) {
    fs.mkdirSync(`config/${process.argv[2]}`, { recursive: true });
    console.log(`未發現配置文件 請至 config/${process.argv[2]} 配置`)
}
process.send({ type: 'setStatus', value: 3001 })
const botinfo = {
    server: -1,
    serverCH: -1,
    balance: -1,
    coin: -1,
    tabUpdateTime: new Date(),
}
const bot = (() => { // createMcBot
    const bot = mineflayer.createBot({
        host: profiles[process.argv[2]].host,
        port: profiles[process.argv[2]].port,
        username: profiles[process.argv[2]].username,
        auth: "microsoft",
        version: "1.18.2"
    })
    const ChatMessage = require('prismarine-chat')("1.18.2")
    bot.once('spawn', async () => {
        console.log(`${process.argv[2]} login as ${bot.username}`)
        taskManager.init()
        process.send({ type: 'setStatus', value: 3200 })
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
    })
    bot.on('message', async (jsonMsg) => {
        //console.log(jsonMsg.toString())
        //let time = new Date();
    })
    bot.on('dm', async (jsonMsg) => {
        // let abc = jsonMsg.toMotd()
        // console.log(abc)
        let args = jsonMsg.toString().split(' ')
        //console.log(args)
        let playerID = args[0].slice(1, args[0].length);
        //console.log(playerID)
        let cmds = args.slice(3, args.length);
        if (taskManager.isTask(cmds)) {
            // console.log(taskManager.isImm(cmds))
            taskManager.assign(new Task(undefined, cmds.join(' '), 'minecraft-dm', cmds.join(' '), undefined, undefined, playerID, undefined))
        }
        console.log(jsonMsg.toString())
    })
    bot.on('tpa', p => {
        bot.chat(true ? '/tpaccept' : '/tpdeny')
    })
    bot.on('tpahere', p => {
        bot.chat(true ? '/tpaccept' : '/tpdeny')
    })
    bot._client.on('playerlist_header', () => {
        update = false
        const header = bot.tablist.header.extra
        if (!header) return
        const server = header[header.length - 17]?.text
        if (!server?.startsWith('分流')) return
        { botinfo.serverCH = server; update = true; }
        if (header[header.length - 29]?.text !== '낸') return
        const bal = parseFloat(header[header.length - 28]?.text.replace(/,/g, '')); 
        if (true || (bal >= 0 && grinde.bal - bal !== 1728 && grinde.bal !== bal)) { botinfo.balance = bal; update = true; }
        if(update == true ) botinfo.tabUpdateTime = new Date();
    })
    //---------------
    bot.on('error', async (error) => {
        console.log("err " + error)
        console.log('err code ' + error.code)
        await kill(1000)
    })
    bot.on('kick', async (reason) => {
        console.log("kick reason " + reason)
        await kill(1000)
    })
    bot.on('death', () => {
        console.log(`Death at ${new Date()}`);
    })
    bot.once('end', async () => {
        console.log(`${process.argv[2]} disconnect at ${new Date()}`)
        await kill(1000)
    })
    //init()
    return bot
})()

async function kill(code = 1000) {
    //process.send({ type: 'restartcd', value: restartcd })
    console.log(`exiting in status ${code}`)
    await taskManager.save();
    bot.end()
    process.exit(code)
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
    tasking: false,
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
        if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/task.json`)) {
            this.save()
        } else {
            let tt = await readConfig(`${process.cwd()}/config/${process.argv[2]}/task.json`)
            this.tasks = tt.tasks
            this.err_tasks = tt.err_tasks
        }
        // this.eventl.on('commit', (task) => {
        //     console.log('commit')
        // });
        // console.log(this.tasks.length)
        // this.eventl.emit('commit');
    },
    isTask(args) {
        for (let i = 0; i < args.length; i++) {
            if (commands[args[i]] !== undefined) {
                return true;
            }
        }
        return false
    },
    isImmediately(task, i = 0, g) {
        return false
        // if(i==0){
        //     if (commands[args[i]]['imm'] !== undefined) {
        //         return commands[args[i]]['imm'];
        //     } else {
        //         return isImm(args,i++,commands[args[i]]['group']);
        //     }
        // }else{
        //     if (commands[g][args[i]]['imm'] !== undefined) {

        //     }
        // }

    },
    async execute(task) {
        try {
            while (1) {
                if (this.tasking.length == 3) break
                await sleep(1000)
            }
            //exe task
        } catch (error) {
            console.log("task執行錯誤")
            console.log(task)
        }
    },
    async assign(task, priority = 10) {
        let isImm = this.isImmediately(task)
        if (isImm) {
            this.execute(task)
        } else {
            if (this.tasks.length == 0) {
                this.tasks.push(task)
            } else {
                this.tasks.push(task)
            }
            if (!this.tasking) await this.loop()
        }
    },
    async loop() {
        if (this.tasking) return
        this.tasking = true;
        this.tasksort()
        let crtTask = this.tasks[0]
        await this.execute(crtTask)
        this.tasks.shift()
        this.tasking = false;
        if (this.tasks.length) await this.loop()
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
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
process.on('message', async (message) => {
    switch (message.type) {
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
            //交給CommandManager
            break;
        case 'chat':
            bot.chat(message.text)
            console.log(`已傳送訊息至 ${bot.username}: ${message.text}`);
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
const commands = {
    'say': { 'imm': true },
    'info': { 'imm': true },
    'mp': { 'group': 'mapart_g' },
    'mapart': { 'group': 'mapart_g' },
    'mapart_g': {
        'info': { 'imm': true },
    }
};
