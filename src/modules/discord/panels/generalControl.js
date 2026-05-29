const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const state = require('../state');
const { buildCustomId, NS } = require('../ids');
const { generateGeneralBotControlMenu } = require('../embeds/generalControl');
const {
    startPanelAutoUpdateForMessage, stopPanelAutoUpdate,
} = require('./autoUpdate');
const { notImplementedReply } = require('../auth');

async function handleGbcm({ interaction, action, args }) {
    const botName = args[0]; // gbcm:<action>:<botName>

    if (interaction.isButton()) {
        switch (action) {
            case 'time':
                return interaction.reply({
                    content: `Current Time: ${new Date().toLocaleString()}`,
                    ephemeral: true,
                });

            case 'newest': {
                const fresh = await state.botManager.getBotInfo(botName);
                if (!fresh) return interaction.reply({ content: 'Bot data unavailable', ephemeral: true });
                stopPanelAutoUpdate(interaction.message.id);
                const newMsg = await interaction.channel.send(generateGeneralBotControlMenu(fresh));
                await interaction.message.delete();
                startPanelAutoUpdateForMessage(newMsg, botName);
                return;
            }

            case 'refresh': {
                const fresh = await state.botManager.getBotInfo(botName);
                if (!fresh) return interaction.reply({ content: 'Bot data unavailable', ephemeral: true });
                await interaction.update(generateGeneralBotControlMenu(fresh));
                startPanelAutoUpdateForMessage(interaction.message, botName);
                return;
            }

            case 'close':
                stopPanelAutoUpdate(interaction.message.id);
                return interaction.message.delete();

            case 'reload': {
                const bot = state.botManager.getBotByName(botName);
                if (!bot || !bot.childProcess) {
                    return interaction.reply({ content: `Bot ${botName} not available`, ephemeral: true });
                }
                bot.childProcess.send({ type: 'reload' });
                return interaction.reply({ content: `Reload sent to ${botName}`, ephemeral: true });
            }

            case 'stoptask': {
                const bot = state.botManager.getBotByName(botName);
                if (!bot || !bot.childProcess) {
                    return interaction.reply({ content: `Bot ${botName} not available`, ephemeral: true });
                }
                bot.childProcess.send({ type: 'cmd', text: '.stop' });
                return interaction.reply({ content: `Stop task sent to ${botName}`, ephemeral: true });
            }

            default:
                return notImplementedReply(interaction);
        }
    }

    if (interaction.isStringSelectMenu() && action === 'select') {
        const value = interaction.values[0];
        switch (value) {
            case 'basic-ops':
                return interaction.reply({
                    content: `Basic operations for ${botName}`,
                    components: [new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(buildCustomId(NS.GBCM, 'reload', botName))
                            .setLabel('Reload')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(buildCustomId(NS.GBCM, 'stoptask', botName))
                            .setLabel('Stop Task')
                            .setStyle(ButtonStyle.Danger),
                    )],
                    ephemeral: true,
                });

            case 'ping': {
                const info = await state.botManager.getBotInfo(botName);
                return interaction.reply({ content: `Ping: ${info?.ping ?? 'N/A'}ms`, ephemeral: true });
            }

            case 'time':
                return interaction.reply({
                    content: `Current Time: ${new Date().toLocaleString()}`,
                    ephemeral: true,
                });

            case 'wms':
                return interaction.reply({ content: 'Warehouse menu - not available', ephemeral: true });

            default:
                return notImplementedReply(interaction);
        }
    }

    return notImplementedReply(interaction);
}

module.exports = { handleGbcm };
