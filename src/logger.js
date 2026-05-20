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

// Controls whether DEBUG-type messages are printed in non-TUI (no-sink) mode. Default off.
let showDebug = false;
function setShowDebug(v) { showDebug = !!v; }

function logger(logToFile = false, type = "INFO", name = "CONSOLE", ...args) {
  const arg = args.join(" ");

  // Child mode: forward everything to parent via IPC — parent will format & route.
  if (isChild) {
    try {
      process.send({ type: "logToFile", value: { type, msg: arg, file: !!logToFile } });
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
  const plainLogMessage = logMessage.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

  if (sink) {
    try { sink(logMessage, { type, name, plain: plainLogMessage }); } catch (_) {}
  } else {
    if (type === 'DEBUG' && !showDebug) return;
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
    // Captured console.* output: forward to parent for display but don't persist to log file.
    logger(false, type, "CONSOLE", msg);
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

// 清掉 logs/ 內 mtime 超過 retainDays 的 *.log 檔。
// retainDays <= 0 視為停用。回傳 {scanned, deleted, skippedActive, error?}。
// 不會刪當前開啟的 logFile (透過 path 比對排除)。
function cleanupOldLogs(retainDays = 30) {
  const result = { scanned: 0, deleted: 0, skippedActive: 0 };
  try {
    if (!retainDays || retainDays <= 0) return result;
    const dir = path.join(projectRoot, "logs");
    if (!fs.existsSync(dir)) return result;
    const cutoff = Date.now() - retainDays * 24 * 3600 * 1000;
    const activePath = logFile && logFile.path ? path.resolve(logFile.path) : null;
    const files = fs.readdirSync(dir);
    for (const name of files) {
      if (!/\.log$/i.test(name)) continue;
      result.scanned++;
      const p = path.join(dir, name);
      try {
        if (activePath && path.resolve(p) === activePath) { result.skippedActive++; continue; }
        const stat = fs.statSync(p);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(p);
          result.deleted++;
        }
      } catch (_) { /* per-file errors ignored */ }
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

module.exports = { logger, setSink, setShowDebug, installChildConsoleCapture, isChild, cleanupOldLogs };
