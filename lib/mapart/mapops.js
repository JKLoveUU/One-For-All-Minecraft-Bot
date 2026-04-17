const { Vec3 } = require('vec3')
const v = require('vec3')
const containerOperation = require('../containerOperation')
const mcFallout = require('../mcFallout')
const pathfinder = require('../pathfinder')
const { sleep, readConfig } = require('../common')
const { mapartState, mp_direction } = require('./core')
const { getItemFrame, getMapItemByMapIDInInventory, pickMapItem, inv_sort, moveToEmptySlot, getEmptySlot } = require('./utils')
const { stationRestock } = require('./restock')

async function mp_open(task) {
    const { bot, bot_id, mcData } = mapartState
    const Item = require('prismarine-item')(bot.version)
    let mapart_open_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_open_cfg_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_open_cfg_cache.station}`);
    }
    console.log(mapart_open_cfg_cache["open"])
    await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
    await mcFallout.sethome(bot, 'mapart')
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
    let crtoffsetindex = 0;
    for (let dx = 0; dx < mapart_open_cfg_cache["open"]["width"]; dx++) {
        for (let dy = 0; dy < mapart_open_cfg_cache["open"]["height"]; dy++) {
            let csmp = {
                skip: false,
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
            if (currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
                csmp.mapid = currentIF.metadata[8].nbtData.value.map.value;
                csmp.finish = true;
            }
            mpstate.push(csmp)
        }
    }
    let blockToAdd = 'quartz_block'
    await moveToEmptySlot(44)
    for (let i = 0; i < mpstate.length;) {
        if (!bot.blockAt(mpstate[i].pos.offset(0, 0, -1))) {
            await pathfinder.astarfly(bot, mpstate[i].pos, null, null, null, false)
            await sleep(500)
            continue
        }
        if (bot.blockAt(mpstate[i].pos.offset(0, 0, -1)).name == 'air') {
            if (!bot.inventory?.slots[44] || bot.inventory?.slots[44].name != blockToAdd) {
                let invhasblockToAdd = -1
                for (let id = 9; id <= 43; id++) {
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
            continue
        }
        i++;
    }
    await moveToEmptySlot(44)
    for (let i = 0; i < mpstate.length;) {
        if (mpstate[i].itemframe || mpstate[i].skip) {
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
        await sleep(50)
    }
    for (let i = 0; i < mpstate.length; i++) {
        await inv_sort()
        if (mpstate[i].finish || mpstate[i].skip) continue
        if (getEmptySlot().length == 0) {
            await mcFallout.sethome(bot, 'mapart')
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
                await inv_sort()
            }
            await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
            await sleep(1500)
            await bot.chat("/homes mapart")
            await sleep(500)
        }
        await openMap(mpstate[i]);
    }
    await mcFallout.warp(bot, mapart_open_cfg_cache["open"]["warp"])
    await sleep(2000)
    await pathfinder.astarfly(bot, mapart_ori.offset(0, 0, 3), null, null, null, false)
    await putMapON()

    async function openMap(mps) {
        await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        while (bot.entity.position.distanceTo(mps.mapartRealPos.offset(64, 0, 64)) > 20) {
            await pathfinder.astarfly(bot, mps.mapartRealPos.offset(64, 0, 64), null, null, null, true)
        }
        console.log(`open At ${mps.mapartRealPos}`)
        await sleep(500)
        await mcFallout.sethome(bot, 'mapart')
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
        await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        bot._client.write("abilities", {
            flags: 2,
            flyingSpeed: 4.0,
            walkingSpeed: 4.0
        })
        for (let inv_i = 9; inv_i < 44; inv_i++) {
            if (bot.inventory.slots[inv_i] && bot.inventory.slots[inv_i].name == 'filled_map') {
                let lv = false;
                let mpID = bot.inventory.slots[inv_i].nbt.value.map.value;
                let mps = findByMapId(mpstate, mpID);
                if (mps) {
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
}

async function mp_name(task) {
    const { bot, bot_id, mcData } = mapartState
    const Item = require('prismarine-item')(bot.version)
    let mapart_name_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_name_cfg_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_name_cfg_cache.station}`);
    }
    await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"]);
    await sleep(1000)
    bot.setQuickBarSlot(8);
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    console.log(mapart_name_cfg_cache)
    await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]))
    let mp_origin = new Vec3(mapart_name_cfg_cache.wrap.origin[0], mapart_name_cfg_cache.wrap.origin[1], mapart_name_cfg_cache.wrap.origin[2])
    let maparts = []
    let facing = mapart_name_cfg_cache["wrap"]["facing"]
    await pathfinder.astarfly(bot, mp_origin, null, null, null, true)
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let d_x = parseInt(i / mapart_name_cfg_cache["wrap"]["height"]);
        let d_y = i % mapart_name_cfg_cache["wrap"]["height"];
        let mps = {
            dx: d_x,
            dy: d_y,
            pos: mp_origin.offset(d_x * mp_direction[facing]["inc_dx"], d_y * mp_direction[facing]["inc_dy"], d_x * mp_direction[facing]["inc_dz"]),
            hasmap: false,
            mapid: undefined,
            named: false,
        }
        let currentIF = getItemFrame(mps.pos)
        if (currentIF && currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
            mps.hasmap = true
            mps.mapid = currentIF.metadata[8].nbtData.value.map.value;
        }
        if (mps.hasmap) {
            mps.named = (currentIF.metadata[8].nbtData.value.display.value.Name) ? true : false;
        }
        maparts.push(mps)
    }
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let mps = maparts[i]
        if (!mps.hasmap || mps.named) continue
        await pathfinder.astarfly(bot, mps.pos, null, null, null, true)
        await sleep(100)
        let itemFrame = getItemFrame(mps.pos)
        if (!itemFrame) {
            console.log(mps, "錯誤");
            continue
        }
        console.log(`取下 ${mps.dx}_${mps.dy}`)
        await bot.attack(itemFrame, false)
        try {
            await pickMapItem(mps.mapid)
        } catch (e) {
            console.log("無法撿起地圖畫", mps)
        }
        await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]), null, null, null, true)
        await sleep(50)
        let anvil = await bot.openAnvil(bot.blockAt(new Vec3(mapart_name_cfg_cache.wrap.anvil[0], mapart_name_cfg_cache.wrap.anvil[1], mapart_name_cfg_cache.wrap.anvil[2])));
        let it = getMapItemByMapIDInInventory(mps.mapid)
        let tgname = mapart_name_cfg_cache["wrap"]["name"] ? `${mapart_name_cfg_cache["wrap"]["name"]} &r- &b${mps.dx}-${mps.dy}` : `&b${mps.dx}-${mps.dy}`;
        console.log(`命名 ${mps.dx}_${mps.dy}`)
        await anvil.rename(it, tgname)
        await anvil.close();
        try {
            await pickMapItem(mps.mapid)
        } catch (e) {
            console.log("無法取得地圖畫", mps)
        }
        let new_it = getMapItemByMapIDInInventory(mps.mapid)
        let st = new_it.slot
        await bot.simpleClick.leftMouse(st)
        await bot.simpleClick.leftMouse(44)
        await bot.simpleClick.leftMouse(st)
        let fail_c = 0;
        while (fail_c < 10) {
            await pathfinder.astarfly(bot, mps.pos, null, null, null, true)
            await sleep(50)
            if (!getItemFrame(mps.pos)) {
                await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"])
                await pathfinder.astarfly(bot, mps.pos)
                continue
            }
            console.log(`放置 mp_${mps.dx}_${mps.dy}`)
            await bot.activateEntity(getItemFrame(mps.pos))
            await sleep(1000)
            let check = getItemFrame(mps.pos);
            if (check && check.metadata[8]?.nbtData?.value?.map?.value == mps.mapid) {
                break;
            }
            fail_c++;
        }
        console.log(`${mps.dx}_${mps.dy} \x1b[32m完成\x1b[0m`)
    }
}

