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
const { dirxml } = require('console');
const { astarfly } = require('../lib/pathfinder');
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
var whetherBuild = false, whetherPause = false, stop = false;
let logger, mcData, bot_id, bot
// 地圖畫面向方向 (用於不同角度 圖工作等)
let mp_direction = {
    "north": {  //2b
        "inc_dx": -1,
        "inc_dy": -1,
        "inc_dz": 0,
    },
    "south": {  //3b
        "inc_dx": 1,
        "inc_dy": -1,
        "inc_dz": 0,
    },
    "west": {   //4b
        "inc_dx": 0,
        "inc_dy": -1,
        "inc_dz": 1,
    },
    "east": {   //5b
        "inc_dx": 0,
        "inc_dy": -1,
        "inc_dz": -1,
    },
}
let mapart_cache = {
    build: {
        hash: "",
        server: -1,
        totalBlocks: -1,
        startTime: Date.now(),
        endTime: Date.now(),
        interruptedBefore: 0,
        counter: -1,
    },
    wrap: {

    }
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
    "open": {
        "folder": "暫時用不到",
        "warp": "JKLoveJK_10",
        "height": 9,
        "width": 6,
        "open_start": -1,
        "open_end": -1,
    },
    "wrap": {    // 分裝 命名 複印用的設定
        "warp": "JKLoveJK_10",
        "height": 9,
        "width": 6,
        "origin": [0, 0, 0],
        "anvil": [0, 0, 0],
        "anvil_stand": [0, 0, 0],
        "facing": "north",
        "name": "ExampleMP_Name",
        "source": "https://www.pixiv.net/artworks/92433849",  //書本用的 暫時完全不會用到
        "artist": "https://www.pixiv.net/users/3036679"
    },
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
        "mp",
        "map"
    ],
    cmd: [
        {//test
            name: "test",
            identifier: [
                "test",
            ],
            execute: mp_test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {//hash test
            name: "hash test",
            identifier: [
                "hash",
            ],
            execute: get_hash_cfg,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//debug toggle
            name: "toggle debug mode",
            identifier: [
                "debug",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//設定
            name: "地圖畫 設定",
            identifier: [
                "set",
            ],
            execute: mp_set,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//查詢
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
        {//建造
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
        {//暫停
            name: "地圖畫 建造-暫停",
            identifier: [
                "pause",
                "p",
            ],
            execute: mp_pause,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//繼續"
            name: "地圖畫 建造-繼續",
            identifier: [
                "resume",
                "r",
            ],
            execute: mp_resume,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//中止
            name: "地圖畫 建造-中止",
            identifier: [
                "stop",
                "s",
            ],
            execute: mp_stop,
            vaild: true,
            longRunning: false,
            permissionRequre: 0,
        },
        {//開圖
            name: "地圖畫 開圖",
            identifier: [
                "open",
                "o",
            ],
            execute: mp_open,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {//命名
            name: "地圖畫 命名",
            identifier: [
                "name",
                "n",
            ],
            execute: mp_name,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {//複印
            name: "地圖畫 複印",
            identifier: [
                "copy",
                "c",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
        {//分裝
            name: "地圖畫 分裝",
            identifier: [
                "wrap",
                "w",
            ],
            execute: notImplemented,
            vaild: true,
            longRunning: true,
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
    let mapart_build_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig;
    let materialsMode = mapart_build_cfg_cache.materialsMode;
    if (materialsMode == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_build_cfg_cache.station}`);
    } else {
        await notImplemented(task)
        return
    }
    if (!fs.existsSync(mapart_global_cfg.schematic_folder + mapart_build_cfg_cache.schematic.filename)) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請檢查設定`,
            `未發現投影 ${task.content[2]} r請檢查設定`,
            null,
        );
        return;
    }
    console.log("build test")
    //get cache here
    let currentMPCFG_Hash = await get_hash_cfg(mapart_build_cfg_cache.schematic);
    if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
        save_cache(mapart_cache)
    } else {
        mapart_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    }
    console.log(`hash\n${mapart_cache.hash}\n${currentMPCFG_Hash}`)
    let parse_startTime = Date.now();
    let sch = await schematic.loadFromFile(mapart_global_cfg.schematic_folder + mapart_build_cfg_cache.schematic.filename)
    let parse_endTime = Date.now();
    console.log(mapart_cache)
    console.log(mapart_build_cfg_cache)
    console.log(sch)
    console.log(`解析時間 ${parse_endTime - parse_startTime} ms`)
    // console.log(sch.litematicaBitArray.getAt(sch.index(0, 1, 1)))
    if (mapart_cache.hash != currentMPCFG_Hash) {
        //重新蓋
    }
    //繼續蓋
    await mapartbuild();
    async function mapartbuild() {
        whetherBuild = true, whetherPause = false, stop = false;
        let blockCD = [];
        let placeRateLimit = 0;
        let currentBlock = 0;   //當前INDEX
        let currentBlocks = [];         //當前palette的所有方塊                 (偽Index)		
        let currentBlocksRealIndex = [] //當前palette的所有方塊在blocks的Index  (實Index)	
    }

}
async function mp_pause(task) {
    whetherPause = true
}
async function mp_resume(task) {
    whetherPause = false
}
async function mp_stop(task) {
    stop = true
}
async function mp_test(task) {
    console.log(bot.inventory)
    let et = bot.entities;
    // for(i in et){
    //     if(et[i]?.mobType=='Item'&& et[i]?.metadata[8]?.itemId == 847 && et[i]?.metadata[8].nbtData?.value?.map?.value == mpsid){
    //         console.log(et[i].metadata)
    //     } 
    //     //console.log(et)
    // }
}
async function mp_open(task) {
    const Item = require('prismarine-item')(bot.version)
    let mapart_open_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_open_cfg_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_open_cfg_cache.station}`);
    }
    console.log(mapart_open_cfg_cache["open"])
    await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
    await bot.chat("/sethome mapart")
    await sleep(1000)
    bot.setQuickBarSlot(8);
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    const sx = Math.floor((Math.floor((bot.entity.position.x) / 16) - 4) / 8) * 8 * 16 + 64
    const sz = Math.floor((Math.floor((bot.entity.position.z) / 16) - 4) / 8) * 8 * 16 + 64
    const mapart_ori = new Vec3(sx + 1, mapart_open_cfg_cache["schematic"]["placementPoint_y"] - 2, sz)
    console.log(mapart_ori)
    await pathfinder.astarfly(bot, mapart_ori.offset(0, 0, 3), null, null, null, false)
    let mpstate = [];
    /**
     *      Init 檢查是否有未完成
    */
    for (let dx = 0; dx < mapart_open_cfg_cache["open"]["width"]; dx++) {
        for (let dy = 0; dy < mapart_open_cfg_cache["open"]["height"]; dy++) {
            let csmp = {
                x: dx,
                y: dy,
                z: 0,
                mapartRealPos: new Vec3(sx + 128 * (dx * mapart_open_cfg_cache["open"]["height"] + dy), 256, sz),
                pos: mapart_ori.offset(dx, 0 - dy, 0),
                itemframe: false,
                mapid: undefined,
                finish: false,
            }
            let currentIF = getItemFrame(mapart_ori.offset(dx, 0 - dy, 0))
            if (currentIF) csmp.itemframe = true;
            if (currentIF?.metadata && currentIF?.metadata[8]?.itemId == 847) {
                //console.log(currentIF.metadata[8].nbtData.value.map.value)
                csmp.mapid = currentIF.metadata[8].nbtData.value.map.value;
                csmp.finish = true;
            }
            mpstate.push(csmp)
        }
    }
    //放支撐item frame 的
    let blockToAdd = 'quartz_block'
    await moveToEmptySlot(44)
    for (let i = 0; i < mpstate.length;) {
        //console.log(mpstate[i].pos.offset(0, 0, -1))
        if (!bot.blockAt(mpstate[i].pos.offset(0, 0, -1))) {
            await pathfinder.astarfly(bot, mpstate[i].pos, null, null, null, false)
            //console.log("not in range")
            await sleep(500)
            continue
        }
        if (bot.blockAt(mpstate[i].pos.offset(0, 0, -1)).name == 'air') {
            if (!bot.inventory?.slots[44] || bot.inventory?.slots[44].name != blockToAdd) {
                let invhasblockToAdd = -1
                for (let id = 9; id <= 43; id++) {
                    //if (bot.inventory.slots[id]) console.log(bot.inventory.slots[id].name)
                    if (bot.inventory.slots[id]?.name == blockToAdd) {
                        invhasblockToAdd = id;
                        break;
                    }
                }
                if (invhasblockToAdd == -1) {
                    if (mapart_open_cfg_cache["materialsMode"] == 'station') {
                        await sleep(5000)
                        await stationRestock(stationConfig, [{ name: blockToAdd, count: 64 }])
                        await sleep(500)
                        await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
                        await sleep(2500)
                    }
                    continue
                } else {
                    await bot.simpleClick.leftMouse(invhasblockToAdd)
                    await bot.simpleClick.leftMouse(44)
                    await bot.simpleClick.leftMouse(invhasblockToAdd)
                    continue
                }
            }
            await pathfinder.astarfly(bot, mpstate[i].pos, null, null, null, true)
            await sleep(50);
            const packet = {
                location: mpstate[i].pos.offset(0, 0, -1),
                direction: 0,
                heldItem: Item.toNotch(bot.heldItem),
                cursorX: 0.5,
                cursorY: 0.5,
                cursorZ: 0.5
            }
            bot._client.write('block_place', packet);
            await sleep(100);
            //console.log("place")
            continue
        }
        i++;
    }
    //放item frame 的
    await moveToEmptySlot(44)
    for (let i = 0; i < mpstate.length;) {
        //console.log(i,mpstate[i])
        if (mpstate[i].itemframe) {
            i++;
            continue
        }
        await pathfinder.astarfly(bot, mpstate[i].pos, null, null, null, true)
        let currentIF = getItemFrame(mpstate[i].pos)
        if (currentIF) {
            mpstate[i].itemframe = true;
            continue;
        }
        if (!bot.inventory?.slots[44] || bot.inventory?.slots[44].name != 'glow_item_frame') {
            let invhasblockToAdd = -1
            for (let id = 9; id <= 43; id++) {
                //if (bot.inventory.slots[id]) console.log(bot.inventory.slots[id].name)
                if (bot.inventory.slots[id]?.name == 'glow_item_frame') {
                    invhasblockToAdd = id;
                    break;
                }
            }
            if (invhasblockToAdd == -1) {
                if (mapart_open_cfg_cache["materialsMode"] == 'station') {
                    await sleep(5000)
                    await stationRestock(stationConfig, [{ name: 'glow_item_frame', count: 64 }])
                    await sleep(500)
                    await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
                    await sleep(2500)
                }
                continue
            } else {
                await bot.simpleClick.leftMouse(invhasblockToAdd)
                await bot.simpleClick.leftMouse(44)
                await bot.simpleClick.leftMouse(invhasblockToAdd)
                continue
            }
        }
        bot.activateBlock(bot.blockAt(mpstate[i].pos.offset(0, 0, -1)), new Vec3(0, 0, 1));
        //await bot.placeEntity(mpstate[i].pos.offset(0,0,-1), new Vec3(0, 0, 1));
        await sleep(50)
    }
    for (let i = 0; i < mpstate.length; i++) {
        await inv_sort()
        if (mpstate[i].finish) continue
        if (getEmptySlot().length == 0) {
            await bot.chat("/sethome mapart")
            await sleep(200)
            await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
            await sleep(500)
            await pathfinder.astarfly(bot, mapart_ori.offset(0, 0, 3), null, null, null, false)
            await putMapON()
            await bot.chat("/homes mapart")
            await sleep(500)
        }
        await inv_sort()
        if (!bot.inventory?.slots[43]) {
            if (mapart_open_cfg_cache["materialsMode"] == 'station') {
                await sleep(2500)
                await stationRestock(stationConfig, [{ name: "map", count: mpstate.length }])
                await sleep(500)
                //await stationRestock(stationConfig, [{ name: "map", count: mpstate.length }])
                await inv_sort()
            }
            await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
            await sleep(1500)
            await bot.chat("/homes mapart")
            await sleep(500)
        }
        //open
        await openMap(mpstate[i]);
        //return
    }
    await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
    await sleep(2000)
    await pathfinder.astarfly(bot, mapart_ori.offset(0, 0, 3), null, null, null, false)
    await putMapON()
    //console.log(mpstate)
    //console.log(mpstate[0])
    async function openMap(mps) {
        await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        //console.log(mps)
        while (bot.entity.position.distanceTo(mps.mapartRealPos.offset(64, 0, 64)) > 20) {
            await pathfinder.astarfly(bot, mps.mapartRealPos.offset(64, 0, 64), null, null, null, true)
        }
        console.log(`open At ${mps.mapartRealPos}`)
        await sleep(500)
        await bot.chat("/sethome mapart")
        await bot.simpleClick.leftMouse(43)
        await bot.simpleClick.rightMouse(44)
        await bot.simpleClick.leftMouse(43)
        await sleep(50)
        let try_open_c = 0
        let mpID
        while (try_open_c < 10) {
            await bot.activateItem()
            await sleep(50)
            await bot.deactivateItem()
            await sleep(200)
            if (bot.inventory?.slots[44]?.name == "filled_map") {
                mpID = bot.inventory.slots[44].nbt.value.map.value;
                console.log(mpID)
                break;
            }
            try_open_c++
        }
        let offset = 8;
        for (let off_x = 0; off_x < 128; off_x += offset) {
            await pathfinder.astarfly(bot, mps.mapartRealPos.offset(off_x, 0, 64), null, null, null, true)
            await bot.activateItem()
            await sleep(50)
            await bot.deactivateItem()
            await sleep(50)
        }
        mps.mapid = mpID
        await moveToEmptySlot(44)
        console.log(`mp_${mps.x}_${mps.y} 完成 ${mpID}`)
    }
    async function putMapON() {
        // let tessss=0;
        await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        bot._client.write("abilities", {
            flags: 2,
            flyingSpeed: 4.0,
            walkingSpeed: 4.0
        })
        for (let inv_i = 9; inv_i < 44; inv_i++) {
            if (bot.inventory.slots[inv_i] && bot.inventory.slots[inv_i].name == 'filled_map') {
                lv = false;
                let mpID = bot.inventory.slots[inv_i].nbt.value.map.value;
                let mps = findByMapId(mpstate, mpID);
                if (mps) {
                    // mps =  mpstate[tessss]
                    // tessss++;
                    let fail_c = 0
                    while (fail_c < 10) {
                        await pathfinder.astarfly(bot, mps.pos.offset(0, 0, 1), null, null, null, true)
                        await bot.simpleClick.leftMouse(inv_i)
                        await bot.simpleClick.leftMouse(44)
                        await sleep(50)
                        if (!getItemFrame(mps.pos)) {
                            await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
                            await pathfinder.astarfly(bot, mps.pos.offset(0, 0, 1), null, null, null, true)
                            continue
                        }
                        await bot.activateEntity(getItemFrame(mps.pos))
                        await sleep(1000)
                        let check = getItemFrame(mps.pos);
                        if (check && check.metadata[8].nbtData.value.map.value == mpID) {
                            break;
                        }
                        fail_c++;
                    }
                    //console.log(mps)
                    console.log(`放置 mp_${mps.x}_${mps.y}`)
                } else {
                    await bot.simpleClick.leftMouse(inv_i)
                    await bot.simpleClick.leftMouse(-999)
                }
                await sleep(50)
            }
        }
    }
    function findByMapId(mpstate, mpID) {
        return mpstate.find(item => item.mapid === mpID);
    }
    /**
     * 整理背包
     * Slot 44 -> Empty
     * slot 43 -> map
     */
    async function inv_sort() {
        if (bot.inventory.slots[44]) {
            await moveToEmptySlot(44)
        }
        if (bot.inventory?.slots[43]?.name != 'map') {
            for (let i = 9; i <= 42; i++) {
                if (bot.inventory?.slots[i]?.name == 'map') {
                    await bot.simpleClick.leftMouse(i)
                    await bot.simpleClick.leftMouse(43)
                    await bot.simpleClick.leftMouse(i)
                    break;
                }
            }
        }
    }
    async function moveToEmptySlot(slot) {
        let emptySlots = getEmptySlot();
        if (emptySlots.length == 0) {
            throw new Error("Can't find empty slot to use")
        }
        await bot.simpleClick.leftMouse(slot)
        await bot.simpleClick.leftMouse(emptySlots[0])
    }
    function getEmptySlot() {
        let result = []
        for (let i = 9; i < 44; i++) {
            if (!bot.inventory.slots[i]) {
                result.push(i)
            }
        }
        return result
    }
    function getItemFrame(tg_pos) {
        for (let etsIndex in bot.entities) {
            if (!(bot.entities[etsIndex].mobType == 'Glow Item Frame' || bot.entities[etsIndex].mobType == 'Item Frame')) continue
            if (!bot.entities[etsIndex].position.equals(tg_pos)) continue
            return etsIndex, bot.entities[etsIndex]
            //console.log(etsIndex,bot.entities[etsIndex])
        }
    }
}
async function mp_name(task) {
    const Item = require('prismarine-item')(bot.version)
    let mapart_name_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_name_cfg_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_name_cfg_cache.station}`);
    }
    await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"]);
    bot.setQuickBarSlot(8);
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
        save_cache(mapart_cache)
    } else {
        mapart_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    }
    console.log(mapart_name_cfg_cache)
    //console.log(mapart_cache)
    await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]))
    let mp_origin = new Vec3(mapart_name_cfg_cache.wrap.origin[0], mapart_name_cfg_cache.wrap.origin[1], mapart_name_cfg_cache.wrap.origin[2])
    //console.log(abc.metadata[8].nbtData.value.display.value.Lore)
    // value: [
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"gray","text":"可跨分流顯示"}],"text":""}',
    //     '{"extra":[{"italic":false,"color":"gray","text":"可以複印 "},{"italic":false,"color":"dark_gray","text":"(作者可使用 /copyright 變更)"}],"text":""}',
    //     '{"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"作者ID : moyue16"}],"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"作者UUID : "}],"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"2c6147e5-e220-45f0-87bb-eec18496c99b"}],"text":""}',
    //     '{"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"作品識別碼 : "}],"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"87ac56ab-5af3-46cb-b14d-69c7e14d1000"}],"text":""}',
    //     '{"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"地圖畫作者須知 : "}],"text":""}',
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"違反圖源作者意願、或超過合理使用範圍，"}],"text":""}',       
    //     '{"extra":[{"bold":false,"italic":false,"underlined":false,"strikethrough":false,"obfuscated":false,"color":"dark_gray","text":"可能導致侵權問題產生。"}],"text":""}'
    //   ]
    let maparts = []
    let facing = mapart_name_cfg_cache["wrap"]["facing"]
    //await bot.activateEntity(getItemFrame(mps.pos))
    // init the mapart state And mapid
    await pathfinder.astarfly(bot,mp_origin,null,null,null,true)
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let d_x = parseInt(i / mapart_name_cfg_cache["wrap"]["height"]);
        let d_y = i % mapart_name_cfg_cache["wrap"]["height"];
        // console.log(d_x,d_y)
        // let hasmap = getItemFrame
        //abc.metadata[8].nbtData.value.display.value.Name
        let mps = {
            dx: d_x,
            dy: d_y,
            pos: mp_origin.offset(d_x*mp_direction[facing]["inc_dx"],d_y*mp_direction[facing]["inc_dy"],d_x*mp_direction[facing]["inc_dz"]),
            hasmap: false,
            mapid: undefined,
            named: false,
        }
        let currentIF = getItemFrame(mps.pos)
        //console.log(currentIF?.metadata[8])
        if(currentIF&&currentIF?.metadata && currentIF?.metadata[8]?.itemId == 847){
            mps.hasmap = true
            mps.mapid = currentIF.metadata[8].nbtData.value.map.value;
        }
        if(mps.hasmap){
            mps.named = (currentIF.metadata[8].nbtData.value.display.value.Name) ? true : false ;
        }
        //console.log(mps.pos)
        maparts.push(mps)
        //break;
    }
    // execute
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let mps = maparts[i]
        if(!mps.hasmap||mps.named) continue
        await pathfinder.astarfly(bot,mps.pos,null,null,null,true)
        await sleep(100)
        let itemFrame = getItemFrame(mps.pos)
        if(!itemFrame){
            console.log(mps,"錯誤");
            continue
        }
        await bot.attack(itemFrame, false)
        // await sleep(50)
        // await pathfinder.astarfly(bot,mps.pos.offset(0,-1,0),null,null,null,true)
        // await sleep(50)
        try{
            await pickMapItem(mps.mapid)
        }catch(e){
            console.log("無法撿起地圖畫",mps)
        }
        await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]),null,null,null,true)
        await sleep(50)
        let anvil = await bot.openAnvil(bot.blockAt(new Vec3(mapart_name_cfg_cache.wrap.anvil[0], mapart_name_cfg_cache.wrap.anvil[1], mapart_name_cfg_cache.wrap.anvil[2])));
        let it = getMapItemByMapIDInInventory(mps.mapid)
        //console.log(it)
        let tgname = mapart_name_cfg_cache["wrap"]["name"] ? `${mapart_name_cfg_cache["wrap"]["name"]} &r- &b${mps.dx}-${mps.dy}` : `&b${mps.dx}-${mps.dy}`;
        await anvil.rename(it,tgname)
        await anvil.close();
        try{
            await pickMapItem(mps.mapid)
        }catch(e){
            console.log("無法取得地圖畫",mps)
        }
        let new_it = getMapItemByMapIDInInventory(mps.mapid)
        let st = new_it.slot
        //console.log(new_it)
        await bot.simpleClick.leftMouse(st)
        await bot.simpleClick.leftMouse(44)
        await bot.simpleClick.leftMouse(st)
        let fail_c = 0;
        while (fail_c < 10) {
            await pathfinder.astarfly(bot,mps.pos,null,null,null,true)
            await sleep(50)
            if (!getItemFrame(mps.pos)) {
                await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"])
                await pathfinder.astarfly(bot,mps.pos)
                //await pathfinder.astarfly(bot, mps.pos.offset(0, 0, 1), null, null, null, true)
                continue
            }
            //console.log("嘗試放置\n",bot.inventory.slots[44])
            await bot.activateEntity(getItemFrame(mps.pos))
            await sleep(1000)
            let check = getItemFrame(mps.pos);
            if (check && check.metadata[8]?.nbtData?.value?.map?.value == mps.mapid) {
                break;
            }
            fail_c++;
            //throw new Error("abc")
        }
        console.log(`放置 mp_${mps.dx}_${mps.dy}`)
        //break;
    }
    function getItemFrame(tg_pos) {
        for (let etsIndex in bot.entities) {
            if (!(bot.entities[etsIndex].mobType == 'Glow Item Frame' || bot.entities[etsIndex].mobType == 'Item Frame')) continue
            if (!bot.entities[etsIndex].position.equals(tg_pos)) continue
            return etsIndex, bot.entities[etsIndex]
            //console.log(etsIndex,bot.entities[etsIndex])
        }
    }
}
/**
 * Get mp item in inventory
 * @param {*} mpID 
 * @returns 
 */
