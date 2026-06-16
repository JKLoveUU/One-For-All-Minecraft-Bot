// MC-WMS AFK 租約協調(WMS 子模組)。
// - 對外:claim / renew / release / status / isActive / getCurrent / setLogger / setOptions
// - 透過 lib/wms/api.js 的 afkSlot(cfg, body) 與 WMS 通訊。
// - cfg 由呼叫端傳入(同其他子模組;一般為 wms.cfg)。
// - 主模式失敗連續 MAX_WMS_FAIL 次切入 sheet fallback(目前空殼,待階段 5 實作)。

const api    = require('./api');
const sheet  = require('./afkGsheet');

// ── 預設參數(可由 setOptions 覆寫,通常從 autoQuest.toml [afk_coord] 灌入)──
const DEFAULTS = {
    ttlSec:         300,        // 租約 TTL(秒)
    renewBeforeMs:  60_000,     // 提前 60s renew
    jitterMs:       10_000,     // ±5s jitter 防驚群
    minRenewMs:     10_000,     // 即使 expires_at 很近也至少等 10s 再 renew
    maxWmsFail:     3,          // 連續失敗幾次切入 fallback
};
const opts = { ...DEFAULTS };

// ── 模組層狀態(單例;前提:一行程一 bot,與 wms.cfg / wms.bot_name 假設一致)──
let currentSlot       = null;   // { site_id, warp, server, expires_at, source: 'wms'|'sheet' }
let renewTimer        = null;
let wmsFailCount      = 0;
let savedViewDistance = null;   // 進入 afk 前的原始 viewDistance,release 時還原(null=未調整)

// ── Logger 注入(由 wms.setLogger 同步呼叫)──
let log = (_file, level, name, ...args) => {
    console.log(`[${level || 'INFO'}][${name || 'WMS-AFK'}]`, ...args);
};
function setLogger(fn) {
    if (typeof fn !== 'function') return;
    log = fn;
    sheet.setLogger(fn);
}

function setOptions(o = {}) {
    if (typeof o.ttl === 'number')              opts.ttlSec        = o.ttl;
    if (typeof o.ttlSec === 'number')           opts.ttlSec        = o.ttlSec;
    if (typeof o.renew_before_ms === 'number')  opts.renewBeforeMs = o.renew_before_ms;
    if (typeof o.renewBeforeMs === 'number')    opts.renewBeforeMs = o.renewBeforeMs;
    if (typeof o.max_wms_fail === 'number')     opts.maxWmsFail    = o.max_wms_fail;
    if (o.gsheet)                               sheet.configure(o.gsheet);
}

function isActive()   { return currentSlot !== null; }
function getCurrent() { return currentSlot; }

// ── 進入 afk 掛機:降低 viewDistance 省流量(claim 成功時呼叫)──
function applyAfkViewDistance(bot, cfg) {
    const vd = cfg && cfg.afk_view_distance;
    // 0 / null / undefined / '' → 不調整,維持登入預設(far=12)
    if (vd === undefined || vd === null || vd === '' || vd === 0) return;
    if (savedViewDistance !== null) return; // 已套用過,避免覆蓋掉原始值
    try {
        savedViewDistance = bot.settings?.viewDistance ?? 'far';
        bot.setSettings({ viewDistance: vd });
        log(false, 'INFO', 'WMS-AFK', `afk 掛機:viewDistance → ${vd}(原 ${savedViewDistance})`);
    } catch (err) {
        savedViewDistance = null;
        log(true, 'WARN', 'WMS-AFK', `設定 afk viewDistance 失敗: ${err.message}`);
    }
}

// ── 離開 afk:還原 viewDistance(release 時呼叫)──
function restoreViewDistance(bot) {
    if (savedViewDistance === null) return;
    const prev = savedViewDistance;
    savedViewDistance = null;
    try {
        bot.setSettings({ viewDistance: prev });
        log(false, 'INFO', 'WMS-AFK', `離開 afk:viewDistance 還原 → ${prev}`);
    } catch (err) {
        log(true, 'WARN', 'WMS-AFK', `還原 viewDistance 失敗: ${err.message}`);
    }
}

// ── 內部:排程下一次 renew(jitter 防驚群)──
function scheduleRenew(bot, cfg) {
    clearTimeout(renewTimer);
    renewTimer = null;
    if (!currentSlot) return;
    const baseDelay = currentSlot.expires_at - Date.now() - opts.renewBeforeMs;
    const jitter    = Math.floor((Math.random() - 0.5) * opts.jitterMs);
    const delay     = Math.max(baseDelay, opts.minRenewMs) + jitter;
    renewTimer = setTimeout(() => { renew(bot, cfg).catch(() => {}); }, delay);
}

