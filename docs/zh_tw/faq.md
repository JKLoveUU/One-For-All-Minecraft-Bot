# 常見問題
## Contents
1. 傳送指令後 執行馬上重啟 進入循環
2. JSON 格式錯誤
3.
4.
5.
### 1. 重啟循環

發生原因: 執行指令後出現錯誤 導致不斷關閉 重啟要自動執行錯
解決方法: 刪除該bot設定的 task.json
切勿刪除其他檔案

### 2. JSON 格式錯誤

發生原因:  如題
解決方法:  見https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/JSON_bad_parse
自行定位錯誤 
推薦使用Notepad++, VS Code 等文字編輯器開啟檢查哪裡有錯誤

### 3. 地圖畫 未發現投影

發生原因:  如題
解決方法:  不要懷疑 就真的在目前的設定找不到該檔案 
投影檔案資料夾 記得結尾加上 "/"
請設定好正確的位置

### 4. 地圖畫 設定座標回覆可能錯了

發生原因:  如題
解決方法:  不要懷疑 你座標真的錯了 如果你覺得是正確的 請到檔案裡設定

