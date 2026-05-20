const { sleep } = require('./common')

class TaskController {
    #stopped = false
    #paused = false
    #skipRequested = false

    get stopped() { return this.#stopped }
    get paused() { return this.#paused }
    get skipRequested() { return this.#skipRequested }

    // not stopped (may be paused — use in loops that handle pause internally)
    get running() { return !this.#stopped }

    // not stopped AND not paused (use in loops that exit on pause)
    get active() { return !this.#stopped && !this.#paused }

    stop() { this.#stopped = true; this.#paused = false }
    pause() { this.#paused = true }
    resume() { this.#paused = false }

    // 請求跳過當前處理單元 (palette / layer 等,由消費端決定意義)。
    // 消費端在迴圈內 poll skipRequested,處理完跳過後呼叫 consumeSkip() 清除旗標。
    requestSkip() { this.#skipRequested = true }
    consumeSkip() { const v = this.#skipRequested; this.#skipRequested = false; return v }

    reset() {
        this.#stopped = false
        this.#paused = false
        this.#skipRequested = false
    }

    async waitWhilePaused(intervalMs = 500) {
        while (this.#paused && !this.#stopped) {
            await sleep(intervalMs)
        }
    }
}

module.exports = { TaskController }
