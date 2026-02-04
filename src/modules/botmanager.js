const BotInstance = require("./botinstance");
const EventEmitter = require("events");
const { logger } = require("../logger");
const { fork } = require("child_process");
const path = require("path");
const config = require(`${process.cwd()}/config.toml`);
const { exit } = require("process");
const exitcode = require("./exitcode");
const botstatus = require("./botstatus");
const { log } = require("console");
const net = require("net");
// mc 不知道為甚麼不require打包就會漏掉了
const rq_general = require('../../bots/generalbot.js');
const rq_raid    = require('../../bots/raidbot.js');

class BotManager {
  _bestIP = null;
  constructor() {
    this.bots = [];
    this.currentBot = null; // Current selected bot instance
    this.handle = new EventEmitter();
    this.profiles = this.loadProfiles();
  }
  getBotByName(name) {
    return this.bots.find((bot) => bot.name === name) || null;
  }
  getBotByIndex(index) {
    return this.bots[index] || null;
  }
  getBotNums() {
    return this.bots.length;
  }
  getCurrentBot() {
    return this.currentBot;
  }
  // Singleton
  getBotInstance(name, child, type = null, crtType = null, debug, chat) {
    if (!this.bots[name]) {
      this.bots[name] = new BotInstance(
        name,
        child,
        type,
        crtType,
        config.setting.reconnect_CD ?? 20_000,
        debug,
        chat
      );
    }
    return this.bots[name];
  }
  printBotList() {
    const typeLength = 7;
    const crtTypeLength = 7;
    const longestBotLength =  this.bots.reduce((longest, a) => {
      return a.name.length > longest ? a.name.length : longest;
    }, 0);
    const longestStatusLength =  24
    console.log(`Total ${this.getBotNums()} bots`);
    console.log(`Id`.padEnd((parseInt(this.bots.length / 10)) + 2)+' | '+ (`Bot`.padEnd(longestBotLength)) +' | '+(`Status`.padEnd(longestStatusLength))+  ' | Type    | CrtType')
    this.bots.forEach((bot, i) => {
      console.log(
        `${i}  | ${bot.name.padEnd(longestBotLength)} | ${botstatus[bot.status] ? botstatus[bot.status].padEnd(longestStatusLength):bot.status} | ${
          bot.type ? bot.type.padEnd(typeLength) : "-".padEnd(typeLength)
        } | ${
          bot.crtType
            ? bot.crtType.padEnd(crtTypeLength)
            : "-".padEnd(crtTypeLength)
        }`
      );
    });
  }
  setCurrentBotByName(name) {
    const bot = this.getBotByName(name);
    if (bot == null) {
      console.log(`Bot ${name} not found`);
      return false;
    }
    this.currentBot = bot;
    return true;
  }
  setCurrentBotByID(id) {
    const bot = this.getBotByIndex(id);
    if (bot == null) {
      console.log(`Bot ${id} not found`);
      return false;
    }
    this.currentBot = bot;
    return true;
  }
  setBotStatus(bot, status) {
    if (bot != null) {
      bot.status = status;
    }
  }
  setBotReloadCD(bot, cd = 10_000) {  //讓child可以再設置parent個別設置自己的重啟cd
    if (bot != null) {
      bot.reloadCD = cd;
    }
  }
  setBotCrtType(bot, crtType) {
    if (bot != null) {
      bot.crtType = crtType;
    }
  }
  setBotChildProcess(bot, child) {
    if (bot != null) {
      bot.childProcess = child;
    }
  }

  // delete the bot from the array 
  // TODO 任何時候都不應該直接刪除BotInstance 而是以刪除childprocess來達成
  deleteBotInstance(bot) {
    if (bot != null) {
      this.bots = this.bots.filter((b) => b.name !== bot.name);
    }
  }

  stop() {
    for (const bot of this.bots) {
      if (bot.childProcess) {
        bot.childProcess.send({ type: "exit" });
      }
    }
  }

