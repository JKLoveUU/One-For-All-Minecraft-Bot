const fs = require('fs');
const sd = require('silly-datetime');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const logFilePath = path.join(projectRoot, 'logs', 'latest.log');
const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });

const logTypes = {
    DEBUG: "\x1b[32mDEBUG\x1b[0m",
    INFO: "\x1b[32mINFO\x1b[0m",
    WARN: "\x1b[33mWARN\x1b[0m",
    ERROR: "\x1b[31mERROR\x1b[0m",
    CHAT: "\x1b[93mCHAT\x1b[0m"
};

function logToFileAndConsole(type = "INFO", p = "CONSOLE", ...args) {
    const arg = args.join(' ');
    const fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss');
    const logType = logTypes[type] || type;
    const logMessage = `[${fmtTime}][${logType}][${p}] ${arg}`;
    const plainLogMessage = logMessage.replace(/\x1b\[\d+m/g, '');

    console.log(logMessage);
    logFile.write(plainLogMessage + "\n");
}

module.exports = { logToFileAndConsole };