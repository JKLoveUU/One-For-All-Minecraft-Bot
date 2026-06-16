// WMS worker intake — 把 WMS 派來的「單元」order 翻成既有 build / clear 模組執行。
// 設計依據:todo/wms-worker-intake-reference.md。
//
// 原則:
//  - 不動 litematicPrinter / area 的核心,只在外面加一層映射。
//  - 強制 materialsMode:'wms'(忽略本地 station 設定)。
//  - litematicPrinter / area / schematic 一律 lazy-require,避免與 wms.js 的循環依賴
//    (wms.js → orders.js → worker.js → litematicPrinter.js → wms.js)。
//  - 進度:傳一個合成 task 給建造/清理模組,讓它照常寫 task.detail;worker 輪詢該
//    detail,經呼叫端注入的 onProgress 推回 TUI,同時 best-effort 回報 WMS。

const { readConfig, sleep } = require('../common');

const PROGRESS_POLL_MS = 2000;
// WMS 沒在 work order 內給回報間隔時的保底 keepalive 心跳。
const DEFAULT_KEEPALIVE_MS = 60000;

function botId() { return process.argv[2] || 'unknown'; }

// 領地保護:bot 沒有此處建造權的訊息(例:「[領地] 您沒有 Dunyu 的許可在這裡建造。」)。
// 任何 bot 都建不了,重派無用 → 偵測到就停止並回報 no_permission,讓 WMS 直接標 error。
const NO_PERMISSION_RE = /\[領地\][\s\S]*的許可在這裡建造/;

// watchNoPermission 在單元執行期間監聽領地無建造權訊息;偵測到就呼叫 stopFn() 停止並記旗標。
// 回傳 { hit(): 是否偵測到, dispose(): 解除監聽 }。
function watchNoPermission(wms, bot, stopFn) {
    let hit = false;
    const onMsg = (jsonMsg) => {
        let s = '';
        try { s = jsonMsg.toString(); } catch (_) { return; }
        if (!hit && NO_PERMISSION_RE.test(s)) {
            hit = true;
            wms.log(true, 'WARN', bot.username, `[worker] 偵測到領地無建造權:${s.trim()} → 停止並回報 no_permission`);
            if (typeof stopFn === 'function') { try { stopFn(); } catch (_) { } }
        }
    };
    bot.on('message', onMsg);
    return { hit: () => hit, dispose: () => bot.off('message', onMsg) };
}

// teleportToSite 在開工前把 bot 傳送到現場。warp 可為:
//   - 原始指令(以 / 開頭):/server 3、/tpc 100 64 200、/warp xxx → 直接 chat。
//   - 純 warp 名稱:走 mcFallout.warp(含 GUI/重試,較可靠)。
async function teleportToSite(wms, bot, warp) {
    const cmd = (warp == null ? '' : String(warp)).trim();
    if (!cmd) {
        wms.log(true, 'WARN', bot.username, `[worker] 未指定傳送點,就地開始`);
        return;
    }
    if (cmd.startsWith('/')) {
        wms.log(true, 'INFO', bot.username, `[worker] 傳送到現場: ${cmd}`);
        bot.chat(cmd);
        await sleep(5000);
        bot.chat(cmd);      // 廢土 warp 偶爾吞指令,送兩次保險
        await sleep(5000);
    } else {
        const mcFallout = require('../mcFallout'); // lazy-require 避免循環依賴
        wms.log(true, 'INFO', bot.username, `[worker] warp 到現場: ${cmd}`);
        try {
            await mcFallout.warp(bot, cmd, 8000);
        } catch (e) {
            wms.log(true, 'WARN', bot.username, `[worker] warp ${cmd} 失敗: ${e.message}`);
        }
    }
}

// 單元 payload 可能在 order 頂層 / order.unit / order.extra_info,寬鬆取用。
function getUnit(order) {
    return order.unit || order.extra_info || order;
}

function resolveMode(order, unit, fallback) {
    return order.mode || unit.mode || fallback;
}

