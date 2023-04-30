const path = require('path');
const readline = require('readline');
const { fork } = require('child_process');
const toml = require('toml-require').install({ toml: require('toml') });
const config = require(`${process.cwd()}/config.toml`);
const bots = {
    name:[],
    bots:[],
    /**
     * 
     * @param {string | number} index 
     */
    getBot(index) {
        if(isNaN(index)){
            let i = this.name.indexOf(index)
            if(i===-1) return -1
            return this.bots[i]
        }
        if(index>=this.name.length) return -1
        return this.bots[index]
    },
    setBot(name,child) {
        if(this.name.indexOf(name)===-1){
            this.name.push(name)
            this.bots.push(
                {
                    c: child,
                    logTime: new Date(),
                    status: 0,
                }
            )
        }
    }
};
currentSelect = -1;
currentSelect = 0;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
      const completions = ['.switch', '.exit', '.close', '.test'];
      const hits = completions.filter((c) => c.startsWith(line));
      return [hits.length ? hits : completions, line];
    },
  });
// 启动 readline.Interface 实例
rl.prompt();
// 监听 'line' 事件
rl.on('line', (input) => {
  if(input.startsWith('.')){
    const [rlCommandName, ...rlargs] = input.trim().split(/\s+/);
    console.log(`收到指令 ${rlCommandName}`)
    switch (rlCommandName.substring(1)) {
        case 'list':
            console.log(`目前共 ${bots.length} 隻bot`)
            for(i in bots){
                console.log(`${i}. ${bots[i].name} ${bots[i].status}`)
            }
            break;
        case 'test':

            break; 
        default:
            break;
    }
  }else{
    let cs = bots.getBot(currentSelect)
    if(cs==-1){
        console.log(`未選擇 無法輸入聊天 use .switch to select a bot`);
    }else{
        cs.c.send({type:"chat",text: input});
    }
  }
  rl.prompt();
});
// 监听 'close' 事件
rl.on('close', () => {
  console.log('退出readLine');
});


process.on('SIGINT', handleClose);
process.on('SIGTERM', handleClose);
console.log(`Press Ctrl+C to exit   PID: ${process.pid}`);
process.title = 'Test-bot';
createGeneralBot()
//console.log(config)

async function handleClose() {
    console.log('Closing application...');
    console.log('Close finished');
    process.exit(0);
}
function createGeneralBot() {
    const child = fork(path.join(__dirname, 'generalbot.js'),[]);
    bots.setBot("test",child);
}

const exitcode = {
    0: 'success',
    1: 'general error',
    2: 'misuse of shell builtins',
    1001: 'server reload',
    2001: 'config not found',
    2002: 'config err',
  };