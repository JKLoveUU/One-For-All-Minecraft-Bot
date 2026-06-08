const { logger } = require('../../logger');
const { parseCustomId } = require('./ids');
const { slashCommands, componentHandlers } = require('./registry');
const {
    discordWhiteListCheck, isOwner,
    noPermissionReply, notImplementedReply,
} = require('./auth');

function checkPermission(interaction) {
    try {
        if (isOwner(interaction.user && interaction.user.id)) return true;
        if (discordWhiteListCheck(interaction.member)) return true;
    } catch (_) {}
    return false;
}

function attachRouter(client) {
    client.on('interactionCreate', async (interaction) => {
        try {
            // Autocomplete 不過權限檢查（Discord 端是低風險的輸入提示）
            if (interaction.isAutocomplete()) {
                const cmd = slashCommands.get(interaction.commandName);
                if (cmd && typeof cmd.autocomplete === 'function') {
                    return cmd.autocomplete(interaction);
                }
                return interaction.respond([]).catch(() => {});
            }

            if (!checkPermission(interaction)) {
                return noPermissionReply(interaction);
            }

            // Slash commands
            if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
                const cmd = slashCommands.get(interaction.commandName);
                if (!cmd) return notImplementedReply(interaction);
                logger(true, 'INFO', 'DISCORD', `/${interaction.commandName} - ${interaction.user.username}`);
                return cmd.execute(interaction);
            }

            // Buttons / Select menus / Modal submits（共用 componentHandlers，依 customId namespace 分派）
            if (
                (interaction.isMessageComponent && interaction.isMessageComponent()) ||
                (interaction.isModalSubmit && interaction.isModalSubmit())
            ) {
                const parsed = parseCustomId(interaction.customId);
                if (!parsed) return notImplementedReply(interaction);
                logger(true, 'INFO', 'DISCORD', `${parsed.raw} - ${interaction.user.username}`);
                const handler = componentHandlers.get(parsed.ns);
                if (!handler) return notImplementedReply(interaction);
                return handler({
                    interaction,
                    ns: parsed.ns,
                    action: parsed.action,
                    args: parsed.args,
                });
            }
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `interactionCreate error: ${err.message}`);
            if (err && err.stack) logger(true, 'DEBUG', 'DISCORD', err.stack);
        }
    });
}

module.exports = { attachRouter };
