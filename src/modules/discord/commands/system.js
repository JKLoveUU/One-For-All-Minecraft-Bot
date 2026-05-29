const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const state = require('../state');
const { fmtBytes, fmtUptime } = require('../util/format');
const { ICON_URL } = require('../constants');
const { runShutdown } = require('../shutdown');
const { logger } = require('../../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('system')
        .setDescription('System operations')
        .addSubcommand(sc => sc
            .setName('status')
            .setDescription('Show overall system status'))
        .addSubcommand(sc => sc
            .setName('shutdown')
            .setDescription('Shutdown the One For All process')),

    permissionRequire: 0,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const { botManager, startedAt } = state;
            const mem = process.memoryUsage();
            const embed = new EmbedBuilder()
                .setTitle('System status')
                .setColor(Colors.Blue)
                .addFields(
                    { name: 'Up',    value: `\`${fmtUptime(Date.now() - startedAt)}\``, inline: true },
                    { name: 'Bots',  value: `\`${botManager ? botManager.getBotNums() : 0}\``, inline: true },
                    { name: 'RSS',   value: `\`${fmtBytes(mem.rss)}\``, inline: true },
                    { name: 'Heap',  value: `\`${fmtBytes(mem.heapUsed)}/${fmtBytes(mem.heapTotal)}\``, inline: true },
                )
                .setTimestamp();
            if (ICON_URL) embed.setThumbnail(ICON_URL);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'shutdown') {
            await interaction.reply({ content: 'Shutdown initiated', ephemeral: true });
            logger(true, 'INFO', 'DISCORD', `/system shutdown by ${interaction.user.username}`);
            await runShutdown();
            return;
        }

        return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
    },
};
