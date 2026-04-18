# 開發手冊

本文檔用於講解 One-For-All 的架構設計與核心概念。

> 取名來自《我的英雄學院》的 **ONE FOR ALL** — 可繼承的個性，每一代繼承者都把自己的力量疊加進去，再傳給下一代。這個 bot 的模組化理念與之類似：每個功能模組各自完整、可插拔，卻共享同一套底層。

---

## 進程架構總覽

```
┌──────────────────────────────────────────────────────────────┐
│ Parent Process  (index.js)                                   │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  BotManager  │   │   TUI /      │   │   DiscordBot     │  │
│  │              │   │   readline   │   │                  │  │
│  └──────┬───────┘   └──────────────┘   └──────────────────┘  │
│         │                                                    │
│         │ fork()                                             │
└─────────┼────────────────────────────────────────────────────┘
          │
     ┌────┴─────┬──────────┬──────────┐
     │          │          │          │
  ┌──▼───┐  ┌───▼───┐   ┌──▼───┐   ┌──▼───┐
  │Child │  │ Child │   │Child │   │Child │
  │  bot │  │  bot  │   │  bot │   │  bot │
  │  A   │  │   B   │   │   C  │   │   D  │
  └──────┘  └───────┘   └──────┘   └──────┘
  generalbot.js / raidbot.js (mineflayer 實例)
```

- **Parent**：負責 fork child、UI/IPC 中繼、Discord 指令接收、選最佳 IP
- **Child**：每個 bot 獨立 process，內含 mineflayer 實例 + 任務佇列
- **IPC**：parent ↔ child 透過 `process.send()` / `process.on('message')` 以 typed message 溝通

---

## Parent Process — `index.js`

### 啟動流程

```
main()
 ├─ checkPaths()           // 建立 logs/, config/global/
 ├─ addMainProcessEventHandler()  // uncaughtException / SIGINT / SIGTERM
 ├─ if config.setting.enableEXPTUI → tui.start(botManager, config, {...})
 │  else                          → addConsoleEventHandler() (readline)
 ├─ if config.discord_setting.activate → DiscordBotStart(botManager)
 ├─ botManager.updateBestIP() + setInterval 每 5 min
 └─ forEach config.account.id → botManager.initBot(id)   // 錯開 200ms
```

### `BotManager` — `src/modules/botmanager.js`

| 方法 | 作用 |
| --- | --- |
| `initBot(name)` | 建立 `BotInstance` 並加入 `bots[]`，但不 fork |
| `createBot(name)` | 真正 `fork()` child process，建立 IPC channel，發 `{type:'init', config}` |
| `getBotByName / Index / Nums` | 查詢 |
| `setCurrentBotByName / ByID` | console `.switch` 切換 |
| `setBotStatus / setBotReloadCD / setBotCrtType` | child 上報 parent |
| `getBotInfo(name)` / `getBotData(name)` | 向 child 發 `dataRequire`、等 `dataToParent` |
| `updateBestIP()` | 測 ping 選延遲最低的 MCFallout proxy |
| `stop()` | 對所有 child 發 `exit` |

繼承 `EventEmitter`，child 回傳的資料會以 `handle.emit('data', ...)` 廣播給 TUI 用。

### `BotInstance` — `src/modules/botinstance.js`

單純 POJO 類別：`name / childProcess / status / type / crtType / reloadCD / debug / chat`。

### 控制台指令（readline 模式）

| 指令 | 行為 |
| --- | --- |
| `.list` | 印出 bot 狀態表 |
| `.switch <name\|id>` | 切換當前操作的 bot |
| `.create [name]` | 啟動該 bot（重建 child） |
| `.reload` | 重啟當前 bot |
| `.exit` | 關閉當前 bot / 取消排程重啟 |
| `.ff` | 立即結束 parent（不清理） |
| `.all <cmd>` | 廣播指令到所有 child |
| 其他文字 | 直接轉為 child 的 `cmd` 或 `chat` |

TUI 模式下走 `tui.js` 的事件，但相同 `handleCommand()` 會被注入為 callback。

