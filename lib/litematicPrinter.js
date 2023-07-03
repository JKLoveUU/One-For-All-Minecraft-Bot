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
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
let pause = false , stop = false;
let build_cache = {
    hash: "",   //file path and location
   // server: -1,
   // totalBlocks: -1,
   // startTime: Date.now(),
   // endTime: Date.now(),
   // interruptedBefore: 0,
   // counter: -1,
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
    },
    pause: function(p = true){
        pause = p;
    },
    resume: function(){
        pause = false;
    },
    stop: function(task){
        stop = true;
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
    const mcData = require('minecraft-data')(bot.version)
    //console.log(filename,restock_type,restock_config);
    //await sleep(5000)
    //console.log(cfg)
    let crt_cfg_hash = await hash_cfg(cfg.schematic)
    if (!fs.existsSync(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)) {
        save_cache(cfg.bot_id,build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)
    }
    let stationConfig
    let wmsConfig
    if(cfg.materialsMode=='station'){
        stationConfig = await readConfig(`${process.cwd()}/config/global/${cfg.station}`);
    }

    let targetSch = await schematic.loadFromFile(cfg.schematic.folder+cfg.schematic.filename)
    //console.log(build_cache)
    //console.log(crt_cfg_hash)
    //console.log(targetSch)
    if(true||build_cache.hash != crt_cfg_hash){
        build_cache.hash = crt_cfg_hash
        build_cache.server = bot.botinfo.server
        build_cache.placedBlock = 0
        build_cache.totalBlocks =  targetSch.Metadata.totalBlocks
        build_cache.currentPalette = 0
        build_cache.startTime = Date.now()
        build_cache.endTime = -1
        build_cache.useTime = -1
        build_cache.origin = new Vec3(0, 0, 0);
		build_cache.destination = build_cache.origin.plus(targetSch.Metadata.enclosingSize).offset(-1,-1,-1);
        build_cache.placement_origin = new Vec3(cfg.schematic.placementPoint_x,cfg.schematic.placementPoint_y,cfg.schematic.placementPoint_z)
        build_cache.placement_destination = build_cache.placement_origin.plus(build_cache.destination)
        // interruptedBefore: 0,
        // counter: -1,
    }else{
        console.log("檢測到快取")
        console.log(`上次建造時間 ${build_cache.startTime}`)
        build_cache.origin = v(build_cache.origin)
        build_cache.destination = v(build_cache.destination)
        build_cache.placement_origin = v(build_cache.placement_origin)
        build_cache.placement_destination = v(build_cache.placement_destination)
        //console.log(build_cache.vecTest.offset(1,1,1))
    }
    targetSch.toMineflayerID()
    // replace the material here
    for(const i in cfg.replaceMaterials){
        targetSch.changeMaterial(cfg.replaceMaterials[i][0],cfg.replaceMaterials[i][1])
    }
    // check station or wms support material
    if(cfg.materialsMode=='station'){
        let stationSupportMaterital = ['air']
        let stationNotSupports = []
        for(const i in stationConfig.materials){
            stationSupportMaterital.push(stationConfig.materials[i][0])
        }
        //console.log(stationSupportMaterital)
        for(const i in targetSch.palette){
            if(!stationSupportMaterital.includes(targetSch.palette[i].Name)){
                stationNotSupports.push(targetSch.palette[i].Name)
            }
        }
        if(stationNotSupports.length!=0){
            console.log(`發現未支援的材料`,stationNotSupports)
            throw new Error("Not Support Materials:",stationNotSupports)
        }
    }else if(false){    //wms

    }
    let sch_palette_order = []
    let cobblestoneIndex = []
    for(const i in targetSch.palette){
        //if(i==0) continue //(ignore air)
        sch_palette_order.push(i)
        if(targetSch.palette[i].Name == 'cobblestone'){
            cobblestoneIndex.push(i)
        }
    }
    for(let i = cobblestoneIndex.length -1;i>=0;i--){
        let temp = sch_palette_order.splice(cobblestoneIndex[i], 1);
        sch_palette_order.push(temp)
    }

    // console.log(cfg)
    // console.log(stationConfig)
    await save_cache(cfg.bot_id,build_cache)
    //console.log(targetSch)
    //build
    let wheatherGetPalette= false;
    let IgnoreAirArray = []; //fast array
    let Block_In_CD = [];
    let currentPaletteBlocksIndexs = [] //
    let currentPaletteBlocksState = [] // [0 從未去過 ][1 已完成];
    let currentPaletteName;
    let currentPaletteProperties;
    let selectBlockIndex  = 0;    // currentPaletteBlocksIndexs 的
    for(let i = 0;i<targetSch.Metadata.totalVolume;i++){
        await wait()
        //console.log(targetSch.getBlockByIndex(i))
        if(targetSch.getBlockPIDByIndex(i)!=0){
            //console.log(targetSch.getBlockByIndex(i))
            IgnoreAirArray.push(i)
        }
    }
    bot._client.write("abilities", { flags: 6, flyingSpeed: 4.0, walkingSpeed: 4.0 })
	await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot.setQuickBarSlot(8);
    //console.log(build_cache.currentPalette,targetSch.palette.length)
    bot.on('blockUpdate', updateVisited);
    mapartBuild: while(build_cache.currentPalette < targetSch.palette.length) {
        if(stop) return
        if(pause){
            await sleep(500);
			continue;
        }
        if(!wheatherGetPalette){
            Block_In_CD = []
            currentPaletteBlocksIndexs = []
            currentPaletteBlocksState = []
            currentPaletteName = targetSch.palette[sch_palette_order[build_cache.currentPalette]].Name
            currentPaletteProperties = targetSch.palette[sch_palette_order[build_cache.currentPalette]].Properties
            console.log(`\x1b[32m當前材料:\x1b[0m ${currentPaletteName} ${build_cache.currentPalette + 1}/${targetSch.palette.length}`);
            if(currentPaletteName=='air'){
                build_cache.currentPalette++;
                continue
            }
            //let dbt= Date.now()
            // 這裡太花時間了
            for(let i = 0;i<IgnoreAirArray.length;i++){
                await wait()
                if(targetSch.getBlockPIDByIndex(IgnoreAirArray[i])==sch_palette_order[build_cache.currentPalette]){
                    //console.log(targetSch.getBlockByIndex(i))
                    currentPaletteBlocksIndexs.push(IgnoreAirArray[i])
                    currentPaletteBlocksState.push(0)
                }
            }
            selectBlockIndex  = 0;
            await save_cache(cfg.bot_id,build_cache)
           // console.log(Date.now()-dbt,'ms')
            wheatherGetPalette = true;
        }
        // check server, botPos etc..
        let currentBotPos = new Vec3(Math.round(bot.entity.position.x - 0.5), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z - 0.5));
        let currentMapartServer = bot.botinfo.server
        if (currentMapartServer > 0 && currentMapartServer != build_cache.server) {
            console.log(`分流錯誤 當前:${currentMapartServer} 預期:${build_cache.server}`)
            while (true) {
                //await sleep(100)
                if (bot.botinfo.server == build_cache.server) break;
                console.log(`嘗試切換分流 ${bot.botinfo.server} -> ${build_cache.server}`)
                bot.chat(`/ts ${build_cache.server}`);
                let checkChangeServer = await mcFallout.waitChangeServer(bot, 15000);
                if (checkChangeServer == 1) break;
                console.log(`切換失敗`);
            }
            console.log("分流矯正完成");
            continue
        }
        if (currentMapartServer > 0 && !pos_in_box(currentBotPos, build_cache.placement_origin.offset(-2, -100, -2), build_cache.placement_destination.offset(2, 100, 2))) {
            console.log("座標不再投影內");
            console.log(`當前座標 ${currentBotPos}`)
            console.log(`預期座標 ${build_cache.placement_origin.offset(-2, -100, -2)}`)
            console.log(`預期座標 ${build_cache.placement_destination.offset(2, 100, 2)}`)
            bot.chat(`/homes mapart`);
            await sleep(5000);
            console.log("座標矯正完成");
            continue
        }
        if (bot.blockAt(currentBotPos) == null) {
            console.log("lag中 等待加載腳下附近方塊");
            await sleep(100);
            continue
        }
        console.log(currentPaletteBlocksIndexs)
        //checkStatehere
        console.log(currentPaletteBlocksIndexs[selectBlockIndex])
        let selectBlockRelativePos = targetSch.vec3(currentPaletteBlocksIndexs[selectBlockIndex])
        let selectBlockAbsolutePos = build_cache.placement_origin.plus(selectBlockRelativePos)
        let selectBlockBotStandPos = selectBlockAbsolutePos.offset(0, 2, 0)
        console.log(selectBlockRelativePos)
        console.log(selectBlockAbsolutePos)
        console.log(selectBlockBotStandPos)
        await pathfinder.astarfly(bot, selectBlockBotStandPos, null, null, null, false);    // mute =>true
        if (bot.blockAt(selectBlockBotStandPos) == null) {
            console.log("lag中 等待加載目標方塊附近方塊");
            await sleep(100);
            continue
        }
        /*origin
        -4 4
        -4 4
        6 -2
        */
        for (let cP_dz = -4; cP_dz <= 4; cP_dz++) {//連同身邊符合的block 一起蓋 同時設定visit
            for (let cP_dx = -4; cP_dx <= 4; cP_dx++) {			//#修改 #EXP
                for (let cP_dy = 4; cP_dy >= -1; cP_dy--) {

                    if (pause || stop) {
                        continue mapartBuild;
                    }
                    if (bot.entity.position.distanceTo(selectBlockBotStandPos) > 2) {
                        continue mapartBuild;
                    }
                    let currentPosPlace_d = selectBlockAbsolutePos.offset(cP_dx, cP_dy, cP_dz);
                    if (!pos_in_box(currentPosPlace_d, build_cache.placement_origin, build_cache.placement_destination)) continue;
                    let currentPosPlace_d_Index = targetSch.getBlockPID(currentPosPlace_d)
                    console.log(currentPosPlace_d_Index)
                    if (currentPosPlace_d_Index == -1) continue; // ???
                    // if(Notfinish||NotInCD){
                    //     check not null again
                    //     check no block occupy the pos
                    //     check not finish
                    // }
                    // real build
                    // let checkMaterial = bot.heldItem;
                    // if (checkMaterial == null || checkMaterial.name != currentPaletteName) {
                    // etc..
                    // }
                    continue
                }
            }
        }
        // FIND NEXT

        //console.log(targetSch.palette[sch_palette_order[build_cache.currentPalette]])
        wheatherGetPalette=false
        build_cache.currentPalette++;
    }
    bot.off('blockUpdate', updateVisited);
    await save_cache(cfg.bot_id,build_cache)
    function updateVisited(oldBlock, newBlock) {
        return
        updatePos = newBlock.position;
        //console.log(updatePos);
        //檢查是否在投影區域內
        if (!pos_in_box(updatePos, placement_origin, placement_end)) return;
        updatePos = updatePos.minus(placement_origin);   //轉為原理圖內的
        let targetIndex = sch_blocksIndexMapping[pos_to_index(updatePos, sch_size)]
        if (targetIndex == -1) return;
        if (blocksFinish[targetIndex] == -1) return;
        if (currentPaletteName == newBlock.name && currentPaletteName == oldBlock.name) {
            blocksFinish[targetIndex] = -1;
            //console.log("放置認證"+updatePos);
        }
        else {
            //blocksvisit[targetIndex]=-2;    //error
            // console.log("偵測到錯誤的放置"+updatePos);
        }
    }
}
function pos_in_box(pos, start, end) {
	if (start.x > end.x) [start.x, end.x] = [end.x, start.x];
	if (start.y > end.y) [start.y, end.y] = [end.y, start.y];
	if (start.z > end.z) [start.z, end.z] = [end.z, start.z];
	if (pos.x < start.x || pos.y < start.y || pos.z < start.z) return false;
	if (pos.x > end.x || pos.y > end.y || pos.z > end.z) return false;
	return true;
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
