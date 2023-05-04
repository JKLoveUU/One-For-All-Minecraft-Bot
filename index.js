const path = require('path');
const readline = require('readline');
const { fork } = require('child_process');
const mineflayer = require("mineflayer");
const fs = require('fs');
const { testf } = require('./lib/test.js');
const toml = require('toml-require').install({ toml: require('toml') });
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
// const configPath = path.join(__dirname, 'config.toml'); // 使用相对路径访问文件
// const config = toml.parse(fs.readFileSync(configPath, 'utf8'));
const config = require(`${process.cwd()}/config.toml`);
//create logs dir if not exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}
const logFilePath = path.join(logsDir,"lastest"+".log");
const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
function myLog(...args) {
  const prefix = '[LOG]';
  const message = `[${new Date()}] ${prefix} ${args.join(' ')}\n`;
  logFile.write(message);
}
myLog(`Bot Start at ${new Date().toString()}`);
const dataManager = {
    
}
//let ts = 
require("./lib/test.js");
//ts.test()
testf()
const bots = {
    name: [],
    bots: [],
    /**
     * 
     * @param {string | number} index 
     */
    getBot(index) {
        if (isNaN(index)) {
            let i = this.name.indexOf(index)
            if (i === -1) return -1
            return this.bots[i]
        }
        if (index >= this.name.length) return -1
        return this.bots[index]
    },
    setBot(name, child) {
        if (this.name.indexOf(name) === -1) {
            this.name.push(name)
            this.bots.push(
                {
                    c: child,
                    logTime: new Date(),
                    status: 0,
                }
            )
        } else {
            this.bots[this.name.indexOf(name)] = {
                c: child,
                logTime: new Date(),
                status: 0,
            }
        }
    }
};
//const dc = require("./lib/discordManager")(config,dataManager,bots);
let currentSelect = -1;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
        const completions = ['.switch', '.exit', '.close', '.test','.reload'];
        const hits = completions.filter((c) => c.startsWith(line));
        return [hits.length ? hits : completions, line];
    },
});
// 启动 readline.Interface 实例
rl.prompt();
// 监听 'line' 事件
rl.on('line', (input) => {
    let cs = bots.getBot(currentSelect)
    //console.log(cs)
    if (input.startsWith('.')) {
        const [rlCommandName, ...rlargs] = input.trim().split(/\s+/);
        console.log(`收到指令 ${rlCommandName}`)
        switch (rlCommandName.substring(1)) {
            case 'list':
                console.log(`目前共 ${bots.name.length} 隻bot`)
                for (i in bots.name) {
                    console.log(`${i}. ${bots.name[i]} ${bots.bots[i].status}`)
                }
                break;
            case 'exit':
                if (cs == -1) {
                    console.log(`未選擇 無法執行該命令 use .switch to select a bot`);
                } else {
                    cs.c.send({ type: "exit", });
                }
                break;
            case 'reload':
                if (cs == -1) {
                    console.log(`未選擇 無法執行該命令 use .switch to select a bot`);
                } else {
                    cs.c.send({ type: "reload", });
                }
                break;
            case 'test':
                myLog(rlargs);
                break;
            case 'switch':
                let tmp = parseInt(rlargs[0], 10);
                if (tmp > bots.name.length) {
                    console.log("index err")
                    return
                }
                currentSelect = tmp;
                break;
            default:
                console.log(`unknown command '${rlCommandName.substring(1)}'`);
                break;
        }
    } else {
        if (cs == -1) {
            console.log(`未選擇 無法輸入聊天 use .switch to select a bot`);
        } else {
            cs.c.send({ type: "chat", text: input });
        }
    }
    rl.prompt();
});
// 监听 'close' 事件
rl.on('close', () => {
    //console.log('退出readLine');
    handleClose()
    process.exit(0)
});

process.on('uncaughtException', err => {
    console.log('Uncaught:\n', err)
  })
process.on('SIGINT', handleClose);
process.on('SIGTERM', handleClose);
console.log(`Press Ctrl+C to exit   PID: ${process.pid}`);
//console.log(config)
main()
function main(){
    console.log(config.account.id)
    currentSelect = 0;
    process.title = 'Test-bot 0 - are in service';
    let tmp = 5;
    //get type  and set of all bot
    // type: auto raid general
    for(i in config.account){
        //console.log(config.account[i])
    }
    for(let i = 0; i<config.account.id.length;i++){
        setTimeout(() => {
            console.log(i)
            console.log(config.account.id[i])
            createGeneralBot(config.account.id[i]);
            tmp+=200;
          }, tmp);
        
    }

}
async function handleClose() {
    console.log('Closing application...');
    for (i in bots.name) {
        if(bots.bots[i].c == undefined) continue
        bots.bots[i].c.send({ type: "exit"});
    }
    console.log('Close finished');
    process.exit(0);
}
function createGeneralBot(name) {
    const child = fork(path.join(__dirname, 'generalbot.js'), [name]);
    bots.setBot(name, child);
    child.on('error', e => {
        console.log(`Error from ${name}:\n${e}`)
    })
    child.on('close', c => {
        child.removeAllListeners()
        bots.setBot(name, undefined)
        if(c==0) console.log(`${name}: stopped success`)
        else if(c>=2000){
            console.log(`bot  ${name} err code = ${c}`)
        }else{
            console.log("bot will restart at 10 second")
           // bots.setBot(name, setTimeout(() => { createGeneralBot(name) }, 10_000))
           setTimeout(() => { createGeneralBot(name) }, 10_000)
        }
    })
}
const exitcode = {
    0: 'success',
    1: 'general error',
    2: 'misuse of shell builtins',
    1000: 'unknown error',
    1001: 'server reload',
    1002: 'client reload',
    1003: 'client error reload',
    2001: 'config not found',   //不可重啟類
    2002: 'config err',
};
const botstatus = {
    0: 'closed',
    1: 'free',
    2: 'in tasking',
    3: 'raid',
    1000: 'Profile Not Found'
};