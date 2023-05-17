const path = require('path');
const readline = require('readline');
const { fork } = require('child_process');
const fs = require('fs');
const sd = require('silly-datetime');
// mc
const rqgeneral = require(`./generalbot.js`)
//const rqgeneral = fork(path.join(__dirname, 'generalbot.js'));
//const mineflayer = require("mineflayer");
//require(`${process.cwd()}/generalbot.js`)

// configs
const toml = require('toml-require').install({ toml: require('toml') });
const config = require(`${process.cwd()}/config.toml`);
const profiles = require(`${process.cwd()}/profiles.json`);

const { Vec3 } = require('vec3')
const EventEmitter = require('events');

// Discord 
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, Intents, MessageActionRow, MessageButton, MessageOptions, MessagePayload, MessageSelectMenu, MessageEmbed, Message } = require('discord.js');
const rest = new REST({ version: '9' }).setToken(config.discord_setting.token);
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
let botMenuId = undefined;
let botMenuLastUpdate = new Date();

//
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

//const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}
//const logFilePath = path.join(logsDir, "lastest" + ".log");
const logFile = fs.createWriteStream('logs/lastest.log', { flags: 'a' });
function logToFileAndConsole(p = "CONSOLE", type = "INFO", ...args) {
    let fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss')
    let colortype
    switch (type) {
        case "DEBUG":
            colortype = "\x1b[32m"+type+"\x1b[0m";
            break;
        case "INFO":
            colortype = "\x1b[32m"+type+"\x1b[0m";
            break;
        case "WARN":
            colortype = "\x1b[33m"+type+"\x1b[0m";
            break;
        case "ERROR":
            colortype = "\x1b[31m"+type+"\x1b[0m";
            break;
        case "CHAT":
            colortype = "\x1b[93m"+type+"\x1b[0m";
            break;
        default:
            colortype = type;
            break;
    }
    logFile.write(`[${fmtTime}][${type}][${p}] ${args.join(' ')}\n`);
    console.log(`[${fmtTime}][${colortype}][${p}] ${args.join(' ')}`);
}

