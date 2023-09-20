# BOT設定

## discord Bot相關
### token:
1. [登入以下這個網站](https://discord.com/developers/applications)
2. 點擊右上角 "New Application"按鈕
3. 輸入Bot名稱(沒有限制 開心就好)
4. 勾選下方按鈕同意協議後點擊"create"
5. 點擊左側第三欄的"Bot"
6. 點擊Bot頭像旁邊的"Reset Token" 再點擊"Yes, do it!"
7. 接下來點擊"Copy"即可複製Bot token

||人美心善的我||這邊給看完教學還是不會使用的人附上[影片連結](https://youtu.be/Et03Y7adSSM) 照著做就行了
ps 別想著來搞我 token已經重置了
### 將bot邀入自己的群組:
1. 進入到剛剛你建立的Bot設定內
2. 點選左側"OAuth2">"URL Generator">勾選"bot">再勾選下方的"Administrator"
3. 點擊下方copy按鈕並貼製瀏覽器內
4. 選擇你要讓bot加入的群組
5. 點確定
6. [影片傳送門](https://youtu.be/YGnT_7fKPCA)

### Application ID
1. 進入到剛剛你建立的Bot設定內
2. 點擊左側"General Information"
3. 右側視窗有個"copy"按鈕看其是否對應"APPLICATION ID"
4. 同樣 點擊copy即可複製
5. [影片傳送門](https://youtu.be/cdrtJ2It5eM)
### Discord Guild ID
1. 開啟discord
2. 照以下步驟進行 
設定>進階>開發者模式開啟
3. 建立一個群組(或挑選一個你有最高權限的群組)
4. 對左側群組頭像右鍵>複製伺服器ID
5. [影片傳送門](https://youtu.be/TIyXYBQJeFY)
### Discord Channel ID
1. 進入你剛才建立的群組
2. 選擇或建立一個文字頻道>點擊右鍵>複製頻道ID 
3. [影片傳送門](https://youtu.be/kSo4VOx1BEw)
### Discord user ID
1. 隨便在一個地方發送訊息
2. 對自己的頭像點右鍵>複製使用者ID
3. [影片傳送門](https://youtu.be/mnRDTHgG9dI)
### Discord roles ID
1. 在群內建立或選擇一個身分組 
2. 對其右鍵>複製身分ID
3. [影片傳送門](https://youtu.be/dAtyK2Ydih8)
## 檔案設置
### **config.toml這邊不進行教學，檔案內有內建了

### profiles.json
這邊需要先解釋一下檔案結構，以便講解如何多開
- 黃框為一隻帳號的資訊 當你想要增加或減少帳號數量 只要將黃框圈起來的部分複製或刪除即可
- 粉框內的字串請不要與任何其他文件中的帳號相同，否則有報錯的可能
- ***!請注意!紅框內的代碼無論開幾隻帳號請放在最後一欄且必須保留 因為兩者在最後有一個逗點的區別 這足以影響程式可否正常運作**
![](https://hackmd.io/_uploads/H1xyIAX62.png)



這邊放幾個例子 如果想要開三隻帳號 如下
```
{
  "Example1": {
    "username": "任意不重複Example1",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
    "chat": true,
    "debug": false
  },
    "Example2": {
    "username": "任意不重複Example1",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
    "chat": true,
    "debug": false
  },
  "Example3": {
    "username": "任意不重複Example2",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
	"chat": true,
    "debug": false
  }
}
```

開一隻帳號則如下
```
{
  "Example2": {
    "username": "任意不重複Example2",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
	"chat": true,
    "debug": false
  }
}
```

再來講解的每行設定檔所代表的意思
```
{
  "Example2": {                            #Bot名稱(不一定要是遊戲名稱，可自定義)
    "username": "任意不重複Example2",       #使用者信箱，跟HateBot同理，可隨機輸入字母數字，但不可與其他帳號相同
    "host": "mcfallout.net",               #伺服器IP
    "port": "",                            #port預設25565，建議不填
    "type": "general",                     #現階段不可更改，另外兩個作者尚未完成
    "chat": true,                          #在console黑窗中顯示遊戲聊天室訊息
    "debug": false                         #在console黑窗顯示debug信息
  }
}
```
若格式跑掉可以複製以下這段
```
{
  "Example1": {
    "username": "任意不重複Example1",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
    "chat": true,
    "debug": false
  },
  "Example2": {
    "username": "任意不重複Example2",
    "host": "mcfallout.net",
    "port": "",
    "type": "general",
    "chat": true,
    "debug": false
  }
}
```
### mapart.json
檔案路徑: `\config\你的Bot名稱\mapart.json`
```
{
	"schematic": {
		"filename": "abc_5_5.nbt",    # 投影檔名 支持 litematica 格式的地圖畫檔案
		"placementPoint_x": 1984,     # 放置投影的X座標
		"placementPoint_y": 101,      # 放置投影的Y座標
		"placementPoint_z": 4159      # 放置投影的Z座標
	},
	"materialsMode": "station",     # 目前僅支援 "station"
	"station": "station_xx.json",   # 材料站設定檔的檔名
	"open": {                       # 請確保材料站內有 glow_item_frame, quartz_block, map
		"folder": "暫時用不到",		 	
		"warp": "Example_10",		# 開圖warp(設在第一張地圖畫的區域內)
		"height": 9,				# 高
		"width": 6,					# 寬
		"open_start": -1,			# 無用
		"open_end": -1				# 無用
	},
	"wrap": {						# 分裝 複印 命名 設定
		"warp": "Example_10",		# 工作點 warp
		"height": 9,				# 高
		"width": 6,					# 寬
		"origin": [					# 左上地圖畫座標
			0,
			0,
			0
		],
		"anvil": [					# 鐵砧座標
			0,
			0,
			0
		],
		"anvil_stand": [			# 用鐵砧時 bot站的位置
			0,
			0,
			0
		],
		"cartography_table": [		# 製圖台座標
			0,
			0,
			0
		],
		"cartography_table_stand": [# 用製圖台時 bot站的位置
			0,
			0,
			0
		],
		"facing": "north",			# 地圖畫朝向方向(以地圖畫為準)
		"name": "ExampleMP_Name",	# 改名用的  會自動套用以下格式 可不填 改名僅index
		"source": "https://www.pixiv.net/artworks/92433849", 	# 無用
		"artist": "https://www.pixiv.net/users/3036679", 		# 無用
		"copy_amount": 1,			# 複印數量 (must not greater than 64)
		"copy_f_shulker": [			# 複印輸出的第一個盒子座標
			0,
			0,
			0
		],
		"wrap_input_shulker": [		# 分裝輸入
			0,
			0,
			0
		],
		"wrap_output_shulker": [	# 分裝輸出 弄台卸合機
			0,
			0,
			0
		],
		"wrap_button": [			# 輸出按鈕
			0,
			0,
			0
		]
	}
}
```
### mapart.json
檔案路徑: `\config\global\mapart.json`
```
{
	"schematic_folder": "C:/Users/User/AppData/Roaming/.minecraft/schematics/",           
    #投影檔的資料夾 (請把所有'\' 換成 '\\' 或是'/')
	"discord_webhookURL": "https://discord.com/api/webhooks/1143516310496624682/9D7YCIZeWkqhkdai3VEOY9M_1rnB452yl3Vy4jNEm4aSMiz0wtXC8DBT8CeQ3oqnwDG-",
    #webhook網址(須建立於你希望bot發送通知訊息的文字頻道)
	"replaceMaterials": [

	]
	#材料替代(有設定好檔案基本用不到)
	#裡面填[] array 若>1項 需用,隔開
	# ex:
	#	"replaceMaterials": [
			[
				"packed_ice",
				"ice"
			],
	#		[
				"cobweb",
				"mushroom_stem"
			]
	# ]
}
```
[webhook建立教學](https://youtu.be/JtN9Z84cKBc)
### station_xx.json
檔案路徑: `\config\global\station_xx.json` 
materials內格式: ["材料名稱"       ,[盒子的X座標,盒子的Y座標,盒子的Z座標,"盒子位於以Bot為中心的那個方位","按鈕方位，與Bot方位同樣只是前面加個b"]],
需參考傳點請前往`/warp JKLoveJK_2`或`/warp BlackChangTW_2`
材料站和"offset"的所有內容新手建議直接照抄，因為可能導致Bot無法運作
貼心的我再次送給各位藍圖 [點我下載](https://cdn.discordapp.com/attachments/1143934203113767094/1144173702733385808/mapart.litematic)
```
{
	"stationName": "Bot",                      #材料站名稱(可自定義)
	"stationWarp": "BlackChangTW_2",           #材料站傳點
	"stationServer": 1,                        #材料站分流
	"offset":{                                 #偏移值 新手不建議修改
		"N": [0,1,-3],
		"S": [0,1,3],
		"W": [-3,1,0],
		"E": [3,1,0],
		"bN": [0,1,-2],
		"bS": [0,1,2],
		"bW": [-2,1,0],
		"bE": [2,1,0]
	},
	"overfull":[279,24,-210,"W","bW"],         #當材料有多且放不會盒內時會統一放在這裡
	"materials":[
		["slime_block"       ,[270,24,-240,"E","bE"]],
		["birch_planks"      ,[270,24,-239,"E","bE"]],
		["mushroom_stem"     ,[270,24,-238,"E","bE"]],
		["redstone_block"  ,[270,24,-237,"E","bE"]],
		["packed_ice"      ,[270,24,-236,"E","bE"]],
		["iron_block"        ,[270,24,-235,"E","bE"]],
		["oak_leaves"        ,[270,24,-234,"E","bE"]],
		["clay"        ,[270,24,-233,"E","bE"]],
		["jungle_planks"  ,[270,24,-232,"E","bE"]],
		["cobblestone"        ,[270,24,-231,"E","bE"]],
		["oak_planks"      ,[270,24,-230,"E","bE"]],
		["quartz_block"        ,[270,24,-229,"E","bE"]],
		["white_wool"       ,[270,24,-228,"E","bE"]],
		["orange_wool"       ,[270,24,-227,"E","bE"]],
		["magenta_wool"         ,[270,24,-226,"E","bE"]],
		["light_blue_wool"       ,[270,24,-225,"E","bE"]],
		["yellow_wool" ,          [270,24,-224,"E","bE"]],
		["lime_wool",         [270,24,-223,"E","bE"]],
		["pink_wool",       [270,24,-222,"E","bE"]],
		["gray_wool",          [270,24,-221,"E","bE"]],
		["light_gray_wool",      [270,24,-220,"E","bE"]],
		["cyan_wool",        [270,24,-219,"E","bE"]],
		["purple_wool"  ,         [270,24,-218,"E","bE"]],
		["blue_wool"  ,       [270,24,-217,"E","bE"]],
		["brown_wool",         [270,24,-216,"E","bE"]],
		["green_wool"  ,[270,24,-215,"E","bE"]],
		["red_wool",[270,24,-214,"E","bE"]],
		["black_wool"  ,[270,24,-213,"E","bE"]],
		["block_of_gold" ,[270,24,-212,"E","bE"]],
		["prismarine_bricks" ,[270,24,-211,"E","bE"]],
		["lapis_block"   ,[270,24,-210,"E","bE"]],
		["black_terracotta" ,[270,24,-209,"E","bE"]],
		["emerald_block"            ,[270,24,-208,"E","bE"]],
		["spruce_planks"		,[270,24,-207,"E","bE"]],

		
		["netherrack"		,[279,24,-240,"W","WE"]],
		["white_terracotta"	,[279,24,-239,"E","bE"]],
		["orange_terracotta"	,[279,24,-238,"W","WE"]], 
		["magenta_terracotta"	,[279,24,-237,"W","WE"]],
		["light_blue_terracotta"	,[279,24,-236,"W","WE"]],
		["yellow_terracotta"	,[279,24,-235,"W","WE"]],
		["lime_terracotta"	,[279,24,-234,"W","WE"]],
		["pink_terracotta"	,[279,24,-233,"W","WE"]],
		["gray_terracotta"	,[279,24,-232,"W","WE"]],
		["light_gray_terracotta"	,[279,24,-231,"W","WE"]],
		["cyan_terracotta"	,[279,24,-230,"W","WE"]],
		["purple_terracotta"	,[279,24,-229,"W","WE"]],
		["blue_terracotta"	,[279,24,-228,"W","WE"]],
		["brown_terracotta"	,[279,24,-227,"W","WE"]],
		["green_terracotta"	,[279,24,-226,"W","WE"]],
		["red_terracotta"	,[279,24,-225,"W","WE"]],
		["black_terracotta"	,[279,24,-224,"W","WE"]],
		["crimson_nylium"	,[279,24,-223,"W","WE"]],
		["crimson_planks"	,[279,24,-222,"W","WE"]],
		["crimson_hyphae"	,[279,24,-221,"W","WE"]],
		["warped_nylium"	,[279,24,-220,"W","WE"]],
		["warped_planks"	,[279,24,-219,"W","WE"]],
		["warped_hyphae"	,[279,24,-218,"W","WE"]],
		["warped_wart_block",[279,24,-217,"W","WE"]],
		["cobbled_deepslate",[279,24,-216,"W","WE"]],
		["raw_iron_block"		,[279,24,-215,"W","WE"]],
	  ]
}
```