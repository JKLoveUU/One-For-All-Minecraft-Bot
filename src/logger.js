const fs = require("fs");
const sd = require("silly-datetime");
const path = require("path");

const isChild = typeof process.send === "function";

const projectRoot = path.resolve(__dirname, "..");
let date = sd.format(new Date(), "YYYY-MM-DD_0");
// In parent: write logs directly to file. In child: parent handles file writes (via IPC).
const logFile = isChild ? null : fs.createWriteStream(`logs/${date}.log`, { flags: "a" });

const logTypes = {
  DEBUG: "\x1b[97mDEBUG\x1b[0m",
  INFO: "\x1b[92mINFO\x1b[0m",
  WARN: "\x1b[33mWARN\x1b[0m",
  ERROR: "\x1b[31mERROR\x1b[0m",
  CHAT: "\x1b[97mCHAT\x1b[0m",
};

// Optional sink for redirecting logs (used by the EXP TUI to intercept into its log panel).
let sink = null;
function setSink(fn) { sink = fn; }

function logger(logToFile = false, type = "INFO", name = "CONSOLE", ...args) {
  const arg = args.join(" ");

  // Child mode: forward everything to parent via IPC — parent will format & route.
  if (isChild) {
    try {
      process.send({ type: "logToFile", value: { type, msg: arg } });
    } catch (_) {
      // IPC closed (parent gone) — fall through to local print as a last resort.
      process.stderr.write(`[child-log-fallback] ${arg}\n`);
    }
    return;
  }

  const fmtTime = sd.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const logType = logTypes[type] || type;
  const nameColor = (name === "BOTMANAGER" || name === "CONSOLE") ? "\x1b[92m" : "\x1b[96m";
  const logMessage = `[${fmtTime}][${logType}][${nameColor}${name}\x1b[0m] ${arg}`;
  const plainLogMessage = logMessage.replace(/\x1b\[\d+m/g, "");

  if (sink) {
    try { sink(logMessage, { type, name, plain: plainLogMessage }); } catch (_) {}
  } else {
    process.stdout.write(logMessage + "\n");
  }
  if (logToFile && logFile) {
    logFile.write(plainLogMessage + "\n");
  }
}

// Install in child entry points to catch every stray console.* call.
// Routes everything through the shared logger, which forwards to the parent via IPC.
function installChildConsoleCapture(defaultType = "INFO") {
  if (!isChild) return;
  const route = (type) => (...args) => {
    const msg = args
      .map((a) => (a instanceof Error ? (a.stack || a.message) : (typeof a === "object" ? safeStringify(a) : String(a))))
      .join(" ")
      .replace(/\r?\n+$/g, "");
    if (!msg.length) return;
    logger(true, type, "CONSOLE", msg);
  };
  console.log   = route(defaultType);
  console.info  = route("INFO");
  console.warn  = route("WARN");
  console.error = route("ERROR");
  console.debug = route("DEBUG");
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (_) { return String(obj); }
}

module.exports = { logger, setSink, installChildConsoleCapture, isChild };
