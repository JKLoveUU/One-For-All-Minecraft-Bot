# 區域清除 ClearArea

自動清除指定立體區域內所有方塊（類似 Baritone 的 `#sel` + `#mine`）。支援液體封堵、waterlog 處理、工具自動修復、分流/座標自動矯正、WMS 或材料站補貨。

> 參考：<https://github.com/cabaletta/baritone/blob/1.19.4/USAGE.md>

---

## 主指令

- `ca`
- `cleararea`

## 指令

---

### **執行**
- `execute`
- `e`

依 config 的 `p1` / `p2` 立方體區域逐個子區（`r_x * r_z`）挖除方塊。

- 自動偵測液體 → 放 `supportblock` 封堵
- 工具耐久 > 1000 時 `/sethome ca` → warp 到 `xpFarm` 修復 → `/back`
- 分流不對自動 `/ts` 切回
- 座標飛出區域時 `/homes ca` 拉回（需事先 `/sethome ca`）
- `materialsMode = "station"` → 透過 `station.restock()` 補 supportblock
- `materialsMode = "wms"` → 透過 WMS 倉儲取出

#### example
`/m bot ca execute`

`/m bot ca e`

> 執行前請先 `/sethome ca` 於清除區附近，確保中途可以回來。

---

### **TNT 清除**
- `tnt`

使用 TNT 炸除（呼叫 `area.tntclear`）。

#### example
`/m bot ca tnt`

---

### **設定區域**
- `set`

多種用法：

| 語法 | 行為 |
| --- | --- |
| `set p1` | 以 bot **當前腳下座標** 設為 p1 |
| `set p2` | 以 bot **當前腳下座標** 設為 p2 |
| `set p1 <x> <y> <z>` | 指定座標設為 p1 |
| `set p2 <x> <y> <z>` | 指定座標設為 p2 |
| `set <warp>` | 僅修改 `area.warp` |
| `set <server> <warp>` | 修改 `area.server` + `area.warp` |
| `set <x1> <y1> <z1> <x2> <y2> <z2>` | 同時設定 p1 與 p2（使用 bot 當前 server） |
| `set <x1> <y1> <z1> <x2> <y2> <z2> <server>` | 同時設定 p1、p2、server |

#### example

```
/m bot ca set p1
/m bot ca set p2 1984 100 960
/m bot ca set 109 JKLoveJK_12
/m bot ca set 1984 100 960 2116 -63 1092 37
```

---

### **擴展區域**
- `expand <direction> <distance>`

將現有區域沿 `direction` 方向 **擴大** `distance` 格。`p1` / `p2` 會依方向自動調整。

| direction | 擴張邊 |
| --- | --- |
| `up` | p1.y += distance（向上） |
| `down` | p2.y -= distance（向下） |
| `west` | p1.x -= distance |
| `east` | p2.x += distance |
| `north` | p1.z -= distance |
| `south` | p2.z += distance |

#### example
`/m bot ca expand up 10`

`/m bot ca expand east 32`

---

### **平移區域**
- `shift <direction> <distance>`

將整個區域（p1 與 p2 同步）沿 `direction` 平移 `distance` 格。

#### example
`/m bot ca shift north 16`

---

### **暫停 / 繼續 / 中止**
- `pause` / `p`
- `resume` / `r`
- `stop` / `s` / `c`

暫停後 bot 狀態設為 `TASK_PAUSED`；繼續為 `TASK_CLEAR_AREA`。

#### example
```
/m bot ca pause
/m bot ca resume
/m bot ca stop
```

---

### **查詢設定**
- `info`
- `i`

回報當前 `p1` / `p2` 座標。

#### example
`/m bot ca info`

---

### **測試**
- `test`

debug 用，僅列印 `bot.inventory.slots[45]?.name`（off-hand 物品名）。

---

## Config 配置

設定檔位置：`config/<bot>/clearArea.json`

首次 `init` 會以預設值自動建立。

```json
{
  "updateTime": "2026-04-18 12-00-00",
  "area": {
    "warp":   "JKLoveJK_18",
    "server": 37,
    "p1": { "x": 1984, "y": 100, "z": 960 },
    "p2": { "x": 2116, "y": -63, "z": 1092 }
  },
  "config": {
    "r_x": 16,
    "r_z": 16
  },
  "collect": {
    "enable": true,
    "frequency": "high",
    "excludeList": [
      "cobblestone",
      "redstone",
      "coal",
      "flint",
      "brain_coral_fan",
      "peony",
      "acacia_log"
    ]
  },
  "supportblock": "slime_block",
  "xpFarm": "yichen510",
  "materialsMode": "station",
  "station": "mpStation_JK.json"
}
```