const dataManager = {
}
const bots = {
    name: [],
    bots: [],
    handle: new EventEmitter(),
    /**
     * getBot
     * @param {string | number} index index or name 
     * @return {botsInstance}
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
    setBot(name, child, type = null, crtType = null, debug) {
        if (this.name.indexOf(name) === -1) {
            this.name.push(name)
            this.bots.push(
                {
                    name: name,
                    c: child,
                    logTime: new Date(),
                    status: 0,
                    type: type,
                    crtType: crtType,
                    reloadCD: 10_000,
                    debug: debug ? true : false,
                }
            )
        } else {
            this.bots[this.name.indexOf(name)].c = child;
            this.bots[this.name.indexOf(name)].logTime = new Date();
            if (type != null) this.bots[this.name.indexOf(name)].type = type;
            if (crtType != null) this.bots[this.name.indexOf(name)].crtType = crtType;
            if (debug != null) this.bots[this.name.indexOf(name)].debug = debug;
        }
    },
    setBotStatus(name, status) {
        let b = this.getBot(name)
        //console.log(b)
        if (b === -1) return
        b.status = status;
    },
    setBotReloadCD(name, cd = 10_000) {
        let b = this.getBot(name)
        //console.log(b)
        if (b === -1) return
        b.reloadCD = cd;
    },
    /**
     * 用於設定crtType
     * @param {*} name 
     * @param {*} type 
     * @returns 
     */
    setBotCrtType(name, crtType) {
        let b = this.getBot(name)
        //console.log(b)
        if (b === -1) return
        b.crtType = crtType;
    },
    async getBotInfo(index) {
        let crt;
        if (isNaN(index)) {
            let i = this.name.indexOf(index)
            if (i === -1) crt = -1
            crt = this.bots[i]
        } else if (index >= this.name.length) crt = -1
        else crt = this.bots[index]
        if (crt == -1) {
            return -1
        } else {
            //console.log('data rqing ...')
            d = await this.getBotData(crt.name)
            // TO-DO 這裡需要加上錯誤處理
            //console.log(d)
            let botinfo = {
                id: crt.name,
                name: d.name,
                avatar: `https://mc-heads.net/avatar/${d.name}/64`,
                server: d.server,
                coin: d.coin,
                balance: d.balance,
                position: d.position,
                tasks: d.tasks,
                runingTask: d.runingTask
            };
            return botinfo
        }
    },
    async getBotData(name) {
        let crt;
        if (isNaN(name)) {
            let i = this.name.indexOf(name)
            if (i === -1) crt = -1
            crt = this.bots[i]
        } else if (name >= this.name.length) crt = -1
        else crt = this.bots[name]
        if (crt == -1) {
            return -1
        }
        return new Promise((resolve, reject) => {
            var timer = setTimeout(() => {
                // console.log('data Time out',name)
                bots.handle.off('data', setdata);
                reject()
            }, 100)
            bots.handle.on('data', setdata)
            crt.c.send({ type: 'dataRequire' });
            function setdata(data, nm) {
                if (name != nm) return;
                clearTimeout(timer)
                // console.log('getData',name)
                bots.handle.off('data', setdata);
                resolve(data);
            }
        })
    }
};
//const dc = require("./lib/discordManager")(config,dataManager,bots);
let currentSelect = -1;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
        const completions = ['.switch', '.list','.exit', '.close', '.reload', '.ff', '.eval', '.test',];
        const hits = completions.filter((c) => c.startsWith(line));
        return [hits.length ? hits : completions, line];
    },
});
rl.prompt();
rl.on('line', async (input) => {
    let cs = bots.getBot(currentSelect)
    //console.log(cs)
    if (input.startsWith('.')) {
        const [rlCommandName, ...rlargs] = input.trim().split(/\s+/);
        // console.log(`收到指令 ${rlCommandName}`)
        switch (rlCommandName.substring(1)) {
            case 'ff':    //debug
                process.exit(0)
                break;
            case 'eval':    //debug
                eval(input.substring(6))
                break;
            case 'list':
                const longestLength = bots.name.reduce((longest, a) => {
                    return a.length > longest ? a.length : longest;
                }, 0);
                console.log(`目前共 ${bots.name.length} 隻bot`)
                console.log((`Id`.padEnd(parseInt(bots.bots.length / 10) + 2)) + '|' + (`Bot`.padEnd(longestLength)) + '|Status|Type   |CrtType')
                for (i in bots.name) {
                    console.log(`${i}. ${bots.name[i].padEnd(longestLength, ' ')} ${(bots.bots[i].status).toString().padEnd(6, ' ')} ${bots.bots[i].type ? (bots.bots[i].type).padEnd(7, ' ') : '-'.padEnd(7, ' ')} ${bots.bots[i].crtType ? bots.bots[i].crtType.padEnd(7, ' ') : '-'.padEnd(7, ' ')}`)
                }
                break;
            case 'exit':
                if (cs == -1) {
                    console.log(`未選擇 無法執行該命令 use .switch to select a bot`);
                } else {
                    cs.c.send({ type: "exit", });
                    currentSelect = -1;
                    process.title = '[Bot][-1] type .switch to select a bot';
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
                logToFileAndConsole("CONSOLE", "INFO", rlargs);
                break;
            case 'switch':
                let tmp = parseInt(rlargs[0], 10);
                if (tmp > bots.name.length && tmp == undefined) {
                    console.log("index err")
                    return
                }
                currentSelect = tmp;
                process.title = `[Bot][${rlargs[0]} ${bots.getBot(tmp).name}] type .switch to select a bot`
                console.log(`switch to bot [${rlargs[0]} - ${bots.getBot(tmp).name}].`)
                break;
            default:
                cs.c.send({ type: "cmd", text: input });
                //console.log(`unknown command '${rlCommandName.substring(1)}'`);
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
rl.on('close', async () => {
    //console.log('退出readLine');
    await handleClose()
});
client.on('ready', async () => {
    logToFileAndConsole("CONSOLE", "INFO", `Discord bot Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{
            name: 'Minecraft',
            type: 1,
            url: 'https://www.twitch.tv/nacho_dayo',
        }],
        status: 'online',
    });
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    //delete all old bot menu
    const botMenuIds = [];
    await channel.messages.fetch({ limit: 30 }).then(messages => {
        const botMessages = messages.filter(m => m.author.id === client.user.id && m.author.bot);
        const matchingMessages = botMessages.filter(m => {
            if (m.embeds && m.embeds.length > 0) {
                const firstEmbed = m.embeds[0];
                const matchingField = firstEmbed.fields.find(field => field.name.startsWith('目前共'));
                return (matchingField !== undefined);
            } else {
                return false;
            }
        });
        //console.log(matchingMessages)
        if (matchingMessages) {
            matchingMessages.forEach(msg => {
                // console.log(msg)
                botMenuIds.push(msg.id);
            });
        } else {
        }
    });
    channel.bulkDelete(botMenuIds)
        .then(deletedMessages => logToFileAndConsole("CONSOLE", "INFO", `Deleted ${deletedMessages.size} expired Menu`))
        .catch(console.error);
    let newbotMenuId = await channel.send(generateBotMenu());
    botMenuId = newbotMenuId.id
    setInterval(async () => {
        let channel = client.channels.cache.get(config.discord_setting.channelId);  //error here bug
        let oldmenu = await getChannelMsgFetch(channel, botMenuId)
        //console.log(oldmenu)
        if (oldmenu) {
            await oldmenu.edit(generateBotMenu());
        } else {
            let newbotMenuId = await channel.send(generateBotMenu());
            botMenuId = newbotMenuId.id
        }
    }, 30_000);
});
//botmenu handler 
client.on('interactionCreate', async (interaction) => {
    if(interaction.isCommand()) return
    //  console.log(interaction)
    if (!interaction.customId.startsWith('botmenu')) {
        return
    }
    console.log(`[Discord] ${interaction.customId} - ${interaction.user.username}`)
    if (!discordWhiteListCheck(interaction.member)) {
        await noPermission(interaction);
        return
    }
    if (interaction.isButton()) {
        switch (interaction.customId) {
            case 'botmenu-refresh-btn':
                await interaction.update(generateBotMenu());
                break;
            case 'botmenu-shift-btn':
                const message = await interaction.channel.messages.fetch(interaction.message.id);
                let newbotMenuId = await interaction.channel.send(generateBotMenu());
                botMenuId = newbotMenuId.id
                await message.delete();
                break;
            case 'botmenu-close-btn':
                const closeConfirmButon = interaction.component
                    .setCustomId('botmenu-close-confirm-btn')
                    .setLabel('Click Again To close')
                    .setStyle('DANGER')
                    .setEmoji('⚪');
                const [row1, row2] = interaction.message.components;
                await interaction.update({
                    components: [
                        new MessageActionRow().addComponents(row1.components),
                        new MessageActionRow().addComponents(row2.components),
                    ],
                });

                break;
            case 'botmenu-close-confirm-btn':
                await interaction.reply({
                    content: 'bot closing',
                    ephemeral: true
                })
                console.log(`Bot close by Discord - ${interaction.user.username}`)
                await handleClose()
                break;
            default:
                await notImplemented(interaction);
                break;
        }
    } else if (interaction.isSelectMenu()) {
        const { customId, values } = interaction;
        if (customId === 'botmenu-select') {
            targetBot = values[0].slice(15)
            console.log(targetBot)
            //  console.log(bots.getBot(targetBot))
            //need check status here
            botinfo = await bots.getBotInfo(targetBot)
            interaction.reply(generateGeneralBotControlMenu(botinfo))
        } else await notImplemented(interaction);
    } else {
        await notImplemented(interaction);
    }

});
//generalbotcontrolmenu handler
client.on('interactionCreate', async (interaction) => {
    if(interaction.isCommand()) return
    //  console.log(interaction)
    if (!interaction.customId.startsWith('generalbotcontrolmenu')) {
        return
    }
    console.log(`[Discord] ${interaction.customId} - ${interaction.user.username}`)
    if (!discordWhiteListCheck(interaction.member)) {
        await noPermission(interaction);
        return
    }
    if (interaction.isButton()) {
        switch (interaction.customId) {
            case 'generalbotcontrolmenu-close-btn':
                await interaction.message.delete();
                break;
            default:
                await notImplemented(interaction);
                break;
        }
    } else if (interaction.isSelectMenu()) {
        const { customId, values } = interaction;
        if (customId === 'botmenu-select') {
            console.log(values[0])
            await notImplemented(interaction);
        } else await notImplemented(interaction);
    } else {
        await notImplemented(interaction);
    }
});
process.on('uncaughtException', err => {
    logToFileAndConsole("CONSOLE", "INFO", err);
    console.log('Uncaught:\n', err)
    console.log('PID:', process.pid)
});

process.on('SIGINT', handleClose);
process.on('SIGTERM', handleClose);
console.log(`Press Ctrl+C to exit   PID: ${process.pid}`);
logToFileAndConsole("CONSOLE", "INFO", `Bot Start`);

client.login(config.discord_setting.token)
main()
function main() {
    console.log(config.account.id)
    currentSelect = 0;
    process.title = '[Bot][-1] type .switch to select a bot';
    let timerdelay = 5;
    //get type  and set of all bot
    // type: auto raid general
    for (i in config.account) {
        //console.log(config.account[i])
    }
    for (let i = 0; i < config.account.id.length; i++) {
        setTimeout(() => {
            //console.log(i)
            //console.log(config.account.id[i])
            //createBot(config.account.id[i])
            initBot(config.account.id[i]);
            //createGeneralBot(config.account.id[i]);
            timerdelay += 200;
        }, timerdelay);
    }
}
async function handleClose() {
    console.log('Closing application...');
    for (i in bots.name) {
        if (bots.bots[i].c == undefined) continue
        bots.bots[i].c.send({ type: "exit" });
    }
    await Promise.all([
        setBotMenuNotInService(),
        // new Promise(resolve => setTimeout(resolve, 1000)), // wait for 1 second
        // wait for all promises to complete
        //unregisterCommands(client)
        //anotherAsyncFunction()
    ]);
    console.log('Close finished');
    client.destroy();
    process.exit(0);
}
function initBot(name) {
    bots.setBot(name, undefined);
    if (!profiles[name]) {
        bots.setBotStatus(name, 1000)
        return
    }
    if (!profiles[name].type) {
        bots.setBotStatus(name, 1001)
        return
    }
    let debug = profiles[name].debug ? true : false;
    switch (profiles[name].type) {
        case 'general':
            bots.setBot(name, undefined, 'general', 'general', debug);
            break;
        case 'raid':
            bots.setBot(name, undefined, 'raid', 'raid', debug);
            break;
        case 'auto':
            bots.setBot(name, undefined, 'auto', 'general', debug);
            break;
        default:
            console.log(`Unknown bot type ${profiles[name].type} of ${name}`)
            break;
    }
    createBot(name);
}
/**
 * create Bot with the crtType
 * @param {*} name 
 * @returns 
 */
function createBot(name) {
    let bot = bots.getBot(name)
    let botFile;
    if (bot === -1) {
        console.log(`bot ${name} not init...`)
        return;
    }
    switch (bot.crtType) {
        case 'general':
            botFile = 'generalbot.js';
            break;
        case 'raid':
            botFile = 'raidbot.js';
            break;
        default:
            console.log(`Invaild crtType: ${bot.crtType}\nunable to create... ${name}`)
            return
            break;
    }
    let args = [name, bot.type]
    if (bot.debug) args.push("--debug")
    const child = fork(path.join(__dirname, botFile), args);
    bots.setBot(name, child);
    child.on('error', e => {
        console.log(`Error from ${name}:\n${e}`)
    })
    child.send({type: 'init',config: config})
    child.on('close', c => {
        child.removeAllListeners()
        bots.setBot(name, undefined)
        if (c == 0) console.log(`${name}: stopped success`)
        else if (c >= 2000) {
            console.log(`bot  ${name} err code = ${c}`)
        } else {
            console.log(`bot will restart at ${bot.reloadCD / 1000} second`)
            // bots.setBot(name, setTimeout(() => { createGeneralBot(name) }, 10_000))
            setTimeout(() => { createBot(name) }, (bot.reloadCD ? bot.reloadCD : 10_000))
        }
    })
    child.on('message', m => {
        switch (m.type) {
            case 'logToFile':
                logToFileAndConsole(name,m.value.type,m.value.msg)
                break
            case 'setReloadCD':
                bots.setBotReloadCD(name, m.value)
                break
            case 'setStatus':
                //console.log('setStatus')
                //console.log(m)
                bots.setBotStatus(name, m.value)
                break
            case 'setCrtType':
                //console.log('setStatus')
                //console.log(m)
                bots.setBotCrtType(name, m.value)
                break
            case 'dataToParent':
                //console.log('setStatus')
                // console.log(m.value)
                bots.handle.emit('data', m.value, name)
                break
        }
    })

}
async function getChannelMsgFetch(channel, id) {
    let oldmenu;
    try {
        oldmenu = await channel.messages.fetch(id, { force: true });
        return oldmenu;
    } catch (error) {
        //console.log(error)
        return undefined;
    }
}
async function setBotMenuNotInService() {
    //onsole.log("setBotMenuNotInService")
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    //const channel = client.channels.cache.get(config.discord_setting.channelId);    //error here bug
    let oldmenu = await getChannelMsgFetch(channel, botMenuId)
    //console.log(oldmenu)
    if (!oldmenu) return
    //const embed = generateBotMenuEmbed();
    const closeComponents = oldmenu.components.map(row => {
        const newComponents = row.components.map(component => {
            //console.log(component)
            if (component.type === 'BUTTON') {
                // If the component is a button, set it to be disabled
                return component.setDisabled(true);
            } else if (component.type === 'SELECT_MENU') {
                return component.setDisabled(true).setPlaceholder('❌ | Not In Service');
                // If the component is a selectmenu, set it to be disabled and clear its options
            } else {
                // If the component is not a button or selectmenu, just return it unmodified
                return component;
            }
        });
        // Return a new MessageActionRow with the modified components
        return new MessageActionRow().addComponents(newComponents);
    });
    const author = {
        name: "當前Bots",
        iconURL: "https://i.imgur.com/AfFp7pu.png",
        url: 'https://discord.js.org',
    };
    const embed = new MessageEmbed()
        //.setDescription('Choose one of the following options:')
        .setAuthor(author)
        .setColor('RED')
        .setThumbnail("https://i.imgur.com/AfFp7pu.png")
        .addFields(
            { name: `目前共 \`${'-'}\` 隻 bot`, value: '\`Not In Service\`' },
        )
        .setTimestamp()
        .setFooter({ text: '關閉於', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    await oldmenu.edit({ embeds: [embed], components: closeComponents });
}
function generateBotMenu() {
    const embed = generateBotMenuEmbed();
    let opts = []
    for (let i = 0; i < bots.bots.length; i++) {
        opts.push({
            label: `${bots.name[i]}`,
            // description: 'Open menu of Basic operations',
            value: `botmenu-select-${bots.name[i]}`,            //need fix
        })
    }
    const row1 = new MessageActionRow().addComponents(
        new MessageButton()
            .setCustomId('botmenu-shift-btn')
            .setLabel('下移')
            .setStyle('SECONDARY'),
        new MessageButton()
            .setCustomId('botmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle('SUCCESS')
            .setEmoji('♻️'),
        new MessageButton()
            .setCustomId('botmenu-close-btn')
            .setLabel('Close')
            .setStyle('DANGER')
            .setEmoji('⚪')

    );
    const row2 = new MessageActionRow().addComponents(
        new MessageSelectMenu()
            .setCustomId('botmenu-select')
            .setPlaceholder('Select a bot to operate')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(opts)
    );
    let b_components = !opts.length ? [row1] : [row1, row2];
    return { embeds: [embed], components: b_components }
}
function generateBotMenuEmbed() {
    const author = {
        name: "當前Bots",
        iconURL: "https://i.imgur.com/AfFp7pu.png",
        url: 'https://discord.js.org',
    };
    let botsfield = '';
    const longestLength = bots.name.reduce((longest, a) => {
        return a.length > longest ? a.length : longest;
    }, 0);
    for (let i = 0; i < bots.bots.length; i++) {
        botsfield += (`${i})`.padStart(parseInt(bots.bots.length / 10) + 2))
        botsfield += (` ${bots.name[i]}`.padEnd(longestLength + 1))
        botsfield += (` ${botstatus[bots.bots[i].status]}\n`)
    }
    botsfield = botsfield ? (`Id`.padEnd(parseInt(bots.bots.length / 10) + 2)) + '|' + (`Bot`.padEnd(longestLength)) + '|Status\n' + botsfield : botsfield;
    const embed = new MessageEmbed()
        //.setDescription('Choose one of the following options:')
        .setAuthor(author)
        .setColor('GREEN')
        .setThumbnail("https://i.imgur.com/AfFp7pu.png")
        .addFields(
            { name: `目前共 \`${bots.name.length}\` 隻 bot`, value: '\`\`\`' + (botsfield ? botsfield : '無') + '\`\`\`' },
        )
        .setTimestamp()
        .setFooter({ text: 'TEXXXTTTT', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    return embed;
}
function generateGeneralBotControlMenu(botinfo) {
    const embed = generateGeneralBotControlMenuEmbed(botinfo);
    const row1 = new MessageActionRow().addComponents(
        // new MessageButton()
        //   .setCustomId('ping-btn')
        //   .setLabel('Ping')
        //   .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('generalbotcontrolmenu-time-btn')
            .setLabel('Current Time')
            .setStyle('PRIMARY'),
        // new MessageButton()
        //   .setCustomId('new-btn')
        //   .setLabel('New Button')
        //   .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('generalbotcontrolmenu-newest-btn')
            .setLabel('下移')
            .setStyle('SECONDARY'),
        new MessageButton()
            .setCustomId('generalbotcontrolmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle('SUCCESS')
            .setEmoji('♻️'),
        new MessageButton()
            .setCustomId('generalbotcontrolmenu-close-btn')
            .setLabel('Close Panel')
            .setStyle('DANGER')
            .setEmoji('⚪')

    );
    const row2 = new MessageActionRow().addComponents(
        new MessageSelectMenu()
            .setCustomId('generalbotcontrolmenu-select')
            .setPlaceholder('Select an option')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
                {
                    label: '基礎操作',
                    description: 'Open menu of Basic operations',
                    value: 'generalbotcontrolmenu-basic-operations-menu',
                    emoji: '🛠️',
                },
                {
                    label: '地圖畫功能',
                    description: 'Open menu of mapart',
                    value: 'generalbotcontrolmenu-mapart-menu',
                    emoji: '🗺️',
                },
                {
                    label: '倉庫管理功能',
                    description: 'Open menu of warehouse manager system',
                    value: 'generalbotcontrolmenu-wms-menu',
                    emoji: '🏬',
                },
                {
                    label: 'Ping',
                    description: 'This is option 1',
                    value: 'generalbotcontrolmenu-ping',
                    emoji: '🔥',
                },
                {
                    label: 'Current Time',
                    description: 'Show Current Time',
                    value: 'generalbotcontrolmenu-time',
                    emoji: '🔥',
                },
                {
                    label: 'New Button',
                    description: 'Create message with button',
                    value: 'generalbotcontrolmenu-button',
                    emoji: '🔥',
                },
                {
                    label: 'Permissions',
                    description: 'not implement yet',
                    value: 'generalbotcontrolmenu-permission-menu',
                    emoji: '🔥',
                },
            ])
    );
    return { content: `Control Panel for bot - ${botinfo.id}`, embeds: [embed], components: [row1, row2] };
}
function generateGeneralBotControlMenuEmbed(botinfo) {
    const author = {
        name: botinfo.name,
        iconURL: botinfo.avatar,
        url: 'https://discord.js.org',
    };
    //console.log(botinfo)
    let crtTask = botinfo.runingTask ? `\`${botinfo.tasks[0].displayName}\`` : '\`-\`';
    let taskQueue = ''
    for (let i = (botinfo.runingTask ? 1 : 0); i < botinfo.tasks.length; i++) {
        taskQueue += '\`' + botinfo.tasks[i].displayName + '\`\n'
    }
    taskQueue = taskQueue ? taskQueue : '\`-\`'
    const embed = new MessageEmbed()
        //.setDescription('Choose one of the following options:')
        .setAuthor(author)
        .setColor('#7CFC00')
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `${'`' + (botinfo.server).toString().padEnd(3) + '`'}`, inline: true },
            { name: ':coin:Coin', value: '`' + botinfo.coin.toString().padEnd(7) + '`', inline: true },
            { name: ':moneybag:Balance', value: '`' + botinfo.balance.toString().padEnd(14) + '`', inline: true },
            {
                name: ':triangular_flag_on_post:座標',
                value: `X:${'`' + botinfo.position.x.toFixed(1).toString().padStart(7) + '`'} Y:${'`' + botinfo.position.y.toFixed(1).toString().padStart(7) + '`'} Z:${'`' + botinfo.position.z.toFixed(1).toString().padStart(7) + '`'}`
                , inline: false
            },
            //{ name: '\u200B', value: '\u200B' },
            { name: ':arrow_forward:當前任務', value: crtTask },
            //{ name: '\u200b', value: '\u200b', inline: false }, // This creates an empty field to ensure the next row starts on a new line
            { name: `:pencil:任務列隊 ${'-'} / ${botinfo.tasks.length} PAGE ${'-'}`, value: taskQueue },
        )
        .setTimestamp()
        .setFooter({ text: 'TEXXXTTTT', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    return embed;
}
function discordWhiteListCheck(member) {
    //console.log(member)
    // Check if the member is in the whitelist members
    if (config.discord_setting.whitelist_members.includes(member.id)) {
        return true;
    }
    //console.log(mm)
    // Check if the member has a whitelist role
    if (member.roles.cache.some(role => config.discord_setting.whitelist_roles.includes(role.id))) {
        return true;
    }
    // Member is not in whitelist
    return false;
}
async function noPermission(interaction) {
    await interaction.reply({
        content: `You don't have permission to do this`,
        ephemeral: true
    })
}
async function notImplemented(interaction) {
    await interaction.reply({
        content: 'Not Implemented',
        ephemeral: true
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
    1900: 'RateLimiter disallowed request',
    1901: 'Failed to obtain profile data',
    1902: 'FetchError: read ECONNRESET',
    //  不可重啟類
    2001: 'config not found',
    2002: 'config err',
};
const botstatus = {
    //  通用區
    0: 'Closed',    //正常關閉
    1: 'free',
    2: 'in tasking',
    3: 'raid',
    1000: 'Closed(Profile Not Found)',
    1001: 'Closed(Type Not Found)',
    //  Raid 區
    2000: 'raid - closed', //unused
    2001: 'Restarting',
    2200: 'Running',
    //  General 區
    3000: 'general - closed',   //unused

    3001: 'Logging in',
    3002: 'Restarting',
    3200: 'Running',

    //    process.send({ type: 'setStatus', value: 1000 })
};