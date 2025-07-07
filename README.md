# One For All 
[![License](https://img.shields.io/github/license/PKUFlyingPig/cs-self-learning)](https://github.com/JKLoveUU/One-For-All-Minecraft-Bot/blob/main/LICENSE)
[![Official Discord](https://img.shields.io/static/v1.svg?label=OFFICIAL&message=DISCORD&color=blue&logo=discord&style=for-the-badge)](https://discord.gg/xUWg4CJ7FC)

Minecraft Bot for McFallout server.

## Tutorial
- [EULA](docs/zh_tw/eula.md)

- [[Discord](https://discord.gg/xUWg4CJ7FC)] https://discord.gg/xUWg4CJ7FC 
- [使用教學](docs/zh_tw/usage.md)
- [設定](docs/zh_tw/setting.md)
- [指令](docs/zh_tw/commands.md)
- [地圖畫](docs/zh_tw/Mapart.md)
- ~~[兌換](docs/zh_tw/CraftAndExchange.md)~~ 該功能已被伺服器移除

- ~~ [突襲](docs/zh_tw/setting.md) 設定教學~~ 版本更新後 突襲機制改變

## Contribute
- [JKLove](https://github.com/JKLoveUU)
- [MelonRind](https://github.com/aMelonRind) 目前的bot架構 / 突襲 
- [CZKKKK](https://github.com/AvaCZK) 撰寫設定教學
- [bee0511](https://github.com/bee0511) 整理bot代碼
## 已知錯誤

[網路&DC_API錯誤] Discord Fetch Error 時，會重複發送dc面板

mapart stop 時 還續繼續蓋下一張 

mapart 補材料時 分流重啟 多耗時很久
[低概率] mapart 切換分流後 server mpdb 無 可判別背包加載完成訊息 導致切錯材料蓋錯

## Features
### Current
* Discord
    1. Pass to CMD Console
    2. Control & Forward
    3. Display Status
* Agent
    1. Task Scheduling
    2. Regular Restart (no longer necessary)
* DM Control
    1. Pass to CMD Console
* CMD Console
    1. Identify Command Source (DM / DC / Console)
    and reflect accordingly in the appropriate location

### Planing
* Discord
    1. 突襲介面
    2. 其他功能的介面
* Console
    1. 將log檔案重新命名
    2. TAB completer
    3. command usage suggest
    4. .help .?
* MC-Feature
    1. Clear Area 清理區塊
    2. Quest 自動解廢土任務
    3. ~~Villager Trading~~ 市面上已經有很多了
--- 
## Develop

`git clone https://github.com/JKLoveUU/Bot2.git`

`cd `

`npm install`

`node .`
(Node v18.16.0)

有修改 Mineflayer & Protocol 內部分功能

- bot.lookAt() 直接return
    node_modules\mineflayer\lib\plugins\physics.js
- swingArm() 直接return
    node_modules\mineflayer\lib\plugins\entities.js
- keepAlive Emit Error 部分 return
    node_modules\minecraft-protocol\src\client\keepalive.js
- [DEV](docs/dev.md)
### 格式
若有新功能 仿照src/template.js 和 lib/


## License
[MIT](/LICENSE)
