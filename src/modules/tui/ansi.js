// ANSI → blessed tag 轉換（由 tui.js 抽出）
const { T } = require('./theme')

// ANSI → blessed tag converter (for piping pre-formatted logger output)
const ANSI_MAP = {
    '30': T.bg,        '31': T.error,     '32': T.success,
    '33': T.warning,   '34': T.accent,    '35': T.secondary,
    '36': T.accent,    '37': T.text,      '90': T.muted,
    '91': T.error,     '92': T.success,   '93': T.warning,
    '94': T.accent,    '95': T.secondary, '96': T.accent,
    '97': T.text,
}
function ansiToBlessed(str) {
    return String(str).replace(/\x1b\[(\d+)m/g, (_m, code) => {
        if (code === '0') return '{/}'
        const col = ANSI_MAP[code]
        return col ? `{${col}-fg}` : ''
    })
}

module.exports = { ansiToBlessed, ANSI_MAP }
