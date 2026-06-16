const fs = require('fs')
const fsp = require('fs').promises
const toml = require('toml')

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

const isTomlFile = (file) => /\.toml$/i.test(file)

async function readConfig(file, options = {}) {
    const asToml = isTomlFile(file)
    try {
        const raw_file = await fsp.readFile(file, 'utf8');
        return asToml ? toml.parse(raw_file) : JSON.parse(raw_file);
    } catch (err) {
        if (options.printError !== false) {
            printConfigLoadError(err, file, { ...options, format: asToml ? 'toml' : 'json' })
        }
        throw err;
    }
}

async function saveConfig(file, data) {
    // 依副檔名選序列化格式: .toml → TOML, 其餘 → JSON。
    const text = isTomlFile(file) ? stringifyToml(data) : JSON.stringify(data, null, '\t')
    await fsp.writeFile(file, text);
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
        reason = `${label} 目前是一個資料夾，不是設定檔`
        hint = '把同名資料夾改名或移走，並放回真正的設定檔。'
    } else if (options.format === 'toml' && err instanceof SyntaxError) {
        // toml 套件的解析錯誤也是 SyntaxError, 必須在 JSON 分支之前攔截, 否則會被誤標成 JSON 錯誤。
        reason = `${label} TOML 格式錯誤`
        hint = '檢查標示位置: 字串值要用雙引號包住、區段標頭為 [section]、陣列/大括號要成對、每行需是 key = value。'
        const loc = err.location && err.location.start
        if (loc) {
            location = `line ${loc.line}, column ${loc.column}, char ${loc.offset}`
            try {
                const raw = fs.readFileSync(file, 'utf8')
                context = buildJsonErrorContext(raw, loc.line, loc.column)
            } catch (_) {
                // 讀檔失敗就只附上位置, 不附 context
            }
        }
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
    const fmt = options.format === 'toml' ? 'TOML' : 'JSON'
    return [
        `請幫我修正 One-For-All 專案的 ${label}。`,
        `請只修正 ${fmt} 格式或明顯設定錯誤，保留原本資料結構，不要重寫成新格式。`,
        `錯誤原因: ${reason}`,
        locText,
        `Node.js 原始錯誤: ${rawMessage}`,
        `我會上傳這份檔案: ${file}。`,
    ].join(' ')
}

// ── TOML 序列化 ──────────────────────────────────────────────────────────────
// 專案只依賴 `toml`(純解析), 故自備 stringify。輸出規則: 同一張表的純量/陣列鍵
// 先輸出, 再輸出子表; 物件陣列以 [[a.b]] array-of-tables 表示; 含特殊字元的鍵加引號。
// 與 config/<bot>/villager.toml 的轉檔結果一致 (round-trip 驗證過)。
const TOML_BARE_KEY = /^[A-Za-z0-9_-]+$/
function tomlQuoteKey(k) {
    return TOML_BARE_KEY.test(k)
        ? k
        : '"' + String(k).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}
function tomlJoinPath(parts) { return parts.map(tomlQuoteKey).join('.') }
function tomlIsPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }
function tomlIsArrayOfTables(v) { return Array.isArray(v) && v.length > 0 && v.every(tomlIsPlainObject) }
function tomlInlineValue(v) {
    if (v === null || v === undefined) throw new Error('TOML 不支援 null/undefined 值')
    const t = typeof v
    if (t === 'number') {
        if (!Number.isFinite(v)) throw new Error('TOML 不支援非有限數字 (Infinity/NaN)')
        return String(v)
    }
    if (t === 'boolean') return v ? 'true' : 'false'
    if (t === 'string') {
        return '"' + v
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
    }
    if (Array.isArray(v)) return '[' + v.map(tomlInlineValue).join(', ') + ']'
    if (tomlIsPlainObject(v)) {
        const inner = Object.entries(v).map(([k, val]) => `${tomlQuoteKey(k)} = ${tomlInlineValue(val)}`).join(', ')
        return `{ ${inner} }`
    }
    throw new Error('TOML 不支援的值型別: ' + t)
}
function tomlEmitTable(obj, pathParts, lines) {
    const scalars = [], subTables = [], tableArrays = []
    for (const [k, v] of Object.entries(obj)) {
        if (tomlIsArrayOfTables(v)) tableArrays.push([k, v])
        else if (tomlIsPlainObject(v)) subTables.push([k, v])
        else scalars.push([k, v])
    }
    const isEmpty = scalars.length === 0 && subTables.length === 0 && tableArrays.length === 0
    // 非根表: 有直接純量鍵 (或整張表為空時, 為保留它) 才需印出表頭。
    if (pathParts.length > 0 && (scalars.length > 0 || isEmpty)) {
        if (lines.length > 0) lines.push('')
        lines.push(`[${tomlJoinPath(pathParts)}]`)
    }
    for (const [k, v] of scalars) lines.push(`${tomlQuoteKey(k)} = ${tomlInlineValue(v)}`)
    for (const [k, v] of subTables) tomlEmitTable(v, [...pathParts, k], lines)
    for (const [k, arr] of tableArrays) {
        for (const el of arr) {
            lines.push('')
            lines.push(`[[${tomlJoinPath([...pathParts, k])}]]`)
            tomlEmitArrayElement(el, [...pathParts, k], lines)
        }
    }
}
function tomlEmitArrayElement(obj, pathParts, lines) {
    const subTables = [], tableArrays = []
    for (const [k, v] of Object.entries(obj)) {
        if (tomlIsArrayOfTables(v)) tableArrays.push([k, v])
        else if (tomlIsPlainObject(v)) subTables.push([k, v])
        else lines.push(`${tomlQuoteKey(k)} = ${tomlInlineValue(v)}`)
    }
    for (const [k, v] of subTables) tomlEmitTable(v, [...pathParts, k], lines)
    for (const [k, arr] of tableArrays) {
        for (const el of arr) {
            lines.push('')
            lines.push(`[[${tomlJoinPath([...pathParts, k])}]]`)
            tomlEmitArrayElement(el, [...pathParts, k], lines)
        }
    }
}
function stringifyToml(obj) {
    if (!tomlIsPlainObject(obj)) throw new Error('stringifyToml: 頂層必須是物件')
    const lines = []
    tomlEmitTable(obj, [], lines)
    return lines.join('\n') + '\n'
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
    stringifyToml,
    configPath,
    globalConfigPath,
    getMcData,
    describeConfigLoadError,
    printConfigLoadError,
}
