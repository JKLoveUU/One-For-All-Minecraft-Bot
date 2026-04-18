# 村民交易 VillagerTrading

自動化村民交易流程：訓練新村民、殭屍化改名、鐵/綠寶石兌換、雙瓜農夫交易、放置已鎖定職業村民。

---

## 主指令

- `vt`
- `villager`
- `v`

## 指令

---

### **村民交易（鐵）**
- `iron`

於固定倉儲前，依 `identifierBlock` / `directionBlock` 逐個識別已鎖定的 **武器匠村民**，從輸入箱取出 `input` 物品、完成交易、輸出到對應方向的箱子。適合將鐵錠批量換成綠寶石。

#### example
`/m bot vt iron`

---

### **村民交易（雙瓜）**
- `melonpumpkin`
- `mp`

以農夫村民進行「南瓜、西瓜 → 綠寶石」等交易。

#### example
`/m bot vt mp`

`/m bot villager melonpumpkin`

---

### **訓練村民**
- `train`

自動訓練新村民：放置 → 檢查職業與等級交易項 → 依 `condition` 決定接受 / 拒絕 / 繼續訓練；接受的放入 `acceptContainer`，拒絕的放入 `rejectContainer` 或直接殺掉。自動補充蛋、綠寶石、煤炭、金蘋果、標籤紙等。

#### example
`/m bot vt train`

> 會依 `type` 選擇 `typecfg[type]` 的設定（`iron_villager` / `melonpumpkin` / ...）。

---

### **治療改名村民**
- `curerename`
- `cr`

殭屍化選定村民 → 移動至治療區 → 餵金蘋果 + 虛弱藥水治療，治療完成後重生會有 **折扣**，再用標籤紙改名鎖定。

#### example
`/m bot vt cr`

---

### **放置村民**
- `put`

將倉庫裡的村民蛋放回交易場地（依 `type` 對應的設定）。

#### example
`/m bot vt put`

---

### **停止**
- `stop`

中止當前正在執行的 villager 任務。

#### example
`/m bot vt stop`

---

## Config 配置

設定檔位置：`config/<bot>/villager.json`

首次 `init` 時若不存在，會由程式用預設 cfg 自動建立。

### 頂層結構

```json
{
  "train":      { ... },
  "iron":       { ... },
  "curerename": { ... },
  "put":        { ... }
}
```

每個 key 對應一個子指令的設定。

---

### `train` — 訓練村民

