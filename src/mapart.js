const fs = require('fs')
const fsp = require('fs').promises
const { sleep, readConfig, configPath, globalConfigPath, saveConfig } = require('../lib/common')
const { initModule, deepMergeDefaults } = require('../lib/commandModule')
const { mapartState, DEFAULT_MAPART_CFG, DEFAULT_GLOBAL_CFG } = require('../lib/mapart/core')
const { save } = require('../lib/mapart/utils')
const { mp_build, mp_test, mp_debug, mp_set, mp_info, mp_pause, mp_resume, mp_stop } = require('../lib/mapart/build')
const { mp_open, mp_name, mp_copy } = require('../lib/mapart/mapops')
const { mp_material, mp_file } = require('../lib/mapart/restock')
const { mp_wrap } = require('../lib/mapart/wrap')

const mapart = {
    identifier: [
        "mapart",
        "mp",
        "map"
    ],
    cmd: [
        {
            name: "test",
            identifier: ["test"],
            execute: mp_test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "toggle debug mode",
            identifier: ["debug"],
            execute: mp_debug,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 設定",
            identifier: ["set"],
            execute: mp_set,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 材料站生成",
            identifier: ["material", "m"],
            execute: mp_material,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 材料站導出",
            identifier: ["file", "f"],
            execute: mp_file,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 查詢設定",
            identifier: ["info", "i"],
            execute: mp_info,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造",
            identifier: ["build", "b"],
            execute: mp_build,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-暫停",
            identifier: ["pause", "p"],
            execute: mp_pause,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-繼續",
            identifier: ["resume", "r"],
            execute: mp_resume,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-中止",
            identifier: ["stop", "s"],
            execute: mp_stop,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 開圖",
            identifier: ["open", "o"],
            execute: mp_open,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 命名",
            identifier: ["name", "n"],
            execute: mp_name,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 複印",
            identifier: ["copy", "c"],
            execute: mp_copy,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 分裝",
            identifier: ["wrap", "w"],
            execute: mp_wrap,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
    ],
    async init(ctx) {
        const result = await initModule(ctx);
        mapartState.logger = result.logger;
        mapartState.bot_id = result.bot_id;
        mapartState.bot = result.bot;
        mapartState.mcData = result.mcData;
        // mapart config 需特殊錯誤處理 (gkill)，不走 initModule configs
        const { bot, bot_id, logger } = ctx;
        const botCfgPath = configPath(bot_id, 'mapart.json');
        if (!fs.existsSync(botCfgPath)) {
            logger(true, 'INFO', process.argv[2], `Creating config - mapart.json`);
            save(mapartState.mapart_cfg);
        } else {
            try {
                mapartState.mapart_cfg = await readConfig(botCfgPath);
                const addedKeys = deepMergeDefaults(mapartState.mapart_cfg, DEFAULT_MAPART_CFG);
                if (addedKeys.length > 0) {
                    logger(true, 'INFO', process.argv[2], `mapart.json: added missing keys: ${addedKeys.join(', ')}`);
                    await saveConfig(botCfgPath, mapartState.mapart_cfg);
                }
            } catch (e) {
                bot.logger(true, "ERROR", process.argv[2], `個別Bot地圖畫設定資訊載入失敗\nFilePath: ${botCfgPath}`);
                await sleep(1000);
                console.log("Please Check The Json Format");
                console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`);
                console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`);
                bot.gkill(202);
            }
        }
        const globalCfgPath = globalConfigPath('mapart.json');
        if (!fs.existsSync(globalCfgPath)) {
            logger(true, 'INFO', process.argv[2], `Creating global config - mapart.json`);
            await saveConfig(globalCfgPath, mapartState.mapart_global_cfg);
        } else {
            try {
                mapartState.mapart_global_cfg = await readConfig(globalCfgPath);
                const addedGlobalKeys = deepMergeDefaults(mapartState.mapart_global_cfg, DEFAULT_GLOBAL_CFG);
                if (addedGlobalKeys.length > 0) {
                    logger(true, 'INFO', process.argv[2], `global mapart.json: added missing keys: ${addedGlobalKeys.join(', ')}`);
                    await saveConfig(globalCfgPath, mapartState.mapart_global_cfg);
                }
            } catch (e) {
                bot.logger(true, "ERROR", process.argv[2], `全Bot地圖畫設定資訊載入失敗\nFilePath: ${globalCfgPath}`);
                await sleep(1000);
                console.log("Please Check The Json Format");
                console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`);
                console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`);
                bot.gkill(202);
            }
        }
    }
}
module.exports = mapart
