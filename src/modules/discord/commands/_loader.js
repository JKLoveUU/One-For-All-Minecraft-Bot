const fs = require('fs');
const path = require('path');
const { registerSlashCommand } = require('../registry');
const { logger } = require('../../../logger');

function loadCommands() {
    const dir = __dirname;
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.js') && !f.startsWith('_'));
    const loaded = [];
    for (const file of files) {
        try {
            const cmd = require(path.join(dir, file));
            if (!cmd || !cmd.data || typeof cmd.execute !== 'function') {
                logger(true, 'WARN', 'DISCORD', `commands/${file} is not a valid slash command — skipped`);
                continue;
            }
            registerSlashCommand(cmd);
            loaded.push(cmd.data.name);
        } catch (err) {
            logger(true, 'ERROR', 'DISCORD', `failed to load commands/${file}: ${err.message}`);
        }
    }
    logger(true, 'INFO', 'DISCORD', `Loaded ${loaded.length} slash commands: ${loaded.join(', ') || '(none)'}`);
    return loaded;
}

module.exports = { loadCommands };
