const process = require('process');
const fs = require('fs');
const fsp = require('fs').promises
const crypto = require('crypto');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3')
const v = require('vec3')
const sd = require('silly-datetime');
const nbt = require('prismarine-nbt')
const promisify = f => (...args) => new Promise((resolve, reject) => f(...args, (err, res) => err ? reject(err) : resolve(res)))
const parseNbt = promisify(nbt.parse);
const pTimeout = require('p-timeout');
const containerOperation = require(`../lib/containerOperation`);
const mcFallout = require(`../lib/mcFallout`);
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
var whetherPause = false, stop = false;
let logger,mcData,bot_id,bot
let build_cache = {
    hash: "",
    server: -1,
    totalBlocks: -1,
    startTime: Date.now(),
    endTime: Date.now(),
    interruptedBefore: 0,
}
let mapart_cfg = {
    "schematic": {
        filename: "example_0_0.nbt",
        placementPoint_x: 0,
        placementPoint_y: 100,
        placementPoint_z: 0,
    },
    "materialsMode": "station",
    "station": "mpStation_Example.json",

}
let mapart_global_cfg = {
    "schematic_folder": "C:/Users/User/AppData/Roaming/.minecraft/schematics/",
    "dc_webhookToken": "",
    "dc_webhookId": "",
    replaceMaterials: []
}
const mapart = {
    identifier: [
        "mapart",
        "mp"
    ],
    cmd: [
        {
            name: "hash test",
            identifier: [
                "hash",
            ],
            execute: get_hash_cfg,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "toggle debug mode",
            identifier: [
                "debug",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 設定",
            identifier: [
                "set",
            ],
            execute: mp_set,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 查詢設定",
            identifier: [
                "info",
                "i",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造",
            identifier: [
                "build",
                "b",
            ],
            execute: mp_build,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-暫停",
            identifier: [
                "pause",
                "p",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-繼續",
            identifier: [
                "resume",
                "r",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {
            name: "地圖畫 建造-中止",
            identifier: [
                "stop",
                "s",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
    ],
    async init(bott, user_id, lg) {
        logger = lg
        bot_id = user_id;
        bot = bott
        mcData = require('minecraft-data')(bot.version)
        //mapart.json
        if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart.json`)) {
            logger(true, 'INFO', `Creating config - mapart.json`)
            save(mapart_cfg)
        } else {
            mapart_cfg = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`)
        }
        //mapart.json (global)
        if (!fs.existsSync(`${process.cwd()}/config/global/mapart.json`)) {
            logger(true, 'INFO', `Creating global config - mapart.json`)
            await fsp.writeFile(`${process.cwd()}/config/global/mapart.json`, JSON.stringify(mapart_global_cfg, null, '\t'), function (err, result) {
                if (err) console.log('mapart save error', err);
            });
        } else {
            mapart_global_cfg = await readConfig(`${process.cwd()}/config/global/mapart.json`)
        }
    }
}
async function mp_set(task) {
    let mapart_set_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    if (!fs.existsSync(mapart_global_cfg.schematic_folder + task.content[2])) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請重新輸入`,
            `未發現投影 ${task.content[2]} 請重新輸入`,
            null,
        );
        return;
    }
    mapart_set_cache.schematic.filename = task.content[2]
    mapart_set_cache.schematic.placementPoint_x = parseInt(task.content[3])
    mapart_set_cache.schematic.placementPoint_y = parseInt(task.content[4])
    mapart_set_cache.schematic.placementPoint_z = parseInt(task.content[5])
    if (Math.abs(mapart_set_cache.schematic.placementPoint_x + 64) % 128 != 0) {
        await taskreply(task,
            `&7[&bMP&7] &cX座標可能錯了`,
            `X座標可能錯了`,
            null,
        );
        return;
    }
    try {
        await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart.json`, JSON.stringify(mapart_set_cache, null, '\t'));
    } catch (e) {
        await taskreply(task,
            `&7[&bMP&7] &c設置失敗`,
            `設置失敗 ${e}`,
            null,
        );
        return
    }
    mapart_cfg = mapart_set_cache;
    await taskreply(task,
        `&7[&bMP&7] &a設置成功`,
        `設置成功`,
        null,
    );
}
async function mp_build(task) {
    const Item = require('prismarine-item')(bot.version)
    let mapart_build_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig;
    let materialsMode = mapart_build_cache.materialsMode;
    if(materialsMode=='station'){
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_build_cache.station}`);
    }else{
        await notImplemented(task)
        return
    }
    if (!fs.existsSync(mapart_global_cfg.schematic_folder +  mapart_build_cache.schematic.filename)) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請重新輸入`,
            `未發現投影 ${task.content[2]} 請重新輸入`,
            null,
        );
        return;
    }
    console.log("build test")
    //get cache here
    let currentMPCFG_Hash = get_hash_cfg(mapart_build_cache.schematic);
    if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
        save_cache(build_cache)
    }else{
        build_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    }
    console.log(`hash\n${build_cache.hash}\n${currentMPCFG_Hash}`)
    if(build_cache.hash != currentMPCFG_Hash){
        //重新蓋
    }
    //繼續蓋
}
async function save(caec) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('mapart save error', err);
    });
    //console.log('task complete')
}
async function save_cache(mp_cache) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart_cache.json`, JSON.stringify(mp_cache, null, '\t'), function (err, result) {
        if (err) console.log('mp_cache save error', err);
    });
    //console.log('task complete')
}
async function get_hash_cfg(mapart_cfg) {
    const str = JSON.stringify(mapart_cfg);
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    //console.log(`${hash}`);
    return hash
}
async function taskreply(task, mc_msg, console_msg, discord_msg) {
    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} ${mc_msg}`);
            break;
        case 'console':
            console.log(console_msg)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented ${discord_msg}`);
            break;
        default:
            break;
    }
}
async function notImplemented(task) {
    taskreply(task, "Not Implemented", "Not Implemented", "Not Implemented")
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
module.exports = mapart