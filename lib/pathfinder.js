const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
const { Vec3 } = require('vec3')
let maxExploreDistanceSquare = 85;
let maxExploreDistance = 8;
let autoCD = Date.now();
var astarCD = false;
const legitimate_block = ['air', 'cave_air','light','water'];
const pathfinder = {
    /**
     * A* Search 並限制可循路區塊
     * @param {Vec3} target - 目標座標.
     * @param {Vec3} border1 - 邊界座標1.
     * @param {Vec3} border2 - 邊界座標2.
     */
    astarfly: async function (bot, target, border1, border2, lastFlyTime, mute) {  //直接使用方塊座標
        const mcData = require('minecraft-data')(bot.version)
        mute = (mute === undefined ? false : mute)
        let distance = bot.entity.position.distanceTo(target);
        if (!lastFlyTime) lastFlyTime = 0;
        let moveError = 0;
        bot.on('forcedMove', movewrong);
        if (!mute) console.log(`\x1b[32mA*\x1b[0m ${bot.entity.position} -> ${target}`)
        let astarStartT = Date.now();
        let astar_timer = 0;
        let alreadyCheckTargetNoObstacle = false;
        let secondTargetMaxDistance = 4;
        while (true) {// \x1b[33m
            // bot._client.write("abilities", {
            //     flags: 2,
            //     flyingSpeed: 4.0,
            //     walkingSpeed: 4.0
            // })
            if (!alreadyCheckTargetNoObstacle && bot.blockAt(target) != null && bot.blockAt(target.offset(0, 1, 0)) != null) {//進加載區後判斷是否被阻擋
                alreadyCheckTargetNoObstacle = true;
                if (legitimate_block.indexOf(bot.blockAt(target).name) == -1 || legitimate_block.indexOf(bot.blockAt(target.offset(0, 1, 0)).name) == -1) {
                    console.log(`目標被阻擋 尋找替換點位${bot.blockAt(target).name} ${bot.blockAt(target.offset(0, 1, 0)).name}.`)
                    let matchingType = [];
                    for (let gen_m = 0; gen_m < legitimate_block.length; gen_m++) {
                        matchingType.push(mcData.blocksByName[legitimate_block[gen_m]].id)
                    }
                    //console.log(matchingType)
                    let secondPos = bot.findBlock({
                        point: target,
                        matching: matchingType,  //["air"]
                        useExtraInfo: b => (legitimate_block.indexOf(bot.blockAt(b.position.offset(0, 1, 0)).name) != -1),
                        maxDistance: secondTargetMaxDistance
                    })
                    if (secondPos == null) {
                        console.log(`[警告] ${secondTargetMaxDistance++} 格 無法找到替補座標 加大搜尋範圍重新嘗試`)
                        alreadyCheckTargetNoObstacle = false;
                    } else {
                        console.log(`替換終點座標 ${target} -> ${secondPos.position}`)
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
                await wait()
                if (Date.now() - astar_start_time > 3000) {
                    end = start;
                    console.log('\x1b[31mA*超時\x1b[0m wait 30 ms');
                    await sleep(30);
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
                if (current.h == 0 || current.step >= 7) { //test
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                        if(bot.blockAt(nowTest_dd) != null){
                            let ndd_bname = bot.blockAt(nowTest_dd).name
                            if(ndd_bname.includes("wall")||ndd_bname.includes("fence")) continue
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
                bot.logger(false,'DEBUG','\x1b[31mA*未發現路徑\x1b[0m wait 50ms');
                await sleep(50);
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
        function movewrong() {
            moveError++;
        }

        let astarEndT = Date.now();
        bot.off('forcedMove', movewrong);
        if (!mute) bot.logger(false,'DEBUG',`A*共計耗時\x1b[33m${astarEndT - astarStartT}\x1b[0m ms 距離${Math.round(distance * 10) / 10} M  速率 ${Math.round(distance * 10 / ((astarEndT - astarStartT) / 1000)) / 10}m/s`);
        // return lastFlyTime;      
        return 0
    }
}
module.exports = pathfinder 
