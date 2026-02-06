const fs = require("fs");
const sd = require("silly-datetime");
const path = require("path");
const { log } = require("console");

const projectRoot = path.resolve(__dirname, "..");
//const logFilePath = path.join(projectRoot, "logs", "latest.log");
let date = sd.format(new Date(), "YYYY-MM-DD_0");
const logFile = fs.createWriteStream(`logs/${date}.log`, { flags: "a" });
// const logFile = fs.createWriteStream(logFilePath, { flags: "a" });

const logTypes = {
  DEBUG: "\x1b[97mDEBUG\x1b[0m",
  INFO: "\x1b[92mINFO\x1b[0m",
  WARN: "\x1b[33mWARN\x1b[0m",
  ERROR: "\x1b[31mERROR\x1b[0m",
  CHAT: "\x1b[97mCHAT\x1b[0m",
};

function logger(logToFile = false, type = "INFO", name = "CONSOLE", ...args) {
  const arg = args.join(" ");
  const fmtTime = sd.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const logType = logTypes[type] || type;
  nameColor =  (name == "BOTMANAGER" || name =="CONSOLE")?"\x1b[92m" : "\x1b[96m"
  const logMessage = `[${fmtTime}][${logType}][${nameColor}${name}\x1b[0m] ${arg}`;
  const plainLogMessage = logMessage.replace(/\x1b\[\d+m/g, "");

  console.log(logMessage);
  if (logToFile) {
    logFile.write(plainLogMessage + "\n");
  }
}

module.exports = { logger };