async function mp_copy(task) {
    const { bot, bot_id, mcData } = mapartState
    console.log("**此功能需要把廢土自動整理功能關掉**")
    const Item = require('prismarine-item')(bot.version)
    let mapart_name_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig
    if (mapart_name_cfg_cache["materialsMode"] == 'station') {
        stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_name_cfg_cache.station}`);
    }
    await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"]);
    await sleep(1000)
    bot.setQuickBarSlot(8);
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    if (mapart_name_cfg_cache["wrap"]["copy_amount"] > 64) {
        console.log("Not Support copy amount great than 64")
        return
    }
    let mp_origin = new Vec3(mapart_name_cfg_cache.wrap.origin[0], mapart_name_cfg_cache.wrap.origin[1], mapart_name_cfg_cache.wrap.origin[2])
    let mp_shu_origin = new Vec3(mapart_name_cfg_cache.wrap.copy_f_shulker[0], mapart_name_cfg_cache.wrap.copy_f_shulker[1], mapart_name_cfg_cache.wrap.copy_f_shulker[2])
    let maparts = []
    let facing = mapart_name_cfg_cache["wrap"]["facing"]
    let cartography_t_vec3 = v(mapart_name_cfg_cache["wrap"]["cartography_table"])
    let cartography_t_s_vec3 = v(mapart_name_cfg_cache["wrap"]["cartography_table_stand"])
    let standOffest = (new Vec3(mp_direction[facing]["inc_dx"], mp_direction[facing]["inc_dy"], mp_direction[facing]["inc_dz"])).cross(new Vec3(0, 1, 0))
    let box_amount = Math.ceil(mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]) / 27

    await pathfinder.astarfly(bot, mp_origin, null, null, null, true)
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let d_x = parseInt(i / mapart_name_cfg_cache["wrap"]["height"]);
        let d_y = i % mapart_name_cfg_cache["wrap"]["height"];
        let boxoffset = parseInt(i / 27)
        let mps = {
            dx: d_x,
            dy: d_y,
            pos: mp_origin.offset(d_x * mp_direction[facing]["inc_dx"], d_y * mp_direction[facing]["inc_dy"], d_x * mp_direction[facing]["inc_dz"]),
            box: mp_shu_origin.offset(boxoffset * mp_direction[facing]["inc_dx"], 0, boxoffset * mp_direction[facing]["inc_dz"]),
            s: i % 27,
            hasmap: false,
            mapid: undefined,
            amount: 0,
        }
        console.log(mps.pos)
        let currentIF = getItemFrame(mps.pos)
        console.log(currentIF)
        if (currentIF && currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
            mps.hasmap = true
            mps.mapid = currentIF.metadata[8].nbtData.value.map.value;
        }
        maparts.push(mps)
    }
    let checkIndex = 0;
    for (let i = 0; i < box_amount; i++) {
        console.log(`檢查第 ${i + 1}個盒子`)
        let boxVec = mp_shu_origin.offset(mp_direction[facing]["inc_dx"] * i, 0, mp_direction[facing]["inc_dz"] * i)
        await pathfinder.astarfly(bot, boxVec.offset(standOffest.x, standOffest.y, standOffest.z), null, null, null, true)
        await sleep(50)
        await pathfinder.astarfly(bot, boxVec.offset(standOffest.x, standOffest.y, standOffest.z), null, null, null, true)
        await sleep(50)
        await mcFallout.openPreventSpecItem(bot)
        let shulker_box, t = 0;
        while (t++ < 3 && !shulker_box) {
            shulker_box = await containerOperation.openContainerWithTimeout(bot, boxVec, 1000)
        }
        if (!shulker_box) {
            console.log(`開啟盒子-${i + 1} 失敗`, boxVec)
            return
        }
        for (let shu_index = 0; shu_index < 27 && checkIndex < maparts.length; shu_index++, checkIndex++) {
            if (shulker_box.slots[shu_index] == null) continue
            if (shulker_box.slots[shu_index].name != 'filled_map') {
                console.log(`box-${i + 1}-${shu_index}丟出異物 ${shulker_box.slots[shu_index].name}`)
                await bot.simpleClick.leftMouse(shu_index)
                await bot.simpleClick.leftMouse(-999)
            }
            else if (shulker_box.slots[shu_index]?.nbt?.value?.map?.value != maparts[checkIndex].mapid) {
                console.log(shulker_box.slots[shu_index])
                console.log(shulker_box.slots[shu_index]?.nbt?.value?.map?.value, maparts[checkIndex].mapid, checkIndex)
                console.log(`box-${i + 1}-${shu_index} map-id異常`)
                await shulker_box.close()
                return
            }
            maparts[checkIndex].amount = shulker_box.slots[shu_index].count
        }
        await shulker_box.close()
    }
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let mps = maparts[i]
        if (!mps.hasmap || mps.amount >= mapart_name_cfg_cache["wrap"].copy_amount) continue
        if (bot.inventory.count(mcData.itemsByName['map'].id) < mapart_name_cfg_cache["wrap"].copy_amount - mps.amount) {
            let crtmpam = bot.inventory.count(mcData.itemsByName['map'].id)
            let cap = (bot.inventory.emptySlotCount() - 2) * 64
            let require_amount = 0 - crtmpam;
            for (let require_amount_iterator = i; require_amount_iterator < maparts.length; require_amount_iterator++) {
                let crt_amount = (mapart_name_cfg_cache["wrap"].copy_amount - mps.amount)
                if (crt_amount > 0) require_amount += crt_amount;
            }
            if (mapart_name_cfg_cache["materialsMode"] == 'station') {
                await sleep(2500)
                await stationRestock(stationConfig, [{ name: "map", count: require_amount > cap ? cap : require_amount }])
                await sleep(500)
            }
            await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"]);
            await sleep(2500)
            i--
            continue
        }
        await pathfinder.astarfly(bot, mps.pos, null, null, null, true)
        await sleep(100)
        let itemFrame = getItemFrame(mps.pos)
        if (!itemFrame) {
            console.log(mps, "錯誤");
            continue
        }
        console.log(`取下 ${mps.dx}_${mps.dy}`)
        await bot.attack(itemFrame, false)
        try {
            await pickMapItem(mps.mapid)
        } catch (e) {
            console.log("無法撿起地圖畫", mps)
        }
        console.log(`複印 mp_${mps.dx}_${mps.dy}`)
        await pathfinder.astarfly(bot, cartography_t_s_vec3, null, null, null, true)
        await mcFallout.openPreventSpecItem(bot)
        await mapCopy(cartography_t_vec3, mps.mapid, mapart_name_cfg_cache["wrap"].copy_amount - mps.amount);
        await mcFallout.openPreventSpecItem(bot)
        let mt = 0
        let shulker_box
        while (!shulker_box && mt++ < 3) {
            await pathfinder.astarfly(bot, mps.box.offset(standOffest.x, standOffest.y, standOffest.z), null, null, null, true)
            await sleep(50)
            shulker_box = await containerOperation.openContainerWithTimeout(bot, mps.box, 3000);
        }
        if (!shulker_box) {
            console.log(`開啟盒子-${i + 1} 失敗`, mps.box)
            return
        }
        if (mapart_name_cfg_cache["wrap"].copy_amount - mps.amount == 64) {
            let tgmp = -1;
            for (let ff = 27; ff <= 62; ff++) {
                if (shulker_box.slots[ff]?.nbt?.value?.map?.value == mps.mapid && shulker_box.slots[ff]?.count == 64) {
                    tgmp = ff;
                    break;
                }
            }
            await bot.simpleClick.leftMouse(tgmp)
            await bot.simpleClick.leftMouse(mps.s)
        } else {
            let tgmp = -1;
            for (let ff = 27; ff <= 62; ff++) {
                if (shulker_box.slots[ff]?.nbt?.value?.map?.value == mps.mapid) {
                    tgmp = ff;
                    break;
                }
            }
            await bot.simpleClick.leftMouse(tgmp)
            await bot.simpleClick.rightMouse(tgmp)
            await bot.simpleClick.leftMouse(mps.s)
        }
        await shulker_box.close()
        let new_it = getMapItemByMapIDInInventory(mps.mapid)
        let st = new_it.slot
        if (st != 44) {
            await bot.simpleClick.leftMouse(st)
            await bot.simpleClick.leftMouse(44)
            await bot.simpleClick.leftMouse(st)
        }
        let fail_c = 0;
        while (fail_c < 10) {
            await pathfinder.astarfly(bot, mps.pos, null, null, null, true)
            await sleep(50)
            if (!getItemFrame(mps.pos)) {
                await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"])
                await pathfinder.astarfly(bot, mps.pos)
                continue
            }
            console.log(`放置 mp_${mps.dx}_${mps.dy}`)
            await bot.activateEntity(getItemFrame(mps.pos))
            await sleep(1000)
            let check = getItemFrame(mps.pos);
            if (check && check.metadata[8]?.nbtData?.value?.map?.value == mps.mapid) {
                break;
            }
            fail_c++;
        }
        console.log(`${mps.dx}_${mps.dy} \x1b[32m完成\x1b[0m`)
    }
}

async function mapCopy(cartography_table_pos, mapid, amount = 1) {
    const { bot } = mapartState
    let ct
    let ttry = 0;
    while (!ct && ttry < 3) {
        ct = await containerOperation.openContainerWithTimeout(bot, cartography_table_pos, 500)
        ttry++
    }
    if (!ct) throw new Error("can't open cartography_table")
    for (let i = 0; i < amount; i++) {
        await mapCopyOne(ct, mapid);
    }
    await ct.close()

    async function mapCopyOne(cartography_table, mapid) {
        let targetMap = cartography_table.slots.find(item => item?.nbt?.value?.map?.value == mapid)
        let emptyMap = cartography_table.findInventoryItem('map', null, false)
        await bot.simpleClick.leftMouse(targetMap.slot)
        await bot.simpleClick.leftMouse(0)
        await bot.simpleClick.leftMouse(emptyMap.slot)
        await bot.simpleClick.leftMouse(1)
        let outputitem = JSON.parse(JSON.stringify(cartography_table.slots[0]))
        outputitem.slot = 2;
        outputitem.count = outputitem.count * 2 > 64 ? 64 : outputitem.count * 2;
        let slot1 = JSON.parse(JSON.stringify(cartography_table.slots[1]))
        slot1.count = slot1.count - 1
        if (slot1.count < 1) slot1 = null
        await cartography_table.updateSlot(2, outputitem)
        await bot.putAway(2)
        await cartography_table.updateSlot(0, null)
        await cartography_table.updateSlot(1, slot1)
        await bot.putAway(1)
    }
}

module.exports = { mp_open, mp_name, mp_copy, mapCopy }