  loadProfiles() {  // This shoud only run once
    const profilesPath = path.join(process.cwd(), "profiles.json");
    logger(
      true,
      "INFO",
      "BOTMANAGER",
      `Reading profile settings from path: ${profilesPath}`
    );
    try {
      return require(profilesPath);
    } catch (err) {
      console.error(`Fail to read profile settings\nFilePath: ${profilesPath}`);
      console.error("Please Check The Json Format");
      console.error(`Error Msg: \x1b[31m${err.message}\x1b[0m`);
      console.error("You can visit following websites to fix:");
      console.error(
        `\x1b[33mhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse\x1b[0m`
      );
      console.error(
        `\x1b[33mhttps://www.google.com/search?q=${encodeURIComponent(
          err.message
        )}\x1b[0m`
      );
      return null;
    }
  }
  /*
    處理 childP exitCode 實現重啟邏輯
    處理 childP message 實現重啟邏輯
  */
  registerBotChildProcessEvent(bot, child) {
    child.on("error", (error) => {
      logger(true, "ERROR", "BOTMANAGER", `${bot.name} error: ${error}`);
    });
    child.on("exit", (exitCode) => {
      child.removeAllListeners();
      if (bot.reloadCancel) { // 取消其他重啟
        clearTimeout(bot.reloadCancel);
        bot.reloadCancel = null;
      }
      this.setBotChildProcess(bot, null);
      //this.deleteBotInstance(bot);
      if (exitCode == exitcode.OK) {
        logger(true, "INFO", "BOTMANAGER", `${bot.name} closed successfully`);
      } else if (exitCode >= 2000 || exitCode == exitcode.CONFIG) {  // 通常是設定檔缺失 格式錯誤的
        logger(
          true,
          "ERROR",
          "BOTMANAGER",
          `${bot.name} closed with err code: ${exitCode}`
        );
      } else {  //預期中的重啟
        logger(
          true,
          "INFO",
          "BOTMANAGER",
          `${bot.name} restart in ${bot.reloadCD / 1000} second`
        );
        bot.reloadCancel = setTimeout(
          () => {
            this.createBot(bot.name);
            bot.reloadCancel = null;
          },
          bot.reloadCD ? bot.reloadCD : config.setting.reconnect_CD
        );
      }
    });
    child.on("message", (message) => {
      switch (message.type) {
        case "logToFile":
          if (bot.crtType == "raid")
            logger(
              true,
              message.value.type,
              bot.name.substring(0, 4),
              message.value.msg
            );
          else logger(true, message.value.type, bot.name, message.value.msg);
          break;
        case "setReloadCD":
          this.setBotReloadCD(bot, message.value);
          break;
        case "setStatus":
          this.setBotStatus(bot, message.value);
          break;
        case "setCrtType":
          this.setBotCrtType(bot, message.value);
          break;
        case "dataToParent":
          this.handle.emit("data", message.value, bot.name);
          break;
        default:
          console.log(`Unknown message type ${message.type} from ${bot.name}`);
      }
    });
  }
  /*
    只有在程序開啟 或 手動輸入.create 時執行
  */
  initBot(name) { //TODO
    if (this.bots.some((bot) => bot.name === name)) {
      logger(true, "ERROR", "BOTMANAGER", `Bot: ${name} 已經存在`);
      return;
    }

    const profile = this.profiles[name];

    if (!profile) {
      logger(true, "ERROR", "BOTMANAGER", `profiles 中無 ${name} 資料`);
      return;
    }

    const { type, debug, chat } = profile;

    if (!type) {
      logger(true, "ERROR", "BOTMANAGER", `profiles 中 ${name} 沒有type資料`);
      return;
    }

    const validTypes = ["general", "raid", "auto", "material"];
    if (!validTypes.includes(type)) {
      console.log(`Unknown bot type ${type} of ${name}`);
      return null;
    }
    // 這兩項預計這樣配 而非重複
    // 'auto', 'general'
    // 'material', 'general'
    const bot = this.getBotInstance(name, null, type, type, !!debug, !!chat);
    this.bots.push(bot);
    this.createBot(name);
    //return bot;
  }
  /*
    TODO 這邊要改成舊版 6d8b1ac
    不然打包可能會遺漏這些
  */
  getBotFilePath(crtType) {
    switch (crtType) {
      case "general":
        return path.join(__dirname, "../../bots/generalbot.js");
      case "raid":
        return path.join(__dirname, "../../bots/raidbot.js");
      default:
        logger(true, "ERROR", "BOTMANAGER", `Invalid crtType: ${crtType}`);
        exit(1000);
        return;
    }
  }
  // 要改成 只生成cp
  createBot(name) {
    // const bot = this.initBot(name);
    // if (bot == null) return;
    let bot = this.getBotByName(name)
    if(!bot){
      logger(true, "ERROR", "BOTMANAGER", `bot ${name} not init...`);
      return;
    }
    if (this.currentBot == null) {
      this.currentBot = bot;
    }
    const botFilePath = this.getBotFilePath(bot.crtType); //TODO
    let args = [name, bot.type];
    if (bot.debug) args.push("--debug");
    if (bot.chat) args.push("--chat");
    if (config.setting.selectBestIP) args.push(`--ip=${this._bestIP}`);
    const child = fork(botFilePath, args);
    this.setBotChildProcess(bot, child);
    this.registerBotChildProcessEvent(bot, child);
    child.send({ type: "init", config: config });
    return bot;
  }