// ── build: 由 unit.blocks 組記憶體 schematic(project)────────────────────────
// blocks: [{ relX, relY, relZ, name, props }];name 帶不帶 "minecraft:" 皆可。
// 回傳 lib/schematic 的 sch 實例(與 loadFromFile 同型),供 build_project 直接吃。
function buildProjectFromUnit(unit) {
    const schematic = require('../schematic');
    const blocks = Array.isArray(unit.blocks) ? unit.blocks : [];
    if (blocks.length === 0) return null;

    // WMS 契約用 snake_case(rel_x,與 order_id/bot_name 一致);兼容駝峰 relX 以防萬一。
    const rx = b => (b.rel_x ?? b.relX) | 0;
    const ry = b => (b.rel_y ?? b.relY) | 0;
    const rz = b => (b.rel_z ?? b.relZ) | 0;

    let mx = 0, my = 0, mz = 0;
    for (const b of blocks) {
        mx = Math.max(mx, rx(b));
        my = Math.max(my, ry(b));
        mz = Math.max(mz, rz(b));
    }
    const sch = schematic.newSchematic(`wms_${unit.job_id || 'unit'}`, mx + 1, my + 1, mz + 1);
    for (const b of blocks) {
        let name = b.name;
        if (typeof name === 'string' && !name.startsWith('minecraft:')) name = 'minecraft:' + name;
        // props 同時放 Properties(下游讀取用)與 p(getPaletteIndex 去重用),確保
        // 同名不同朝向的方塊得到不同 palette entry。
        const props = b.props || b.Properties || undefined;
        sch.setBlock(rx(b), ry(b), rz(b), { Name: name, Properties: props, p: props });
    }
    return sch;
}

// build 單元 → litematicPrinter cfg。強制 wms 領料,不讀本地 station。
async function buildCfgFromUnit(order, unit, mode) {
    const placement = unit.placement || { x: 0, y: 0, z: 0 };
    // building 是分層建造,該單元的世界 Y 以 unit.layer 為準(report §4.1);
    // mapart 是扁平,直接用 placement.y。
    const placeY = (mode === 'building' && unit.layer != null) ? unit.layer : placement.y;
    // 切片(單元)名稱用 WMS 的 unit_id:精簡、每層唯一、且重派時不變。
    // 不用 order_id(UUID 又臭又長,且重派換新訂單會變動 → 快取失效無法續建)。
    const tag = unit.unit_id || unit.job_id || order.order_id || 'unit';

    // 材料替換 / 忽略:沿用本機建造設定(config/global/lp.json 的 replaceMaterials),
    // 與一般 /lp build 完全一致 —— [from, to] 把某材料換成別的,或換成 "air" 來忽略。
    // 另外 WMS 單元可帶:unit.replace_materials([[from,to],...] 追加)、unit.ignore([name,...] 換成 air)。
    // ignoreShulkerBox:略過所有 shulker_box 變體(共 17 種,不必逐色列進 replaceMaterials)。
    let replaceMaterials = [];
    let ignoreShulkerBox = false;
    try {
        const lpGlobal = await readConfig(`${process.cwd()}/config/global/lp.json`);
        if (Array.isArray(lpGlobal?.replaceMaterials)) replaceMaterials = lpGlobal.replaceMaterials.slice();
        if (lpGlobal?.ignoreShulkerBox) ignoreShulkerBox = true;
    } catch (_) { /* 無設定檔則只用 WMS 帶的 */ }
    if (Array.isArray(unit.replace_materials)) {
        for (const pair of unit.replace_materials) {
            if (Array.isArray(pair) && pair.length >= 2) replaceMaterials.push([pair[0], pair[1]]);
        }
    }
    if (Array.isArray(unit.ignore)) {
        for (const name of unit.ignore) {
            if (typeof name === 'string' && name) replaceMaterials.push([name, 'air']);
        }
    }
    if (typeof unit.ignore_shulker_box === 'boolean') ignoreShulkerBox = unit.ignore_shulker_box; // WMS 單元可覆寫

    return {
        bot_id: botId(),
        materialsMode: 'wms',
        server: unit.server ?? order.server,   // 缺則由模組沿用當前分流
        warp: unit.warp || null,               // 現場傳點(復位時使用,無則 null)
        replaceMaterials,
        ignoreShulkerBox,
        schematic: {
            folder: '',
            // filename 唯一 → build_cache hash 不同 → 自動視為新任務;
            // 同單元重派時 unit_id 不變 → hash 相同 → 從快取續建(冪等)。
            filename: `wms_${tag}`,
            placementPoint_x: placement.x,
            placementPoint_y: placeY,
            placementPoint_z: placement.z,
            // 整體投影大小:後端傳入整張 project 的 XYZ 尺寸,供 litematicPrinter 用作座標邊界。
            // 缺少時 litematicPrinter 回退到本單元 schematic 的 EnclosingSize(較小)。
            totalSize: unit.overall_size ?? null,
        },
    };
}

