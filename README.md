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
- [兌換](docs/zh_tw/CraftAndExchange.md)

- [突襲](docs/zh_tw/setting.md) 設定教學

## Contribute
- [MelonRind](https://github.com/aMelonRind) 目前的bot架構 / 突襲 
- [BlackChang1204](https://github.com/BlackChang1204) 撰寫設定教學
## 已知錯誤

經驗目前 總值 = 等級  等級是不準確的

Discord Fetch Error 時，會重複發送dc面板

還沒init 完成時 使用某些指令會報錯

logger send to parent 會有時差 導致訊息順序不易觀看

linux 下  exitcode 過大 (>256) 

mapart stop 時 還續繼續蓋下一張 

mapart 補材料時 分流重啟 多耗時很久

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
#### Exchange(ShopItem) 

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
    1. Clear Area
    2. ~~Villager Trading~~
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

### 格式
若有新功能 仿照src/template.js 和 lib/


## License
[MIT](/LICENSE)