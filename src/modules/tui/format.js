// 純格式化 / 著色 helper（無狀態，由 tui.js 抽出，跨模組共用）
const { T } = require('./theme')

    function statusColor(status) {
        const s = String(status || '').toLowerCase()
        if (!status) return T.muted
        if (s.includes('error') || s.includes('fail') || s.includes('closed')) return T.error
        if (s.includes('login') || s.includes('connect') || s.includes('joining')) return T.warning
        if (s.includes('ready') || s.includes('online') || s.includes('running')) return T.success
        return T.subtext
    }
    function isMissing(v) { return v == null || v === '-' || v === '' || v === -1 || v === '-1' }
    function val(v)       { return isMissing(v) ? '-' : v }
    function fmtTask(t) {
        if (isMissing(t)) return '-'
        if (typeof t !== 'object') return '-'                   // reject booleans, numbers etc
        if (typeof t.displayName === 'string' && t.displayName) return t.displayName
        if (typeof t.name        === 'string' && t.name)        return t.name
        if (typeof t.type        === 'string' && t.type)        return t.type
        if (Array.isArray(t.content) && t.content.length)       return t.content.join(' ')
        return '-'
    }
    function fmtPos(p) {
        if (!p || typeof p !== 'object') return '-'
        const x = Number(p.x), y = Number(p.y), z = Number(p.z)
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            return `${x | 0}, ${y | 0}, ${z | 0}`
        }
        return '-'
    }
    function ageSec(t) {
        return t ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null
    }
    function fmtEta(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return '-'
        const s = Math.round(ms / 1000)
        if (s < 60) return `${s}s`
        const m = Math.floor(s / 60), ss = s % 60
        if (m < 60) return `${m}m${ss}s`
        const h = Math.floor(m / 60), mm = m % 60
        return `${h}h${mm}m`
    }

module.exports = { isMissing, val, fmtTask, fmtPos, ageSec, fmtEta, statusColor }