### TUI — `src/modules/tui.js`

基於 [neo-blessed](https://www.npmjs.com/package/neo-blessed)。由 `config.toml` 的 `setting.enableEXPTUI` 開啟。功能：

- 左側 Bot List（狀態色碼）
- 分頁：Dashboard / Console / Profiles / Help / Settings
- Dashboard：parent + child 的 PID / RSS / Heap 即時顯示
- Console：Infos 面板 + log（上限 500 條自動截切）
- 每秒輪詢一次 child 資料（透過 `BotManager.getBotData`）

### DiscordBot — `src/modules/discordbot.js`

- `DiscordBotStart(botManager)` / `DiscordBotStop(waitMs)`
- 接收 Discord slash command / DM 轉成 child 指令
- `config.toml` → `discord_setting.activate` 控制啟停

---

## Child Process — `bots/generalbot.js`

主要進入點之一（另一個是 `raidbot.js`）。流程：

```
process.argv = [node, generalbot.js, <bot_name>, <profile_type>, ...flags]

1. process.on('message', {type: 'init'})  // 等 parent 的 init
2. 載入 profile、建立 mineflayer bot
3. 初始化 bots/lib/:
    - createTaskManager(deps)
    - chatManager
    - mapManager
4. 註冊所有模組：forEach src/*.js → module.init({bot, bot_id, logger})
5. 進入事件迴圈：bot.on('chat') → taskManager.assign(task)
```

### `bots/lib/taskManager.js`

Task 佇列 + 執行器：

- `assign(task, longRunning=true)` — 入列 / 直接執行
- `loop(sort)` — 依 priority + timestamp 排序執行
- `execute(task)` — 比對 `identifier` + `cmd.identifier` 找到 module 的 execute function
- 自動對應 `moduleStatusMap` 更新 bot status（如 `mp` → `TASK_MAPART`）
- `task.json` 持久化於 `config/<bot>/task.json`，重啟續跑

### IPC Message 規格

**Parent → Child**
| `type` | payload | 作用 |
| --- | --- | --- |
| `init` | `{config}` | 啟動時傳 config.toml |
| `exit` | — | 請求 child 收尾退出 |
| `reload` | — | 請求 child 重啟（同 exit，但 parent 自動 create） |
| `cmd` | `{text}` | 轉送 console 指令（走 taskManager） |
| `chat` | `{text}` | 直接走 `bot.chat()` |
| `dataRequire` | — | 請 child 回報即時資料 |

**Child → Parent**
| `type` | value | 作用 |
| --- | --- | --- |
| `setStatus` | Status.* | 更新 `BotInstance.status` |
| `setReloadCD` | ms | 設定重啟冷卻 |
| `dataToParent` | `{name, server, coin, balance, position, tasks, runingTask, ping, memory}` | 回應 `dataRequire` |

Child 退出時的 `exitcode`（`src/modules/exitcode.js` 定義）決定 parent 是否自動重啟。

---

## 功能模組 (Module) 架構

每個 `src/<module>.js` 匯出一個 object，由 child process 的模組註冊器載入。

### 模板（`src/template.js`）

```js
const { initModule, taskreply } = require('../lib/commandModule')
let logger, mcData, bot_id, bot

let template_cfg = {
    "example_key": "example_value",
}

const template = {
    identifier: [ "template" ],
    cmd: [
        {
            name: "template TEST",
            identifier: [ "test" ],
            execute: test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        }
    ],
    async init(ctx) {
        const result = await initModule(ctx, [
            { key: 'cfg', filename: 'template.json', scope: 'bot', default: template_cfg },
        ])
        logger = result.logger
        mcData = result.mcData
        bot_id = result.bot_id
        bot = result.bot
        template_cfg = result.configs.cfg
    }
}

async function test(task) {
    taskreply(bot, task, "Not Implemented", "Not Implemented", "Not Implemented")
}

module.exports = template
```

### 欄位說明

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `identifier[]` | string[] | 指令第 1 個 token 比對的別名（如 `mp`, `mapart`, `map` 都指同一模組） |
| `cmd[]` | object[] | 子指令列表 |
| `cmd[].identifier[]` | string[] | 指令第 2 個 token 比對（`mp set`, `mp build` 等） |
| `cmd[].execute` | `async (task) ⇒ void` | 實際執行函數 |
| `cmd[].longRunning` | bool | `true` → 進 taskManager 佇列；`false` → 立即執行 |
| `cmd[].vaild` | bool | 是否啟用（方便暫時關閉） |
| `cmd[].permissionRequre` | number | 權限等級（保留欄位，規劃使用 bitmask） |
| `init(ctx)` | `async` | 註冊時呼叫，`ctx = {bot, bot_id, logger}` |

### 指令比對規則

```
/m <bot> <identifier> <cmd.identifier> [args...]
          ^^^^^^^^^^^  ^^^^^^^^^^^^^^^^  ^^^^^^^^^
          模組         子指令            task.content
```

- `basicCommand` 為例外：第 1 個 token 直接比對（`info`、`bal`、`find` 等不用前綴）
- 找不到子指令時 fallback 到模組的 `cmdhelper`（若有定義）

### Config 雙層

| scope | 位置 | 用途 |
| --- | --- | --- |
| `global` | `config/global/<file>.json` | 所有 bot 共用（材料站、webhook、投影資料夾等） |
| `bot` | `config/<bot>/<file>.json` | 單 bot 獨立（當前任務、座標、工具設定等） |

### `initModule(ctx, configs[])`

由 `lib/commandModule.js` 提供：

1. 依 `configs[].scope` 決定路徑（global / bot）
2. 檔案不存在 → 以 `default` 建檔
3. 檔案存在 → 讀取 + `deepMergeDefaults()` 自動補上新版新增的欄位
4. 回傳 `{bot, bot_id, logger, mcData, configs: {key: loaded}}`

> 不用自己寫 `fs.existsSync` / `readConfig` / 欄位比對，`initModule` 全包。

### `taskreply(bot, task, mc_msg, console_msg, discord_msg)`

依 `task.source`（`minecraft-dm` / `console` / `discord`）發送對應訊息。避免在每個模組都寫 switch。

---

## 共用 Lib

| 檔案 | 提供 |
| --- | --- |
| `lib/common.js` | `sleep`, `readConfig`, `saveConfig`, `configPath`, `globalConfigPath`, `getMcData`（mcData 單例快取） |
| `lib/commandModule.js` | `initModule`, `saveModuleConfig`, `saveGlobalConfig`, `taskreply`, `deepMergeDefaults` |
| `lib/taskController.js` | `TaskController` — 每個長任務的 stop/pause/resume 統一實作 |
| `lib/constants.js` | 共用常數（方塊類別、伺服器 id 等） |
| `lib/util.js` | 雜項工具（裝備、丟棄、slot 計算） |
| `lib/pathfinder.js` | 飛行/尋路（`astarfly` 為主） |
| `lib/mcFallout.js` | MCFallout 伺服器專用操作（warp / sethome / 切換分流） |
| `lib/station.js` | 材料站補貨 |
| `lib/containerOperation.js` | 容器開關、物品取放 |
| `lib/litematicPrinter.js` | litematic 投影建造 |
| `lib/schematic.js` | schematic 解析 |
| `lib/craft.js`、`lib/farm.js`、`lib/ironfarm.js` | 特定功能輔助 |
| `lib/mapart/` | 地圖畫模組化實作 |
| `lib/quest/` | AutoQuest handler |
| `lib/villager/` | 村民交易 |
| `lib/wms/` | 倉儲管理 (WMS) |
| `lib/area/` | 區域操作 (ClearArea) |

### TaskController 使用範例

```js
const { TaskController } = require('../taskController')
const ctrl = new TaskController()

async function longJob() {
    ctrl.reset()
    while (ctrl.running) {
        if (ctrl.stopped) return
        await ctrl.waitWhilePaused()
        // ... work ...
    }
}
// 其他地方呼叫
ctrl.pause(); ctrl.resume(); ctrl.stop();
```

`active = !stopped && !paused`、`running = !stopped` — 依迴圈內是否自己處理 pause 擇一使用。

---

## 跨平台打包

- 使用 [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg)（vercel/pkg 已停更，這是支援 Node 22/24 的 fork）
- `package.json` scripts：
  - `npm run bw` — Windows exe
  - `npm run bl` — Linux 執行檔（`--no-bytecode --public --public-packages "*"` 繞過 V8 bytecode mismatch）
- 跨平台路徑解析：
  ```js
  const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd()
  const config = require(`${baseDir}/config.toml`)
  ```
  已套用於 `index.js`、`bots/generalbot.js`、`bots/raidbot.js`、`src/modules/botmanager.js`、`src/modules/discordbot.js`
- `pkg.assets` 納入 `neo-blessed/usr/**/*`（terminfo）
- `pkg.scripts` 納入 `neo-blessed/lib/widgets/*.js`（動態 require）與 `@discordjs/rest/dist/**/*.js`

### 新增模組後的打包檢查

1. 若模組 `require` 靜態路徑且在 `lib/` 或 `src/` → pkg 自動收
2. 若用動態字串 require → 加進 `pkg.scripts` 的 glob
3. 若載入非 JS 檔（json、txt、bin） → 加進 `pkg.assets`

---

## 新增功能模組的流程

1. 複製 `src/template.js` 為 `src/<myModule>.js`
2. 修改 `identifier[]`、新增 `cmd[]` 項目
3. 在 `init(ctx)` 中透過 `initModule` 宣告要用的 config 檔
4. `bots/generalbot.js` 的 module register 區塊加入 `require('../src/myModule.js')`
5. 需要共用邏輯時抽到 `lib/<myModule>/` 下
6. 長任務用 `TaskController` 包裹，提供 stop / pause / resume
7. 需要 Discord webhook / 通知 → 使用 `WebhookClient` (`discord.js`)
8. 在 `docs/zh_tw/<MyModule>.md` 撰寫使用者文件；在 `docs/CHANGELOG.md` 加入版本記錄

---

## 配置檔位置總覽

| 檔案 | Scope | 用途 |
| --- | --- | --- |
| `config.toml`（根目錄） | root | 帳號清單、Discord 設定、TUI 開關、最佳 IP、重連 CD 等 |
| `profiles.json`（根目錄） | root | 帳號類型 + 登入資訊 |
| `config/global/<file>.json\|toml` | 全 bot 共用 | 材料站、autoQuest.toml、mapart 全域等 |
| `config/<bot>/<file>.json` | 單 bot | 各模組每 bot 狀態 |
| `config/<bot>/task.json` | 單 bot | 任務佇列持久化 |

---

## Logger

`src/logger.js` 提供：

```js
logger(persist: bool, level: 'INFO'|'ERROR'|'DEBUG', source: string, message: string)
```

- `persist=true` → 同步寫入 `logs/<YYYY-MM-DD>.log`（按日切割）
- `persist=false` → 僅 console 輸出
- TUI 模式下 parent 的 `console.log / console.error` 會被攔截並送進 log 視窗

---

## 除錯建議

- **child 靜默退出** → 看 parent log 的 exitcode，對照 `src/modules/exitcode.js`
- **JSON 設定壞掉** → 各模組 init 失敗會 `bot.gkill(202)` 並印出 MDN 連結
- **尋路失敗** → 多數模組遇 `pfr false` 會 `/homes <home>` 拉回；請先 `/sethome` 建 home point
- **V8 bytecode mismatch (Linux exit=4)** → 重打包時確認 `--no-bytecode --public --public-packages "*"` 都有帶
- **pkg 打包後找不到檔案** → 檢查 `pkg.scripts` / `pkg.assets` 是否覆蓋到該路徑（動態 require 與非 JS 資源需自己列）

---

## 版本規劃

版本政策 + 各版本新增內容請見 [`docs/CHANGELOG.md`](./CHANGELOG.md)。
