const fs = require("fs");
const sd = require("silly-datetime");
const path = require("path");

const isChild = typeof process.send === "function";

const projectRoot = path.resolve(__dirname, "..");

function currentDateStr(d = new Date()) {
  return sd.format(d, "YYYY-MM-DD_0");
}
// 下一個本地午夜的 epoch(ms)。換日換檔的判斷基準。
function nextMidnightMs(now = new Date()) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// In parent: write logs directly to file. In child: parent handles file writes (via IPC).
let logFile = isChild ? null : fs.createWriteStream(`logs/${currentDateStr()}.log`, { flags: "a" });
let nextRollover = isChild ? Infinity : nextMidnightMs();

// 跨日時惰性換檔:由寫入觸發(閒置不開空檔)。每次寫入只多一個整數比較(now < nextRollover),
// 真的跨日那一刻才重算日期字串、關舊 stream、開新檔。回傳當前可寫的 stream。
function rollLogFileIfNeeded(now) {
  if (isChild || logFile == null) return logFile;
  if (now < nextRollover) return logFile;
  const old = logFile;
  try {
    logFile = fs.createWriteStream(`logs/${currentDateStr(new Date(now))}.log`, { flags: "a" });
  } catch (_) {
    // 開新檔失敗 → 續用舊 stream,一分鐘後再試,避免每行重試。
    nextRollover = now + 60_000;
    return logFile;
  }
  nextRollover = nextMidnightMs(new Date(now));
  try { old.end(); } catch (_) {}
  return logFile;
}

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

  const now = new Date();
  const fmtTime = sd.format(now, "YYYY/MM/DD HH:mm:ss");
  const logType = logTypes[type] || type;
  let nameColor;
  if (name === "BOTMANAGER" || name === "CONSOLE") nameColor = "\x1b[92m";         // bright green
  else if (name === "DISCORD") nameColor = "\x1b[38;2;88;101;242m";               // Discord blurple #5865F2
  else nameColor = "\x1b[96m";                                                     // bright yellow (bot names)
  const logMessage = `[${fmtTime}][${logType}][${nameColor}${name}\x1b[0m] ${arg}`;
  const plainLogMessage = logMessage.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

  if (sink) {
    try { sink(logMessage, { type, name, plain: plainLogMessage }); } catch (_) {}
  } else {
    if (type === 'DEBUG' && !showDebug) return;
    process.stdout.write(logMessage + "\n");
  }
  if (logToFile && logFile) {
    const stream = rollLogFileIfNeeded(now.getTime());
    if (stream) stream.write(plainLogMessage + "\n");
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
