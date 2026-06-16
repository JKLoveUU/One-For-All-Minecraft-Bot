// 綠寶石入金(server 經濟 /pay)監聽。
//
// 玩家在遊戲內用 /pay <bot> 付綠寶石 → bot 解析收款聊天(付款者 + 金額)→ 回報 WMS。
//   - 已綁定 → WMS CreditWallet 入帳。
//   - 未綁定 / 查無 → 立即 /pay 退款 + 私訊提示先 /link。
//   - 連線/系統錯誤 → 保留款項並通知(不亂退,避免與「其實已入帳」重複)。
//
// 冪等鍵 ref 取自「整段收款訊息」的雜湊:mcfallout 的訊息含「(目前擁有 N 綠寶石)」當前餘額,
// 故兩筆真實付款文字必不同 → ref 不同;同一則訊息被重複觸發則文字相同 → ref 相同,
// WMS 端以 ref 去重(回 duplicate:true),這裡據此跳過,避免重複入帳 / 重複退款。

const crypto = require('crypto');

function createDepositIntake(wms, bot, logger) {
    const cfg = wms.cfg || {};
    let regex;
    try {
        regex = new RegExp(cfg.deposit_regex || '您收到了\\s+(\\S+)\\s+轉帳的\\s+([\\d,]+)\\s+綠寶石');
    } catch (e) {
        logger(true, 'ERROR', 'WMS-DEPOSIT', `deposit_regex 無效,入金監聽停用: ${e.message}`);
        return { stop() {} };
    }

    const onMessage = (jsonMsg) => {
        let text;
        try { text = jsonMsg.toString(); } catch (_) { return; }
        const m = text.match(regex);
        if (!m) return;
        const payer = m[1];
        const amount = parseInt(String(m[2]).replace(/,/g, ''), 10);
        if (!payer || payer === bot.username || !Number.isFinite(amount) || amount <= 0) return;
        const ref = `${bot.username}:${crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)}`;
        // 不阻塞訊息事件迴圈;handleDeposit 自行 try/catch。
        handleDeposit(payer, amount, ref).catch(err =>
            logger(true, 'ERROR', 'WMS-DEPOSIT', `handleDeposit 例外: ${err.message}`));
    };

    async function handleDeposit(payer, amount, ref) {
        const mcUUID = bot.players?.[payer]?.uuid || '';

        // 沒連上 / 無權限:無法驗證綁定,保留款項並通知(勿亂退)。
        if (!wms.canServe()) {
            logger(true, 'WARN', 'WMS-DEPOSIT', `收到 ${payer} 入金 ${amount} 但 WMS 未啟用,暫不處理`);
            try { bot.chat(`/m ${payer} 入金系統暫時離線,款項稍後處理,如未入帳請聯繫管理員`); } catch (_) {}
            return;
        }

        logger(true, 'INFO', 'WMS-DEPOSIT', `收到 ${payer} 入金 ${amount}(uuid=${mcUUID || '?'}),回報 WMS…`);
        let res;
        try {
            res = await wms.reportDeposit(payer, mcUUID, amount, ref);
        } catch (e) {
            // 連線/系統錯誤:可能已入帳也可能沒有 → 不退款(避免重複),保留並通知。
            logger(true, 'ERROR', 'WMS-DEPOSIT', `回報入金失敗(保留款項,未退): ${e.message}`);
            try { bot.chat(`/m ${payer} 入金系統忙線,款項稍後處理,如未入帳請聯繫管理員`); } catch (_) {}
            return;
        }

        // 冪等回放(同一則訊息重複觸發):第一次已處理過,這裡不再重複入帳/退款。
        if (res && res.duplicate) {
            logger(false, 'INFO', 'WMS-DEPOSIT', `${payer} 入金為重複事件(ref 已處理),略過`);
            return;
        }

        if (res && res.ok) {
            logger(true, 'INFO', 'WMS-DEPOSIT', `${payer} 入金 ${amount} 已入帳(錢包餘額 ${res.balance})`);
            try { bot.chat(`/m ${payer} 已成功入金 ${amount} 綠寶石,錢包餘額 ${res.balance}`); } catch (_) {}
            return;
        }

        // ok:false → 未綁定 / 查無 → 退款。
        logger(true, 'WARN', 'WMS-DEPOSIT', `${payer} 未綁定(${(res && res.reason) || 'not_linked'}),退款 ${amount}`);
        try {
            bot.chat(`/pay ${payer} ${amount}`);
            bot.chat(`/m ${payer} 你的帳號尚未綁定,已退款 ${amount} 綠寶石,請先在 Discord /link 綁定後再入金`);
        } catch (e) {
            logger(true, 'ERROR', 'WMS-DEPOSIT', `退款 /pay ${payer} ${amount} 失敗: ${e.message}`);
        }
    }

    bot.on('message', onMessage);
    logger(true, 'INFO', 'WMS-DEPOSIT', '綠寶石入金監聽已啟動');
    return { stop() { try { bot.off('message', onMessage); } catch (_) {} } };
}

module.exports = { createDepositIntake };
