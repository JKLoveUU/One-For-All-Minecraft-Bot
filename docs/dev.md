# 開發手冊
本文檔用於講解 本BOT的架構設計 核心概念

本BOT取名來源為《我的英雄學院》中的 ONE FOR ALL
他是一個可以繼承能力的個性 每一代的繼承者將自己的力量加入這個個性中
並傳給下一代

--以後再來排版--

## bot 架構

主程式 用於控制 管理所有bot
每個bot獨立開個childprocess各自執行自己的任務

Index
    initBot
        用於開始的時候設定 或創新bot 不會砍掉
		setbot
			overloading
				初始化
				設定基本狀態 cp沒有直接給
				或賦予 cp
		createBot
			創建 實際的childprocess 
			並處理關閉重啟邏輯 close
				透過 exitcode 判斷
			和 信息交互邏輯 message

## 功能模組化
參考 template

global 為 所有帳號共用的設定 像是共用材料站 突襲塔 設施甚麼的設定 
conf   一般個別帳號獨立設定 像是指定使用那座設施
```js
    const template = {
    identifier: [
        "template",
    ],
    cmd: [
        {
            name: "template TEST",
            identifier: [
                "test",
            ],
            execute: test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        }
    ],
    }
```
透過 identifier 來制定bot 收到的指令識別碼
如 /m bot args1 args2 args3
    args1 為第一個 identifier 用來分辨指令功能類別

    ( basicCommand 為例外他們可以直接被使用
      如 info bal payall find 等功能)

    arg2 : cmd  詳細的指令 個別透過自己的 execute function 實現
    test 依 longRunning 是否 來決定是否以 async func 執行 
    並加入taskqueue等待

    permissionRequre: 0, 暫無功能 計畫可以讓不同使用者依不同pmlevel操作你的bot 以bit方式去實現