// ── claim ─────────────────────────────────────────────────────────────────────
async function claim(bot, cfg) {
    try {
        const data = await api.afkSlot(cfg, {
            bot_name: bot.username,
            action:   'claim',
            ttl:      opts.ttlSec,
        });
        wmsFailCount = 0;
        // pool_exhausted 走 ok=false 200 路徑;其他 503/4xx 由 api.js 拋成 WmsHttpError
        if (!data || !data.ok) {
            const reason = data?.reason || 'unknown';
            log(false, 'INFO', 'WMS-AFK', `claim 未取得 slot: ${reason}`);
            return null;
        }
        currentSlot = {
            site_id:    data.site_id,
            warp:       data.warp,
            server:     data.server,
            expires_at: data.expires_at,
            source:     'wms',
        };
        scheduleRenew(bot, cfg);
        applyAfkViewDistance(bot, cfg);
        log(false, 'INFO', 'WMS-AFK', `claim ${data.site_id} (warp=${data.warp}) expires=${data.expires_at}`);
        return currentSlot;
    } catch (err) {
        wmsFailCount++;
        log(true, 'WARN', 'WMS-AFK', `claim 失敗(${wmsFailCount}/${opts.maxWmsFail}): ${err.message}`);
        if (wmsFailCount >= opts.maxWmsFail) {
            return fallbackClaimFromSheet(bot, cfg);
        }
        return null;
    }
}

// ── renew ─────────────────────────────────────────────────────────────────────
async function renew(bot, cfg) {
    if (!currentSlot) return null;
    if (currentSlot.source === 'sheet') {
        // 在 fallback 中:每次 renew 先試一次 WMS 主模式 status,成功就重置失敗計數
        // (但不切換現有 sheet slot,等下個 claim 自然回主模式以避免雙寫衝突)
        try {
            await api.afkSlot(cfg, { bot_name: bot.username, action: 'status' });
            wmsFailCount = 0;
            log(false, 'INFO', 'WMS-AFK', 'WMS 主模式已恢復(下次 claim 將回主模式)');
        } catch (_) { /* 主模式仍掛,繼續走 sheet renew */ }
        const renewed = await sheet.renew(bot.username, currentSlot, opts.ttlSec * 1000);
        if (renewed) {
            currentSlot = { ...renewed, source: 'sheet' };
            scheduleRenew(bot, cfg);
            return currentSlot;
        }
        log(true, 'WARN', 'WMS-AFK', 'sheet renew 失敗,清空 currentSlot');
        currentSlot = null;
        clearTimeout(renewTimer); renewTimer = null;
        return null;
    }
    try {
        const data = await api.afkSlot(cfg, {
            bot_name: bot.username,
            action:   'renew',
            site_id:  currentSlot.site_id,
            ttl:      opts.ttlSec,
        });
        wmsFailCount = 0;
        if (data && data.ok) {
            currentSlot.expires_at = data.expires_at;
            scheduleRenew(bot, cfg);
            return currentSlot;
        }
        // Server 要求重新 claim(slot 過期/被搶/holder 不符等)
        if (data && data.redirect === 'claim') {
            log(true, 'WARN', 'WMS-AFK', `renew 被拒絕(${data.reason || 'unknown'}),立即重新 claim`);
            currentSlot = null;
            clearTimeout(renewTimer); renewTimer = null;
            return claim(bot, cfg);
        }
        // 其他非 ok 情況:放掉,讓主迴圈重 claim
        log(true, 'WARN', 'WMS-AFK', `renew 失敗(非 holder?),清空 currentSlot`);
        currentSlot = null;
        clearTimeout(renewTimer); renewTimer = null;
        return null;
    } catch (err) {
        // 一次失敗不重試,等 TTL 自然過期再 claim
        log(true, 'WARN', 'WMS-AFK', `renew 例外: ${err.message}`);
        return null;
    }
}

// ── release ───────────────────────────────────────────────────────────────────
async function release(bot, cfg) {
    restoreViewDistance(bot);   // 還原 viewDistance(即使沒 slot 也安全:null 時直接 return)
    if (!currentSlot) return;
    const slot = currentSlot;
    clearTimeout(renewTimer); renewTimer = null;
    currentSlot = null;
    if (slot.source === 'sheet') {
        await sheet.release(bot.username, slot);
        return;
    }
    try {
        await api.afkSlot(cfg, {
            bot_name: bot.username,
            action:   'release',
            site_id:  slot.site_id,
        });
        log(false, 'INFO', 'WMS-AFK', `release ${slot.site_id}`);
    } catch (err) {
        log(false, 'INFO', 'WMS-AFK', `release ${slot.site_id} 失敗(忽略): ${err.message}`);
    }
}

// ── status(除錯/監控用)─────────────────────────────────────────────────────
async function status(bot, cfg) {
    try {
        return await api.afkSlot(cfg, { bot_name: bot.username, action: 'status' });
    } catch (err) {
        log(true, 'WARN', 'WMS-AFK', `status 例外: ${err.message}`);
        return null;
    }
}

// ── Google Sheet fallback ─────────────────────────────────────────────────────
async function fallbackClaimFromSheet(bot, cfg) {
    if (!sheet.isAvailable()) return null;
    log(true, 'WARN', 'WMS-AFK', `主模式連續失敗 ${wmsFailCount} 次,切入 sheet fallback`);
    const slot = await sheet.claim(bot.username, opts.ttlSec * 1000);
    if (!slot) return null;
    currentSlot = { ...slot, source: 'sheet' };
    scheduleRenew(bot, cfg);
    applyAfkViewDistance(bot, cfg);
    return currentSlot;
}

module.exports = {
    setLogger,
    setOptions,
    claim,
    renew,
    release,
    status,
    isActive,
    getCurrent,
};
