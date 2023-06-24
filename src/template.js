const process = require('process');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const fs = require('fs');
const fsp = require('fs').promises
let logger,mcData,bot_id,bot
let build_cache = {
    hash: "",
    server: -1,
    totalBlocks: -1,
    startTime: Date.now(),
    endTime: Date.now(),
    interruptedBefore: 0,
    counter: -1,
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
const template = {
    identifier: [
        "template",
    ],
    cmd: [
        {
            name: "template TEST",
            identifier: [
                "test",
            ],
            execute: test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        }
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
async function test(task) {
    await notImplemented()
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
module.exports = template