const fs = require('fs');
const { readConfig, saveConfig, configPath, globalConfigPath, getMcData } = require('./common');

function deepMergeDefaults(target, defaults) {
    const added = [];
    function merge(t, d, path) {
        for (const key of Object.keys(d)) {
            const fullPath = path ? `${path}.${key}` : key;
            if (!(key in t)) {
                t[key] = structuredClone(d[key]);
                added.push(fullPath);
            } else if (
                d[key] !== null && typeof d[key] === 'object' && !Array.isArray(d[key]) &&
                t[key] !== null && typeof t[key] === 'object' && !Array.isArray(t[key])
            ) {
                merge(t[key], d[key], fullPath);
            }
        }
    }
    merge(target, defaults, '');
    return added;
}

/**
 * @param {object} ctx - { bot, bot_id, logger }
 * @param {Array<{key: string, filename: string, scope: 'bot'|'global', default: object}>} configs
 * @returns {Promise<{logger: Function, mcData: object, bot_id: string, bot: object, configs: object}>}
 */
async function initModule(ctx, configs = []) {
    const { bot, bot_id, logger } = ctx;
    const mcData = getMcData(bot.version);
    const loaded = {};

    for (const cfg of configs) {
        const filePath = cfg.scope === 'global'
            ? globalConfigPath(cfg.filename)
            : configPath(bot_id, cfg.filename);

        if (!fs.existsSync(filePath)) {
            logger(true, 'INFO', process.argv[2], `Creating ${cfg.scope === 'global' ? 'global ' : ''}config - ${cfg.filename}`);
            await saveConfig(filePath, cfg.default);
            loaded[cfg.key] = structuredClone(cfg.default);
        } else {
            loaded[cfg.key] = await readConfig(filePath);
            const addedKeys = deepMergeDefaults(loaded[cfg.key], cfg.default);
            if (addedKeys.length > 0) {
                logger(true, 'INFO', process.argv[2],
                    `Config ${cfg.filename}: added missing keys: ${addedKeys.join(', ')}`);
                await saveConfig(filePath, loaded[cfg.key]);
            }
        }
    }

    return { logger, mcData, bot_id, bot, configs: loaded };
}

function saveModuleConfig(bot_id, filename, data) {
    return saveConfig(configPath(bot_id, filename), data);
}

function saveGlobalConfig(filename, data) {
    return saveConfig(globalConfigPath(filename), data);
}

function taskreply(bot, task, mc_msg, console_msg, discord_msg) {
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} ${mc_msg}`);
            break;
        case 'console':
            console.log(console_msg);
            break;
        case 'discord':
            console.log(`Discord Reply not implemented ${discord_msg}`);
            break;
    }
}

module.exports = { initModule, saveModuleConfig, saveGlobalConfig, taskreply, deepMergeDefaults };
