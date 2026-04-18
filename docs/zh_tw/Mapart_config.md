# 地圖畫設定 Mapart Config

本文件說明三份設定檔的用途、欄位、以及推薦設定流程。

指令使用請見 [Mapart.md](./Mapart.md)。

---

## 檔案總覽

| 檔案 | Scope | 用途 |
| --- | --- | --- |
| `config/global/mapart.json` | 全 bot 共用 | 投影檔資料夾、Discord webhook、方塊替換表 |
| `config/<bot>/mapart.json` | 單 bot | 當前投影檔、材料站、開圖 / 分裝場地 |
| `config/global/mpStation_<name>.json` | 全 bot 共用 | 材料站盒子座標表（由 bot cfg 的 `station` 指向） |

> 首次執行若檔案不存在會自動寫入預設值。JSON 壞掉時 bot 會以 gkill(202) 退出並在 console 提示語法錯誤。

---

## 1. 全域設定：`config/global/mapart.json`

```json
{
    "schematic_folder": "C:/Users/JKLove/Documents/schematics/",
    "discord_webhookURL": "https://discord.com/api/webhooks/xxx/yyy",
    "replaceMaterials": [
        ["tnt", "redstone_block"],
        ["oak_leaves", "birch_leaves"],
        ["_packed_ice", "ice"]
    ]
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `schematic_folder` | string | **絕對路徑**，投影檔（`.nbt` / `.litematic`）根目錄。路徑分隔使用 `/`。 |
| `discord_webhookURL` | string | 建造完成 / 失敗 / 進度通知 webhook |
| `replaceMaterials` | `[from, to][]` | 方塊替換規則，`from` 可為前綴（`_packed_ice` 會匹配 `blue_packed_ice` 等） |

### replaceMaterials 用途

地圖畫投影檔中某些方塊在廢土伺服器沒有／被禁／等效像素，可於蓋設前自動替換。

範例：
- `["tnt", "redstone_block"]` — 蓋圖時把 TNT 全部換成紅石方塊
- `["_packed_ice", "ice"]` — 所有 packed_ice 系列換成一般 ice

---

## 2. 每 Bot 設定：`config/<bot>/mapart.json`

```json
{
    "schematic": {
        "filename": "雜魚納西達/mapart_0_0.nbt",
        "placementPoint_x": -7232,
        "placementPoint_y": 100,
        "placementPoint_z": -2369
    },
    "materialsMode": "station",
    "station": "mpStation_JK.json",
    "open": {
        "folder": "暫時用不到",
        "warp": "JKLoveJK_10",
        "height": 9,
        "width": 6,
        "open_start": -1,
        "open_end": -1
    },
    "wrap": {
        "warp": "JKLoveJK_10",
        "height": 9,
        "width": 6,
        "origin": [0, 0, 0],
        "anvil": [0, 0, 0],
        "anvil_stand": [0, 0, 0],
        "cartography_table": [0, 0, 0],
        "cartography_table_stand": [0, 0, 0],
        "facing": "north",
        "name": "ExampleMP_Name",
        "source": "https://www.pixiv.net/artworks/92433849",
        "artist": "https://www.pixiv.net/users/3036679",
        "copy_amount": 1,
        "copy_f_shulker": [0, 0, 0],
        "wrap_input_shulker": [0, 0, 0],
        "wrap_output_shulker": [0, 0, 0],
        "wrap_button": [0, 0, 0]
    }
}
```

### 2.1 `schematic` — 當前投影檔

| 欄位 | 說明 |
| --- | --- |
| `filename` | 投影檔名（相對 `schematic_folder`）。含資料夾時用 `/` 分隔，例：`雜魚納西達/mapart_0_0.nbt` |
| `placementPoint_x/y/z` | 投影起始座標（左下角原點） |

> 通常不手動改，使用 `mp set <filename> <x> <y> <z>` 或 `mp build -a` 自動更新。

### 2.2 `materialsMode` — 材料補貨模式

目前使用 `"station"`，搭配下方 `station` 欄位對應的材料站 JSON。

### 2.3 `station` — 指向的材料站

`config/global/` 下的 mpStation 檔名，例：`"mpStation_JK.json"` 會讀取 `config/global/mpStation_JK.json`。

### 2.4 `open` — 開圖設定

用於 `mp open` 指令，於 `warp` 的位置批次右鍵開地圖。

| 欄位 | 說明 |
| --- | --- |
| `folder` | (未使用) |
| `warp` | 開圖傳點 |
| `height` / `width` | 地圖畫拼接尺寸（張數） |
| `open_start` / `open_end` | 只開啟指定區間的 index（`-1` = 全部） |

### 2.5 `wrap` — 複印 / 命名 / 分裝設定

用於 `mp copy` / `mp name` / `mp wrap` 指令。

| 欄位 | 說明 |
| --- | --- |
| `warp` | 操作場地傳點 |
| `height` / `width` | 地圖畫尺寸 |
| `origin` | 分裝區原點 |
| `anvil` | 鐵砧方塊座標 |
| `anvil_stand` | 操作鐵砧時站位 |
| `cartography_table` | 製圖台座標 |
| `cartography_table_stand` | 操作製圖台站位 |
| `facing` | 地圖面向：`north` / `south` / `east` / `west`（影響排版方向） |
| `name` | 地圖名稱（搭配 `mp name` 產生 `<name> &r- &b0-0`） |
| `source` | 作品來源（供 Discord embed） |
| `artist` | 作者連結（供 Discord embed） |
| `copy_amount` | 一次複印張數（≤ 64） |
| `copy_f_shulker` | 複印用的成品盒位置 |
| `wrap_input_shulker` | 分裝時輸入盒位置 |
| `wrap_output_shulker` | 分裝時輸出盒位置 |
| `wrap_button` | 分裝按鈕座標 |

### facing 對應方向

| facing | 方塊增量 inc_dx, inc_dy, inc_dz |
| --- | --- |
| `north` | `-1, -1, 0` |
| `south` | `1, -1, 0` |
| `east` | `0, -1, -1` |
| `west` | `0, -1, 1` |

---

## 3. 材料站：`config/global/mpStation_<name>.json`

```json
{
    "stationName": "JK",
    "stationWarp": "JKLoveJK_2",
    "stationServer": 59,
    "offset": {
        "N":  [0, 1, -3],
        "S":  [0, 1, 3],
        "W":  [-3, 1, 0],
        "E":  [3, 1, 0],
        "bN": [0, 1, -2],
        "bS": [0, 1, 2],
        "bW": [-2, 1, 0],
        "bE": [2, 1, 0]
    },
    "overfull": [-3996, 99, -4037, "W", "bW"],
    "materials": [
        ["white_wool",  [-4005, 99, -4002, "E", "bE"]],
        ["orange_wool", [-4005, 99, -4003, "E", "bE"]],
        ["cobblestone", [-3996, 99, -4002, "W", "bW"]]
    ]
}
```

### 3.1 頂層欄位

| 欄位 | 說明 |
| --- | --- |
| `stationName` | 材料站顯示名稱（log 用） |
| `stationWarp` | 材料站傳點 |
| `stationServer` | 材料站分流號 |
| `offset` | 站位 / 按鈕相對盒子的位置偏移（見下） |
| `overfull` | 「溢出箱」座標（盒子放太滿時的回收處） |
| `materials` | 材料盒清單 |

### 3.2 `offset` 對照

Key 代表從盒子看出去的方向：

| Key | 意義 |
| --- | --- |
| `N` / `S` / `W` / `E` | 站位方向（距盒子約 3 格） |
| `bN` / `bS` / `bW` / `bE` | 按鈕方向（距盒子約 2 格） |

範例 `E = [3, 1, 0]` = 盒子東方 3 格、向上 1 格 = 站位；`bE = [2, 1, 0]` = 東方 2 格向上 1 格 = 按鈕。

> 若 offset 對應值缺失，程式會 fallback 用 `comparator` 判斷方向（不建議依賴）。

### 3.3 `materials` 每項結構

```json
["<方塊名>", [x, y, z, "<站位方向>", "<按鈕方向>"]]
```

- `<方塊名>`：minecraft id（無 `minecraft:` 前綴）
- `[x, y, z]`：盒子座標
- `<站位方向>`：`N`/`S`/`W`/`E`
- `<按鈕方向>`：`bN`/`bS`/`bW`/`bE`

### 3.4 使用 `mp material` 自動產生

手抄材料座標很麻煩，可用下列指令在材料站即時掃描生成：

```
/m bot mp material <server> <warp> <x1> <y1> <z1> <x2> <y2> <z2>
```

- `(x1, y1, z1)`：掃描起點（第一個盒子上緣）
- `(x2, y2, z2)`：掃描終點
- 起/終點需共用同一 x 或 z 軸（程式以此判斷方向）
- bot 會依自身相對位置自動推出 `E/W/N/S`

掃完後 **匯出到 JSON 檔**：

```
/m bot mp file <filename>
```

會輸出 `<filename>.json` 到 bot 執行目錄（非 `config/global/`，需手動搬過去）。

---

## 建議設定流程

1. 在**全域** `mapart.json` 填 `schematic_folder`（投影檔來源）與 `discord_webhookURL`
2. 把投影檔放進 `schematic_folder`（支援 `.nbt` / `.litematic`，可分資料夾）
3. 規劃材料站，於伺服器內放好成排潛影盒
4. 用 `mp material` + `mp file` 產出 `mpStation_<name>.json`，放進 `config/global/`
5. 在**各 bot** `mapart.json`
   - `station` 填 `mpStation_<name>.json`
   - `open.warp` / `wrap.warp` 填實際開圖與分裝場地
   - 初次蓋圖用 `mp set <filename> <x> <y> <z>` 寫入 `schematic` 欄位
6. `mp build -a` 啟動自動建造

---

## 除錯

- **載入失敗 gkill(202)** → JSON 語法錯誤，看 console stderr 的 `Error Msg`；對照 [MDN JSON_bad_parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse)
- **投影找不到** → 確認 `schematic_folder` 絕對路徑 + `schematic.filename` 相對路徑正確，注意 `/` vs `\`
- **補料失敗 / 盒子找不到** → 檢查 `mpStation_*.json` 中該方塊名的座標，或 bot 與盒子距離 > 100 格時會自動重傳 warp
- **新增欄位沒作用** → 首次載入時程式會 `deepMergeDefaults`，若手動改預設值需重啟 bot