```json
"train": {
  "warp":   "ED_Xian_16",
  "server": 60,
  "type":   "iron_villager",
  "typecfg": { ... },
  "TRY_OPEN_VILLAGER_TIMES": 10,
  "MIN_STOCK": 10,
  "restock":  { ... }
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `warp` | string | 訓練區傳點 |
| `server` | number | 分流號 |
| `type` | string | 使用 `typecfg` 中的哪個預設（如 `iron_villager`） |
| `TRY_OPEN_VILLAGER_TIMES` | number | 開啟村民視窗重試次數 |
| `MIN_STOCK` | number | 補貨最低庫存 |
| `typecfg` | object | 各類型村民的交易定義（見下） |
| `restock` | object | 物品自動補貨座標（見下） |

#### `typecfg.<name>` 項目

```json
"iron_villager": {
  "vtype": "weaponsmith",
  "cansell": ["coal"],
  "canbuy":  ["iron_axe"],
  "throwtrash": ["iron_axe"],
  "center":          [-6602, 35, 1094],
  "acceptContainer": [-6593, 42, 1097],
  "rejectContainer": [-6593, 42, 1103],
  "condition": [
    { "level": 2, "have": "iron_ingot", "match": "accept", "notmatch": "reject" }
  ]
}
```

| 欄位 | 說明 |
| --- | --- |
| `vtype` | 村民職業：`weaponsmith` / `farmer` / `librarian` / … |
| `cansell` | 允許「賣出」的物品清單（村民會收的） |
| `canbuy` | 允許「買入」的物品清單（村民產出的） |
| `throwtrash` | 視為垃圾直接丟棄的物品 |
| `center` | 訓練區中心座標 |
| `acceptContainer` | 接受條件 → 村民蛋收納位置 |
| `rejectContainer` | 拒絕條件 → 村民蛋收納位置 |
| `condition[]` | 每一個 level 的篩選條件；`match` / `notmatch` 的值可為 `accept` / `reject` / `continue` |

#### `restock.<item>` 項目

```json
"ghast_spawn_egg": {
  "pos": [-6610, 33, 1098],
  "threadhold": 1,
  "restockcount": 64,
  "return": [-4156, -22, 1869]
}
```

| 欄位 | 說明 |
| --- | --- |
| `pos` | 補貨箱座標（`input`） |
| `threadhold` | 數量低於此值時觸發補貨 |
| `restockcount` | 補到此數量 |
| `return` | （可選）將多餘物品歸還之箱 |

`name_tag` 可以依等級拆成多個箱：

```json
"name_tag": {
  "i2:iron_ingot": [-4136, -53, 1891],
  "i3:iron_ingot": [-4137, -53, 1891],
  "threadhold": 1,
  "restockcount": 64
}
```

鍵 `iN:item` 代表從第 N 個標籤紙交易買入、付給的物品。

---

### `iron` — 鐵/綠寶石批次兌換

```json
"iron": {
  "server": 109,
  "y": 147,
  "warp": "JKLoveJK_12",
  "identifierBlock": "sea_lantern",
  "directionBlock":  "magenta_glazed_terracotta",
  "input":  ["iron_ingot"],
  "output": ["emerald"],
  "trash":  ["iron_axe", "poppy"],
  "try_counts": 2
}
```

| 欄位 | 說明 |
| --- | --- |
| `server` | 分流 |
| `warp` | 傳點 |
| `y` | 倉儲層高（用於路徑生成） |
| `identifierBlock` | 用於識別「此處有村民」的方塊 |
| `directionBlock` | 用於識別「輸出箱方向」的方塊 |
| `input` | 放進村民交易界面的原料 |
| `output` | 希望取出並收納的產物 |
| `trash` | 丟棄的雜物 |
| `try_counts` | 每個村民嘗試交易次數 |

---

### `curerename` — 治療改名

```json
"curerename": {
  "type": "iron_villager",
  "typecfg": {
    "iron_villager": {
      "zombifyCenter":    [-4131, -27, 1902],
      "zombifyNew":       [-4129, -28, 1901],
      "zombifyContainer": [-4131, -27, 1902],
      "zombifyEGG":       [-4130, -30, 1898],
      "cureCenter":       [-4130, -50, 1886],
      "cureNew":          [-4131, -53, 1885],
      "cureContainer":    [-4130, -51, 1886],
      "cureWeak":         [-4129, -49, 1889]
    }
  }
}
```

| 欄位 | 說明 |
| --- | --- |
| `zombifyCenter` | 殭屍化區站位 |
| `zombifyNew` | 觸發殭屍發射器位置 |
| `zombifyContainer` | 放殭屍村民蛋的箱 |
| `zombifyEGG` | 空蛋箱（目前未使用） |
| `cureCenter` | 治療區站位 |
| `cureNew` | 放置待治療村民的位置 |
| `cureContainer` | 治療材料箱（金蘋果、藥水） |
| `cureWeak` | 虛弱發射器按鈕 |

> `curerename` 的 `server` 與 `warp` 沿用 `train` 的設定。

---

### `put` — 放置村民

```json
"put": {
  "server": 109,
  "warp":   "JKLoveJK_12",
  "type":   "iron_villager"
}
```

| 欄位 | 說明 |
| --- | --- |
| `server` | 目標分流 |
| `warp` | 目標傳點 |
| `type` | 對應 `train.typecfg` 中的類型 |

---

## 條件判斷說明（`condition`）

`train.typecfg.<name>.condition` 是一個陣列，按村民升級到該 `level` 時解鎖的交易項目逐一比對：

- `have` = 該項交易的必要物品
- `match` = 發現匹配時的行為：
  - `accept` — 放入 `acceptContainer` 收好
  - `reject` — 放入 `rejectContainer` 或淘汰
  - `continue` — 繼續往下一個 level 判斷
- `notmatch` = 未匹配時的行為（同上）

範例：

```json
"condition": [
  { "level": 2, "have": "pumpkin", "match": "continue", "notmatch": "reject" },
  { "level": 3, "have": "melon",   "match": "accept",   "notmatch": "reject" }
]
```

> 只要 level 2 有南瓜交易且 level 3 也有西瓜交易 → accept；其他組合 → reject。

---

## 檔案位置速查

| 檔案 | 說明 |
| --- | --- |
| `config/<bot>/villager.json` | 每 bot 獨立設定 |
| `src/villager.js` | 指令入口 |
| `lib/villager/villager.js` | 主要邏輯 |
| `lib/villager/train.js` | 訓練/改名輔助 |
| `lib/villager/ed_Trade.js` | 特殊交易 |

---

## 常見問題

- **開村民視窗一直失敗** → 調高 `train.TRY_OPEN_VILLAGER_TIMES`，或確認 `center` 座標身後的村民 hitbox 未被擋住。
- **鐵村民找不到箱子** → 確認 `iron.identifierBlock` / `directionBlock` 在該分流的倉儲仍一致；若地圖被改過需重設。
- **治療後沒折扣** → 確認虛弱藥水已補進 `cureContainer`，並且 `cureWeak` 發射器位置正確。
- **NG 村民一直留在場上** → 確認 `rejectContainer` 未滿且 `reject` 條件被正確觸發；可用 `vt train` 觀察 log。