// ── clear: 由 unit.child 設定 area 作用範圍(縮成單一 child)─────────────────
// 以本機 clearArea.json 作為 supportblock / collect / dig 清單的基底,再用單元覆寫
// area 邊界與分流;強制 materialsMode:'wms'。
async function clearCfgFromUnit(order, unit) {
    let base = {};
    try {
        base = await readConfig(`${process.cwd()}/config/${botId()}/clearArea.json`) || {};
    } catch (_) { base = {}; }

    const child = unit.child || {};
    const p1 = child.p1 || unit.p1;
    const p2 = child.p2 || unit.p2;

    const collect = Object.assign(
        { enable: true, frequency: 'high', excludeList: [] },
        base.collect || {},
        unit.collect || {},
    );
    // excludeList 內每個名稱稍後會 mcData.itemsByName[name].id,無效名稱會讓模組丟錯;
    // 這裡只保留字串,真正驗證留給模組(WMS 應傳合法名稱)。

    return {
        bot_id: botId(),
        materialsMode: 'wms',
        area: {
            warp: unit.warp ?? base.area?.warp ?? '',
            server: unit.server ?? base.area?.server,
            p1, p2,
        },
        config: base.config || {},
        collect,
        // WMS 單元可指定支撐方塊(worker.toml [clear]);缺則退回 bot 本地 clearArea.json。
        supportblock: unit.supportblock || base.supportblock || 'slime_block',
        borderSupportBlock: unit.border_support_block || base.borderSupportBlock || base.supportblock || 'slime_block',
        netherSupportblock: base.netherSupportblock || '',
        digExcludeList: base.digExcludeList,
        digLiquidList: base.digLiquidList,
        digWaterloggedList: base.digWaterloggedList,
        xpFarm: base.xpFarm,
    };
}