function getMapItemByMapIDInInventory(mpID){
    // for(i in bot.inventory.slots){
    //     console.log(bot.inventory.slots[i])
    // }
    return bot.inventory.slots.find(item => item?.nbt?.value?.map?.value == mpID);
 }
async function pickMapItem(mpID){
    let timeout = false
    let to = setTimeout(() => {
        timeout = true;
    }, 15000);
    while(true){
        if(timeout) break;
        let ck = getMapItemByMapIDInInventory(mpID);
        if(ck) break;
        let et = bot.entities;
        for(i in et){
            if(et[i]?.mobType=='Item'&& et[i]?.metadata[8]?.itemId == 847 && et[i]?.metadata[8].nbtData?.value?.map?.value == mpID){
                await pathfinder.astarfly(bot,new Vec3(Math.round(et[i].position.x),Math.round(et[i].position.y),Math.round(et[i].position.z)),null,null,null,true)
            } 
            //console.log(et)
        }
        await sleep(10)
        //break;
        //let tget = bot.entities.find(e => e?.type)
    }
    if(timeout) throw new Error("撿起地圖畫超時");
    try{clearTimeout(to)}catch(e){}
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
async function stationRestock(stationConfig, RS_obj_array) {
    while (true) {
        try {
            await mcFallout.warp(bot, stationConfig["stationWarp"]);
            await sleep(2000);
        } catch (e) {
            console.log(e)
        }
        break;
    }
    for (let index = 0; index < RS_obj_array.length; index++) {
        await st_restock_single(stationConfig, RS_obj_array[index].name, RS_obj_array[index].count)
    }
    async function st_restock_single(stationConfig, restockid, quantity) {
        let findItemMaterialsIndex = -1;
        let remain = quantity;
        for (let fIMI_i = 0; fIMI_i < stationConfig.materials.length; fIMI_i++) {
            if (stationConfig.materials[fIMI_i][0] == restockid) {
                findItemMaterialsIndex = fIMI_i;
                break;
            }
        }
        //console.log(findItemMaterialsIndex);
        let shulkerBox_loc = v(stationConfig.materials[findItemMaterialsIndex][1]);
        let botton_loc;
        let standPos;
        let stand_dirc_offset = stationConfig.offset[stationConfig.materials[findItemMaterialsIndex][1][3]];
        let botton_dirc_offset = stationConfig.offset[stationConfig.materials[findItemMaterialsIndex][1][4]];
        if (stand_dirc_offset == undefined || botton_dirc_offset == undefined) {
            if (bot.blockAt(shulkerBox_loc.offset(-1, 0, 0)).name.indexOf('comparator') != -1) {
                standPos = shulkerBox_loc.offset(-3, 1, 0);
                botton_loc = shulkerBox_loc.offset(-2, 1, 0);
            }
            else if (bot.blockAt(shulkerBox_loc.offset(1, 0, 0)).name.indexOf('comparator') != -1) {
                standPos = shulkerBox_loc.offset(3, 1, 0);
                botton_loc = shulkerBox_loc.offset(2, 1, 0);
            }
            else if (bot.blockAt(shulkerBox_loc.offset(0, 0, -1)).name.indexOf('comparator') != -1) {
                standPos = shulkerBox_loc.offset(0, 1, -3);
                botton_loc = shulkerBox_loc.offset(0, 1, -2);
            }
            else if (bot.blockAt(shulkerBox_loc.offset(0, 0, 1)).name.indexOf('comparator') != -1) {
                standPos = shulkerBox_loc.offset(0, 1, 3);
                botton_loc = shulkerBox_loc.offset(0, 1, 2);
            }
        } else {
            standPos = shulkerBox_loc.offset(stand_dirc_offset[0], stand_dirc_offset[1], stand_dirc_offset[2]);
            botton_loc = shulkerBox_loc.offset(botton_dirc_offset[0], botton_dirc_offset[1], botton_dirc_offset[2]);
        }
        if (standPos.distanceTo(bot.entity.position) > 100) {
            console.log("距離盒子過遠或不再材料站內");
            console.log(`傳送中 ${stationConfig.stationWarp}`);
            bot.chat(`/warp ${stationConfig.stationWarp}`);
            await sleep(3000);
        }
        await pathfinder.astarfly(bot, standPos, null, null, null, false)
        await sleep(200);
        //console.log('目標點距離')
        //console.log(standPos.distanceTo(bot.entity.position));
        while (standPos.distanceTo(bot.entity.position) > 1) {
            bot._client.write("abilities", {
                flags: 2,
                flyingSpeed: 4.0,
                walkingSpeed: 4.0
            })
            await sleep(200);
            await pathfinder.astarfly(bot, standPos, null, null, null, true)
            await sleep(200);
        }
        if (quantity == -1) {
            let shu;
            let maxTryTime = 0;
            let success_open = false;
            while (maxTryTime++ < 5) {
                if (bot.blockAt(shulkerBox_loc).name == 'air') {
                    await bot.activateBlock(bot.blockAt(botton_loc));
                    await sleep(300);
                }
                try {
                    shu = await pTimeout(bot.openBlock(bot.blockAt(shulkerBox_loc)), 1000);
                    success_open = true;
                    console.log("開盒子成功");
                    break;
                } catch (e) {
                    console.log("開盒子失敗");
                    await sleep(100);
                }
            }
            if (success_open) {
                remain = await containerOperation.deposit(bot, shu, restockid, -1, false);
                shu.close();
            }
            else remain = -1;
            if (remain > 0 || remain == -1) {
                let overfull_shu_loc = v(stationConfig.overfull);
                let overfull_botton_loc;
                let overfull_standPos;
                let ofstand_dirc_offset = stationConfig.offset[stationConfig.materials[findItemMaterialsIndex][1][3]];
                let ofbotton_dirc_offset = stationConfig.offset[stationConfig.materials[findItemMaterialsIndex][1][4]];
                if (ofstand_dirc_offset == undefined || ofbotton_dirc_offset == undefined) {
                    if (bot.blockAt(overfull_shu_loc.offset(-1, 0, 0)).name.indexOf('comparator') != -1) {
                        overfull_standPos = overfull_shu_loc.offset(-3, 1, 0);
                        overfull_botton_loc = overfull_shu_loc.offset(-2, 1, 0);
                    }
                    else if (bot.blockAt(overfull_shu_loc.offset(1, 0, 0)).name.indexOf('comparator') != -1) {
                        overfull_standPos = overfull_shu_loc.offset(3, 1, 0);
                        overfull_botton_loc = overfull_shu_loc.offset(2, 1, 0);
                    }
                    else if (bot.blockAt(overfull_shu_loc.offset(0, 0, -1)).name.indexOf('comparator') != -1) {
                        overfull_standPos = overfull_shu_loc.offset(0, 1, -3);
                        overfull_botton_loc = overfull_shu_loc.offset(0, 1, -2);
                    }
                    else if (bot.blockAt(overfull_shu_loc.offset(0, 0, 1)).name.indexOf('comparator') != -1) {
                        overfull_standPos = overfull_shu_loc.offset(0, 1, 3);
                        overfull_botton_loc = overfull_shu_loc.offset(0, 1, 2);
                    }
                } else {
                    overfull_standPos = shulkerBox_loc.offset(ofstand_dirc_offset[0], ofstand_dirc_offset[1], ofstand_dirc_offset[2]);
                    overfull_botton_loc = shulkerBox_loc.offset(ofbotton_dirc_offset[0], ofbotton_dirc_offset[1], ofbotton_dirc_offset[2]);
                }
                await pathfinder.astarfly(bot, overfull_standPos, null, null, null, true);
                success_open = false, maxTryTime = 0;
                while (maxTryTime++ < 5) {
                    try {
                        shu = await pTimeout(bot.openBlock(bot.blockAt(overfull_shu_loc)), 1000);
                        success_open = true;
                        console.log("開盒子成功");
                        break;
                    } catch (e) {
                        console.log("開盒子失敗");
                        await sleep(100);
                    }
                }
                if (!success_open) return;
                else {
                    remain = await containerOperation.deposit(bot, shu, restockid, -1, false);
                    shu.close();
                }
            }
            //console.log(remain);
        } else {
            let maxTryTime = 0;
            ii: while (maxTryTime++ < 10) {
                //console.log()
                if (remain <= 0) break;
                let success_open = false;
                if (bot.blockAt(shulkerBox_loc)?.name == 'air') {
                    await bot.activateBlock(bot.blockAt(botton_loc));
                    await sleep(300);
                }
                let shu;
                try {
                    shu = await pTimeout(bot.openBlock(bot.blockAt(shulkerBox_loc)), 1000);
                    success_open = true;
                    console.log("開盒子成功");
                } catch (e) {
                    console.log("開盒子失敗");
                    await sleep(100);
                    continue ii
                }
                if (success_open) {
                    console.log("提取中...")
                    let tempremain = await containerOperation.withdraw(bot, shu, restockid, remain, false);
                    shu.close();
                    if (tempremain == -2) {
                        console.log("盒子空了 點及按鈕")
                        await bot.activateBlock(bot.blockAt(botton_loc));
                        await bot.waitForTicks(8);
                    } else {
                        remain = tempremain;
                    }
                    if (remain > 0) await bot.waitForTicks(15);
                }
            }

        }
    }

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