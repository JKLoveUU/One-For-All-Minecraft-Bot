const path = require('path');
const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();

const state = {
    client: null,
    botManager: null,
    startedAt: Date.now(),
    botMenuId: null,
    botDataCache: {},
    config: require(`${baseDir}/config.toml`),
};

module.exports = state;
