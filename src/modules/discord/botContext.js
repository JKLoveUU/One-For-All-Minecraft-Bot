const state = require('./state');
const Status = require('../botstatus');

const GENERAL_RUNNING = [
    Status.RUNNING, Status.IDLE, Status.RUNNING_TASK,
    Status.QUESTING, Status.QUEST_WAITING, Status.TASK_MAPART,
    Status.TASK_BUILD, Status.TASK_CLEAR_AREA, Status.TASK_WAREHOUSE,
    Status.TASK_VILLAGER, Status.TASK_FARM, Status.TASK_PAUSED,
];

// 從 interaction 取出目標 bot：先看 slash option `bot`，再退回 currentBot。
// 回傳 { botName, botIns, error? }；error 是給呼叫端決定怎麼回覆的人類訊息。
function resolveBot(interaction, { required = false } = {}) {
    const { botManager } = state;
    let botName = null;
    try {
        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            botName = interaction.options.getString('bot');
        }
    } catch (_) {}
    if (!botName && botManager.currentBot) {
        botName = botManager.currentBot.name;
    }
    if (!botName) {
        return { error: required ? 'Bot 未指定 (請帶 bot 參數)' : 'No bot selected' };
    }
    const botIns = botManager.getBotByName(botName);
    if (!botIns) {
        return { botName, error: `Bot \`${botName}\` not found` };
    }
    return { botName, botIns };
}

function isGeneralRunning(botIns) {
    return botIns && GENERAL_RUNNING.includes(botIns.status);
}

function isRaidRunning(botIns) {
    return botIns && botIns.status === Status.RAID_RUNNING;
}

// 給 autocomplete 用：依輸入字串過濾 bot 名稱，最多 25 項。
function autocompleteBots(query) {
    const { botManager } = state;
    if (!botManager) return [];
    const q = (query || '').toLowerCase();
    return botManager.bots
        .filter(b => b && b.name && b.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map(b => ({ name: b.name, value: b.name }));
}

module.exports = {
    GENERAL_RUNNING,
    resolveBot,
    isGeneralRunning,
    isRaidRunning,
    autocompleteBots,
};
