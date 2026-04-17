const { REST } = require('@discordjs/rest');
const { Client, Intents, MessageActionRow, MessageButton, MessageOptions, MessagePayload, MessageSelectMenu, MessageEmbed, Message } = require('discord.js');

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
const Status = require('./botstatus');
const path = require('path');
const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const config = require(`${baseDir}/config.toml`);
let botMenuId = undefined;
let botManager;
const { logger } = require("../logger");
function DiscordBotStart(botManagerIns) {
    botManager = botManagerIns;
    login();
    addDiscordBotEventHandler();
}

async function DiscordBotStop(waitingTime){
    await Promise.all([
        setBotMenuNotInService(),
        new Promise((resolve) => setTimeout(resolve, waitingTime)),
    ]);
    client.destroy()
}

function login(){
    try{
        client.login(config.discord_setting.token)
    }catch(err){
        logger(true, "ERROR", "DISCORD", `Discord Bot Login 失敗\n${err.message}`)
    }
}

function addDiscordBotEventHandler(){
    client.on('ready', async () => {
        logger(true, "INFO", "DISCORD", `Discord bot Logged in as ${client.user.tag}`);
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
                if (m.embeds && m.embeds.length > 0 && (Date.now() - m.createdTimestamp < 13 * 24 * 60 * 60 * 1000)) {
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
            .then(deletedMessages => logger(true, "INFO", "DISCORD", `Deleted ${deletedMessages.size} expired Menu`))
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
                console.log(oldmenu)
                let newbotMenuId = await channel.send(generateBotMenu());
                botMenuId = newbotMenuId.id
            }
        }, 30_000);
    });
    //botmenu handler 
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isCommand()) return
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
                    botManager.stop();
                    const waitingTime = 1000 + botManager.getBotNums() * 200;
                    await DiscordBotStop(waitingTime);
                    logger(true, "INFO", "CONSOLE", "Close finished");
                    process.exit(0);
                    break;
                default:
                    await notImplemented(interaction);
                    break;
            }
        } else if (interaction.isSelectMenu()) {
            const { customId, values } = interaction;
            if (customId === 'botmenu-select') {
                let targetBot = values[0].slice(15)
                console.log(targetBot)
                let targetBotIns = botManager.getBotByName(targetBot)
                if (targetBotIns === -1) {
                    console.log("err at open menu for bot", targetBot)
                    await interaction.reply({
                        content: `err at open menu for bot ${targetBot}`,
                        ephemeral: true
                    })
                    return
                }
                const GENERAL_RUNNING = [Status.RUNNING, Status.IDLE, Status.RUNNING_TASK,
                    Status.QUESTING, Status.QUEST_WAITING, Status.TASK_MAPART,
                    Status.TASK_BUILD, Status.TASK_CLEAR_AREA, Status.TASK_WAREHOUSE,
                    Status.TASK_VILLAGER, Status.TASK_FARM, Status.TASK_PAUSED]
                if (targetBotIns.status === Status.RAID_RUNNING) {
                    let botinfo = await botManager.getBotInfo(targetBot)
                    await interaction.reply(generateRaidBotControlMenu(botinfo))
                    return
                } else if (GENERAL_RUNNING.includes(targetBotIns.status)) {
                    let botinfo = await botManager.getBotInfo(targetBot)
                    await interaction.reply(generateGeneralBotControlMenu(botinfo))
                    return
                }
                await interaction.reply({
                    content: 'Bot is not running, try it later',
                    ephemeral: true
                })
    
            } else await notImplemented(interaction);
        } else {
            await notImplemented(interaction);
        }
    
    });
    //generalbotcontrolmenu handler
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isCommand()) return
        //  console.log(interaction)
        if (!interaction.customId) return   // 如果同bot 有其他bot的 tab補全會觸發這個
        if (!interaction.customId.startsWith('generalbotcontrolmenu')) {
            return
        }
        console.log(`[Discord] ${interaction.customId} - ${interaction.user.username}`)
        if (!discordWhiteListCheck(interaction.member)) {
            await noPermission(interaction);
            return
        }
        const botName = interaction.message.content.split(' - ')[1]
        if (interaction.isButton()) {
            switch (interaction.customId) {
                case 'generalbotcontrolmenu-close-btn':
                    await interaction.message.delete();
                    break;
                case 'generalbotcontrolmenu-refresh-btn': {
                    const freshInfo = await botManager.getBotInfo(botName)
                    if (freshInfo) {
                        await interaction.update(generateGeneralBotControlMenu(freshInfo))
                    } else {
                        await interaction.reply({ content: 'Bot data unavailable', ephemeral: true })
                    }
                    break;
                }
                case 'generalbotcontrolmenu-time-btn':
                    await interaction.reply({ content: `Current Time: ${new Date().toLocaleString()}`, ephemeral: true })
                    break;
                case 'generalbotcontrolmenu-newest-btn': {
                    const freshInfo = await botManager.getBotInfo(botName)
                    if (freshInfo) {
                        const newMsg = await interaction.channel.send(generateGeneralBotControlMenu(freshInfo))
                        await interaction.message.delete()
                    }
                    break;
                }
                default:
                    if (interaction.customId.startsWith('gbcm-')) {
                        await handleGbcmButton(interaction)
                    } else {
                        await notImplemented(interaction)
                    }
                    break;
            }
        } else if (interaction.isSelectMenu()) {
            const { customId, values } = interaction;
            if (customId === 'generalbotcontrolmenu-select') {
                const action = values[0]
                switch (action) {
                    case 'generalbotcontrolmenu-basic-operations-menu':
                        await interaction.reply({
                            content: `Basic operations for ${botName}`,
                            components: [new MessageActionRow().addComponents(
                                new MessageButton().setCustomId(`gbcm-reload-${botName}`).setLabel('Reload').setStyle('PRIMARY'),
                                new MessageButton().setCustomId(`gbcm-stoptask-${botName}`).setLabel('Stop Task').setStyle('DANGER'),
                            )],
                            ephemeral: true
                        })
                        break;
                    case 'generalbotcontrolmenu-ping': {
                        const info = await botManager.getBotInfo(botName)
                        await interaction.reply({ content: `Ping: ${info?.ping ?? 'N/A'}ms`, ephemeral: true })
                        break;
                    }
                    case 'generalbotcontrolmenu-time':
                        await interaction.reply({ content: `Current Time: ${new Date().toLocaleString()}`, ephemeral: true })
                        break;
                    case 'generalbotcontrolmenu-wms-menu':
                        await interaction.reply({ content: 'Warehouse menu - not available', ephemeral: true })
                        break;
                    default:
                        await notImplemented(interaction)
                }
            } else await notImplemented(interaction);
        } else {
            await notImplemented(interaction);
        }
    });
    //raidbotcontrolmenu handler
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isCommand()) return
        if (!interaction.customId) return
        if (!interaction.customId.startsWith('raidbotcontrolmenu')) return
        console.log(`[Discord] ${interaction.customId} - ${interaction.user.username}`)
        if (!discordWhiteListCheck(interaction.member)) {
            await noPermission(interaction);
            return
        }
        if (interaction.isButton()) {
            const botName = interaction.message.content.split(' - ')[1]
            switch (interaction.customId) {
                case 'raidbotcontrolmenu-close-btn':
                    await interaction.message.delete();
                    break;
                case 'raidbotcontrolmenu-refresh-btn': {
                    const freshInfo = await botManager.getBotInfo(botName)
                    if (freshInfo) {
                        await interaction.update(generateRaidBotControlMenu(freshInfo))
                    } else {
                        await interaction.reply({ content: 'Bot data unavailable', ephemeral: true })
                    }
                    break;
                }
                default:
                    await notImplemented(interaction);
                    break;
            }
        }
    });
}

