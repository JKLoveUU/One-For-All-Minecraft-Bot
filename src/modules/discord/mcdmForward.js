const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const state = require('./state');
const { logger } = require('../../logger');
const { buildCustomId, NS } = require('./ids');

// 記住每個 player 最近從哪個 bot 收到 whisper —— 作為挑選 proxy bot 的備援
const recentSenders = new Map();   // player → { bot, at }
let _started = false;

function start() {
    if (_started) return;
    const cfg = state.config && state.config.discord_setting;
    if (!cfg || !cfg.enable_MC_DM_Forward) {
        logger(true, 'INFO', 'DISCORD', 'mcdmForward: disabled by config');
        return;
    }
    if (!cfg.MC_DM_Forward_channelId) {
        logger(true, 'WARN', 'DISCORD', 'mcdmForward: MC_DM_Forward_channelId not set, skipped');
        return;
    }
    if (!state.botManager || !state.client) {
        logger(true, 'WARN', 'DISCORD', 'mcdmForward: botManager or client not ready');
        return;
    }

    state.botManager.handle.on('event', onBotEvent);
    _started = true;
    logger(true, 'INFO', 'DISCORD', `mcdmForward: started on channel ${cfg.MC_DM_Forward_channelId}`);
}

// ── MC → Discord：收到 whisper 就轉發到頻道，並附上「快速回覆」按鈕 ──────────────
function onBotEvent(evt, botName) {
    if (!evt || evt.name !== 'mcWhisper') return;
    const { from, text } = evt.payload || {};
    if (!from || text == null) return;
    forwardToDiscord(botName, from, text);
}

async function forwardToDiscord(botName, from, text) {
    try {
        const cfg = state.config.discord_setting;
        const channel = state.client.channels.cache.get(cfg.MC_DM_Forward_channelId);
        if (!channel) {
            logger(true, 'WARN', 'DISCORD', `mcdmForward: forward channel not in cache (id=${cfg.MC_DM_Forward_channelId})\n→ 請確認 MC_DM_Forward_channelId 正確，Bot 在該頻道有「查看頻道」與「傳送訊息」權限，且與 guildId 在同一個伺服器。`);
            return;
        }
        recentSenders.set(from, { bot: botName, at: Date.now() });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(buildCustomId(NS.MCDM, 'reply', botName, from))
                .setLabel('快速回覆')
                .setEmoji('💬')
                .setStyle(ButtonStyle.Primary),
        );
        await channel.send({ content: `**${from}** → \`${botName}\`: ${text}`, components: [row] });
    } catch (err) {
        logger(true, 'ERROR', 'DISCORD', `mcdmForward forward: ${err.message}`);
    }
}

// ── Discord 互動：按鈕 → 表單；表單提交 → 送出 /m 並 log 回頻道 ─────────────────
async function handleMcdm({ interaction, action, args }) {
    if (action === 'reply')  return showReplyModal(interaction, args);
    if (action === 'submit') return submitReply(interaction);
    try { await interaction.reply({ content: '未知操作', ephemeral: true }); } catch (_) {}
}

// 按鈕：開啟表單，預設填寫「發送的 bot」「該 player」，訊息欄留空給 user 提交
async function showReplyModal(interaction, args) {
    const [botName = '', player = ''] = args;
    const modal = new ModalBuilder()
        .setCustomId(buildCustomId(NS.MCDM, 'submit'))
        .setTitle('回覆 MC 私訊');

    const botInput = new TextInputBuilder()
        .setCustomId('bot')
        .setLabel('發送的 bot')
        .setStyle(TextInputStyle.Short)
        .setValue(botName)
        .setRequired(true);
    const playerInput = new TextInputBuilder()
        .setCustomId('player')
        .setLabel('該 player')
        .setStyle(TextInputStyle.Short)
        .setValue(player)
        .setRequired(true);
    const msgInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('訊息')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('輸入要私訊回覆的內容…')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(botInput),
        new ActionRowBuilder().addComponents(playerInput),
        new ActionRowBuilder().addComponents(msgInput),
    );
    await interaction.showModal(modal);
}

// 表單提交：以指定 bot 送出 /m，並在頻道留下 log
async function submitReply(interaction) {
    const botName = (interaction.fields.getTextInputValue('bot') || '').trim();
    const player  = (interaction.fields.getTextInputValue('player') || '').trim();
    const message = (interaction.fields.getTextInputValue('message') || '').trim();

    if (!player || !message) {
        return interaction.reply({ content: '玩家或訊息為空，未送出', ephemeral: true });
    }

    const { bot, why } = pickProxyBot(botName, player);
    if (!bot) {
        return interaction.reply({ content: `找不到可用的代理 bot (${why})`, ephemeral: true });
    }

    try {
        bot.childProcess.send({ type: 'chat', text: `/m ${player} ${message}` });
    } catch (err) {
        logger(true, 'ERROR', 'DISCORD', `mcdmForward send: ${err.message}`);
        return interaction.reply({ content: `送出失敗：${err.message}`, ephemeral: true });
    }

    logger(true, 'INFO', 'DISCORD', `mcdmForward: ${interaction.user.username} → ${player} via ${bot.name}: ${message}`);
    // 提交後 log 在 DC 中（非 ephemeral，留在頻道做紀錄）
    return interaction.reply({
        content: `📨 \`${bot.name}\` → **${player}**: ${message}\n*by ${interaction.user}*`,
        allowedMentions: { users: [] },
    });
}

function pickProxyBot(preferredBot, targetPlayer) {
    const { botManager } = state;
    const cfg = state.config.discord_setting;

    // 1. 表單指定的 bot（預設為 whisper 來源 bot）
    if (preferredBot) {
        const b = botManager.getBotByName(preferredBot);
        if (b && b.childProcess) return { bot: b, why: 'preferred' };
    }

    // 2. config 指定
    if (cfg.MC_DM_Forward_proxyBot) {
        const b = botManager.getBotByName(cfg.MC_DM_Forward_proxyBot);
        if (b && b.childProcess) return { bot: b, why: 'config' };
    }

    // 3. recent sender 對應 bot
    const recent = recentSenders.get(targetPlayer);
    if (recent) {
        const b = botManager.getBotByName(recent.bot);
        if (b && b.childProcess) return { bot: b, why: 'recentSender' };
    }

    // 4. currentBot
    const current = botManager.currentBot;
    if (current && current.childProcess) return { bot: current, why: 'currentBot' };

    return { bot: null, why: 'no online bot' };
}

module.exports = { start, handleMcdm };
