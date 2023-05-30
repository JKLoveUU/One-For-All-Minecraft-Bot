/**
 * 突襲Bot 核心功能原作者為 西瓜 MelonRind
 * 
 * 
 */
if (!process.argv[2]) {
  return
}
let debug = process.argv.includes("--debug");
let config
const mineflayer = require('mineflayer');
const CNTA = require('chinese-numbers-to-arabic');
const fs = require('fs')
//const pcfg = require(`../cfg/profiles.json`)[process.argv[2]]
const profiles = require(`${process.cwd()}/profiles.json`);
let pcfg = {
  "farm": ["ExampleFarm1"],
  "printEff": true,
  "printPeriod": 600_000,

}
const { once } = require('events')
if (!profiles[process.argv[2]]) {
  //已經在parent檢查過了 這邊沒有必要
  console.log(`profiles中無 ${process.argv[2]} 資料`)
  process.send({ type: 'setStatus', value: 1000 })
  process.exit(2001)
}
if (!fs.existsSync(`config/${process.argv[2]}`)) {
  fs.mkdirSync(`config/${process.argv[2]}`, { recursive: true });
  console.log(`未發現配置文件 請至 config/${process.argv[2]} 配置`)
}
if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/raid.json`)) {
  logger(true, "INFO", "Creating config - raid.json")
  fs.writeFileSync(`${process.cwd()}/config/${process.argv[2]}/raid.json`, JSON.stringify(pcfg, null, '\t'), function (err, result) {
    if (err) logger(true, "ERROR", `Unable to create ${process.argv[2]}/raid.json`,err)
  });
  //logger(true, 'INFO', `Creating config - raid.json`)
} else {
  pcfg = readConfig(`${process.cwd()}/config/${process.argv[2]}/raid.json`)
}
let global_farm_config = {
  "1F1": {
    "displayName": "WORLD_1",
    "server": ["分流一", "1"],
    "teleportType": "tpc",
    "homeName": "e",
    "tpcOwner": "JSLoveJS",
    "tpcSequence": 1,
    "extra": "bedrock",
    "location": {
      "anchor": [5848, 214, -3207],
      "clock": [5850, 213, -3206],
      "lava": [5849, 213, -3208],
      "dump": [5848, 215, -3209],
      "egg": [5850, 215, -3207],
      "extra": [5848, 215, -3209]
    }
  },
  "1F2": {
    "displayName": "WORLD_1",
    "server": ["分流一", "1"],
    "teleportType": "tpc",
    "homeName": "e",
    "tpcOwner": "JSLoveJS",
    "tpcSequence": 1,
    "extra": "bedrock",
    "location": {
      "anchor": [5848, 214, -3207],
      "clock": [5850, 213, -3206],
      "lava": [5849, 213, -3208],
      "dump": [5848, 215, -3209],
      "egg": [5850, 215, -3207],
      "extra": [5848, 215, -3209]
    }
  }
}
if (!fs.existsSync(`${process.cwd()}/config/global/raidFarm.json`)) {
  logger(true, 'INFO', `Creating global config - raidFarm.json`)
  fs.writeFileSync(`${process.cwd()}/config/global/raidFarm.json`, JSON.stringify(global_farm_config, null, '\t'), function (err, result) {
    if (err) logger(true, "ERROR", `Unable to create a Global raidFarm setting`,err)
  });
} else {
  global_farm_config = readConfig(`${process.cwd()}/config/global/raidFarm.json`)
}
let fcfg = global_farm_config[pcfg.farm[0]]
if (!fcfg) {
  logger(true, "ERROR", `RaidFarm - ${pcfg.farm[0]} not found.`)
  process.exit(2003)
}
/** @param {number} ms */
const timer = ms => new Promise(res => setTimeout(res, ms))
process.send({ type: 'setReloadCD', value: 10_000 })
process.send({ type: 'setStatus', value: 3001 })
const botinfo = {
  server: -1,
  serverCH: -1,
  balance: -1,
  coin: -1,
  tabUpdateTime: new Date(),
}
const status = {
  INIT: -1,
  IDLE: 0,
  GRIND: 1,
  TOSS: 2,
  DEPOSIT: 3,
  CHEST: 4,
  REFILL: 5,
  CHECKPOS: 6,
  RERAID: 7
}
const grinde = {
  onServer: undefined,
  bal: 0,
  status: status.INIT,
  clock: 0,
  doEggRefill: true,
  keepalive: setTimeout(kill, 720_000),
  reraid: setTimeout(reraid, 180_000),
  checkposobj: setTimeout(checkpos, 30_000, true),
  attackTicker: {
    obj: undefined,
    clock: 0
  },
  look: {},
  eff: {
    obj: undefined,
    lastmoney: 0
  },
  ids: {
    item: {
      emerald: 'emerald',
      crossbow: 'crossbow',
      totem: 'totem_of_undying',
      egg_pillager: 'pillager_spawn_egg',
      egg_empty: 'ghast_spawn_egg',
      extra: fcfg.extra, // placeholder (disabled)
      //extra: 'redstone', // placeholder (disabled)
      trash: ['crossbow', 'iron_axe', 'totem_of_undying', 'white_banner', 'sugar', 'potion', 'gunpowder',
        'glass_bottle', 'stick', 'spider_eye', 'saddle', 'player_head', 'glowstone_dust', 'redstone']
    },
    armor: {
      sword: "netherite_sword",
      helmet: "netherite_helmet",
      chestplate: "netherite_chestplate",
      leggings: "netherite_leggings",
      boots: "netherite_boots",
    },
    entity: {
      raid: ['pillager', 'vindicator', 'evoker', 'witch'],
      capture: 'pillager',
      vex: 'vex'
    }
  }
}

if (true) { //config
  const mcData = require('minecraft-data')("1.18.2")
  grinde.ids.item.emerald = mcData.itemsByName[grinde.ids.item.emerald].id
  grinde.ids.item.crossbow = mcData.itemsByName[grinde.ids.item.crossbow].id
  grinde.ids.item.totem = mcData.itemsByName[grinde.ids.item.totem].id
  grinde.ids.item.egg_pillager = mcData.itemsByName[grinde.ids.item.egg_pillager].id
  grinde.ids.item.egg_empty = mcData.itemsByName[grinde.ids.item.egg_empty].id
  //
  grinde.ids.armor.sword = mcData.itemsByName[grinde.ids.armor.sword].id
  grinde.ids.armor.helmet = mcData.itemsByName[grinde.ids.armor.helmet].id
  grinde.ids.armor.chestplate = mcData.itemsByName[grinde.ids.armor.chestplate].id
  grinde.ids.armor.leggings = mcData.itemsByName[grinde.ids.armor.leggings].id
  grinde.ids.armor.boots = mcData.itemsByName[grinde.ids.armor.boots].id
  try {
    grinde.ids.item.extra = mcData.itemsByName[grinde.ids.item.extra].id
  } catch (e) {
    //grinde.ids.item.extra        = mcData.itemsByName[grinde.ids.item.extra].id
    grinde.ids.item.extra = mcData.itemsByName["bedrock"].id
  }
  for (const i in grinde.ids.item.trash)
    grinde.ids.item.trash[i] = mcData.itemsByName[grinde.ids.item.trash[i]].id
  for (const i in grinde.ids.entity.raid)
    grinde.ids.entity.raid[i] = mcData.entitiesByName[grinde.ids.entity.raid[i]].id
  grinde.ids.entity.capture = mcData.entitiesByName[grinde.ids.entity.capture].id
  grinde.ids.entity.vex = mcData.entitiesByName[grinde.ids.entity.vex].id

  const { Vec3 } = require('vec3');
  ['anchor', 'lava', 'dump', 'egg', 'extra'].forEach(b => {
    fcfg.location[b] = new Vec3(...fcfg.location[b].slice(0, 3))
  })
  const configERR = m => {
    logger(true, "ERROR", `Config Error: ${m}`)
    process.exit(2003)
  }
  const checkDist = (b, d, e) => {
    if (fcfg.location.anchor.distanceSquared(fcfg.location[b]) > d)
      configERR(`${e} too far from anchor`)
  }
  checkDist('lava', 8, 'lava')
  checkDist('dump', 25, 'dump chest')
  checkDist('egg', 25, 'egg')
  checkDist('egg', 25, 'extra')

  const delta = fcfg.location.lava.minus(fcfg.location.anchor)
  grinde.look.yaw = Math.atan2(-delta.x, -delta.z)
  grinde.look.pitch = Math.atan2(delta.y, Math.sqrt(delta.x ** 2 + delta.z ** 2))
  if (grinde.look.yaw < 0) grinde.look.yaw += Math.PI * 2
}

const mc = (() => { // createMcBot
  logger(true, "INFO", `Logging into minecraft... ${pcfg.farm[0]} ${fcfg.displayName}`)

  const mc = mineflayer.createBot({
    host: profiles[process.argv[2]].host,
    port: profiles[process.argv[2]].port,
    username: profiles[process.argv[2]].username,
    auth: "microsoft",
    version: "1.18.2",
    viewDistance: 2
  })

  mc.once('spawn', () => {
    logger(true, "INFO", `Logged into minecraft as ${mc.username}.`)
    mc.setQuickBarSlot(1)
    process.send({ type: 'setStatus', value: 2200 })
    if (process.argv[3] !== '1')
      mc.chatAddPattern(
        /^(\[[A-Za-z0-9-_您]+ -> [A-Za-z0-9-_您]+\] .+)$/,
        'dm'
      )
    mc.chatAddPattern(
      /^\[系統\] (\S+) 想要你?傳送到 (你|該玩家) 的位置$/,
      'tpa'
    )
    mc.chatAddPattern(
      /^\[系統\] 成功操作綠寶石帳戶 :  - 1728 存款$/,
      'income'
    )
    mc.chatAddPattern(
      /^\[系統\] .+ \(目前擁有 ([\d\.]+) 綠寶石\)$/,
      'paid'
    )
    mc.chatAddPattern(
      /^Summoned to wait by CONSOLE$/,
      'wait'
    )
  })

  mc.on(process.argv[3] === '1' ? 'messagestr' : 'dm', logger)

  mc.on('tpa', p => {
    mc.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
    logger(true, 'INFO', `${config.setting.whitelist.includes(p) ? "Accept" : "Deny"} ${p}'s tpa request`);
  })
  mc.on('tpahere', p => {
    mc.chat(config.setting.whitelist.includes(p) ? '/tpaccept' : '/tpdeny')
    logger(true, 'INFO', `${config.setting.whitelist.includes(p) ? "Accept" : "Deny"} ${p}'s tpahere request`);
  })
  mc.on('wait', async () => {
    process.send({ type: 'setReloadCD', value: 120_000 })
    logger(true, "ERROR", 'get sent to wait room, restarting')
    await kill(1001)
  })
  mc.on('income', () => {
    grinde.bal += 1728
  })
  mc.on('paid', e => {
    grinde.eff.lastmoney -= grinde.bal - e
    grinde.bal = e
  })
  //#新增
  mc.on("message", async function (jsonMsg) {
    if (jsonMsg.toString().startsWith(`[`) && jsonMsg.toString().toLowerCase().includes(`您]`)) {  //偵測訊息
      const msg = (jsonMsg.toString())
      let args = msg.split(/ +/g);
      let playerid = args.splice(0, 3)//取得Minecraft ID
      playerid = playerid[0].slice(1, playerid[0].length);
      let cmd = args.shift();
      if (!config.setting.whitelist.includes(playerid)) {
        mc.chat(`/m ${playerid} ???`);
        return;
      }
      switch (cmd) { //指令前綴} 
        case 'say':
          let say = args[0];
          for (let i = 1; i < args.length; i++) {
            say += " " + args[i];
          }
          mc.chat(say);
          break
        case 'money':
        case 'bal':
          mc.chat(`/m ${playerid} 當前綠寶石: ${grinde.bal}`);
          break;
        case 'payall':
          mc.chat(`/pay ${playerid} ${grinde.bal}`);
          break;
        default:
          break;
      }
    }
  })//#Mark_end
  mc.on('kicked', j => {
    if (j.includes('this proxy')) process.exitCode = 1100//2
    logger(true, "WARN", `Got kicked. ${j}`)
  })
  mc.on('error', e => {
    logger(true, "ERROR", `${e.name}\n${e.message}`)
  })

  mc.on('end', async () => {
    // console.log("end")
    await kill()
  })

  mc._client.on('playerlist_header', () => {
    botTabhandler(mc.tablist)
    const header = mc.tablist.header.extra
    if (!header) return
    const server = header[header.length - 17]?.text
    if (!server?.startsWith('分流')) return
    grinde.onServer = server
    if (header[header.length - 29]?.text !== '낸') return
    const bal = parseFloat(header[header.length - 28]?.text.replace(/,/g, ''))
    if (bal >= 0 && grinde.bal - bal !== 1728 && grinde.bal !== bal) grinde.bal = bal
  })

  init()
  return mc
})()

