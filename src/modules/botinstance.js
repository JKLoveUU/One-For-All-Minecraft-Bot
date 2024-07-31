class BotInstance {
  constructor(name, childProcess, type, crtType, reloadCD, debug, chat) {
    this.name = name;
    this.childProcess = childProcess;
    this.logTime = new Date();
    this.status = 0;
    this.type = type;
    this.crtType = crtType;
    this.reloadCD = reloadCD;
    this.debug = !!debug;
    this.chat = !!chat;
  }
}

module.exports = BotInstance;