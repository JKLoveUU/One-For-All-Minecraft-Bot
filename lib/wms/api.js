// MC-WMS HTTP client (API v2026-04-21 per wmsapi.md).
// - Bearer auth in the Authorization header; request bodies no longer carry the auth token.
// - 401 / 403 surface as WmsHttpError so the caller can stop retrying (spec §4).
// - 503 honors Retry-After per RFC 7231 §7.1.3 before re-throwing as WmsHttpError.
// - Logging is routed through setLogger(); consumers inject a bot-aware logger at init.

let log = (file, level, name, ...args) => {
    const prefix = `[${level || 'INFO'}][${name || 'WMS'}]`;
    console.log(prefix, ...args);
};

function setLogger(fn) {
    if (typeof fn === 'function') log = fn;
}

class WmsHttpError extends Error {
    constructor(status, message, required) {
        super(message);
        this.name = 'WmsHttpError';
        this.status = status;
        this.required = required || null;
    }
    get isAuthError()       { return this.status === 401; }
    get isPermissionError() { return this.status === 403; }
}

// 503 retry policy — RFC 7231 §6.6.4 / §7.1.3 (Retry-After).
const RETRY_503_MAX_ATTEMPTS = 3;       // 含首次嘗試
const RETRY_503_DEFAULT_MS   = 2_000;   // 沒有 Retry-After 時的退讓
const RETRY_503_MAX_WAIT_MS  = 30_000;  // 上限,避免單次呼叫卡 bot 太久

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 解析 Retry-After header:支援 delta-seconds 與 HTTP-date 兩種格式。
function parseRetryAfter(header) {
    if (!header) return null;
    const v = String(header).trim();
    if (/^\d+$/.test(v)) return Number(v) * 1000;
    const ts = Date.parse(v);
    if (!Number.isNaN(ts)) return Math.max(0, ts - Date.now());
    return null;
}

async function request(cfg, path, body, { method = 'POST', name = 'WMS' } = {}) {
    const url = `http://${cfg.ip}:${cfg.port}${path}`;
    const headers = { 'Authorization': `Bearer ${cfg.token}` };
    const opts = { method, headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    for (let attempt = 1; ; attempt++) {
        let res;
        try {
            res = await fetch(url, opts);
        } catch (err) {
            log(true, 'ERROR', name, `${method} ${path} network error: ${err.message}`);
            throw err;
        }

        let data = null;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try { data = await res.json(); } catch (_) {}
        }

        // 503 Service Unavailable:依 Retry-After 等待後重試,超出上限則向上拋。
        if (res.status === 503 && attempt < RETRY_503_MAX_ATTEMPTS) {
            const parsed = parseRetryAfter(res.headers.get('retry-after'));
            const waitMs = parsed != null ? parsed : RETRY_503_DEFAULT_MS;
            if (waitMs <= RETRY_503_MAX_WAIT_MS) {
                log(false, 'WARN', name, `${method} ${path} HTTP 503,等待 ${Math.round(waitMs/1000)}s 後重試 (${attempt}/${RETRY_503_MAX_ATTEMPTS - 1})`);
                await sleep(waitMs);
                continue;
            }
            // Retry-After 過長,直接放棄重試
            log(true, 'ERROR', name, `${method} ${path} HTTP 503,Retry-After ${Math.round(waitMs/1000)}s 超過上限,放棄重試`);
        }

        if (!res.ok) {
            const msg      = (data && data.message) || res.statusText || `HTTP ${res.status}`;
            const required = data && data.required;
            const tag      = res.status === 401 ? 'auth failed'
                           : res.status === 403 ? 'permission denied'
                           : `HTTP ${res.status}`;
            const suffix   = required ? ` (requires: ${required})` : '';
            // 401/403 are expected when token is missing/expired; downgrade to DEBUG so they don't spam logs by default.
            const level = (res.status === 401 || res.status === 403) ? 'DEBUG' : 'ERROR';
            log(true, level, name, `${method} ${path} ${tag}: ${msg}${suffix}`);
            throw new WmsHttpError(res.status, msg, required);
        }
        return data;
    }
}

// ── Endpoint wrappers ──

// POST /api/v1/order — body shape per wmsapi.md §2.1.
function order(cfg, body)        { return request(cfg, '/api/v1/order',             body); }
// POST /api/v1/warehouse — takes an array of operation entries.
function warehouse(cfg, content) { return request(cfg, '/api/v1/warehouse',         { content }); }
// POST /api/v1/warehousegetinfo — no required fields.
function warehouseInfo(cfg)      { return request(cfg, '/api/v1/warehousegetinfo', {}); }
// POST /api/v1/link — MC ↔ Discord binding.
function link(cfg, mcid, verifyCode) {
    return request(cfg, '/api/v1/link', { mcid, verify_code: verifyCode });
}
// POST /api/v1/mcfallout — free-form forward (currently only used for /glist relay).
function mcfallout(cfg, body)    { return request(cfg, '/api/v1/mcfallout',         body); }
// POST /api/v1/afk_slot — AFK 租約協調(claim / renew / release / status),body 由 afk.js 組。
function afkSlot(cfg, body)      { return request(cfg, '/api/v1/afk_slot',         body, { name: 'WMS-AFK' }); }

module.exports = {
    setLogger,
    request,
    order,
    warehouse,
    warehouseInfo,
    link,
    mcfallout,
    afkSlot,
    WmsHttpError,
};