### 頂層欄位

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `updateTime` | string | 最後一次 `set` / `expand` / `shift` 的時間戳（程式自動寫入） |
| `area` | object | 目標區域 |
| `config` | object | 子區分割尺寸 |
| `collect` | object | 掉落物收集設定 |
| `supportblock` | string | 封堵液體 / 支撐用的方塊（Minecraft id） |
| `xpFarm` | string | 工具耐久 > 1000 時用於修復的 warp |
| `materialsMode` | string | `"station"` 或 `"wms"`，決定 supportblock 補貨管道 |
| `station` | string | 當 `materialsMode = "station"` 時使用的材料站檔（`config/global/` 下） |

### `area`

| 欄位 | 說明 |
| --- | --- |
| `warp` | 執行區的傳點（目前未直接用於 execute，由 `/homes ca` 回家機制替代） |
| `server` | 分流號；`-1` 表示使用 bot 當前 server |
| `p1` | 立方體第一個對角點 `{x, y, z}` |
| `p2` | 立方體另一對角點 `{x, y, z}` |

> p1 / p2 順序無所謂，程式會自動交換成正規化：`p1.x < p2.x`、`p1.y > p2.y`（y 越上越大）、`p1.z < p2.z`。

### `config`

| 欄位 | 說明 |
| --- | --- |
| `r_x` | 子區在 X 軸的寬度（預設 16） |
| `r_z` | 子區在 Z 軸的寬度（預設 16） |

> 整個區域會被切成 `ceil(size.x / r_x) * ceil(size.z / r_z)` 個子區依序處理，y 方向一次到底。

### `collect`

| 欄位 | 說明 |
| --- | --- |
| `enable` | 是否收集掉落物 |
| `frequency` | 收集頻率（目前僅保留欄位） |
| `excludeList` | 不撿取的物品 id 清單 |

### 硬編碼排除清單（程式內）

下列方塊一律 **不挖**（避免破壞 beacon / spawner 等重要物件）：

```
budding_amethyst, iron_block, beacon, spawner,
black_stained_glass, white_stained_glass
```

如需加入更多，請修改 `src/clearArea.js` 中的 `BLOCK_EXCLUDE_LIST`。

### 液體處理

| 類別 | 方塊 | 行為 |
| --- | --- | --- |
| `liquid` | `lava`, `water` | 先放 `supportblock` 封堵再挖 |
| `waterLoggedBlock` | `pointed_dripstone` 且 `waterlogged=true` | 視同液體處理 |

---

## 使用建議流程

1. **設好 home**：在清除區中央執行 `/sethome ca`
2. **設區域**：飛到角落 `/m bot ca set p1` → 飛到對角 `/m bot ca set p2`
3. （選）**擴展**：`/m bot ca expand down 20` 往下再多挖 20 格
4. **查詢**：`/m bot ca info` 確認座標
5. **執行**：`/m bot ca execute`
6. **過程中**：可 `pause` / `resume` / `stop`

---

## 狀態對應

| 狀態 | 觸發時機 |
| --- | --- |
| `TASK_CLEAR_AREA` | 執行中（resume 後） |
| `TASK_PAUSED` | pause 後 |

---

## 檔案位置速查

| 檔案 | 說明 |
| --- | --- |
| `config/<bot>/clearArea.json` | 每 bot 設定 |
| `config/global/<station>.json` | 材料站設定（`station` 欄位指定） |
| `src/clearArea.js` | 指令入口 + 主邏輯 |
| `lib/area/area.js` | `normalclear` / `tntclear` 輔助 |

---

## 常見問題

- **`pfr false 重啟 clearArea`** → 尋路失敗，已自動 `/homes ca` 回家。確認 `/sethome ca` 是否設在有效位置。
- **`材料站設定檔讀取失敗` + gkill(202)** → `station` 指向的 JSON 壞了或不存在，請檢查 `config/global/` 內該檔。
- **工具一直耗盡** → `xpFarm` 填的傳點需自備修復村民 / 經驗爐；或改用 mending 工具減少耗損。
- **有些方塊沒挖到** → 檢查是否落在 `BLOCK_EXCLUDE_LIST` 中；`beacon` / `spawner` / `budding_amethyst` 是特意保留的。
- **區域太大容易卡住** → 調小 `r_x` / `r_z`（例：`8 x 8`）讓每個子區更快完成。
