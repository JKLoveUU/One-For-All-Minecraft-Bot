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
const station = require(`../lib/station`);
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
var Item
var mcData
let pause = false, stop = false;
let BLOCK_EXCLUDE_LIST = [
    "air",
    "cave_air"
]
let BLOCK_EQUIVALENT_LIST = {
    "空氣": ["air", "water","brown_mushroom",],
    "土": ["grass_block", "dirt", "mycelium"],
    "test": ["quartz_pillar", "cobblestone"],
    "竹子": ["bamboo", "bamboo_sapling"]
}
let BLOCK_SKIP_LIST = [
    "red_mushroom","spore_blossom","amethyst_cluster","medium_amethyst_bud","large_amethyst_bud","twisting_vines"
]
const build_check_cooldown = 2000
const building_check_cooldown = 5000
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
    build_file: async function (task, bot, model, cfg) {
        if (!fs.existsSync(cfg.schematic.folder + cfg.schematic.filename)) {
            console.log(`&7[&LP&7] &c未發現投影 &7${cfg.schematic.filename} &r請檢查設定`)
            return;
        }
        //check file exist here
        let rs;
        switch (model) {
            case this.model_mapart:
                rs = await model_mapart_build(task, bot, cfg);
                break;
            case this.model_building:
                rs = await model_building_build(task, bot, cfg);
                break;
            case this.model_redstone:
                rs = await model_redstone_build(task, bot, cfg);
                break;
            default:
                console.log(`Unsupport Model: ${model}`)
                break;
        }
        return rs
    },
    build_project: async function (task, bot, model, cfg, project) {
        let rs;
        switch (model) {
            case this.model_mapart:
                rs = await model_mapart_build(task, bot, cfg, project);
                break;
            case this.model_building:
                rs = await model_building_build(task, bot, cfg, project);
                break;
            case this.model_redstone:
                rs = await model_redstone_build(task, bot, cfg, project);
                break;
            default:
                console.log(`Unsupport Model: ${model}`)
                break;
        }
        return rs
    },
    progress_query: async function (task, bot) {
        //console.log(build_cache)
        return build_cache
    },
    pause: function (p = true) {
        pause = p;
    },
    resume: function () {
        pause = false;
    },
    stop: function (task) {
        stop = true;
    }
}
/**
 * This model build mapart, order by material and ignore Properties(state)
 * @param {*} task 
 * @param {*} bot 
 * @param {*} cfg 
 */
