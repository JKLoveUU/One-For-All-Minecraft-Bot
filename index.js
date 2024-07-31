const readline = require("readline");
const fs = require("fs");
const toml = require("toml-require").install({ toml: require("toml") });
const config = require(`${process.cwd()}/config.toml`);
const { logToFileAndConsole } = require("./src/logger");
const BotManager = require("./src/modules/botmanager.js");
const {
  DiscordBotStart,
  DiscordBotStop,
} = require("./src/modules/discordbot.js");

const botManager = new BotManager();
const rl = readline.createInterface({
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
    ];
    const hits = completions.filter((cmd) => cmd.startsWith(line));
    return [hits.length ? hits : completions, line];
  },
});

function checkPaths() {
  const paths = ["logs", "config/global"];
  paths.forEach((p) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  });
}

function checkBotValid(bot) {
  if (!bot) {
    console.log(`No bot selected. Use .switch to select a bot.`);
    return false;
  }
  if (!bot.childProcess) {
    console.log(`No child process for bot ${bot.name}`);
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
    case "create":
      if (typeof args[0] !== "string") {
        console.log(`Usage: .create <botName>`);
        break;
      }
      botManager.createBot(args[0]);
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
        process.title = "[Bot][-1] type .switch to select a bot";
      }
      break;
    case "reload":
      selectedBot = botManager.getCurrentBot();

      if (checkBotValid(selectedBot)) {
        // 不確定怎麼送 "reload" 給 child process 卻又能夠將新的 child process 綁到 botInstance 上面
        // 所以目前先用 "exit" 代替
        selectedBot.childProcess.send({ type: "exit" });
        logToFileAndConsole(
          "INFO",
          "CONSOLE",
          `Reloading ${selectedBot.name} in ${selectedBot.reloadCD} ms`
        );
        setTimeout(() => {
          const newBot = botManager.createBot(selectedBot.name);
          botManager.setCurrentBotByName(newBot.name);
        }, selectedBot.reloadCD);
      }
      break;
    case "test":
      logToFileAndConsole("INFO", "CONSOLE", args);
      break;
    case "switch":
      const botName = args[0];
      if (typeof botName !== "string") {
        console.log(`Usage: .switch <botName>`);
      } else {
        botManager.setCurrentBotByName(botName);
        const currentBot = botManager.getCurrentBot();
        process.title = `[Bot][${currentBot.name}] Use .switch to select a bot`;
        console.log(`Current bot: ${currentBot.name}.`);
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

function addConsoleEventHandler() {
  rl.on("line", handleCommand);
  rl.on("close", async () => {
    await handleClose();
  });
}

function addMainProcessEventHandler() {
  process.on("uncaughtException", (err) => {
    logToFileAndConsole("ERROR", "CONSOLE", `${err}\nStack: ${err.stack}`);
    console.log("PID:", process.pid);
  });
  process.on("SIGINT", handleClose);
  process.on("SIGTERM", handleClose);
}

async function handleClose() {
  logToFileAndConsole("INFO", "CONSOLE", "Closing application...");
  botManager.stop();
  const waitingTime = 1000 + botManager.getBotNums() * 200;
  await DiscordBotStop(waitingTime);
  logToFileAndConsole("INFO", "CONSOLE", "Close finished");
  process.exit(0);
}

function main() {
  checkPaths();
  logToFileAndConsole(
    "INFO",
    "CONSOLE",
    `Program starting. Press Ctrl+C to exit   PID: ${process.pid}`
  );
  addMainProcessEventHandler();
  addConsoleEventHandler();
  DiscordBotStart(botManager);
  process.title = "[Bot][-1] type .switch to select a bot";
  let timerdelay = 3005;
  config.account.id.forEach((id) => {
    setTimeout(() => {
      botManager.createBot(id);
      timerdelay += 200;
    }, timerdelay);
  });
//   rl.prompt();
}

main();
