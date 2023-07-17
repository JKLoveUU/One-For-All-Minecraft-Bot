# One For All 

Minecraft Bot for McFallout server.


## Contribute
- [MelonRind](https://github.com/aMelonRind) 目前的bot架構 / 突襲 
## Tutorial
- [使用教學](docs/zh_tw/usage.md)
- [設定](docs/zh_tw/setting.md)
- [地圖畫](docs/zh_tw/Mapart.md)
- [兌換](docs/zh_tw/CraftAndExchange.md)
- [EULA](docs/zh_tw/eula.md)
- [EULA](docs/zh_tw/eula.md)
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
## 已知錯誤
Discord Fetch Error 時，會重複發送dc面板

還沒init 完成時 使用某些指令會報錯

logger send to parent 會有時差 導致訊息順序不易觀看

linux 下  exitcode 過大 (>256) 

--- 
## Develop

`git clone https://github.com/JKLoveUU/Bot2.git`

`npm install`
有漏掉些沒在 package 內 
p-timeout 2.0.0 版
有修改 Mineflayer & Protocol 內部分功能
- bot.lookAt() 直接return
    node_modules\mineflayer\lib\plugins\physics.js
- swingArm() 直接return
    node_modules\mineflayer\lib\plugins\entities.js
- keepAlive Emit Error 部分 return
    node_modules\minecraft-protocol\src\client\keepalive.js

`node .`

## License
[MIT](/LICENSE)