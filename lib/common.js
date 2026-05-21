const fs = require('fs')
const fsp = require('fs').promises

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

async function readConfig(file, options = {}) {
    try {
        const raw_file = await fsp.readFile(file, 'utf8');
        return JSON.parse(raw_file);
    } catch (err) {
        if (options.printError !== false) {
            printConfigLoadError(err, file, options)
        }
        throw err;
    }
}

async function saveConfig(file, data) {
    await fsp.writeFile(file, JSON.stringify(data, null, '\t'));
}

function configPath(bot_id, filename) {
    return `${process.cwd()}/config/${bot_id}/${filename}`
}

function globalConfigPath(filename) {
    return `${process.cwd()}/config/global/${filename}`
}

function describeConfigLoadError(err, file, options = {}) {
    const label = options.label || '設定檔'
    let reason = `讀取 ${label} 失敗`
    let location = ''
    let context = ''
    let hint = ''

    if (err && err.code === 'ENOENT') {
        reason = `${label} 不存在或路徑錯誤`
        hint = `確認檔案是否存在: ${file}`
    } else if (err && err.code === 'EACCES') {
        reason = `沒有權限讀取 ${label}`
        hint = '確認檔案沒有被其他程式鎖住，並檢查目前使用者是否有讀取權限。'
    } else if (err && err.code === 'EISDIR') {
        reason = `${label} 目前是一個資料夾，不是 JSON 檔案`
        hint = '把同名資料夾改名或移走，並放回真正的 JSON 設定檔。'
    } else if (err instanceof SyntaxError) {
        reason = `${label} JSON 格式錯誤`
        hint = buildJsonFixHint(err.message)
        const position = getJsonErrorPosition(err.message)
        if (position !== null) {
            try {
                const raw = fs.readFileSync(file, 'utf8')
                const loc = getLineColumn(raw, position)
                location = `line ${loc.line}, column ${loc.column}, char ${position}`
                context = buildJsonErrorContext(raw, loc.line, loc.column)
            } catch (_) {
                location = `char ${position}`
            }
        }
    } else if (err && err.code) {
        reason = `讀取 ${label} 失敗 (${err.code})`
        hint = '依照 Raw Error 檢查檔案路徑、權限或磁碟狀態。'
    }

    const rawMessage = err && err.message ? err.message : String(err)
    return {
        reason,
        location,
        context,
        hint,
        chatgptPrompt: buildConfigChatGptPrompt(label, file, reason, location, rawMessage, options),
    }
}

function printConfigLoadError(err, file, options = {}) {
    const detail = describeConfigLoadError(err, file, options)
    const chatgptFile = options.chatgptFile || file
    console.error(`Fail to read ${options.label || 'config file'}`)
    console.error(`FilePath: ${file}`)
    console.error(`Reason: \x1b[31m${detail.reason}\x1b[0m`)
    if (detail.location) console.error(`Location: ${detail.location}`)
    if (detail.hint) console.error(`Hint: \x1b[33m${detail.hint}\x1b[0m`)
    if (detail.context) console.error(detail.context)
    console.error(`Raw Error: \x1b[31m${err && err.message ? err.message : String(err)}\x1b[0m`)
    console.error('如果你不知道如何修改，請將這份檔案交給 ChatGPT:')
    console.error(`  檔案: \x1b[33m${chatgptFile}\x1b[0m`)
    console.error('並跟他說:')
    console.error(`\x1b[33m${detail.chatgptPrompt}\x1b[0m`)
    if (options.relatedFiles && options.relatedFiles.length > 0) {
        console.error(`如果仍無法判斷，再一起附上: ${options.relatedFiles.join(', ')}`)
    }
}

function buildJsonFixHint(message) {
    const msg = String(message)
    if (/Unexpected string|Expected ','|after property value/i.test(msg)) {
        return '錯誤位置附近可能少了一個逗號 `,`，常見於兩個物件或欄位中間。'
    }
    if (/Unexpected token }|Expected double-quoted property name/i.test(msg)) {
        return '錯誤位置附近可能多了一個尾端逗號，或下一個 key 沒有用雙引號包住。'
    }
    if (/Unexpected token ]/i.test(msg)) {
        return '錯誤位置附近可能是陣列格式錯誤，檢查是否多逗號、少值或少了結尾括號。'
    }
    if (/Unexpected end of JSON input|unterminated string/i.test(msg)) {
        return '檔案尾端或前幾行可能少了結尾括號 `}`、`]`，或字串少了結尾雙引號。'
    }
    if (/Unexpected number/i.test(msg)) {
        return '錯誤位置附近可能少了逗號，或數字前後不該直接接其他文字。'
    }
    return '檢查標示位置附近是否少了逗號、冒號、雙引號，或 `{}` / `[]` 括號沒有成對。'
}

function getJsonErrorPosition(message) {
    const match = String(message).match(/position\s+(\d+)/i)
    if (!match) return null
    const position = Number(match[1])
    return Number.isFinite(position) ? position : null
}

function getLineColumn(text, position) {
    let line = 1
    let column = 1
    for (let i = 0; i < position && i < text.length; i++) {
        if (text[i] === '\n') {
            line++
            column = 1
        } else {
            column++
        }
    }
    return { line, column }
}

function buildJsonErrorContext(text, line, column) {
    const lines = text.split(/\r?\n/)
    const start = Math.max(1, line - 2)
    const end = Math.min(lines.length, line + 2)
    const width = String(end).length
    const output = ['Context:']

    for (let lineNo = start; lineNo <= end; lineNo++) {
        const prefix = `${String(lineNo).padStart(width, ' ')} | `
        output.push(`${prefix}${lines[lineNo - 1]}`)
        if (lineNo === line) {
            output.push(`${' '.repeat(prefix.length + Math.max(column - 1, 0))}^`)
        }
    }

    return output.join('\n')
}

function buildConfigChatGptPrompt(label, file, reason, location, rawMessage, options = {}) {
    if (options.chatgptPrompt) {
        return typeof options.chatgptPrompt === 'function'
            ? options.chatgptPrompt({ label, file, reason, location, rawMessage })
            : options.chatgptPrompt
    }
    const locText = location ? `位置: ${location}` : '位置: 無法判定'
    return [
        `請幫我修正 One-For-All 專案的 ${label}。`,
        '請只修正 JSON 格式或明顯設定錯誤，保留原本資料結構，不要重寫成新格式。',
        `錯誤原因: ${reason}`,
        locText,
        `Node.js 原始錯誤: ${rawMessage}`,
        `我會上傳這份檔案: ${file}。`,
    ].join(' ')
}

let _mcDataCache = {}
function getMcData(version) {
    if (!_mcDataCache[version]) {
        _mcDataCache[version] = require('minecraft-data')(version)
    }
    return _mcDataCache[version]
}

module.exports = {
    sleep,
    readConfig,
    saveConfig,
    configPath,
    globalConfigPath,
    getMcData,
    describeConfigLoadError,
    printConfigLoadError,
}
