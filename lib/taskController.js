const { sleep } = require('./common')

class TaskController {
    #stopped = false
    #paused = false

    get stopped() { return this.#stopped }
    get paused() { return this.#paused }

    // not stopped (may be paused — use in loops that handle pause internally)
    get running() { return !this.#stopped }

    // not stopped AND not paused (use in loops that exit on pause)
    get active() { return !this.#stopped && !this.#paused }

    stop() { this.#stopped = true; this.#paused = false }
    pause() { this.#paused = true }
    resume() { this.#paused = false }

    reset() {
        this.#stopped = false
        this.#paused = false
    }

    async waitWhilePaused(intervalMs = 500) {
        while (this.#paused && !this.#stopped) {
            await sleep(intervalMs)
        }
    }
}

module.exports = { TaskController }
