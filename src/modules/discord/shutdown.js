// 統一的關閉 hook：由 index.js 注入實際行為，panels/commands 觸發時都走這個入口。

let _handler = null;

function setShutdownHandler(fn) { _handler = fn; }
async function runShutdown() { if (_handler) await _handler(); }

module.exports = { setShutdownHandler, runShutdown };
