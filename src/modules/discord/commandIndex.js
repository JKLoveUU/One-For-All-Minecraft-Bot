const path = require('path');
const { logger } = require('../../logger');

// 來源 cmd 模組（相對於本檔）。模組若有 `identifier` 欄位 → 取 [0] 當前綴；否則扁平展開（basicCommand）。
const SOURCES = [
    '../../basicCommand',
    '../../craftAndExchange',
    '../../autoQuest',
    '../../buildtool',
    '../../warehouse',
    '../../villager',
    '../../clearArea',
    '../../edtool',
];

let _entries = [];   // { name (顯示字串), value (送給 child 的 ".xxx"), keys (小寫關鍵字陣列) }
let _built = false;

function pushEntry(name, value) {
    _entries.push({
        name,
        value,
        keys: name.toLowerCase(),
    });
}

function buildIndex() {
    if (_built) return _entries.length;
    _entries = [];
    let okModules = 0;
    for (const file of SOURCES) {
        try {
            const mod = require(file);
            const cmds = Array.isArray(mod && mod.cmd) ? mod.cmd : [];
            const moduleIdent = Array.isArray(mod && mod.identifier) ? mod.identifier[0] : null;

            for (const c of cmds) {
                const childIdents = Array.isArray(c.identifier) ? c.identifier : [];
                if (!childIdents.length) continue;
                const childKey = childIdents[0];
                const prefix = moduleIdent ? `${moduleIdent} ` : '';
                const display = `${prefix}${childKey}  —  ${c.name || ''}`.trim();
                const value = `.${prefix}${childKey}`;
                pushEntry(display, value);
            }
            okModules += 1;
        } catch (err) {
            logger(true, 'WARN', 'DISCORD', `commandIndex: skipped ${file} (${err.message})`);
        }
    }
    _built = true;
    logger(true, 'INFO', 'DISCORD', `commandIndex: loaded ${_entries.length} identifiers from ${okModules}/${SOURCES.length} modules`);
    return _entries.length;
}

// Discord autocomplete 上限 25 項，value 上限 100 字（足夠用）。
function searchCommands(query) {
    if (!_built) buildIndex();
    const q = (query || '').trim().toLowerCase();
    // 留空 → 回前 25 項
    const pool = q
        ? _entries.filter(e => e.keys.includes(q) || e.value.toLowerCase().includes(q))
        : _entries;
    // startsWith / 包含 排序：startsWith 優先
    const sorted = q
        ? pool.slice().sort((a, b) => {
            const as = a.keys.startsWith(q) ? 0 : 1;
            const bs = b.keys.startsWith(q) ? 0 : 1;
            return as - bs;
          })
        : pool;
    return sorted.slice(0, 25).map(e => ({
        name: e.name.length > 100 ? e.name.slice(0, 97) + '...' : e.name,
        value: e.value.length > 100 ? e.value.slice(0, 100) : e.value,
    }));
}

// readline-style 前綴匹配：回傳 startsWith(prefix) 的 value 字串陣列；空 prefix → 回全部。
// 與 searchCommands 不同處：嚴格 startsWith（readline 用來覆蓋目前輸入），不分大小寫，無上限。
function prefixComplete(prefix) {
    if (!_built) buildIndex();
    if (!prefix) return _entries.map(e => e.value);
    const lower = prefix.toLowerCase();
    return _entries
        .filter(e => e.value.toLowerCase().startsWith(lower))
        .map(e => e.value);
}

module.exports = { buildIndex, searchCommands, prefixComplete };
