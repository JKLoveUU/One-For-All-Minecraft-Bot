const fs = require("fs");
const fsp = require('fs').promises
const sd = require('silly-datetime');
const containerOperation = require(`../lib/containerOperation`);
const { Vec3 } = require('vec3')
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
let logger
let mcData
let craftAndExchange_cfg = {
    "updateTime": sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'),
    "command_interval_tick": 35,
    "crafting_table": [0, 0, 0],
    "example": [[0, 0, 0], 'id', "name"],
    "input_1": [[0, 0, 0], 0, "air"],
    "output_1": [[0, 0, 0], 0, "air"],
}
let bot_id
const craftAndExchange = {
    identifier: [
        "ce",
        "craft",
        "exchange"
    ],
    parse(raw_args) {
        let args = raw_args.slice(1, raw_args.length);
        switch (args[0]) {
            case "auto":
            case "a":
                return {
                    name: "合成兌換 自動設定",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "set":
                return {
                    name: "合成兌換 設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "info":
            case "i":
                return {
                    name: "合成兌換 查詢設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "exchange":
            case "e":
                return {
                    name: "合成兌換 - 兌換",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "pause":
            case "p":
                return {
                    name: "合成兌換 建造-暫停",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "resume":
            case "r":
                return {
                    name: "合成兌換 建造-繼續",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "stop":
            case "s":
                return {
                    name: "合成兌換 建造-中止",
                    vaild: true,
                    longRunning: false,
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
            case "auto":
            case "a":
                await autoset(bot, task)
                break;
            case "set":
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} 暫不支援手動設定 請使用auto (a)`);
                        break;
                    case 'console':
                        console.log("暫不支援手動設定 請使用auto (a)")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }
                break
            case "info":
            case "i":
                let cfg_info_cache = await readConfig(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`);
                console.log(cfg_info_cache);
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} not implemented`);
                        break;
                    case 'console':
                        console.log("CraftAndExchange - not implemented")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }

                break;
            case "exchange":
            case "e":
            case "pause":
            case "p":
            case "resume":
            case "r":
            case "stop":
            case "s":
            case undefined:
            default:
                console.log("CraftAndExchange - not implemented")
        }
    },
    async init(bot, user_id, lg) {
        logger = lg
        bot_id = user_id;
        mcData = require('minecraft-data')(bot.version)
        if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`)) {
            logger(true, 'INFO', `Creating config - craftAndExchange.json`)
            save(craftAndExchange_cfg)
        } else {
            craftAndExchange_cfg = await readConfig(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`)
        }
    }
}
async function save(caec) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('craftAndExchange save error', err);
    });
    //console.log('task complete')
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
async function autoset(bot, task) {
    let cfg_autoset_cache = {
        "updateTime": sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'),
        "command_interval_tick": 35,
        "crafting_table": [0, 0, 0],
        "example": [[0, 0, 0], 'id', "name"],
        "input_1": [[0, 0, 0], 0, "air"],
        "output_1": [[0, 0, 0], 0, "air"],
    }
    let totalio = '';
    let IDIF = [];
    for (let mobstoattack in bot.entities) {
        //console.log(bot.entities[mobstoattack])
        if (bot.entities[mobstoattack].position.distanceTo(bot.entity.position) > 5) continue;
        if (bot.entities[mobstoattack].mobType === 'Glow Item Frame' || bot.entities[mobstoattack].mobType === 'Item Frame') {
            IDIF.push(bot.entities[mobstoattack]);
        }
        //break;
    }
    let input = 1, output = 1;
    for (iii in IDIF) {    //解析展示框
        let mode;
        let thisShuIs;
        let shulkerboxPos, comp = new Vec3(0, 0, 0);
        if (bot.blockAt(IDIF[iii].position.offset(-2, 0, 0)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x - 2, IDIF[iii].position.y, IDIF[iii].position.z]
            comp = IDIF[iii].position.offset(-4, 0, 0);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(2, 0, 0)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x + 2, IDIF[iii].position.y, IDIF[iii].position.z]
            comp = IDIF[iii].position.offset(4, 0, 0);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(0, 0, -2)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x, IDIF[iii].position.y, IDIF[iii].position.z - 2]
            comp = IDIF[iii].position.offset(0, 0, -4);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(0, 0, 2)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x, IDIF[iii].position.y, IDIF[iii].position.z + 2]
            comp = IDIF[iii].position.offset(0, 0, 4);
        }
        if (!shulkerboxPos) {
            //console.log("無法識別的展示框 x1");
            continue;
        }
        if (bot.blockAt(comp.offset(0, 1, 0)).name == 'dropper') {
            mode = 'input';
            thisShuIs = mode + '_' + input++;
        }
        else {
            mode = 'output';
            thisShuIs = mode + '_' + output++;
        }
        let itemmm = mcData.items[(IDIF[iii].metadata[8].itemId)]
        cfg_autoset_cache[thisShuIs] = [shulkerboxPos, IDIF[iii].metadata[8].itemId, itemmm.name];
        console.log(thisShuIs + " " + itemmm.name + " " + shulkerboxPos);
        totalio += '&7[&b' + thisShuIs + " &a" + itemmm.name + " &f" + shulkerboxPos + '&7] '
    }
    let crafting_table = bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id
    })
    try {
        cfg_autoset_cache.crafting_table = [crafting_table.position.x, crafting_table.position.y, crafting_table.position.z];
    } catch (e) {
        if (task.source === 'minecraft-dm') bot.chat(`/m ${task.minecraftUser} 找不到合成台`);
        return;
    }
    console.log(cfg_autoset_cache)
    fs.writeFile(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`, JSON.stringify(cfg_autoset_cache, null, '\t'), function (err, result) {
        if (err) console.log('error', err);
        else {
            switch (task.source) {
                case 'minecraft-dm':
                    bot.chat(`/m ${task.minecraftUser} 設置成功 ${totalio}`);
                    break;
                case 'console':
                    console.log(`/m ${task.minecraftUser} 設置成功 ${totalio}`)
                    break;
                case 'discord':
                default:
                    break;
            }
        }
    });
}
async function exchange(bot, task) {

}
module.exports = craftAndExchange