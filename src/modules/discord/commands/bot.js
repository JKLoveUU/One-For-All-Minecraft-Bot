const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const state = require('../state');
const { resolveBot, autocompleteBots } = require('../botContext');
const { respawnBotMenu, openControlPanel } = require('../panels/botMenu');
const { logger } = require('../../../logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Bot operations')
        .addSubcommand(sc => sc
            .setName('list')
            .setDescription('List all bots'))
        .addSubcommand(sc => sc
            .setName('info')
            .setDescription('Show bot info')
            .addStringOption(o => o
                .setName('bot').setDescription('Bot name').setAutocomplete(true)))
        .addSubcommand(sc => sc
            .setName('reload')
            .setDescription('Reload a bot')
            .addStringOption(o => o
                .setName('bot').setDescription('Bot name').setAutocomplete(true)))
        .addSubcommand(sc => sc
            .setName('stoptask')
            .setDescription('Stop the current task on a bot')
            .addStringOption(o => o
                .setName('bot').setDescription('Bot name').setAutocomplete(true)))
        .addSubcommand(sc => sc
            .setName('use')
            .setDescription('Set currentBot for subsequent commands')
            .addStringOption(o => o
                .setName('bot').setDescription('Bot name').setAutocomplete(true).setRequired(true)))
        .addSubcommand(sc => sc
            .setName('menu')
            .setDescription('Repost the bot dashboard menu (in case it was closed)'))
        .addSubcommand(sc => sc
            .setName('select')
            .setDescription('Open the control panel for a bot')
            .addStringOption(o => o
                .setName('bot').setDescription('Bot name').setAutocomplete(true).setRequired(true))),

    permissionRequire: 0,

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const { botManager } = state;

        switch (sub) {
            case 'list': {
                let body = '';
                for (let i = 0; i < botManager.getBotNums(); i++) {
                    const b = botManager.getBotByIndex(i);
                    body += `\`${i}\`  \`${b.name}\`  \`${b.status || '-'}\`\n`;
                }
                if (!body) body = '`No bot configured`';
                const embed = new EmbedBuilder()
                    .setTitle('Bots')
                    .setColor(Colors.Green)
                    .setDescription(body);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            case 'info': {
                const { botName, botIns, error } = resolveBot(interaction);
                if (error) return interaction.reply({ content: error, ephemeral: true });
                const info = await botManager.getBotInfo(botName);
                if (!info) return interaction.reply({ content: `Bot data unavailable for ${botName}`, ephemeral: true });
                const lines = [
                    `**Bot** \`${info.name || botName}\``,
                    `**Status** \`${botIns.status || '-'}\``,
                    `**Server** \`${info.server ?? '-'}\``,
                    `**Ping** \`${info.ping ?? '-'}ms\``,
                    `**Coin** \`${info.coin ?? '-'}\``,
                    `**Balance** \`${info.balance ?? '-'}\``,
                ];
                return interaction.reply({ content: lines.join('\n'), ephemeral: true });
            }

            case 'reload': {
                const { botName, botIns, error } = resolveBot(interaction);
                if (error) return interaction.reply({ content: error, ephemeral: true });
                if (!botIns.childProcess) {
                    return interaction.reply({ content: `Bot \`${botName}\` not running`, ephemeral: true });
                }
                botIns.childProcess.send({ type: 'reload' });
                logger(true, 'INFO', 'DISCORD', `/bot reload ${botName} by ${interaction.user.username}`);
                return interaction.reply({ content: `Reload sent to \`${botName}\``, ephemeral: true });
            }

            case 'stoptask': {
                const { botName, botIns, error } = resolveBot(interaction);
                if (error) return interaction.reply({ content: error, ephemeral: true });
                if (!botIns.childProcess) {
                    return interaction.reply({ content: `Bot \`${botName}\` not running`, ephemeral: true });
                }
                botIns.childProcess.send({ type: 'cmd', text: '.stop' });
                logger(true, 'INFO', 'DISCORD', `/bot stoptask ${botName} by ${interaction.user.username}`);
                return interaction.reply({ content: `Stop task sent to \`${botName}\``, ephemeral: true });
            }

            case 'use': {
                const botName = interaction.options.getString('bot');
                const ok = botManager.setCurrentBotByName(botName);
                if (!ok) {
                    return interaction.reply({ content: `Bot \`${botName}\` not found`, ephemeral: true });
                }
                logger(true, 'INFO', 'DISCORD', `/bot use ${botName} by ${interaction.user.username}`);
                return interaction.reply({ content: `currentBot set to \`${botName}\``, ephemeral: true });
            }

            case 'menu': {
                const result = await respawnBotMenu();
                if (result.error) {
                    return interaction.reply({ content: result.error, ephemeral: true });
                }
                logger(true, 'INFO', 'DISCORD', `/bot menu by ${interaction.user.username}`);
                return interaction.reply({
                    content: `Menu reposted at <#${result.channelId}>`,
                    ephemeral: true,
                });
            }

            case 'select': {
                const botName = interaction.options.getString('bot');
                logger(true, 'INFO', 'DISCORD', `/bot select ${botName} by ${interaction.user.username}`);
                return openControlPanel(interaction, botName);
            }

            default:
                return interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
        }
    },

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'bot') {
                return interaction.respond(autocompleteBots(focused.value)).catch(() => {});
            }
            return interaction.respond([]).catch(() => {});
        } catch (_) {
            return interaction.respond([]).catch(() => {});
        }
    },
};
