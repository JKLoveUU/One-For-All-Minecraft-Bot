const fs = require('fs');
const sd = require('silly-datetime');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const logFilePath = path.join(projectRoot, 'logs', 'lastest.log');
const logFile = fs.createWriteStream(logFilePath, { flags: 'a' });

function logToFileAndConsole(type = "INFO", p = "CONSOLE", ...args) {
    let arg = args.join(' ')
    let fmtTime = sd.format(new Date(), 'YYYY/MM/DD HH:mm:ss')      //會太長嗎?
    switch (type) {
        case "DEBUG":
            type = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "INFO":
            type = "\x1b[32m" + type + "\x1b[0m";
            break;
        case "WARN":
            type = "\x1b[33m" + type + "\x1b[0m";
            break;
        case "ERROR":
            type = "\x1b[31m" + type + "\x1b[0m";
            break;
        case "CHAT":
            type = "\x1b[93m" + type + "\x1b[0m";
            break;
        default:
            type = type;
            break;
    }
    let clog = `[${fmtTime}][${type}][${p}] ${arg}`;
    let nclog = clog.replace(/\x1b\[\d+m/g, '');
    console.log(clog);
    logFile.write(nclog + "\n");
}

module.exports = { logToFileAndConsole };