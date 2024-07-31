const BotInstance = require("./botinstance");
const EventEmitter = require("events");
const { logToFileAndConsole } = require("../logger");
const { fork } = require("child_process");
const path = require("path");
const config = require(`${process.cwd()}/config.toml`);
const { exit } = require("process");
const exitcode = require("./exitcode");
const { log } = require("console");

class BotManager {
  constructor() {
    this.bots = [];
    this.currentBot = null; // Current selected bot instance
    this.handle = new EventEmitter();
  }
  getBotByName(name) {
    return this.bots.find((bot) => bot.name === name) || null;
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
        config.setting.reconnect_CD,
        debug,
        chat
      );
    }
    return this.bots[name];
  }
  setCurrentBotByName(name) {
    const bot = this.getBotByName(name);
    if (bot == null) {
      console.log(`Bot ${name} not found`);
      return;
    }
    this.currentBot = bot;
  }
  setBotStatus(bot, status) {
    if (bot != null) {
      bot.status = status;
    }
  }
  setBotReloadCD(bot, cd = 10_000) {
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

  // find the bot instance by name and delete it from the array
  deleteBotInstanceByName(name) {
    this.bots = this.bots.filter((bot) => bot.name !== name);
  }

  deleteBotChildProcess(bot) {
    if (bot.childProcess != null) {
      bot.childProcess.kill();
    }
  }

  loadProfiles() {
    const profilesPath = path.join(process.cwd(), "profiles.json");
    logToFileAndConsole("INFO", "CONSOLE", `讀取帳號設定檔: ${profilesPath}`);
    try {
      return require(profilesPath);
    } catch (err) {
      console.error(`帳號設定檔讀取失敗\nFilePath: ${profilesPath}`);
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

  registerBotChildProcessEvent(bot, child) {
    child.on("error", (error) => {
      console.log(`Error from ${bot.name}:\n${error}`);
    });
    child.on("close", (childProcess) => {
      logToFileAndConsole(
        "WARN",
        bot.name,
        `Exit code: ${exitcode[childProcess]} (${childProcess})`
      );
      child.removeAllListeners();
      this.setBotChildProcess(bot, null);
      if (childProcess == 0) console.log(`${bot.name}: stopped success`);
      else if (childProcess >= 2000) {
        logToFileAndConsole(
          "ERROR",
          bot.name,
          `closed with err code: ${childProcess}`
        );
      } else {
        logToFileAndConsole(
          "INFO",
          bot.name,
          `restart at ${bot.reloadCD / 1000} second`
        );
        setTimeout(
          () => {
            this.createBot(bot.name);
          },
          bot.reloadCD ? bot.reloadCD : config.setting.reconnect_CD
        );
      }
    });
    child.on("message", (message) => {
      switch (message.type) {
        case "logToFile":
          if (bot.crtType == "raid")
            logToFileAndConsole(
              message.value.type,
              bot.name.substring(0, 4),
              message.value.msg
            );
          else
            logToFileAndConsole(
              message.value.type,
              bot.name,
              message.value.msg
            );
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

  initBot(name) {
    if (this.bots.some((bot) => bot.name === name)) {
      logToFileAndConsole("ERROR", name, `Bot ${name} 已經存在`);
      return;
    }
    const profiles = this.loadProfiles();
    if (!profiles[name]) {
      logToFileAndConsole("ERROR", name, `profiles中無 ${name} 資料`);
      process.exit(1000);
    }
    if (!profiles[name].type) {
      logToFileAndConsole("ERROR", name, `profiles中 ${name} 沒有type資料`);
      process.exit(1001);
    }
    const { type, debug, chat } = profiles[name];
    const bot = this.getBotInstance(name, null, type, type, !!debug, !!chat);
    switch (type) {
      case "general":
      case "raid":
      case "auto":
      case "material":
        this.bots.push(bot);
        break;
      default:
        console.log(`Unknown bot type ${type} of ${name}`);
        process.exit(1000);
        break;
    }
    return bot;
  }

  getBotFilePath(crtType) {
    switch (crtType) {
      case "general":
        return `${process.cwd()}/bots/generalbot.js`;
      case "raid":
        return `${process.cwd()}/bots/raidbot.js`;
      default:
        logToFileAndConsole("ERROR", "CONSOLE", `Invalid crtType: ${crtType}`);
        exit(1000);
        return;
    }
  }

  createBot(name) {
    const bot = this.initBot(name);
    if (this.currentBot == null) {
      this.currentBot = bot;
    }
    const botFilePath = this.getBotFilePath(bot.crtType);
    let args = [name, bot.type];
    if (bot.debug) args.push("--debug");
    if (bot.chat) args.push("--chat");
    const child = fork(botFilePath, args);
    this.setBotChildProcess(bot, child);
    this.registerBotChildProcessEvent(bot, child);
    child.send({ type: "init", config: config });
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
}

module.exports = BotManager;
