const { REST } = require('@discordjs/rest');
const {
    Client, GatewayIntentBits,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, EmbedBuilder,
    ComponentType, ActivityType, Colors,
    Message,
} = require('discord.js');

// ── 替換成 GitHub raw URL 後即可生效 ──────────────────────────────────────
const ICON_URL = 'https://media.discordapp.net/attachments/1433809437654515793/1505841810990305371/oneforall_discord_icon_v1.png?ex=6a0c17f8&is=6a0ac678&hm=cce06efef2a0b444d3881aa9b5c1a09389c0fca1777fe65c2f912602fd4b9bb5&=&format=webp&quality=lossless';  // TODO: https://raw.githubusercontent.com/...
// ─────────────────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const Status = require('./botstatus');
const path = require('path');
const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const config = require(`${baseDir}/config.toml`);
let botMenuId = undefined;
let botManager;
let _startedAt = Date.now();
const _botDataCache = {};
const _panelTimers  = new Map(); // msgId -> { interval, timeout }
const { logger } = require("../logger");

// ── Control panel auto-update helpers ────────────────────────────────────
function stopPanelAutoUpdate(msgId) {
    const t = _panelTimers.get(msgId);
    if (!t) return;
    clearInterval(t.interval);
    clearTimeout(t.timeout);
    _panelTimers.delete(msgId);
}
function startPanelAutoUpdateForMessage(msg, botName) {
    const msgId = msg.id;
    stopPanelAutoUpdate(msgId);
    const interval = setInterval(async () => {
        try {
            const data = _botDataCache[botName];
            const bot  = botManager.getBotByName(botName);
            if (!bot || !bot.childProcess) { stopPanelAutoUpdate(msgId); return; }
            if (!data) return;
            const botinfo = {
                id: botName, name: data.name || botName,
                avatar: `https://mc-heads.net/avatar/${data.name || botName}/64`,
                server: data.server, coin: data.coin, balance: data.balance,
                position: data.position,
                tasks: Array.isArray(data.tasks) ? data.tasks : [],
                runingTask: data.runingTask, ping: data.ping, memory: data.memory,
            };
            await msg.edit(generateGeneralBotControlMenu(botinfo));
        } catch (err) {
            stopPanelAutoUpdate(msgId);
            logger(true, 'DEBUG', 'DISCORD', `panel auto-update stopped: ${err.message}`);
        }
    }, 3000);
    const timeout = setTimeout(() => stopPanelAutoUpdate(msgId), 3 * 60 * 1000);
    _panelTimers.set(msgId, { interval, timeout });
}
async function startPanelAutoUpdate(interaction, botName) {
    try {
        const msg = await interaction.fetchReply();
        startPanelAutoUpdateForMessage(msg, botName);
    } catch (_) {}
}
// ─────────────────────────────────────────────────────────────────────────

