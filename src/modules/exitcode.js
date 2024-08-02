/**
 * 這裡一定要改 linux 只支持0-255
 */
const exitcode = {
  0: "success",
  1: "general error",
  2: "misuse of shell builtins",
  1000: "unknown error",
  1001: "server reload",
  1002: "client reload",
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

module.exports = exitcode;