process.on('message', async (message) => {
  switch (message.type) {
    case 'init':
      config = message.config;
      break;
    case 'dataRequire':
      dataRequiredata = {
        name: mc.username,
        server: botinfo.server,
        coin: botinfo.coin,
        balance: botinfo.balance,
        position: mc.entity.position,
        tasks: taskManager.tasks,
        runingTask: taskManager.tasking
      }
      process.send({ type: 'dataToParent', value: dataRequiredata })
      break;
    case 'cmd':
      let args = message.text.slice(1).split(' ')
      console.log(args)
      let isTask = taskManager.isTask(args)
      if (isTask.vaild) {
        let tk = new Task(10, isTask.name, 'console', args, undefined, undefined, undefined, undefined)
        taskManager.assign(tk, isTask.longRunning)
        // console.log(taskManager.isImm(cmds))

      }
      //交給CommandManager
      break;
    case 'chat':
      mc.chat(message.text)
      console.log(`已傳送訊息至 ${mc.username}: ${message.text}`);
      break;
    case 'reload':
      process.send({ type: 'setStatus', value: 3002 })
      await kill(1002)
      break;
    case 'exit':
      process.send({ type: 'setStatus', value: 0 })
      await kill(0)
      break;
    default:
      console.log('message from parent:', message);
  }
  // switch (m.type) {
  //   case 'stop':
  //     process.exitCode = 2
  //     await kill()
  //     break
  //   case 'chat':
  //     try { mc.chat(m.text) } catch (e) {
  //       logger(`${e.name}\n${e.message}`)
  //     }
  //     break
  //   case 'cmd':
  //     const args = m.text.split(' ')
  //     switch (args[0]) {
  //       case 'bal':
  //         logger(`Bal: ${grinde.bal}`)
  //         break
  //       case 'payall':
  //         if (fcfg.master) mc.chat(`/pay ${fcfg.master} ${grinde.bal}`)
  //         break
  //     }
  //     break
  //   case 'cmdlist':
  //     logger('cmds: bal, payall')
  //     break
  //   case 'xp':
  //     logger(`Xp: ${mc.experience.level}L (${(mc.experience.progress * 100).toFixed(1)}%) ${mc.experience.points}p`)
  //     break
  // }
})

