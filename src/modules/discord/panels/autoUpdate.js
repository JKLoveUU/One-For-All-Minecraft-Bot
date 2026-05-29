const state = require('../state');
const { logger } = require('../../../logger');
const { generateGeneralBotControlMenu } = require('../embeds/generalControl');

const _panelTimers = new Map(); // msgId -> { interval, timeout }
const REFRESH_MS = 3000;
const PANEL_TTL_MS = 3 * 60 * 1000;

function stopPanelAutoUpdate(msgId) {
    const t = _panelTimers.get(msgId);
    if (!t) return;
    clearInterval(t.interval);
    clearTimeout(t.timeout);
    _panelTimers.delete(msgId);
}

function stopAllPanelAutoUpdates() {
    for (const msgId of Array.from(_panelTimers.keys())) {
        stopPanelAutoUpdate(msgId);
    }
}

function startPanelAutoUpdateForMessage(msg, botName) {
    const msgId = msg.id;
    stopPanelAutoUpdate(msgId);
    const interval = setInterval(async () => {
        try {
            const data = state.botDataCache[botName];
            const bot  = state.botManager.getBotByName(botName);
            if (!bot || !bot.childProcess) { stopPanelAutoUpdate(msgId); return; }
            if (!data) return;
            const botinfo = {
                id: botName, name: data.name || botName,
                avatar: `https://mc-heads.net/avatar/${data.name || botName}/64`,
                server: data.server, coin: data.coin, balance: data.balance,
                position: data.position,
                tasks: Array.isArray(data.tasks) ? data.tasks : [],
                runingTask: data.runingTask, ping: data.ping, memory: data.memory,
            };
            await msg.edit(generateGeneralBotControlMenu(botinfo));
        } catch (err) {
            stopPanelAutoUpdate(msgId);
            logger(true, 'DEBUG', 'DISCORD', `panel auto-update stopped: ${err.message}`);
        }
    }, REFRESH_MS);
    const timeout = setTimeout(() => stopPanelAutoUpdate(msgId), PANEL_TTL_MS);
    _panelTimers.set(msgId, { interval, timeout });
}

async function startPanelAutoUpdate(interaction, botName) {
    try {
        const msg = await interaction.fetchReply();
        startPanelAutoUpdateForMessage(msg, botName);
    } catch (_) {}
}

module.exports = {
    startPanelAutoUpdate,
    startPanelAutoUpdateForMessage,
    stopPanelAutoUpdate,
    stopAllPanelAutoUpdates,
};
