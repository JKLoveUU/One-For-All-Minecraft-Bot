const { sleep } = require('./common')
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
var forcedMoveFlag = false;
var abnormalFlightFlag = false;
const legitimate_block = ['air', 'cave_air', 'light', 'water', 'tripwire', 'kelp_plant', 'kelp',"wheat","potatoes","carrots","beetroots","oak_wall_sign"];
const pathfinder = {
    // 結果為 false
    // 可以用這兩個判斷原因
    errorRepeatCount: 0,
    noPathError: 0,
    loopErrorRepeatCount: 0,
    lastPathResult: {
        ok: false,
        message: '',
        reason: '',  // 'arrived'|'death'|'forced_move'|'no_path'|'abnormal_flight'|'distance_increase'|'loop'|'timeout'
    },
    _maxUsedTime: 30_000,
    _maxUsedTimeV2: 3_000, //A* V2 最大使用時間
    _maxUsedTimeJPS: 3_000, //JPS 單次搜尋最大使用時間
    astarfly: async function (bot, target, border1, border2, lastFlyTime, mute=true) {
        bot._client.write("abilities", {
            flags: 0b0111,
            flyingSpeed: 4.0,
            walkingSpeed: 4.0
        })
        bot.entity.onGround = false;
        // bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
        // let rs = await this.jps(bot, target, mute)
        let rs = await this.astarV2(bot, target, mute)
        return rs;
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
                if (Date.now() - astar_start_time > pathfinder._maxUsedTime) {
                    end = start;
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA* V1超時 pos: ${start} target: ${target}\x1b[0m wait 30 ms`);
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
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA* v1 未發現路徑 ${locNow} ${target}\x1b[0m wait 1000ms`);
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
     /**
     * A* Search V2 
     * @param {Bot} bot - bot實例.
     * @param {Vec3} target - 目標座標.
     * @param {Vec3} mute - 是否靜音.
     */
    astarV2: async function (bot, target, mute = true) {
        const MAX_ASTAR_EXECUTE_COUNT = 30;
        const mcData = require('minecraft-data')(bot.version)
        deathFlag = false;
        moveError = 0;
        forcedMoveFlag = false;
        abnormalFlightFlag = false;
        pathfinder.lastPathResult = { ok: false, message: '', reason: '' };
        const abnormalFlightCheck = (jsonMsg) => {
            const msg = jsonMsg.toString();
            if (/\[系統\] 偵測到異常飛行移動！/.test(msg)) {
                abnormalFlightFlag = true;
                pathfinder.lastPathResult = { ok: false, message: msg, reason: 'abnormal_flight' };
            }
        };
        bot.on('death', deathFlagSet);
        bot.on('forcedMove', forcedMove);
        bot.on('message', abnormalFlightCheck);
        const cleanup = () => {
            bot.off('death', deathFlagSet);
            bot.off('forcedMove', forcedMove);
            bot.off('message', abnormalFlightCheck);
        };
        if (!mute) console.log(`\x1b[32mA*\x1b[0m ${bot.entity.position} -> ${target}`)
        let visited = new Set();
        let alreadyCheckTargetNoObstacle = false;
        let secondTargetMaxDistance = 1;
        let astarExecuteCount = 0;
        let distance = bot.entity.position.distanceTo(target);
        let lastDisatance = 999999;
        let astarStartT = Date.now();
        let astar_timer = 0;
        let noPathCount = 0;
        while (true) {
            let nowDistance = bot.entity.position.distanceTo(target);
            if (nowDistance > lastDisatance) {
                cleanup();
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'distance_increase' };
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*距離增加 結束\x1b[0m`);
                return false;
            }
            if (deathFlag) {
                cleanup();
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'death' };
                return false;
            }
            if (abnormalFlightFlag) {
                cleanup();
                bot.logger(true, 'WARN', bot.username, `\x1b[31mA* 偵測到異常飛行 中止\x1b[0m`);
                return false;
            }
            if (forcedMoveFlag || moveError >= 3) {
                cleanup();
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'forced_move' };
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
                        continue
                    } else {
                        if (!mute) bot.logger(false, 'DEBUG', bot.username, `替換終點座標 ${target} -> ${secondPos.position}`);
                        target = secondPos.position;
                    }
                }
            }
            let locNow = getRoundPos(bot.entity.position)
            // 次數到了or path到了
            if (locNow.equals(target) || astarExecuteCount > MAX_ASTAR_EXECUTE_COUNT) {
                // bot.off('death', deathFlagSet);
                // bot.off('forcedMove', forcedMove);
                break;
            }
            if (visited.has(getHash(locNow))) {
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*已訪問過 ${locNow} 嘗試更新目標 y+7 避免卡死 LERC: ${pathfinder.loopErrorRepeatCount}\x1b[0m`);
                let newy = target.y + 7;
                pathfinder.loopErrorRepeatCount++;
                if(newy > 320) newy = 320;
                cleanup();
                if(pathfinder.loopErrorRepeatCount > 3){
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*  LERC: ${pathfinder.loopErrorRepeatCount} >3 return false\x1b[0m`);
                    pathfinder.lastPathResult = { ok: false, message: '', reason: 'loop' };
                    return false;
                }
                // return false
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA* Recalculate target ${target.x} ${newy} ${target.z} LERC: ${pathfinder.loopErrorRepeatCount}\x1b[0m`);
                await sleep(100)
                return await pathfinder.astarV2(bot, new Vec3(target.x, newy, target.z))
            }else{
                pathfinder.loopErrorRepeatCount=0
            }
            // 執行A*
            let paths = await astarV2FindPath(bot, target)
            // console.log(paths)
            if (paths.length > 0) {
                if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[32mA*發現路徑 ${locNow} ${target}\x1b[0m 開始移動`);
                await astarV2Move(bot, paths)
                visited.add(getHash(locNow));
            } else {
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*未發現路徑 ${locNow} ${target} ${noPathCount}次\x1b[0m wait 300ms`);
                noPathCount++;
                if(noPathCount > 5){
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mA*連續5次未發現路徑 結束\x1b[0m`);
                    pathfinder.noPathError++;
                    cleanup();
                    pathfinder.lastPathResult = { ok: false, message: '', reason: 'no_path' };
                    return false;
                }
                // 用來刷新座標
                // bot.entity.position = new Vec3(99999,99999,99999)
                await sleep(300);
                // if( Date.now() - lastChatTime >= 5_000){
                //     await mcFallout.sethome(bot,'p')
                //     lastChatTime = Date.now();
                //     await sleep(3_000);
                //     bot.chat("/home p")
                // }
                // break
            }
            astarExecuteCount++;
        }
        let astarEndT = Date.now();
        if (!mute) bot.logger(false, 'DEBUG', `A*共計耗時\x1b[33m${astarEndT - astarStartT}\x1b[0m ms 距離${Math.round(distance * 10) / 10} M  速率 ${Math.round(distance * 10 / ((astarEndT - astarStartT) / 1000)) / 10}m/s`);
        cleanup();
        pathfinder.errorRepeatCount = 0;
        pathfinder.loopErrorRepeatCount = 0;
        pathfinder.noPathError = 0;
        pathfinder.lastPathResult = { ok: true, message: '', reason: 'arrived' };
        return true;
    },
    /**
     * JPS (Jump Point Search) 尋路 — astarV2 的高速替代品
     *
     * 介面與 astarV2 完全一致 (回傳 true/false 並設定 pathfinder.lastPathResult)，
     * 不影響任何現有功能；要使用只需把呼叫端的 astarV2 換成 jps 即可。
     *
     * 相對 astarV2 的差異:
     *   - 真 3D JPS (26 向 + 跳點剪枝)，展開節點數遠少於六向射線 A*。
     *   - 單次直接搜尋到 target (二元堆 OPEN)，路徑更直，避免 astarV2 step<=9
     *     分段造成的「兩點來回」。
     *   - 對角移動禁止穿角 (no corner cutting)，瞬移不會切過方塊邊角。
     *   - 跳段在移動前會被切成 <=8 格的小段，與 astarV2 同樣的防作弊安全粒度。
     *
     * @param {Bot} bot - bot實例.
     * @param {Vec3} target - 目標座標 (方塊座標).
     * @param {boolean} mute - 是否靜音.
     */
    jps: async function (bot, target, mute = true) {
        const MAX_JPS_EXECUTE_COUNT = 30;
        const mcData = require('minecraft-data')(bot.version)
        deathFlag = false;
        moveError = 0;
        forcedMoveFlag = false;
        abnormalFlightFlag = false;
        pathfinder.lastPathResult = { ok: false, message: '', reason: '' };
        const abnormalFlightCheck = (jsonMsg) => {
            const msg = jsonMsg.toString();
            if (/\[系統\] 偵測到異常飛行移動！/.test(msg)) {
                abnormalFlightFlag = true;
                pathfinder.lastPathResult = { ok: false, message: msg, reason: 'abnormal_flight' };
            }
        };
        bot.on('death', deathFlagSet);
        bot.on('forcedMove', forcedMove);
        bot.on('message', abnormalFlightCheck);
        const cleanup = () => {
            bot.off('death', deathFlagSet);
            bot.off('forcedMove', forcedMove);
            bot.off('message', abnormalFlightCheck);
        };
        if (!mute) console.log(`\x1b[36mJPS\x1b[0m ${bot.entity.position} -> ${target}`)
        let visited = new Set();
        let alreadyCheckTargetNoObstacle = false;
        let secondTargetMaxDistance = 1;
        let jpsExecuteCount = 0;
        let distance = bot.entity.position.distanceTo(target);
        let jpsStartT = Date.now();
        let noPathCount = 0;
        let globalBestDist = Infinity;   // 全程最接近 target 的距離
        let stallCount = 0;              // 連續無進展次數 (防無解目標空轉)
        while (true) {
            // 全域進展檢查: 連續多次都無法更接近 target → 視為無路徑
            let nowDist = bot.entity.position.distanceTo(target);
            if (nowDist < globalBestDist - 0.5) {
                globalBestDist = nowDist;
                stallCount = 0;
            } else if (++stallCount > 3) {
                cleanup();
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS 連續無進展 結束\x1b[0m`);
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'no_path' };
                return false;
            }
            if (deathFlag) {
                cleanup();
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'death' };
                return false;
            }
            if (abnormalFlightFlag) {
                cleanup();
                bot.logger(true, 'WARN', bot.username, `\x1b[31mJPS 偵測到異常飛行 中止\x1b[0m`);
                return false;
            }
            if (forcedMoveFlag || moveError >= 3) {
                cleanup();
                pathfinder.lastPathResult = { ok: false, message: '', reason: 'forced_move' };
                return false;
            }
            // 替換被阻擋的終點 (與 astarV2 相同邏輯)
            if (!alreadyCheckTargetNoObstacle && bot.blockAt(target) != null && bot.blockAt(target.offset(0, 1, 0)) != null && bot.blockAt(target.offset(0, -1, 0)) != null) {
                alreadyCheckTargetNoObstacle = true;
                let targetD1 = bot.blockAt(target.offset(0, -1, 0)).name
                let tallerthanOneBlock = targetD1 && (targetD1.includes("wall") || targetD1.includes("fence"))
                if (legitimate_block.indexOf(bot.blockAt(target).name) == -1 || legitimate_block.indexOf(bot.blockAt(target.offset(0, 1, 0)).name) == -1 || tallerthanOneBlock) {
                    if (!mute) bot.logger(false, 'DEBUG', bot.username, `目標被阻擋 尋找替換點位${bot.blockAt(target).name} ${bot.blockAt(target.offset(0, 1, 0)).name}.`);
                    let matchingType = [];
                    for (let gen_m = 0; gen_m < legitimate_block.length; gen_m++) {
                        matchingType.push(mcData.blocksByName[legitimate_block[gen_m]].id)
                    }
                    let secondPos = bot.findBlock({
                        point: target,
                        matching: matchingType,
                        useExtraInfo: b => (legitimate_block.indexOf(bot.blockAt(b.position.offset(0, 1, 0)).name) != -1) && !b.position.equals(target.offset(0, 0, 0)),
                        maxDistance: secondTargetMaxDistance
                    })
                    if (secondPos == null) {
                        bot.logger(false, 'DEBUG', bot.username, `${secondTargetMaxDistance++} 格 無法找到替補座標 ${target} 加大搜尋範圍重新嘗試`);
                        alreadyCheckTargetNoObstacle = false;
                        continue
                    } else {
                        if (!mute) bot.logger(false, 'DEBUG', bot.username, `替換終點座標 ${target} -> ${secondPos.position}`);
                        target = secondPos.position;
                    }
                }
            }
            let locNow = getRoundPos(bot.entity.position)
            if (locNow.equals(target) || jpsExecuteCount > MAX_JPS_EXECUTE_COUNT) {
                break;
            }
            // 卡死偵測: 同一格已搜尋過 → 抬高目標 y 重試 (與 astarV2 相同)
            if (visited.has(getHash(locNow))) {
                let newy = target.y + 7;
                pathfinder.loopErrorRepeatCount++;
                if (newy > 320) newy = 320;
                cleanup();
                if (pathfinder.loopErrorRepeatCount > 3) {
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS LERC: ${pathfinder.loopErrorRepeatCount} >3 return false\x1b[0m`);
                    pathfinder.lastPathResult = { ok: false, message: '', reason: 'loop' };
                    return false;
                }
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS Recalculate target ${target.x} ${newy} ${target.z} LERC: ${pathfinder.loopErrorRepeatCount}\x1b[0m`);
                await sleep(100)
                return await pathfinder.jps(bot, new Vec3(target.x, newy, target.z), mute)
            } else {
                pathfinder.loopErrorRepeatCount = 0
            }
            // 執行 JPS
            let paths = await jpsFindPath(bot, target, mute)
            if (paths.length > 0) {
                if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[36mJPS發現路徑 ${locNow} ${target}\x1b[0m 開始移動`);
                await astarV2Move(bot, paths)
                visited.add(getHash(locNow));
            } else {
                bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS未發現路徑 ${locNow} ${target} ${noPathCount}次\x1b[0m wait 300ms`);
                noPathCount++;
                if (noPathCount > 5) {
                    bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS連續5次未發現路徑 結束\x1b[0m`);
                    pathfinder.noPathError++;
                    cleanup();
                    pathfinder.lastPathResult = { ok: false, message: '', reason: 'no_path' };
                    return false;
                }
                await sleep(300);
            }
            jpsExecuteCount++;
        }
        let jpsEndT = Date.now();
        if (!mute) bot.logger(false, 'DEBUG', `JPS共計耗時\x1b[33m${jpsEndT - jpsStartT}\x1b[0m ms 距離${Math.round(distance * 10) / 10} M  速率 ${Math.round(distance * 10 / ((jpsEndT - jpsStartT) / 1000)) / 10}m/s`);
        cleanup();
        pathfinder.errorRepeatCount = 0;
        pathfinder.loopErrorRepeatCount = 0;
        pathfinder.noPathError = 0;
        pathfinder.lastPathResult = { ok: true, message: '', reason: 'arrived' };
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
        if (Date.now() - astar_start_time > pathfinder._maxUsedTimeV2) {
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
            bot.logger(false, 'DEBUG', bot.username, `astarV2超時 call astarflyV1`)
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
        bot.logger(false, 'DEBUG', bot.username, `\x1b[31mastarV2FindPath 未發現路徑 ${start} ${target}\x1b[0m`);
        // await sleep(1000);
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
/* ============================ JPS 尋路核心 ============================ *
 * 真 3D Jump Point Search。所有移動/可行走判定沿用 astarV2 的規則:
 *   一格 (x,y,z) 可站立(飛行) 的條件 = 腳部(x,y,z)與頭部(x,y+1,z) 皆為
 *   legitimate_block，且腳下(x,y-1,z) 不是 wall/fence。未加載區視為阻擋。
 * 與 astarV2 不同處: 18 向移動(6直線+12平面對角) + 跳點剪枝 + 視線直達/拉直
 * + 單次直達 target，路徑更直更快，避免 astarV2 分段造成的兩點來回。
 * 這些函式為 JPS 專用，不被任何現有函式呼叫，故不影響原功能。
 * ===================================================================== */

// 移動方向: 6 直線 + 12 平面對角 = 18 向 (排除三軸全動的對角，
// 避免跳躍遞迴變成 O(cap^3)；飛行 bot 用平面對角 + 垂直兩步即可到任意格)
const JPS_MAX_JUMP = 24; // 單方向最大跳躍格數，到頂時回傳中繼點以保證推進
const JPS_DIRS = (() => {
    const dirs = [];
    for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
                const nz = (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) + (dz !== 0 ? 1 : 0);
                if (nz === 1 || nz === 2) dirs.push([dx, dy, dz]);
            }
    return dirs;
})();

// 二元最小堆 (依 f, 再依 h 排序)，取代 astarV2 對 OPEN 的線性掃描
class JpsHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    _lt(x, y) { return x.f < y.f || (x.f === y.f && x.h < y.h); }
    _le(x, y) { return x.f < y.f || (x.f === y.f && x.h <= y.h); }
    push(n) {
        const a = this.a; a.push(n); let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._le(a[p], a[i])) break;
            const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
        }
    }
    pop() {
        const a = this.a; const top = a[0]; const last = a.pop();
        if (a.length) {
            a[0] = last; let i = 0; const n = a.length;
            for (;;) {
                let l = 2 * i + 1, r = 2 * i + 2, s = i;
                if (l < n && this._lt(a[l], a[s])) s = l;
                if (r < n && this._lt(a[r], a[s])) s = r;
                if (s === i) break;
                const t = a[s]; a[s] = a[i]; a[i] = t; i = s;
            }
        }
        return top;
    }
}

function jpsDist3(a, t) {
    const dx = t.x - a.x, dy = t.y - a.y, dz = t.z - a.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 3D 體素視線檢查 (Amanatides & Woo)。起點到終點經過的每一格都可走才回傳 true。
// 用於開闊區直達捷徑與路徑拉直 (string pulling)。
function jpsLineClear(sx, sy, sz, tx, ty, tz, walk) {
    if (!walk(sx, sy, sz)) return false;
    let x = sx, y = sy, z = sz;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    let tMaxX = adx === 0 ? Infinity : 0.5 / adx;
    let tMaxY = ady === 0 ? Infinity : 0.5 / ady;
    let tMaxZ = adz === 0 ? Infinity : 0.5 / adz;
    const tDeltaX = adx === 0 ? Infinity : 1 / adx;
    const tDeltaY = ady === 0 ? Infinity : 1 / ady;
    const tDeltaZ = adz === 0 ? Infinity : 1 / adz;
    let guard = 0;
    const maxSteps = adx + ady + adz + 2;
    while (!(x === tx && y === ty && z === tz)) {
        if (++guard > maxSteps) return false;
        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { x += stepX; tMaxX += tDeltaX; }
        else if (tMaxY <= tMaxZ) { y += stepY; tMaxY += tDeltaY; }
        else { z += stepZ; tMaxZ += tDeltaZ; }
        if (!walk(x, y, z)) return false;
    }
    return true;
}

// 把 from->to 線段切成 <=8 格的小段並 push 進 out (不含 from，含 to)
function jpsDensifySeg(from, to, out) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        out.push(new Vec3(from.x + dx * t + 0.5, from.y + dy * t + 0.1, from.z + dz * t + 0.5));
    }
}

// 沿用 astarV2 的可行走判定 (帶快取，避免重複 blockAt)
function jpsWalkable(bot, x, y, z, cache) {
    const key = x + '-' + y + '-' + z;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let r;
    const feet = bot.blockAt(new Vec3(x, y, z));
    const head = bot.blockAt(new Vec3(x, y + 1, z));
    const below = bot.blockAt(new Vec3(x, y - 1, z));
    if (feet == null || head == null || below == null) {
        r = false; // 未加載 → 視為阻擋
    } else if (legitimate_block.indexOf(feet.name) < 0 || legitimate_block.indexOf(head.name) < 0) {
        r = false;
    } else if (below.name.includes('wall') || below.name.includes('fence')) {
        r = false; // 腳下牆/柵欄會頂進腳部空間
    } else {
        r = true;
    }
    cache.set(key, r);
    return r;
}

// e 是否為方向 d 的自然鄰居 (e 的每個非零分量都需與 d 同號，且不可新增軸)
function jpsIsNatural(e, d) {
    for (let i = 0; i < 3; i++) {
        if (e[i] !== 0) {
            if (d[i] === 0) return false;
            if (Math.sign(e[i]) !== Math.sign(d[i])) return false;
        }
    }
    return true;
}

// e 是否為節點 (x,y,z) 在來向 d 下的強制鄰居。
// 通用規則: 把 e 與 d 同號的分量歸零得到阻擋向量 b；若 b 非零且
// (x+e) 可走但 (x+b) 不可走，則 e 被障礙逼出 → 強制鄰居。
function jpsIsForced(e, d, x, y, z, walk) {
    const b = [0, 0, 0];
    let hasKeep = false;
    for (let i = 0; i < 3; i++) {
        if (e[i] !== 0) {
            if (d[i] !== 0 && Math.sign(e[i]) === Math.sign(d[i])) {
                b[i] = 0; // 與 d 同向 → 屬自然方向，丟棄
            } else {
                b[i] = e[i]; // 反向或垂直 → 保留
                hasKeep = true;
            }
        }
    }
    if (!hasKeep) return false;            // 純自然方向
    if (b[0] === 0 && b[1] === 0 && b[2] === 0) return false;
    return walk(x + e[0], y + e[1], z + e[2]) && !walk(x + b[0], y + b[1], z + b[2]);
}

function jpsHasForced(x, y, z, d, walk) {
    for (let i = 0; i < JPS_DIRS.length; i++) {
        if (jpsIsForced(JPS_DIRS[i], d, x, y, z, walk)) return true;
    }
    return false;
}

// 朝 d 方向跳躍直到撞牆 / 到達 target / 遇到強制鄰居，回傳跳點或 null。
// topLevel=true (從 OPEN 展開時): 跳到 JPS_MAX_JUMP 上限仍無事件，會回傳該中繼點
//   以保證在開闊區也能持續推進；topLevel=false (對角的子方向遞迴): 上限時回傳 null，
//   因為子方向只用來判斷「是否存在真正的跳點(強制鄰居/終點)」。
function jpsJump(px, py, pz, dx, dy, dz, target, walk, ctx, topLevel) {
    const nz = (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) + (dz !== 0 ? 1 : 0);
    const d = [dx, dy, dz];
    let x = px, y = py, z = pz;
    let guard = 0;
    for (;;) {
        if (ctx.timedOut()) return null;
        guard++;
        const ox = x, oy = y, oz = z;
        x += dx; y += dy; z += dz;
        // 對角移動: 只禁止「兩側皆為方塊」的鑽縫 (繞單一轉角允許，與視線/forced
        // neighbor 規則一致；瞬移飛行只會擦過方塊邊角，不會穿過實心)
        if (nz >= 2) {
            let openSides = 0;
            if (dx !== 0 && walk(ox + dx, oy, oz)) openSides++;
            if (dy !== 0 && walk(ox, oy + dy, oz)) openSides++;
            if (dz !== 0 && walk(ox, oy, oz + dz)) openSides++;
            if (openSides === 0) return null;
        }
        if (!walk(x, y, z)) return null;
        if (x === target.x && y === target.y && z === target.z) return { x, y, z };
        if (jpsHasForced(x, y, z, d, walk)) return { x, y, z };
        // 對角: 遞迴檢查各「降一軸」子方向，若子方向存在真正跳點，此格即為跳點
        if (nz >= 2) {
            if (dx !== 0 && jpsJump(x, y, z, 0, dy, dz, target, walk, ctx, false)) return { x, y, z };
            if (dy !== 0 && jpsJump(x, y, z, dx, 0, dz, target, walk, ctx, false)) return { x, y, z };
            if (dz !== 0 && jpsJump(x, y, z, dx, dy, 0, target, walk, ctx, false)) return { x, y, z };
        }
        if (guard >= JPS_MAX_JUMP) return topLevel ? { x, y, z } : null;
        // 直線方向: 繼續迴圈前進
    }
}

// 從 bot 現在位置以 JPS 搜尋到 target，回傳已切成 <=8 格跳段的 Vec3 路徑
async function jpsFindPath(bot, target, mute = true) {
    const cache = new Map();
    const walk = (x, y, z) => jpsWalkable(bot, x, y, z, cache);
    const start = getRoundPos(bot.entity.position);
    const startKey = getHash(start);
    // 直線可達就直接飛 (開闊區/視線無阻時最快，整個搜尋都省了)
    if (jpsLineClear(start.x, start.y, start.z, target.x, target.y, target.z, walk)) {
        const out = [new Vec3(start.x + 0.5, start.y + 0.1, start.z + 0.5)];
        jpsDensifySeg(start, { x: target.x, y: target.y, z: target.z }, out);
        return out;
    }
    const CLOSE = new Map();
    const gScore = new Map();
    const heap = new JpsHeap();
    const startNode = { x: start.x, y: start.y, z: start.z, g: 0, dir: null, parent: null };
    startNode.h = jpsDist3(startNode, target);
    startNode.f = startNode.h * 1.5; // 與 astarV2 相同的加權
    gScore.set(startKey, 0);
    heap.push(startNode);
    const t0 = Date.now();
    const ctx = { timedOut: () => Date.now() - t0 > pathfinder._maxUsedTimeJPS };
    let endNode = null;
    let bestNode = startNode, bestH = startNode.h;
    while (heap.size() > 0) {
        if (deathFlag) return [];
        await wait();
        const cur = heap.pop();
        const curKey = getHash(cur);
        if (CLOSE.has(curKey)) continue;                              // 過期重複
        const gRec = gScore.has(curKey) ? gScore.get(curKey) : Infinity;
        if (cur.g > gRec) continue;                                    // 過期重複
        CLOSE.set(curKey, cur);
        if (cur.h < bestH) { bestH = cur.h; bestNode = cur; }
        if (cur.x === target.x && cur.y === target.y && cur.z === target.z) { endNode = cur; break; }
        if (ctx.timedOut()) {
            if (!mute) bot.logger(false, 'DEBUG', bot.username, `\x1b[31mJPS超時 取最近跳點推進\x1b[0m`);
            endNode = bestNode; break;
        }
        // 產生後繼方向 (起點 26 向；其餘只取自然 + 強制鄰居)
        let dirs;
        if (!cur.dir) {
            dirs = JPS_DIRS;
        } else {
            dirs = [];
            for (let i = 0; i < JPS_DIRS.length; i++) {
                const e = JPS_DIRS[i];
                if (jpsIsNatural(e, cur.dir) || jpsIsForced(e, cur.dir, cur.x, cur.y, cur.z, walk)) dirs.push(e);
            }
        }
        for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            const jp = jpsJump(cur.x, cur.y, cur.z, d[0], d[1], d[2], target, walk, ctx, true);
            if (!jp) continue;
            const jpKey = getHash(jp);
            if (CLOSE.has(jpKey)) continue;
            const stepLen = Math.max(Math.abs(jp.x - cur.x), Math.abs(jp.y - cur.y), Math.abs(jp.z - cur.z));
            const moveCost = stepLen * Math.sqrt((d[0] ? 1 : 0) + (d[1] ? 1 : 0) + (d[2] ? 1 : 0));
            const ng = cur.g + moveCost;
            const rec = gScore.has(jpKey) ? gScore.get(jpKey) : Infinity;
            if (ng < rec) {
                gScore.set(jpKey, ng);
                const node = { x: jp.x, y: jp.y, z: jp.z, g: ng, dir: d, parent: curKey };
                node.h = jpsDist3(node, target);
                node.f = node.g + node.h * 1.5;
                heap.push(node);
            }
        }
    }
    if (!endNode) endNode = bestNode; // OPEN 耗盡仍未到 → 推進到最近跳點
    if (endNode === startNode || endNode.parent == null) {
        bot.logger(false, 'DEBUG', bot.username, `\x1b[31mjpsFindPath 未發現路徑 ${start} ${target}\x1b[0m`);
        return [];
    }
    // 重建跳點鏈
    const chain = [];
    let c = endNode;
    while (c) {
        chain.unshift(c);
        c = (c.parent != null) ? CLOSE.get(c.parent) : null;
    }
    // 路徑拉直 (string pulling): 用視線盡量合併跳點，讓路徑更直、減少來回
    const sp = [chain[0]];
    let anchor = 0;
    for (let i = 2; i < chain.length; i++) {
        if (!jpsLineClear(chain[anchor].x, chain[anchor].y, chain[anchor].z, chain[i].x, chain[i].y, chain[i].z, walk)) {
            sp.push(chain[i - 1]);
            anchor = i - 1;
        }
    }
    sp.push(chain[chain.length - 1]);
    // 切成 <=8 格的小段 (與 astarV2 同樣的安全瞬移粒度)
    const pathV = [new Vec3(sp[0].x + 0.5, sp[0].y + 0.1, sp[0].z + 0.5)];
    for (let i = 1; i < sp.length; i++) {
        jpsDensifySeg(sp[i - 1], sp[i], pathV);
    }
    return pathV;
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
    forcedMoveFlag = true;
    movewrong();
    // console.log("forcedMove")
}
module.exports = pathfinder 
