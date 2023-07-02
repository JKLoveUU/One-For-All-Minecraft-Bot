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
const pathfinder = require(`../lib/pathfinder`);
const schematic = require(`../lib/schematic`);
const { dirxml, count } = require('console');
const { astarfly } = require('../lib/pathfinder');
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
let build_cache = {
    hash: "",   //file path and location
    server: -1,
    totalBlocks: -1,
    startTime: Date.now(),
    endTime: Date.now(),
    interruptedBefore: 0,
    counter: -1,
}
/**
 * Build Config should be like following
 */
/*
    {
        "schematic": {
            "folder": "path"
            "filename": "0603-6X9-2/0603-6X9-2_0_0.nbt",
            "placementPoint_x": -7104,
            "placementPoint_y": 100,
            "placementPoint_z": -6977
        },
        "materialsMode": "station",
        "station": "mpStation_JK.json",
        "wms": "",
    }
*/
const litematicPrinter = { // 就是該少個a
    model_mapart: 'mapart',
    model_redstone: 'redstone',
    model_building: 'building',
    build_file: async function(task,bot,model,cfg){
        if (!fs.existsSync(cfg.schematic.folder+cfg.schematic.filename)) {
            await taskreply(task,
                `&7[&bMP&7] &c未發現投影 &7${cfg.schematic.filename} &r請檢查設定`,
                `未發現投影 ${cfg.schematic.filename} 請檢查設定`,
                null,
            );
            return;
        }
        //check file exist here
        switch (model) {
            case this.model_mapart:
                await model_mapart_build(task,bot,cfg);
                break;
            default:
                console.log(`Unsupport Model: ${model}`)
                break;
        }
    },
    progress_query: async function(task,bot){
        console.log(build_cache)
        return build_cache
    }
}
/**
 * This model build mapart, order by material and ignore Properties(state)
 * @param {*} task 
 * @param {*} bot 
 * @param {*} filename 
 * @param {*} restock_type 
 * @param {*} restock_config 
 */
async function model_mapart_build(task,bot,cfg){
    const Item = require('prismarine-item')(bot.version)
    //console.log(filename,restock_type,restock_config);
    //await sleep(5000)
    console.log(cfg)
    let crt_cfg_hash = await hash_cfg(cfg.schematic)
    if (!fs.existsSync(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)) {
        save_cache(cfg.bot_id,build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)
    }
    let targetSch = await schematic.loadFromFile(cfg.schematic.folder+cfg.schematic.filename)
    console.log(build_cache)
    console.log(crt_cfg_hash)
    console.log(targetSch)
    if(build_cache.hash != crt_cfg_hash){
        build_cache.hash = crt_cfg_hash
        build_cache.server = bot.botinfo.server
        build_cache.placedBlock = 0
        build_cache.totalBlocks =  targetSch.Metadata.totalBlocks
        build_cache.startTime = Date.now()
        build_cache.endTime = -1
        build_cache.useTime = -1
        build_cache.vecTest = new Vec3(1,1,1)
        // interruptedBefore: 0,
        // counter: -1,
    }else{
        console.log("檢測到快取")
        console.log(`上次建造時間 ${build_cache.startTime}`)
        console.log(build_cache.vecTest.offset(1,1,1))
    }
    // replace the material here

    // check station or wms support material

    //build
    save_cache(cfg.bot_id,build_cache)
    //console.log(targetSch)
}
async function hash_cfg(cfg) {
    const str = JSON.stringify(cfg);
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    //console.log(`${hash}`);
    return hash
}
async function save_cache(bot_id,cache) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/build_cache.json`, JSON.stringify(cache, null, '\t'), function (err, result) {
        if (err) console.log('build_cache save error', err);
    });
    //console.log('task complete')
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
module.exports = litematicPrinter 
