// 集中註冊 Discord 端的兩種處理器：
//   slashCommands     —— ChatInput command 名稱 → { data, execute, autocomplete, permissionRequire }
//   componentHandlers —— customId namespace → async (ctx) => void
//                       ctx = { interaction, ns, action, args }

const slashCommands = new Map();
const componentHandlers = new Map();

function registerSlashCommand(cmd) {
    if (!cmd || !cmd.data || typeof cmd.execute !== 'function') {
        throw new Error('Invalid slash command: missing data or execute()');
    }
    slashCommands.set(cmd.data.name, cmd);
}

function registerComponentHandler(ns, handler) {
    if (!ns || typeof handler !== 'function') {
        throw new Error('Invalid component handler');
    }
    componentHandlers.set(ns, handler);
}

module.exports = {
    slashCommands,
    componentHandlers,
    registerSlashCommand,
    registerComponentHandler,
};
