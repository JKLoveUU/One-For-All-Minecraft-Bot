const state = require('./state');
const { logger } = require('../../logger');
const { discordWhiteListCheck, isOwner } = require('./auth');

// 記住每個 player 最近從哪個 bot 收到 whisper —— 決定回覆 proxy bot
const recentSenders = new Map();   // player → { bot, at }
let lastSender = null;             // { player, bot, at } —— 純文字 (無 @ / /m) 回覆對象
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
    state.client.on('messageCreate', onDiscordMessage);
    _started = true;
    logger(true, 'INFO', 'DISCORD', `mcdmForward: started on channel ${cfg.MC_DM_Forward_channelId}`);
}

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
        const now = Date.now();
        recentSenders.set(from, { bot: botName, at: now });
        lastSender = { player: from, bot: botName, at: now };
        await channel.send(`**${from}** → \`${botName}\`: ${text}`);
    } catch (err) {
        logger(true, 'ERROR', 'DISCORD', `mcdmForward forward: ${err.message}`);
    }
}

async function onDiscordMessage(msg) {
    try {
        const cfg = state.config.discord_setting;
        if (!msg.channelId || msg.channelId !== cfg.MC_DM_Forward_channelId) return;
        if (msg.author && msg.author.bot) return; // 含自己的轉發訊息

        // 白名單檢查（沿用 slash command 同一套邏輯）
        const allow = isOwner(msg.author && msg.author.id) || discordWhiteListCheck(msg.member);
        if (!allow) {
            try { await msg.react('❌'); } catch (_) {}
            logger(true, 'INFO', 'DISCORD', `mcdmForward: blocked non-whitelist user ${msg.author && msg.author.username}`);
            return;
        }

        const raw = (msg.content || '').trim();
        if (!raw) return;

        // 解析 target / body
        let target = null;
        let body = null;
        const mAt = raw.match(/^@(\S+)\s+([\s\S]+)$/);
        const mSlash = raw.match(/^\/m\s+(\S+)\s+([\s\S]+)$/i);
        if (mAt)        { target = mAt[1];    body = mAt[2]; }
        else if (mSlash){ target = mSlash[1]; body = mSlash[2]; }
        else            { body = raw; }

        if (!target) {
            if (!lastSender) {
                try { await msg.reply({ content: '尚未收過 incoming whisper，請用 `@<player> <text>` 指定對象', allowedMentions: { repliedUser: false } }); } catch (_) {}
                return;
            }
            target = lastSender.player;
        }

        // 選 proxy bot
        const { bot, why } = pickProxyBot(target);
        if (!bot) {
            try { await msg.react('⚠️'); } catch (_) {}
            try { await msg.reply({ content: `找不到可用的代理 bot (${why})`, allowedMentions: { repliedUser: false } }); } catch (_) {}
            return;
        }

        try {
            bot.childProcess.send({ type: 'chat', text: `/m ${target} ${body}` });
            await msg.react('✅').catch(() => {});
            logger(true, 'INFO', 'DISCORD', `mcdmForward: ${msg.author.username} → ${target} via ${bot.name}`);
        } catch (err) {
            try { await msg.react('⚠️'); } catch (_) {}
            logger(true, 'ERROR', 'DISCORD', `mcdmForward send: ${err.message}`);
        }
    } catch (err) {
        logger(true, 'ERROR', 'DISCORD', `mcdmForward onMessage: ${err.message}`);
    }
}

function pickProxyBot(targetPlayer) {
    const { botManager } = state;
    const cfg = state.config.discord_setting;

    // 1. config 指定
    if (cfg.MC_DM_Forward_proxyBot) {
        const b = botManager.getBotByName(cfg.MC_DM_Forward_proxyBot);
        if (b && b.childProcess) return { bot: b, why: 'config' };
    }

    // 2. recent sender 對應 bot
    const recent = recentSenders.get(targetPlayer);
    if (recent) {
        const b = botManager.getBotByName(recent.bot);
        if (b && b.childProcess) return { bot: b, why: 'recentSender' };
    }

    // 3. currentBot
    const current = botManager.currentBot;
    if (current && current.childProcess) return { bot: current, why: 'currentBot' };

    return { bot: null, why: 'no online bot' };
}

module.exports = { start };
