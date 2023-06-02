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
const { dirxml } = require('console');
const { astarfly } = require('../lib/pathfinder');
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
var whetherPause = false, stop = false;
let logger, mcData, bot_id, bot
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
    "wrap": {
        folder: "",  //Folder of mapart 直接用投影檢查 地圖畫 是否正確
        warp: "Example_1",
        height: 1,
        width: 1,
        name: "ExampleMP_Name",
        source: "https://www.pixiv.net/artworks/92433849",
        artist: "https://www.pixiv.net/users/3036679",
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
        {
            name: "test",
            identifier: [
                "test",
            ],
            execute: mp_test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        },
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
        {
            name: "地圖畫 開圖",
            identifier: [
                "open",
                "o",
            ],
            execute: mp_open,
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
    if (materialsMode == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_build_cache.station}`);
    } else {
        await notImplemented(task)
        return
    }
    if (!fs.existsSync(mapart_global_cfg.schematic_folder + mapart_build_cache.schematic.filename)) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請檢查設定`,
            `未發現投影 ${task.content[2]} r請檢查設定`,
            null,
        );
        return;
    }
    console.log("build test")
    //get cache here
    let currentMPCFG_Hash = get_hash_cfg(mapart_build_cache.schematic);
    if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
        save_cache(build_cache)
    } else {
        build_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    }
    console.log(`hash\n${build_cache.hash}\n${currentMPCFG_Hash}`)
    if (build_cache.hash != currentMPCFG_Hash) {
        //重新蓋
    }
    //繼續蓋
}
async function mp_open(task) {
    let mapart_open_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_open_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_open_cache.station}`);
    }
    console.log(mapart_open_cache["wrap"])
    await mcFallout.warp(bot, mapart_open_cache["wrap"]["warp"])
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
    const mapart_ori = new Vec3(sx + 1, mapart_open_cache["schematic"]["placementPoint_y"] - 2, sz)
    console.log(mapart_ori)
    let mpstate = [];
    /**
     *      Init 檢查是否有未完成
    */

    for (let dx = 0; dx < mapart_open_cache["wrap"]["width"]; dx++) {
        for (let dy = 0; dy < mapart_open_cache["wrap"]["height"]; dy++) {
            let csmp = {
                x: dx,
                y: dy,
                z: 0,
                mapartRealPos: new Vec3(sx + 128 * (dx * mapart_open_cache["wrap"]["height"] + dy), 256, sz),
                pos: mapart_ori.offset(dx, 0 - dy, 0),
                itemframe: false,
                mapid: undefined,
                finish: false,
            }
            let currentIF = getItemFrame(mapart_ori.offset(dx, 0 - dy, 0))
            if (currentIF) csmp.item = true;
            if (currentIF?.metadata && currentIF?.metadata[8]?.itemId == 847) {
                //console.log(currentIF.metadata[8].nbtData.value.map.value)
                csmp.mapid = currentIF.metadata[8].nbtData.value.map.value;
                csmp.finish = true;
            }
            mpstate.push(csmp)
        }
    }

    for (let i = 0; i < mpstate.length; i++) {
        await inv_sort()
        if (mpstate[i].finish) continue
        if (getEmptySlot().length == 0) {
            await bot.chat("/sethome mapart")
            await sleep(200)
            await mcFallout.warp(bot, mapart_open_cache["wrap"]["warp"])
            await sleep(500)
            await putMapON()
            await bot.chat("/homes mapart")
            await sleep(500)
        }
        await inv_sort()
        if (!bot.inventory?.slots[43]) {
            if (mapart_open_cache["materialsMode"] == 'station') {
                await stationRestock(stationConfig, [{ name: "map", count: mpstate.length }])
                await sleep(500)
                await stationRestock(stationConfig, [{ name: "map", count: mpstate.length }])
                await inv_sort()
            }
            await mcFallout.warp(bot, mapart_open_cache["wrap"]["warp"])
            await sleep(1500)
            await bot.chat("/homes mapart")
            await sleep(500)
        }
        //open
        await openMap(mpstate[i]);
        console.log(`mp_${mpstate[i].x}_${mpstate[i].y} 完成`)
        //return
    }
    await mcFallout.warp(bot, mapart_open_cache["wrap"]["warp"])
    await sleep(2000)
    await putMapON()
    //console.log(mpstate)
    //console.log(mpstate[0])
    async function openMap(mps) {
        await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        //console.log(mps)
        console.log(`open At ${mps.mapartRealPos}`)
        await pathfinder.astarfly(bot, mps.mapartRealPos.offset(64, 0, 64), null, null, null, true)
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
async function mp_test(task) {
    let mapart_open_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_open_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_open_cache.station}`);
    }
    //console.log(stationConfig)
    await stationRestock(stationConfig, [{ name: 'map', count: 64 }])
}
async function stationRestock(stationConfig, RS_obj_array) {
    while (true) {
        try {
            await mcFallout.warp(bot, stationConfig["stationWarp"]);
            await sleep(500);
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