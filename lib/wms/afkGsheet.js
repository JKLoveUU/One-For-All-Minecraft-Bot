// MC-WMS AFK 備援:Google Sheet 直寫(WMS 不可達時使用)。
// - googleapis 為延後/可選依賴,本檔不在頂層 require,由 lazyInit 懶載入。
// - 對應 bot_integration_afk.md 第三節(sheet 結構與 fallback 邏輯)。
// - sites 分頁欄位(A–O):
//     A site_id  B warp  C server  D description
//     E pos_x    F pos_y G pos_z
//     H afk_enabled  I afk_priority
//     J afk_holder   K afk_expires_at  L afk_last_used  M afk_last_seen
//     N enabled      O updated_at
//
// 對外 API:
//   setLogger(fn)
//   configure({ enabled, credentialsPath, spreadsheetId })
//   isAvailable()                    -> boolean(設定齊備且 googleapis 可載入)
//   claim(botName, ttlMs)            -> { site_id, warp, server, expires_at, rowIdx } | null
//   renew(botName, slot, ttlMs)      -> { ...slot, expires_at } | null
//   release(botName, slot)           -> void

let log = (_file, level, name, ...args) => {
    console.log(`[${level || 'INFO'}][${name || 'WMS-AFK-SHEET'}]`, ...args);
};
function setLogger(fn) { if (typeof fn === 'function') log = fn; }

const cfg = {
    enabled:         false,
    credentialsPath: '',
    spreadsheetId:   '',
};

function configure(o = {}) {
    if (typeof o.enabled === 'boolean')           cfg.enabled         = o.enabled;
    if (typeof o.credentials_path === 'string')   cfg.credentialsPath = o.credentials_path;
    if (typeof o.credentialsPath === 'string')    cfg.credentialsPath = o.credentialsPath;
    if (typeof o.spreadsheet_id === 'string')     cfg.spreadsheetId   = o.spreadsheet_id;
    if (typeof o.spreadsheetId === 'string')      cfg.spreadsheetId   = o.spreadsheetId;
}

let sheetsClient = null;
let initFailed   = false;

async function lazyInit() {
    if (sheetsClient) return sheetsClient;
    if (initFailed)   return null;
    if (!cfg.enabled || !cfg.spreadsheetId || !cfg.credentialsPath) {
        initFailed = true;
        log(false, 'INFO', 'WMS-AFK-SHEET', 'fallback 未啟用或設定缺漏');
        return null;
    }
    let google;
    try {
        ({ google } = require('googleapis'));
    } catch (err) {
        initFailed = true;
        log(true, 'WARN', 'WMS-AFK-SHEET', `googleapis 未安裝,fallback 停用: ${err.message}`);
        return null;
    }
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: cfg.credentialsPath,
            scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
        });
        sheetsClient = google.sheets({ version: 'v4', auth });
        log(false, 'INFO', 'WMS-AFK-SHEET', `fallback 已就緒(spreadsheet=${cfg.spreadsheetId})`);
        return sheetsClient;
    } catch (err) {
        initFailed = true;
        log(true, 'WARN', 'WMS-AFK-SHEET', `auth 初始化失敗,fallback 停用: ${err.message}`);
        return null;
    }
}

function isAvailable() {
    return cfg.enabled && !!cfg.spreadsheetId && !!cfg.credentialsPath && !initFailed;
}

// ── 內部:讀整個 sites!A2:O,parse 成候選清單 ────────────────────────────────
async function readSites(api) {
    const res = await api.spreadsheets.values.get({
        spreadsheetId: cfg.spreadsheetId,
        range:         'sites!A2:O',
    });
    const rows = res.data.values || [];
    return rows.map((r, idx) => ({
        site_id:     r[0] || '',
        warp:        r[1] || '',
        server:      parseInt(r[2]) || null,
        afk_enabled: r[7] === 'TRUE',
        priority:    parseInt(r[8]) || 100,
        holder:      r[9] || '',
        expires_at:  parseInt(r[10]) || 0,
        last_used:   parseInt(r[11]) || 0,
        last_seen:   parseInt(r[12]) || 0,
        enabled:     r[13] === 'TRUE',
        rowIdx:      idx + 2,           // header 是第 1 列
    }));
}

