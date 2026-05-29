const crypto = require('crypto');
const { REST, Routes } = require('discord.js');
const state = require('./state');
const { logger } = require('../../logger');
const { slashCommands } = require('./registry');

function normalizeOption(o) {
    return {
        name: o.name,
        description: o.description,
        type: o.type,
        required: !!o.required,
        autocomplete: !!o.autocomplete,
        choices: (o.choices || []).map(c => ({ name: c.name, value: c.value })),
        options: (o.options || []).map(normalizeOption),
    };
}

function normalizeCommand(c) {
    return {
        name: c.name,
        description: c.description,
        type: c.type || 1,
        options: (c.options || []).map(normalizeOption),
    };
}

function hashCommands(arr) {
    const norm = arr.map(normalizeCommand).sort((a, b) => a.name.localeCompare(b.name));
    return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

function buildLocalPayload() {
    return Array.from(slashCommands.values()).map(c => c.data.toJSON());
}

function diagnoseDcDeployError(err) {
    const msg = String(err && err.message || '');
    if (/Missing Access/i.test(msg))
        return '→ 請確認 Bot 已加入該伺服器 (guildId 正確)，且邀請 Bot 時包含 applications.commands scope。';
    if (/Unknown Guild/i.test(msg))
        return '→ guildId 不存在或 Bot 尚未加入此伺服器。請確認 discord_setting.guildId 正確。';
    if (/401|Unauthorized/i.test(msg))
        return '→ token 無效或 token 與 appId 不匹配。請確認兩者屬於同一個 Bot。';
    return null;
}

async function deployIfChanged() {
    const cfg = state.config.discord_setting;
    if (!cfg.token || !cfg.appId) {
        logger(true, 'WARN', 'DISCORD', 'slash command deploy skipped: token or appId missing');
        return;
    }
    const scope = (cfg.slashCommandScope || 'guild').toLowerCase();
    let route;
    if (scope === 'global') {
        route = Routes.applicationCommands(cfg.appId);
    } else if (scope === 'guild') {
        if (!cfg.guildId) {
            logger(true, 'WARN', 'DISCORD', 'slash command deploy skipped: guildId missing for guild scope');
            return;
        }
        route = Routes.applicationGuildCommands(cfg.appId, cfg.guildId);
    } else {
        logger(true, 'WARN', 'DISCORD', `unknown slashCommandScope "${cfg.slashCommandScope}", expected "guild" or "global"`);
        return;
    }

    const local = buildLocalPayload();
    if (local.length === 0) {
        logger(true, 'INFO', 'DISCORD', 'no local slash commands to deploy');
    }

    const rest = new REST({ version: '10' }).setToken(cfg.token);
    let skipPut = false;
    try {
        const remote = await rest.get(route);
        if (Array.isArray(remote) && hashCommands(remote) === hashCommands(local)) {
            logger(true, 'INFO', 'DISCORD', `slash commands up-to-date (scope=${scope}, n=${local.length})`);
            skipPut = true;
        }
    } catch (err) {
        logger(true, 'WARN', 'DISCORD', `failed to fetch remote slash commands: ${err.message}; will PUT anyway`);
    }

    if (skipPut) return;

    try {
        await rest.put(route, { body: local });
        logger(true, 'INFO', 'DISCORD', `slash commands deployed (scope=${scope}, n=${local.length})`);
    } catch (err) {
        const hint = diagnoseDcDeployError(err);
        logger(true, 'ERROR', 'DISCORD', hint
            ? `slash commands deploy failed: ${err.message}\n${hint}`
            : `slash commands deploy failed: ${err.message}`);
    }
}

module.exports = { deployIfChanged };