async function init() {
  while (!grinde.onServer) await timer(500)
  await checkpos(true, true)
  mc.on(`blockUpdate:(${fcfg.location.clock.join(', ')})`, () => { grinde.clock++; grinde.attackTicker.clock++ })

  clearInterval(grinde.eff.obj)
  clearTimeout(grinde.eff.obj)
  grinde.eff.obj = setTimeout(() => {
    if (grinde.status === status.INIT) return
    grinde.clock = 0
    grinde.eff.lastmoney = grinde.bal
    mc.inventory.items().filter(i => i.type === grinde.ids.item.emerald).forEach(e => { grinde.eff.lastmoney += e.count })
    grinde.keepalive.refresh()
    grinde.eff.obj = setInterval(() => {
      if (grinde.status === status.INIT) return
      let dmoney = grinde.bal
      mc.inventory.items().filter(i => i.type === grinde.ids.item.emerald).forEach(e => { dmoney += e.count })
      grinde.eff.lastmoney += dmoney -= grinde.eff.lastmoney
      let tps = -1;
      if (grinde.clock > 1714) tps = (20)
      else tps = ((grinde.clock / 1714) * 20)
      let tpsColor = '';
      if (tps >= 19.9) {
        tpsColor = '\x1b[92m'
      } else if (tps >= 19) {
        tpsColor = '\x1b[32m'
      } else if (tps > 13) {
        tpsColor = '\x1b[93m'
      } else {
        tpsColor = '\x1b[31m'
      }
      //logger(`I|E: ${`${dmoney}`.padStart(5, ' ')} (${`${dmoney * 6}`.padStart(5, ' ')} e/h) Clc: ${`${grinde.clock}`.padStart(4, ' ')
      //}`)
      logger(true, "INFO", `[\x1b[32mReport\x1b[0m] dE ${`${dmoney}`.padStart(5, ' ')} (${`${dmoney * 6}`.padStart(5, ' ')} e/h) [${fcfg.server[1]}] TPS: ${tpsColor}${`${(tps.toFixed(1)).padStart(4, ' ')}`}\x1b[0m bal: ${(grinde.eff.lastmoney.toString()).padStart(8, ' ')}`)
      if (dmoney > 0) grinde.keepalive.refresh()
      grinde.clock = 0
    }, 600_000)
  }, 180_000)
  grinde.attackTicker.obj = setInterval(main, 700)
  setInterval(attackTickerRefresher, 120_000)
  logger(true, "INFO", 'Init completed')
}

