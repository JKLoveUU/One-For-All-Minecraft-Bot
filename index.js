process.on("uncaughtException", (err) => {
  process.stderr.write(`[FATAL] ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
// Suppress DEP0040 (built-in punycode) from deep transitive deps (node-fetch→tr46, protodef→uri-js).
// process.emitWarning override doesn't work in Node 22; must intercept at process.emit level.
// Also propagate to child bots via NODE_OPTIONS so their stderr is clean too.
const _processEmit = process.emit;
process.emit = function (event, warning) {
  if (event === "warning" && warning?.code === "DEP0040") return false;
  return _processEmit.apply(this, arguments);
};
process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || "") + " --no-deprecation").trim();
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const toml = require("toml-require").install({ toml: require("toml") });
const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const config = require(`${baseDir}/config.toml`);
// mc 不知道為甚麼不require打包就會漏掉了
const rq_general = require(`./bots/generalbot.js`)
// const rq_raid = require(`./bots/raidbot.js`)
// const rq_logger = require("./src/logger");
const { logger, cleanupOldLogs } = require("./src/logger");
const BotManager = require("./src/modules/botmanager.js");
const {
  DiscordBotStart,
  DiscordBotStop,
  sendAuthNotify,
} = require("./src/modules/discordbot.js");

const botManager = new BotManager();
botManager.handle.on('msaAuth', (botName, authInfo) => {
  if (config.discord_setting?.activate) {
    sendAuthNotify(botName, authInfo.userCode, authInfo.verificationUri).catch(() => {})
  }
})
let rl = null;
let tuiHandle = null;
function createReadline() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: (line) => {
      const completions = [
        ".switch",
        ".list",
        ".create",
        ".exit",
        ".reload",
        ".ff",
        ".all",
        ".task",
      ];
      const hits = completions.filter((cmd) => cmd.startsWith(line));
      return [hits.length ? hits : completions, line];
    },
  });
  return rl;
}

function checkPaths() {
  const paths = ["logs", "config/global"];
  paths.forEach((p) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  });
  // 啟動時清理過期 log (config.setting.log_retain_days,預設 30 天;設 0 = 停用)
  const retain = config?.setting?.log_retain_days;
  const retainDays = Number.isFinite(retain) ? retain : 30;
  const r = cleanupOldLogs(retainDays);
  if (r && (r.deleted > 0 || r.error)) {
    if (r.error) logger(true, "WARN", "CONSOLE", `[Log] cleanupOldLogs error: ${r.error}`);
    else logger(true, "INFO", "CONSOLE", `[Log] 清理 ${r.deleted}/${r.scanned} 個過期 log (retain=${retainDays}d)`);
  }
}

function checkBotValid(bot) {
  if (!bot) {
    console.log(`No bot selected. Use .switch to select a bot.`);
    return false;
  }
  if (!bot.childProcess) {
    // console.log(`No child process for bot ${bot.name}`);
    console.log(`${bot.name} is in ${bot.status}, try it later!`);
    return false;
  }
  return true;
}

function handleCommand(input) {
  let selectedBot = botManager.getCurrentBot();
  if (!input.startsWith(".")) {
    selectedBot = botManager.getCurrentBot();
    if (checkBotValid(selectedBot)) {
      selectedBot.childProcess.send({ type: "chat", text: input });
    }
    return;
  }
  const [command, ...args] = input.trim().split(/\s+/);
  const cmd = command.substring(1);
  switch (cmd) {
    case "c":
    case "create":
      // 如果沒有 args[0]，則檢查目前選擇的 bot 是否有 childProcess
      if (!args[0]) {
        const curBot = botManager.getCurrentBot();
        if (!curBot) {
          console.log("尚未選擇機器人，請先使用 .switch 選擇一個機器人。");
          break;
        }
        if (curBot.childProcess) {
          console.log(`目前選擇的機器人 ${curBot.name} 已經在執行中。`);
          break;
        }
        botManager.createBot(curBot.name);
        break;
      } else if (typeof args[0] !== "string") {
        console.log(`Usage: .create <botName>`);
        break;
      }
      checkbot = botManager.getBotByName(args[0])
      if (checkbot) {
        botManager.createBot(checkbot.name)
      } else {
        botManager.initBot(args[0]);
      }
      break;
    case "ff":
      process.exit(0);
      break;
    case "list":
      botManager.printBotList();
      break;
    case "exit":
      selectedBot = botManager.getCurrentBot();
      if (checkBotValid(selectedBot)) {
        selectedBot.childProcess.send({ type: "exit" });
        // process.title = "[Bot][-] type .switch to select a bot";
      } else if (selectedBot.reloadCancel) {
        logger(true, "INFO", "CONSOLE", `取消 ${selectedBot.name} 的重啟`);
        clearTimeout(selectedBot.reloadCancel);
        selectedBot.reloadCancel = null;
      }
      break;
    case "reload":
      selectedBot = botManager.getCurrentBot();
      if (checkBotValid(selectedBot)) {
        selectedBot.childProcess.send({ type: "reload" });
        logger(
          true,
          "INFO",
          "CONSOLE",
          `Reloading ${selectedBot.name} in ${selectedBot.reloadCD} ms`
        );
      }
      break;
    case "test":
      logger(true, "INFO", "CONSOLE", args);
      break;
    case "switch":
      const botName = args[0];
      let botID = parseInt(botName, 10)
      ok = false;
      if (!Number.isNaN(botID) && botID != undefined) {
        ok |= botManager.setCurrentBotByID(botID);
      } else {
        ok |= botManager.setCurrentBotByName(botName);
      }
      if (!ok) console.log(`Usage: .switch <botName or botID>`);
      const currentBot = botManager.getCurrentBot();
      process.title = `[Bot][${currentBot.name}] Use .switch to select a bot`;
      console.log(`Current bot: ${currentBot.name}.`);
      break;
    case "all":
      botManager.bots.forEach((bot, i) => {
        if(bot.childProcess) bot.childProcess.send({ type: "cmd", text: input.slice(5, input.length) });
      })
      break;
    case "task":
    case "tasks":
      // .task list / remove all|top|N — 線上走 child,離線直接改 task.json
      selectedBot = botManager.getCurrentBot();
      if (!selectedBot) {
        console.log("尚未選擇 bot,請先 .switch");
        break;
      }
      if (selectedBot.childProcess) {
        selectedBot.childProcess.send({ type: "cmd", text: input });
      } else {
        handleOfflineTaskCommand(selectedBot, args).catch(err => {
          logger(true, "ERROR", "CONSOLE", `離線 task 操作失敗: ${err.message}`);
        });
      }
      break;
    default:
      selectedBot = botManager.getCurrentBot();
      if (checkBotValid(selectedBot)) {
        selectedBot.childProcess.send({ type: "cmd", text: input });
      }
      break;
  }
  //   rl.prompt();
}

// 離線 bot 的 .task list / remove 直接讀寫 config/<bot>/task.json
async function handleOfflineTaskCommand(bot, args) {
  const sub = (args[0] || "").toLowerCase();
  const target = (args[1] || "").toLowerCase();
  const taskPath = path.join(baseDir, "config", bot.name, "task.json");
  if (!fs.existsSync(taskPath)) {
    console.log(`[${bot.name}] (offline) task.json 不存在: ${taskPath}`);
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(taskPath, "utf8"));
  } catch (e) {
    console.log(`[${bot.name}] (offline) task.json 解析失敗: ${e.message}`);
    return;
  }
  if (!Array.isArray(data.tasks)) data.tasks = [];

  const writeBack = () => {
    fs.writeFileSync(taskPath, JSON.stringify(data, null, "\t"));
  };

  if (sub === "list" || sub === "ls" || sub === "") {
    if (data.tasks.length === 0) {
      console.log(`[${bot.name}] (offline) 佇列為空`);
      return;
    }
    console.log(`[${bot.name}] (offline) 佇列共 ${data.tasks.length} 個任務`);
    data.tasks.forEach((t, i) => {
      console.log(`    ${(i + 1).toString().padStart(2)} [P${t.priority}] ${t.displayName ?? "<unknown>"} <- ${t.source}`);
    });
    return;
  }
  if (sub !== "remove" && sub !== "rm" && sub !== "cancel") {
    console.log("用法: .task list | .task remove <all|top|N>");
    return;
  }
  if (!target) {
    console.log("用法: .task remove <all|top|N>");
    return;
  }
  if (target === "all" || target === "*") {
    const removed = data.tasks.length;
    data.tasks = [];
    writeBack();
    console.log(`[${bot.name}] (offline) 已移除全部 ${removed} 個任務`);
    return;
  }
  if (target === "top" || target === "first") {
    if (data.tasks.length === 0) {
      console.log(`[${bot.name}] (offline) 無任務可移除`);
      return;
    }
    const removed = data.tasks.shift();
    writeBack();
    console.log(`[${bot.name}] (offline) 已移除頂端任務: ${removed?.displayName ?? "<unknown>"}`);
    return;
  }
  const n = parseInt(target, 10);
  if (Number.isFinite(n) && n >= 1 && n <= data.tasks.length) {
    const [removed] = data.tasks.splice(n - 1, 1);
    writeBack();
    console.log(`[${bot.name}] (offline) 已移除索引 ${n} 任務: ${removed?.displayName ?? "<unknown>"}`);
    return;
  }
  console.log(`[${bot.name}] (offline) 無效目標: ${target} (用 all / top / 1..${data.tasks.length})`);
}

function addConsoleEventHandler() {
  createReadline();
  rl.on("line", handleCommand);
  rl.on("close", async () => {
    await handleClose();
  });
}

function addMainProcessEventHandler({ registerSignals = true } = {}) {
  process.on("uncaughtException", (err) => {
    logger(true, "ERROR", "CONSOLE", `${err}\nStack: ${err.stack}`);
    console.log("PID:", process.pid);
  });
  if (registerSignals) {
    process.on("SIGINT", handleClose);
    process.on("SIGTERM", handleClose);
  }
}

async function handleClose() {
  logger(true, "INFO", "CONSOLE", "Closing application...");
  // Now async — actually waits for all child bots to finish exiting (or timeout-kill them).
  const result = await botManager.stop();
  logger(
    true,
    "INFO",
    "CONSOLE",
    `Bots stopped — exited:${result.exited}  killed:${result.killed}  timedOut:${result.timedOut}`
  );
  if (config.discord_setting.activate) {
    const waitingTime = 1000 + botManager.getBotNums() * 200;
    await DiscordBotStop(waitingTime);
  }
  const uptime = _startTime ? fmtDuration(Date.now() - _startTime) : '?'
  const statsMsg = `uptime: ${uptime}`
  logger(true, "INFO", "CONSOLE", `Close finished  ─  ${statsMsg}`)
  if (tuiHandle) tuiHandle.setPendingOutput(`\n  Close finished  ─  ${statsMsg}\n`)
  process.exit(0);
}

let _startTime = null

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h) parts.push(`${h}h`)
  if (m || h) parts.push(`${m}m`)
  parts.push(`${sec}s`)
  return parts.join(' ')
}

function main() {
  _startTime = Date.now()
  checkPaths();
  logger(
    true,
    "INFO",
    "CONSOLE",
    `Program starting. Press Ctrl+C to exit   PID: ${process.pid}`
  );
  const useTUI = !!(config.setting && config.setting.enableEXPTUI);
  addMainProcessEventHandler({ registerSignals: !useTUI });
  if (useTUI) {
    botManager.silentChildren = true;
    const tui = require("./src/modules/tui.js");
    tuiHandle = tui.start(botManager, config, {
      onCommand: handleCommand,
      onExit: handleClose,
      startedAt: _startTime,
    });
  } else {
    addConsoleEventHandler();
  }
  if (config.discord_setting.activate) {
    DiscordBotStart(botManager, _startTime);
  }
  botManager.updateBestIP();
  setInterval(() => {
    botManager.updateBestIP();
  }, 1000 * 60 * 5);
  //botManager.loadProfiles();
  if (!useTUI) process.title = "[Bot][-1] type .switch to select a bot";
  let timerdelay = 3005;
  config.account.id.forEach((id) => {
    setTimeout(() => {
      botManager.initBot(id);
      timerdelay += 200;
    }, timerdelay);
  });
  //   rl.prompt();
}

main();
