const fsp = require('fs').promises

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}

async function saveConfig(file, data) {
    await fsp.writeFile(file, JSON.stringify(data, null, '\t'));
}

function configPath(bot_id, filename) {
    return `${process.cwd()}/config/${bot_id}/${filename}`
}

function globalConfigPath(filename) {
    return `${process.cwd()}/config/global/${filename}`
}

let _mcDataCache = {}
function getMcData(version) {
    if (!_mcDataCache[version]) {
        _mcDataCache[version] = require('minecraft-data')(version)
    }
    return _mcDataCache[version]
}

module.exports = {
    sleep,
    readConfig,
    saveConfig,
    configPath,
    globalConfigPath,
    getMcData,
}
