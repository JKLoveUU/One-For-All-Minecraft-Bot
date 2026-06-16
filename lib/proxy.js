// 手動 proxy 支援：在 profiles.json 內以 "proxy" 欄位設定，無 TUI 介面。
//
// 支援兩種寫法（擇一）：
//   1. URL 字串： "proxy": "socks5://user:pass@127.0.0.1:1080"
//   2. 物件：      "proxy": { "type": "socks5", "host": "127.0.0.1", "port": 1080,
//                              "username": "user", "password": "pass" }
//
// type 支援： socks5(預設) / socks4 / http(CONNECT 隧道)
// 別名： socks→socks5, socks5h→socks5, socks4a→socks4, https→http
//
// 對外只暴露 makeConnect()，回傳可直接塞進 mineflayer.createBot({ connect }) 的函式；
// 若 profile 沒有設定 proxy 則回傳 null（呼叫端不要加 connect 欄位，走原生直連）。

const net = require('net')
const dns = require('dns')

const TYPE_ALIASES = {
  socks: 'socks5',
  socks5h: 'socks5',
  socks4a: 'socks4',
  https: 'http',
}

function normalize(p) {
  if (!p || !p.host) return null
  let type = String(p.type || 'socks5').toLowerCase()
  type = TYPE_ALIASES[type] || type
  if (!['socks5', 'socks4', 'http'].includes(type)) return null
  const defaultPort = type === 'http' ? 8080 : 1080
  return {
    type,
    host: String(p.host),
    port: Number(p.port) || defaultPort,
    username: p.username || p.userId || undefined,
    password: p.password || undefined,
  }
}

// 把 profile 內的 proxy 設定（字串或物件）解析成標準化物件，失敗回傳 null。
function parseProxy(input) {
  if (!input) return null
  if (typeof input === 'string') {
    const str = input.trim()
    if (!str) return null
    let u
    try {
      u = new URL(str)
    } catch (_) {
      return null
    }
    return normalize({
      type: u.protocol.replace(/:$/, ''),
      host: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    })
  }
  if (typeof input === 'object') return normalize(input)
  return null
}

// 判斷使用者是否「有意」設定 proxy（即使設錯也算有意）。
// 空字串 / null / undefined / false 視為沒設定；其餘（含空物件、亂填字串）皆視為有意設定。
function isProxyConfigured(input) {
  if (input == null || input === false) return false
  if (typeof input === 'string') return input.trim().length > 0
  // 物件只要存在就算「有意設定」（即使是空物件 {} 也代表使用者開始填了），
  // 交給 parseProxy 判定有效性，無效則 fail-closed。
  if (typeof input === 'object') return true
  return false
}

// 回傳設定狀態：'none'(沒設定，走直連) / 'invalid'(有設定但解析失敗，必須 fail-closed) / 'ok'
function proxyState(input) {
  if (!isProxyConfigured(input)) return 'none'
  return parseProxy(input) ? 'ok' : 'invalid'
}

// 顯示用字串（隱藏密碼）
function describeProxy(input) {
  const p = parseProxy(input)
  if (!p) return null
  const auth = p.username ? `${p.username}:***@` : ''
  return `${p.type}://${auth}${p.host}:${p.port}`
}

// 複製原生 tcp_dns 的 SRV 解析行為：port 為 25565 且 host 是網域時先查 SRV，
// 否則直接使用原 host/port。最終 (host, port) 交給 proxy 連線。
function resolveDestination(host, port, cb) {
  const numPort = Number(port) || 25565
  if (numPort === 25565 && net.isIP(host) === 0 && host !== 'localhost') {
    dns.resolveSrv('_minecraft._tcp.' + host, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        cb(addresses[0].name, addresses[0].port)
      } else {
        cb(host, numPort)
      }
    })
  } else {
    cb(host, numPort)
  }
}

// 透過 SOCKS 代理建立到目標的連線，回傳已連線的 socket。
function openSocks(p, host, port) {
  const { SocksClient } = require('socks')
  return SocksClient.createConnection({
    proxy: {
      host: p.host,
      port: p.port,
      type: p.type === 'socks4' ? 4 : 5,
      userId: p.username,
      password: p.password,
    },
    command: 'connect',
    destination: { host, port },
    timeout: 30_000,
  }).then((info) => info.socket)
}

// 透過 HTTP CONNECT 隧道建立到目標的連線。
function openHttpConnect(p, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(p.port, p.host)
    let buf = Buffer.alloc(0)
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(err)
    }
    socket.once('error', fail)
    socket.setTimeout(30_000, () => fail(new Error('HTTP proxy connect timeout')))
    socket.on('connect', () => {
      let req = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`
      if (p.username) {
        const cred = Buffer.from(`${p.username}:${p.password || ''}`).toString('base64')
        req += `Proxy-Authorization: Basic ${cred}\r\n`
      }
      req += 'Connection: keep-alive\r\n\r\n'
      socket.write(req)
    })
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const end = buf.indexOf('\r\n\r\n')
      if (end === -1) return // 等表頭收完
      const head = buf.slice(0, end).toString('utf8')
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(head)
      if (status && status[1] === '200') {
        settled = true
        socket.removeListener('data', onData)
        socket.removeListener('error', fail)
        socket.setTimeout(0)
        // 理論上 200 後 proxy 不會搶先送資料，但保險起見把殘餘 bytes 退回 stream
        const rest = buf.slice(end + 4)
        if (rest.length) socket.unshift(rest)
        resolve(socket)
      } else {
        fail(new Error(`HTTP proxy CONNECT failed: ${head.split('\r\n')[0] || 'unknown response'}`))
      }
    }
    socket.on('data', onData)
  })
}

// 依 proxy 設定建立 mineflayer 的 connect 函式。
// dest = { host, port } 為「最終要連的 Minecraft 伺服器」(與 createBot 的 host/port 相同)。
// 回傳 null 表示沒設定 proxy，呼叫端應走原生直連（不要傳 connect）。
function makeConnect(proxyInput, dest = {}) {
  const p = parseProxy(proxyInput)
  if (!p) return null
  return function connect(client) {
    resolveDestination(dest.host, dest.port, (host, port) => {
      const opener = p.type === 'http' ? openHttpConnect : openSocks
      opener(p, host, port)
        .then((socket) => {
          client.setSocket(socket)
          client.emit('connect')
        })
        .catch((err) => {
          client.emit('error', err)
        })
    })
  }
}

module.exports = { parseProxy, describeProxy, makeConnect, isProxyConfigured, proxyState }