async function model_mapart_build(task, bot, cfg, project) {
    Item = require('prismarine-item')(bot.version)
    mcData = require('minecraft-data')(bot.version)
    const needFirstBuildList = ['air', 'cobblestone', 'glass']
    let debug_enable = bot.debugMode
    let crt_cfg_hash = await hash_cfg(cfg.schematic)
    if (!fs.existsSync(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)) {
        await save_cache(cfg.bot_id, build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)
    }
    let stationConfig
    let wmsConfig
    if (cfg.materialsMode == 'station') {
        bot.logger(true,"INFO",`加載材料站資訊...`)
        try{
            stationConfig = await readConfig(`${process.cwd()}/config/global/${cfg.station}`);
        }catch(e){
            bot.logger(true,"ERROR",`材料站設定檔讀取失敗\nFilePath: ${process.cwd()}/config/global/${cfg.station}`)
            await sleep(1000)
            console.log("Please Check The Json Format")
            console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`)
            console.log("You can visit following websites the fix: ")
            console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`)
            console.log(`\x1b[33mhttps://www.google.com/search?q=${(e.message).replaceAll(" ","+")}\x1b[0m`)
            bot.gkill(202)
        }
        bot.logger(true,"INFO",`材料站 ${stationConfig.stationName} 加載成功`)
    }
    let targetSch 
    if(project){
        targetSch = project
    }else{
        targetSch= await schematic.loadFromFile(cfg.schematic.folder + cfg.schematic.filename)
    }
    if (build_cache.hash != crt_cfg_hash) {
        build_cache.hash = crt_cfg_hash
        let useServer = cfg.server ? cfg.server : bot.botinfo.server
        build_cache.server = useServer
        build_cache.placedBlock = 0     //應該不太準確 還需要再修改
        build_cache.totalBlocks = targetSch.Metadata.TotalBlocks
        build_cache.currentPalette = 0
        build_cache.startTime = Date.now()
        build_cache.endTime = -1
        build_cache.useTime = -1
        build_cache.origin = new Vec3(0, 0, 0);
        build_cache.destination = build_cache.origin.plus(targetSch.Metadata.EnclosingSize).offset(-1, -1, -1);
        build_cache.placement_origin = new Vec3(cfg.schematic.placementPoint_x, cfg.schematic.placementPoint_y, cfg.schematic.placementPoint_z)
        build_cache.placement_destination = build_cache.placement_origin.plus(build_cache.destination)
        build_cache.debug = {
            discconnectCount: 0,
            findNextTotalCounter: 0,
            restock_count: 0,
            restock_takeTime: 0, // ms
            placeCount: 0,
            temp: 0,
        }
        // interruptedBefore: 0,
        // counter: -1,
    } else {
        console.log("檢測到快取")
        console.log(`上次建造時間 ${build_cache.startTime}`)
        build_cache.debug.discconnectCount++;
        build_cache.origin = v(build_cache.origin)
        build_cache.destination = v(build_cache.destination)
        build_cache.placement_origin = v(build_cache.placement_origin)
        build_cache.placement_destination = v(build_cache.placement_destination)
        //console.log(build_cache.vecTest.offset(1,1,1))
    }
    if (build_cache.endTime != -1) {
        return  'finish'    // already build
    }
    bot.logger(true,"INFO",`開始建造 ${targetSch.Metadata.Name}`)
    targetSch.toMineflayerID()
    // replace the material here
    for (const i in cfg.replaceMaterials) {
        targetSch.changeMaterial(cfg.replaceMaterials[i][0], cfg.replaceMaterials[i][1])
    }
    let materialListForSch = Array(targetSch.palette.length).fill(0);
    // check station or wms support material
    if (cfg.materialsMode == 'station') {
        let stationSupportMaterital = ['air']
        let stationNotSupports = []
        for (const i in stationConfig.materials) {
            stationSupportMaterital.push(stationConfig.materials[i][0])
        }
        //console.log(stationSupportMaterital)
        for (const i in targetSch.palette) {
            if (!stationSupportMaterital.includes(targetSch.palette[i].Name)) {
                stationNotSupports.push(targetSch.palette[i].Name)
            }
        }
        if (stationNotSupports.length != 0) {
            console.log(`發現未支援的材料`, stationNotSupports)
            throw new Error("Not Support Materials:", stationNotSupports)
        }
    } else if (false) {    //wms

    }
    let sch_palette_order = []
    let cobblestoneIndex = []
    for (const i in targetSch.palette) {
        //if(i==0) continue //(ignore air)
        sch_palette_order.push(i)
        if (needFirstBuildList.includes(targetSch.palette[i].Name)) {
            cobblestoneIndex.push(i)
        }
    }
    let f_tmp = []
    for (let i = cobblestoneIndex.length - 1; i >= 0; i--) {
        let temp = sch_palette_order.splice(cobblestoneIndex[i], 1);
        f_tmp.push(temp[0])
        //sch_palette_order.unshift(temp[0])
    }
    for (let i = 0; i < f_tmp.length; i++) {
        sch_palette_order.unshift(f_tmp[i])
    }
    // for (const  i in sch_palette_order) {
    //     console.log(sch_palette_order[i],targetSch.palette[sch_palette_order[i]].Name)
    // }
    //console.log(targetSch.palette)
    //console.log(sch_palette_order)
    //return
    // console.log(cfg)
    // console.log(stationConfig)
    await save_cache(cfg.bot_id, build_cache)
    //console.log(targetSch)
    //build
    let wheatherGetPalette = false;
    let IgnoreAirArray = []; //fast array
    let Block_In_CD = [];    //用  currentPaletteBlocksIndexs 之 index
    let removeTimerID = []
    let currentPaletteBlocksIndexs = [] //
    let currentPaletteBlocksState = [] // [0 未完成 ][1 已完成];
    let currentPaletteName;
    let currentPaletteProperties;
    let currentPaletteIndexLowerBound = 0;
    let selectBlockIndex = 0;    // currentPaletteBlocksIndexs 的
    let placeRateLimit = 0;
    let lastPlaceTime = 0;
    let changeCD = false;
    let needStore = [];
    for (let i = 0; i < targetSch.Metadata.TotalVolume; i++) {
        await wait()
        //console.log(targetSch.getBlockByIndex(i))
        let p = targetSch.getBlockPIDByIndex(i)
        if (p != 0) {
            //console.log(targetSch.getBlockByIndex(i))
            IgnoreAirArray.push(i)
            materialListForSch[parseInt(p)]++;
        }
    }
    if (bot.botinfo.server > 0 && bot.botinfo.server != build_cache.server) {
        bot.logger(false, 'WARN', `分流錯誤 當前:${bot.botinfo.server} 預期:${build_cache.server}`)
        await mcFallout.promiseTeleportServer(bot, build_cache.server, 15_000)
        // while (true) {
        //     //await sleep(100)
        //     if (bot.botinfo.server == build_cache.server) break;
        //     console.log(`嘗試切換分流 ${bot.botinfo.server} -> ${build_cache.server}`)
        //     bot.chat(`/ts ${build_cache.server}`);
        //     let checkChangeServer = await mcFallout.waitChangeServer(bot, 15000);
        //     if (checkChangeServer == 1) break;
        //     console.log(`切換失敗`);
        // }
        console.log("分流矯正完成");
    }
    bot._client.write("abilities", { flags: 6, flyingSpeed: 4.0, walkingSpeed: 4.0 })
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    if (bot.botinfo.server > 0 && !pos_in_box(bot.entity.position, build_cache.placement_origin.offset(-2, -100, -2), build_cache.placement_destination.offset(2, 100, 2))) {
        bot.chat('/homes mapart')
        await sleep(2000)
        await pathfinder.astarfly(bot, build_cache.placement_origin)
    }

    bot.setQuickBarSlot(8);
    //console.log(build_cache.currentPalette,targetSch.palette.length)
    bot.on('blockUpdate', updateVisited);
    mapartBuild: while (build_cache.currentPalette < targetSch.palette.length) {
        if (stop) return
        if (pause) {
            await sleep(500);
            continue;
        }
        if (!wheatherGetPalette) {
            Block_In_CD = []
            for (const timerID of removeTimerID) {
                clearTimeout(timerID);
            }
            removeTimerID = [];
            currentPaletteBlocksIndexs = []
            currentPaletteBlocksState = []  //[0 未完成 ][1 已完成];
            currentPaletteName = targetSch.palette[sch_palette_order[build_cache.currentPalette]].Name
            currentPaletteProperties = targetSch.palette[sch_palette_order[build_cache.currentPalette]].Properties
            //if(debug_enable) 
            bot.logger(false, 'INFO', `\x1b[32m當前材料:\x1b[0m ${currentPaletteName} ${build_cache.currentPalette + 1}/${targetSch.palette.length}`)
            if (BLOCK_EXCLUDE_LIST.includes(currentPaletteName)) {
                build_cache.currentPalette++;
                continue
            }
            //let dbt= Date.now()
            // 這裡太花時間了
            for (let i = 0; i < IgnoreAirArray.length; i++) {
                await wait()
                if (targetSch.getBlockPIDByIndex(IgnoreAirArray[i]) == sch_palette_order[build_cache.currentPalette]) {
                    //console.log(targetSch.getBlockByIndex(i))
                    currentPaletteBlocksIndexs.push(IgnoreAirArray[i])
                    currentPaletteBlocksState.push(0)
                }
            }
            selectBlockIndex = 0;
            await save_cache(cfg.bot_id, build_cache)
            // console.log(Date.now()-dbt,'ms')
            wheatherGetPalette = true;
        }
        // check server, botPos etc..
        let currentBotPos = new Vec3(Math.round(bot.entity.position.x - 0.5), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z - 0.5));
        let currentMapartServer = bot.botinfo.server
        if (currentMapartServer > 0 && currentMapartServer != build_cache.server) {
            bot.logger(false, 'WARN', `分流錯誤 當前:${currentMapartServer} 預期:${build_cache.server}`)
            await mcFallout.promiseTeleportServer(bot, build_cache.server, 15_000)
            // while (true) {
            //     //await sleep(100)
            //     if (bot.botinfo.server == build_cache.server) break;
            //     console.log(`嘗試切換分流 ${bot.botinfo.server} -> ${build_cache.server}`)
            //     bot.chat(`/ts ${build_cache.server}`);
            //     let checkChangeServer = await mcFallout.waitChangeServer(bot, 15000);
            //     if (checkChangeServer == 1) break;
            //     console.log(`切換失敗`);
            // }
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
        //console.log(currentPaletteBlocksIndexs)
        //checkStatehere
        //console.log(currentPaletteBlocksIndexs[selectBlockIndex])
        let selectBlockRelativePos = targetSch.vec3(currentPaletteBlocksIndexs[selectBlockIndex])
        let selectBlockAbsolutePos = build_cache.placement_origin.plus(selectBlockRelativePos)
        let selectBlockBotStandPos = selectBlockAbsolutePos.offset(0, 2, 0)
        //console.log(selectBlockRelativePos)
        //console.log(selectBlockAbsolutePos)
        //console.log(selectBlockBotStandPos)
        await pathfinder.astarfly(bot, selectBlockBotStandPos, null, null, null, true);    // mute =>true
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
        let crtPFirstTimePlace = true;
        let botEyePosition = bot.entity.position.plus(new Vec3(0, 1.6, 0))
        for (let cP_dz = -4; cP_dz <= 4; cP_dz++) {//連同身邊符合的block 一起蓋 同時設定visit
            for (let cP_dx = -4; cP_dx <= 4; cP_dx++) {			//#修改 #EXP
                for (let cP_dy = 5; cP_dy >= -3; cP_dy--) {

                    if (pause || stop) {
                        continue mapartBuild;
                    }
                    if (bot.entity.position.distanceTo(selectBlockBotStandPos) > 2) {
                        continue mapartBuild;
                    }
                    let dRelativePos = selectBlockRelativePos.offset(cP_dx, cP_dy, cP_dz);
                    let dAbsolutePos = selectBlockAbsolutePos.offset(cP_dx, cP_dy, cP_dz);
                    //if(bot.entity.position.distanceTo(blockCenterPos)>6) continue
                    //let currentPosPlace_d = selectBlockAbsolutePos.offset(cP_dx, cP_dy, cP_dz);
                    if (!pos_in_box(dRelativePos, build_cache.origin, build_cache.destination)) continue;
                    let blockCenterPos = dAbsolutePos.plus(new Vec3(0.5, 0.5, 0.5))
                    let distanceEyesToCenter = botEyePosition.distanceTo(blockCenterPos)
                    //console.log(botEyePosition,blockCenterPos,distanceEyesToCenter)
                    if (distanceEyesToCenter > 6) continue
                    let currentPosPlace_d_Index = targetSch.index(dRelativePos.x, dRelativePos.y, dRelativePos.z) // real index
                    //console.log(currentPosPlace_d_Index)
                    if (targetSch.getBlockPIDByIndex(currentPosPlace_d_Index) != sch_palette_order[build_cache.currentPalette]) continue; // ??? 不知道幹啥
                    let dBlocksIndex = currentPaletteBlocksIndexs.indexOf(currentPosPlace_d_Index) // fast index
                    //console.log(dBlocksIndex)
                    if (currentPaletteBlocksState[dBlocksIndex] == 0 && Block_In_CD.indexOf(dBlocksIndex) == -1) {
                        // check not null again
                        if (bot.blockAt(dAbsolutePos) == null) continue
                        // check no block occupy the pos (Deleted)

                        // check not finish
                        if (bot.blockAt(dAbsolutePos)?.name == currentPaletteName) {
                            currentPaletteBlocksState[dBlocksIndex] = 1;
                            build_cache.placedBlock++;
                            continue
                        }
                        // real build
                        let hold = bot.heldItem;
                        // 優化: 這裡還可以檢查手中數量少於一定值預先補充
                        if (!changeCD && hold?.name == currentPaletteName && hold?.count < 32) {
                            if (bot.currentWindow) {
                                console.log(bot.currentWindow?.title ?? 'Inventory');
                                console.log("嘗試關閉當前視窗")
                                bot.closeWindow(bot.currentWindow)
                            }
                            let findMaterialSlot = -1;
                            for (let idx = 9; idx <= 44; idx++) {
                                if (idx == hold.slot) continue
                                if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPaletteName) {
                                    findMaterialSlot = idx;
                                    //console.log("材料slot"+idx);
                                    break;
                                }
                            }
                            if (findMaterialSlot != -1) {
                                await bot.simpleClick.leftMouse(findMaterialSlot)
                                await bot.simpleClick.leftMouse(44)
                                await bot.simpleClick.leftMouse(findMaterialSlot)
                                //console.log('提前slot')
                            }
                            changeCD = true;
                            setTimeout(function () {
                                changeCD = false;
                            }, 500)
                        }
                        if (hold == null || hold.name != currentPaletteName) {
                            if (bot.currentWindow) {
                                console.log(bot.currentWindow?.title ?? 'Inventory');
                                console.log("嘗試關閉當前視窗")
                                bot.closeWindow(bot.currentWindow)
                            }
                            let findMaterialSlot = -1;
                            for (let idx = 9; idx <= 44; idx++) {
                                if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPaletteName) {
                                    findMaterialSlot = idx;
                                    //console.log("材料slot"+idx);
                                    break;
                                }
                            }
                            if (findMaterialSlot == -1) { //背包也沒有 回去補
                                bot.chat("/sethome " + "mapart");
                                build_cache.debug.restock_count++;
                                // 這邊計數器 都以 64 計組 地圖畫應該不會有非64堆的ㄅ(???
                                let needReStock = []; //[{ name: 'cobblestone', count: 64 }]
                                let emptySlotCount = bot.inventory.emptySlotCount();
                                let esc = emptySlotCount;
                                let maxQuantityRestock = 2304;
                                let quantityrestock = 0;
                                // 當前材料
                                for (let quantityrestock_i = 0; quantityrestock_i < currentPaletteBlocksIndexs.length; quantityrestock_i++) {
                                    //console.log(quantityrestock_index)
                                    if (currentPaletteBlocksState[quantityrestock_i] == 1) continue;
                                    else if (quantityrestock >= maxQuantityRestock) {
                                        break;
                                    }
                                    else {
                                        quantityrestock++;
                                    }
                                }
                                let quantityrestock_useSlot = Math.ceil(quantityrestock / 64);
                                emptySlotCount -= quantityrestock_useSlot;
                                needReStock.push({ name: currentPaletteName, count: quantityrestock, p: build_cache.currentPalette })
                                if (true) {
                                    //console.log("Calculating Mutli Restock ")
                                    //build_cache.currentPalette < targetSch.palette.length
                                    for (let crtRSC = build_cache.currentPalette + 1; crtRSC < targetSch.palette.length; crtRSC++) {
                                        if (emptySlotCount < 1) break;
                                        let realId = sch_palette_order[crtRSC];
                                        let crtRSCount = materialListForSch[realId];
                                        let crtCanRSCount = 0;
                                        let crtInv = bot.inventory.countRange(bot.inventory.inventoryStart, bot.inventory.inventoryEnd, mcData.itemsByName[targetSch.palette[realId].Name].id, null) ?? 0
                                        if (crtInv > 0) {
                                            //這裡需要更精準的補充 之後再加	
                                            crtRSCount -= crtInv
                                            if (crtRSCount < 0) {
                                                continue
                                            }
                                            //continue;
                                        }
                                        while (emptySlotCount > 0 && crtRSCount > 0) {
                                            if (crtRSCount <= 64) {
                                                emptySlotCount--;
                                                crtCanRSCount += crtRSCount;
                                                crtRSCount = 0;
                                            } else {
                                                emptySlotCount--;
                                                crtCanRSCount += 64;
                                                crtRSCount -= 64;
                                            }
                                        }
                                        needReStock.push({ name: targetSch.palette[realId].Name, count: crtCanRSCount, p: crtRSC })
                                        //needReStock.push(sch_palettes[sch_order[crtRSC]])
                                        //needReStockCount.push(crtCanRSCount)
                                    }
                                    //console.log("Calculating Complete")
                                }
                                while (needStore.length > 0) {
                                    needReStock.unshift(needStore.shift())
                                }
                                let mp = {};
                                for (let i = bot.inventory.inventoryStart; i <= bot.inventory.inventoryEnd; i++) {
                                    if (bot.inventory.slots[i] == null) continue
                                    let c = bot.inventory.slots[i].count
                                    let n = bot.inventory.slots[i].name
                                    if (!mp[n]) mp[n] = c;
                                    else mp[n] += c
                                }
                                if (!mp) bot.logger(false, 'DEBUG', '空')
                                if(debug_enable){
                                    bot.logger(false, 'DEBUG', `當前背包物品`,)
                                    for (const i in mp) {
                                        bot.logger(false, 'DEBUG', `${i.slice(0, 16).toString().padEnd(16)} ${mp[i]}`,)
                                    }
                                }
                                //bot.logger(true,'DEBUG',`EmptySlot ${emptySlotCount}`)
                                bot.logger(false, 'INFO', "\n=============補充材料=================")
                                console.log(`${('材料').padEnd(14, ' ')}(${('id').padEnd(2)}) ${('數量').padEnd(2)} ${('組').padEnd(1)}`);
                                for (let jj = 0; jj < needReStock.length; jj++) {
                                    console.log(`${(needReStock[jj]).name.slice(0, 16).padEnd(16, ' ')}(${(needReStock[jj].p + 1).toString().padEnd(2)}) ${needReStock[jj].count.toString().padEnd(4)} ${((Math.ceil(needReStock[jj].count / 64))).toString().padEnd(2)}`);
                                    //index not correct
                                }
                                // throw new Error("test")
                                //之後的材料
                                if (cfg.materialsMode == 'station') {
                                    let sr_start = Date.now()
                                    await mcFallout.promiseTeleportServer(bot, stationConfig.stationServer, 15_000)
                                    await sleep(2000)
                                    await station.restock(bot, stationConfig, needReStock)
                                    await mcFallout.promiseTeleportServer(bot, build_cache.server, 15_000)
                                    await sleep(5000)
                                    let sr_end = Date.now()
                                    build_cache.debug.restock_takeTime += (sr_end - sr_start)
                                    //bot.chat('/back')
                                    continue mapartBuild;
                                    await sleep(500)
                                    //await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
                                    await sleep(2500)
                                } else {
                                    console.log(`#materialsMode ${cfg.materialsMode} not implemented`)
                                    return
                                }
                            } else {
                                if (debug_enable) bot.logger(false, 'INFO', `\x1b[33m切換物品欄\x1b[0m ${findMaterialSlot} <-> 手`)
                                await bot.simpleClick.leftMouse(44)
                                await bot.simpleClick.leftMouse(findMaterialSlot)
                                await bot.simpleClick.leftMouse(44)
                                //await sleep(100)
                            }

                        }
                        // if(crtPFirstTimePlace){
                        //     crtPFirstTimePlace = false
                        await sleep(32)
                        // }
                        bot.updateHeldItem();
                        const packet = {
                            location: dAbsolutePos,
                            direction: 0,
                            heldItem: Item.toNotch(bot.heldItem),
                            cursorX: 0.5,
                            cursorY: 0.5,
                            cursorZ: 0.5
                        }
                        // while (placeRateLimit >= 5) {
                        //     await sleep(1);
                        // }
                        // while(Date.now()-lastPlaceTime<=32){
                        //     await sleep(1);
                        // }
                        build_cache.debug.placeCount++;
                        bot._client.write('block_place', packet);
                        //lastPlaceTime = Date.now()
                        Block_In_CD.push(dBlocksIndex)
                        const timerID = setTimeout(function () {
                            Block_In_CD.shift();
                            removeTimerID.shift();
                        }, build_check_cooldown)
                        removeTimerID.push(timerID)
                        //placeRateLimit++;
                        // setTimeout(function () {
                        //     placeRateLimit--;
                        // }, 250)
                        if (debug_enable) bot.logger(false, 'DEBUG', `\x1b[32m放置\x1b[0m ${currentPaletteName} (${build_cache.currentPalette}) 於 a${dAbsolutePos} r${dRelativePos} dBI:${dBlocksIndex} r_i:${currentPosPlace_d_Index} ${targetSch.getBlockByIndex(currentPosPlace_d_Index).Name}`)
                        //眼
                        // let eyeP = bot.entity.position.plus(new Vec3(0,1.6,0))
                        // let blockP = dAbsolutePos.plus(new Vec3(0.5,0.5,0.5));
                        // let eyeDistance = blockP.distanceTo(eyeP)
                        // if(eyeDistance>6){  build_cache.debug.temp++;
                        //     console.log(build_cache.debug.temp)
                        // }
                        //console.log(`Eye d: ${distanceEyesToCenter.toFixed(3).toString().padEnd(4,' ')}`)
                    }
                    continue
                }
            }
        }
        // FIND NEXT
        let deubg_startFNext = Date.now();
        let lastBlock = selectBlockIndex;
        selectBlockIndex = -1;
        for (let layer = 0; selectBlockIndex == -1 && layer <= 64; layer++) {				//60->8
            for (let fN_dx = 0 - layer; selectBlockIndex == -1 && fN_dx <= layer; fN_dx++) {
                for (let fN_dz = 0 - layer; selectBlockIndex == -1 && fN_dz <= layer; fN_dz++) {//連同身邊符合的block 一起蓋 同時設定visit
                    for (let fN_dy = layer; selectBlockIndex == -1 && fN_dy >= 0 - layer; fN_dy--) {
                        //console.log(`檢查 ${fN_dx} ${fN_dy} ${fN_dz}`);
                        if ((Math.abs(fN_dx) == layer || Math.abs(fN_dy) == layer || Math.abs(fN_dz) == layer)) {//只檢查邊緣面 (不重複檢查中間的)
                            let fN_nowRpos = selectBlockRelativePos.offset(fN_dx, fN_dy, fN_dz);
                            if (!pos_in_box(fN_nowRpos, build_cache.origin, build_cache.destination)) continue;   //跳過不再投影區塊內的
                            let fn_nowApos = fN_nowRpos.plus(build_cache.placement_origin)
                            let fN_nowPosRealIndex = targetSch.index(fN_nowRpos.x, fN_nowRpos.y, fN_nowRpos.z)
                            //console.log(fN_nowPosRealIndex)
                            let fnp = targetSch.getBlockPIDByIndex(fN_nowPosRealIndex)
                            if (fnp != sch_palette_order[build_cache.currentPalette]) continue
                            let fn_n_fastindex = currentPaletteBlocksIndexs.indexOf(fN_nowPosRealIndex);
                            if (fn_n_fastindex == -1) continue;
                            //這裡可能是lag主因 
                            if (currentPaletteBlocksState[fn_n_fastindex] == 0 && Block_In_CD.indexOf(fn_n_fastindex) == -1) {
                                if (bot.blockAt(fn_nowApos) == null) {
                                    continue;
                                }
                                if (bot.blockAt(fn_nowApos).name == currentPaletteName) {
                                    currentPaletteBlocksState[fn_n_fastindex] = 1;
                                    build_cache.placedBlock++;
                                    continue;
                                }
                                //console.log("發現近點");
                                selectBlockIndex = fn_n_fastindex;
                                break;
                            }
                        }
                    }
                }
            }
            //break;
        }
        while (selectBlockIndex == -1) {
            let blockInCD = false;
            for (let lastFindNotFinish = currentPaletteIndexLowerBound; lastFindNotFinish < currentPaletteBlocksIndexs.length; lastFindNotFinish++) {
                if (currentPaletteBlocksState[lastFindNotFinish] == 1) continue;    //已完成 找下個
                else if (currentPaletteBlocksState[lastFindNotFinish] == 0) {
                    if (Block_In_CD.indexOf(lastFindNotFinish) != -1) {
                        blockInCD = true;
                        continue;
                    }
                    let fNextRpos = targetSch.vec3(currentPaletteBlocksIndexs[lastFindNotFinish])//sch_blocksPos[lastFindNotFinish]    //當前點座標(相對)
                    //let align_relative_coord=currentBlockPos.plus(blockPosCorrect)
                    let fNextApos = fNextRpos.plus(build_cache.placement_origin)
                    //let findNextBlockRealPosWithAlign = placement_origin.plus(findNextBlockTmp);
                    if ((bot.blockAt(fNextApos) != null)) {
                        if (bot.blockAt(fNextApos).name == currentPaletteName) {
                            currentPaletteBlocksState[lastFindNotFinish] = 1;
                            build_cache.placedBlock++;
                            continue;
                        }
                    }
                    selectBlockIndex = lastFindNotFinish;
                    if (!blockInCD) {
                        currentPaletteIndexLowerBound = lastFindNotFinish;
                    }
                    break;
                }
            }
            if (selectBlockIndex == -1 && blockInCD == true) {
                await sleep(50);
                continue;
            }
            else {
                break;
            }
        }
        let debug_endFNext = Date.now();
        //#實驗 #EXP 
        if (true) {
            //console.log(`\x1b[36mFIND NEXT耗時 \x1b[33m${debug_endFNext - deubg_startFNext}\x1b[0m ms`);
            build_cache.debug.findNextTotalCounter += (debug_endFNext - deubg_startFNext)
        }
        // check this palette complete
        if (selectBlockIndex == -1) {
            let checkNeedStore = -1;
            for (let idx = 9; idx <= 44; idx++) {
                if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPaletteName) {
                    checkNeedStore = idx;
                    //console.log("材料slot"+idx);
                    break;
                }
            }
            selectBlockIndex = 0;      // 這部分可以再優化                                           
            currentPaletteIndexLowerBound = 0;
            if (checkNeedStore != -1) {
                needStore.push({ name: currentPaletteName, count: -1, p: -2 })
                //needStore.push(currentPaletteName);
            }
            wheatherGetPalette = false
            build_cache.currentPalette++;
        }



    }
    bot.off('blockUpdate', updateVisited);
    build_cache.endTime = Date.now()
    await save_cache(cfg.bot_id, build_cache)
    function updateVisited(oldBlock, newBlock) {
        updatePos = newBlock.position;
        //console.log(updatePos);
        //檢查是否在投影區域內
        if (!pos_in_box(updatePos, build_cache.placement_origin, build_cache.placement_destination)) return;
        //if (!pos_in_box(updatePos, placement_origin, placement_end)) return;
        let r_update_pos = updatePos.minus(build_cache.placement_origin)    //轉為原理圖內的
        let targetIndex = targetSch.index(r_update_pos.x, r_update_pos.y, r_update_pos.z)
        let qindex = currentPaletteBlocksIndexs.indexOf(targetIndex)
        if (currentPaletteName == newBlock.name && currentPaletteName == oldBlock.name) {
            if (currentPaletteBlocksState[qindex] == 0) {
                currentPaletteBlocksState[qindex] = 1;
                build_cache.placedBlock++;
            }
            //console.log("放置認證"+r_update_pos,qindex);
        }
        else {
            //blocksvisit[targetIndex]=-2;    //error
            // console.log("偵測到錯誤的放置"+updatePos);
        }
    }
    // #DEBug
    if (true) {
        console.log(`材料補充次數 ${build_cache.debug.restock_count} 次`)
        console.log(`材料補充總耗時: ${build_cache.debug.restock_takeTime} ms`)
        console.log(`FN總耗時: ${build_cache.debug.findNextTotalCounter} ms`)
    }
    return 'finish';
}
/**
 * This model build regular Building, order by layer(down to top) and keep the Properties(state)
 * @param {*} task 
 * @param {*} bot 
 * @param {*} cfg 
 */
