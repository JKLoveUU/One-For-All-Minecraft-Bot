const path = require('path');
const readline = require('readline');
const { fork } = require('child_process');
const fs = require('fs');
const sd = require('silly-datetime');
// mc 不知道為甚麼不require打包就會漏掉了
// const rq_general = require(`./bots/generalbot.js`)
// const rq_raid = require(`./bots/raidbot.js`)
//const rqgeneral = fork(path.join(__dirname, 'generalbot.js'));
//const mineflayer = require("mineflayer");
//require(`${process.cwd()}/generalbot.js`)
// configs
const toml = require('toml-require').install({ toml: require('toml') });
const config = require(`${process.cwd()}/config.toml`);
const { logToFileAndConsole } = require("./src/logger");
const { Vec3 } = require('vec3')

// Discord 
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, Intents, MessageActionRow, MessageButton, MessageOptions, MessagePayload, MessageSelectMenu, MessageEmbed, Message } = require('discord.js');
const { log } = require('console');
const { exit } = require('process');
const rest = new REST({ version: '9' }).setToken(config.discord_setting.token);
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
let botMenuId = undefined;

// Bot Instace
const BotManager = require('./src/modules/botmanager.js');
const botstatus = require('./src/modules/botstatus.js');
//
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

const { DiscordBotStart, setBotMenuNotInService } = require('./src/modules/discordbot.js');

function checkPaths(){
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
    }
    if (!fs.existsSync(`config/global`)) {
        fs.mkdirSync(`config/global`, { recursive: true });
    }
}


const botManager = new BotManager();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
        const completions = ['.switch', '.list', '.create','.exit', '.close', '.reload', '.ff', '.eval'];
        const hits = completions.filter((childProcess) => childProcess.startsWith(line));
        return [hits.length ? hits : completions, line];
    },
});


function addConsoleEventHandler() {
    rl.on('line', async (input) => {
        let selectedBot = botManager.getCurrentBot();
        //console.log(selectedBot)
        if (input.startsWith('.')) {
            const [rlCommandName, ...rlargs] = input.trim().split(/\s+/);
            // console.log(`Received command ${rlCommandName}`)
            switch (rlCommandName.substring(1)) {
                // Create a new bot
                case 'create':
                    botManager.initBot(rlargs[0]);
                    break;
                // Force close the bot
                case 'ff':    
                    process.exit(0);
                    break;
                // List all bots
                case 'list':
                    botManager.printBotList();
                    break;
                // Close the bot
                case 'exit':
                    if (selectedBot == null) {
                        console.log(`No bot selected. Use .switch to select a bot.`);
                    } else {
                        selectedBot.childProcess.send({ type: "exit" });
                        process.title = '[Bot][-1] type .switch to select a bot';
                    }
                    break;
                // Reload the bot
                case 'reload':
                    if (selectedBot == null) {
                        console.log(`No bot selected. Use .switch to select a bot.`);
                    } else {
                        botManager.deleteBotInstance(selectedBot);
                        selectedBot.childProcess.send({ type: "reload" });
                    }
                    break;
                // Test
                case 'test':
                    logToFileAndConsole("INFO", "CONSOLE", rlargs);
                    break;
                // Switch to another bot
                case 'switch':
                    const botName = rlargs[0];
                    // Check botName is a string or not
                    if (typeof botName !== 'string') {
                        console.log(`Usage: .switch <botName>`);
                        break;
                    }
                    botManager.setCurrentBotByName(botName);
                    const currentBot = botManager.getCurrentBot();
                    process.title = `[Bot][${currentBot.name}] Use .switch to select a bot`;
                    console.log(`Current bot: ${currentBot.name}.`);
                    break;
                default:
                    if (selectedBot == null) {
                        console.log(`No bot selected. Use .switch to select a bot.`);
                    } else if (selectedBot.childProcess == null) {
                        console.log(`No child process for bot ${selectedBot.name}`);
                    } else {
                        selectedBot.childProcess.send({ type: "cmd", text: input });
                    }
                    break;
            }
        } else {
            if (selectedBot == null) {
                console.log(`No bot selected. Use .switch to select a bot.`);
            } else if (selectedBot.childProcess == null) {
                console.log(`No child process for bot ${selectedBot.name}`);
            } else {
                selectedBot.childProcess.send({ type: "chat", text: input });
            }
        }
        rl.prompt();
    });
    rl.on('close', async () => {
        await handleClose()
    });
}

function addMainProcessEventHandler() {
    process.on('uncaughtException', err => {
        logToFileAndConsole("ERROR", "CONSOLE", `${err}\nStack: ${err.stack}`);
        // console.log('Uncaught:\n', err)
        console.log('PID:', process.pid)
    });
    process.on('SIGINT', handleClose);
    process.on('SIGTERM', handleClose);
}

function main() {
    checkPaths();
    logToFileAndConsole("INFO", "CONSOLE", `Press Ctrl+C to exit   PID: ${process.pid}`);
    logToFileAndConsole("INFO", "CONSOLE", "Bot Start");
    // console.log(config.account.id)
    addMainProcessEventHandler();
    addConsoleEventHandler();
    DiscordBotStart(botManager);
    process.title = '[Bot][-1] type .switch to select a bot';
    let timerdelay = 3005;
    config.account.id.forEach((id, index) => {
        // id is a string
        setTimeout(() => {
            botManager.createBot(id);
            timerdelay += 200;
        }, timerdelay);
    });
    rl.prompt();
}
async function handleClose() {
    logToFileAndConsole("INFO", "CONSOLE", "Closing application...");
    botManager.stop();
    await Promise.all([
        setBotMenuNotInService(),
        sleep(1000 + botManager.getBotNums() * 200),
    ]);
    logToFileAndConsole("INFO", "CONSOLE", "Close finished");
    client.destroy();
    process.exit(0);
}

main();