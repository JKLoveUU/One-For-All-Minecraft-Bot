const fs = require('fs')
const fsp = require('fs').promises
const { WebhookClient } = require('discord.js')
const litematicPrinter = require('../litematicPrinter')
const station = require('../station')
const { sleep, readConfig } = require('../common')
const { mapartState } = require('./core')
const { taskreply } = require('./utils')
const Status = require('../../src/modules/botstatus')

async function mp_debug(task) {
    const { bot } = mapartState
    let mp = {};
    for (let i = bot.inventory.inventoryStart; i <= bot.inventory.inventoryEnd; i++) {
        if (bot.inventory.slots[i] == null) continue
        let c = bot.inventory.slots[i].count
        let n = bot.inventory.slots[i].name
        if (!mp[n]) mp[n] = c;
        else mp[n] += c
    }
    for (const i in mp) {
        console.log(i.toString().padEnd(16), mp[i])
    }
}

async function mp_set(task) {
    const { bot, bot_id } = mapartState
    let mapart_set_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    if (!fs.existsSync(mapartState.mapart_global_cfg.schematic_folder + task.content[2])) {
        await taskreply(task,
            `&7[&bMP&7] &c未發現投影 &7${task.content[2]} &r請重新輸入`,
            `未發現投影 請重新輸入\n資料夾: ${mapartState.mapart_global_cfg.schematic_folder}\n檔案: ${task.content[2]}`,
            null,
        );
        return;
    }
    mapart_set_cache.schematic.filename = task.content[2]
    mapart_set_cache.schematic.placementPoint_x = parseInt(task.content[3])
    mapart_set_cache.schematic.placementPoint_y = parseInt(task.content[4])
    mapart_set_cache.schematic.placementPoint_z = parseInt(task.content[5])
    if (Math.abs(mapart_set_cache.schematic.placementPoint_x + 64) % 128 != 0 && task.content[6] != '-f') {
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
    mapartState.mapart_cfg = mapart_set_cache;
    await taskreply(task,
        `&7[&bMP&7] &a設置成功`,
        `設置成功`,
        null,
    );
}

async function mp_info(task) {
    const { bot, bot_id } = mapartState
    let mapart_info_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let lppq = await litematicPrinter.progress_query(task, bot)
    let prog = ((lppq.placedBlock / lppq.totalBlocks) * 100).toFixed(1)

    switch (task.source) {
        case 'minecraft-dm':
            bot.chat(`/m ${task.minecraftUser} ${mapart_info_cfg_cache.schematic.filename} ${prog}%`);
            break;
        case 'console':
            console.log(`${mapart_info_cfg_cache.schematic.filename} ${prog}%`)
            break;
        case 'discord':
            console.log(`Discord Reply not implemented`);
            break;
        default:
            break;
    }
}

async function mp_build(task) {
    const { bot, bot_id } = mapartState
    let cfg = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    cfg.schematic.folder = mapartState.mapart_global_cfg.schematic_folder;
    cfg.bot_id = bot_id
    cfg.replaceMaterials = mapartState.mapart_global_cfg.replaceMaterials
    cfg.server = bot.botinfo.server
    delete cfg.open;
    delete cfg.wrap;

    const flags = parseBuildFlags(task, bot.botinfo.server)
    if (flags.error) return
    if (flags.server) cfg.server = flags.serverValue
    if (cfg.server == -1) {
        console.log(`&7${cfg.server} TAB 分流讀取失敗 請重試`)
        return
    }

    await litematicPrinter.build_file(task, bot, litematicPrinter.model_mapart, cfg)

    let result = await litematicPrinter.progress_query(task, bot)
    let useTime = (result.endTime - result.startTime) / 1000
    mapartState.mapartBuildUseTime = useTime
    console.log(`消耗時間 ${parseInt((useTime / 3600))} h ${parseInt((useTime % 3600) / 60)} m ${parseInt(useTime % 60)} s`)

    const fileInfo = parseFilename(cfg.schematic.filename)
    const webhookClient = new WebhookClient({ url: mapartState.mapart_global_cfg.discord_webhookURL });

    if (!flags.disableWebhook) {
        sendBuildWebhook(bot, webhookClient, cfg, result, useTime)
    }
    if (flags.autonext) {
        scheduleAutoNext(bot, task, webhookClient, cfg, flags, result, fileInfo)
    }
}

function parseBuildFlags(task, defaultServer) {
    const auto_regex = /^(\d+)_(\d+)$/
    let autonext = false, autonextValue = '', server = false, serverValue = defaultServer, disableWebhook = false, error = false
    for (let i = 0; i < task.content.length; i++) {
        if (!task.content[i].startsWith('-')) continue
        switch (task.content[i]) {
            case '-a': case '-auto':
                autonext = true
                const match = task.content[i + 1]?.match(auto_regex)
                if (match) { autonextValue = task.content[i + 1]; i++ }
                break
            case '-s': case '-server':
                if (Number.isInteger(parseInt(task.content[i + 1]))) {
                    server = true; serverValue = parseInt(task.content[i + 1]); i++
                } else { console.log(`-s 缺少分流參數`); error = true }
                break
            case '-n': disableWebhook = true; break
        }
    }
    return { autonext, autonextValue, server, serverValue, disableWebhook, error }
}

function parseFilename(filename) {
    const f_reg = /_(\d+)_(\d+)$/
    const sp = filename.split(".")
    let baseName = sp[0]
    const ext = sp[1]
    const match = baseName.match(f_reg)
    baseName = baseName.replace(/_\d+_\d+$/, '')
    const index = match ? [parseInt(match[1]), parseInt(match[2])] : null
    return { baseName, ext, index }
}

function sendBuildWebhook(bot, webhookClient, cfg, result, useTime) {
    const iconurl = `https://mc-heads.net/avatar/${bot.username}`
    let wh = {
        username: bot.username,
        avatarURL: iconurl,
        embeds: [genFinishEmbed(bot.username, cfg.schematic.filename, result, useTime)]
    }
    if (bot.debugMode) {
        wh.embeds.push(genDebugEmbed(bot, result, useTime))
    }
    webhookClient.send(wh)
}

function scheduleAutoNext(bot, task, webhookClient, cfg, flags, result, fileInfo) {
    const auto_regex = /^(\d+)_(\d+)$/
    let stopAt = null
    if (flags.autonextValue) {
        const m = flags.autonextValue.match(auto_regex)
        stopAt = [parseInt(m[1]), parseInt(m[2])]
    }
    if (!fileInfo.index) {
        sendAutoFinishWebhook(bot, webhookClient, fileInfo.baseName, result)
        return
    }
    if (stopAt && stopAt[0] == fileInfo.index[0] && stopAt[1] == fileInfo.index[1]) {
        sendAutoFinishWebhook(bot, webhookClient, fileInfo.baseName, result)
        return
    }
    let nextFileName = null
    if (fs.existsSync(`${cfg.schematic.folder}${fileInfo.baseName}_${fileInfo.index[0]}_${fileInfo.index[1] + 1}.${fileInfo.ext}`)) {
        nextFileName = `${fileInfo.baseName}_${fileInfo.index[0]}_${fileInfo.index[1] + 1}.${fileInfo.ext}`
    } else if (fs.existsSync(`${cfg.schematic.folder}${fileInfo.baseName}_${fileInfo.index[0] + 1}_0.${fileInfo.ext}`)) {
        nextFileName = `${fileInfo.baseName}_${fileInfo.index[0] + 1}_0.${fileInfo.ext}`
    }
    if (!nextFileName) {
        sendAutoFinishWebhook(bot, webhookClient, fileInfo.baseName, result)
        return
    }
    let nextV3 = [cfg.schematic.placementPoint_x + 128, cfg.schematic.placementPoint_y, cfg.schematic.placementPoint_z]
    bot.taskManager.assign({
        priority: bot.taskManager.defaultPriority - 2,
        displayName: '地圖畫 設定 (自動下張)',
        source: task.source,
        content: ['mapart', 'set', nextFileName, nextV3[0].toString(), nextV3[1].toString(), nextV3[2].toString()],
        timestamp: Date.now(),
        sendNotification: false,
        minecraftUser: task.minecraftUser,
        discordUser: task.discordUser
    })
    let nextBuildArgs = task.content
    if (!flags.server) {
        nextBuildArgs.push('-s')
        nextBuildArgs.push(flags.serverValue.toString())
    }
    bot.taskManager.assign({
        priority: bot.taskManager.defaultPriority - 1,
        displayName: '地圖畫 建造(自動下張)',
        source: task.source,
        content: nextBuildArgs,
        timestamp: Date.now(),
        sendNotification: false,
        minecraftUser: task.minecraftUser,
        discordUser: task.discordUser
    })
}

function sendAutoFinishWebhook(bot, webhookClient, baseName, result) {
    const iconurl = `https://mc-heads.net/avatar/${bot.username}`
    webhookClient.send({
        username: bot.username,
        avatarURL: iconurl,
        embeds: [{
            color: 0x0099ff,
            title: `已全數蓋完`,
            author: { name: bot.username, icon_url: iconurl },
            description: `\`${baseName}\``,
            thumbnail: { url: iconurl },
            fields: [
                { name: '分流', value: `${result.server}`, inline: true },
                { name: '材料站', value: `${'-'}`, inline: true },
                { name: '完成時間', value: `<t:${parseInt(result.endTime / 1000)}:f>`, inline: false },
            ],
        }],
    })
}

function genFinishEmbed(username, filename, result, useTime) {
    const iconurl = `https://mc-heads.net/avatar/${username}`
    return {
        color: 0x0099ff,
        title: `${filename} 建造完成`,
        author: { name: username, icon_url: iconurl },
        thumbnail: { url: iconurl },
        fields: [
            { name: 'Placement Origin', value: `X:${'`' + result.placement_origin.x.toString().padStart(6) + '`'} Y:${'`' + result.placement_origin.y.toString().padStart(4) + '`'} Z:${'`' + result.placement_origin.z.toString().padStart(6) + '`'}` },
            { name: 'Placement Destination', value: `X:${'`' + result.placement_destination.x.toString().padStart(6) + '`'} Y:${'`' + result.placement_destination.y.toString().padStart(4) + '`'} Z:${'`' + result.placement_destination.z.toString().padStart(6) + '`'}` },
            { name: '地圖畫大小', value: `\`${Math.round((result.destination.x + 1) / 128)}*${Math.round((result.destination.z + 1) / 128)} (${(result.destination.x + 1)}*${(result.destination.y + 1)}*${(result.destination.z + 1)})\``, inline: true },
            { name: '分流', value: `${result.server}`, inline: true },
            { name: '材料站', value: `${'-'}`, inline: true },
            { name: '開始時間', value: `<t:${parseInt(result.startTime / 1000)}:f>`, inline: true },
            { name: '完成時間', value: `<t:${parseInt(result.endTime / 1000)}:f>`, inline: true },
            { name: '消耗時間', value: `${parseInt((useTime / 3600))} h ${parseInt((useTime % 3600) / 60)} m ${parseInt(useTime % 60)} s`, inline: true },
            { name: 'Speed', value: `${Math.round((result.totalBlocks / (useTime / 3600)) * 10) / 10} Blocks / h`, inline: true },
        ],
    }
}

function genDebugEmbed(bot, result, useTime) {
    let inv = '```'
    let mp = {}
    for (let i = bot.inventory.inventoryStart; i <= bot.inventory.inventoryEnd; i++) {
        if (bot.inventory.slots[i] == null) continue
        let c = bot.inventory.slots[i].count
        let n = bot.inventory.slots[i].name
        if (!mp[n]) mp[n] = c; else mp[n] += c
    }
    for (const i in mp) inv += `${i.toString().padEnd(16)} ${mp[i]}\n`
    inv += '```'
    return {
        color: 0x0099ff,
        title: `除錯資料`,
        fields: [
            { name: '放置成功率', value: `${((result.totalBlocks / result.debug.placeCount) * 100).toFixed(1)}% (${result.totalBlocks} / ${result.debug.placeCount})`, inline: true },
            { name: '斷線次數', value: `${result.debug.discconnectCount}`, inline: true },
            { name: '純放置效率(扣除其他時間)', value: `${((result.totalBlocks / (useTime - result.debug.restock_takeTime / 1000))).toFixed(1)} b/s` },
            { name: '材料補充次數', value: `${result.debug.restock_count}`, inline: true },
            { name: '材料補充耗時', value: `${(result.debug.restock_takeTime / 1000).toFixed(1)} 秒`, inline: true },
            { name: 'FindNext 耗時', value: `${(result.debug.findNextTotalCounter / 1000).toFixed(1)} 秒`, inline: false },
            { name: '結束時背包', value: inv },
        ],
    }
}

async function mp_pause(task) {
    litematicPrinter.pause(true)
    process.send({ type: 'setStatus', value: Status.TASK_PAUSED })
}

async function mp_resume(task) {
    litematicPrinter.resume()
    process.send({ type: 'setStatus', value: Status.TASK_MAPART })
}

async function mp_stop(task) {
    litematicPrinter.stop()
}

async function mp_test(task) {
    const { bot, bot_id } = mapartState
    let mapart_build_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let stationConfig = await readConfig(`${process.cwd()}/config/global/${mapart_build_cfg_cache.station}`);
    let needReStock = [
        { name: task.content[2], count: parseInt(task.content[3]) },
    ]
    await station.newrestock(bot, stationConfig, needReStock)
    return
}

module.exports = { mp_build, mp_test, mp_debug, mp_set, mp_info, mp_pause, mp_resume, mp_stop }
