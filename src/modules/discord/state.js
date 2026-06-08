const { runtimeConfig } = require('../runtimeFiles');

const state = {
    client: null,
    botManager: null,
    startedAt: Date.now(),
    botMenuId: null,
    botDataCache: {},
    config: runtimeConfig,
};

module.exports = state;
