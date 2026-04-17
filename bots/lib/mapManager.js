function createMapManager() {
    return {
        init(bot) {
            bot.mapManager = this
        }
    }
}

module.exports = createMapManager