async function model_building_build(task, bot, cfg, project) {
    Item = require('prismarine-item')(bot.version)
    mcData = require('minecraft-data')(bot.version)
    console.log(cfg)
    stop = false , pause = false
    let debug_enable = bot.debugMode || true
    let crt_cfg_hash = await hash_cfg(cfg.schematic)
    if (!fs.existsSync(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)) {
        await save_cache(cfg.bot_id, build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)
    }
    let stationConfig
    let wmsConfig
    if (cfg.materialsMode == 'station') {
        bot.logger(true,"INFO",`加載材料站資訊...`)
        try{
            stationConfig = await readConfig(`${process.cwd()}/config/global/${cfg.station}`);
        }catch(e){
            bot.logger(true,"ERROR",`材料站設定檔讀取失敗\nFilePath: ${process.cwd()}/config/global/${cfg.station}`)
            await sleep(1000)
            console.log("Please Check The Json Format")
            console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`)
            console.log("You can visit following websites the fix: ")
            console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`)
            console.log(`\x1b[33mhttps://www.google.com/search?q=${(e.message).replaceAll(" ","+")}\x1b[0m`)
            bot.gkill(202)
        }
        bot.logger(true,"INFO",`材料站 ${stationConfig.stationName} 加載成功`)
    }
    let targetSch 
    if(project){
        targetSch = project
    }else{
        targetSch= await schematic.loadFromFile(cfg.schematic.folder + cfg.schematic.filename)
    }
    // console.log(targetSch)
    // console.log(targetSch.Metadata.EnclosingSize)
    if (!fs.existsSync(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)) {
        await save_cache(cfg.bot_id, build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${cfg.bot_id}/build_cache.json`)
    }
    if (build_cache.hash != crt_cfg_hash) {
        build_cache.hash = crt_cfg_hash
        let useServer = cfg.server ? cfg.server : bot.botinfo.server
        build_cache.server = useServer
        build_cache.placedBlock = 0     //應該不太準確 還需要再修改
        build_cache.totalBlocks = targetSch.Metadata.TotalBlocks
        build_cache.totalLayer = targetSch.Metadata.EnclosingSize.y
        build_cache.currentLayer = 0
        build_cache.currentPalette = 0
        build_cache.startTime = Date.now()
        build_cache.endTime = -1
        build_cache.useTime = -1
        build_cache.origin = new Vec3(0, 0, 0);
        build_cache.destination = build_cache.origin.plus(targetSch.Metadata.EnclosingSize).offset(-1, -1, -1);
        build_cache.placement_origin = new Vec3(cfg.schematic.placementPoint_x, cfg.schematic.placementPoint_y, cfg.schematic.placementPoint_z)
        build_cache.placement_destination = build_cache.placement_origin.plus(build_cache.destination)
        build_cache.debug = {
            discconnectCount: 0,
            findNextTotalCounter: 0,
            restock_count: 0,
            restock_takeTime: 0, // ms
            placeCount: 0,
            temp: 0,
        }
    } else {
        console.log("檢測到快取")
        console.log(`上次建造時間 ${build_cache.startTime}`)
        build_cache.origin = v(build_cache.origin)
        build_cache.destination = v(build_cache.destination)
        build_cache.placement_origin = v(build_cache.placement_origin)
        build_cache.placement_destination = v(build_cache.placement_destination)
    }
    await save_cache(cfg.bot_id, build_cache)
    console.log(build_cache)
    targetSch.toMineflayerID()
    // for(let i =0 ;i< targetSch.palette.length;i++){
    //     targetSch.palette[i].oi=i;
    // }
    let wheatherGetLayerPalette = false
    let wheatherGetPalette = false
    let crtLayerPalette = []
    let unablePlaceLayerPalette = []
    let layerPaletteCountByIndex = {}  //用PID的
    // {
    //     '46': 1,
    //     '51': 1,
    //     '53': 2,
    //     '67': 1
    // };
    let layerPaletteBlocksByIndex = {}
    // {
    //     '46': [ 8550 ],
    //     '51': [ 8551 ],
    //     '53': [ 8646, 8660 ],
    //     '67': [ 8536 ]
    // }
    let currentPaletteBlocksState = [] // [0 未完成 ][1 已完成][2 狀態錯誤];
    let blockInCD = []
    let removeTimerID = []
    let sch_palette_order = []
    let needStore = []
    let startIndex = undefined
    let endIndex = undefined
    let currentPalette
    let selectBlockIndex = 0    //相對的 快速
    let currentPaletteIndexLowerBound = 0;
    bot.setQuickBarSlot(8);
    let changeCD = false;
    bot._client.write("abilities", { flags: 6, flyingSpeed: 4.0, walkingSpeed: 4.0 })
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot.on('blockUpdate', updateCheck);
    buildLoop: while (build_cache.currentLayer < build_cache.totalLayer) {// targetSch.palette.length
        await wait()
        if (stop) return
        if (pause) {
            await sleep(500);
            continue;
        }
        if (!wheatherGetLayerPalette) {
            if (debug_enable) console.log(`計算 第 ${build_cache.currentLayer} 層 材料`)
            startIndex = build_cache.currentLayer * targetSch.Metadata.EnclosingSize.x * targetSch.Metadata.EnclosingSize.z
            endIndex = (build_cache.currentLayer + 1) * targetSch.Metadata.EnclosingSize.x * targetSch.Metadata.EnclosingSize.z - 1
            layerPaletteCountByIndex = {}
            layerPaletteBlocksByIndex = {}
            sch_palette_order = []
            for (let i = 0; i < targetSch.palette.length; i++) {
                layerPaletteCountByIndex[i] = 0;
                layerPaletteBlocksByIndex[i] = []
            }
            for (let i = startIndex; i <= endIndex; i++) {
                let p_id = targetSch.getBlockPIDByIndex(i)
                if (p_id == 0) continue
                //console.log(p_id,targetSch.getBlockByIndex(i))
                layerPaletteCountByIndex[p_id]++
                layerPaletteBlocksByIndex[p_id].push(i)
            }
            for (let i = 0; i < targetSch.palette.length; i++) {
                if (layerPaletteCountByIndex[i] == 0) {
                    delete layerPaletteCountByIndex[i]
                    delete layerPaletteBlocksByIndex[i]
                } else if (!mcData.itemsByName[targetSch.palette[i].Name]) {
                    console.log("跳過" + targetSch.palette[i].Name)
                    delete layerPaletteCountByIndex[i]
                    delete layerPaletteBlocksByIndex[i]
                } else if (BLOCK_SKIP_LIST.includes(targetSch.palette[i].Name)){
                    console.log("跳過" + targetSch.palette[i].Name)
                    delete layerPaletteCountByIndex[i]
                    delete layerPaletteBlocksByIndex[i]
                } else if (targetSch.palette[i]?.Properties?.hanging == 'true' ){
                    console.log("跳過" + targetSch.palette[i].Name)
                    delete layerPaletteCountByIndex[i]
                    delete layerPaletteBlocksByIndex[i]
                }
            }
            let tmp_index = 0;
            for (let i in layerPaletteCountByIndex) {
                let tmp = targetSch.palette[i]
                tmp.index = i
                tmp_index++
                sch_palette_order.push(tmp)
                //console.log(targetSch.palette[i])
                //console.log(targetSch.palette[i].Name,layerPaletteCountByIndex[i],layerPaletteBlocksByIndex[i])
            }
            sch_palette_order.sort((a, b) => {
                const aIsWall = a.Properties?.face === 'wall';
                const bIsWall = b.Properties?.face === 'wall';

                if (aIsWall && !bIsWall) return 1;
                if (!aIsWall && bIsWall) return -1;
                if (a.Properties && !b.Properties) return 1;
                if (!a.Properties && b.Properties) return -1;

                if (a.Properties?.waterlogged && !b.Properties?.waterlogged) return 1;
                if (!a.Properties?.waterlogged && b.Properties?.waterlogged) return -1;

                if (a.Name !== b.Name) return a.Name.localeCompare(b.Name);
                return a.index - b.index;
            });

            //console.log(sch_palette_order)
            sch_palette_order = sch_palette_order.map(item => parseInt(item.index, 10));
            //console.log(sch_palette_order)
            //計算蓋的順序 同材料優先 有 Properties 的 最後 
            console.log(`id ${startIndex} - ${endIndex} 共 ${sch_palette_order.length} 項`)
            if (sch_palette_order.length == 0) {
                build_cache.currentLayer++
                continue
            }
            wheatherGetPalette = false
            wheatherGetLayerPalette = true
        }
        if (build_cache.currentPalette >= (sch_palette_order).length) {
            // return  //debug
            //console.log(build_cache.currentPalette + 1,(sch_palette_order).length)
            wheatherGetLayerPalette = false
            build_cache.currentPalette = 0;
            build_cache.currentLayer++
            continue
        }
        if (!wheatherGetPalette) {
            // console.log(build_cache.currentPalette)
            bot.logger(false, 'INFO', `\x1b[32m當前材料:\x1b[0m ${targetSch.palette[sch_palette_order[build_cache.currentPalette]].Name} ${build_cache.currentPalette + 1}/${(Object.keys(layerPaletteCountByIndex)).length}`)
            currentPaletteBlocksState = new Array(layerPaletteCountByIndex[sch_palette_order[build_cache.currentPalette]]).fill(0)
            // [0 未完成 ][1 已完成];
            currentPalette = targetSch.palette[sch_palette_order[build_cache.currentPalette]]
            // if (debug_enable) console.log("狀態表", currentPaletteBlocksState)
            // if (debug_enable) console.log("實際Index", layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]])
            //if (debug_enable) console.log(targetSch.palette[sch_palette_order[build_cache.currentPalette]])
            selectBlockIndex = 0
            currentPaletteIndexLowerBound = 0
            for (const timerID of removeTimerID) {
                clearTimeout(timerID);
            }
            removeTimerID = [];
            blockInCD = []
            wheatherGetPalette = true;
            await save_cache(cfg.bot_id, build_cache)
        }
        let currentBotPos = new Vec3(Math.round(bot.entity.position.x - 0.5), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z - 0.5));
        let currentMapartServer = bot.botinfo.server
        if (currentMapartServer > 0 && currentMapartServer != build_cache.server) {
            bot.logger(false, 'WARN', `分流錯誤 當前:${currentMapartServer} 預期:${build_cache.server}`)
            await mcFallout.promiseTeleportServer(bot, build_cache.server, 15_000)
            // while (true) {
            //     //await sleep(100)
            //     if (bot.botinfo.server == build_cache.server) break;
            //     console.log(`嘗試切換分流 ${bot.botinfo.server} -> ${build_cache.server}`)
            //     bot.chat(`/ts ${build_cache.server}`);
            //     let checkChangeServer = await mcFallout.waitChangeServer(bot, 15000);
            //     if (checkChangeServer == 1) break;
            //     console.log(`切換失敗`);
            // }
            console.log("分流矯正完成");
            continue
        }
        if (currentMapartServer > 0 && !pos_in_box(currentBotPos, build_cache.placement_origin.offset(-2, -100, -2), build_cache.placement_destination.offset(2, 100, 2))) {
            console.log("座標不再投影內");
            console.log(`當前座標 ${currentBotPos}`)
            console.log(`預期座標 ${build_cache.placement_origin.offset(-2, -100, -2)}`)
            console.log(`預期座標 ${build_cache.placement_destination.offset(2, 100, 2)}`)
            bot.chat(`/homes build`);
            await sleep(5000);
            console.log("座標矯正完成");
            continue
        }
        let selectBlockRealIndex = layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]][selectBlockIndex]
        let selectBlockRelativePos = targetSch.vec3(selectBlockRealIndex)
        let selectBlockAbsolutePos = build_cache.placement_origin.plus(selectBlockRelativePos)
        let selectBlockBotStandPos = selectBlockAbsolutePos.offset(0, 2, 0)
        let botEyePosition = bot.entity.position.plus(new Vec3(0, 1.6, 0))
        await pathfinder.astarfly(bot, selectBlockBotStandPos, null, null, null, !debug_enable);    // mute =>true
        //await pathfinder.astarfly(bot, selectBlockBotStandPos)
        if (bot.blockAt(selectBlockBotStandPos) == null) {
            console.log("lag中 等待加載目標方塊附近方塊");
            await sleep(100);
            continue
        }
        for (let cP_dz = -4; cP_dz <= 4; cP_dz++) {//連同身邊符合的block 一起蓋 同時設定visit
            for (let cP_dx = -4; cP_dx <= 4; cP_dx++) {			//#修改 #EXP
                if (pause || stop) {
                    continue buildLoop;
                }
                if (bot.entity.position.distanceTo(selectBlockBotStandPos) > 2) {
                    continue buildLoop;
                }
                let cP_dy = 0
                let dRelativePos = selectBlockRelativePos.offset(cP_dx, cP_dy, cP_dz);
                let dAbsolutePos = selectBlockAbsolutePos.offset(cP_dx, cP_dy, cP_dz);
                if (!pos_in_box(dRelativePos, build_cache.origin, build_cache.destination)) continue;
                let blockCenterPos = dAbsolutePos.plus(new Vec3(0.5, 0.5, 0.5))
                let distanceEyesToCenter = botEyePosition.distanceTo(blockCenterPos)
                if (distanceEyesToCenter > 6) continue
                let currentPosPlace_d_Index = targetSch.index(dRelativePos.x, dRelativePos.y, dRelativePos.z)
                if (targetSch.getBlockPIDByIndex(currentPosPlace_d_Index) != sch_palette_order[build_cache.currentPalette]) continue;
                let dBlocksIndex = layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]].indexOf(currentPosPlace_d_Index) // fast index
                if (blockInCD.indexOf(dBlocksIndex) == -1 && checkBlock(bot.blockAt(dAbsolutePos), currentPalette) == 1) {//bot.blockAt(selectBlockAbsolutePos)?.name == currentPalette.Name) {
                    //console.log(currentPalette.Name, bot.blockAt(selectBlockAbsolutePos)?.name)
                    currentPaletteBlocksState[dBlocksIndex] = 1;    //[2 狀態錯誤]
                } else {
        
        
                    //console.log(selectBlockRelativePos,selectBlockAbsolutePos,selectBlockBotStandPos)
        
                    //await sleep(50)
                    //BUILD Here
                    if (bot.entity.position.distanceTo(selectBlockBotStandPos) > 3) {
                        continue buildLoop;
                    }
                    if (currentPaletteBlocksState[dBlocksIndex] == 0 && blockInCD.indexOf(dBlocksIndex) == -1) {
                        if (bot.blockAt(dAbsolutePos) == null) continue
                        //重新檢查該位置
                        let checkBlockID = checkBlock(bot.blockAt(dAbsolutePos), currentPalette)
                        // console.log(checkBlockID)
                        if (checkBlockID == 1) {
                            currentPaletteBlocksState[dBlocksIndex] = 1;    //[2 狀態錯誤]
                        } else if (checkBlockID == 2) {
                            //console.log("調整tick")
                            try {
                                //await bot.activateBlock(bot.blockAt(dAbsolutePos));
                            } catch (e) {
        
                            }
                            // blockInCD.push(dBlocksIndex)
                            // const timerID = setTimeout(function () {
                            //     blockInCD.shift();
                            //     removeTimerID.shift();
                            // }, building_check_cooldown)
                            // removeTimerID.push(timerID)
                            // setTimeout(function () {
                            //     removeTimerID.shift();
                            // }, building_check_cooldown)
                            //click
                        } else {
                            //檢查手上
                            //補充
                            let hold = bot.heldItem;
                            // 優化: 這裡還可以檢查手中數量少於一定值預先補充
                            if (!changeCD && hold?.name == currentPalette.Name && hold?.count < 32) {
                                if (bot.currentWindow) {
                                    console.log(bot.currentWindow?.title ?? 'Inventory');
                                    console.log("嘗試關閉當前視窗")
                                    bot.closeWindow(bot.currentWindow)
                                }
                                let findMaterialSlot = -1;
                                for (let idx = 9; idx <= 44; idx++) {
                                    if (idx == hold.slot) continue
                                    if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPalette.Name) {
                                        findMaterialSlot = idx;
                                        //console.log("材料slot"+idx);
                                        break;
                                    }
                                }
                                if (findMaterialSlot != -1) {
                                    await bot.simpleClick.leftMouse(findMaterialSlot)
                                    await bot.simpleClick.leftMouse(44)
                                    await bot.simpleClick.leftMouse(findMaterialSlot)
                                    changeCD = true;
                                    setTimeout(function () {
                                        changeCD = false;
                                    }, 500)
                                    //console.log('提前slot')
                                }
                            }
                            if (hold == null || hold.name != currentPalette.Name) {
                                if (bot.currentWindow) {
                                    console.log(bot.currentWindow?.title ?? 'Inventory');
                                    console.log("嘗試關閉當前視窗")
                                    bot.closeWindow(bot.currentWindow)
                                }
                                let findMaterialSlot = -1;
                                for (let idx = 9; idx <= 44; idx++) {
                                    if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPalette.Name) {
                                        findMaterialSlot = idx;
                                        //console.log("材料slot"+idx);
                                        break;
                                    }
                                }
                                if (findMaterialSlot == -1) { //背包也沒有 回去補
                                    bot.chat("/sethome " + "build");
                                    build_cache.debug.restock_count++;
                                    let needReStock = []; //[{ name: 'cobblestone', count: 64 }]
                                    let emptySlotCount = bot.inventory.emptySlotCount();
                                    let esc = emptySlotCount;
                                    let maxQuantityRestock = 2304;
                                    let quantityrestock = 0;
                                    // 當前材料
                                    for (let quantityrestock_i = 0; quantityrestock_i < currentPaletteBlocksState.length; quantityrestock_i++) {
                                        //console.log(quantityrestock_index)
                                        if (currentPaletteBlocksState[quantityrestock_i] == 1) continue;
                                        else if (quantityrestock >= maxQuantityRestock) {
                                            break;
                                        }
                                        else {
                                            quantityrestock++;
                                        }
                                    }
                                    let quantityrestock_useSlot = Math.ceil(quantityrestock / mcData.itemsByName[currentPalette.Name].stackSize);
                                    emptySlotCount -= quantityrestock_useSlot;
                                    needReStock.push({ name: currentPalette.Name, count: quantityrestock, p: 0 })
                                    if (true) {
                                        //(Object.keys(layerPaletteCountByIndex)).length
                                        //console.log("Calculating Mutli Restock ")
                                        //build_cache.currentPalette < targetSch.palette.length
                                        for (let crtRSC = build_cache.currentPalette + 1; crtRSC < (sch_palette_order).length; crtRSC++) {
                                            if (emptySlotCount < 1) break;
                                            let realId = sch_palette_order[crtRSC];
                                            let crtRSCount = layerPaletteCountByIndex[realId]
                                            let crtCanRSCount = 0;
                                            let crtInv = bot.inventory.countRange(bot.inventory.inventoryStart, bot.inventory.inventoryEnd, mcData.itemsByName[targetSch.palette[realId].Name].id, null) ?? 0
                                            if (crtInv > 0) {
                                                //這裡需要更精準的補充 之後再加	
                                                crtRSCount -= crtInv
                                                if (crtRSCount < 0) {
                                                    continue
                                                }
                                                //continue;
                                            }
                                            while (emptySlotCount > 0 && crtRSCount > 0) {
                                                if (crtRSCount <= 64) {
                                                    emptySlotCount--;
                                                    crtCanRSCount += crtRSCount;
                                                    crtRSCount = 0;
                                                } else {
                                                    emptySlotCount--;
                                                    crtCanRSCount += 64;
                                                    crtRSCount -= 64;
                                                }
                                            }
                                            needReStock.push({ name: targetSch.palette[realId].Name, count: crtCanRSCount, p: crtRSC })
                                            //needReStock.push(sch_palettes[sch_order[crtRSC]])
                                            //needReStockCount.push(crtCanRSCount)
                                        }
                                        //console.log("Calculating Complete")
                                    }
                                    // while (needStore.length > 0) {
                                    //     needReStock.unshift(needStore.shift())
                                    // }
        
                                    //bot.logger(true,'DEBUG',`EmptySlot ${emptySlotCount}`)
                                    bot.logger(false, 'INFO', "\n=============補充材料=================")
                                    console.log(`${('材料').padEnd(14, ' ')}(${('id').padEnd(2)}) ${('數量').padEnd(2)} ${('組').padEnd(1)}`);
                                    for (let jj = 0; jj < needReStock.length; jj++) {
                                        console.log(`${(needReStock[jj]).name.slice(0, 16).padEnd(16, ' ')}(${(needReStock[jj].p + 1).toString().padEnd(2)}) ${needReStock[jj].count.toString().padEnd(4)} ${((Math.ceil(needReStock[jj].count / 64))).toString().padEnd(2)}`);
                                        //index not correct
                                    }
                                    // throw new Error("test")
                                    //之後的材料
                                    if (cfg.materialsMode == 'station') {
                                        let sr_start = Date.now()
                                        await mcFallout.promiseTeleportServer(bot, stationConfig.stationServer, 15_000)
                                        await sleep(2000)
                                        await station.restock(bot, stationConfig, needReStock)
                                        await mcFallout.promiseTeleportServer(bot, build_cache.server, 15_000)
                                        await sleep(5000)
                                        let sr_end = Date.now()
                                        build_cache.debug.restock_takeTime += (sr_end - sr_start)
                                        //bot.chat('/back')
                                        continue buildLoop;
                                        await sleep(500)
                                        //await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
                                        await sleep(2500)
                                    } else {
                                        console.log(`#materialsMode ${cfg.materialsMode} not implemented`)
                                        return
                                    }
                                } else {
                                    if (debug_enable) bot.logger(false, 'INFO', `\x1b[33m切換物品欄\x1b[0m ${findMaterialSlot} <-> 手`)
                                    await bot.simpleClick.leftMouse(44)
                                    await bot.simpleClick.leftMouse(findMaterialSlot)
                                    await bot.simpleClick.leftMouse(44)
                                    //await sleep(100)
                                }
        
                            }
                            bot.updateHeldItem();
                            //
                            await sleep(32)
                            await placeWithProperties(bot, currentPalette, dAbsolutePos)
                            blockInCD.push(dBlocksIndex)
                            const timerID = setTimeout(function () {
                                blockInCD.shift();
                                removeTimerID.shift();
                            }, building_check_cooldown)
                            removeTimerID.push(timerID)
                            if (debug_enable) {
                                console.log(`\x1b[32m放置\x1b[0m ${currentPalette.Name} (${build_cache.currentPalette}) 於 ${dAbsolutePos}`);
                            }
                        }
                    }
                }
            }
        }

        // get Next Target
        let lastBlock = selectBlockIndex;
        selectBlockIndex = -1;

        for (let layer = 0; selectBlockIndex == -1 && layer <= 64; layer++) {				//60->8
            for (let fN_dx = 0 - layer; selectBlockIndex == -1 && fN_dx <= layer; fN_dx++) {
                for (let fN_dz = 0 - layer; selectBlockIndex == -1 && fN_dz <= layer; fN_dz++) {//連同身邊符合的block 一起蓋 同時設定visit
                    //console.log(`檢查 ${fN_dx} ${fN_dy} ${fN_dz}`);
                    let fN_dy = 0
                    if ((Math.abs(fN_dx) == layer || Math.abs(fN_dy) == layer || Math.abs(fN_dz) == layer)) {//只檢查邊緣面 (不重複檢查中間的)
                        let fN_nowRpos = selectBlockRelativePos.offset(fN_dx, fN_dy, fN_dz);
                        if (!pos_in_box(fN_nowRpos, build_cache.origin, build_cache.destination)) continue;   //跳過不再投影區塊內的
                        let fn_nowApos = fN_nowRpos.plus(build_cache.placement_origin)
                        let fN_nowPosRealIndex = targetSch.index(fN_nowRpos.x, fN_nowRpos.y, fN_nowRpos.z)
                        //console.log(fN_nowPosRealIndex)
                        let fnp = targetSch.getBlockPIDByIndex(fN_nowPosRealIndex)
                        if (fnp != sch_palette_order[build_cache.currentPalette]) continue
                        let fn_n_fastindex = layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]].indexOf(fN_nowPosRealIndex);        //???
                        if (fn_n_fastindex == -1) continue;
                        //這裡可能是lag主因 
                        if (currentPaletteBlocksState[fn_n_fastindex] == 0 && blockInCD.indexOf(fn_n_fastindex) == -1) {
                            if (bot.blockAt(fn_nowApos) == null) {
                                continue;
                            }
                            let ckid = checkBlock(bot.blockAt(fn_nowApos), currentPalette)
                            if (ckid == 1) {
                                currentPaletteBlocksState[fn_n_fastindex] = 1;
                                build_cache.placedBlock++;
                                continue;
                            }
                            //console.log("發現近點");
                            selectBlockIndex = fn_n_fastindex;
                            break;
                        }
                    }
                }
            }
            //break;
        }
        while (selectBlockIndex == -1) {
            let haveblockInCD = false;
            for (let lastFindNotFinish = currentPaletteIndexLowerBound; lastFindNotFinish < layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]].length; lastFindNotFinish++) {
                if (currentPaletteBlocksState[lastFindNotFinish] == 1) continue;    //已完成 找下個
                else if (currentPaletteBlocksState[lastFindNotFinish] == 0) {
                    if (blockInCD.indexOf(lastFindNotFinish) != -1) {
                        haveblockInCD = true;
                        continue;
                    }
                    let fNextRpos = targetSch.vec3(layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]][lastFindNotFinish])//sch_blocksPos[lastFindNotFinish]    //當前點座標(相對)
                    //let align_relative_coord=currentBlockPos.plus(blockPosCorrect)
                    let fNextApos = fNextRpos.plus(build_cache.placement_origin)
                    //let findNextBlockRealPosWithAlign = placement_origin.plus(findNextBlockTmp);
                    if ((bot.blockAt(fNextApos) != null)) {
                        let ckid = checkBlock(bot.blockAt(fNextApos), currentPalette)
                        if (ckid == 1) {
                            currentPaletteBlocksState[lastFindNotFinish] = 1;
                            //build_cache.placedBlock++;
                            continue;
                        }
                    }
                    selectBlockIndex = lastFindNotFinish;
                    if (!haveblockInCD) {
                        currentPaletteIndexLowerBound = lastFindNotFinish;
                    }
                    break;
                }
            }
            if (selectBlockIndex == -1 && haveblockInCD == true) {
                await sleep(50);
                continue;
            }
            else {
                break;
            }
        }
        //console.log("Next = ",selectBlockIndex)
        // if next target not found pt ++
        if (selectBlockIndex == -1) {
            let checkNeedStore = -1;
            for (let idx = 9; idx <= 44; idx++) { //這邊要改掉 後續材料可能依樣
                if (bot.inventory.slots[idx] != null && bot.inventory.slots[idx].name == currentPalette.Name) {
                    checkNeedStore = idx;
                    //console.log("材料slot"+idx);
                    break;
                }
            }
            selectBlockIndex = 0;      // 這部分可以再優化                                           
            currentPaletteIndexLowerBound = 0;
            if (checkNeedStore != -1) {
                needStore.push({ name: currentPalette.Name, count: -1, p: -2 })
                //needStore.push(currentPaletteName);
            }
            // wheatherGetPalette = false
            build_cache.currentPalette++;
            wheatherGetPalette = false
        }
    }
    bot.off('blockUpdate', updateCheck);
    function updateCheck(oldBlock, newBlock) {
        updatePos = newBlock.position;
        if (!pos_in_box(updatePos, build_cache.placement_origin, build_cache.placement_destination)) return;
        if (oldBlock.name != newBlock.name) return
        let r_update_pos = updatePos.minus(build_cache.placement_origin)    //轉為原理圖內的
        let targetIndex = targetSch.index(r_update_pos.x, r_update_pos.y, r_update_pos.z)
        let qindex = layerPaletteBlocksByIndex[sch_palette_order[build_cache.currentPalette]].indexOf(targetIndex)
        let checkID = checkBlock(newBlock, currentPalette)
        if (checkID == 1) {
            if (currentPaletteBlocksState[qindex] == 0) {
                currentPaletteBlocksState[qindex] = 1;
            }
        }
    }
    await save_cache(cfg.bot_id, build_cache)
    return 'finish';
}
async function model_redstone_build(task, bot, cfg) {
    throw new Error("Not Implemented")
}
async function placeWithProperties(bot, block, pos) {
    // Value    Offset	Face
    // 0	    -Y	    Bottom
    // 1	    +Y	    Top
    // 2	    -Z	    North
    // 3	    +Z	    South
    // 4	    -X	    West
    // 5	    +X	    East
    let direction = 0
    let cursorX = 0.5
    let cursorY = 0.5
    let cursorZ = 0.5
    if (block?.Properties?.half == 'bottom' || block?.Properties?.type == 'bottom') {
        direction = 1
    }
    if (block?.Properties?.axis == 'y') {
        direction = 0
    }
    if (block?.Properties?.axis == 'x') {
        direction = 4
    }
    if (block?.Properties?.axis == 'z') {
        direction = 2
    }
    let yaw = 0
    let pitch = 0
    if (block?.Properties?.facing == 'south') {
        yaw = 0
    }
    if (block?.Properties?.facing == 'west') {
        yaw = 90
    }
    if (block?.Properties?.facing == 'north') {
        yaw = 180
    }
    if (block?.Properties?.facing == 'east') {
        yaw = 270
    }
    if (block?.Properties?.facing == 'up') {
        direction = 1
        pitch = 90
    }
    if (block?.Properties?.facing == 'down') {
        direction = 0
        pitch = -90 
    }
    if (block?.Properties?.facing &&block.Name.includes("anvil")) {
        yaw +=270
        yaw %=360
    }
    if (block.Name.includes("trapdoor") || block.Name.includes("button") || block.Name.includes("_glazed_")) {
        if (block?.Properties?.facing == 'north') { yaw = 0 }
        if (block?.Properties?.facing == 'east') { yaw = 90 }
        if (block?.Properties?.facing == 'south') { yaw = 180 }
        if (block?.Properties?.facing == 'west') { yaw = 270 }
    }
    let lastSent = {
        x: bot.entity.position.x,
        y: bot.entity.position.y,
        z: bot.entity.position.z,
        yaw: 0,
        pitch: pitch,
        onGround: false,
        time: 0
    }
    lastSent.yaw = yaw
    bot._client.write('position_look', lastSent)
    // if (block?.Properties?.facing) await sleep(59)
    const packet = {
        location: pos,
        direction: direction,
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: cursorX,
        cursorY: cursorY,
        cursorZ: cursorZ
    }
    //console.table(packet)
    bot._client.write('block_place', packet);
}
function checkBlock(block, TargetPalette) {
    if (block == null) return 0
    if (block.name == TargetPalette.Name) {
        if (!TargetPalette.Properties) {
            return 1
        } else {
            // ignore powered 不知道為何一直都是false
            // if(!TargetPalette.Name.includes("button")&&TargetPalette?.Properties?.powered){
            //     if(TargetPalette.Name.includes("trap")){
            //         console.log("powered",JSON.parse(TargetPalette?.Properties?.powered) , block?._properties?.powered)
            //     }
            //     if (JSON.parse(TargetPalette?.Properties?.powered) != block?._properties?.powered){
            //         return 2
            //     }
            // }
            // ignore open 不知道為何一直都是false
            // if(TargetPalette?.Properties?.open){
            //     if(TargetPalette.Name.includes("trap")){
            //         console.log("open",JSON.parse(TargetPalette?.Properties?.open) , block?._properties?.open)
            //         console.log(block)
            //     }
            //     if (JSON.parse(TargetPalette?.Properties?.open) != block?._properties?.open){
            //         return 2
            //     }
            // }
            return 1
            //之後再支持tick
        }
    }
    let target_PT_eq_ID = undefined
    for (i in BLOCK_EQUIVALENT_LIST) {
        let tmp = BLOCK_EQUIVALENT_LIST[i].includes(TargetPalette.Name)
        if (tmp == true) {
            target_PT_eq_ID = i
            break;
        }
    }
    if (target_PT_eq_ID == undefined) return 0
    if (BLOCK_EQUIVALENT_LIST[target_PT_eq_ID].includes(block.name)) return 1
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
async function save_cache(bot_id, cache) {
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