async function getChannelMsgFetch(channel, id) {
    let oldmenu;
    try {
        oldmenu = await channel.messages.fetch(id, { force: true });
        return oldmenu;
    } catch (error) {
        logger(true, "ERROR", "DISCORD", `getChannelMsgFetch: ${error}`)
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
        url: 'https://github.com/JKLoveUU/Bot2',
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
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        opts.push({
            label: `${bot.name}`,
            // description: 'Open menu of Basic operations',
            value: `botmenu-select-${bot.name}`,            //need fix
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
        url: 'https://github.com/JKLoveUU/Bot2',
    };
    let botsfield = '';
    const longestBotLength =  botManager.bots.reduce((longest, a) => {
        return a.name.length > longest ? a.name.length : longest;
      }, 0);
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        botsfield += (`${i})`.padStart(parseInt(botManager.getBotNums() / 10) + 2))
        botsfield += (` ${bot.name}`.padEnd(longestBotLength + 1))
        botsfield += (` ${bot.status}\n`)
    }
    botsfield = botsfield ? (`Id`.padEnd(parseInt(botManager.getBotNums() / 10) + 2)) + '|' + (`Bot`.padEnd(longestBotLength)) + '|Status\n' + botsfield : botsfield;
    const embed = new MessageEmbed()
        //.setDescription('Choose one of the following options:')
        .setAuthor(author)
        .setColor('GREEN')
        .setThumbnail("https://i.imgur.com/AfFp7pu.png")
        .addFields(
            { name: `目前共 \`${botManager.getBotNums()}\` 隻 bot`, value: '\`\`\`' + (botsfield ? botsfield : '無') + '\`\`\`' },
        )
        .setTimestamp()
        .setFooter({ text: '更新於', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    return embed;
}
//General Bot Control Menu
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
function generateGeneralBotControlMenuEmbed(botinfo, page = 0, pageSize = 5) {
    const author = {
        name: botinfo.name,
        iconURL: botinfo.avatar,
        url: 'https://discord.js.org',
    };
    let crtTask = botinfo.runingTask ? `\`${botinfo.tasks[0].displayName}\`` : '\`-\`';
    const startIdx = botinfo.runingTask ? 1 : 0;
    const queueTasks = botinfo.tasks.slice(startIdx);
    const totalPages = Math.max(1, Math.ceil(queueTasks.length / pageSize));
    const currentPage = Math.min(page, totalPages - 1);
    const pageTasks = queueTasks.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    let taskQueue = pageTasks.map(t => `\`${t.displayName}\``).join('\n') || '\`-\`';

    const botIns = botManager.getBotByName(botinfo.id);
    const statusText = botIns ? botIns.status : 'Unknown';

    const embed = new MessageEmbed()
        .setAuthor(author)
        .setColor('#7CFC00')
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `\`${(botinfo.server).toString().padEnd(3)}\``, inline: true },
            { name: ':signal_strength:Ping', value: `\`${botinfo.ping ?? 'N/A'}ms\``, inline: true },
            { name: ':satellite:Status', value: `\`${statusText}\``, inline: true },
            { name: ':coin:Coin', value: '`' + botinfo.coin.toString().padEnd(7) + '`', inline: true },
            { name: ':moneybag:Balance', value: '`' + botinfo.balance.toString().padEnd(14) + '`', inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            {
                name: ':triangular_flag_on_post:座標',
                value: `X:\`${botinfo.position.x.toFixed(1).padStart(7)}\` Y:\`${botinfo.position.y.toFixed(1).padStart(7)}\` Z:\`${botinfo.position.z.toFixed(1).padStart(7)}\``
                , inline: false
            },
            { name: ':arrow_forward:當前任務', value: crtTask },
            { name: `:pencil:任務列隊 ${currentPage + 1} / ${totalPages} PAGE`, value: taskQueue },
        )
        .setTimestamp()
        .setFooter({ text: 'One For All', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
    return embed;
}
async function handleGbcmButton(interaction) {
    const parts = interaction.customId.split('-')
    const action = parts[1]
    const botName = parts.slice(2).join('-')
    const bot = botManager.getBotByName(botName)
    if (!bot || !bot.childProcess) {
        await interaction.reply({ content: `Bot ${botName} not available`, ephemeral: true })
        return
    }
    switch (action) {
        case 'reload':
            bot.childProcess.send({ type: 'reload' })
            await interaction.reply({ content: `Reload sent to ${botName}`, ephemeral: true })
            break;
        case 'stoptask':
            bot.childProcess.send({ type: 'cmd', text: '.stop' })
            await interaction.reply({ content: `Stop task sent to ${botName}`, ephemeral: true })
            break;
        default:
            await notImplemented(interaction)
    }
}
//Raid Bot Control Menu
function generateRaidBotControlMenu(botinfo) {
    const embed = generateRaidBotControlMenuEmbed(botinfo);
    const row1 = new MessageActionRow().addComponents(
        new MessageButton()
            .setCustomId('raidbotcontrolmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle('SUCCESS')
            .setEmoji('♻️'),
        new MessageButton()
            .setCustomId('raidbotcontrolmenu-close-btn')
            .setLabel('Close Panel')
            .setStyle('DANGER')
            .setEmoji('⚪')
    );
    return { content: `Raid Bot - ${botinfo.id}`, embeds: [embed], components: [row1], ephemeral: true }
}
function generateRaidBotControlMenuEmbed(botinfo) {
    const embed = new MessageEmbed()
        .setAuthor({ name: botinfo.name, iconURL: botinfo.avatar })
        .setColor('#FF4500')
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `\`${botinfo.server}\``, inline: true },
            { name: ':signal_strength:Ping', value: `\`${botinfo.ping ?? 'N/A'}ms\``, inline: true },
            { name: ':moneybag:Balance', value: `\`${botinfo.balance}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'One For All', iconURL: 'https://i.imgur.com/AfFp7pu.png' });
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

module.exports = { DiscordBotStart, setBotMenuNotInService, DiscordBotStop}