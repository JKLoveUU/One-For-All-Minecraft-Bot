const botstatus = {
  Close: {
    code: 0,
    description: "Closed",
  },
  //  通用區
  0: "Closed", //正常關閉
  1: "free",
  2: "in tasking",
  3: "raid",
  4: "wait Reload CoolDown",
  100: "proxy server restarting",
  1000: "Closed(Profile Not Found)",
  1001: "Closed(Type Not Found)",
  //  Raid 區
  2000: "raid - closed", //unused
  2001: "Restarting",
  2200: "Running",
  2201: "Running(Raid)",
  2401: "Closed(RaidFarm Not Found)",
  //  General 區
  3000: "general - closed", //unused

  3001: "Logging in",
  3002: "Restarting",
  3200: "Running",
  3201: "Running(Idle)",
  3202: "Running(Tasking)",

  //    process.send({ type: 'setStatus', value: 1000 })
};

module.exports = botstatus;
