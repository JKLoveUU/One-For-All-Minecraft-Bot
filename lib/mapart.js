const fs = require('fs');
const fsp = require('fs').promises
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
let mcData
let bot_id
let mapart_cfg = {
 
}
const mapart = {
    identifier: [
        "mapart",
        "mp"
    ],
    parse(raw_args) {
        let args = raw_args.slice(1, raw_args.length);
        switch (args[0]) {
            case "debug":
                return {
                    name: "toggle debug mode",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "test":
                return {
                    name: "地圖畫 test",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "set":
                return {
                    name: "地圖畫 設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "info":
            case "i":
                return {
                    name: "地圖畫 查詢設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "build":
            case "b":
                return {
                    name: "地圖畫 建造",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "pause":
            case "p":
                return {
                    name: "地圖畫 建造-暫停",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "resume":
            case "r":
                return {
                    name: "地圖畫 建造-繼續",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "stop":
            case "s":
                return {
                    name: "地圖畫 建造-中止",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case undefined:
                return {
                    vaild: false,
                }
            default:
                return {
                    vaild: false,
                }
        }
    },
    async execute(bot, task) {
        let args = task.content.slice(1, task.content.length);
        switch (args[0]) {
            case "test":
                try {
                    while (1) {
                        if (task.source == 'console') task.console(false, 'INFO', "模擬執行中")
                        console.log("模擬執行中")
                        await sleep(1000)
                    }
                    //exe task
                } catch (error) {
                    console.log(error)
                    console.log("task執行錯誤")
                }
                break;
            case "debug":
            case "set":
            case "info":
            case "i":
            case "build":
            case "b":
            case "pause":
            case "p":
            case "resume":
            case "r":
            case "stop":
            case "s":
            case undefined:
            default:
                console.log("Mapart - not implemented")
        }
    },
    async init(bot, user_id, lg) {
        logger = lg
        bot_id = user_id;
        mcData = require('minecraft-data')(bot.version)
        if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart.json`)) {
            logger(true, 'INFO', `Creating config - mapart.json`)
            save(mapart_cfg)
        } else {
            mapart_cfg = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`)
        }
    }
}
async function save(caec) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('mapart save error', err);
    });
    //console.log('task complete')
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
module.exports = mapart