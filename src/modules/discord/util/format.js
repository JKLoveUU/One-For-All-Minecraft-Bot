function fmtBytes(n) {
    if (!Number.isFinite(n)) return '-';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + 'GB';
    if (n >= 1048576)    return (n / 1048576).toFixed(1) + 'MB';
    if (n >= 1024)       return (n / 1024).toFixed(0) + 'KB';
    return n + 'B';
}

function fmtUptime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '-';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d${h}h${m}m`;
    if (h > 0) return `${h}h${m}m`;
    return `${m}m${s % 60}s`;
}

module.exports = { fmtBytes, fmtUptime };
