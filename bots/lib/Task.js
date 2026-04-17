class Task {
    priority = 10;
    displayName = '';
    source = '';
    content = '';
    timestamp = Date.now();
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
