const state = require('../state');
const { generateRaidBotControlMenu } = require('../embeds/raidControl');
const { notImplementedReply } = require('../auth');

async function handleRbcm({ interaction, action, args }) {
    const botName = args[0]; // rbcm:<action>:<botName>

    if (!interaction.isButton()) return notImplementedReply(interaction);

    switch (action) {
        case 'close':
            return interaction.message.delete();

        case 'refresh': {
            const fresh = await state.botManager.getBotInfo(botName);
            if (!fresh) return interaction.reply({ content: 'Bot data unavailable', ephemeral: true });
            return interaction.update(generateRaidBotControlMenu(fresh));
        }

        default:
            return notImplementedReply(interaction);
    }
}

module.exports = { handleRbcm };
