# 地圖畫功能
使用即代表同意 [EULA](/eula.md) 和 以下幾點

1. 著作權和版權：地圖畫的著作權歸原始創作者所有。使用本Bot生成的地圖畫可能涉及他人的著作權和版權。請確保你具有合法權利或獲得了相關授權，以使用和分享生成的地圖畫。

2. 法律責任：使用本Bot生成的地圖畫應遵守適用的法律法規。使用者應自行承擔因使用地圖畫而可能導致的法律責任和糾紛。

3. 地圖畫內容：使用本Bot生成的地圖畫可能包含圖像、文字、標誌等內容。請確保生成的地圖畫內容不包含任何侵犯他人權益、違反道德、宣揚暴力或歧視的內容。

4. 免責聲明：本Bot的開發者和維護者對於使用本Bot生成的地圖畫所造成的任何損失、糾紛或責任不承擔任何責任。使用者應自行承擔使用本Bot的所有風險和後果。

[廢土地圖畫版權規定](https://discord.com/channels/358942292352040970/465960604427878420/846712252169977856)

[廢土地圖畫分級規定](https://discord.com/channels/358942292352040970/465960604427878420/925808493951340585)

[廢土地圖畫分級展示規定](https://discord.com/channels/358942292352040970/465960604427878420/858618967248732206)
## 設定
[seehere](/Mapart.md)
## 主指令

- mapart
- mp
- map

## 指令

--- 

### **地圖畫設定**
- set

設定要改的地圖畫投影檔案 和 座標
#### Syntax
`set <filename> <x> <y> <z>`
#### example

`/m bot mapart set mapart.nbt -7232 100 -2369`

The below example shows how to set file under `雜魚納西達` folder.

`/m bot mapart set 雜魚納西達/mapart_0_0.nbt -7232 100 -2369`

*依據 config/global/mapart.json 的投影資料夾去設定

*若在資料夾中 前面加上資料夾名稱即可

*此指令會檢查座標是否符合地圖畫規範 若有設定其他座標需求 於config/`<bot>`/mapart.json 自行設定

---

### **查詢**
- info
- i

返回當前檔案名稱 和建造進度 
#### example
`/m bot mapart info`

---

### **建造**
- build `<args>`
- b `<args>`
#### example
`/m bot mapart build -a`  自動設定蓋到找不到下張檔案

`/m bot mapart build -a 3_3` 自動蓋到 3_3 (含) 停止   

`/m bot mapart build -s 67` 設定在67分流蓋 並自動傳去67分流

`/m bot mapart build -n`  蓋完不發送Discord通知

`/m bot mapart build -a -n ` 只發送最後一張Discord結束通知

`/m bot mapart build -a -n -s 67` 只發送最後一張Discord結束通知
#### Arguments
| Args      | Description   |
| --------- | ------------- |
| -auto `<index>`| 自動蓋到找不到檔案(若未止定 則蓋到找不到下張檔案)       |
| -a `<index>`| ..      |
| -server `<server>` | 自動模式下 只需第一張設定 後續將自動套用相同設定 可以不選        |
| -server `<server>` | .. |
| -n        | 關閉Discord通知       |

---

### **暫停**
- pause
- p

暫停建造
#### example
`/m bot mapart pause`

---

### **繼續**
- resume
- r

繼續建造
#### example
`/m bot mapart resume`

---

### **中止**
- stop
- s

中止建造
#### example
`/m bot mapart stop`

---

### **開圖**
- open
- o

/warp傳送後 在該位置 按設定大小開圖

*目前沒有設定指令 需於config/`<bot>`/mapart.json 自行設定

#### example
`/m bot mapart open`

---

### **命名**
- name
- n

命名地圖畫 `&b0-0`

若有設定名稱則會是 `MapartName &r- &b0-0`

~~或許之後會多從一開始 和 單index(0-n)~~

*目前沒有設定指令 需於config/`<bot>`/mapart.json 自行設定
#### example
`/m bot mapart name`

---

### **複印**
- copy
- c

複印指定張數地圖畫 不可大於 64

*目前沒有設定指令 需於config/`<bot>`/mapart.json 自行設定
#### example
`/m bot mapart copy`


---

### **分裝**
- wrap
- w

於input shulker box 中 取出

並放出 output shulker box 後 點及按鈕分裝

*目前沒有設定指令 需於config/`<bot>`/mapart.json 自行設定
#### example
`/m bot mapart wrap`