// ── Task detail renderer (for Discord embed) ──────────────────────────────
function fmtTaskDetail(runingTask) {
    if (!runingTask || typeof runingTask !== 'object') return null;
    const detail = runingTask.detail;
    if (!detail || !detail.type) return null;
    const p   = detail.payload || {};
    const v   = (x) => (x == null || x === '-' || x === '') ? '-' : x;
    const pct = (x) => x != null ? `${x}%` : '-';
    switch (detail.type) {
        case 'autoquest': {
            const prog = (p.progress && p.progress.total)
                ? `${p.progress.done}/${p.progress.total}` : '-';
            return `\`${detail.state || '-'}\` ${v(p.questName)}\n進度 \`${prog}\`  獎勵 \`${v(p.reward)}\`  期限 ${v(p.remain)}`;
        }
        case 'cleararea': {
            const overall = p.overall || {};
            const yRange = (p.layerYTop != null && p.layerYBottom != null)
                ? `${p.layerYTop}~${p.layerYBottom}` : '-';
            return `\`${detail.status || '-'}\`  Y \`${yRange}\`  整體 \`${pct(overall.percent)}\`  ~\`${v(overall.etaMs ? fmtUptime(overall.etaMs) : null)}\``;
        }
        case 'villager': {
            const JOB = { iron:'鐵村民', melonpumpkin:'雙瓜', train:'訓練', cure:'治療', put:'放置' };
            const ST  = { trading:'交易中', restocking:'補貨', navigate:'導航', no_iron:'鐵不足', placing:'放置中' };
            return `\`${JOB[detail.job] || detail.job || '-'}\`  \`${ST[detail.status] || detail.status || '-'}\`  s${v(p.server)} ${v(p.warp)}`;
        }
        case 'warehouse': {
            const ST = { standby:'待機', idle:'空閒', fetching:'查詢', executing:'執行',
                         depositing:'入庫', depositing_picking:'入庫(揀)', withdrawing:'出貨',
                         updating_barrels:'更新桶', stopped:'已停止' };
            const st = ST[detail.status] || detail.status || '-';
            const order = p.currentOrder;
            if (!order) return `\`${st}\``;
            if (order.optype === 'transfer') {
                const live = p.transferLive || {};
                const rem  = live.count === -1 ? '∞' : v(live.remaining);
                const side = live.side === 'buy' ? '購買中' : live.side === 'sell' ? '出售中' : '-';
                return `\`${st}\`  搬運 \`${side}\`  剩餘 \`${rem}\`\n買 \`${live.buyTrips ?? 0}趟/${live.buyQty ?? 0}個\`  賣 \`${live.sellTrips ?? 0}趟/${live.sellQty ?? 0}個\``;
            }
            const OP = { deposit:'入庫', withdraw:'出貨', fix:'修復', buy_at_shop:'購買', unpacking:'拆箱', packing:'裝箱' };
            const item = order.firstItem ? `${order.firstItem.item}×${order.firstItem.quantity}` : '-';
            return `\`${st}\`  ${OP[order.optype] || order.optype}  ${item}`;
        }
        case 'mapart':
        case 'litematic': {
            const blocks = p.blocks || {};
            return `\`${detail.status || '-'}\`  \`${v(blocks.placed)}/${v(blocks.total)}\` (${pct(blocks.percent)})  ETA \`${v(p.etaMs ? fmtUptime(p.etaMs) : null)}\``;
        }
        default:
            return `\`${detail.type}\``;
    }
}
// ─────────────────────────────────────────────────────────────────────────

