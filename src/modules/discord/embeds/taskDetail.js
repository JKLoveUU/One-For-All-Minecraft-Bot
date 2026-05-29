const { fmtUptime } = require('../util/format');

function fmtTaskDetail(runingTask) {
    if (!runingTask || typeof runingTask !== 'object') return null;
    const detail = runingTask.detail;
    if (!detail || !detail.type) return null;
    const p   = detail.payload || {};
    const v   = (x) => (x == null || x === '-' || x === '') ? '-' : x;
    const pct = (x) => x != null ? `${x}%` : '-';
    switch (detail.type) {
        case 'autoquest': {
            const prog = (p.progress && p.progress.total)
                ? `${p.progress.done}/${p.progress.total}` : '-';
            return `\`${detail.state || '-'}\` ${v(p.questName)}\n進度 \`${prog}\`  獎勵 \`${v(p.reward)}\`  期限 ${v(p.remain)}`;
        }
        case 'cleararea': {
            const overall = p.overall || {};
            const yRange = (p.layerYTop != null && p.layerYBottom != null)
                ? `${p.layerYTop}~${p.layerYBottom}` : '-';
            return `\`${detail.status || '-'}\`  Y \`${yRange}\`  整體 \`${pct(overall.percent)}\`  ~\`${v(overall.etaMs ? fmtUptime(overall.etaMs) : null)}\``;
        }
        case 'villager': {
            const JOB = { iron:'鐵村民', melonpumpkin:'雙瓜', train:'訓練', cure:'治療', put:'放置' };
            const ST  = { trading:'交易中', restocking:'補貨', navigate:'導航', no_iron:'鐵不足', placing:'放置中' };
            const showEarn = detail.job === 'melonpumpkin' || detail.job === 'iron';
            const earnStr = showEarn && p.totalEarn != null
                ? `💎\`${p.totalEarn}\`  ~\`${p.earnPerMin ?? '-'}/min\`  ~\`${p.earnPerHour ?? '-'}/hr\``
                : `💎\`-\``;
            const pairStr = `交易:\`${v(p.tradePairs) || '-'}\``;
            const chunkStr = p.chunkName ? `區:\`${p.chunkName}\` \`${v(p.villagerCount) ?? '?'}v\`` : `區:\`-\``;
            return `\`${JOB[detail.job] || detail.job || '-'}\`  \`${ST[detail.status] || detail.status || '-'}\`  s${v(p.server)} ${v(p.warp)}\n${earnStr}  ${pairStr}  ${chunkStr}`;
        }
        case 'warehouse': {
            const ST = { standby:'待機', idle:'空閒', fetching:'查詢', executing:'執行',
                         depositing:'入庫', depositing_picking:'入庫(揀)', withdrawing:'出貨',
                         updating_barrels:'更新桶', stopped:'已停止' };
            const st = ST[detail.status] || detail.status || '-';
            const order = p.currentOrder;
            if (!order) return `\`${st}\``;
            if (order.optype === 'transfer') {
                const live = p.transferLive || {};
                const rem  = live.count === -1 ? '∞' : v(live.remaining);
                const side = live.side === 'buy' ? '購買中' : live.side === 'sell' ? '出售中' : '-';
                return `\`${st}\`  搬運 \`${side}\`  剩餘 \`${rem}\`\n買 \`${live.buyTrips ?? 0}趟/${live.buyQty ?? 0}個\`  賣 \`${live.sellTrips ?? 0}趟/${live.sellQty ?? 0}個\``;
            }
            const OP = { deposit:'入庫', withdraw:'出貨', fix:'修復', buy_at_shop:'購買', unpacking:'拆箱', packing:'裝箱' };
            const item = order.firstItem ? `${order.firstItem.item}×${order.firstItem.quantity}` : '-';
            return `\`${st}\`  ${OP[order.optype] || order.optype}  ${item}`;
        }
        case 'mapart':
        case 'litematic': {
            const blocks = p.blocks || {};
            return `\`${detail.status || '-'}\`  \`${v(blocks.placed)}/${v(blocks.total)}\` (${pct(blocks.percent)})  ETA \`${v(p.etaMs ? fmtUptime(p.etaMs) : null)}\``;
        }
        default:
            return `\`${detail.type}\``;
    }
}

module.exports = { fmtTaskDetail };
