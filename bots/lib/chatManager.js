function createChatManager() {
    const chatManager = {
        q: [],
        pq: [],
        cd: 400,
        lastSend: Date.now(),
        bot: null,
        checker: null,
        chat(text) {
            this.q.push(text)
        },
        cmd(text) {
            this.pq.push(text)
        },
        init(bot) {
            this.bot = bot
            bot.chatManager = this
            this.checker = setInterval(() => {
                if (chatManager.q.length == 0 && chatManager.pq.length == 0) return
                if (Date.now() - chatManager.lastSend < chatManager.cd) return
                if (chatManager.pq.length != 0) {
                    chatManager.bot.chat(chatManager.pq.shift())
                    chatManager.lastSend = Date.now()
                    return
                }
                if (chatManager.q.length != 0) {
                    chatManager.bot.chat(chatManager.q.shift())
                    chatManager.lastSend = Date.now()
                    return
                }
            }, 10)
        }
    }
    return chatManager
}

module.exports = createChatManager
