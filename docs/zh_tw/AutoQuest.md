# 自動任務 AutoQuest

自動接取、完成廢土伺服器任務系統中的日/週常任務，並自動處理任務間的掛機、切換分流、拉霸獎勵紀錄與 Discord 通知。

---

## 主指令

- `aq`
- `quest`

## 指令

---

### **執行 / 啟動**
- `start`
- `run`

啟動 AutoQuest 主迴圈。會持續讀取當前任務、呼叫對應 handler 完成、等到下個任務、必要時切換分流刷新。

#### example
`/m bot aq start`

`/m bot quest run`

> 啟動後 bot 會自動在 `afk` 設定的傳點之間遊走掛機，等待下個任務或已達上限。

---

### **停止**
- `stop`
- `s`

中止 AutoQuest 主迴圈並停止當前正在執行的 handler。

#### example
`/m bot aq stop`

---

### **查詢當前任務**
- `info`
- `i`

回報當前任務名稱、目標、獎勵、Ping、剩餘時間、下個任務剩餘時間、可跳過次數。

#### example
`/m bot aq info`

---

### **查詢任務詳情**
- `detail`

於 console 列印當前任務所有內部欄位（debug 用）。

#### example
`/m bot aq detail`

---

### **開啟任務選單（手動跳過）**
- `show`

對伺服器發送 `/quest`，開啟任務選單並點擊跳過按鈕（slot 5）。用於卡住或想強制換任務時。

#### example
`/m bot aq show`

---

### **執行一次測試**
- `test`

跑一次 `questHandler` 嘗試完成當前任務（不進入長時間迴圈）。開發 / 除錯用。

#### example
`/m bot aq test`

---

### **Debug**
- `debug`
- `d`

列印當前任務原始資料（Scoreboard parse 結果）。開發用。

#### example
`/m bot aq debug`

---

## 自動刷新機制

- 每日 **21:00** 會觸發 `needForceRefresh`，下次迴圈會自動切換至 `JKLoveJK_23` → `JKLoveJK_8` 刷新任務列表。
- 當任務為「已達上限」而 `needForceRefresh = true` 時，也會強制切換分流。
- 偵測到 WMS 訂單時會暫停 AutoQuest，先指派 `wms order` 任務完成訂單後再自動接回 `aq run`。

---

## Config 配置

AutoQuest 使用 **兩份** 設定檔：

| 檔案 | 格式 | 用途 |
| --- | --- | --- |
| `config/global/autoQuest.toml` | TOML | 主要設定：傳點、handler 座標、Discord webhook |
| `config/global/station_quest.json` | JSON | 材料站倉庫項目對應（檔名由 `station` 欄位指定） |

### autoQuest.toml

#### 頂層欄位

```toml
materialsMode   = "station"        # 材料取得模式，目前使用 "station"
station         = "station_quest.json"  # 材料站 JSON 檔名（相對 config/global/）

# 普通任務完成通知
dc_webhookURL   = "https://discord.com/api/webhooks/..."
# 大獎任務通知（神話級 / 光輝級 / 超過 big_threshold 時轉發）
dc_big          = "https://discord.com/api/webhooks/..."
big_threshold   = 500000           # 拉霸總獎勵超過此值轉發到 dc_big

afk_must        = 3                # 掛機傳點至少要有幾個人才停留（未達人數會嘗試下一個）
afk = [                            # 掛機傳點列表（依序嘗試）
    "JKLoveJK_23",
    "JKLoveJK_21",
    # ...
]
```

> `afk` 只保留 warp 名去掉底線後仍含 `JKLoveJK` 或 `JKeqing` 的項目；其他 warp 會被忽略。

#### 共用座標

```toml
quest4  = [5560, -55, 5565]   # 每日第 4 個任務領取點
quest7  = [5560, -55, 5566]   # 每日第 7 個任務領取點
quest11 = [5560, -55, 5567]   # 每日第 11 個任務領取點
anvil   = [5560, -55, 5568]   # 鐵砧座標
throw   = [5574, -45, 5520]   # 丟垃圾座標
```

#### Handler 設定

每個 handler 一個 TOML 表 (`["handler名"]`)。以下列出目前支援的 handler：

##### `["工程原料"]`