function attackTickerRefresher() {
  if (!grinde.attackTicker.clock) kill()
  clearInterval(grinde.attackTicker.obj)
  grinde.attackTicker.obj = setInterval(main, Math.ceil(Math.max(160_000 / grinde.attackTicker.clock - 67, 550)))
  grinde.attackTicker.clock = 0
}

async function main() {
  if (grinde.status !== status.IDLE) return
  await checkpos(force = true)
  await restockEgg()
  grind()
  await refillTotem()
  await toss()
  setTimeout(() => grinde.status = status.IDLE, 400)
}

/**
 * Check if the bot's pos is on anchor
 * 
 * @param {boolean} reset 
 * @param {boolean} force
 * @returns 
 */
async function checkpos(reset = false, force = false) {
  grinde.checkposobj.refresh()
  if (fcfg.server === null) return
  if (!force && grinde.status !== status.IDLE) return
  grinde.status = status.CHECKPOS

  for (let a = 20; grinde.onServer !== fcfg.server[0]; a++) {
    if (a >= 20) {
      logger(true, "WARN", `Incorrect Server! transferring... ${grinde.onServer} -> ${fcfg.server[0]}`)
      mc.chat(`/ts ${fcfg.server[1]}`)
      a = 0
    }
    await timer(1000)
  }

  const pos = mc.entity.position.offset(0.0, 0.2, 0.0).floor()
  if (mc.entity.velocity.x === 0 && mc.entity.velocity.z === 0 ?
    pos.x !== fcfg.location.anchor.x ||
    pos.y !== fcfg.location.anchor.y ||
    pos.z !== fcfg.location.anchor.z :
    Math.abs(pos.x - fcfg.location.anchor.x) > 2 ||
    Math.abs(pos.y - fcfg.location.anchor.y) > 2 ||
    Math.abs(pos.z - fcfg.location.anchor.z) > 2) {
    logger(true, "WARN", `Incorrect position! transferring...`)
    switch (fcfg.teleportType) {
      case "tpc":
        logger(true, "INFO", `Teleport To ${fcfg.tpcOwner}'s land ${fcfg.tpcSequence}`)
        tpc(fcfg.tpcOwner, fcfg.tpcSequence)
        break;
      case "home":
        logger(true, "INFO", `execute command /homes ${homeName}`)
        mc.chat(`/homes ${homeName}`)
        break;
      default:
        logger(true, "INFO", `execute command /homes e`)
        mc.chat('/homes e')
        break;
    }
    await timer(1000)
  }

  if (Math.abs(mc.entity.yaw - grinde.look.yaw) > 0.1 ||
    Math.abs(mc.entity.pitch - grinde.look.pitch) > 0.1)
    mc.look(grinde.look.yaw, grinde.look.pitch, true)

  if (reset) grinde.status = status.IDLE
}

