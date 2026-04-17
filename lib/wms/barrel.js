// lib/wms/barrel.js
const { Vec3 } = require('vec3');
const containerOperation = require('../containerOperation')
// 依據傳入的 warehouseInfo/cfg 計算桶子與支架的絕對/相對座標

function getBarrelRelativePos(index, warehouseInfo) {
    const cfg = warehouseInfo.size;
    const layerCount = cfg.x * cfg.z;
    const rawlayer = Math.floor(index / layerCount);
    const z = Math.floor((index % layerCount) / cfg.x);
    const x = index % cfg.x;
    return new Vec3(x, rawlayer, z);
}

function getBarrelAbsolutePos(index, warehouseInfo) {
    const cfg = warehouseInfo.size;
    const pos = warehouseInfo.position;
    const brp = getBarrelRelativePos(index, warehouseInfo);
    const y = Math.floor(brp.y / cfg.layer) * (cfg.bottom + cfg.layer + cfg.top + cfg.aisle) + cfg.bottom + (brp.y % cfg.layer);
    return new Vec3(brp.x + pos.x, y + pos.y, brp.z + pos.z);
}

function getBarrelByRelativePos(rpos, warehouseInfo) {
    const cfg = warehouseInfo.size;
    // 檢查相對座標是否在有效範圍內
    if (rpos.x < 0 || rpos.x >= cfg.x ||
        rpos.y < 0 || rpos.y >= cfg.y ||
        rpos.z < 0 || rpos.z >= cfg.z) {
        throw new Error("座標超出範圍");
    }
    return rpos.x + rpos.y * cfg.x * cfg.z + rpos.z * cfg.x;
}

function getBarrelByAbsolutePos(apos, warehouseInfo) {
    const cfg = warehouseInfo.size;
    const pos = warehouseInfo.position;
    // 檢查絕對座標是否在有效範圍內
    const thickness = cfg.bottom + cfg.aisle + cfg.layer + cfg.top;
    const rawy = apos.y - pos.y;
    const layer = Math.floor(rawy / thickness);
    const inLayer = rawy % thickness;
    if (inLayer < cfg.bottom || inLayer > cfg.bottom + cfg.layer + cfg.top) {
        throw new Error("座標超出範圍");
    }
    let y = 0;
    if (layer === 0) {
        y = inLayer - cfg.bottom;
    } else {
        y = layer * cfg.layer + inLayer - cfg.bottom;
    }
    const relpos = getBarrelByRelativePos(new Vec3(apos.x - pos.x, y, apos.z - pos.z), warehouseInfo);
    return relpos;
}

function getStandPos(index, warehouseInfo) {
    const cfg = warehouseInfo.size;
    const pos = warehouseInfo.position;
    const brp = getBarrelRelativePos(index, warehouseInfo);
    const y = (Math.floor(brp.y / cfg.layer) + 1) * (cfg.bottom + cfg.layer + cfg.top + cfg.aisle) - cfg.aisle;
    return new Vec3(brp.x + pos.x, y + pos.y, brp.z + pos.z);
}

function getTableID(index, warehouseInfo) {
    const cfg = warehouseInfo.size;
    const layerCount = cfg.x * cfg.z;
    const rawlayer = Math.floor(index / layerCount);
    return Math.floor(rawlayer / (warehouseInfo.databaseConf?.layersPerTable || 1));
}

function inventoryToBarrelInfo(bot,inventory) {
    let result = {
        id: null,
        quantity: null,
        barreltype: "empty" // 'full_shulker', 'normal', 'nbt', 'empty', 'error'
    }
    if (!inventory || inventory?.type != "minecraft:generic_9x3") {
        return null
    }
    const itemMap = new Map();
    let allIsShulkerBox = true;
    let allShulkerFull = true;
    let shulkerBoxCount = 0;
    let allIsItem = true;
    let allSameItem = true;
    let someHaveNBT = false;
    let empty = true;
    // 遍歷背包欄位0-26
    for (let i = 0; i < 27; i++) {
        const item = inventory.slots[i];
        if (!item) continue;
        empty = false 
        const itemresult = containerOperation.parseItem(item,bot)
        let key = itemresult.item
        if(itemresult.isShulkerBox){
            if(itemresult.sameItemInShulkerBox===null){
                // 空盒
                // console.log("空盒")
                if (!itemMap.has(key)) {
                    itemMap.set(key, {
                        count: itemresult.count,
                        name: itemresult.item,
                    });
                } else {
                    const existing = itemMap.get(key);
                    existing.count += itemresult.count;
                }
            } else {
                if(!itemresult.fullBox) allShulkerFull = false
                shulkerBoxCount++;
                allSameItem &= itemresult.sameItemInShulkerBox;
                allIsItem = false;
            }
        }else{
            allIsShulkerBox = false;
            someHaveNBT |= itemresult.haveNBT;
        }
        if (!itemMap.has(key)) {
            itemMap.set(key, {
                count: itemresult.count,
                name: itemresult.item,
            });
        } else {
            const existing = itemMap.get(key);
            existing.count += itemresult.count;
        }
        // console.log(item.slot, item.name)

    }
    if(empty){
        result.barreltype = "empty"
        // console.log("空桶")
    } else if(allIsShulkerBox){
        if(allShulkerFull){
            result.barreltype = "full_shulker"
            result.id = itemMap.keys().next().value
            result.quantity = shulkerBoxCount
        } else {
            result.barreltype = "error"
            console.log("箱子未滿")
        }
        // console.log("全部是箱子")
        // console.log(itemMap)
    } else if(allIsItem && itemMap.size === 1){
        result.barreltype = "normal"
        result.id = itemMap.keys().next().value
        result.quantity = itemMap.get(result.id).count
        // console.log("全部是物品")
        // console.log(itemMap)
    } else {
        result.barreltype = "error"
        console.log("不合格式")
        if(itemMap.size >1){
            console.log("物品混裝")
        }
        if(!allIsShulkerBox && !allSameItem){
            console.log("盒子散物混裝")
        }
        console.log(itemMap, allIsShulkerBox, allIsItem, someHaveNBT)
    }
    return result
}
/**
 * {
 *  isShulkerBox: false,
 *  sameItemInShulkerBox: iron_ingot,
 *  item: "iron_ingot",
 *  count: 64,
 *  haveNBT: false,
 *  crossVersion: false,
 * }
*/

module.exports = {
    getBarrelRelativePos,
    getBarrelAbsolutePos,
    getStandPos,
    getTableID,
    inventoryToBarrelInfo,
};