function fmtBytes(n) {
    if (!Number.isFinite(n)) return '-'
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + 'GB'
    if (n >= 1048576)    return (n / 1048576).toFixed(1) + 'MB'
    if (n >= 1024)       return (n / 1024).toFixed(0) + 'KB'
    return n + 'B'
}
function fmtUptime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-'
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}d${h}h${m}m`
    if (h > 0) return `${h}h${m}m`
    return `${m}m${s % 60}s`
}

function DiscordBotStart(botManagerIns, startedAt) {
    botManager = botManagerIns;
    if (startedAt) _startedAt = startedAt;
    try {
        botManager.handle.on('data', (data, name) => {
            if (name) _botDataCache[name] = data;
        });
    } catch (_) {}
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
            .catch(err => logger(true, "ERROR", "DISCORD", `Discord Bot Login 失敗\n${err.message}`))
    }catch(err){
        logger(true, "ERROR", "DISCORD", `Discord Bot Login 失敗\n${err.message}`)
    }
}

function addDiscordBotEventHandler(){
    client.on('clientReady', async () => {
        try {
        logger(true, "INFO", "DISCORD", `Discord bot Logged in as ${client.user.tag}`);
        client.user.setPresence({
            activities: [{
                name: 'Minecraft',
                type: ActivityType.Streaming,
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
            if (matchingMessages) {
                matchingMessages.forEach(msg => {
                    botMenuIds.push(msg.id);
                });
            }
        });
        channel.bulkDelete(botMenuIds)
            .then(deletedMessages => logger(true, "INFO", "DISCORD", `Deleted ${deletedMessages.size} expired Menu`))
            .catch(console.error);
        let newbotMenuId = await channel.send(generateBotMenu());
        botMenuId = newbotMenuId.id
        setInterval(async () => {
            try {
                let channel = client.channels.cache.get(config.discord_setting.channelId);
                let oldmenu = await getChannelMsgFetch(channel, botMenuId)
                if (oldmenu) {
                    await oldmenu.edit(generateBotMenu());
                } else {
                    console.log(oldmenu)
                    let newbotMenuId = await channel.send(generateBotMenu());
                    botMenuId = newbotMenuId.id
                }
            } catch (err) {
                logger(true, 'ERROR', 'DISCORD', `botMenu refresh error: ${err.message}`)
            }
        }, 30_000);
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `clientReady error: ${err.message}`)
        }
    });
    //botmenu handler
    client.on('interactionCreate', async (interaction) => {
        try {
        if (interaction.isAutocomplete()) { await interaction.respond([]).catch(() => {}); return }
        if (interaction.isChatInputCommand()) return
        if (!interaction.customId) return
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
                case 'botmenu-close-btn': {
                    const [row1] = interaction.message.components;
                    const updatedButtons = row1.components.map(c => {
                        const b = ButtonBuilder.from(c);
                        if (c.customId === 'botmenu-close-btn') {
                            b.setCustomId('botmenu-close-confirm-btn')
                                .setLabel('Click Again To close')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('⚪');
                        }
                        return b;
                    });
                    const updatedRows = interaction.message.components.map((row, i) => {
                        if (i === 0) {
                            return new ActionRowBuilder().addComponents(updatedButtons);
                        }
                        return new ActionRowBuilder().addComponents(
                            row.components.map(c =>
                                c.type === ComponentType.Button
                                    ? ButtonBuilder.from(c)
                                    : StringSelectMenuBuilder.from(c)
                            )
                        );
                    });
                    await interaction.update({ components: updatedRows });
                    break;
                }
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
        } else if (interaction.isStringSelectMenu()) {
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
                    startPanelAutoUpdate(interaction, targetBot)
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
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `botmenu interactionCreate error: ${err.message}`)
        }
    });
    //generalbotcontrolmenu handler
    client.on('interactionCreate', async (interaction) => {
        try {
        if (interaction.isAutocomplete()) { await interaction.respond([]).catch(() => {}); return }
        if (interaction.isChatInputCommand()) return
        if (!interaction.customId) return
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
                    stopPanelAutoUpdate(interaction.message.id);
                    await interaction.message.delete();
                    break;
                case 'generalbotcontrolmenu-refresh-btn': {
                    const freshInfo = await botManager.getBotInfo(botName)
                    if (freshInfo) {
                        await interaction.update(generateGeneralBotControlMenu(freshInfo))
                        startPanelAutoUpdateForMessage(interaction.message, botName)
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
                        stopPanelAutoUpdate(interaction.message.id);
                        const newMsg = await interaction.channel.send(generateGeneralBotControlMenu(freshInfo))
                        await interaction.message.delete()
                        startPanelAutoUpdateForMessage(newMsg, botName)
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
        } else if (interaction.isStringSelectMenu()) {
            const { customId, values } = interaction;
            if (customId === 'generalbotcontrolmenu-select') {
                const action = values[0]
                switch (action) {
                    case 'generalbotcontrolmenu-basic-operations-menu':
                        await interaction.reply({
                            content: `Basic operations for ${botName}`,
                            components: [new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`gbcm-reload-${botName}`).setLabel('Reload').setStyle(ButtonStyle.Primary),
                                new ButtonBuilder().setCustomId(`gbcm-stoptask-${botName}`).setLabel('Stop Task').setStyle(ButtonStyle.Danger),
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
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `generalbotcontrolmenu interactionCreate error: ${err.message}`)
        }
    });
    //raidbotcontrolmenu handler
    client.on('interactionCreate', async (interaction) => {
        try {
        if (interaction.isAutocomplete()) { await interaction.respond([]).catch(() => {}); return }
        if (interaction.isChatInputCommand()) return
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
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `raidbotcontrolmenu interactionCreate error: ${err.message}`)
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
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    let oldmenu = await getChannelMsgFetch(channel, botMenuId)
    if (!oldmenu) return
    const closeComponents = oldmenu.components.map(row => {
        const newComponents = row.components.map(component => {
            if (component.type === ComponentType.Button) {
                return ButtonBuilder.from(component).setDisabled(true);
            } else if (component.type === ComponentType.StringSelect) {
                return StringSelectMenuBuilder.from(component).setDisabled(true).setPlaceholder('❌ | Not In Service');
            } else {
                return component;
            }
        });
        return new ActionRowBuilder().addComponents(newComponents);
    });
    const niAuthor = ICON_URL ? { name: '當前Bots', iconURL: ICON_URL, url: 'https://github.com/JKLoveUU/Bot2' } : { name: '當前Bots', url: 'https://github.com/JKLoveUU/Bot2' };
    const niFooter = ICON_URL ? { text: '關閉於', iconURL: ICON_URL } : { text: '關閉於' };
    const embed = new EmbedBuilder()
        .setAuthor(niAuthor)
        .setColor(Colors.Red)
        .addFields(
            { name: `目前共 \`${'-'}\` 隻 bot`, value: '\`Not In Service\`' },
        )
        .setTimestamp()
        .setFooter(niFooter);
    if (ICON_URL) embed.setThumbnail(ICON_URL);
    await oldmenu.edit({ embeds: [embed], components: closeComponents });
}
function generateBotMenu() {
    const embed = generateBotMenuEmbed();
    let opts = []
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        opts.push({
            label: `${bot.name}`,
            value: `botmenu-select-${bot.name}`,
        })
    }
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('botmenu-shift-btn')
            .setLabel('下移')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('botmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId('botmenu-close-btn')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
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
    let botsfield = '';
    const idW = parseInt(botManager.getBotNums() / 10) + 2;
    const longestBotLength = botManager.bots.reduce((longest, a) => {
        return a.name.length > longest ? a.name.length : longest;
    }, 0);
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        botsfield += `${i}`.padStart(idW)
        botsfield += ` ${bot.name}`.padEnd(longestBotLength + 1)
        botsfield += ` ${bot.status}\n`
    }
    botsfield = botsfield
        ? `Id`.padEnd(idW) + '|' + `Bot`.padEnd(longestBotLength) + '|Status\n' + botsfield
        : botsfield;

    const parentMem = process.memoryUsage();
    const sysInfo = `Up \`${fmtUptime(Date.now() - _startedAt)}\`  RSS \`${fmtBytes(parentMem.rss)}\`  Heap \`${fmtBytes(parentMem.heapUsed)}/${fmtBytes(parentMem.heapTotal)}\``;

    const authorOpts = ICON_URL
        ? { name: '當前Bots', iconURL: ICON_URL, url: 'https://github.com/JKLoveUU/Bot2' }
        : { name: '當前Bots', url: 'https://github.com/JKLoveUU/Bot2' };
    const footerOpts = ICON_URL
        ? { text: '更新於', iconURL: ICON_URL }
        : { text: '更新於' };

    const embed = new EmbedBuilder()
        .setAuthor(authorOpts)
        .setColor(Colors.Green)
        .addFields(
            { name: `目前共 \`${botManager.getBotNums()}\` 隻 bot`, value: '\`\`\`' + (botsfield ? botsfield : '無') + '\`\`\`' },
            { name: ':desktop:系統', value: sysInfo },
        )
        .setTimestamp()
        .setFooter(footerOpts);
    if (ICON_URL) embed.setThumbnail(ICON_URL);
    return embed;
}
//General Bot Control Menu
function generateGeneralBotControlMenu(botinfo) {
    const embed = generateGeneralBotControlMenuEmbed(botinfo);
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('generalbotcontrolmenu-time-btn')
            .setLabel('Current Time')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('generalbotcontrolmenu-newest-btn')
            .setLabel('下移')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('generalbotcontrolmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId('generalbotcontrolmenu-close-btn')
            .setLabel('Close Panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
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
    let crtTask = botinfo.runingTask ? `\`${botinfo.runingTask.displayName}\`` : '\`-\`';
    const queueTasks = botinfo.tasks;
    const totalPages = Math.max(1, Math.ceil(queueTasks.length / pageSize));
    const currentPage = Math.min(page, totalPages - 1);
    const pageTasks = queueTasks.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    let taskQueue = pageTasks.map(t => `\`${t.displayName}\``).join('\n') || '\`-\`';

    const botIns = botManager.getBotByName(botinfo.id);
    const statusText = botIns ? botIns.status : 'Unknown';
    const pid = (botIns && botIns.childProcess && botIns.childProcess.pid) ? botIns.childProcess.pid : '-';

    const mem = botinfo.memory;
    const memTxt = (mem && typeof mem === 'object')
        ? `RSS \`${fmtBytes(mem.rss)}\`  Heap \`${fmtBytes(mem.heapUsed)}/${fmtBytes(mem.heapTotal)}\`  PID \`${pid}\``
        : `\`-\``;

    const pos = botinfo.position;
    const posTxt = (pos && typeof pos === 'object' && pos.x != null)
        ? `X:\`${Number(pos.x).toFixed(1).padStart(7)}\` Y:\`${Number(pos.y).toFixed(1).padStart(7)}\` Z:\`${Number(pos.z).toFixed(1).padStart(7)}\``
        : `\`-\``;

    const embed = new EmbedBuilder()
        .setAuthor({ name: botinfo.name, iconURL: botinfo.avatar, url: 'https://discord.js.org' })
        .setColor(0x7CFC00)
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `\`${(botinfo.server).toString().padEnd(3)}\``, inline: true },
            { name: ':signal_strength:Ping', value: `\`${botinfo.ping ?? 'N/A'}ms\``, inline: true },
            { name: ':satellite:Status', value: `\`${statusText}\``, inline: true },
            { name: ':coin:Coin', value: '`' + botinfo.coin.toString().padEnd(7) + '`', inline: true },
            { name: ':moneybag:Balance', value: '`' + botinfo.balance.toString().padEnd(14) + '`', inline: true },
            { name: '​', value: '​', inline: true },
            { name: ':triangular_flag_on_post:座標', value: posTxt, inline: false },
            { name: ':bar_chart:記憶體', value: memTxt, inline: false },
            { name: ':arrow_forward:當前任務', value: crtTask },
            { name: `:pencil:任務列隊 ${currentPage + 1} / ${totalPages} PAGE`, value: taskQueue },
        )
        .setTimestamp()
        .setFooter(ICON_URL ? { text: 'One For All', iconURL: ICON_URL } : { text: 'One For All' });
    const detailTxt = fmtTaskDetail(botinfo.runingTask);
    if (detailTxt) embed.addFields({ name: ':mag:任務細節', value: detailTxt, inline: false });
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
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('raidbotcontrolmenu-refresh-btn')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId('raidbotcontrolmenu-close-btn')
            .setLabel('Close Panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    return { content: `Raid Bot - ${botinfo.id}`, embeds: [embed], components: [row1], ephemeral: true }
}
function generateRaidBotControlMenuEmbed(botinfo) {
    const embed = new EmbedBuilder()
        .setAuthor({ name: botinfo.name, iconURL: botinfo.avatar })
        .setColor(0xFF4500)
        .setThumbnail(botinfo.avatar)
        .addFields(
            { name: ':globe_with_meridians:分流', value: `\`${botinfo.server}\``, inline: true },
            { name: ':signal_strength:Ping', value: `\`${botinfo.ping ?? 'N/A'}ms\``, inline: true },
            { name: ':moneybag:Balance', value: `\`${botinfo.balance}\``, inline: true },
        )
        .setTimestamp()
        .setFooter(ICON_URL ? { text: 'One For All', iconURL: ICON_URL } : { text: 'One For All' });
    return embed;
}
function discordWhiteListCheck(member) {
    if (config.discord_setting.whitelist_members.includes(member.id)) {
        return true;
    }
    if (member.roles.cache.some(role => config.discord_setting.whitelist_roles.includes(role.id))) {
        return true;
    }
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

function getStatus() {
    let ping = null
    try { if (client.ws && client.ws.ping >= 0) ping = client.ws.ping } catch (_) {}
    let channelOk = false
    try {
        if (client.readyAt && config.discord_setting.channelId) {
            channelOk = !!client.channels.cache.get(config.discord_setting.channelId)
        }
    } catch (_) {}
    return {
        activated:  !!config.discord_setting.activate,
        ready:      !!client.readyAt,
        tag:        client.user ? client.user.tag : null,
        ping:       ping,
        readyAt:    client.readyAt ? client.readyAt.getTime() : null,
        channelId:  config.discord_setting.channelId || null,
        channelOk:  channelOk,
    }
}

async function sendTestMessage(text) {
    if (!client.readyAt) throw new Error('Discord client 尚未連線')
    if (!config.discord_setting.channelId) throw new Error('未設定 channelId')
    const channel = client.channels.cache.get(config.discord_setting.channelId)
    if (!channel) throw new Error('Channel 不在 cache (id 錯誤或無存取權)')
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('發送逾時 (8s)')), 8000))
    return Promise.race([
        channel.send(text || `[OFA TUI] Test message at ${new Date().toLocaleString()}`),
        timeout,
    ])
}

