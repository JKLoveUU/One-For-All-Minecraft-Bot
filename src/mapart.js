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
const { WebhookClient } = require('discord.js');
const pTimeout = require('p-timeout');
const containerOperation = require(`../lib/containerOperation`);
const mcFallout = require(`../lib/mcFallout`);
const pathfinder = require(`../lib/pathfinder`);
const schematic = require(`../lib/schematic`);
const litematicPrinter = require('../lib/litematicPrinter');
const station = require('../lib/station');
const console = require('console');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const wait = () => new Promise(setImmediate)
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
// let mapart_cache = {
//     build: {
//         hash: "",
//         server: -1,
//         totalBlocks: -1,
//         startTime: Date.now(),
//         endTime: Date.now(),
//         interruptedBefore: 0,
//         counter: -1,
//     },
//     wrap: {
//         //not implemented
//     }
// }
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
        "warp": "Example_10",
        "height": 9,
        "width": 6,
        "open_start": -1,
        "open_end": -1,
    },
    "wrap": {    // 分裝 命名 複印用的設定
        "warp": "Example_10",
        "height": 9,
        "width": 6,
        "origin": [0, 0, 0],
        "anvil": [0, 0, 0],
        "anvil_stand": [0, 0, 0],
        "cartography_table": [0, 0, 0],
        "cartography_table_stand": [0, 0, 0],
        "facing": "north",
        "name": "ExampleMP_Name",
        "source": "https://www.pixiv.net/artworks/92433849",  //書本用的 暫時完全不會用到
        "artist": "https://www.pixiv.net/users/3036679",
        "copy_amount": 1,
        "copy_f_shulker": [0, 0, 0],
        "wrap_input_shulker": [0, 0, 0],
        "wrap_output_shulker": [0, 0, 0],
        "wrap_button": [0, 0, 0]
    },
}
let mapart_global_cfg = {
    "schematic_folder": "C:/Users/User/AppData/Roaming/.minecraft/schematics/",
    "discord_webhookURL": "https://discord.com/api/webhooks/1234567890123456789/abc",
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
        // {//hash test
        //     name: "hash test",
        //     identifier: [
        //         "hash",
        //     ],
        //     execute: get_hash_cfg,
        //     vaild: true,
        //     longRunning: false,
        //     permissionRequre: 0,
        // },
        {//debug toggle
            name: "toggle debug mode",
            identifier: [
                "debug",
            ],
            execute: mp_debug,
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
            execute: mp_info,
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
            execute: mp_copy,
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
            execute: mp_wrap,
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
            //bot.logger(true,"INFO",`加載個別Bot地圖畫設定資訊...`)
            try{
                mapart_cfg = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`)
            }catch(e){
                bot.logger(true,"ERROR",`個別Bot地圖畫設定資訊載入失敗\nFilePath: ${process.cwd()}/config/${bot_id}/mapart.json`)
                await sleep(1000)
                console.log("Please Check The Json Format")
                console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`)
                console.log("You can visit following websites the fix: ")
                console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`)
                console.log(`\x1b[33mhttps://www.google.com/search?q=${(e.message).replaceAll(" ","+")}\x1b[0m`)
                bot.gkill(202)
            }
        }
        //mapart.json (global)
        if (!fs.existsSync(`${process.cwd()}/config/global/mapart.json`)) {
            logger(true, 'INFO', `Creating global config - mapart.json`)
            await fsp.writeFile(`${process.cwd()}/config/global/mapart.json`, JSON.stringify(mapart_global_cfg, null, '\t'), function (err, result) {
                if (err) console.log('mapart save error', err);
            });
        } else {
            try{
                mapart_global_cfg = await readConfig(`${process.cwd()}/config/global/mapart.json`)
            }catch(e){
                bot.logger(true,"ERROR",`全Bot地圖畫設定資訊載入失敗\nFilePath: ${process.cwd()}/config/global/mapart.json`)
                await sleep(1000)
                console.log("Please Check The Json Format")
                console.log(`Error Msg: \x1b[31m${e.message}\x1b[0m`)
                console.log("You can visit following websites the fix: ")
                console.log(`\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`)
                console.log(`\x1b[33mhttps://www.google.com/search?q=${(e.message).replaceAll(" ","+")}\x1b[0m`)
                bot.gkill(202)
            }
        }
    }
}
async function mp_debug(task) {
    let mp = {};
    for (let i = bot.inventory.inventoryStart; i <= bot.inventory.inventoryEnd; i++) {
        if (bot.inventory.slots[i] == null) continue
        let c = bot.inventory.slots[i].count
        let n = bot.inventory.slots[i].name
        if (!mp[n]) mp[n] = c;
        else mp[n] += c
    }
    for(const i in mp){
        console.log(i.toString().padEnd(16),mp[i])
    }
}
async function mp_set(task) {
    let mapart_set_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    if (!fs.existsSync(mapart_global_cfg.schematic_folder + task.content[2])) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請重新輸入`,
            `未發現投影 請重新輸入\n資料夾: ${mapart_global_cfg.schematic_folder}\n檔案: ${task.content[2]}`,
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
async function mp_info(task) {
    let mapart_info_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    //console.log(mapart_info_cfg_cache)
    let lppq = await litematicPrinter.progress_query(task, bot)
    //console.log(lppq)
    let prog = ((lppq.placedBlock / lppq.totalBlocks) * 100).toFixed(1)

    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} ${mapart_info_cfg_cache.schematic.filename} ${prog}%`);
            break;
        case 'console':
            console.log(`${mapart_info_cfg_cache.schematic.filename} ${prog}%`)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented ${discord_msg}`);
            break;
        default:
            break;
    }
}
async function mp_build(task) {
    let mapart_build_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    mapart_build_cfg_cache.schematic.folder = mapart_global_cfg.schematic_folder;
    mapart_build_cfg_cache.bot_id = bot_id
    mapart_build_cfg_cache.replaceMaterials = mapart_global_cfg.replaceMaterials
    mapart_build_cfg_cache.server = bot.botinfo.server
    //這裡還要注入flag -s id
    delete mapart_build_cfg_cache.open;
    delete mapart_build_cfg_cache.wrap;
    //Flag parse
    //check args
    //console.log(task)
    //console.log(mapart_build_cfg_cache)
    let FLAG_autonext = false           //蓋到某張 或 沒有檔案為止
    let FLAG_autonext_value = ''
    let FLAG_server = false
    let FLAG_serverValue = bot.botinfo.server
    let FLAG_disableWebHookNotification = false
    let auto_regex = /^(\d+)_(\d+)$/;
    for (let i = 0; i < task.content.length; i++) {
        if (!task.content[i].startsWith('-')) continue
        switch (task.content[i]) {
            case '-a':
            case '-auto':
                FLAG_autonext = true;
                const match = task.content[i + 1]?.match(auto_regex);
                if (match) {
                    FLAG_autonext_value = task.content[i + 1];
                    i++;
                    //console.log(match);
                }
                break;
            case '-s':
            case '-server':
                if (Number.isInteger(parseInt(task.content[i + 1]))) {
                    FLAG_server = true;
                    FLAG_serverValue = parseInt(task.content[i + 1]);
                    i++;
                } else {
                    console.log(`-s 缺少分流參數`);
                    return
                }
                break;
            case '-n':
                FLAG_disableWebHookNotification = true;
                break;
            default:
                break;
        }
    }
    if (FLAG_server) mapart_build_cfg_cache.server = FLAG_serverValue
    if (mapart_build_cfg_cache.server == -1) {
        console.log(`&7${mapart_build_cfg_cache.server} TAB 分流讀取失敗 請重試`)
        return
    }
    //try {
    await litematicPrinter.build_file(task, bot, litematicPrinter.model_mapart, mapart_build_cfg_cache)
    //let pq = await litematicPrinter.progress_query(task, bot)
    //console.log(pq)
    // send analysis
    let build_result_query = await litematicPrinter.progress_query(task, bot)
    //console.log(build_result_query)
    mapartBuildUseTime = (build_result_query.endTime - build_result_query.startTime) / 1000
    console.log(`消耗時間 ${parseInt((mapartBuildUseTime / 3600))} h ${parseInt((mapartBuildUseTime % 3600) / 60)} m ${parseInt(mapartBuildUseTime % 60)} s`)

    // } catch (e) {
    //     console.log(e)
    // }

    const f_reg = /_(\d+)_(\d+)$/;
    let crt_filename_sp = mapart_build_cfg_cache.schematic.filename.split(".")
    //console.log(crt_filename_sp)
    let crt_filename = crt_filename_sp[0];
    const crt_filename_type = crt_filename_sp[1];
    let crt_filename_match = crt_filename.match(f_reg)
    crt_filename = crt_filename.replace(/_\d+_\d+$/, '');
    let crtFileIndex
    const webhookClient = new WebhookClient({ url: mapart_global_cfg.discord_webhookURL });
    if (crt_filename_match) {
        crtFileIndex = [parseInt(crt_filename_match[1]), parseInt(crt_filename_match[2])]
    }
    if (!FLAG_disableWebHookNotification) {
        let mapartfinishEmbed = gen_mapartFinishEmbed();
        let wh = {
            //content: '',//`<@${mapart_settings.dc_tag}>`,
            username: bot.username,
            avatarURL: `https://mc-heads.net/avatar/${bot.username}`,
            embeds: [mapartfinishEmbed]
        };
        if (bot.debugMode) {
            let inv ='```'
            let mp = {};
            for (let i = bot.inventory.inventoryStart; i <= bot.inventory.inventoryEnd; i++) {
                if (bot.inventory.slots[i] == null) continue
                let c = bot.inventory.slots[i].count
                let n = bot.inventory.slots[i].name
                if (!mp[n]) mp[n] = c;
                else mp[n] += c
            }
            for(const i in mp){
                inv += `${i.toString().padEnd(16)} ${mp[i]}\n`
                //console.log(i.toString().padEnd(16),mp[i])
            }
            inv+='```'
            wh.embeds.push({
                color: 0x0099ff,
                title: `除錯資料`,
                //url: 'https://discord.js.org',
                // author: {
                //     name: bot.username,
                //     icon_url: iconurl,
                //     //url: 'https://discord.js.org',
                // },
                //description: `\`${crt_filename}\``,
                // thumbnail: {
                //     url: iconurl,
                // },
                fields: [
                    // {
                    // 	name: '\u200b',
                    // 	value: '\u200b',
                    // 	inline: false,
                    // },
                    {
                        name: '放置成功率',
                        value: `${((build_result_query.totalBlocks / build_result_query.debug.placeCount) * 100).toFixed(1)}% (${build_result_query.totalBlocks} / ${build_result_query.debug.placeCount})`,
                        inline: true
                    },
                    {
                        name: '斷線次數',
                        value: `${build_result_query.debug.discconnectCount}`,
                        inline: true
                    },
                    {
                        name: '純放置效率(扣除其他時間)',
                        value: `${((build_result_query.totalBlocks / (mapartBuildUseTime - build_result_query.debug.restock_takeTime / 1000))).toFixed(1)} b/s`,
                    },
                    {
                        name: '材料補充次數',
                        value: `${build_result_query.debug.restock_count}`,
                        inline: true
                    },
                    {
                        name: '材料補充耗時',
                        value: `${(build_result_query.debug.restock_takeTime / 1000).toFixed(1)} 秒`,
                        inline: true
                    },
                    {
                        name: 'FindNext 耗時',
                        value: `${(build_result_query.debug.findNextTotalCounter / 1000).toFixed(1)} 秒`,
                        inline: false
                    },
                    {
                        name: '結束時背包',
                        value: inv,
                    },
                ],
            })
        }
        webhookClient.send(wh)
    }
    if (FLAG_autonext) {  //check args to build next ?
        let autonext_stopAt
        if (FLAG_autonext_value) {
            const autonext_match = FLAG_autonext_value.match(auto_regex);
            autonext_stopAt = [parseInt(autonext_match[1]), parseInt(autonext_match[2])]
        }
        //console.log(autonext_stopAt)
        let matchStop = false //有界 碰界 沒下張 //!FLAG_autonext_value
        if (!crtFileIndex) matchStop = true
        let nextFileName
        if (!matchStop && FLAG_autonext_value && autonext_stopAt[0] == crtFileIndex[0] && autonext_stopAt[1] == crtFileIndex[1]) matchStop = true;  //碰界
        if (!matchStop) {  //get next index  沒下張
            // console.log(`${mapart_build_cfg_cache.schematic.folder}${crt_filename}_${crtFileIndex[0]}_${crtFileIndex[1] + 1}.${crt_filename_type}`)
            // console.log(`${mapart_build_cfg_cache.schematic.folder}${crt_filename}_${crtFileIndex[0] + 1}_0.${crt_filename_type}`)
            if (fs.existsSync(`${mapart_build_cfg_cache.schematic.folder}${crt_filename}_${crtFileIndex[0]}_${crtFileIndex[1] + 1}.${crt_filename_type}`)) {
                nextFileName = `${crt_filename}_${crtFileIndex[0]}_${crtFileIndex[1] + 1}.${crt_filename_type}`;
            } else if (fs.existsSync(`${mapart_build_cfg_cache.schematic.folder}${crt_filename}_${crtFileIndex[0] + 1}_0.${crt_filename_type}`)) {
                nextFileName = `${crt_filename}_${crtFileIndex[0] + 1}_0.${crt_filename_type}`;
            }
            if (!nextFileName) matchStop = true;
        }
        // const crt_index =
        if (matchStop) {
            let mapartAutofinishEmbed = gen_mapartAutoFinishEmbed()
            webhookClient.send({
                // content: '',//`<@${mapart_settings.dc_tag}>`,
                username: bot.username,
                avatarURL: `https://mc-heads.net/avatar/${bot.username}`,
                embeds: [mapartAutofinishEmbed],
            })
            //send all finsih webhook
        } else {
            let nextV3 = [
                mapart_build_cfg_cache.schematic.placementPoint_x,
                mapart_build_cfg_cache.schematic.placementPoint_y,
                mapart_build_cfg_cache.schematic.placementPoint_z
            ]
            nextV3[0] += 128;
            let nextSetTask = {
                priority: bot.taskManager.defaultPriority - 2,
                displayName: '地圖畫 設定 (自動下張)',
                source: task.source,
                content: ['mapart', 'set', nextFileName, nextV3[0].toString(), nextV3[1].toString(), nextV3[2].toString()],
                timestamp: Date.now(),
                sendNotification: false,    //task.sendNotification,
                minecraftUser: task.minecraftUser,
                discordUser: task.discordUser
            }
            bot.taskManager.assign(nextSetTask)
            //console.log(nextSetTask)
            //await sleep(50)
            let nextBuildArgs = task.content
            if (!FLAG_server) {
                nextBuildArgs.push('-s')
                nextBuildArgs.push(FLAG_serverValue.toString())
            }
            let nextBuildTask = {
                priority: bot.taskManager.defaultPriority - 1,
                displayName: '地圖畫 建造(自動下張)',
                source: task.source,
                content: nextBuildArgs,
                timestamp: Date.now(),
                sendNotification: false,    //task.sendNotification,
                minecraftUser: task.minecraftUser,
                discordUser: task.discordUser
            }
            // console.log(nextBuildTask)
            bot.taskManager.assign(nextBuildTask)
            // build next ;
        }
        return
    }
    function gen_mapartAutoFinishEmbed() {
        let iconurl = `https://mc-heads.net/avatar/${bot.username}`
        let mapartfinishEmbed = {
            color: 0x0099ff,
            title: `已全數蓋完`,
            //url: 'https://discord.js.org',
            author: {
                name: bot.username,
                icon_url: iconurl,
                //url: 'https://discord.js.org',
            },
            description: `\`${crt_filename}\``,
            thumbnail: {
                url: iconurl,
            },
            fields: [
                // {
                // 	name: '\u200b',
                // 	value: '\u200b',
                // 	inline: false,
                // },
                {
                    name: '分流',
                    value: `${build_result_query.server}`,
                    inline: true,
                },
                {
                    name: '材料站',
                    value: `${'-'}`,
                    inline: true,
                },
                {
                    name: '完成時間',
                    value: `<t:${parseInt(build_result_query.endTime / 1000)}:f>`,
                    inline: false
                },
            ],
        }
        return mapartfinishEmbed;
    }
    function gen_mapartFinishEmbed() {
        let iconurl = `https://mc-heads.net/avatar/${bot.username}`
        let mapartfinishEmbed = {
            color: 0x0099ff,
            title: `${mapart_build_cfg_cache.schematic.filename} 建造完成`,
            //url: 'https://discord.js.org',
            author: {
                name: bot.username,
                icon_url: iconurl,
                //url: 'https://discord.js.org',
            },
            //description: `\`${mapart_build_cfg_cache.schematic.filename}\``,
            thumbnail: {
                url: iconurl,
            },
            fields: [
                // {
                // 	name: '\u200b',
                // 	value: '\u200b',
                // 	inline: false,
                // },
                {
                    name: 'Placement Origin',
                    value: `X:${'`' + build_result_query.placement_origin.x.toString().padStart(6) + '`'} Y:${'`' + build_result_query.placement_origin.y.toString().padStart(4) + '`'} Z:${'`' + build_result_query.placement_origin.z.toString().padStart(6) + '`'}`,
                },
                {
                    name: 'Placement Destination',
                    value: `X:${'`' + build_result_query.placement_destination.x.toString().padStart(6) + '`'} Y:${'`' + build_result_query.placement_destination.y.toString().padStart(4) + '`'} Z:${'`' + build_result_query.placement_destination.z.toString().padStart(6) + '`'}`,
                },
                {
                    name: '地圖畫大小',
                    value: `\`${Math.round((build_result_query.destination.x + 1) / 128)}*${Math.round((build_result_query.destination.z + 1) / 128)} (${(build_result_query.destination.x + 1)}*${(build_result_query.destination.y + 1)}*${(build_result_query.destination.z + 1)})\``,
                    inline: true,
                },
                {
                    name: '分流',
                    value: `${build_result_query.server}`,
                    inline: true,
                },
                {
                    name: '材料站',
                    value: `${'-'}`,
                    inline: true,
                },
                {
                    name: '開始時間',
                    value: `<t:${parseInt(build_result_query.startTime / 1000)}:f>`,
                    inline: true,
                },
                {
                    name: '完成時間',
                    value: `<t:${parseInt(build_result_query.endTime / 1000)}:f>`,
                    inline: true
                },
                {
                    name: '消耗時間',
                    value: `${parseInt((mapartBuildUseTime / 3600))} h ${parseInt((mapartBuildUseTime % 3600) / 60)} m ${parseInt(mapartBuildUseTime % 60)} s`,
                    inline: true
                },
                {
                    name: 'Speed',
                    value: `${Math.round((build_result_query.totalBlocks / (mapartBuildUseTime / 3600)) * 10) / 10} Blocks / h`,
                    inline: true
                },
                // {
                //     name: 'Debug 放置成功率',
                //     value: `${Math.round((sch_totalBlocks / debugPlaceCount) * 10000) / 100}% ${sch_totalBlocks} ${debugPlaceCount}`,
                // },

            ],
            // image: {
            // 	url: 'https://i.imgur.com/AfFp7pu.png',
            // },
            //timestamp: new Date(),
            // footer: {
            //     text: bot.username,
            //     icon_url: iconurl,
            // }
        }
        return mapartfinishEmbed;
    }
}
async function mp_pause(task) {
    litematicPrinter.pause(true)
    //whetherPause = true
}
async function mp_resume(task) {
    litematicPrinter.resume()
    //whetherPause = false
}
async function mp_stop(task) {
    litematicPrinter.stop()
    //stop = true
}
async function mp_test(task) {
    //let sch = await schematic.loadFromFile(`C:\\Users\\User\\AppData\\Roaming\\.minecraft\\schematics\\goodraid.litematic`)
    //console.log(sch)
    // return
    let mapart_build_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_build_cfg_cache.station}`);
    let needReStock = [
        { name: task.content[2], count: parseInt(task.content[3]) },
        // { name: "black_wool", count: 128 },
        // { name: "orange_wool", count: 128 },
        // { name: "red_wool", count: 128 },
    ]

    await station.newrestock(bot, stationConfig, needReStock)
    //litematicPrinter.build(bot,"n")
    return
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
    let crtoffsetindex = 0;
    for (let dx = 0; dx < mapart_open_cfg_cache["open"]["width"]; dx++) {
        for (let dy = 0; dy < mapart_open_cfg_cache["open"]["height"]; dy++) {
            let csmp = {
                skip: false,
                x: dx,
                y: dy,
                z: 0,
                //mapartRealPos: new Vec3(sx + 128 * crtoffsetindex, 256, sz),
                mapartRealPos: new Vec3(sx + 128 * (dx * mapart_open_cfg_cache["open"]["height"] + dy), 256, sz),
                pos: mapart_ori.offset(dx, 0 - dy, 0),
                itemframe: false,
                mapid: undefined,
                finish: false,
            }
            let currentIF = getItemFrame(mapart_ori.offset(dx, 0 - dy, 0))
            if (currentIF) csmp.itemframe = true;
            if (currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
                //console.log(currentIF.metadata[8].nbtData.value.map.value)
                csmp.mapid = currentIF.metadata[8].nbtData.value.map.value;
                csmp.finish = true;
            }
            // if (mapart_open_cfg_cache["open"]["open_start"] != -1) {
            //     if ((dx * mapart_open_cfg_cache["open"]["height"] + dy) < mapart_open_cfg_cache["open"]["open_start"]) csmp.skip = true;
            // } else if (mapart_open_cfg_cache["open"]["open_end"] != -1) {
            //     if ((dx * mapart_open_cfg_cache["open"]["height"] + dy) > mapart_open_cfg_cache["open"]["open_end"]) csmp.skip = true;
            // }
            // if(!csmp.skip) crtoffsetindex++;
            mpstate.push(csmp)
        }
    }
    //console.log(mpstate)
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
        if (mpstate[i].finish || mpstate[i].skip) continue
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
    await sleep(1000)
    bot.setQuickBarSlot(8);
    await bot.creative.flyTo(bot.entity.position.offset(0, 0.01, 0))
    bot._client.write("abilities", {
        flags: 2,
        flyingSpeed: 4.0,
        walkingSpeed: 4.0
    })
    // if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
    //     save_cache(mapart_cache)
    // } else {
    //     mapart_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    // }
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
    await pathfinder.astarfly(bot, mp_origin, null, null, null, true)
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let d_x = parseInt(i / mapart_name_cfg_cache["wrap"]["height"]);
        let d_y = i % mapart_name_cfg_cache["wrap"]["height"];
        // console.log(d_x,d_y)
        // let hasmap = getItemFrame
        //abc.metadata[8].nbtData.value.display.value.Name
        let mps = {
            dx: d_x,
            dy: d_y,
            pos: mp_origin.offset(d_x * mp_direction[facing]["inc_dx"], d_y * mp_direction[facing]["inc_dy"], d_x * mp_direction[facing]["inc_dz"]),
            hasmap: false,
            mapid: undefined,
            named: false,
        }
        let currentIF = getItemFrame(mps.pos)
        //console.log(currentIF?.metadata[8])
        if (currentIF && currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
            mps.hasmap = true
            mps.mapid = currentIF.metadata[8].nbtData.value.map.value;
        }
        if (mps.hasmap) {
            mps.named = (currentIF.metadata[8].nbtData.value.display.value.Name) ? true : false;
        }
        //console.log(mps.pos)
        maparts.push(mps)
        //break;
    }
    // execute
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
        // await sleep(50)
        // await pathfinder.astarfly(bot,mps.pos.offset(0,-1,0),null,null,null,true)
        try {
            //await sleep(250)
            await pickMapItem(mps.mapid)
        } catch (e) {
            console.log("無法撿起地圖畫", mps)
        }
        await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]), null, null, null, true)
        await sleep(50)
        let anvil = await bot.openAnvil(bot.blockAt(new Vec3(mapart_name_cfg_cache.wrap.anvil[0], mapart_name_cfg_cache.wrap.anvil[1], mapart_name_cfg_cache.wrap.anvil[2])));
        let it = getMapItemByMapIDInInventory(mps.mapid)
        //console.log(it)
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
        //console.log(new_it)
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
                //await pathfinder.astarfly(bot, mps.pos.offset(0, 0, 1), null, null, null, true)
                continue
            }
            //console.log("嘗試放置\n",bot.inventory.slots[44])
            console.log(`放置 mp_${mps.dx}_${mps.dy}`)
            await bot.activateEntity(getItemFrame(mps.pos))
            await sleep(1000)
            let check = getItemFrame(mps.pos);
            if (check && check.metadata[8]?.nbtData?.value?.map?.value == mps.mapid) {
                break;
            }
            fail_c++;
            //throw new Error("abc")
        }
        console.log(`${mps.dx}_${mps.dy} \x1b[32m完成\x1b[0m`)
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
async function mp_copy(task) {
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
    // if (!fs.existsSync(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)) {
    //     save_cache(mapart_cache)
    // } else {
    //     mapart_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart_cache.json`)
    // }
    if (mapart_name_cfg_cache["wrap"]["copy_amount"] > 64) {
        console.log("Not Support copy amount great than 64")
        return
    }
    //console.log(mapart_name_cfg_cache)
    //console.log(mapart_cache)
    //await pathfinder.astarfly(bot, new Vec3(mapart_name_cfg_cache.wrap.anvil_stand[0], mapart_name_cfg_cache.wrap.anvil_stand[1], mapart_name_cfg_cache.wrap.anvil_stand[2]))
    let mp_origin = new Vec3(mapart_name_cfg_cache.wrap.origin[0], mapart_name_cfg_cache.wrap.origin[1], mapart_name_cfg_cache.wrap.origin[2])
    let mp_shu_origin = new Vec3(mapart_name_cfg_cache.wrap.copy_f_shulker[0], mapart_name_cfg_cache.wrap.copy_f_shulker[1], mapart_name_cfg_cache.wrap.copy_f_shulker[2])
    let maparts = []
    let facing = mapart_name_cfg_cache["wrap"]["facing"]
    cartography_t_vec3 = v(mapart_name_cfg_cache["wrap"]["cartography_table"])
    cartography_t_s_vec3 = v(mapart_name_cfg_cache["wrap"]["cartography_table_stand"])
    let standOffest = (new Vec3(mp_direction[facing]["inc_dx"], mp_direction[facing]["inc_dy"], mp_direction[facing]["inc_dz"])).cross(new Vec3(0, 1, 0))
    let box_amount = Math.ceil(mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]) / 27
    //console.log("內積",standOffest)
    //console.log(box_amount)
    //console.log(standOffest)
    //await bot.activateEntity(getItemFrame(mps.pos))

    // init the mapart state And mapid
    await pathfinder.astarfly(bot, mp_origin, null, null, null, true)
    for (let i = 0; i < mapart_name_cfg_cache["wrap"]["width"] * mapart_name_cfg_cache["wrap"]["height"]; i++) {
        let d_x = parseInt(i / mapart_name_cfg_cache["wrap"]["height"]);
        let d_y = i % mapart_name_cfg_cache["wrap"]["height"];
        let boxoffset = parseInt(i / 27)
        // console.log(d_x,d_y)
        // let hasmap = getItemFrame
        //abc.metadata[8].nbtData.value.display.value.Name
        let mps = {
            dx: d_x,
            dy: d_y,
            pos: mp_origin.offset(d_x * mp_direction[facing]["inc_dx"], d_y * mp_direction[facing]["inc_dy"], d_x * mp_direction[facing]["inc_dz"]),
            box: mp_shu_origin.offset(boxoffset * mp_direction[facing]["inc_dx"], 0, boxoffset * mp_direction[facing]["inc_dz"]),
            s: i % 27,//slot
            hasmap: false,
            mapid: undefined,
            //named: false,
            //copied: false,
            amount: 0,
        }
        let currentIF = getItemFrame(mps.pos)
        //console.log(currentIF?.metadata[8])
        if (currentIF && currentIF?.metadata && currentIF?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id) {
            mps.hasmap = true
            mps.mapid = currentIF.metadata[8].nbtData.value.map.value;
        }
        // if (mps.hasmap) {
        //     mps.named = (currentIF.metadata[8].nbtData.value.display.value.Name) ? true : false;
        // }
        //console.log(mps.pos)
        maparts.push(mps)
        //break;
    }
    //check shulker state here
    let checkIndex = 0;
    for (let i = 0; i < box_amount; i++) {
        console.log(`檢查第 ${i + 1}個盒子`)
        //console.log(mp_shu_origin)
        let boxVec = mp_shu_origin.offset(mp_direction[facing]["inc_dx"] * i, 0, mp_direction[facing]["inc_dz"] * i)
        //console.log("pos",boxVec.offset(standOffest.x,standOffest.y,standOffest.z))
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
            //console.log(shulker_box.slots[shu_index])
            //if(item?.nbt?.value?.map?.value)
        }
        // item?.nbt?.value?.map?.value == mapid
        //console.log(shulker_box)
        await shulker_box.close()
        //let shu = await bot.openBlock(bot.blockAt(shulkerBox_loc))
        // console.log(boxVec)
    }
    //await pathfinder.astarfly(bot, mp_origin, null, null, null, true)
    //console.log(maparts)
    //execute
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
            //console.log(cap,require_amount)
            if (mapart_name_cfg_cache["materialsMode"] == 'station') {
                await sleep(2500)
                //console.log(cap,require_amount)
                await stationRestock(stationConfig, [{ name: "map", count: require_amount > cap ? cap : require_amount }])
                await sleep(500)
                //await stationRestock(stationConfig, [{ name: "map", count: mpstate.length }])
                //await inv_sort()
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
        // await sleep(50)
        // await pathfinder.astarfly(bot,mps.pos.offset(0,-1,0),null,null,null,true)
        try {
            //await sleep(250)
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
        // if (mapart_name_cfg_cache["wrap"]["copy_amount"] == 64) await bot.simpleClick.leftMouse(44)
        let new_it = getMapItemByMapIDInInventory(mps.mapid)
        let st = new_it.slot
        //console.log(new_it)
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
                //await pathfinder.astarfly(bot, mps.pos.offset(0, 0, 1), null, null, null, true)
                continue
            }
            //console.log("嘗試放置\n",bot.inventory.slots[44])
            console.log(`放置 mp_${mps.dx}_${mps.dy}`)
            await bot.activateEntity(getItemFrame(mps.pos))
            await sleep(1000)
            let check = getItemFrame(mps.pos);
            if (check && check.metadata[8]?.nbtData?.value?.map?.value == mps.mapid) {
                break;
            }
            fail_c++;
            //throw new Error("abc")
        }
        console.log(`${mps.dx}_${mps.dy} \x1b[32m完成\x1b[0m`)
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
async function mp_wrap(task) {
    console.log("**此功能需要把廢土自動整理功能關掉**")
    let mapart_name_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    // let stationConfig
    // if (mapart_name_cfg_cache["materialsMode"] == 'station') {
    //     stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_name_cfg_cache.station}`);
    // }
    //await mcFallout.warp(bot, mapart_name_cfg_cache["wrap"]["warp"]);
    //await sleep(1000)
    let counter = 64;
    let wrap_items = [];
    let inputVec = v(mapart_name_cfg_cache["wrap"]["wrap_input_shulker"])
    let outputVec = v(mapart_name_cfg_cache["wrap"]["wrap_output_shulker"])
    let btvec = v(mapart_name_cfg_cache["wrap"]["wrap_button"])
    bot.setQuickBarSlot(8);
    console.log(mapart_name_cfg_cache)
    await mcFallout.openPreventSpecItem(bot)
    /**
     * check input shulker
     */
    let input = await containerOperation.openContainerWithTimeout(bot, inputVec, 500)
    await sleep(500)
    if (!input) {
        console.log("can't open input box")
        return
    }
    for (let i = 0; i < 27; i++) {
        let item = {
            name: null,
            mapid: -1
        }
        if (input.slots[i] != null) {
            item.name = input.slots[i]?.name
            counter = Math.min(input.slots[i].count, counter)
        }
        if (input.slots[i]?.name == 'filled_map') {
            item.mapid = input.slots[i]?.nbt?.value?.map?.value
        }
        wrap_items.push(item)
    }
    await input.close()
    await sleep(500)
    //console.log(wrap_items)
    //console.log(counter)
    for (let i = 0; i < counter; i++) {
        let input2, t = 0;
        while (t++ < 3 && !input2) {
            input2 = await containerOperation.openContainerWithTimeout(bot, inputVec, 1000)
        }
        if (!input2) {
            console.log("Can't open input box")
            return
        }
        //取出
        for (let gg = 0; gg < 27; gg++) {
            if (wrap_items[gg].name == null) continue
            let emptySlot = input2.firstEmptySlotRange(input2.inventoryStart, input2.inventoryEnd)
            await bot.simpleClick.leftMouse(gg)
            await bot.simpleClick.rightMouse(emptySlot)
            await bot.simpleClick.leftMouse(gg)
            //console.log(emptySlot)
        }
        await input2.close()
        await sleep(50)
        //放入
        try {    //wait shulker
            let fail = false;
            await new Promise(async (res, rej) => {
                const timeout = setTimeout(() => {
                    fail = true;
                    rej()
                }, 7000)
                while (!fail) {
                    await sleep(10)
                    let block = bot.blockAt(outputVec)
                    //console.log(block)
                    if (!block) continue
                    if ((block.name).indexOf('shulker') >= 0) break
                }
                clearTimeout(timeout)
                res()
            })
        } catch (e) {
            console.log("找不到out box")
            return
        }
        let output, t2 = 0;
        while (t2++ < 10 && !output) {
            output = await containerOperation.openContainerWithTimeout(bot, outputVec, 1000)
        }
        if (!output) {
            console.log("Can't open output box")
            return
        }
        for (let gg = 0; gg < 27; gg++) {
            if (wrap_items[gg].name == null) continue
            //console.log(wrap_items[gg].mapid)
            if (wrap_items[gg].name == "filled_map") {
                let tgmp = -1;
                for (let ff = 27; ff <= 62; ff++) {
                    if (output.slots[ff]?.nbt?.value?.map?.value == wrap_items[gg].mapid) {
                        tgmp = ff;
                        break;
                    }
                }
                //console.log("map",tgmp,gg)
                await bot.simpleClick.leftMouse(tgmp)
                await bot.simpleClick.leftMouse(gg)
            } else {
                let tgmp = -1;
                for (let ff = 27; ff <= 62; ff++) {
                    if (output.slots[ff]?.name == wrap_items[gg].name) {
                        tgmp = ff;
                        break;
                    }
                }
                //console.log("item",tgmp,gg)
                await bot.simpleClick.leftMouse(tgmp)
                await bot.simpleClick.leftMouse(gg)
            }
        }

        await output.close()
        await sleep(50)
        console.log(`第 ${i + 1} 套 完成`)
        await bot.activateBlock(bot.blockAt(btvec));
        await sleep(250)
        //break;
    }
}
function getMapItemByMapIDInInventory(mpID) {
    // for(i in bot.inventory.slots){
    //     console.log(bot.inventory.slots[i])
    // }
    return bot.inventory.slots.find(item => item?.nbt?.value?.map?.value == mpID);
}
async function mapCopy(cartography_table_pos, mapid, amount = 1) {
    // let shulker_box = await containerOperation.openContainerWithTimeout(bot,mps.box,3000);
    // let block = bot.blockAt(cartography_table_pos)
    let ct
    let ttry = 0;
    while (!ct && ttry < 3) {
        ct = await containerOperation.openContainerWithTimeout(bot, cartography_table_pos, 500)
    }
    if (!ct) throw new Error("can't open cartography_table")
    for (let i = 0; i < amount; i++) {
        await mapCopyOne(ct, mapid);
    }
    await ct.close()
    //console.log(bot.inventory)
    async function mapCopyOne(cartography_table, mapid) {
        let targetMap = cartography_table.slots.find(item => item?.nbt?.value?.map?.value == mapid)
        let emptyMap = cartography_table.findInventoryItem('map', null, false)
        //console.log(targetMap, emptyMap)
        await bot.simpleClick.leftMouse(targetMap.slot)
        await bot.simpleClick.leftMouse(0)
        // await bot.simpleClick.leftMouse(targetMap.slot)
        await bot.simpleClick.leftMouse(emptyMap.slot)
        await bot.simpleClick.leftMouse(1)
        //await bot.simpleClick.leftMouse(emptyMap.slot)
        //console.log(ct)
        let outputitem = JSON.parse(JSON.stringify(cartography_table.slots[0]))
        outputitem.slot = 2;
        outputitem.count = outputitem.count * 2 > 64 ? 64 : outputitem.count * 2;
        //let slot0
        let slot1 = JSON.parse(JSON.stringify(cartography_table.slots[1]))
        slot1.count = slot1.count - 1//cartography_table.slots[0].count
        if (slot1.count < 1) slot1 = null
        // return
        // console.log(cartography_table)
        // console.log(outputitem)
        await cartography_table.updateSlot(2, outputitem)
        await bot.putAway(2)
        //console.log(cartography_table)
        await cartography_table.updateSlot(0, null)
        await cartography_table.updateSlot(1, slot1)
        await bot.putAway(1)
        //console.log(cartography_table)
        //console.log(outputitem)
    }
}
async function pickMapItem(mpID) {
    let timeout = false
    let to = setTimeout(() => {
        timeout = true;
    }, 15000);
    while (true) {
        if (timeout) break;
        let ck = getMapItemByMapIDInInventory(mpID);
        if (ck) break;
        let et = bot.entities;
        for (i in et) {
            if (et[i]?.mobType == 'Item' && et[i]?.metadata[8]?.itemId == mcData.itemsByName['filled_map'].id && et[i]?.metadata[8].nbtData?.value?.map?.value == mpID) {
                if (et[i].onGround) await pathfinder.astarfly(bot, new Vec3(Math.round(et[i].position.x - 0.5), Math.round(et[i].position.y - 1), Math.round(et[i].position.z - 0.5)), null, null, null, true)
                else await pathfinder.astarfly(bot, new Vec3(Math.round(et[i].position.x - 0.5), Math.round(et[i].position.y), Math.round(et[i].position.z - 0.5)), null, null, null, true)
            }
            //console.log(et)
        }
        await sleep(10)
        //break;
        //let tget = bot.entities.find(e => e?.type)
    }
    if (timeout) throw new Error("撿起地圖畫超時");
    try { clearTimeout(to) } catch (e) { }
}
async function save(caec) {
    await fsp.writeFile(`${process.cwd()}/config/${bot_id}/mapart.json`, JSON.stringify(caec, null, '\t'), function (err, result) {
        if (err) console.log('mapart save error', err);
    });
    //console.log('task complete')
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