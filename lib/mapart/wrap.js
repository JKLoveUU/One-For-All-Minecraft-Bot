const v = require('vec3')
const containerOperation = require('../containerOperation')
const mcFallout = require('../mcFallout')
const { sleep, readConfig } = require('../common')
const { mapartState } = require('./core')

async function mp_wrap(task) {
    const { bot, bot_id } = mapartState
    console.log("**此功能需要把廢土自動整理功能關掉**")
    let mapart_name_cfg_cache = await readConfig(`${process.cwd()}/config/${bot_id}/mapart.json`);
    let counter = 64;
    let wrap_items = [];
    let inputVec = v(mapart_name_cfg_cache["wrap"]["wrap_input_shulker"])
    let outputVec = v(mapart_name_cfg_cache["wrap"]["wrap_output_shulker"])
    let btvec = v(mapart_name_cfg_cache["wrap"]["wrap_button"])
    bot.setQuickBarSlot(8);
    console.log(mapart_name_cfg_cache)
    await mcFallout.openPreventSpecItem(bot)
    let input = await containerOperation.openContainerWithTimeout(bot, inputVec, 500)
    await sleep(500)
    if (!input) {
        console.log("can't open input box")
        return
    }
    for (let i = 0; i < 27; i++) {
        let item = {
            name: null,
            mapid: -1
        }
        if (input.slots[i] != null) {
            item.name = input.slots[i]?.name
            counter = Math.min(input.slots[i].count, counter)
        }
        if (input.slots[i]?.name == 'filled_map') {
            item.mapid = input.slots[i]?.nbt?.value?.map?.value
        }
        wrap_items.push(item)
    }
    await input.close()
    await sleep(500)
    for (let i = 0; i < counter; i++) {
        let input2, t = 0;
        while (t++ < 3 && !input2) {
            input2 = await containerOperation.openContainerWithTimeout(bot, inputVec, 1000)
        }
        if (!input2) {
            console.log("Can't open input box")
            return
        }
        for (let gg = 0; gg < 27; gg++) {
            if (wrap_items[gg].name == null) continue
            let emptySlot = input2.firstEmptySlotRange(input2.inventoryStart, input2.inventoryEnd)
            await bot.simpleClick.leftMouse(gg)
            await bot.simpleClick.rightMouse(emptySlot)
            await bot.simpleClick.leftMouse(gg)
        }
        await input2.close()
        await sleep(50)
        try {
            let fail = false;
            await new Promise(async (res, rej) => {
                const timeout = setTimeout(() => {
                    fail = true;
                    rej()
                }, 7000)
                while (!fail) {
                    await sleep(10)
                    let block = bot.blockAt(outputVec)
                    if (!block) continue
                    if ((block.name).indexOf('shulker') >= 0) break
                }
                clearTimeout(timeout)
                res()
            })
        } catch (e) {
            console.log("找不到out box")
            return
        }
        let output, t2 = 0;
        while (t2++ < 10 && !output) {
            output = await containerOperation.openContainerWithTimeout(bot, outputVec, 1000)
        }
        if (!output) {
            console.log("Can't open output box")
            return
        }
        for (let gg = 0; gg < 27; gg++) {
            if (wrap_items[gg].name == null) continue
            if (wrap_items[gg].name == "filled_map") {
                let tgmp = -1;
                for (let ff = 27; ff <= 62; ff++) {
                    if (output.slots[ff]?.nbt?.value?.map?.value == wrap_items[gg].mapid) {
                        tgmp = ff;
                        break;
                    }
                }
                await bot.simpleClick.leftMouse(tgmp)
                await bot.simpleClick.leftMouse(gg)
            } else {
                let tgmp = -1;
                for (let ff = 27; ff <= 62; ff++) {
                    if (output.slots[ff]?.name == wrap_items[gg].name) {
                        tgmp = ff;
                        break;
                    }
                }
                await bot.simpleClick.leftMouse(tgmp)
                await bot.simpleClick.leftMouse(gg)
            }
        }

        await output.close()
        await sleep(50)
        console.log(`第 ${i + 1} 套 完成`)
        await bot.activateBlock(bot.blockAt(btvec));
        await sleep(250)
    }
}

module.exports = { mp_wrap }
