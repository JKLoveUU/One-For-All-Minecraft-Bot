/**
 * 這裡一定要改 linux 只支持0-255
 */
const exitcode = {
  OK: 0, //手動 預期關閉的

  PSR:10 ,    /* proxy server restarting */
  SERVER_RELOAD: 11,
  CUSTOM_QUEST_WAITING: 12,
  
  USAGE: 64, /* command line usage error */
  DATAERR: 65,/* data format error */
  NOINPUT: 66,/* cannot open input */
  NOUSER: 67,/* addressee unknown */
  NOHOST: 68, /* host name unknown */
  UNAVAILABLE: 69, /* service unavailable */
  SOFTWARE: 70, /* internal software error */
  OSERR: 71, /* system error (e.g., can't fork) */
  OSFILE: 72, /* critical OS file missing */
  CANTCREAT: 73,/* can't create (user) output file */
  IOERR: 74, /* input/output error */
  TEMPFAIL: 75,  /* temp failure; user is invited to retry */
  PROTOCOL: 76, /* remote error in protocol */
  NOPERM: 77,  /* permission denied */
  CONFIG: 78,  /* configuration error */


  
  0: "success",
  1: "general error",
  2: "misuse of shell builtins",
  1000: "unknown error",
  1001: "server reload",
  1002: "client reload",
  1003: "login timeout",
  1402: "raid (keepalive)",
  1003: "proxy server restarting",
  1004: "client error reload",
  1900: "RateLimiter disallowed request",
  1901: "Failed to obtain profile data",
  1902: "FetchError: read ECONNRESET(Mojang)",
  1903: "FetchError: read ECONNRESET",
  //  不可重啟類
  2001: "config not found",
  2002: "config err",
  202: "config err",
};
const ec2 = {
  success: 0,
}

module.exports = exitcode;
