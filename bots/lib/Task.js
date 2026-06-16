class Task {
    priority = 10;
    displayName = '';
    source = '';
    content = '';
    timestamp = Date.now();
    startedAt = null;        // 任務實際開工時間 (taskManager.loop 執行前設定);供 TUI 顯示運行時間
    sendNotification = true;
    minecraftUser = '';
    discordUser = null;

    /**
     * @param {number} priority
     * @param {string} displayName
     * @param {string} source AcceptSource: console, minecraft-dm, discord
     * @param {string[]} content
     * @param {Date} timestamp
     * @param {boolean} sendNotification
     * @param {string | null} minecraftUser
     * @param {string | null} discordUser
     */
    constructor(priority = 10, displayName = '未命名', source = '', content = '', timestamp = Date.now(), sendNotification = true, minecraftUser = '', discordUser = null) {
        this.priority = priority;
        this.displayName = displayName;
        this.source = source;
        this.content = content;
        this.timestamp = timestamp;
        this.sendNotification = sendNotification;
        this.minecraftUser = minecraftUser;
        this.discordUser = discordUser;
    }
}

module.exports = Task
