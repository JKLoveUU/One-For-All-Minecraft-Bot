const BotInstance = require("./botinstance");
const EventEmitter = require("events");
const { logger } = require("../logger");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  runtimeConfig: config,
  loadProfiles: loadRuntimeProfiles,
  profilesPath,
  startProfilesAutoReload,
} = require("./runtimeFiles");
const { exit } = require("process");
const exitcode = require("./exitcode");
const { log } = require("console");
const net = require("net");
const { printConfigLoadError } = require("../../lib/common");
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
    this.profileReloadWatcher = startProfilesAutoReload(this.profiles, {
      intervalMs: 1000,
      onError: (err, file) => {
        logger(true, "ERROR", "BOTMANAGER", `profiles reload failed: ${file}: ${err.message}`);
      },
    });
    this.shuttingDown = false;
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
        `${i}  | ${bot.name.padEnd(longestBotLength)} | ${(bot.status || '-').padEnd(longestStatusLength)} | ${
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

  // Graceful shutdown: send 'exit' to each child, then wait for all child processes to
  // actually exit (or hit `timeoutMs`, in which case remaining survivors are SIGKILL'd).
  // Returns { exited, killed, timedOut } so callers can log results.
  async stop(timeoutMs = 8000) {
    this.shuttingDown = true;
    if (this.profileReloadWatcher) this.profileReloadWatcher.stop();
    // Cancel any pending restart timers so we don't fork a new bot mid-shutdown.
    for (const bot of this.bots) {
      if (bot.reloadCancel) {
        clearTimeout(bot.reloadCancel);
        bot.reloadCancel = null;
      }
    }
    const live = this.bots.filter((b) => b.childProcess);
    if (live.length === 0) return { exited: 0, killed: 0, timedOut: 0 };
    const total = live.length;
    logger(true, "INFO", "BOTMANAGER", `stop(): waiting for ${total} child${total === 1 ? "" : "ren"} to exit...`);
    for (const bot of live) {
      try { bot.childProcess.send({ type: "exit" }); } catch (_) {}
    }
    return await new Promise((resolve) => {
      const start = Date.now();
      const checker = setInterval(() => {
        const stillAlive = this.bots.filter((b) => b.childProcess);
        if (stillAlive.length === 0) {
          clearInterval(checker);
          logger(true, "INFO", "BOTMANAGER", `stop(): all ${total} child${total === 1 ? "" : "ren"} exited cleanly`);
          resolve({ exited: total, killed: 0, timedOut: 0 });
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(checker);
          const names = stillAlive.map((b) => b.name).join(", ");
          logger(true, "WARN", "BOTMANAGER", `stop(): timeout after ${timeoutMs}ms — killing: ${names}`);
          for (const b of stillAlive) {
            try { b.childProcess.kill("SIGKILL"); } catch (_) {}
          }
          resolve({ exited: total - stillAlive.length, killed: stillAlive.length, timedOut: stillAlive.length });
          return;
        }
      }, 100);
    });
  }

  loadProfiles() {  // This shoud only run once
    logger(
      true,
      "INFO",
      "BOTMANAGER",
      `Reading profile settings from path: ${profilesPath}`
    );
    if (!fs.existsSync(profilesPath)) {
      fs.writeFileSync(profilesPath, "{}\n", "utf8");
      logger(true, "INFO", "BOTMANAGER", "profiles.json 不存在，已自動建立空白檔案");
      return {};
    }
    try {
      return loadRuntimeProfiles();
    } catch (err) {
      printConfigLoadError(err, profilesPath, {
        label: "profiles.json",
        chatgptFile: "profiles.json",
        relatedFiles: ["config.toml"],
        chatgptPrompt: ({ reason, location, rawMessage }) => {
          const locText = location ? `位置: ${location}` : "位置: 無法判定";
          return [
            "請幫我修正 One-For-All 專案的 profiles.json。",
            "請只修正 JSON 格式或明顯設定錯誤，保留原本 bot/profile 資料結構，不要重寫成新格式。",
            `錯誤原因: ${reason}`,
            locText,
            `Node.js 原始錯誤: ${rawMessage}`,
            "我會上傳 profiles.json；如果你需要比對自動啟動清單，我再補上 config.toml。",
          ].join(" ");
        },
      });
      exit(exitcode.CONFIG);
      return null;
    }
  }
  broadcastConfig(nextConfig = config) {
    for (const bot of this.bots) {
      if (!bot || !bot.childProcess || !bot.childProcess.connected) continue;
      try {
        bot.childProcess.send({ type: "configUpdate", config: nextConfig });
      } catch (_) {}
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
      // 結算本連線流量:把最後一筆 session 併入 committed,session 清零(下個子進程從 0 重新累加)
      bot.trafficCommitted = {
        rx: (bot.trafficCommitted?.rx || 0) + (bot.trafficSession?.rx || 0),
        tx: (bot.trafficCommitted?.tx || 0) + (bot.trafficSession?.tx || 0),
      };
      bot.trafficSession = { rx: 0, tx: 0 };
      bot.trafficRate = { rx: 0, tx: 0 };   // 離線即時速率歸零
      bot._trafficLastSample = null;        // 下個子進程第一筆樣本重新建立基準,不跨停機時段算速率
      if (bot.reloadCancel) { // 取消其他重啟
        clearTimeout(bot.reloadCancel);
        bot.reloadCancel = null;
        bot.reloadScheduledAt = null;
      }
      this.setBotChildProcess(bot, null);
      //this.deleteBotInstance(bot);
      if (this.shuttingDown) {
        // 程序正在關閉,不重啟
        logger(true, "INFO", "BOTMANAGER", `${bot.name} exited (shutdown, code=${exitCode})`);
        return;
      }
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
        bot.reloadScheduledAt = Date.now();
        bot.reloadCancel = setTimeout(
          () => {
            this.createBot(bot.name);
            bot.reloadCancel = null;
            bot.reloadScheduledAt = null;
          },
          bot.reloadCD ? bot.reloadCD : config.setting.reconnect_CD
        );
      }
    });
    child.on("message", (message) => {
      switch (message.type) {
        case "logToFile": {
          const toFile = message.value.file !== undefined ? !!message.value.file : true;
          if (bot.crtType == "raid")
            logger(
              toFile,
              message.value.type,
              bot.name.substring(0, 4),
              message.value.msg
            );
          else logger(toFile, message.value.type, bot.name, message.value.msg);
          break;
        }
        case "setReloadCD":
          this.setBotReloadCD(bot, message.value);
          break;
        case "setStatus":
          bot.msaAuth = null
          this.setBotStatus(bot, message.value);
          break;
        case "msaAuth":
          bot.msaAuth = { ...message.value, receivedAt: Date.now() }
          this.handle.emit('msaAuth', bot.name, bot.msaAuth)
          break;
        case "setCrtType":
          this.setBotCrtType(bot, message.value);
          break;
        case "dataToParent":
          // 記錄當前子進程回報的 session 流量(該連線累計,monotonic),並把跨重連總量掛到資料上
          if (message.value && message.value.traffic) bot.trafficSession = message.value.traffic;
          {
            const totalRx = (bot.trafficCommitted?.rx || 0) + (bot.trafficSession?.rx || 0);
            const totalTx = (bot.trafficCommitted?.tx || 0) + (bot.trafficSession?.tx || 0);
            // 即時速率:由「累計總量」的差分 / 時間差算出(總量跨重連連續,差分乾淨)
            const now = Date.now();
            const last = bot._trafficLastSample;
            if (last && now > last.t) {
              const dt = (now - last.t) / 1000;
              bot.trafficRate = {
                rx: Math.max(0, (totalRx - last.rx) / dt),
                tx: Math.max(0, (totalTx - last.tx) / dt),
              };
            } else {
              bot.trafficRate = { rx: 0, tx: 0 };
            }
            bot._trafficLastSample = { t: now, rx: totalRx, tx: totalTx };
            message.value.trafficTotal = { rx: totalRx, tx: totalTx };
            message.value.trafficRate = bot.trafficRate;
          }
          this.handle.emit("data", message.value, bot.name);
          break;
        case "event":
          // 通用 child → parent 事件通道；child 端 process.send({ type: 'event', name: '<eventName>', payload: {...} })
          this.handle.emit("event", { name: message.name, payload: message.payload }, bot.name);
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
    const forkOpts = this.silentChildren ? { silent: true } : {};
    const child = fork(botFilePath, args, forkOpts);
    if (this.silentChildren) {
      const pipeLine = (stream, type) => {
        if (!stream) return;
        let buf = "";
        stream.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, "");
            buf = buf.slice(idx + 1);
            if (line.length) logger(true, type, bot.name, line);
          }
        });
        stream.on("end", () => { if (buf.length) logger(true, type, bot.name, buf); });
      };
      pipeLine(child.stdout, "INFO");
      pipeLine(child.stderr, "ERROR");
    }
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
      memory: data.memory,
    };
    return botinfo;
  }
  async getBotData(name) {
    const bot = this.getBotByName(name);
    if (bot == null) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const handler = (data, nm) => {
        if (name !== nm) return;
        clearTimeout(timer);
        this.handle.off("data", handler);
        resolve(data);
      };
      const timer = setTimeout(() => {
        this.handle.off("data", handler);
        reject();
      }, 100);
      this.handle.on("data", handler);
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
