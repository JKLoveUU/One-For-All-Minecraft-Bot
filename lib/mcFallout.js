const process = require('process');
const CNTA = require('chinese-numbers-to-arabic');
const sd = require('silly-datetime');
const { Vec3 } = require('vec3')
const { once } = require('events')
const pTimeout = require('./pTimeout');
const { type } = require('os');
const { sleep } = require('./common')
const { OPEN_PREVENT_LIST } = require('./constants')
const openPreventList = OPEN_PREVENT_LIST;
let lastChat = Date.now();
const mcFallout = {
	lastWarpResult: {
		block: false,
		message: '',
		warp: '',
		reason: '',
	},
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
			if (rs == true) return true;
			await sleep(5000)
		}
	},
	teleportServer: async function (bot, server, timeout = 15_000) {
		bot.logger(true, 'INFO', process.argv[2], `切換分流 當前 ${bot.botinfo.server} 目標 ${server}`)
		// ... Claude Code給我把這個塞到try裡 害profileLoadCheck更新不了 浪費我時間..
		let needWaitProfile = false;
		let loadProfile = false;
		if (bot.botinfo.server != server) {
			needWaitProfile = true;
			// console.log("需要等待人物載入", needWaitProfile)
		}
		// await sleep(8_000) //avoid disconnect 260208
		// === 切換分流期間 outbound packet 追蹤 ===
		// 在切換窗口內把每一個 client.write 印出來;若被 server kick,看 console 最後一筆就是兇手。
		// 一個 _client 只 wrap 一次(reconnect 後是新的 _client,會再 wrap)。
		_installSwitchTxTrace(bot)
		bot._txTraceSwitch = true
		bot._txTraceTag = `[switch-tx ${bot.botinfo.server}→${server}]`
		try {
			while (bot.botinfo.server != server) {
				if (Date.now() - lastChat > 5000) {
					bot.chat(`/ts ${server}`)
					// bot.chat(`/server server${server}`)
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
				try {
					while (Date.now() - waitChangeServerStartTime < timeout) {
						// bot.logger(true, 'DEBUG', process.argv[2], `binfo.s:${bot.botinfo.server} s:${server} nwp:${needWaitProfile} lP:${loadProfile}`)
						if (!needWaitProfile && bot.botinfo.server == server) {
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
					console.log(`切換分流超時`);
					return false;
				} finally {
					// 保險: profileLoadCheck 自身有 bot.off,但 race condition 或例外可能繞過
					try { bot.off("message", profileLoadCheck); } catch (_) { }
				}
			}
		} finally {
			// 切換結束(success / timeout / throw 都會走這),關閉 tx 追蹤
			bot._txTraceSwitch = false
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
		try {
			while (Date.now() - waitChangeServerStartTime < maxtime) {
				if (loadProfile) {
					console.log(`切換分流完成 耗時 ${Date.now() - waitChangeServerStartTime} ms`);
					success = true;
					break;
				}
				await sleep(100);
			}
			if (success) return 1;
			console.log(`切換分流超時`);
			return 0;
		} finally {
			try { bot.off("message", lDcheck); } catch (_) { }
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
		// warp 也可能觸發切換分流,打開 outbound packet 追蹤
		_installSwitchTxTrace(bot)
		const prevSrv = bot.botinfo && bot.botinfo.server
		bot._txTraceSwitch = true
		bot._txTraceTag = `[tx-trace warp ${warpp} from=${prevSrv}]`
		mcFallout.lastWarpResult = {
			block: false,
			message: '',
			warp: warpp,
			reason: '',
		}
		try {
			const result = await new Promise((res, rej) => {
				let done = false
				let retryTimer = null
				const to = setTimeout(() => {
					if (done) return
					done = true
					cleanup()
					rej(new Error('warp timeout'))
				}, timeout)

				const cleanup = () => {
					clearTimeout(to)
					if (retryTimer) clearTimeout(retryTimer)
					try { bot.off('forcedMove', forcedMoveCheck); } catch (_) { }
					try { bot.off('message', warpMessageCheck); } catch (_) { }
				}

				const finish = (result) => {
					if (done) return
					done = true
					cleanup()
					res(result)
				}
				const fail = (err) => {
					if (done) return
					done = true
					cleanup()
					rej(err)
				}

				const sendWarp = () => {
					try {
						bot.chat(`/warp ${warpp}`)
					} catch (err) {
						fail(err)
					}
				}

				const scheduleWarpRetry = (seconds, msg) => {
					if (retryTimer || done) return
					mcFallout.lastWarpResult = {
						block: false,
						message: msg,
						warp: warpp,
						reason: 'cooldown',
					}
					const waitMs = Math.max(seconds, 1) * 1000 + 100
					retryTimer = setTimeout(() => {
						retryTimer = null
						if (!done) sendWarp()
					}, waitMs)
				}

				const forcedMoveCheck = () => finish({ ok: true, reason: 'forcedMove' })
				const warpMessageCheck = (jsonMsg) => {
					const msg = jsonMsg.toString()
					const renewRegex = /\[系統\] 讀取人物成功。/
					const arrivedRegex = /\[系統\] 已抵達 公共傳送點「[^」]+」，輸入 \/backui 回程/
					const blockRegex = /\[系統\] 你被玩家 .+ 請出了他的領地，拜訪他人請記得事先告知。 任何形式的騷擾都有可能被永久停權。/
					const cooldownRegex = /\[系統\] 指令冷卻中，\s*需等待\s*(\d+)\s*秒才可再次使用/

					if (blockRegex.test(msg)) {
						mcFallout.lastWarpResult = {
							block: true,
							message: msg,
							warp: warpp,
							reason: 'block',
						}
						finish({ ok: false, reason: 'block' })
					} else if (cooldownRegex.test(msg)) {
						const match = msg.match(cooldownRegex)
						scheduleWarpRetry(Number(match[1]), msg)
					} else if (arrivedRegex.test(msg)) {
						finish({ ok: true, reason: 'arrived' })
					} else if (renewRegex.test(msg)) {
						bot.logger(true, 'INFO', process.argv[2], "\x1b[92mwarp 等待續息完成\x1b[0m")
						finish({ ok: true, reason: 'renew' })
					}
				}

				bot.once('forcedMove', forcedMoveCheck)
				bot.on('message', warpMessageCheck)
				sendWarp()
			})
			if (!result.ok) {
				bot.logger(true, 'WARN', process.argv[2], `warp ${warpp} - 傳送失敗 (${result.reason})`)
				return false;
			}
			mcFallout.lastWarpResult = {
				block: false,
				message: '',
				warp: warpp,
				reason: result.reason,
			}
			if (log) bot.logger(false, "INFO", process.argv[2], `warp ${warpp} - 傳送完成 (${result.reason})`)
			return true;
		} catch (e) {
			if (!mcFallout.lastWarpResult.reason) {
				mcFallout.lastWarpResult = {
					block: false,
					message: e && e.message ? e.message : String(e),
					warp: warpp,
					reason: e && e.message == 'warp timeout' ? 'timeout' : 'error',
				}
			}
			bot.logger(true, 'WARN', process.argv[2], `warp ${warpp} - 傳送失敗`)
			return false;
		} finally {
			bot._txTraceSwitch = false
		}
	},
	back: async function (bot, timeout = 15_000, log = false) {
		// /back 也可能觸發切換分流,打開 outbound packet 追蹤 + race guard
		_installSwitchTxTrace(bot)
		const prevSrv = bot.botinfo && bot.botinfo.server
		bot._txTraceSwitch = true
		bot._txTraceTag = `[tx-trace back from=${prevSrv}]`
		let fail = false;
		try {
			await new Promise(async (res, rej) => {
				const to = setTimeout(() => {
					fail = true;
					rej()
				}, timeout)
				bot.chat(`/back`)
				await once(bot, 'forcedMove')	//太常執行的話這個數量會過多 ex 分流重啟 過不去
				if (!fail) {
					if (log) bot.logger(false, "INFO", process.argv[2], `back - 傳送完成`)
					clearTimeout(to)
					res()
				}
			})
			return true;
		} catch (e) {
			bot.logger(true, 'WARN', process.argv[2], `back - 傳送失敗`)
			return false;
		} finally {
			bot._txTraceSwitch = false
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
		try {
			if (String(bot.currentWindow?.title ?? '').includes('綠寶石商店')) {
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
		} catch (err) {
			// console.log(err)
		}
	},
	touchChestShop: async function (bot, pos, timeout = 2_000) {
		let shopInfo = {
			owner: null, // 商店主人：JKLoveJK
			commodity: null, // 商品：界伏盒
			commodity_count: null, //| 庫存 ： 54 個
			space: null, //| 空間：54
			price: null,//  價格 ： 1 個 界伏盒 ＄500 元
			type: null,// 此商店正在 出售物品
			pos: pos,
		}
		// console.log("Trying to touch chest shop at position:", pos);
		bot.on("message", shopInfoCheck)
		bot._client.write('block_dig', {
			status: 0,
			location: pos,
			face: 1
		})
		// bot._client.write('block_dig', {
		// 	status: 1,
		// 	location: pos,
		// 	face: 1
		// })
		let i = 0;
		let getresult = false;
		while (true) {
			i++;
			if (i > (timeout / 100) || getresult) break;
			await sleep(100)
		}
		bot.off("message", shopInfoCheck);
		return shopInfo;
		/*
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯商店資訊⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 │ 商店擁有者：JKLoveJK
			 │ 商品類型：界伏盒 x 1
			 │ 庫存數量：54 個
			 │ 單價：1 個 界伏盒 ＄500 元
			 │ 模式：此商店正在 出售物品。
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 │ 容器內物品
			 │ 西瓜 x 1728
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 在聊天室中輸入你想要「購買」的數量，最多 30 個。輸入「all」購買全部。
			 這個商店主人 JKLoveJK 的收購資金大於 : 4,000

			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯商店資訊⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 │ 商店擁有者：1ogocat
			 │ 商品類型：界伏盒 x 1
			 │ 剩餘空間：54
			 │ 單價：1 個 界伏盒 ＄900 元
			 │ 模式：此商店正在 收購物品。
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 │ 容器內物品
			 │ 西瓜 x 1728
			 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
			 在聊天室中輸入你想要「出售」的數量，最多 30 個。輸入「all」出售全部。
			 這個商店主人 1ogocat 的收購資金大於 : 90,000
		*/
		function shopInfoCheck(jsonMsg) {
			let msg = jsonMsg.toString();
			let shopInfoRegex = /\│\s*商店擁有者：\s*(.+)/;
			let commodityRegex = /\│\s*商品類型：\s*(.+)/;
			let commodity_countRegex = /\│\s*庫存數量\s*：\s*(\d+)\s*個/;
			let spaceRegex = /\│\s*剩餘空間\s*：\s*(\d+)/;		// | 空間：54
			let priceRegex = /\│\s*單價\s*：\s*(\d+)\s*個\s*(.+)\s*＄(\d+)\s*元/;	// | 單價：1 個 界伏盒 ＄500 元
			let typeRegex = /\│\s*模式：此商店正在\s*(.+)/;
			let match;
			if ((match = msg.match(shopInfoRegex))) {
				// console.log(match)
				shopInfo.owner = match[1];
			}
			if ((match = msg.match(commodityRegex))) {
				// console.log(match)
				shopInfo.commodity = match[1].trim();
			}
			if ((match = msg.match(commodity_countRegex))) {
				// console.log(match)
				shopInfo.commodity_count = match[1];
				shopInfo.commodity_count = parseInt(shopInfo.commodity_count);
			}
			// 空間有點問題
			if ((match = msg.match(spaceRegex))) {
				// console.log(match)
				shopInfo.space = match[1];
				shopInfo.space = parseInt(shopInfo.space);
			}
			if ((match = msg.match(priceRegex))) {
				// console.log(match)
				shopInfo.price = match[3];
				shopInfo.price = parseInt(shopInfo.price);
			}
			if ((match = msg.match(typeRegex))) {
				// console.log(match)
				shopInfo.type = match[1];
				getresult = true;
			}
		}
	}


}

// 在切換分流 / warp 時把 outbound packet 印出來,被踢時可從 log 最後一筆推斷兇手。
// 同時做 race-condition 防護:當 client.state 不是 'play' 時擋掉只能在 PLAY 階段使用的封包
// (主要是 mineflayer physics.js 每 tick 送的 position/position_look/look/flying)。
// 走 bot.logger(子行程 → IPC → 主行程 TUI/檔案),不走 console.log。
// 重要:每個 bot._client 只 wrap 一次(_client 在斷線/重連後會換新,要重新 wrap)。
const PLAY_ONLY_MOVEMENT_PACKETS = new Set(['position', 'position_look', 'look', 'flying'])
function _installSwitchTxTrace(bot) {
	const c = bot._client
	if (!c || c.__switchTxWrapped) return
	c.__switchTxWrapped = true
	const who = (typeof process !== 'undefined' && process.argv && process.argv[2]) || 'BOT'
	const log = (level, msg) => {
		try { (bot.logger || (() => { }))(false, level, who, msg) } catch (_) { }
	}
	const orig = c.write.bind(c)
	c.write = function (name, params) {
		// === Race guard: 在非 PLAY 狀態下 mineflayer physics 仍可能寫 position/flying,
		// 這會讓 server 用 CONFIGURATION 對照表去解 PLAY-format 的 bytes → IOOB → kick。
		// 直接 drop 掉,不影響功能(server 在 CONFIGURATION 階段本來就不會處理移動)。
		if (c.state && c.state !== 'play' && PLAY_ONLY_MOVEMENT_PACKETS.has(name)) {
			if (bot._txTraceSwitch) {
				log('DEBUG', `${bot._txTraceTag || '[tx-trace]'} DROP ${c.state}/${name} (movement during non-play state)`)
			}
			return
		}
		if (bot._txTraceSwitch) {
			try {
				let p = ''
				try { p = JSON.stringify(params, (k, v) => typeof v === 'bigint' ? v.toString() + 'n' : v) } catch { p = '<unserializable>' }
				if (p.length > 240) p = p.slice(0, 240) + '…'
				log('DEBUG', `${bot._txTraceTag || '[tx-trace]'} ${c.state}/${name} ${p}`)
			} catch (_) { }
		}
		return orig(name, params)
	}
	// 同時掛 kick / end / error,把客戶端事件補在 trace 後面
	const tagOnce = (ev) => c.once(ev, (...args) => {
		if (!bot._txTraceSwitch) return
		const tag = bot._txTraceTag || '[tx-trace]'
		const dump = args.map(a => {
			try { return typeof a === 'string' ? a : JSON.stringify(a).slice(0, 200) } catch { return String(a) }
		}).join(' ')
		log('WARN', `${tag} <<< client.${ev} fired during trace window >>> ${dump}`)
	})
	tagOnce('end'); tagOnce('error'); tagOnce('kick_disconnect'); tagOnce('disconnect')
}

module.exports = mcFallout 
