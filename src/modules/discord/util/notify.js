const { Client, GatewayIntentBits, EmbedBuilder, Colors } = require('discord.js');
const state = require('../state');

function getStatus() {
    const { client, config } = state;
    let ping = null;
    try { if (client && client.ws && client.ws.ping >= 0) ping = client.ws.ping; } catch (_) {}
    let channelOk = false;
    try {
        if (client && client.readyAt && config.discord_setting.channelId) {
            channelOk = !!client.channels.cache.get(config.discord_setting.channelId);
        }
    } catch (_) {}
    return {
        activated:  !!config.discord_setting.activate,
        ready:      !!(client && client.readyAt),
        tag:        client && client.user ? client.user.tag : null,
        ping:       ping,
        readyAt:    client && client.readyAt ? client.readyAt.getTime() : null,
        channelId:  config.discord_setting.channelId || null,
        channelOk:  channelOk,
    };
}

async function sendTestMessage(text) {
    const { client, config } = state;
    if (!client || !client.readyAt) throw new Error('Discord client 尚未連線');
    if (!config.discord_setting.channelId) throw new Error('未設定 channelId');
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    if (!channel) throw new Error('Channel 不在 cache (id 錯誤或無存取權)');
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('發送逾時 (8s)')), 8000));
    return Promise.race([
        channel.send(text || `[OFA TUI] Test message at ${new Date().toLocaleString()}`),
        timeout,
    ]);
}

async function testToken(token) {
    if (!token) return { ok: false, error: 'token is empty' };
    const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    return new Promise((resolve) => {
        const cleanup = () => { try { testClient.destroy(); } catch (_) {} };
        const timeout = setTimeout(() => { cleanup(); resolve({ ok: false, error: 'login timeout (10s)' }); }, 10000);
        testClient.once('clientReady', () => {
            clearTimeout(timeout);
            const tag = testClient.user.tag;
            cleanup();
            resolve({ ok: true, tag });
        });
        testClient.login(token).catch((err) => {
            clearTimeout(timeout);
            cleanup();
            resolve({ ok: false, error: err.message });
        });
    });
}

function getAppIdFromToken(token) {
    try { return Buffer.from(token.split('.')[0], 'base64').toString(); } catch (_) { return null; }
}

async function sendAuthNotify(botName, userCode, verificationUri) {
    const { client, config } = state;
    if (!client || !client.readyAt) return;
    if (!config.discord_setting?.channelId) return;
    const channel = client.channels.cache.get(config.discord_setting.channelId);
    if (!channel) return;
    try {
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(Colors.Yellow)
                .setTitle('🔐 需要 Microsoft 授權')
                .setDescription(`Bot **${botName}** 首次登入，請在瀏覽器完成驗證`)
                .addFields(
                    { name: '授權網址', value: verificationUri },
                    { name: '代碼', value: `\`\`\`${userCode}\`\`\``, inline: true },
                    { name: '一鍵連結', value: `http://microsoft.com/link?otc=${userCode}` },
                )
            ]
        });
    } catch (_) {}
}

module.exports = { getStatus, sendTestMessage, testToken, getAppIdFromToken, sendAuthNotify };