// Spawn a throw-away client to verify the supplied token can log in.
async function testToken(token) {
    if (!token) return { ok: false, error: 'token is empty' }
    const testClient = new Client({ intents: [GatewayIntentBits.Guilds] })
    return new Promise((resolve) => {
        const cleanup = () => { try { testClient.destroy() } catch (_) {} }
        const timeout = setTimeout(() => { cleanup(); resolve({ ok: false, error: 'login timeout (10s)' }) }, 10000)
        testClient.once('clientReady', () => {
            clearTimeout(timeout)
            const tag = testClient.user.tag
            cleanup()
            resolve({ ok: true, tag })
        })
        testClient.login(token).catch((err) => {
            clearTimeout(timeout)
            cleanup()
            resolve({ ok: false, error: err.message })
        })
    })
}

function getAppIdFromToken(token) {
    try { return Buffer.from(token.split('.')[0], 'base64').toString() } catch (_) { return null }
}

async function sendAuthNotify(botName, userCode, verificationUri) {
    if (!client.readyAt) return
    if (!config.discord_setting?.channelId) return
    const channel = client.channels.cache.get(config.discord_setting.channelId)
    if (!channel) return
    try {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('🔐 需要 Microsoft 授權')
                .setDescription(`Bot **${botName}** 首次登入，請在瀏覽器完成驗證`)
                .addFields(
                    { name: '授權網址', value: verificationUri },
                    { name: '代碼', value: `\`\`\`${userCode}\`\`\``, inline: true },
                    { name: '一鍵連結', value: `http://microsoft.com/link?otc=${userCode}` },
                )
            ]
        })
    } catch (_) {}
}

module.exports = { DiscordBotStart, setBotMenuNotInService, DiscordBotStop, getStatus, sendTestMessage, testToken, sendAuthNotify, getAppIdFromToken }