function grind() {
  grinde.status = status.GRIND

  let m = mc.nearestEntity(e => e.type === 'mob' && e.metadata[9] > 0 && //Health
    grinde.ids.entity.raid.includes(e.entityType) && e.getCustomName()?.toString() != 'a')
  if (m?.position.distanceSquared(mc.entity.position) < 10) {
    grinde.reraid.refresh()
    mc.attack(m, false)
    return
  }

  m = mc.nearestEntity(e => e.type === 'mob' && e.entityType === grinde.ids.entity.vex && e.metadata[9] > 0)
  if (m?.position.distanceSquared(mc.entity.position) < 10) mc.attack(m, false)
}

async function refillTotem() {
  grinde.status = status.REFILL
  const i = mc.inventory.slots[36]
  if (!i || i.count === 64) return
  if (i.type === grinde.ids.item.totem) {
    mc.setQuickBarSlot(0)
    mc.setControlState('sneak', true)
    mc._client.write('block_dig', {
      status: 0, // start digging
      location: fcfg.location.anchor,
      face: 1 // default face is 1 (top)
    })
    await timer(50)
    mc._client.write('block_dig', {
      status: 1, // cancel digging
      location: fcfg.location.anchor,
      face: 1 // default face is 1 (top)
    })
    mc.setControlState('sneak', false)
    mc.setQuickBarSlot(1)
  }
}

