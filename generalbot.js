// console.log(process.argv)
const mineflayer = require("mineflayer");
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const profiles = require(`${process.cwd()}/profiles.json`);
if (!profiles[process.argv[2]]) {
    process.exit(2001)
}
const bot = (() => { // createMcBot
    const bot = mineflayer.createBot({
        host: profiles[process.argv[2]].host,
        port: profiles[process.argv[2]].port,
        username: profiles[process.argv[2]].username,
        auth: "microsoft",
        version: "1.18.2"
    })
    bot.once('spawn', async () => {
        console.log(`${process.argv[2]} login as ${bot.username}`)
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
        console.log(jsonMsg.toString())
    })
    bot.on('tpa', p => {
        bot.chat(true? '/tpaccept' : '/tpdeny')
    })
    bot.on('tpahere', p => {
        bot.chat(true? '/tpaccept' : '/tpdeny')
    })
    // bot.on('chat', (username, message) => {
    //   if (username === bot.username) return
    //   console.log(message)
    //  // bot.chat(message)
    // })
    bot.on('error', (error) => {
        console.log("err " + error)
        console.log('err code '+ error.code)
        kill(1000)
    })
    bot.on('kick', (reason) => {
        console.log("kick reason " + reason)
        kill(1000)
    })
    bot.on('death', () => {
        console.log(`Death at ${new Date()}`);
    })
    bot.on('end', (reason) => {
        console.log("end reason " + reason)
        kill(1000)
    })
    //init()
    return bot
})()

function kill(code = 1000) {
    //process.send({ type: 'restartcd', value: restartcd })
    console.log(`exiting in status ${code}`)
    bot.end()
    process.exit(code)
}
process.on('message', (message) => {
    switch (message.type) {
        case 'date':
            console.log(message.text)
            break;
        case 'cmd':
            //交給CommandManager
            break;
        case 'chat':
            bot.chat(message.text)
            console.log(`已傳送訊息至 ${bot.username}: ${message.text}`);
            break;
        case 'reload':
            kill(1002)
            break;
        case 'exit':
            kill(0)
            break;
        default:
            console.log('message from parent:', message);
    }
});