  async getBotInfo(name) {
    const bot = this.getBotByName(name);
    if (bot == null) {
      return null;
    }
    const data = await this.getBotData(bot.name);
    const botinfo = {
      id: bot.name,
      name: data.name,
      avatar: `https://mc-heads.net/avatar/${data.name}/64`,
      server: data.server,
      coin: data.coin,
      balance: data.balance,
      position: data.position,
      tasks: data.tasks,
      runingTask: data.runingTask,
      ping: data.ping,
    };
    return botinfo;
  }
  async getBotData(name) {
    const bot = this.getBotByName(name);
    if (bot == null) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject();
      }, 100);
      this.handle.once("data", (data, nm) => {
        if (name === nm) {
          clearTimeout(timer);
          resolve(data);
        }
      });
      bot.childProcess.send({ type: "dataRequire" });
    });
  }
  /**
   * 測試單個服務器節點的連接延遲
   */
  async pingHost(host, port = 25565, timeout = 3000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      let targetHost = host;
      if (host === "mcfallout.net") {
        targetHost = "proxy-net.mcfallout.net";
      }
      
      const socket = new net.Socket();
      
      const timeoutId = setTimeout(() => {
        socket.destroy();
        resolve({
          host: host,
          latency: Date.now() - startTime,
          status: "timeout",
          error: "Connection timeout"
        });
      }, timeout);
      
      socket.connect(port, targetHost, () => {
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({
          host: host,
          latency: latency,
          status: "online",
          error: null
        });
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          host: host,
          latency: Date.now() - startTime,
          status: "offline",
          error: error.message
        });
      });
    });
  }

  /**
   * 並行測試多個服務器節點
   */
  async pingHosts(hosts) {
    const pingPromises = hosts.map(host => this.pingHost(host));
    const results = await Promise.all(pingPromises);
    // console.log(results);
    const online = results.filter(r => r.status === "online");
    const best = online.length > 0 
      ? online.reduce((best, current) => current.latency <= best.latency ? current : best)
      : null;
    
    return {
      results: results,
      best: best,
      online: online.length,
      offline: results.length - online.length
    };
  }

  /**
   * 找出最佳的服務器 IP
   */
  async findBestIP() {
    if (!config.setting.selectBestIP || !config.setting.ips || config.setting.ips.length === 0) {
      return null;
    }
    
    try {
      const pingData = await this.pingHosts(config.setting.ips);
      
      if (pingData.best) {
        return pingData.best.host;
        // this._bestIP = pingData.best.host;
        // return this._bestIP;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async updateBestIP() {
    if (config.setting.selectBestIP){
      let bestipresult = await this.findBestIP();
      logger(true, "INFO", "BOTMANAGER", `最佳 IP: ${bestipresult}`);
      if (bestipresult) {
        this._bestIP = bestipresult;
      }
    }
  }
}

module.exports = BotManager;