// ── 進度橋接 ─────────────────────────────────────────────────────────────────
// 輪詢合成 task 的 detail,推回 onProgress(TUI/詳情)並 best-effort 回報 WMS。
//
// keepalive:WMS 會在 work order 內給 progress_interval_sec(建議回報間隔);bot 至少
// 這麼頻繁地送一次 progress 當存活訊號,否則 WMS(watchdog)會判定失聯並自動重派此單元。
// 因此即使 detail 沒變化,只要超過心跳間隔也要回報一次。
function startProgressBridge(wms, order, unit, progressTask, fn, mode, onProgress, stopFn) {
    const jobId = unit.job_id || order.order_id;
    const intervalSec = unit.progress_interval_sec ?? order.progress_interval_sec;
    const keepaliveMs = (intervalSec > 0) ? intervalSec * 1000 : DEFAULT_KEEPALIVE_MS;
    const opStartedAt = Date.now();   // 本 clear/build 單元的開工時間(供 TUI 來源行顯示「本單元運行多久」)
    let lastSig = '';
    let lastReportAt = 0;
    let stopSignaled = false;   // 已收到 WMS 的 stop 指令並停過一次(避免重複觸發)

    // force=true:不論是否變化都回報(開工 / 收工 / 心跳到期)。
    const tick = (force = false) => {
        const detail = progressTask.detail;
        // 統一抽出 placed/total/percent(build 與 clear 的 detail 形狀不同;尚無 detail 時為 null)。
        let placed = null, total = null, percent = null;
        if (detail) {
            const pl = detail.payload || {};
            if (pl.blocks) {                       // build
                placed = pl.blocks.placed; total = pl.blocks.total; percent = pl.blocks.percent;
            } else if (pl.overall) {               // clear
                percent = pl.overall.percent;
            }
        }
        const status = detail ? detail.status : 'starting';
        const sig = `${status}|${placed}|${total}|${percent}`;
        const changed = sig !== lastSig;
        lastSig = sig;

        // TUI / task.detail:只在變化時透傳,避免洗版。
        // 把建造/清理模組寫的「整張子 detail」(type: litematic / mapart / cleararea)一併透傳;
        // warehouse 端會直接把它設成 task.detail 並補上 WMS 來源資訊,讓 TUI 渲染出 clear/build
        // 自己的細節,而非只看到 WMS 那張。子 detail 尚未產生時為 null,warehouse 會退回 WMS detail。
        if (changed && typeof onProgress === 'function') {
            try {
                onProgress({
                    worker: { jobId, function: fn, mode, status, placed, total, percent },
                    subDetail: detail || null,
                    opStartedAt,
                });
            } catch (_) { }
        }

        // WMS progress 回報:變化時即時回報;無變化時也維持 keepalive 心跳。
        // best-effort;失敗不影響建造/清理。
        const now = Date.now();
        if (force || changed || now - lastReportAt >= keepaliveMs) {
            lastReportAt = now;
            wms.reportProgress(order.order_id, {
                job_id: jobId, function: fn, mode, placed, total, percent,
            }).then(res => {
                // WMS 回應 stop=true:此單元已被後台標記完成/取消/改派,或訂單已清除 →
                // 主動停止目前的建造/清理,不再做白工(reason: unit_delivered/cancel/error/reassigned/gone)。
                if (res && res.stop && !stopSignaled) {
                    stopSignaled = true;
                    wms.log(true, 'WARN', wms.bot_name || '', `[worker] 單元 ${unit.unit_id || jobId} 已被標記結束(${res.reason || 'stop'}),主動停止`);
                    if (typeof stopFn === 'function') { try { stopFn(); } catch (_) { } }
                }
            }).catch(() => { });
        }
    };

    tick(true);  // 開工即送一次,讓 WMS 盡早收到存活訊號(起算 keepalive)。
    const timer = setInterval(tick, PROGRESS_POLL_MS);
    return () => { clearInterval(timer); tick(true); };
}

