# 更新紀錄 Changelog

本檔案記錄 One-For-All Minecraft Bot 的各版本變更。
格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

---

## [1.2.0]

### ✨ 新增 Added

#### TUI（Terminal UI）
- 基於 [neo-blessed](https://www.npmjs.com/package/neo-blessed) 的全新終端介面：`src/modules/tui.js`
- Dashboard 分頁顯示 parent / 各 child 的 PID、RSS、Heap Used / Total、External 記憶體
- Console 分頁：Bot 清單 + Infos 面板（座標、餘額、任務、Ping 等即時資訊），每秒刷新
- Profiles 分頁：profiles.json 配置瀏覽（Username 欄位拓寬）
- Help / Settings 分頁
- 滑鼠支援可切換（`toggleMouse` 靜默切換）
- Log 自動上限 500 條，避免長時間執行後效能下降
- 可透過 `config.toml` 中相關設定關閉改用 readline

#### 自動任務 AutoQuest
- 模組：`src/autoQuest.js` + `lib/quest/*`（`core.js`、`handlers.js`、`beginner.js`、`brewing.js`、`crafting.js`、`fishing.js`、`farming.js`、`materials.js`、`others.js`、`utils.js`）
- 指令：`aq start / stop / info / detail / show / test / debug`
- 每日 21:00 自動強制刷新任務
- 偵測 WMS 訂單自動暫停並完成後續回
- 完成任務透過 Discord webhook 推送 Embed，神話/光輝級或超過 `big_threshold` 走大獎 webhook
- 設定檔：`config/global/autoQuest.toml`（TOML 格式，含各 handler 的 warp / afk 座標）
- 📖 詳見 [`docs/zh_tw/AutoQuest.md`](./zh_tw/AutoQuest.md)

#### 村民交易 VillagerTrading
- 模組：`src/villager.js` + `lib/villager/*`（`villager.js`、`train.js`、`ed_Trade.js`、`edtrain.js`）
- 指令：`vt iron / mp / train / curerename / put / stop`
- 訓練村民：自動篩選職業／等級交易項，依 `condition` 決定 accept / reject / continue
- 治療改名：殭屍化 → 金蘋果 + 虛弱治療 → 標籤紙鎖定折扣村民
- 鐵 / 綠寶石倉儲批量兌換（依 identifier / direction block 自動定位）
- 自動補貨：蛋、綠寶石、煤、金蘋果、標籤紙（`name_tag` 支援多等級）
- 設定檔：`config/<bot>/villager.json`
- 📖 詳見 [`docs/zh_tw/VillagerTrading.md`](./zh_tw/VillagerTrading.md)

#### 地圖畫重構（Mapart）
- 原本的 `src/mapart.js`（2000+ 行）拆分為 `lib/mapart/` 模組：
  - `core.js` — 狀態、預設設定、方向表
  - `build.js` — 建造邏輯
  - `mapops.js` — 開圖 / 命名 / 複印
  - `restock.js` — 材料站補貨 + `mp material` / `mp file` 指令
  - `wrap.js` — 分裝
  - `utils.js` — 共用工具
- 新增 `mp material` / `mp file` 指令用於自動掃描材料站並產出 JSON
- Config 自動 `deepMergeDefaults`，新版本新增欄位不會壞設定
- 📖 詳見 [`docs/zh_tw/Mapart_config.md`](./zh_tw/Mapart_config.md)

#### WMS（Warehouse Management System）
- 全新倉儲訂單系統：`lib/wms/wms.js`、`lib/wms/barrel.js`
- 訂單偵測、物品取放、回傳結果
- 與 AutoQuest / 其他任務整合（優先權 +priority 搶先執行）
- 模組：`src/warehouse.js`

#### 打包（Packaging）
- 從已棄用的 `vercel/pkg` 遷移至 **`@yao-pkg/pkg`**（Node 22 支援）
- 新增 Linux 打包流程：`npm run bl` / `npm run bbl`
- Linux 打包使用 `--no-bytecode --public --public-packages "*"` 解決 V8 bytecode VERSION_MISMATCH
- 跨平台路徑解析：
  ```js
  const baseDir = process.pkg ? path.dirname(process.execPath) : process.cwd()
  ```
  套用於 `index.js`、`bots/generalbot.js`、`bots/raidbot.js`、`src/modules/botmanager.js`、`src/modules/discordbot.js`
- 頂層 `uncaughtException` handler 放到 `index.js` 首行，避免靜默退出
- `pkg.assets` 加入 `neo-blessed/usr/**/*`（terminfo 二進位）
- `pkg.scripts` 加入 `neo-blessed/lib/widgets/*.js`、`@discordjs/rest/dist/**/*.js`
- 補足 `neo-blessed` 至 dependencies

#### 其他新模組
- `src/autoQuest.js` — AutoQuest 入口
- `src/villager.js` — 村民交易入口
- `src/warehouse.js` — WMS 入口
- `src/buildtool.js` — 建築投影工具
- `src/clearArea.js` — 區域清理工具
- `lib/area/` — 區域操作輔助
- `lib/commandModule.js` — 模組初始化共用 `initModule` / `deepMergeDefaults`
- `lib/common.js` — 共用常式（`sleep`、`readConfig`、路徑 helper）
- `lib/constants.js` — 共用常數
- `lib/util.js` — 雜項工具
- `lib/taskController.js` — 任務控制器（支援 stop signal）
- `lib/craft.js`、`lib/farm.js`、`lib/ironfarm.js` — 合成 / 農場 / 鐵魔像農場輔助
- `bots/lib/Task.js`、`taskManager.js`、`chatManager.js`、`mapManager.js` — bot 內部管理類別

#### 文檔
- `docs/zh_tw/AutoQuest.md`
- `docs/zh_tw/VillagerTrading.md`
- `docs/zh_tw/Mapart_config.md`
- `docs/CHANGELOG.md`（本檔）
- `docs/zh_tw/Mapart.md` 同步新增 `material` / `file` / `test` / `debug` 指令說明

### 🔧 變更 Changed

- **Bot 管理**：`src/modules/botmanager.js` 重整為集中式 IPC；parent → child `dataRequire`、child → parent `dataToParent`，支援 `setStatus` / `setReloadCD` 等消息
- **Logger**：`src/logger.js` 改為 **按日切割**，不同日期寫入不同檔案
- **Discord bot**：拆分出 `src/modules/discordbot.js`；支援經 `config.toml` 啟用/停用
- **Bot 狀態**：`src/modules/botstatus.js` 擴充（加入 `QUESTING`、`QUEST_WAITING`、`WAIT_NEXT_QUEST` 等）
- **stop flag** 初始化流程修正（`de87db3`：「修復 stop 後沒有初始化 stop flag 的地方」）
- **尋路**：`lib/pathfinder.js` 優化、除錯識別碼、刷頻修正
- **分流切換邏輯**：`mcFallout.warp()` 等待判斷改善
- **IP 選擇**：選擇最快 IP 功能 + exit 同時取消重啟
- **Discord 訊息排版**修正
- **Log 格式**統一、顏色調整
- **`reload` / `init` / `create`** 流程邏輯整理
- **依賴 override**：`axios ^1.13.1`、`undici ^6.23.0`
- **engines**：最低 Node 版本 `>=18`
- **`.help` / list 對齊**修正
- **數字鍵切換 bot** 支援

### 🐛 修復 Fixed

- 投影 `bitsPerEntry` 計算錯誤導致 litematic 無法正確載入
- 紅石火把方向錯誤（litematicPrinter）
- 建造材料站回補錯誤 / 創建投影設定方塊方式
- `stop` 後旗標沒初始化
- 使用到假地圖的問題
- TUI 滑鼠切換時的 log 噪音
- Infos 面板 `-1` 被顯示為資料值（現在視為缺值）
- `@discordjs/rest` 的 `Entry 'main' not found` 警告（本地 patch + `pkg.scripts`）
- `Cannot find module './widgets/text'`（neo-blessed 動態 require → pkg.scripts 補）
- `File ... neo-blessed\usr\xterm was not included`（pkg.assets 補 terminfo）
- Linux 打包後執行 `exit=4`（V8 bytecode VERSION_MISMATCH；改用 `--no-bytecode --public --public-packages "*"`）

### 🗑️ 移除 Removed

- 突襲塔統計（改為村民交易統計）
- 廢棄舊檔（`fe46b4a`：remove old file）

---

## 檔案層級摘要

| 層級 | 檔案 | 作用 |
| --- | --- | --- |
| 入口 | `index.js` | 註冊 uncaughtException、載入 config、啟動 botmanager |
| Parent | `src/modules/botmanager.js` | fork 各 bot、IPC 中繼 |
| Parent | `src/modules/tui.js` | neo-blessed TUI |
| Parent | `src/modules/discordbot.js` | Discord 指令接收 |
| Child | `bots/generalbot.js` | 通用 bot（mineflayer 實例） |
| Child | `bots/raidbot.js` | 突襲塔 bot |
| Module | `src/autoQuest.js` + `lib/quest/*` | 自動任務 |
| Module | `src/villager.js` + `lib/villager/*` | 村民交易 |
| Module | `src/mapart.js` + `lib/mapart/*` | 地圖畫 |
| Module | `src/warehouse.js` + `lib/wms/*` | WMS 倉儲訂單 |
| Module | `src/craftAndExchange.js` | 合成 / 兌換 |

---

## 版本號規則

- **Major**：不兼容的設定檔格式變更 / 大幅架構調整
- **Minor**：新增模組或指令、保持向後相容
- **Patch**：bug 修復、效能優化、文字調整

---

## 連結

- 倉庫：<https://github.com/JKLoveUU/One-For-All-Minecraft-Bot>
- Issue Tracker：<https://github.com/JKLoveUU/One-For-All-Minecraft-Bot/issues>