```toml
["工程原料"]
any   = "clay"                 # 任意方塊刷任務時放的方塊
place = [5520, -62, 5528]      # 放方塊的起始座標
```

##### `["合成"]`

```toml
["合成"]
warp            = "JKLoveJK_8"
crafting_table  = [5554, -56, 5585]
stonecutter     = [5558, -55, 5552]
"黑石"          = [5580, -38, 5556]   # 按鈕座標
"金製物品"      = [5587, -38, 5571]
"石英製物品"    = "skip"               # "skip" 表示此類合成跳過該任務
# ... 其他合成子類別
```

值為 `"skip"` 時，若遇到該類別任務會直接 skip；否則必須是按鈕座標 `[x, y, z]`。

##### `["萬物皆可農"]` / `["擊殺"]`

依生物類型分子表：

```toml
["萬物皆可農"."殭屍"]
warp       = "JKLoveJK_18"   # 傳點
handkill   = "zombie"         # 拿刀砍的實體 id
sweepedge  = true             # 是否使用橫掃
afk        = [-413, 8, -416]  # 中心座標

["萬物皆可農"."岩漿立方怪"]
warp       = "JKLoveJK_29"
bugafk     = [775, 32, 584]   # 先傳這裡避免卡住
afk        = [792, 10, 544]
handkill   = "magma_cube"
flyUnder   = true             # 飛在 afk 下方打
```

欄位：

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `warp` | string | 傳點名 |
| `handkill` | string | 實體 id（`entities` name） |
| `sweepedge` | bool | 是否持劍橫掃 |
| `afk` | [x,y,z] | 掛機中心座標 |
| `bugafk` | [x,y,z] | 避卡先落腳點，之後再移動到 `afk` |
| `flyUnder` | bool | 飛在 afk 下方執行 |
| `put_wandering_trader_at` | [x,y,z] | 流浪商人放蛋後位置 |
| `egg` | [x,y,z] | 放蛋容器 |

##### `["農場"]` / `["繁殖"]` / `["貿易"]` / `["剪刀採集"]` / `["骨粉催熟"]` / `["釀造"]` / `["釣魚"]`

```toml
["農場"."common"]
warp = "JKLoveJK_8"
afk  = [5554, -55, 5564]

["骨粉催熟"]
warp         = "JKLoveJK_8"
crimson      = [5548, -60, 5596]     # 紅色菌絲地
warped       = [5556, -60, 5596]     # 藍色菌絲地
nether_tree  = [5522, -61, 5603]     # 地獄樹地

["繁殖"]
warp = "JKLoveJK_8"                  # 需與材料站同傳點

["釀造"]
warp           = "JKLoveJK_8"
brewing_stand  = [5568, -54, 5573]   # 第一個釀造台

["釣魚"]
warp  = "JKLoveJK_8"
afk   = [5589, -56, 5521]
yaw   = 179.9
pitch = -20
```

---

## Discord 通知

完成一次任務後會透過 `dc_webhookURL` 推送 Embed，內容包含：

- 任務名稱
- 原始獎勵、拉霸總獎勵、拉霸階級/倍率
- 耗時
- Embed 顏色依拉霸階級（煤炭 / 生存 / 英雄 / 領主 / 傳奇 / 神話 / 光輝）自動選色

當拉霸階級為 **神話級** 或 **光輝級**，或拉霸總獎勵超過 `big_threshold` 時，會改用 `dc_big` 推送。

---

## 檔案位置速查

| 檔案 | 說明 |
| --- | --- |
| `config/global/autoQuest.toml` | 主設定（本文件） |
| `config/global/station_quest.json` | 材料站資料（由 `station` 欄位指定） |
| `config/<bot>/autoQuest.json` | 每 bot 狀態 / 快取 |
| `config/<bot>/autoQuest_cache.json` | 執行期快取 |

---

## 常見問題

- **啟動後一直待在原地不動** → 檢查 `afk` 列表中的傳點名是否含 `JKLoveJK` 或 `JKeqing`，其他會被過濾。
- **任務一直失敗** → `aq detail` 看任務內部欄位，或檢查對應 handler 的座標是否仍正確。
- **沒有 Discord 通知** → 確認 `dc_webhookURL` 非空，且 webhook 未被伺服器刪除。
- **大獎沒進大獎頻道** → 調整 `big_threshold`，或確認 `dc_big` 已設。
