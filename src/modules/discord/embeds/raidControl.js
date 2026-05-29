const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const { ICON_URL } = require('../constants');
const { buildCustomId, NS } = require('../ids');

function generateRaidBotControlMenu(botinfo) {
    const botName = botinfo.id;
    const embed = generateRaidBotControlMenuEmbed(botinfo);
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.RBCM, 'refresh', botName))
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♻️'),
        new ButtonBuilder()
            .setCustomId(buildCustomId(NS.RBCM, 'close', botName))
            .setLabel('Close Panel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⚪')
    );
    return { content: `Raid Bot - ${botName}`, embeds: [embed], components: [row1], ephemeral: true };
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

module.exports = { generateRaidBotControlMenu, generateRaidBotControlMenuEmbed };