async function toss() {
  grinde.status = status.TOSS
  const items = mc.inventory.items()
  const stacks = {
    emerald: 0,
    extra: [],
    else: []
  }

  for (const i of items) {
    //logger(`${i.slot} ${i.type} ${i.name}`)
    if (i.type === grinde.ids.armor.boots) {
      await mc.equip(i, "feet")
      logger(true, "INFO", "feet")
      // await timer(500)
      continue
    }
    else if (i.type === grinde.ids.armor.leggings) {
      await mc.equip(i, "legs")
      logger(true, "INFO", "legs")
      //await timer(500)
      continue
    }
    else if (i.type === grinde.ids.armor.chestplate) {
      await mc.equip(i, "torso")
      logger(true, "INFO", "torso")
      //  await timer(500)
      continue
    }
    else if (i.type === grinde.ids.armor.helmet) {
      await mc.equip(i, "head")
      logger(true, "INFO", "head")
      // await timer(500)
      continue
    }
    else if (i.slot != 37 && i.type === grinde.ids.armor.sword) {
      await mc.simpleClick.leftMouse(i.slot)
      await mc.simpleClick.leftMouse(37)
      logger(true, "INFO", `hand`)
      // await timer(500)
      continue
    }
    if (i.slot === 36 && i.type != grinde.ids.item.totem) {
      await mc.simpleClick.leftMouse(i.slot)
      await mc.simpleClick.leftMouse(-999)
    }
    if ([37, 38].includes(i.slot) || (i.slot === 36 && i.type === grinde.ids.item.totem)) continue
    //這邊要新增穿裝備!!!
    // TODO

    if (i.type === grinde.ids.item.emerald) { if (i.count === 64) stacks.emerald++ }
    else if (i.type === grinde.ids.item.extra) { if (i.count === 64) stacks.extra.push(i.slot) }
    else if (grinde.ids.item.trash.includes(i.type) &&
      !(i.type === grinde.ids.item.crossbow && i.enchants.filter(e => ['piercing', 'multishot'].includes(e.name)).length >= 2)) {
      await mc.simpleClick.leftMouse(i.slot)
      await mc.simpleClick.leftMouse(-999)
    }
    else stacks.else.push(i.slot)
  }

  if (stacks.emerald >= 27) await deposit()
  else if (stacks.extra.length) await intoChest(fcfg.location.extra, stacks.extra)
  else if (stacks.else.length) await intoChest(fcfg.location.dump, stacks.else)
}

async function tpc(owner, seq) {
  grinde.status = status.DEPOSIT
  await new Promise(async (res, rej) => {
    const timeout = setTimeout(rej, 15_000)
    mc.chat(`/tpc ${owner}`)
    await once(mc, 'windowOpen')
    await mc.simpleClick.leftMouse(8 + seq)
    clearTimeout(timeout)
    res()
  })
  closeWindow()
}

async function deposit() {
  grinde.status = status.DEPOSIT
  await new Promise(async (res, rej) => {
    const timeout = setTimeout(rej, 15_000)
    mc.chat('/bank')
    await once(mc, 'windowOpen')
    await mc.simpleClick.leftMouse(30)
    clearTimeout(timeout)
    res()
  })
  closeWindow()
}

async function intoChest(chest, items) {
  grinde.status = status.CHEST
  if (chest.distanceSquared(mc.entity.position) > 30) return

  let it = 0
  if (await openChest(chest)) {
    const offset = mc.currentWindow?.inventoryStart - 9
    while (it < items.length) {
      const slot = mc.currentWindow?.firstEmptyContainerSlot()
      if (!slot && (slot ?? true)) break
      await mc.simpleClick.leftMouse(offset + items[it++])
      await mc.simpleClick.leftMouse(slot)
      await timer(30)
    }
    closeWindow()
  }

  while (it < items.length) {
    await mc.simpleClick.leftMouse(items[it++])
    await mc.simpleClick.leftMouse(-999)
  }
}

async function restockEgg() {
  if (!grinde.doEggRefill) return
  grinde.status = status.REFILL

  const leader = mc.nearestEntity(e => e.type === 'mob' &&
    e.entityType === grinde.ids.entity.capture && e.equipment[5] && e.metadata[9] > 0)
  if (leader?.position.distanceSquared(mc.entity.position) < 10) {
    if (mc.inventory.slots[38]?.type !== grinde.ids.item.egg_empty) {
      await openChest(fcfg.location.egg)

      if (mc.currentWindow?.containerCount(grinde.ids.item.egg_pillager) >= 45) {
        grinde.doEggRefill = false
        closeWindow()
        return
      }

      const egg = mc.currentWindow?.findContainerItem(grinde.ids.item.egg_empty)
      if (!egg) {
        grinde.doEggRefill = false
        closeWindow()
        return
      }
      const slot = egg.slot
      if (egg.count > 1) {
        const secslot = mc.currentWindow?.firstEmptyContainerSlot()
        if (secslot === null) {
          grinde.doEggRefill = false
          closeWindow()
          return
        }
        await mc.simpleClick.leftMouse(slot)
        await mc.simpleClick.rightMouse(slot)
        await mc.simpleClick.leftMouse(secslot)
      }
      await mc.simpleClick.leftMouse(slot)
      await mc.simpleClick.leftMouse(mc.currentWindow.hotbarStart + 2)
      await mc.simpleClick.leftMouse(slot)

      await timer(30)
      closeWindow()
    }

    const leader = mc.nearestEntity(e => e.type === 'mob' &&
      e.entityType === grinde.ids.entity.capture && e.equipment[5] && e.metadata[9] > 0)
    if (leader?.position.distanceSquared(mc.entity.position) < 10) {
      mc.setQuickBarSlot(2)
      mc._client.write('use_entity', {
        target: leader.id,
        mouse: 0, // interact with entity
        sneaking: false,
        hand: 0 // interact with the main hand
      })
      mc.setQuickBarSlot(1)
    }
    await timer(30)
  }
}

