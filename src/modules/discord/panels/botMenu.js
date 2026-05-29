const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, ComponentType,
} = require('discord.js');

const state = require('../state');
const { logger } = require('../../../logger');
const { buildCustomId, NS } = require('../ids');
const { generateBotMenu } = require('../embeds/botMenu');
const { generateGeneralBotControlMenu } = require('../embeds/generalControl');
const { generateRaidBotControlMenu } = require('../embeds/raidControl');
const { startPanelAutoUpdate } = require('./autoUpdate');
const { isRaidRunning } = require('../botContext');
const { notImplementedReply } = require('../auth');
const { runShutdown } = require('../shutdown');

async function handleBotmenu({ interaction, action, args }) {
    if (interaction.isButton()) {
        switch (action) {
            case 'refresh':
                return interaction.update(generateBotMenu());

            case 'shift': {
                const message = await interaction.channel.messages.fetch(interaction.message.id);
                const replacement = await interaction.channel.send(generateBotMenu());
                state.botMenuId = replacement.id;
                return message.delete();
            }

            case 'close': {
                const isConfirm = args[0] === 'confirm';
                if (!isConfirm) {
                    // 第一次點 close —— 交換成 confirm 狀態
                    const closeId   = buildCustomId(NS.BOTMENU, 'close');
                    const confirmId = buildCustomId(NS.BOTMENU, 'close', 'confirm');
                    const [row1] = interaction.message.components;
                    const updatedButtons = row1.components.map(c => {
                        const b = ButtonBuilder.from(c);
                        if (c.customId === closeId) {
                            b.setCustomId(confirmId)
                                .setLabel('Click Again To close')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('⚪');
                        }
                        return b;
                    });
                    const updatedRows = interaction.message.components.map((row, i) => {
                        if (i === 0) return new ActionRowBuilder().addComponents(updatedButtons);
                        return new ActionRowBuilder().addComponents(
                            row.components.map(c =>
                                c.type === ComponentType.Button
                                    ? ButtonBuilder.from(c)
                                    : StringSelectMenuBuilder.from(c)
                            )
                        );
                    });
                    return interaction.update({ components: updatedRows });
                }
                // 第二次確認 —— 真的關閉
                await interaction.reply({ content: 'bot closing', ephemeral: true });
                logger(true, 'INFO', 'DISCORD', `Bot close by Discord - ${interaction.user.username}`);
                await runShutdown();
                return;
            }

            default:
                return notImplementedReply(interaction);
        }
    }

    if (interaction.isStringSelectMenu() && action === 'select') {
        return openControlPanel(interaction, interaction.values[0]);
    }

    return notImplementedReply(interaction);
}

// 依 bot 狀態回覆對應控制面板（raid / general）。可被 botmenu select menu 與 /bot select 共用。
async function openControlPanel(interaction, botName) {
    const botIns = state.botManager.getBotByName(botName);
    if (!botIns) {
        logger(true, 'ERROR', 'DISCORD', `err at open menu for bot ${botName}`);
        return interaction.reply({ content: `err at open menu for bot ${botName}`, ephemeral: true });
    }
    if (!botIns.childProcess) {
        if (botIns.reloadCancel && botIns.reloadScheduledAt) {
            const cd = botIns.reloadCD ?? 20_000;
            const remainSec = Math.max(0, Math.ceil((botIns.reloadScheduledAt + cd - Date.now()) / 1000));
            return interaction.reply({
                content: `Bot \`${botName}\` 重連中，約 **${remainSec}** 秒後自動重啟`,
                ephemeral: true,
            });
        }
        return interaction.reply({ content: 'Bot is not running, try it later', ephemeral: true });
    }
    if (isRaidRunning(botIns)) {
        const botinfo = await state.botManager.getBotInfo(botName);
        return interaction.reply(generateRaidBotControlMenu(botinfo));
    }
    const botinfo = await state.botManager.getBotInfo(botName);
    await interaction.reply(generateGeneralBotControlMenu(botinfo));
    startPanelAutoUpdate(interaction, botName);
}

// 重新發一份 botmenu 到設定的頻道；若舊的 botMenuId 還在就刪掉，避免重複。
// 回傳新的 message（失敗時回 null）。
async function respawnBotMenu() {
    const { client, config, botMenuId } = state;
    if (!client || !client.readyAt) {
        return { error: 'Discord client 尚未連線' };
    }
    const channelId = config.discord_setting && config.discord_setting.channelId;
    if (!channelId) return { error: '未設定 channelId' };
    const channel = client.channels.cache.get(channelId);
    if (!channel) return { error: 'Channel 不在 cache (id 錯誤或無存取權)' };

    if (botMenuId) {
        try {
            const old = await channel.messages.fetch(botMenuId, { force: true });
            if (old) await old.delete();
        } catch (_) { /* 已被刪除或抓不到，略過 */ }
    }

    const fresh = await channel.send(generateBotMenu());
    state.botMenuId = fresh.id;
    logger(true, 'INFO', 'DISCORD', `botmenu respawned at ${fresh.id}`);
    return { message: fresh, channelId };
}

module.exports = { handleBotmenu, respawnBotMenu, openControlPanel };