// ── claim ────────────────────────────────────────────────────────────────────
async function claim(botName, ttlMs = 300_000) {
    const api = await lazyInit();
    if (!api) return null;
    const now = Date.now();
    let candidates;
    try {
        const all = await readSites(api);
        candidates = all
            .filter(s => s.afk_enabled && s.enabled)
            .filter(s => !s.holder || s.expires_at < now)
            .sort((a, b) => a.priority - b.priority || a.last_used - b.last_used);
    } catch (err) {
        log(true, 'WARN', 'WMS-AFK-SHEET', `read sites 失敗: ${err.message}`);
        return null;
    }

    for (const s of candidates) {
        const expires = Date.now() + ttlMs;
        const range   = `sites!J${s.rowIdx}:M${s.rowIdx}`;
        try {
            await api.spreadsheets.values.update({
                spreadsheetId:    cfg.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        botName,                // J afk_holder
                        String(expires),        // K afk_expires_at
                        String(s.last_used),    // L afk_last_used(保留)
                        String(Date.now()),     // M afk_last_seen
                    ]],
                },
            });
            // 讀回確認沒被搶(同秒碰撞 best-effort CAS)
            const check = await api.spreadsheets.values.get({
                spreadsheetId: cfg.spreadsheetId,
                range,
            });
            const got = (check.data.values || [[]])[0];
            if (got && got[0] === botName) {
                log(false, 'INFO', 'WMS-AFK-SHEET', `claim ${s.site_id} (row=${s.rowIdx}) expires=${expires}`);
                return {
                    site_id:    s.site_id,
                    warp:       s.warp,
                    server:     s.server,
                    expires_at: expires,
                    rowIdx:     s.rowIdx,
                    last_used:  s.last_used,
                };
            }
            // 衝突,試下一筆
            log(false, 'INFO', 'WMS-AFK-SHEET', `claim ${s.site_id} 被搶走,試下一筆`);
        } catch (err) {
            log(true, 'WARN', 'WMS-AFK-SHEET', `claim ${s.site_id} 寫入失敗: ${err.message}`);
            // 寫入失敗多半是配額/網路,直接放棄整輪
            return null;
        }
    }
    return null;
}

// ── renew(覆寫自己這列的 J/K/M)────────────────────────────────────────────
async function renew(botName, slot, ttlMs = 300_000) {
    const api = await lazyInit();
    if (!api || !slot?.rowIdx) return null;
    const expires = Date.now() + ttlMs;
    const range = `sites!J${slot.rowIdx}:M${slot.rowIdx}`;
    try {
        await api.spreadsheets.values.update({
            spreadsheetId:    cfg.spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[
                    botName,
                    String(expires),
                    String(slot.last_used || 0),
                    String(Date.now()),
                ]],
            },
        });
        return { ...slot, expires_at: expires };
    } catch (err) {
        log(true, 'WARN', 'WMS-AFK-SHEET', `renew row=${slot.rowIdx} 失敗: ${err.message}`);
        return null;
    }
}

// ── release(清 J/K,L=now,M=now)─────────────────────────────────────────
async function release(_botName, slot) {
    const api = await lazyInit();
    if (!api || !slot?.rowIdx) return;
    const range = `sites!J${slot.rowIdx}:M${slot.rowIdx}`;
    const now = String(Date.now());
    try {
        await api.spreadsheets.values.update({
            spreadsheetId:    cfg.spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: { values: [['', '', now, now]] },
        });
        log(false, 'INFO', 'WMS-AFK-SHEET', `release row=${slot.rowIdx}`);
    } catch (err) {
        log(false, 'INFO', 'WMS-AFK-SHEET', `release row=${slot.rowIdx} 失敗(忽略): ${err.message}`);
    }
}

module.exports = {
    setLogger,
    configure,
    isAvailable,
    claim,
    renew,
    release,
};
