const path = require('path');
const readline = require('readline');
const { fork } = require('child_process');
const mineflayer = require("mineflayer");
const fs = require('fs');
// const { testf } = require('./lib/test.js');
const toml = require('toml-require').install({ toml: require('toml') });
const config = require(`${process.cwd()}/config.toml`);
const { Vec3 } = require('vec3')

const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Client, Intents, MessageActionRow, MessageButton, MessageOptions, MessagePayload, MessageSelectMenu, MessageEmbed, Message } = require('discord.js');
const rest = new REST({ version: '9' }).setToken(config.discord_setting.token);
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
let botMenuId = undefined;
let botMenuLastUpdate = new Date();
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

//const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}
//const logFilePath = path.join(logsDir, "lastest" + ".log");
const logFile = fs.createWriteStream('logs/lastest.log', { flags: 'a' });
function myLog(...args) {
    const prefix = '[LOG]';
    const message = `[${new Date()}] ${prefix} ${args.join(' ')}\n`;
    logFile.write(message);
}
myLog(`Bot Start at ${new Date().toString()}`);
const dataManager = {

}
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
                    name: name,
                    c: child,
                    logTime: new Date(),
                    status: 0,
                }
            )
        } else {
            this.bots[this.name.indexOf(name)] = {
                name: name,
                c: child,
                logTime: new Date(),
                status: 0,
            }
        }
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
            let botinfo = {
                name: crt.name,
                avatar: `https://mc-heads.net/avatar/${targetBot}/64`,
                server: -1,
                coin: -1,
                balance: -1,
                position: new Vec3(0, 0, 0),
                currentTask: [],
                tasks: [],
            };
            return botinfo
        }
    },
};
//const dc = require("./lib/discordManager")(config,dataManager,bots);
let currentSelect = -1;
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
        const completions = ['.switch', '.exit', '.close', '.test', '.reload', '.ff'];
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
                process.exit()
                break;
            case 'eval':    //debug
                eval(input.substring(6))
                break;
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
                // const channel2 = await client.channels.cache.get(config.discord_setting.channelId);
                // if (channel2) {
                //     const message = await channel2.messages.fetch(rlargs[0], { force: true }).catch(console.error);
                //     if (message) {
                //         console.log('Message still exists!');
                //     } else {
                //         console.log('Message does not exist!');
                //     }
                // }
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
rl.on('close', async () => {
    //console.log('退出readLine');
    await handleClose()
});
client.on('ready', async () => {
    console.log(`Discord bot Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{
            name: '123',
            type: 3,
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
        .then(deletedMessages => console.log(`Deleted ${deletedMessages.size} expired Menu`))
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
    console.log(interaction.customId)
    if (!interaction.customId.startsWith('botmenu')) {
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
                    content: 'bot close',
                    ephemeral: true
                })
                await handleClose()
                break;
            default:
                await notImplementYet(interaction);
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
            interaction.reply(generateBotControlMenu(botinfo))
        } else await notImplementYet(interaction);
    } else {
        await notImplementYet(interaction);
    }

})
process.on('uncaughtException', err => {
    console.log('Uncaught:\n', err)
    console.log('PID:', process.pid)
})

process.on('SIGINT', handleClose);
process.on('SIGTERM', handleClose);
console.log(`Press Ctrl+C to exit   PID: ${process.pid}`);

client.login(config.discord_setting.token)
main()
function main() {
    console.log(config.account.id)
    currentSelect = 0;
    process.title = 'Test-bot 0 - are in service';
    let tmp = 5;
    //get type  and set of all bot
    // type: auto raid general
    for (i in config.account) {
        //console.log(config.account[i])
    }
    for (let i = 0; i < config.account.id.length; i++) {
        setTimeout(() => {
            //console.log(i)
            //console.log(config.account.id[i])
            createGeneralBot(config.account.id[i]);
            tmp += 200;
        }, tmp);

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
function createGeneralBot(name) {
    const child = fork(path.join(__dirname, 'generalbot.js'), [name]);
    bots.setBot(name, child);
    child.on('error', e => {
        console.log(`Error from ${name}:\n${e}`)
    })
    child.on('close', c => {
        child.removeAllListeners()
        bots.setBot(name, undefined)
        if (c == 0) console.log(`${name}: stopped success`)
        else if (c >= 2000) {
            console.log(`bot  ${name} err code = ${c}`)
        } else {
            console.log("bot will restart at 10 second")
            // bots.setBot(name, setTimeout(() => { createGeneralBot(name) }, 10_000))
            setTimeout(() => { createGeneralBot(name) }, 10_000)
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
            { name: `目前共 \`${0}\` 隻 bot`, value: '\`Not In Service\`' },
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
    let b_components = !opts.length ? [row1]:[row1, row2];
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
        botsfield += (`${i})`.padEnd(parseInt(bots.bots.length / 10) + 2))
        botsfield += (` ${bots.name[i]}`.padEnd(longestLength + 1))
        botsfield += (` ${botstatus[bots.bots[i].status]}\n`)
    }
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


function generateBotControlMenu(botinfo) {
    const embed = generateBotControlMenuEmbed(botinfo);
    const row1 = new MessageActionRow().addComponents(
        // new MessageButton()
        //   .setCustomId('ping-btn')
        //   .setLabel('Ping')
        //   .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('time-btn')
            .setLabel('Current Time')
            .setStyle('PRIMARY'),
        // new MessageButton()
        //   .setCustomId('new-btn')
        //   .setLabel('New Button')
        //   .setStyle('PRIMARY'),
        new MessageButton()
            .setCustomId('newest-btn')
            .setLabel('下移')
            .setStyle('SECONDARY'),
        new MessageButton()
            .setCustomId('refresh-btn')
            .setLabel('Refresh')
            .setStyle('SUCCESS')
            .setEmoji('♻️'),
        new MessageButton()
            .setCustomId('close-btn')
            .setLabel('Close')
            .setStyle('DANGER')
            .setEmoji('⚪')

    );
    const row2 = new MessageActionRow().addComponents(
        new MessageSelectMenu()
            .setCustomId('menu-select')
            .setPlaceholder('Select an option')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
                {
                    label: '基礎操作',
                    description: 'Open menu of Basic operations',
                    value: 'basic-operations-menu',
                    emoji: '🛠️',
                },
                {
                    label: '地圖畫功能',
                    description: 'Open menu of mapart',
                    value: 'mapart-menu',
                    emoji: '🗺️',
                },
                {
                    label: '倉庫管理功能',
                    description: 'Open menu of warehouse manager system',
                    value: 'wms-menu',
                    emoji: '🏬',
                },
                {
                    label: 'Ping',
                    description: 'This is option 1',
                    value: 'ping',
                    emoji: '🔥',
                },
                {
                    label: 'Current Time',
                    description: 'Show Current Time',
                    value: 'time',
                    emoji: '🔥',
                },
                {
                    label: 'New Button',
                    description: 'Create message with button',
                    value: 'button',
                    emoji: '🔥',
                },
                {
                    label: 'Permissions',
                    description: 'not implement yet',
                    value: 'permission-menu',
                    emoji: '🔥',
                },
            ])
    );
    return { content: `Control Panel for bot - ${botinfo.name}`, embeds: [embed], components: [row1, row2] };
}
function generateBotControlMenuEmbed(botinfo) {
    const author = {
        name: botinfo.name,
        iconURL: botinfo.avatar,
        url: 'https://discord.js.org',
    };

    const embed = new MessageEmbed()
        //.setDescription('Choose one of the following options:')
        .setAuthor(author)
        .setColor('#7CFC00')
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `${'`' + (botinfo.server).toString().padEnd(3) + '`'}`, inline: true },
            { name: ':coin:Coin', value: '`' + botinfo.coin.toString().padEnd(7) + '`', inline: true },
            { name: ':moneybag:Balance', value: '`' + botinfo.balance.toString().padEnd(14) + '`', inline: true },
            { name: ':triangular_flag_on_post:座標', value: `X:${'`' + botinfo.position.x.toString().padStart(7) + '`'} Y:${'`' + botinfo.position.y.toString().padStart(7) + '`'} Z:${'`' + botinfo.position.z.toString().padStart(7) + '`'}`, inline: false },
            //{ name: '\u200B', value: '\u200B' },
            { name: ':arrow_forward:當前任務', value: "task 0\n" },
            //{ name: '\u200b', value: '\u200b', inline: false }, // This creates an empty field to ensure the next row starts on a new line
            { name: `:pencil:任務列隊 ${3} PAGE ${1}`, value: "task 1\ntask 2\ntask 3" },
        )
        .setTimestamp()
        .setFooter({ text: 'TEXXXTTTT', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    return embed;
}

async function notImplementYet(interaction) {
    await interaction.reply({
        content: 'Not Implement yet',
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
    2001: 'config not found',   //不可重啟類
    2002: 'config err',
};
const botstatus = {
    0: 'closed',
    1: 'free',
    2: 'in tasking',
    3: 'raid',
    1000: 'Profile Not Found',
    2000: 'raid - closed',
    2001: 'raid - restart',
    3000: 'general - closed',
};