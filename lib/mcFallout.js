const process = require('process');
const CNTA = require('chinese-numbers-to-arabic');
const sd = require('silly-datetime');
const { Vec3 } = require('vec3')
const { once } = require('events')
const pTimeout = require('p-timeout');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const openPreventList = ["map", "filled_map", "bone", "stick", "golden_shovel", "fishing_rod","villager_spawn_egg","zombie_spawn_egg","name_tag","ghast_spawn_egg"];
let lastChat = Date.now();
const mcFallout = {
	getFreeDebugStaff: async function (bot) {
		let fail = false;
		try {
			await new Promise(async (res, rej) => {
				const timeout = setTimeout(() => {
					fail = true;
					rej();
				}, 15_000)
				bot.chat(`/chestcommands open category-5-5.yml`)
				await once(bot, 'windowOpen')
				if (!fail) {
					await bot.simpleClick.leftMouse(21)
					if (!fail) {
						clearTimeout(timeout)
						res();
					}

				}
			})
			try { bot.closeWindow(bot.currentWindow) } catch (err) { }
		} catch (e) {
			console.log("獲取失敗")
		}
	},
	openPreventSpecItem: async function (bot) {
		//console.log(bot.heldItem);
		if (!bot.heldItem) return
		if (openPreventList.includes(bot.heldItem.name)) {
			let findFirstCanSwapSlot = -1;
			for (let i = bot.inventory.inventoryStart; i < bot.inventory.slots.length; i++) {
				if (bot.inventory.slots[i] == null) {
					findFirstCanSwapSlot = i;
					break;
				}
				else if (openPreventList.indexOf(bot.inventory.slots[i].name) == -1) {
					findFirstCanSwapSlot = i;
					break;
				}
			}
			if (findFirstCanSwapSlot == -1) {
				console.log("背包無空閒位置可替換 黑單物品開箱物品");
				return;
			} else {
				let ori_slot = bot.heldItem.slot;
				// console.log(ori_slot)
				// console.log(findFirstCanSwapSlot)
				await bot.clickWindow(ori_slot, 0, 0)
				await bot.waitForTicks(1)
				await bot.clickWindow(findFirstCanSwapSlot, 0, 0)
				await bot.waitForTicks(1)
				await bot.clickWindow(ori_slot, 0, 0)
				await bot.waitForTicks(1)
				// console.log("替換完成")
			}
		}
	},
	// 這個func 貌似還有問題 切換過去沒有等到waitProfile 
	promiseTeleportServer: async function (bot, server, timeout = 15_000) {
		timeout *= 2
		while (bot.botinfo.server != server) {
			let rs = await mcFallout.teleportServer(bot, server, timeout)
			if(rs == true) return true;
		}
	},
	teleportServer: async function (bot, server, timeout = 15_000) {
		bot.logger(true, 'INFO', process.argv[2], `切換分流 當前 ${bot.botinfo.server} 目標 ${server}`)
		let needWaitProfile = false;
		let loadProfile = false;
		if (bot.botinfo.server != server) {
			needWaitProfile = true;
		}
		// console.log("需要等待人物載入", needWaitProfile)
		// 這不是promise 還要補then
		while (bot.botinfo.server != server) {
			if (Date.now() - lastChat > 5000) {
				bot.chat(`/ts ${server}`)
				bot.logger(true, 'INFO', process.argv[2], `/ts ${server} 等待分流載入中...`)
				lastChat = Date.now();
			} else {
				const waitMs = 5000 - (Date.now() - lastChat);
				await sleep(waitMs);
				continue;
			}
			let waitChangeServerStartTime = Date.now();
			let success = false;
			bot.on("message", profileLoadCheck);
			while (Date.now() - waitChangeServerStartTime < timeout) {
				if (!needWaitProfile && bot.botinfo.server == server ) {
					success = true
					break;
				}
				if (needWaitProfile && loadProfile) {
					bot.logger(true, 'INFO', process.argv[2], `切換分流 \x1b[92m完成\x1b[0m 耗時 \x1b[33m${Date.now() - waitChangeServerStartTime}\x1b[0m ms`);
					success = true;
					break;
				}
				await sleep(100);
			}
			if (success) return true;
			else {
				if (!loadProfile) {
					try {
						bot.off("message", profileLoadCheck);
					} catch (e) { console.log(e) }
				}
				console.log(`切換分流超時`);
				return false;
			}
		}
		//server
		async function profileLoadCheck(jsonMsg) {
			let loadDataRegex = /\[系統\] 讀取人物成功。/;
			//  [系統] 你進入具有 [操作物權限] 的領地 。 雙擊空白鍵可消耗時數進行飛行。
			//old 2022 08 05    /\[統計系統\] 讀取統計資料成功./
			//old 2022 08 20			/讀取統計資料成功./g
			let ldR = loadDataRegex.test(jsonMsg.toString());
			if (ldR) {
				loadProfile = true;
				bot.logger(true, 'INFO', process.argv[2], "\x1b[92m分流伺服器加載完成\x1b[0m")
				bot.off("message", profileLoadCheck);
			}
		}
	},
	// 這不是promise  還要補then
	promiseWarp: async function (bot, warp, timeout = 15_000) {
		await mcFallout.warp(bot, warp, timeout)
	},
	waitChangeServer: async function (bot, maxtime) {
		// let temp=getRandomInt(1,64);
		// console.log(temp);
		// bot.chat(`/ts ${temp}`)
		if (!maxtime) maxtime = 30000;
		let waitChangeServerStartTime = Date.now();
		let loadProfile = false;
		let success = false;
		bot.on("message", lDcheck);
		while (Date.now() - waitChangeServerStartTime < maxtime) {
			if (loadProfile) {
				console.log(`切換分流完成 耗時 ${Date.now() - waitChangeServerStartTime} ms`);
				success = true;
				break;
			}
			await sleep(100);
		}
		if (success) return 1;
		else {
			if (!loadProfile) {
				try {
					bot.off("message", lDcheck);
				} catch (e) { console.log(e) }
			}
			console.log(`切換分流超時`);
			return 0;
		}
		async function lDcheck(jsonMsg) {
			//let loadDataRegex =  /\[系統\] 你進入具有 \[操作物權限\] 的領地/g; 
			let loadDataRegex = /\[系統\] 讀取人物成功。/;
			//  [系統] 你進入具有 [操作物權限] 的領地 。 雙擊空白鍵可消耗時數進行飛行。
			//old 2022 08 05    /\[統計系統\] 讀取統計資料成功./
			//old 2022 08 20			/讀取統計資料成功./g
			let ldR = loadDataRegex.test(jsonMsg.toString());
			if (ldR) {
				loadProfile = true;
				bot.off("message", lDcheck);
			}
		}
	},
	waitProfileLoad: async function (bot) {

	},
	/**
	 * 
	 * @param {*} bot 
	 * @param {string[]} targetUser 
	 * @returns 
	 */
	getPlayerServer: async function (bot, targetUser) {
		let result = {}
		for (let i = 0; i < targetUser.length; i++) {
			result[targetUser[i]] = -1;
		}
		bot.on("message", mtTarget)
		bot.chat("/glist")
		let waitMSG = true;
		let stopMTTARGET = setTimeout(() => {
			try {
				bot.off('message', mtTarget);
				console.log("glist Timeout")
			} catch (e) {
				console.log("glist Timeout 強制結束錯誤")
			}
			waitMSG = false
		}, 5000);
		async function mtTarget(jsonMsg) {
			let msg = jsonMsg.toString();
			let glistReg = /\[\w+\] \(\d+\): ([\s\w(,)*])*/g;
			let glistEnd = /Total players online: (\d+)/g;
			let crtServer = msg.split(']')[0].substr(1, this.length)
			if (msg.match(glistReg)) {
				let m2 = msg.replace(/\s+/g, '')
				let users = m2.split(':')[1].split(',');
				for (let user of users) {
					if (targetUser.includes(user)) {
						//console.log(`Found At ${crtServer}`)
						result[user] = crtServer;
						//bot.off('message',mtTarget);
						//clearTimeout(stopMTTARGET);
					}
				}
			}
			if (msg.match(glistEnd)) {
				bot.off('message', mtTarget);
				clearTimeout(stopMTTARGET);
				waitMSG = false
			}
		}
		while (waitMSG) {
			await sleep(50)
		}
		// if(result != -1){
		// 	bot.chat(`/m ${playerid} Found Player At ${result}`);
		// }else{
		// 	bot.chat(`/m ${playerid} Player Not Found`);
		// }
		//console.log(result)
		return result;
	},
	rTextNoColor: function (jsonm) {
		let result = '';
		itrText(jsonm);
		function itrText(jsonms) {
			for (i in jsonms) {
				if (Array.isArray(jsonms[i])) {
					itrText(jsonms[i])
				}
				else {
					if (i == 'text') {
						result += jsonms[i]
					} else {
						if (typeof jsonms[i] == 'boolean') continue
						else if (typeof jsonms[i] == 'string') continue
						itrText(jsonms[i]);
					}
				}

			}
		}
		return result
	},
	warp: async function (bot, warpp, timeout = 15_000, log = false) {
		let fail = false;
		try {
			await new Promise(async (res, rej) => {
				const to = setTimeout(() => {
					fail = true;
					rej()
				}, timeout)
				bot.chat(`/warp ${warpp}`)
				await once(bot, 'forcedMove', onforcedMove_)	//太常執行的話這個數量會過多 ex 分流重啟 過不去
				if (!fail) {
					if (log) bot.logger(false, "INFO", process.argv[2], `warp ${warpp} - 傳送完成`)
					clearTimeout(to)
					res()
				}
			})
			return true;
		} catch (e) {
			bot.logger(true, 'WARN', process.argv[2], `warp ${warpp} - 傳送失敗`)
			return false;
		}
		function onforcedMove_() {
			return
		}
	},
	tpc: async function (bot, owner, index) {
		let fail = false;
		try {
			await new Promise(async (res, rej) => {
				const timeout = setTimeout(() => {
					fail = true;
					rej();
				}, 15_000)
				bot.chat(`/tpc ${owner}`)
				await once(bot, 'windowOpen')
				if (!fail) {
					console.log("menu open")
					await bot.simpleClick.leftMouse(8 + index)
					console.log("等待傳送")
					await once(bot, 'forcedMove')
					if (!fail) {
						console.log(`傳送完成 - tpc_${owner}_${index}`)
						clearTimeout(timeout)
						res();
					}

				}
			})
			try { bot.closeWindow(bot.currentWindow) } catch (err) { }
		} catch (e) {
			console.log("傳送失敗")
		}

	},
	sethome: async function (bot, homeName, timeout = 15_000, log = false) {
		let fail = false;
		try {
			await new Promise(async (res, rej) => {
				const to = setTimeout(() => {
					fail = true;
					rej()
				}, timeout)
				bot.chat(`/sethome ${homeName}`)
				await bot.awaitMessage(/^已成功設立目前位置為家點。$/)
				if (!fail) {
					if (log) bot.logger(false, "INFO", process.argv[2], `sethome ${homeName} - 設置完成`)
					clearTimeout(to)
					res()
				}
			})
			return true;
		} catch (e) {
			bot.logger(true, 'WARN', process.argv[2], `sethome ${homeName} - 設置失敗`)
			return false;
		}
	},
	openESHOP: async function (bot, t = 15_000) {
        try{
			if (bot.currentWindow?.title.includes('綠寶石商店')) {
				return bot.currentWindow;
			}
			await new Promise((resolve, reject) => {
				// 使用 interval 定期發送請求
				const interval = setInterval(() => {
					console.log("openESHOP")
					bot.chat('/eshop')
				}, 1500);
	
				const timeout = setTimeout(() => {
					// 移除監聽器避免記憶體洩漏
					bot.removeListener('windowOpen', onWindowItems);
					clearInterval(interval);
					reject(new Error('ESHOP超時'));
				}, t);
	
				const onWindowItems = (window) => {
					clearTimeout(timeout);
					clearInterval(interval);
					bot._client.removeListener('windowOpen', onWindowItems);
					resolve(window);
				};
				bot.on('windowOpen', onWindowItems);
			});
        }catch(err){
            // console.log(err)
        }
	}

	
}
module.exports = mcFallout 
