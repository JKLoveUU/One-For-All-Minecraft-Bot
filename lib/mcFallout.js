const process = require('process');
const CNTA = require('chinese-numbers-to-arabic');
const sd = require('silly-datetime');
const { Vec3 } = require('vec3')
const { once } = require('events')
const pTimeout = require('p-timeout');
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const openPreventList = ["map", "filled_map", "bone", "stick", "golden_shovel","fishing_rod"];
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
				console.log(ori_slot)
				console.log(findFirstCanSwapSlot)
				await bot.clickWindow(ori_slot, 0, 0)
				await bot.waitForTicks(1)
				await bot.clickWindow(findFirstCanSwapSlot, 0, 0)
				await bot.waitForTicks(1)
				await bot.clickWindow(ori_slot, 0, 0)
				await bot.waitForTicks(1)
				console.log("替換完成")
			}
		}
	},
	// 這個func 貌似還有問題 切換過去沒有等到waitProfile 
	promiseTeleportServer: async function (bot, server, timeout = 15_000) {
		// 這不是promise 還要補then
		while (bot.botinfo.server != server) {
			bot.chat(`/ts ${server}`)
			bot.logger(true, 'INFO', process.argv[2], `/ts ${server}`)
			let waitChangeServerStartTime = Date.now();
			let loadProfile = false;
			let success = false;
			bot.on("message", profileLoadCheck);
			while (Date.now() - waitChangeServerStartTime < timeout) {
				if (bot.botinfo.server == server) {
					success = true
					break;
				}
				if (loadProfile) {
					console.log(`切換分流完成 耗時 ${Date.now() - waitChangeServerStartTime} ms`);
					success = true;
					break;
				}
				await sleep(100);
			}
			if (success) break;
			else {
				if (!loadProfile) {
					try {
						bot.off("message", profileLoadCheck);
					} catch (e) { console.log(e) }
				}
				console.log(`切換分流超時`);
				return 0;
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
				await once(bot, 'forcedMove',onforcedMove_)	//太常執行的話這個數量會過多 ex 分流重啟 過不去
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
		function onforcedMove_(){
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

	}
}
module.exports = mcFallout 