async function reraid() {
  grinde.reraid.refresh()
  if (grinde.status === status.INIT) return
  if (fcfg.location.anchor.distanceSquared(mc.entity.position) > 5) return
  const temp = grinde.status
  grinde.status = status.RERAID

  if (mc.inventory.slots[38]?.type !== grinde.ids.item.egg_pillager) {
    await openChest(fcfg.location.egg)

    const pegg = mc.currentWindow?.findContainerItem(grinde.ids.item.egg_pillager)
    if (!pegg) {
      closeWindow()
      grinde.status = temp
      return
    }

    const slot = pegg.slot
    await mc.simpleClick.leftMouse(slot)
    await mc.simpleClick.leftMouse(mc.currentWindow.hotbarStart + 2)
    await mc.simpleClick.leftMouse(slot)

    await timer(30)
    closeWindow()
  }

  grinde.doEggRefill = false
  mc.setQuickBarSlot(2)
  interactBlock(fcfg.location.anchor.offset(0, 2, 0))
  mc.setQuickBarSlot(1)
  setTimeout(() => { grinde.doEggRefill = true }, 60_000)
  logger(true, "INFO", 'Reraid triggered.')
  grinde.status = temp
}

async function openChest(pos) {
  if (!['chest', 'barrel', 'shulker_box'].includes(mc.blockAt(pos)?.name)) return false
  return new Promise(async res => {
    setTimeout(res, 30_000, false)
    interactBlock(pos)
    await once(mc, 'windowOpen')
    await timer(30)
    res(true)
  })
}

function closeWindow() {
  try { mc.closeWindow(mc.currentWindow) } catch (err) { }
}

