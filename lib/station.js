const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const pTimeout = require('p-timeout');      //目標弄掉這個
const containerOperation = require(`../lib/containerOperation`);
const mcFallout = require(`../lib/mcFallout`);
const pathfinder = require(`../lib/pathfinder`);
const { Vec3 } = require('vec3')
const v = require('vec3')
const wait = () => new Promise(setImmediate)
const { once } = require('events')
const station = {
  restock: async function(bot,stationConfig, RS_obj_array){
    await this.oldrestock(bot,stationConfig, RS_obj_array)
  },
  newrestock: async function(bot,stationConfig, RS_obj_array){
    console.log(stationConfig)
    //openContainerWithTimeout
    //check server
    /*
    if(!inSameServer){
        /ts
    }
    if(checkDistance){
        warp
    }
    */
    for (let index = 0; index < RS_obj_array.length; index++) {
        await st_restock_single(stationConfig, RS_obj_array[index].name, RS_obj_array[index].count)
    }
    async function st_restock_single(stationConfig, restockid, quantity){
        console.log(restockid,quantity)
    }
  },    
  oldrestock: async function(bot,stationConfig, RS_obj_array){
    while (true) {
        try {
            await mcFallout.warp(bot, stationConfig["stationWarp"]);
            await sleep(3000);
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
}
module.exports = station 
