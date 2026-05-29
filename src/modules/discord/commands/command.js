const { SlashCommandBuilder } = require('discord.js');
const { resolveBot, autocompleteBots } = require('../botContext');
const { searchCommands, buildIndex } = require('../commandIndex');
const { logger } = require('../../../logger');

// parent 啟動時 lazy-build；第一次呼叫 searchCommands() 內也會自動 build
buildIndex();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('command')
        .setDescription('Send a command to a bot (same as console input)')
        .addStringOption(o => o
            .setName('text')
            .setDescription('Command text, e.g. ".tl" or "warp world" (leading dot optional)')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(o => o
            .setName('bot')
            .setDescription('Target bot (default: currentBot)')
            .setAutocomplete(true)),

    permissionRequire: 0,

    async execute(interaction) {
        const text = interaction.options.getString('text', true);
        const { botName, botIns, error } = resolveBot(interaction);
        if (error) return interaction.reply({ content: error, ephemeral: true });
        if (!botIns.childProcess) {
            return interaction.reply({ content: `Bot \`${botName}\` not running`, ephemeral: true });
        }

        // bot 端會做 message.text.slice(1)，故必須以 "." 開頭；未帶就自動補上
        const normalized = text.trim().startsWith('.') ? text.trim() : `.${text.trim()}`;
        botIns.childProcess.send({ type: 'cmd', text: normalized });
        logger(true, 'INFO', 'DISCORD', `/command "${normalized}" -> ${botName} by ${interaction.user.username}`);

        return interaction.reply({
            content: `Sent to \`${botName}\`: \`${normalized}\`  (output → console / logger)`,
            ephemeral: true,
        });
    },

    async autocomplete(interaction) {
        try {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'bot') {
                return interaction.respond(autocompleteBots(focused.value)).catch(() => {});
            }
            if (focused.name === 'text') {
                return interaction.respond(searchCommands(focused.value)).catch(() => {});
            }
            return interaction.respond([]).catch(() => {});
        } catch (_) {
            return interaction.respond([]).catch(() => {});
        }
    },
};