async function kill(code = 1000) {
  //process.send({ type: 'restartcd', value: restartcd })
  logger(true, 'WARN', `exiting in status ${code}`)
  mc.end()
  process.exit(code)
}
class Task {
  priority = 10;
  displayName = '';
  source = '';
  content = '';
  timestamp = Date.now();
  sendNotification = true;
  //MC-DM
  minecraftUser = '';
  //DC
  discordUser = null;
  //Console
  /**
   * 
   * @param {*} priority 
   * @param {*} displayName 
   * @param {string} source AcceptSource: console, minecraft-dm, discord
   * @param {string[]} content 
   * @param {Date} timestamp 
   * @param {boolean} sendNotification 
   * @param {string | null} minecraftUser 
   * @param {string | null} discordUser 
   */
  constructor(priority = 10, displayName = '未命名', source = '', content = '', timestamp = Date.now(), sendNotification = true, minecraftUser = '', discordUser = null) {
    this.priority = priority;
    this.displayName = displayName;
    this.source = source;
    this.content = content;
    this.timestamp = timestamp;
    this.sendNotification = sendNotification;
    this.minecraftUser = minecraftUser;
    this.discordUser = discordUser;
  }
}
const taskManager = {
  // eventl: new EventEmitter(),
  tasks: [],
  err_tasks: [],
  tasking: false,
  //
  tasksort() {
    this.tasks.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.timestamp - b.timestamp;
      } else {
        return a.priority - b.priority;
      }
    });
  },
  async init() {
    if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/task.json`)) {
      this.save()
    } else {
      let tt = await readConfig(`${process.cwd()}/config/${process.argv[2]}/task.json`)
      this.tasks = tt.tasks
      this.err_tasks = tt.err_tasks
    }
    //console.log(`task init complete / ${this.tasks.length} tasks now`)
    //自動執行
    if (this.tasks.length != 0 && !this.tasking) {
      logger(false, 'INFO', `Found ${this.tasks.length} Task, will run at 3 second later.`)
      await sleep(3000)
      await this.loop()
    }
  },
  isTask(args) {
    // {
    //     vaild: true,             
    //     longRunning: false,
    //     permissionRequre: 0,     //reserved             
    // }
    let result
    switch (true) {
      case mapart.identifier.includes(args[0]):
        result = mapart.parse(args)
        break;
      case craftAndExchange.identifier.includes(args[0]):
        result = craftAndExchange.parse(args)
        break;
      case args[0] === 'info':
      case args[0] === 'i':
        result = {
          vaild: true,
          longRunning: false,
          permissionRequre: 0,     //reserved        
        }
        break;
      default:
        result = {
          vaild: false,
        }
        break;
    }
    return result
    //return false
  },
  async execute(task) {
    logger(true, 'INFO', `execute task ${task.displayName}\n${task.content}`)
    //console.log(task)
    if (login) await this.save();
    if (task.source == 'console') task.console = logger;
    switch (true) {
      case mapart.identifier.includes(task.content[0]):
        await mapart.execute(task)
        break;
      case craftAndExchange.identifier.includes(task.content[0]):
        await craftAndExchange.execute(task)
        break;
      case task.content[0] === 'info':
      case task.content[0] === 'i':
        await bot_cmd_info();
        break;
      default:
        break;
    }
    logger(true, 'INFO', `task ${task.displayName} completed`)
    if (login) await this.save();
  },
  async assign(task, longRunning = true) {
    if (longRunning) {
      this.tasks.push(task)
      if (!this.tasking) await this.loop()
    } else {
      this.execute(task)
    }
  },
  async loop() {
    if (this.tasking) return
    this.tasking = true;
    this.tasksort()
    let crtTask = this.tasks[0]
    await this.execute(crtTask)
    this.tasks.shift()
    this.tasking = false;
    if (this.tasks.length) await this.loop()
  },
  async save() {
    let data = {
      'tasks': this.tasks,
      'err_tasks': this.err_tasks,
    }
    // console.log('tasks saving..')
    // console.log(data)
    await fsp.writeFile(`${process.cwd()}/config/${process.argv[2]}/task.json`, JSON.stringify(data, null, '\t'), function (err, result) {
      if (err) console.log('tasks save error', err);
    });
    //console.log('task complete')
  }
  // commit(task) {
  //     this.eventl.emit('commit', task);
  // },
}
function logger(logToFile = false, type = "INFO", ...args) {
  if (logToFile) {
    process.send({ type: 'logToFile', value: { type: type, msg: args.join(' ') } })
    return
  }
  let fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss')
  let colortype
  switch (type) {
    case "DEBUG":
      colortype = "\x1b[32m" + type + "\x1b[0m";
      break;
    case "INFO":
      colortype = "\x1b[32m" + type + "\x1b[0m";
      break;
    case "WARN":
      colortype = "\x1b[33m" + type + "\x1b[0m";
      break;
    case "ERROR":
      type = "\x1b[31m" + type + "\x1b[0m";
      colortype;
    case "CHAT":
      colortype = "\x1b[93m" + type + "\x1b[0m";
      break;
    default:
      colortype = type;
      break;
  }
  console.log(`[${fmtTime}][${colortype}][${process.argv[2]}] ${args.join(' ')}`);
}

function interactBlock(pos) {
  mc._client.write('block_place', {
    location: pos,
    direction: 1,
    hand: 0,
    cursorX: 0.5,
    cursorY: 0.5,
    cursorZ: 0.5,
    insideBlock: false
  })
}
function botTabhandler(tab) {
  const header = tab.header.extra
  if (!header) return
  let si = false, ci = false, bi = false
  let serverIdentifier = -1;
  let coinIdentifier = -1;
  let balanceIdentifier = -1;
  for (i in header) {
    if (header[i].text == '所處位置 ') {            //+2
      serverIdentifier = parseInt(i);            // 不知道為啥之前用parseInt
    } else if (header[i].text == '村民錠餘額') {    //+2
      coinIdentifier = parseInt(i);
    } else if (header[i].text == '綠寶石餘額') {    //+3
      balanceIdentifier = parseInt(i);
    }
  }
  if (serverIdentifier != -1 && header[serverIdentifier + 2]?.text?.startsWith('分流')) {
    botinfo.serverCH = header[serverIdentifier + 2].text
    let serverCH = header[serverIdentifier + 2].text.slice(2, header[serverIdentifier + 2].text.length);
    let s = -1;
    try {
      s = CNTA.toInteger(serverCH);
    } catch (e) {
      //return -1;
    }
    botinfo.server = s
    si = true;
  }
  if (coinIdentifier != -1) {
    coin = parseInt(header[coinIdentifier + 2]?.text.replace(/,/g, ''));
    if (coin != NaN) {
      botinfo.coin = coin
      ci = true
    }
  }
  if (balanceIdentifier != -1) {
    bal = parseFloat(header[balanceIdentifier + 3]?.text.replace(/,/g, ''));
    if (bal != NaN) {
      botinfo.balance = bal
      bi = true;
    }
  }
  if (si && ci && bi) botinfo.tabUpdateTime = new Date();
}
function readConfig(file) {
  var raw_file = fs.readFileSync(`${file}`);
  var com_file = JSON.parse(raw_file);
  return com_file;
}