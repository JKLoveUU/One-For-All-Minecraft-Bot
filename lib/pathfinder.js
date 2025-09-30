const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
const { Vec3 } = require('vec3')
const mcFallout = require('./mcFallout');
let maxExploreDistanceSquare = 85;
let maxExploreDistance = 8;
let lastChatTime = Date.now();
let autoCD = Date.now();
let moveError = 0;
var astarCD = false;
var deathFlag = false;
const legitimate_block = ['air', 'cave_air', 'light', 'water', 'tripwire', 'kelp_plant', 'kelp'];
const pathfinder = {
    astarfly: async function (bot, target, border1, border2, lastFlyTime, mute) {
        await this.astarV2(bot, target, mute)
        return;
    },
    /**
     * A* Search 並限制可循路區塊
     * @param {Vec3} target - 目標座標.
     * @param {Vec3} border1 - 邊界座標1.
     * @param {Vec3} border2 - 邊界座標2.
     */
    astarflyV1: async function (bot, target, border1, border2, lastFlyTime, mute) {  //直接使用方塊座標
        const mcData = require('minecraft-data')(bot.version)
        mute = (mute === undefined ? false : mute)
        deathFlag = false;
        let distance = bot.entity.position.distanceTo(target);
        if (!lastFlyTime) lastFlyTime = 0;
        let moveError = 0;
        bot.on('forcedMove', movewrong);
        bot.on('death', deathFlagSet);
        if (!mute) console.log(`\x1b[32mA*\x1b[0m ${bot.entity.position} -> ${target}`)
        let astarStartT = Date.now();
        let astar_timer = 0;
        let alreadyCheckTargetNoObstacle = false;
        let secondTargetMaxDistance = 1;
        while (true) {// \x1b[33m
            // bot._client.write("abilities", {
            //     flags: 2,
            //     flyingSpeed: 4.0,
            //     walkingSpeed: 4.0
            // })
            if (deathFlag) break;
            if (!alreadyCheckTargetNoObstacle && bot.blockAt(target) != null && bot.blockAt(target.offset(0, 1, 0)) != null && bot.blockAt(target.offset(0, -1, 0)) != null) {//進加載區後判斷是否被阻擋
                alreadyCheckTargetNoObstacle = true;
                let targetD1 = bot.blockAt(target.offset(0, -1, 0)).name
                let tallerthanOneBlock = targetD1 && (targetD1.includes("wall") || targetD1.includes("fence"))
                if (legitimate_block.indexOf(bot.blockAt(target).name) == -1 || legitimate_block.indexOf(bot.blockAt(target.offset(0, 1, 0)).name) == -1 || tallerthanOneBlock) {
                    if (!mute) bot.logger(false, 'DEBUG', bot.username, `目標被阻擋 尋找替換點位${bot.blockAt(target).name} ${bot.blockAt(target.offset(0, 1, 0)).name}.`);
                    let matchingType = [];
                    for (let gen_m = 0; gen_m < legitimate_block.length; gen_m++) {
                        matchingType.push(mcData.blocksByName[legitimate_block[gen_m]].id)
                    }
                    //console.log(matchingType)
                    let secondPos = bot.findBlock({
                        point: target,
                        matching: matchingType,  //["air"]
                        useExtraInfo: b => (legitimate_block.indexOf(bot.blockAt(b.position.offset(0, 1, 0)).name) != -1) && !b.position.equals(target.offset(0, 0, 0)),
                        maxDistance: secondTargetMaxDistance
                    })
                    if (secondPos == null) {
                        // if(secondTargetMaxDistance > 4)
                        bot.logger(false, 'DEBUG', bot.username, `${secondTargetMaxDistance++} 格 無法找到替補座標 ${target} 加大搜尋範圍重新嘗試`);
                        alreadyCheckTargetNoObstacle = false;
                        // continue
                    } else {
                        if (!mute) bot.logger(false, 'DEBUG', bot.username, `替換終點座標 ${target} -> ${secondPos.position}`);
                        target = secondPos.position;
                    }
                }
            }
            let locNow = new Vec3(Math.round(bot.entity.position.x - 0.5), Math.round(bot.entity.position.y), Math.round(bot.entity.position.z - 0.5));
            if (locNow.equals(target) || astar_timer > 70) {
                //console.log(locNow.equals(target))
                //console.log(astar_timer)
                //console.log(`A* finish`);
                break;
            }
            // if(moveError>0){
            //     console.log('重設')
            //     bot._client.write("abilities", {
            //         flags: 6,
            //         flyingSpeed: 4.0,
            //         walkingSpeed: 4.0
            //     })
            //     //await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
            //     await sleep(100);
            //     moveError=0;
            // }
            await astar(locNow, target, border1, border2);
            astar_timer++;
        }
        async function astar(locNow, target, border1, border2) {
            // console.log(locNow+"->"+target);
            let astar_start_time = Date.now();
            let OPEN = [];
            let CLOSE = [];
            let start = locNow;
            start.g = 0;
            start.h = Math.abs(target.x - start.x) + Math.abs(target.y - start.y) + Math.abs(target.z - start.z);
            start.f = start.h + start.g;
            start.step = 0;
            start.distanceToParent = -1;
            start.parentIndex = -1;
            OPEN.push(start);
            bot._client.write("abilities", {
                flags: 2,
                flyingSpeed: 4.0,
                walkingSpeed: 4.0
            })
            //console.log(OPEN.length);//
            let end;
            while (OPEN.length > 0) {
                if (deathFlag) {
                    bot.off('death', deathFlagSet);
                    return false;
                }
                await wait()
                if (Date.now() - astar_start_time > 10000) {
                    end = start;
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*超時 pos: ${start} target: ${target}\x1b[0m wait 30 ms`);
                    await sleep(50);
                    break;
                }
                let current, lowestF_cost = Number.MAX_SAFE_INTEGER, lowestH_cost = Number.MAX_SAFE_INTEGER;
                let lowest_id = -1;
                for (let findLowest_cost = 0; findLowest_cost < OPEN.length; findLowest_cost++) {
                    if (OPEN[findLowest_cost].f <= lowestF_cost) {
                        if (OPEN[findLowest_cost].h < lowestH_cost) {
                            current = OPEN[findLowest_cost];
                            lowestH_cost = current.h;
                            lowestF_cost = current.f;
                            lowest_id = findLowest_cost;
                        }
                    }
                }
                OPEN.splice(lowest_id, 1);
                CLOSE.push(current)
                if (current.h == 0 || current.step >= 16) { //test
                    end = current;
                    break;
                }
                //GET NEIGHBOR
                let maxExplore = 8;
                for (let dx = 0, dy = 1, dz = 0; dy <= maxExplore; dy++) {   //向UP
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        continue;
                        // break;//有方塊就直接break
                    }
                }
                for (let dx = 0, dy = -1, dz = 0; dy >= -maxExplore; dy--) {   //向DOWN
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        continue;
                        //break;//有方塊就直接break
                    }
                }
                for (let dx = 0, dy = 0, dz = -1; dz >= -maxExplore; dz--) {   //向NORTH
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        break;//有方塊就直接break
                    }
                }
                for (let dx = 0, dy = 0, dz = 1; dz <= maxExplore; dz++) {     //向SOUTH
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        break;//有方塊就直接break
                    }
                }
                for (let dx = -1, dy = 0, dz = 0; dx >= -maxExplore; dx--) {     //向WEST
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        break;//有方塊就直接break
                    }
                }
                for (let dx = 1, dy = 0, dz = 0; dx <= maxExplore; dx++) {     //向EAST
                    await wait()
                    let nowtest_down = new Vec3(current.x + dx, current.y + dy, current.z + dz);
                    let nowtest_up = new Vec3(current.x + dx, current.y + dy + 1, current.z + dz);
                    if (bot.blockAt(nowtest_down) == null || bot.blockAt(nowtest_up) == null || CLOSE.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) >= 0) {
                        continue;
                    }
                    if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) { //TRAVERSABLE
                        let nowTest_dd = new Vec3(current.x + dx, current.y + dy - 1, current.z + dz);
                        if (bot.blockAt(nowTest_dd) != null) {
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if (ndd_bname.includes("wall") || ndd_bname.includes("fence")) continue
                        } else {
                            continue
                        }
                        //這裡需檢查是否在OPEN
                        nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                        nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                        nowtest_down.f = nowtest_down.h + nowtest_down.g;
                        nowtest_down.step = current.step + 1;
                        nowtest_down.parentIndex = CLOSE.length - 1;
                        nowtest_down.distanceToParent = Math.abs(dx + dy + dz);
                        if (OPEN.findIndex(element => element.x == nowtest_down.x && element.y == nowtest_down.y && element.z == nowtest_down.z) == -1) {
                            OPEN.push(nowtest_down);
                        }
                    }
                    else {
                        break;//有方塊就直接break
                    }
                }
            }
            let Path = [];
            if (end == null || end == undefined) {
                end = start;
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*未發現路徑 ${locNow} ${target}\x1b[0m wait 50ms`);
                await sleep(1000);
                // 可能人死了
                return false;
            }
            while (end.parentIndex != -1) {
                Path.unshift(new Vec3(end.x + 0.5, end.y + 0.1, end.z + 0.5))
                end = CLOSE[end.parentIndex];
            }
            Path.unshift(new Vec3(start.x + 0.5, start.y + 0.1, start.z + 0.5))
            /*
            for(let mergeStart=0;mergeStart<Path.length;mergeStart++){
                //console.log(`MS: ${mergeStart}`)
                let canMergeD=0;
                for(let ck_mergeStart=mergeStart+2;ck_mergeStart<mergeStart+15&&ck_mergeStart<Path.length;ck_mergeStart++){
                    let idf=canTeleport(bot,Path[mergeStart],Path[ck_mergeStart])        
                    if(idf==-1) break
                    else if(idf==false) continue
                    else if(idf==true) canMergeD=ck_mergeStart-mergeStart;
                }
                if(canMergeD!=0){
                    //console.log(`delete ${Path.splice(mergeStart+1,canMergeD-1)}`);
                }
            }*/
            for (let i = 1; i < Path.length; i++) {
                //console.log(`step${i} ${Path[i].x-0.5} ${Path[i].y-0.1} ${Path[i].z-0.5}`);
                //if(moveError>=2) break;
                //console.log(Path[i]);
                //await waitCD(lastFlyTime,50);
                while (astarCD) {
                    await wait()
                    await sleep(1)
                }
                bot.entity.position = Path[i];
                astarCD = true;
                setTimeout(function () {
                    astarCD = false;
                }, 50)
                //await b_sleep(51);
                await sleep(5)     //exP 5
                //lastFlyTime = Date.now();
            };
            //if(moveError<2) moveError=0;

            //console.log("7 step")
            //break;
        }
        let astarEndT = Date.now();
        bot.off('forcedMove', movewrong);
        bot.off('death', deathFlagSet);
        if (!mute) bot.logger(false, 'DEBUG', `A*共計耗時\x1b[33m${astarEndT - astarStartT}\x1b[0m ms 距離${Math.round(distance * 10) / 10} M  速率 ${Math.round(distance * 10 / ((astarEndT - astarStartT) / 1000)) / 10}m/s`);
        // return lastFlyTime;      
        return 0
    },
    astarV2: async function (bot, target, mute = true) {
        const MAX_ASTAR_EXECUTE_COUNT = 30;
        const mcData = require('minecraft-data')(bot.version)
        deathFlag = false;
        bot.on('death', deathFlagSet);
        bot.on('forcedMove', forcedMove);
        if (!mute) console.log(`\x1b[32mA*\x1b[0m ${bot.entity.position} -> ${target}`)
        let alreadyCheckTargetNoObstacle = false;
        let secondTargetMaxDistance = 1;
        let astarExecuteCount = 0;
        let distance = bot.entity.position.distanceTo(target);
        let astarStartT = Date.now();
        let astar_timer = 0;
        while (true) {
            if (deathFlag) {
                bot.off('death', deathFlagSet);
                bot.off('forcedMove', forcedMove);
                return false;
            }
            // 替換阻擋目標
            if (!alreadyCheckTargetNoObstacle && bot.blockAt(target) != null && bot.blockAt(target.offset(0, 1, 0)) != null && bot.blockAt(target.offset(0, -1, 0)) != null) {//進加載區後判斷是否被阻擋
                alreadyCheckTargetNoObstacle = true;
                let targetD1 = bot.blockAt(target.offset(0, -1, 0)).name
                let tallerthanOneBlock = targetD1 && (targetD1.includes("wall") || targetD1.includes("fence"))
                if (legitimate_block.indexOf(bot.blockAt(target).name) == -1 || legitimate_block.indexOf(bot.blockAt(target.offset(0, 1, 0)).name) == -1 || tallerthanOneBlock) {
                    if (!mute) bot.logger(false, 'DEBUG', bot.username, `目標被阻擋 尋找替換點位${bot.blockAt(target).name} ${bot.blockAt(target.offset(0, 1, 0)).name}.`);
                    let matchingType = [];
                    for (let gen_m = 0; gen_m < legitimate_block.length; gen_m++) {
                        matchingType.push(mcData.blocksByName[legitimate_block[gen_m]].id)
                    }
                    //console.log(matchingType)
                    let secondPos = bot.findBlock({
                        point: target,
                        matching: matchingType,  //["air"]
                        useExtraInfo: b => (legitimate_block.indexOf(bot.blockAt(b.position.offset(0, 1, 0)).name) != -1) && !b.position.equals(target.offset(0, 0, 0)),
                        maxDistance: secondTargetMaxDistance
                    })
                    if (secondPos == null) {
                        // if(secondTargetMaxDistance > 4)
                        bot.logger(false, 'DEBUG', bot.username, `${secondTargetMaxDistance++} 格 無法找到替補座標 ${target} 加大搜尋範圍重新嘗試`);
                        alreadyCheckTargetNoObstacle = false;
                        // continue
                    } else {
                        if (!mute) bot.logger(false, 'DEBUG', bot.username, `替換終點座標 ${target} -> ${secondPos.position}`);
                        target = secondPos.position;
                    }
                }
            }
            let locNow = getRoundPos(bot.entity.position)
            if (locNow.equals(target) || astarExecuteCount > MAX_ASTAR_EXECUTE_COUNT) {
                break;
            }
            // 執行A*
            let paths = await astarV2FindPath(bot, target)
            // console.log(paths)
            if (paths.length > 0) {
                if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[32mA*發現路徑 ${locNow} ${target}\x1b[0m 開始移動`);
                await astarV2Move(bot, paths)
            } else {
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*未發現路徑 ${locNow} ${target}\x1b[0m 結束`);
                // 用來刷新座標
                // bot.entity.position = new Vec3(99999,99999,99999)
                await sleep(1000);
                // if( Date.now() - lastChatTime >= 5_000){
                //     await mcFallout.sethome(bot,'p')
                //     lastChatTime = Date.now();
                //     await sleep(3_000);
                //     bot.chat("/home p")
                // }
                break
            }
            astarExecuteCount++;
        }
        let astarEndT = Date.now();
        if (!mute) bot.logger(false, 'DEBUG', `A*共計耗時\x1b[33m${astarEndT - astarStartT}\x1b[0m ms 距離${Math.round(distance * 10) / 10} M  速率 ${Math.round(distance * 10 / ((astarEndT - astarStartT) / 1000)) / 10}m/s`);
        bot.off('death', deathFlagSet);
        bot.off('forcedMove', forcedMove);
        return true;
    }
}
async function astarV2FindPath(bot, target, mute = true) {
    let targetPosBlock = bot.blockAt(target)
    let canSeeTarget = !targetPosBlock
    let touchUnLoadChunk = false;
    let astar_start_time = Date.now();
    let OPEN = new Map();   // 應該要維護一個優先隊列
    let CLOSE = new Map();
    let OBSTACLE = {};
    let start = getRoundPos(bot.entity.position);
    start.g = 0;
    start.h = Math.abs(target.x - start.x) + Math.abs(target.y - start.y) + Math.abs(target.z - start.z);
    start.f = start.h * 1.5 + start.g;  //MC WEIGHT ASTAR 1.5
    start.step = 0;
    start.distanceToParent = -1;
    start.parentIndex = -1;
    OPEN.set(getHash(start), start);
    let end;
    while (OPEN.size > 0) {
        if (deathFlag) {
            bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*死亡 flag 結束\x1b[0m`);
            return [];
        };
        await wait()
        // Get the lowest F cost node
        let current, lowestF_cost = Number.MAX_SAFE_INTEGER, lowestH_cost = Number.MAX_SAFE_INTEGER;
        let currentKey = null;
        for (const [key, node] of OPEN) {
            if (node.f <= lowestF_cost) {
                if (node.h < lowestH_cost) {
                    current = node;
                    lowestH_cost = node.h;
                    lowestF_cost = node.f;
                    currentKey = key;
                }
            }
        }
        if (Date.now() - astar_start_time > 3_000) {
            // for (let findLowest_cost = 0; findLowest_cost < Object.keys(CLOSE).length; findLowest_cost++) {
            //     if (CLOSE[Object.keys(CLOSE)[findLowest_cost]].h < lowestF_cost) {
            //         // if (CLOSE[Object.keys(CLOSE)[findLowest_cost]].h < lowestH_cost) {
            //             current = CLOSE[Object.keys(CLOSE)[findLowest_cost]];
            //             lowestH_cost = current.h;
            //             lowestF_cost = current.f;
            //             lowest_id = findLowest_cost;
            //         // }
            //     }
            // }
            end = current;
            bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*超時 ${start} -> ${target}\x1b[0m wait 50 ms`);
            console.log("astarV2超時 call astarflyV1")
            await pathfinder.astarflyV1(bot, target)
            return [];
            await sleep(50);
            break;
        }
        // remove current from OPEN
        OPEN.delete(currentKey)
        // add current to CLOSE
        CLOSE.set(getHash(current), current)
        // if current is the target node 
        // or some reason
        if (current.h == 0) { //test
            end = current;
            if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[32mA*找到目標 結束\x1b[0m`);
            break;
        } else if (touchUnLoadChunk) {
            end = current;
            if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*觸碰未加載區域 結束\x1b[0m`);
            break;
        } else if (current.step >= 9) {
            end = current;
            if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*步數超過9 結束\x1b[0m`);
            break;
        }
        //GET NEIGHBOR
        let maxExplore = 8;
        let offset = [
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
            [1, 0, 0],
            [-1, 0, 0],
        ]
        for (let i = 0; i < offset.length; i++) {
            for (let d = 1; d <= maxExplore; d++) {
                await wait()
                let nowtest_down = new Vec3(current.x + offset[i][0] * d, current.y + offset[i][1] * d, current.z + offset[i][2] * d);
                let nowtest_up = new Vec3(current.x + offset[i][0] * d, current.y + offset[i][1] * d + 1, current.z + offset[i][2] * d);
                let nowtest_down_down = new Vec3(current.x + offset[i][0] * d, current.y + offset[i][1] * d - 1, current.z + offset[i][2] * d);
                let upblock = bot.blockAt(nowtest_up)
                let downblock = bot.blockAt(nowtest_down)
                let down_downblock = bot.blockAt(nowtest_down_down)
                if (upblock == null || downblock == null) {
                    touchUnLoadChunk = true;
                    continue;
                }
        if (CLOSE.has(getHash(nowtest_down))) {
                    continue;
                }
                // if (OBSTACLE[getHash(nowtest_down)]) {
                //     continue;
                // }
                if (legitimate_block.indexOf(bot.blockAt(nowtest_down).name) >= 0 && legitimate_block.indexOf(bot.blockAt(nowtest_up).name) >= 0) {
                    // 排除牆壁 等 會擋路的
                    if (!down_downblock) {
                        touchUnLoadChunk = true;
                        break;
                    }
                    if (down_downblock.name.includes("wall") || down_downblock.name.includes("fence")) {
                        // OBSTACLE[getHash(nowtest_down)] = true;
                        if (Math.abs(offset[i][1]) > 0) {
                            continue
                        } else {
                            break;
                        }
                    }
                    if (OPEN.has(getHash(nowtest_down))) {
                        continue
                    };
                    nowtest_down.g = Math.abs(start.x - nowtest_down.x) + Math.abs(start.y - nowtest_down.y) + Math.abs(start.x - nowtest_down.z);
                    nowtest_down.h = Math.abs(target.x - nowtest_down.x) + Math.abs(target.y - nowtest_down.y) + Math.abs(target.z - nowtest_down.z);
                    nowtest_down.f = nowtest_down.h * 1.5 + nowtest_down.g;
                    nowtest_down.step = current.step + 1;
                    nowtest_down.parentIndex = getHash(current);
                    nowtest_down.distanceToParent = Math.abs(offset[i][0] * d + offset[i][1] * d + offset[i][2] * d);
                    OPEN.set(getHash(nowtest_down), nowtest_down);
                } else {
                    // OBSTACLE[getHash(nowtest_down)] = true;
                    if (Math.abs(offset[i][1]) > 0) {
                        continue
                    } else {
                        break;
                    }
                }
            }
        }

    }
    let Path = [];
    if (end == null || end == undefined) {
        end = start;
        bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*未發現路徑 ${start} ${target}\x1b[0m wait 50ms`);
        await sleep(1000);
        // 可能人死了
        return [];
    }
    while (end.parentIndex != -1) {
        Path.unshift(new Vec3(end.x + 0.5, end.y + 0.1, end.z + 0.5))
        end = CLOSE.get(end.parentIndex)
    }
    Path.unshift(new Vec3(start.x + 0.5, start.y + 0.1, start.z + 0.5))
    return Path;
}
async function astarV2Move(bot, paths) {
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    for (let i = 1; i < paths.length; i++) {
        while (astarCD) {
            await wait()
            await sleep(1)
        }
        bot.entity.position = paths[i];
        astarCD = true;
        setTimeout(function () {
            astarCD = false;
        }, 50)
        //await b_sleep(51);
        await sleep(5)     //exP 5
        //lastFlyTime = Date.now();
    };
}
function getHash(pos) { return `${pos.x}-${pos.y}-${pos.z}` }
// function getHash(pos) {
//     const X = pos.x + 32768;  // [-32768, 32767] → [0, 65535]
//     const Y = pos.y + 32768;  // 同樣偏移，雖然實際用不到那麼大
//     const Z = pos.z + 32768;

//     return (BigInt(X) << 32n) | (BigInt(Y) << 16n) | BigInt(Z);
// }
// function fromHash(hash) {
//     const Z = hash & 0xFFFF;
//     const Y = (hash >> 16) & 0xFFFF;
//     const X = (hash >> 32) & 0xFFFF;

//     return {
//         x: X - 32768,
//         y: Y - 32768,
//         z: Z - 32768
//     };
// }

function getRoundPos(pos) {
    let r = new Vec3(Math.round(pos.x - 0.5), Math.round(pos.y), Math.round(pos.z - 0.5));
    return r
}
function movewrong() {
    moveError++;
}
function deathFlagSet() {
    deathFlag = true;
}
function forcedMove() {
    // console.log("forcedMove")
}
module.exports = pathfinder 