// ── 入口 ─────────────────────────────────────────────────────────────────────
async function executeBuild(wms, bot, order, onProgress) {
    const litematicPrinter = require('../litematicPrinter');
    const unit = getUnit(order);
    const mode = resolveMode(order, unit, 'building');

    if (mode === 'redstone') {
        // model_redstone_build 目前是 stub(throw)。先明確擋掉,避免把整個 order 流程帶崩。
        wms.log(true, 'WARN', bot.username, `[worker] build/redstone 尚未實作 (model_redstone_build stub),跳過 ${order.order_id}`);
        return false;
    }

    const project = buildProjectFromUnit(unit);
    if (!project) {
        wms.log(true, 'WARN', bot.username, `[worker] build 單元無方塊資料,跳過 ${order.order_id}`);
        return false;
    }
    const cfg = await buildCfgFromUnit(order, unit, mode);
    const model = mode === 'mapart' ? litematicPrinter.model_mapart : litematicPrinter.model_building;

    wms.log(true, 'INFO', bot.username, `[worker] build/${mode} job=${unit.job_id || order.order_id} blocks=${project.Metadata.TotalBlocks} @${cfg.schematic.placementPoint_x},${cfg.schematic.placementPoint_y},${cfg.schematic.placementPoint_z}`);

    // 開工前先傳送到現場(必填)。
    await teleportToSite(wms, bot, unit.warp ?? order.warp);

    const stopBuild = () => litematicPrinter.stop();
    const progressTask = {};
    // stopFn:WMS 通知此單元已結束時主動停掉建造(lpCtrl.stop → buildLoop 偵測 stopped 後返回)。
    const stop = startProgressBridge(wms, order, unit, progressTask, 'build', mode, onProgress, stopBuild);
    // 監聽領地無建造權:偵測到就停止建造,結束後回報 no_permission(WMS 標 error 不重派)。
    const noPerm = watchNoPermission(wms, bot, stopBuild);
    try {
        const r = await litematicPrinter.build_project(progressTask, bot, model, cfg, project);
        if (noPerm.hit()) {
            await wms.reportFail(order.order_id, 'no_permission');
            return false;
        }
        if (r === 'stuck') {
            // 連續補料零進度(背包/視窗/世界 desync)→ 交 WMS 重派給狀態乾淨的 bot。
            await wms.reportFail(order.order_id, 'stuck');
            return false;
        }
        return r;
    } finally {
        noPerm.dispose();
        stop();
        // 收工返回倉庫(best-effort,不影響建造結果)。
        try { await wms.gotoWarehouse(bot); } catch (e) { wms.log(true, 'WARN', bot.username, `[worker] 收工返回倉庫失敗: ${e.message}`); }
    }
}

async function executeClear(wms, bot, order, onProgress) {
    const { area } = require('../area/area');
    const unit = getUnit(order);
    const mode = resolveMode(order, unit, 'tnt');

    const cfg = await clearCfgFromUnit(order, unit);
    if (!cfg.area.p1 || !cfg.area.p2) {
        wms.log(true, 'WARN', bot.username, `[worker] clear 單元缺 child 邊界,跳過 ${order.order_id}`);
        return false;
    }

    const fnMap = { tnt: 'tntclear', tnt2: 'tnt2clear', dig: 'digclear', digclear: 'digclear' };
    const method = fnMap[mode];
    if (!method || typeof area[method] !== 'function') {
        wms.log(true, 'WARN', bot.username, `[worker] 不支援的 clear mode: ${mode}`);
        return false;
    }

    wms.log(true, 'INFO', bot.username, `[worker] clear/${mode} job=${unit.job_id || order.order_id} p1=${JSON.stringify(cfg.area.p1)} p2=${JSON.stringify(cfg.area.p2)} server=${cfg.area.server}`);

    // 開工前先傳送到現場(必填)。
    await teleportToSite(wms, bot, unit.warp ?? order.warp ?? cfg.area.warp);

    const stopClear = () => { if (area.ctrl && typeof area.ctrl.stop === 'function') area.ctrl.stop(); };
    const progressTask = {};
    // stopFn:WMS 通知此單元已結束時主動停掉清理(areaCtrl.stop → 各 clear 迴圈偵測 stopped 後返回)。
    const stop = startProgressBridge(wms, order, unit, progressTask, 'clear', mode, onProgress, stopClear);
    // 監聽領地無權(清理區若落在他人領地):偵測到就停止,結束後回報 no_permission。
    const noPerm = watchNoPermission(wms, bot, stopClear);
    try {
        const r = await area[method](bot, cfg, progressTask);
        if (noPerm.hit()) {
            await wms.reportFail(order.order_id, 'no_permission');
            return false;
        }
        return r;
    } finally {
        noPerm.dispose();
        stop();
        // 收工返回倉庫(best-effort,不影響清理結果)。
        try { await wms.gotoWarehouse(bot); } catch (e) { wms.log(true, 'WARN', bot.username, `[worker] 收工返回倉庫失敗: ${e.message}`); }
    }
}

module.exports = {
    getUnit,
    buildProjectFromUnit,
    buildCfgFromUnit,
    clearCfgFromUnit,
    executeBuild,
    executeClear,
};
