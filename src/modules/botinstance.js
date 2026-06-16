class BotInstance {
  constructor(name, childProcess, type, crtType, reloadCD, debug, chat) {
    this.name = name;
    this.childProcess = childProcess;
    this.logTime = new Date();
    this.status = 0;
    this.type = type;
    this.crtType = crtType;
    this.reloadCancel = null;
    this.reloadCD = reloadCD;
    this.debug = !!debug;
    this.chat = !!chat;
    // 累計網路流量(跨子進程 re-fork 存活):committed = 已結束 session 的累加,session = 當前子進程最新回報
    this.trafficCommitted = { rx: 0, tx: 0 };
    this.trafficSession   = { rx: 0, tx: 0 };
    this.trafficRate      = { rx: 0, tx: 0 };  // 即時速率 bytes/s(父進程由總量差分算出)
  }
}

module.exports = BotInstance;