const fs = require("fs");
const fsp = require('fs').promises
const sd = require('silly-datetime');
const containerOperation = require(`../lib/containerOperation`);
const { Vec3 } = require('vec3')
const pTimeout = require('p-timeout');
const { once } = require('events')
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
var whetherPause = false, stop = false;
let logger
let mcData
let craftAndExchange_cfg = {
    "updateTime": sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'),
    "command_interval_tick": 35,
    "crafting_table": [0, 0, 0],
    "example": [[0, 0, 0], 'id', "name"],
    "input_1": [[0, 0, 0], 0, "air"],
    "output_1": [[0, 0, 0], 0, "air"],
}
let bot_id
const craftAndExchange = {
    identifier: [
        "ce",
        "craft",
        "exchange"
    ],
    parse(raw_args) {
        let args = raw_args.slice(1, raw_args.length);
        switch (args[0]) {
            case "auto":
            case "a":
                return {
                    name: "合成兌換 自動設定",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "set":
                return {
                    name: "合成兌換 設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "info":
            case "i":
                return {
                    name: "合成兌換 查詢設定",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "exchange":
            case "e":
                return {
                    name: "合成兌換 - 兌換",
                    vaild: true,
                    longRunning: true,
                    permissionRequre: 0,
                }
            case "pause":
            case "p":
                return {
                    name: "合成兌換 建造-暫停",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "resume":
            case "r":
                return {
                    name: "合成兌換 建造-繼續",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case "stop":
            case "s":
                return {
                    name: "合成兌換 建造-中止",
                    vaild: true,
                    longRunning: false,
                    permissionRequre: 0,
                }
            case undefined:
                return {
                    vaild: false,
                }
            default:
                return {
                    vaild: false,
                }
        }
    },
    async execute(bot, task) {
        let args = task.content.slice(1, task.content.length);
        switch (args[0]) {
            case "auto":
            case "a":
                await autoset(bot, task)
                break;
            case "set":
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} 暫不支援手動設定 請使用auto (a)`);
                        break;
                    case 'console':
                        console.log("暫不支援手動設定 請使用auto (a)")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }
                break
            case "info":
            case "i":
                let cfg_info_cache = await readConfig(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`);
                console.log(cfg_info_cache);
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} not implemented`);
                        break;
                    case 'console':
                        console.log("CraftAndExchange - not implemented")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }

                break;
            case "exchange":
            case "e":
                await exchange(bot, task)
                break;
            case "pause":
            case "p":
                whetherPause = true;
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} 已暫停`);
                        break;
                    case 'console':
                        console.log("CraftAndExchange - 已暫停")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }
                break;
            case "resume":
            case "r":
                whetherPause = false;
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} 已繼續`);
                        break;
                    case 'console':
                        console.log("CraftAndExchange - 已繼續")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }
                break;
            case "stop":
            case "s":
                stop = true;
                switch (task.source) {
                    case 'minecraft-dm':
                        bot.chat(`/m ${task.minecraftUser} 已停止`);
                        break;
                    case 'console':
                        console.log("CraftAndExchange - 已停止")
                        break;
                    case 'discord':
                        break;
                    default:
                        break;
                }
                break;
            case undefined:
            default:
                console.log("CraftAndExchange - not implemented")
        }
    },
    async init(bot, user_id, lg) {
        logger = lg
        bot_id = user_id;
        mcData = require('minecraft-data')(bot.version)
        if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`)) {
            logger(true, 'INFO', `Creating config - craftAndExchange.json`)
            save(craftAndExchange_cfg)
        } else {
            craftAndExchange_cfg = await readConfig(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`)
        }
    }
}
async function save(caec) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('craftAndExchange save error', err);
    });
    //console.log('task complete')
}
async function readConfig(file) {
    var raw_file = await fsp.readFile(file);
    var com_file = await JSON.parse(raw_file);
    return com_file;
}
async function autoset(bot, task) {
    let cfg_autoset_cache = {
        "updateTime": sd.format(new Date(), 'YYYY-MM-DD HH-mm-ss'),
        "command_interval_tick": 35,
        "crafting_table": [0, 0, 0],
        "example": [[0, 0, 0], 'id', "name"],
        "input_1": [[0, 0, 0], 0, "air"],
        "output_1": [[0, 0, 0], 0, "air"],
    }
    let totalio = '';
    let IDIF = [];
    for (let mobstoattack in bot.entities) {
        //console.log(bot.entities[mobstoattack])
        if (bot.entities[mobstoattack].position.distanceTo(bot.entity.position) > 5) continue;
        if (bot.entities[mobstoattack].mobType === 'Glow Item Frame' || bot.entities[mobstoattack].mobType === 'Item Frame') {
            IDIF.push(bot.entities[mobstoattack]);
        }
        //break;
    }
    let input = 1, output = 1;
    for (iii in IDIF) {    //解析展示框
        let mode;
        let thisShuIs;
        let shulkerboxPos, comp = new Vec3(0, 0, 0);
        if (bot.blockAt(IDIF[iii].position.offset(-2, 0, 0)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x - 2, IDIF[iii].position.y, IDIF[iii].position.z]
            comp = IDIF[iii].position.offset(-4, 0, 0);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(2, 0, 0)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x + 2, IDIF[iii].position.y, IDIF[iii].position.z]
            comp = IDIF[iii].position.offset(4, 0, 0);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(0, 0, -2)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x, IDIF[iii].position.y, IDIF[iii].position.z - 2]
            comp = IDIF[iii].position.offset(0, 0, -4);
        }
        else if (bot.blockAt(IDIF[iii].position.offset(0, 0, 2)).name.indexOf('shulker_box') != -1) {
            shulkerboxPos = [IDIF[iii].position.x, IDIF[iii].position.y, IDIF[iii].position.z + 2]
            comp = IDIF[iii].position.offset(0, 0, 4);
        }
        if (!shulkerboxPos) {
            //console.log("無法識別的展示框 x1");
            continue;
        }
        if (bot.blockAt(comp.offset(0, 1, 0)).name == 'dropper') {
            mode = 'input';
            thisShuIs = mode + '_' + input++;
        }
        else {
            mode = 'output';
            thisShuIs = mode + '_' + output++;
        }
        let itemmm = mcData.items[(IDIF[iii].metadata[8].itemId)]
        cfg_autoset_cache[thisShuIs] = [shulkerboxPos, IDIF[iii].metadata[8].itemId, itemmm.name];
        console.log(thisShuIs + " " + itemmm.name + " " + shulkerboxPos);
        totalio += '&7[&b' + thisShuIs + " &a" + itemmm.name + " &f" + shulkerboxPos + '&7] '
    }
    let crafting_table = bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id
    })
    try {
        cfg_autoset_cache.crafting_table = [crafting_table.position.x, crafting_table.position.y, crafting_table.position.z];
    } catch (e) {
        if (task.source === 'minecraft-dm') bot.chat(`/m ${task.minecraftUser} 找不到合成台`);
        return;
    }
    console.log(cfg_autoset_cache)
    fs.writeFile(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`, JSON.stringify(cfg_autoset_cache, null, '\t'), function (err, result) {
        if (err) console.log('error', err);
        else {
            switch (task.source) {
                case 'minecraft-dm':
                    bot.chat(`/m ${task.minecraftUser} 設置成功 ${totalio}`);
                    break;
                case 'console':
                    console.log(`/m ${task.minecraftUser} 設置成功 ${totalio}`)
                    break;
                case 'discord':
                default:
                    break;
            }
        }
    });
    const signBlock = bot.findBlock({
        matching: (block) => {return block?.name?.includes('sign')},
        maxDistance: 5
    });
    if (signBlock) {
       // if(signBlock.signText[0]!=='[auto]') return
        //console.log(signBlock)
        let signText = signBlock.signText.toLowerCase().split('\n')
        //console.log(signText)
        if(signText[0]!='[auto]') return
        let autoType = signText[1];
        let autoIndex = signText[2]
        console.log(`檢測到告示牌 自動新增任務`);
        let newTask = {
            priority: task.priority,
            displayName: '合成兌換 - (sign自動新增)',
            source: task.source,
            content: [ 'ce', autoType, autoIndex ],
            timestamp: Date.now(),
            sendNotification: task.sendNotification,
            minecraftUser: task.minecraftUser,
            discordUser: task.discordUser
        }
        //console.log(newTask)
        bot.taskManager.assign(newTask)
    }
}
async function exchange(bot, task) {
    let cfg_exchange_cache = await readConfig(`${process.cwd()}/config/${bot_id}/craftAndExchange.json`);
    let exchangeIndex = task.content[2];
    let shopName = '/shop_item';
    cfg_exchange_cache.command_interval_tick = cfg_exchange_cache.command_interval_tick ?? 35;//兼容舊版
    if (task.content.includes('-t')) {
        shopName = '/shop_tree';
    }
    if (exchangeIndex == undefined) {
        bot.chat(`/m ${task.minecraftUser} 未指定兌換物id 將識別附近牌子`);
        exchangeIndex = 's';
    }
    if (exchangeIndex == 'sign' || exchangeIndex == 's') {
        exchangeIndex = 99;
    }
    if (exchangeIndex < 0 || exchangeIndex >= 53) {
        bot.chat(`/m ${task.minecraftUser} 兌換id錯誤 ${exchangeIndex}`);
        return;
    }
    console.log(`兌換目標 ${shopName} ${exchangeIndex}`);
    let input_weight, output_weight, shop_item_window;
    let openShop_item_timeout = false;
    let inputsIds = [];
    let outputsIds = [];
    let inputsName = [];
    let outputsName = [];
    for (let i = 1; i < 9; i++) {
        if (cfg_exchange_cache["input_" + i]) {
            if (cfg_exchange_cache["input_" + i][2] == "air") continue;
            else {
                inputsIds.push(mcData.itemsByName[cfg_exchange_cache["input_" + i][2]].id)
                inputsName.push(cfg_exchange_cache["input_" + i][2]);
            }
        }
        else break;
    }
    for (let i = 1; i < 9; i++) {
        if (cfg_exchange_cache["output_" + i]) {
            if (cfg_exchange_cache["output_" + i][2] == "air") continue;
            else {
                outputsIds.push(mcData.itemsByName[cfg_exchange_cache["output_" + i][2]].id)
                outputsName.push(cfg_exchange_cache["output_" + i][2]);
            }
        }
        else break;
    }
    //console.log(inputsIds)
    //console.log(outputsIds)
    //bot.on('windowOpen', checkwindows);
    bot.chat(shopName);
    console.log(`open ${shopName} at ${Date.now().toString()}`);
    await pTimeout(once(bot, 'windowOpen'), 3000).catch((err) => {
        console.log('開啟兌換超時');
        openShop_item_timeout = true;
    }).then((res) => {
        if (!openShop_item_timeout) {
            shop_item_window = res[0];
            if (!shop_item_window.title.includes("兌換區")) {
                console.log('開啟兌換錯誤')
                openShop_item_timeout = true;
            }
        }
    })
    if (openShop_item_timeout) {
        bot.chat(`/m ${task.minecraftUser} 無法檢測兌換商店 已中止`);
        return;
    }
    let itemWeight = shop_item_window.slots[exchangeIndex].nbt.value.display.value.Name.value.match(/x\d{1,4}/g);
    input_weight = parseInt(itemWeight.shift().slice(1))
    output_weight = parseInt(itemWeight.shift().slice(1))
    bot.closeWindow(shop_item_window.id)
    //console.log(input_weight);
    //console.log(output_weight);
    stop = false, whetherPause = false;
    let lastSucOpenBoxTime = Date.now();
    console.log(`-------------開始兌換---------------`)
    exchange: while (!stop) {
        try {
            if (Date.now() - lastSucOpenBoxTime > 15000) {
                console.log("15秒未發現盒子 已中止")
                bot.chat(`/m ${task.minecraftUser} 15秒未發現盒子 已中止`);
                return;
            }
            if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
            if (whetherPause) {
                await sleep(500);
                continue;
            }
            let outputs_count = [];
            for (let i = 0; i < outputsIds.length; i++) {
                outputs_count.push(bot.inventory.countRange(bot.inventory.inventoryStart, bot.inventory.inventoryEnd, outputsIds[i], null));
            }
            ops_count: for (let i = 0; i < outputsIds.length; i++) {
                if (outputs_count[i] != 0) {
                    let thisOutputShu;
                    try {
                        let boxposblock = bot.blockAt(new Vec3(cfg_exchange_cache["output_" + (i + 1)][0][0], cfg_exchange_cache["output_" + (i + 1)][0][1], cfg_exchange_cache["output_" + (i + 1)][0][2]))
                        if (boxposblock == null) {
                            console.log("距離過遠 已終止 兌換/合成")
                            bot.chat(`/m ${task.minecraftUser} 距離過遠 已終止 兌換/合成`);
                            await sleep(500)
                            return;
                        } else if (!boxposblock.name.includes('shulker')) {
                            await sleep(50)
                            continue;
                        }
                        thisOutputShu = await pTimeout(bot.openBlock(boxposblock), 1000);
                        lastSucOpenBoxTime = Date.now()
                        //await sleep(500)
                    } catch (e) {
                        //console.log(e)
                        console.log("開盒子失敗");
                        await sleep(100);
                        continue exchange;
                    }
                    let OutputInThisShu_count = thisOutputShu.countRange(0, 27, outputsIds[i], null);
                    if (outputs_count[i] > (1728 - OutputInThisShu_count)) outputs_count[i] = (1728 - OutputInThisShu_count);
                    //console.log("當前盒子內"+OutputInThisShu_count)
                    //console.log("剩餘空間"+(1728-OutputInThisShu_count))
                    //console.log("預計放入"+outputs_count[i]);
                    try {
                        //await thisOutputShu.deposit(outputsIds[i],null,outputs_count[i],null);
                        await containerOperation.deposit(bot, thisOutputShu, outputsIds[i], outputs_count[i], true);
                    } catch (e) {
                        console.log("放入時錯誤")
                        await sleep(100);
                    }
                    await thisOutputShu.close();
                    await sleep(50);///wait
                    //console.log(`${outputsName[i]} \x1b[32m+${outputs_count[i]}\x1b[0m`);
                    continue;
                }
            }
            let inputs_count = [];
            for (let i = 0; i < inputsIds.length; i++) {
                inputs_count.push(bot.inventory.countRange(bot.inventory.inventoryStart, bot.inventory.inventoryEnd, inputsIds[i], null));
            }
            //計算要拿多少
            let maxCanExchangeCount = 36;
            let emptySlotCount = bot.inventory.emptySlotCount();
            // break;
            let totalInputCostSlot = 0, totalOutputCostSlot = 0;
            for (let i = 0; i < inputsIds.length; i++) {
                totalInputCostSlot += Math.ceil(input_weight / 64);
            }
            for (let i = 0; i < outputsIds.length; i++) {
                totalOutputCostSlot += Math.ceil(output_weight / 64);
            }
            if (!totalOutputCostSlot) totalOutputCostSlot = 1;
            if (Math.floor(emptySlotCount / totalInputCostSlot) <= maxCanExchangeCount) {
                maxCanExchangeCount = Math.floor(emptySlotCount / totalInputCostSlot);
            }
            if (Math.floor(emptySlotCount / totalOutputCostSlot) <= maxCanExchangeCount) {
                maxCanExchangeCount = Math.floor(emptySlotCount / totalOutputCostSlot);
            }
            if (!maxCanExchangeCount) maxCanExchangeCount = 1;
            //console.log(`最多可補充 ${maxCanExchangeCount} ${totalInputCostSlot} ${totalOutputCostSlot} ${emptySlotCount}`);
            //
            for (let i = 0; i < inputsIds.length; i++) {
                if (inputs_count[i] < input_weight) {
                    let thiswithdrawcount = input_weight * maxCanExchangeCount - inputs_count[i];
                    try {
                        let boxposblock = bot.blockAt(new Vec3(cfg_exchange_cache["input_" + (i + 1)][0][0], cfg_exchange_cache["input_" + (i + 1)][0][1], cfg_exchange_cache["input_" + (i + 1)][0][2]))
                        if (boxposblock == null) {
                            console.log("距離過遠 已終止 兌換/合成")
                            bot.chat(`/m ${task.minecraftUser} 距離過遠 已終止 兌換/合成`);
                            await sleep(500)
                            return;
                        } else if (!boxposblock.name.includes('shulker')) {
                            await sleep(50)
                            continue;
                        }
                        // console.log(bot.blockAt(new Vec3(cfg_exchange_cache["output_"+i+1][0][0],cfg_exchange_cache["output_"+i+1][0][1],cfg_exchange_cache["output_"+i+1][0][2])));
                        thisInputShu = await pTimeout(bot.openBlock(boxposblock), 1000);
                        lastSucOpenBoxTime = Date.now()
                        //await sleep(500)
                    } catch (e) {
                        //console.log(e)
                        console.log("開盒子失敗");
                        await sleep(100);
                        continue exchange;
                    }
                    let InputInThisShu_count = thisInputShu.countRange(0, 27, inputsIds[i], null);
                    //console.log("盒子內"+InputInThisShu_count);
                    if (InputInThisShu_count == 0) {
                        await thisInputShu.close();
                        continue exchange;
                    }
                    if (thiswithdrawcount > InputInThisShu_count) thiswithdrawcount = InputInThisShu_count;
                    //console.log("提取"+thiswithdrawcount)
                    //inputs_count[i]
                    //await thisInputShu.withdraw(inputsIds[i],null,thiswithdrawcount,null);
                    await containerOperation.withdraw(bot, thisInputShu, inputsIds[i], thiswithdrawcount, true);
                    await thisInputShu.close();
                    //console.log("完成提取");
                }
            }
            await sleep(50);
            bot.chat(shopName);
            //console.log(`#336 open ${shopName} at ${Date.now().toString()}`);
            await pTimeout(once(bot, 'windowOpen'), 3000).catch((err) => {
                console.log('開啟兌換超時');
                openShop_item_timeout = true;
            }).then((res) => {
                if (!openShop_item_timeout) {
                    shop_item_window = res[0];
                    if (!shop_item_window.title.includes("兌換區")) {
                        console.log('開啟錯誤 的兌換區');
                        try { shop_item_window.close(); } catch (e) { }
                        openShop_item_timeout = true;
                    }
                }
            })
            if (openShop_item_timeout) {
                if (bot.currentWindow) {
                    if (bot.currentWindow.title.includes("兌換區")) {
                    } else {
                        //console.log(bot.currentWindow)
                        await bot.closeWindow(bot.currentWindow)
                        await sleep(100)
                        console.log("開啟錯誤 重試");
                        await sleep(1000)
                        continue
                    }
                    //return
                }
                else {
                    continue;
                }
            }
            let canStopThisExchange = false, thisExchangeTimer = 0;
            bot.on("message", setStop)
            while (!canStopThisExchange && thisExchangeTimer++ <= 27) {
                bot.clickWindow(exchangeIndex, 0, 0)
                await sleep(100)
            }
            bot.off("message", setStop)
            function setStop(jsonMsg) {
                if (jsonMsg.toString().startsWith(`[系統] `) &&
                    jsonMsg.toString().toLowerCase().includes(`你必須有`) &&
                    jsonMsg.toString().toLowerCase().includes(`才能兌換`)) {
                    canStopThisExchange = true;
                }
            }
            await bot.waitForTicks(cfg_exchange_cache.command_interval_tick);
            //await sleep(1500);
        }
        catch (e) {
            //console.log("err")
            console.log(e)
            await sleep(300);
        }
        await sleep(100);
        //console.log('完整結束一次')
        //break;
    }
    bot.chat(`/m ${task.minecraftUser} 兌換結束`);
}
module.exports = craftAndExchange