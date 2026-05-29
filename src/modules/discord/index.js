const { Client, GatewayIntentBits, ActivityType } = require('discord.js');

const state = require('./state');
const { logger } = require('../../logger');

const { generateBotMenu, generateBotMenuNotInService } = require('./embeds/botMenu');
const {
    getStatus, sendTestMessage, testToken, getAppIdFromToken, sendAuthNotify,
} = require('./util/notify');

const { attachRouter } = require('./router');
const { registerComponentHandler } = require('./registry');
const { NS } = require('./ids');
const { handleBotmenu } = require('./panels/botMenu');
const { handleGbcm } = require('./panels/generalControl');
const { handleRbcm } = require('./panels/raidControl');
const { loadCommands } = require('./commands/_loader');
const { deployIfChanged } = require('./deploy');
const { setShutdownHandler } = require('./shutdown');
const mcdmForward = require('./mcdmForward');

// MC_DM_Forward 需要 GuildMessages + MessageContent (privileged) intent。
// 若 enable_MC_DM_Forward = false 仍會宣告，但無實際監聽器附掛。
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
state.client = client;
const config = state.config;

// 註冊 component handler
registerComponentHandler(NS.BOTMENU, handleBotmenu);
registerComponentHandler(NS.GBCM, handleGbcm);
registerComponentHandler(NS.RBCM, handleRbcm);

// 載入所有 slash command 模組（commands/*.js）
loadCommands();

// 集中關閉行為：botmenu 二次確認 / /system shutdown 都走這裡
setShutdownHandler(async () => {
    state.botManager.stop();
    const waitingTime = 1000 + state.botManager.getBotNums() * 200;
    await DiscordBotStop(waitingTime);
    logger(true, 'INFO', 'CONSOLE', 'Close finished');
    process.exit(0);
});

function DiscordBotStart(botManagerIns, startedAt) {
    state.botManager = botManagerIns;
    if (startedAt) state.startedAt = startedAt;
    try {
        state.botManager.handle.on('data', (data, name) => {
            if (name) state.botDataCache[name] = data;
        });
    } catch (_) {}
    login();
    addDiscordBotEventHandler();
}

async function DiscordBotStop(waitingTime) {
    await Promise.all([
        setBotMenuNotInService(),
        new Promise((resolve) => setTimeout(resolve, waitingTime)),
    ]);
    client.destroy();
}

function diagnoseDcError(err) {
    const msg = String(err && err.message || '');
    if (/disallowed intent/i.test(msg))
        return '→ 請至 Discord Developer Portal > Applications > 你的 Bot > Bot > Privileged Gateway Intents 開啟 Message Content Intent 後重啟程式。若 Bot 已在超過 100 個伺服器，Discord 可能要求審核。';
    if (/invalid token/i.test(msg))
        return '→ 請確認 config.toml 的 discord_setting.token 是 Bot Token（非 Client Secret / Application ID）。可至 Developer Portal > Bot > Reset Token 重新產生後貼上。';
    if (/login timeout|timed? ?out/i.test(msg))
        return '→ 請確認目前環境能連到 discord.com / gateway.discord.gg，是否被防火牆、代理或 DNS 阻擋。';
    return null;
}

function logDcError(prefix, err) {
    const hint = diagnoseDcError(err);
    logger(true, 'ERROR', 'DISCORD', hint ? `${prefix}\n${err.message}\n${hint}` : `${prefix}\n${err.message}`);
}

function login() {
    try {
        client.login(config.discord_setting.token)
            .catch(err => logDcError('Discord Bot Login 失敗', err));
    } catch (err) {
        logDcError('Discord Bot Login 失敗', err);
    }
}

function addDiscordBotEventHandler() {
    client.on('clientReady', async () => {
        try {
            logger(true, 'INFO', 'DISCORD', `Discord bot Logged in as ${client.user.tag}`);
            client.user.setPresence({
                activities: [{
                    name: 'Minecraft',
                    type: ActivityType.Streaming,
                    url: 'https://www.twitch.tv/nacho_dayo',
                }],
                status: 'online',
            });
            await deployIfChanged();
            await initBotMenu();
            mcdmForward.start();
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `clientReady error: ${err.message}`);
        }
    });

    client.on('error', (err) => {
        logDcError('Discord client error', err);
    });

    attachRouter(client);
}

async function initBotMenu() {
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    if (!channel) {
        logger(true, 'ERROR', 'DISCORD', `channel ${config.discord_setting.channelId} not found\n→ 請確認 channelId 正確、Bot 已加入該伺服器，並在該頻道有「查看頻道」與「傳送訊息」權限。`);
        return;
    }
    // 清掉舊的 botmenu 訊息
    const botMenuIds = [];
    await channel.messages.fetch({ limit: 30 }).then(messages => {
        const botMessages = messages.filter(m => m.author.id === client.user.id && m.author.bot);
        const matchingMessages = botMessages.filter(m => {
            if (m.embeds && m.embeds.length > 0 && (Date.now() - m.createdTimestamp < 13 * 24 * 60 * 60 * 1000)) {
                const firstEmbed = m.embeds[0];
                const matchingField = firstEmbed.fields.find(field => field.name.startsWith('目前共'));
                return (matchingField !== undefined);
            }
            return false;
        });
        if (matchingMessages) {
            matchingMessages.forEach(msg => botMenuIds.push(msg.id));
        }
    });
    try {
        const deleted = await channel.bulkDelete(botMenuIds);
        logger(true, 'INFO', 'DISCORD', `Deleted ${deleted.size} expired Menu`);
    } catch (err) {
        logger(true, 'ERROR', 'DISCORD', `bulkDelete error: ${err.message}`);
    }
    const newMenu = await channel.send(generateBotMenu());
    state.botMenuId = newMenu.id;

    setInterval(async () => {
        try {
            const ch = client.channels.cache.get(config.discord_setting.channelId);
            const oldmenu = await getChannelMsgFetch(ch, state.botMenuId);
            if (oldmenu) {
                await oldmenu.edit(generateBotMenu());
            } else {
                const replacement = await ch.send(generateBotMenu());
                state.botMenuId = replacement.id;
            }
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `botMenu refresh error: ${err.message}`);
        }
    }, 30_000);
}

async function getChannelMsgFetch(channel, id) {
    try {
        return await channel.messages.fetch(id, { force: true });
    } catch (error) {
        logger(true, 'ERROR', 'DISCORD', `getChannelMsgFetch: ${error}`);
        return undefined;
    }
}

async function setBotMenuNotInService() {
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    const oldmenu = await getChannelMsgFetch(channel, state.botMenuId);
    if (!oldmenu) return;
    await oldmenu.edit(generateBotMenuNotInService(oldmenu.components));
}

module.exports = {
    DiscordBotStart, setBotMenuNotInService, DiscordBotStop,
    getStatus, sendTestMessage, testToken, sendAuthNotify, getAppIdFromToken,
};
