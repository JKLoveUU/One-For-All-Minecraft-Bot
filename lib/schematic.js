const process = require('process');
const fs = require('fs');
const fsp = require('fs').promises
const { Schematic } = require('prismarine-schematic');
const nbt = require('prismarine-nbt')
const promisify = f => (...args) => new Promise((resolve, reject) => f(...args, (err, res) => err ? reject(err) : resolve(res)))
const parseNbt = promisify(nbt.parse);
const { Vec3 } = require('vec3')
const v = require('vec3')
const wait = () => new Promise(setImmediate)
/**
 * 模仿 elvis972602 寫的投影
 * https://github.com/elvis972602/go-litematica-tools
 */
/**
 * Reference
 * https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/SchematicMetadata.java
 */
const schematic = { //統一轉成litematic那樣
    /**
     * Load schematic From File
     * @param {*} path // path
     */
    loadFromFile: async function (path) {
        console.log(path)
        if (path.endsWith(".nbt")) {
            return this.loadFromNbt(path)
        } else if (path.endsWith(".litematic")) {
            return this.loadFromLitematic(path)
        } else {
            throw new Error('File Type Not Implemented!')
        }
    },
    //https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/LitematicaSchematic.java
    loadFromLitematic: async function (path) {
        let raw_sch = await fsp.readFile(path);
        let schb = await nbt.simplify(await parseNbt(raw_sch));
        return new Error('type:Litematic not Implemented!')
    },
    //https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/VanillaStructure.java
    loadFromNbt: async function (path) {
        let raw_sch = await fsp.readFile(path);
        let raw_nbtFile = await nbt.simplify(await parseNbt(raw_sch));
        //console.log(raw_nbtFile)
        // let nbtsch = new sch('nbt')
        let tglt = new sch("Test", raw_nbtFile.size[0], raw_nbtFile.size[1], raw_nbtFile.size[2])
        tglt.Metadata.author = raw_nbtFile.author
        tglt.MinecraftDataVersion = raw_nbtFile.DataVersion
        tglt.palette = nbtParsePalette(raw_nbtFile.palette)
        const bitsPerEntry = BigInt(tglt.palette.length).toString(2).length;
        // console.log("-----------", tglt.palette.length)
        // console.log(bitsPerEntry, maxMask)
        // console.log(raw_nbtFile.blocks.length)
        const arraySizeIn = Math.ceil(bitsPerEntry * raw_nbtFile.size[0] * raw_nbtFile.size[1] * raw_nbtFile.size[2] / 64);
        //console.log(bitsPerEntry,arraySizeIn,)
        tglt.litematicaBitArray = new LitematicaBitArray(bitsPerEntry, arraySizeIn)
        for (b_index of raw_nbtFile.blocks) {
            await wait();
            //console.log("pos:",b_index.pos[0], b_index.pos[1], b_index.pos[2],"index:",tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]))
            tglt.litematicaBitArray.setAt(tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]), b_index.state)
            tglt.Metadata.totalBlocks++;
        }
        return tglt;
    },
    newSchematic: function () {
        return
    }

}
class sch {
    //所有子區合併版
    constructor(name = 'Unnamed', x, y, z) {
        this.Metadata = new Metadata(name, x, y, z)
        this.MinecraftDataVersion = 2975  //1.18.2
        this.Version = 6
        // RegionName:           name,
        // regionSize:           Vec3D{int32(x), int32(y), int32(z)},
        // data:                 NewEmptyBitArray(x * y * z),
        // palette:              newBlockStatePalette(),
        // entity:               newEntityContainer(),
    }
    litematicaBitArray;
    palette;
    entity;
    index(x, y, z) {
        return y * this.Metadata.enclosingSize.x * this.Metadata.enclosingSize.z + z * this.Metadata.enclosingSize.x + x
    }
    setBlock(x, y, z, block) {
        // Implementation of SetBlock
    }
    getBlock(x, y, z) {
        // Implementation of GetBlock
    }
}
class Metadata {
    constructor(name, x, y, z) {
        this.author = 'Author';
        this.description = "";
        this.enclosingSize = new Vec3(x, y, z);
        this.name = name;
        this.regionCount = 1;
        this.timeCreated = Date.now();
        this.timeModified = Date.now();
        this.totalBlocks = 0;
        this.totalVolume = x * y * z;
    }
}
// https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/container/LitematicaBitArray.java
class LitematicaBitArray {
    /**
     * 
     * @param {int} bitsPerEntryIn 
     * @param {int} arraySizeIn 
     * @param {bigInt[]} longArrayIn 
     */
    constructor(bitsPerEntryIn, arraySizeIn, longArrayIn = null) {
        this.bitsPerEntry = bitsPerEntryIn;
        this.arraySize = arraySizeIn;
        this.maxEntryValue = (1n << BigInt(bitsPerEntryIn)) - 1n;
        const longArraySize = arraySizeIn //Math.ceil((this.arraySize * this.bitsPerEntry) / 64);
        // Initialize the long array
        if (longArrayIn !== null && longArrayIn.length === longArraySize) {
            this.longArray = longArrayIn;
        } else {
            this.longArray = new Array(longArraySize).fill(0n);
        }
    }
    /** The long array that is used to store the data for this BitArray. */
    longArray       //BigInt[]
    /** Number of bits a single entry takes up */
    bitsPerEntry    //int
    /**
     * The maximum value for a single entry. This also works as a bitmask for a single entry.
     * For instance, if bitsPerEntry were 5, this value would be 31 (ie, {@code 0b00011111}).
     */
    maxEntryValue   //BigInt
    /** Number of entries in this array (<b>not</b> the length of the long array that internally backs this array) */
    arraySize       //Int
    setAt(index, value) {
        //validateInclusiveBetween(0, this.arraySize - 1, index);
        //validateInclusiveBetween(0, this.maxEntryValue, value);
        let startOffset = index * this.bitsPerEntry;
        let startArrIndex = startOffset >> 6;                           //int
        let endArrIndex = (((index + 1) * this.bitsPerEntry - 1) >> 6); //int
        let startBitOffset = BigInt(startOffset & 0x3F);
       // console.log(startArrIndex)
       // console.log(this.longArray[startArrIndex],~(this.maxEntryValue << startBitOffset),(BigInt(value) & this.maxEntryValue),startBitOffset)
        this.longArray[startArrIndex] = this.longArray[startArrIndex] & ~(this.maxEntryValue << startBitOffset) | (BigInt(value) & this.maxEntryValue) << startBitOffset;

        if (startArrIndex != endArrIndex) {
            let endOffset = BigInt(64) - startBitOffset;
            let j1 = BigInt(this.bitsPerEntry) - endOffset;
            this.longArray[endArrIndex] = unSignedRightShift(this.longArray[endArrIndex], j1) << j1 | unSignedRightShift((BigInt(value) & this.maxEntryValue), endOffset);
        }
    }
    /**
     * 
     * @param {int} index 
     * @returns
     */
    getAt(index) {
        if (index < 0 || index >= this.arraySize) {
            throw new Error("Index must be between 0 and " + (this.arraySize - 1));
        }
        let startOffset = index * this.bitsPerEntry;
        let startArrIndex = startOffset >> 6;
        let endArrIndex = (((index + 1) * this.bitsPerEntry - 1) >> 6);
        let startBitOffset = BigInt(startOffset & 0x3F);

        if (startArrIndex == endArrIndex) {
            return (unSignedRightShift(this.longArray[startArrIndex], startBitOffset) & this.maxEntryValue)
            //return (this.longArray[startArrIndex] >>> startBitOffset) & this.maxEntryValue;
        } else {
            let endOffset = BigInt(64) - startBitOffset;
            return ((unSignedRightShift(this.longArray[startArrIndex], startBitOffset) | (this.longArray[endArrIndex] << endOffset)) & this.maxEntryValue)
            //return ((this.longArray[startArrIndex] >>> startBitOffset | this.longArray[endArrIndex] << endOffset) & this.maxEntryValue);

        }
    }
    getValueCounts() {

    }
    getBackingLongArray() {

    }
    size() {

    }
}
function validateInclusiveBetween(start, end, value) {
    if (value < start || value > end) {
        throw new Error('Value out of range');
    }
}
//Please note that JavaScript doesn't have a direct equivalent to Java's long data type. 
//For calculations involving large integers, you may need to use a library such as BigInteger.js or Long.js.
// Additionally, the JavaScript bitwise operations operate on 32 bits, so for larger values, you may need to use library assistance or implement custom logic.







function nbtParsePalette(nbtPalette) {
    let palette = []
    for (np in nbtPalette) {
        palette.push({
            Name: nbtPalette[np].Name
        })
        // Properties 未實現
    }
    return palette
}
function unSignedRightShift(bigint_num, bigint_shiftbit) {
    if (bigint_num >= 0n) return bigint_num >> bigint_shiftbit;
    let mask = BigInt(0);
    let tss = 64 - parseInt(bigint_shiftbit);
    for (let i = 0; i < tss; i++) {
        mask = (mask << 1n) + 1n
    }
    let temp = bigint_num >> bigint_shiftbit;	//這裡可能有錯 Cannot mix BigInt and other types, use explicit conversions
    return (temp & mask)
}
module.exports = schematic 
