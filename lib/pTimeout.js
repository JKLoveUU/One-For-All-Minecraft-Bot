// p-timeout v4+ is ESM-only; this wrapper bridges CommonJS callers to v7
let _pTimeout = null;

async function pTimeout(promise, ms) {
    if (!_pTimeout) {
        const mod = await import('p-timeout');
        _pTimeout = mod.default;
    }
    return _pTimeout(promise, { milliseconds: ms });
}

module.exports = pTimeout;
