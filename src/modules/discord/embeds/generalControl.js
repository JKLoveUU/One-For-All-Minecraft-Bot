const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, EmbedBuilder,
} = require('discord.js');
const state = require('../state');
const { ICON_URL } = require('../constants');
const { fmtBytes } = require('../util/format');
const { fmtTaskDetail } = require('./taskDetail');
const { buildCustomId, NS } = require('../ids');

function generateGeneralBotControlMenu(botinfo) {
    const botName = botinfo.id;
    const embed = generateGeneralBotControlMenuEmbed(botinfo);
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.GBCM, 'time', botName))
            .setLabel('Current Time')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.GBCM, 'newest', botName))
            .setLabel('下移')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.GBCM, 'refresh', botName))
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.GBCM, 'close', botName))
            .setLabel('Close Panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId(NS.GBCM, 'select', botName))
            .setPlaceholder('Select an option')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
                { label: '基礎操作',     description: 'Open menu of Basic operations',   value: 'basic-ops', emoji: '🛠️' },
                { label: '地圖畫功能',   description: 'Open menu of mapart',              value: 'mapart',    emoji: '🗺️' },
                { label: '倉庫管理功能', description: 'Open menu of warehouse manager',   value: 'wms',       emoji: '🏬' },
                { label: 'Ping',         description: 'Show websocket ping',              value: 'ping',      emoji: '🔥' },
                { label: 'Current Time', description: 'Show Current Time',                value: 'time',      emoji: '🔥' },
                { label: 'New Button',   description: 'Create message with button',       value: 'button',    emoji: '🔥' },
                { label: 'Permissions',  description: 'not implement yet',                value: 'perms',     emoji: '🔥' },
            ])
    );
    return { content: `Control Panel for bot - ${botName}`, embeds: [embed], components: [row1, row2] };
}

function generateGeneralBotControlMenuEmbed(botinfo, page = 0, pageSize = 5) {
    const { botManager } = state;
    const crtTask = botinfo.runingTask ? `\`${botinfo.runingTask.displayName}\`` : '\`-\`';
    const queueTasks = botinfo.tasks;
    const totalPages = Math.max(1, Math.ceil(queueTasks.length / pageSize));
    const currentPage = Math.min(page, totalPages - 1);
    const pageTasks = queueTasks.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const taskQueue = pageTasks.map(t => `\`${t.displayName}\``).join('\n') || '\`-\`';

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

module.exports = { generateGeneralBotControlMenu, generateGeneralBotControlMenuEmbed };
