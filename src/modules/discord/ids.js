// CustomId 命名空間與工具
// 格式：<ns>:<action>[:<arg1>[:<arg2>...]]
// 範例：botmenu:refresh / gbcm:reload:JKLoveJK / rbcm:close

const NS = {
    BOTMENU: 'botmenu',
    GBCM:    'gbcm',   // general bot control menu
    RBCM:    'rbcm',   // raid bot control menu
};

function buildCustomId(ns, action, ...args) {
    const parts = [ns, action, ...args.map(String)];
    return parts.join(':');
}

function parseCustomId(customId) {
    if (typeof customId !== 'string' || !customId) return null;
    const parts = customId.split(':');
    if (parts.length < 2) return null;
    const [ns, action, ...args] = parts;
    return { ns, action, args, raw: customId };
}

module.exports = { NS, buildCustomId, parseCustomId };
