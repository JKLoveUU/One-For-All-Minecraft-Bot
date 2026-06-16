const fs = require('fs')
const path = require('path')
const { saveConfig, configPath } = require('../../lib/common')

// ── 權限節點 ────────────────────────────────────────────────────────────────
// 指令的權限節點:有 cmd.perm 用之,否則由「模組identifier.子指令identifier」自動衍生;
// 頂層 basicCommand 無模組前綴,直接用子指令 identifier。
function derivePermNode(moduleId, cmd) {
    if (!cmd) return null
    if (cmd.perm) return cmd.perm
    const sub = Array.isArray(cmd.identifier) ? cmd.identifier[0] : cmd.identifier
    if (!sub) return moduleId || null
    return moduleId ? `${moduleId}.${sub}` : sub
}

// 萬用字元比對:'*' 全中;'a.*' 命中 'a' 與 'a.xxx';否則需完全相符。
function matchNode(granted, required) {
    if (!required) return true
    if (granted === '*' || granted === required) return true
    if (granted.endsWith('.*')) {
        const prefix = granted.slice(0, -2)
        return required === prefix || required.startsWith(prefix + '.')
    }
    return false
}

function hasPermission(nodeSet, required) {
    if (!required) return true
    for (const g of nodeSet) if (matchNode(g, required)) return true
    return false
}

// ── 身分組 / 玩家解析 ────────────────────────────────────────────────────────
function expandGroups(groupNames, groupsCfg, acc) {
    for (const g of groupNames || []) {
        const nodes = groupsCfg[g]
        if (Array.isArray(nodes)) for (const n of nodes) acc.add(n)
    }
}

// 回傳玩家有效權限節點 Set。來源:預設組 ∪ 靜態 members ∪ 既有 whitelist(→admin 相容)
// ∪ 未過期臨時授權組。
function resolveNodes(playerID, config, grantStore) {
    const perm = (config && config.permission) || {}
    const groups = perm.groups || {}
    const acc = new Set()

    expandGroups([perm.default_group || 'guest'], groups, acc)

    const members = perm.members || {}
    if (Array.isArray(members[playerID])) expandGroups(members[playerID], groups, acc)

    const wl = config && config.setting && config.setting.whitelist
    if (Array.isArray(wl) && wl.includes(playerID)) expandGroups(['admin'], groups, acc)

    if (grantStore) expandGroups(grantStore.activeGroupsFor(playerID), groups, acc)

    return acc
}

// ── 時長解析 ─ "30s"/"30m"/"2h"/"1d";純數字視為分鐘;無單位 m。回傳毫秒,失敗 null。
function parseDuration(str) {
    if (str == null) return null
    const m = String(str).trim().match(/^(\d+)\s*(s|m|h|d)?$/i)
    if (!m) return null
    const n = parseInt(m[1], 10)
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[(m[2] || 'm').toLowerCase()]
    return n * mult
}

// ── 臨時授權儲存(單 bot、持久、到期)──────────────────────────────────────────
// 檔案:config/<botId>/permissions.json,形如
//   { "grants": [ { player, group, expiresAt(ms,0=永久) } ] }
// 建構時同步讀檔(沒檔就空),變更時非同步寫回;讀取/檢查時剔除過期項。
function createGrantStore(botId) {
    const file = configPath(botId, 'permissions.json')
    let data = { grants: [] }
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (parsed && Array.isArray(parsed.grants)) data = parsed
    } catch (_) { /* 沒檔 / 壞檔 → 空 */ }

    const store = {
        prune() {
            const now = Date.now()
            data.grants = data.grants.filter(g => g && (!g.expiresAt || g.expiresAt > now))
            return data.grants
        },
        async save() {
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true })
                await saveConfig(file, data)
            } catch (_) {}
        },
        async add(player, group, durationMs) {
            this.prune()
            const expiresAt = durationMs ? Date.now() + durationMs : 0
            data.grants = data.grants.filter(g => !(g.player === player && g.group === group))
            data.grants.push({ player, group, expiresAt })
            await this.save()
        },
        async revoke(player) {
            this.prune()
            const before = data.grants.length
            data.grants = data.grants.filter(g => g.player !== player)
            await this.save()
            return before - data.grants.length
        },
        activeGroupsFor(player) {
            this.prune()
            return data.grants.filter(g => g.player === player).map(g => g.group)
        },
        list() { return this.prune().slice() },
    }
    store.prune()
    return store
}

module.exports = {
    derivePermNode,
    matchNode,
    hasPermission,
    resolveNodes,
    parseDuration,
    createGrantStore,
}
