const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, EmbedBuilder, Colors, ComponentType,
} = require('discord.js');
const state = require('../state');
const { ICON_URL } = require('../constants');
const { fmtBytes, fmtUptime } = require('../util/format');
const { buildCustomId, NS } = require('../ids');

function generateBotMenu() {
    const { botManager } = state;
    const embed = generateBotMenuEmbed();
    const opts = [];
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        opts.push({
            label: `${bot.name}`,
            value: bot.name,
        });
    }
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.BOTMENU, 'shift'))
            .setLabel('下移')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.BOTMENU, 'refresh'))
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.BOTMENU, 'close'))
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(buildCustomId(NS.BOTMENU, 'select'))
            .setPlaceholder('Select a bot to operate')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(opts)
    );
    const components = !opts.length ? [row1] : [row1, row2];
    return { embeds: [embed], components };
}

function generateBotMenuEmbed() {
    const { botManager, startedAt } = state;
    let botsfield = '';
    const idW = parseInt(botManager.getBotNums() / 10) + 2;
    const longestBotLength = botManager.bots.reduce((longest, a) => {
        return a.name.length > longest ? a.name.length : longest;
    }, 0);
    const statusW = 18;
    for (let i = 0; i < botManager.getBotNums(); i++) {
        const bot = botManager.getBotByIndex(i);
        const s = bot.status.length > statusW ? bot.status.substring(0, statusW - 2) + '..' : bot.status;
        botsfield += `${i}`.padStart(idW);
        botsfield += ` ${bot.name}`.padEnd(longestBotLength + 1);
        botsfield += ` ${s}\n`;
    }
    botsfield = botsfield
        ? `Id`.padEnd(idW) + '|' + `Bot`.padEnd(longestBotLength) + '|Status\n' + botsfield
        : botsfield;

    const parentMem = process.memoryUsage();
    const sysInfo = `Up \`${fmtUptime(Date.now() - startedAt)}\`  RSS \`${fmtBytes(parentMem.rss)}\`  Heap \`${fmtBytes(parentMem.heapUsed)}/${fmtBytes(parentMem.heapTotal)}\``;

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
            { name: ':desktop:系統', value: sysInfo },
            { name: `目前共 \`${botManager.getBotNums()}\` 隻 bot`, value: '\`\`\`' + (botsfield ? botsfield : '無') + '\`\`\`' },
        )
        .setTimestamp()
        .setFooter(footerOpts);
    if (ICON_URL) embed.setThumbnail(ICON_URL);
    return embed;
}

function generateBotMenuNotInService(oldComponents) {
    const closeComponents = oldComponents.map(row => {
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
    return { embeds: [embed], components: closeComponents };
}

module.exports = { generateBotMenu, generateBotMenuEmbed, generateBotMenuNotInService };
