const process = require('process');
const fs = require('fs');
const fsp = require('fs').promises
const { Schematic } = require('prismarine-schematic');
const nbt = require('prismarine-nbt')
const promisify = f => (...args) => new Promise((resolve, reject) => f(...args, (err, res) => err ? reject(err) : resolve(res)))
const parseNbt = promisify(nbt.parse);
const { Vec3 } = require('vec3')
const v = require('vec3');
const { get } = require('http');
const wait = () => new Promise(setImmediate)
const defaultBits = 2
const air = "minecraft:air"
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
        const parts = path.split("/");
        const filenameWithExtension = parts[parts.length - 1];

        // Remove the file extension
        const filename = filenameWithExtension.split(".")[0];
        if (path.endsWith(".nbt")) {
            return this.loadFromNbt(filename,path)
        } else if (path.endsWith(".litematic")) {
            return this.loadFromLitematic(path)
        } else {
            throw new Error('File Type Not Implemented!')
        }
    },
    //https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/LitematicaSchematic.java
    loadFromLitematic: async function (path) {
        let raw_sch = await fsp.readFile(path);
        let raw_Litematic = await nbt.simplify(await parseNbt(raw_sch));
        //console.log(raw_Litematic)
        let tglt = new sch(raw_Litematic.Metadata.Name, raw_Litematic.Metadata.EnclosingSize.x, raw_Litematic.Metadata.EnclosingSize.y, raw_Litematic.Metadata.EnclosingSize.z)
        tglt.Metadata = raw_Litematic.Metadata
        tglt.Metadata.EnclosingSize = new Vec3(raw_Litematic.Metadata.EnclosingSize.x, raw_Litematic.Metadata.EnclosingSize.y, raw_Litematic.Metadata.EnclosingSize.z);
        tglt.Metadata.TimeCreated = Date.now(tglt.Metadata.TimeCreated);
        tglt.Metadata.TimeModified = Date.now(tglt.Metadata.TimeModified);
        if (tglt.Metadata.RegionCount != 1) throw new Error('Litematic Multi Regions Not Support')
        let firstRegion = getLitematicFirstRegion(raw_Litematic)
        tglt.palette =  litematicParsePalette(firstRegion)
        const bitsPerEntry = BigInt(tglt.palette.length).toString(2).length;
        const arraySizeIn = Math.ceil(bitsPerEntry * tglt.Metadata.EnclosingSize.x * tglt.Metadata.EnclosingSize.y * tglt.Metadata.EnclosingSize.z / 64);
        tglt.LitematicaBitArray = new LitematicaBitArray(bitsPerEntry, arraySizeIn,firstRegion.BlockStates)
        return tglt
        //return new Error('type:Litematic not Implemented!')
    },
    //https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/VanillaStructure.java
    loadFromNbt: async function (name='default',path) {
        //console.log(name)
        let raw_sch = await fsp.readFile(path);
        let raw_nbtFile = await nbt.simplify(await parseNbt(raw_sch));
        //console.log(raw_nbtFile)
        // let nbtsch = new sch('nbt')
        let tglt = new sch(name, raw_nbtFile.size[0], raw_nbtFile.size[1], raw_nbtFile.size[2])
        tglt.Metadata.Author = raw_nbtFile.author
        tglt.MinecraftDataVersion = raw_nbtFile.DataVersion
        tglt.palette = nbtParsePalette(raw_nbtFile.palette)
        let airindex = -1
        for(const i in tglt.palette){
            if(tglt.palette[i].Name == air){
                airindex = i;
                break;
            }
        }
        //console.log(airindex)
        if(airindex==-1){
            tglt.palette.unshift({Name:air})
        }
        // console.log("-----------", tglt.palette.length)
        // console.log(bitsPerEntry, maxMask)
        // console.log(raw_nbtFile.blocks.length)
        const bitsPerEntry = BigInt(tglt.palette.length).toString(2).length;
        const arraySizeIn = Math.ceil(bitsPerEntry * raw_nbtFile.size[0] * raw_nbtFile.size[1] * raw_nbtFile.size[2] / 64);
        //console.log(bitsPerEntry,arraySizeIn,)
        tglt.LitematicaBitArray = new LitematicaBitArray(bitsPerEntry, arraySizeIn)
        // 下面這邊應該改的
        if(airindex==-1){
            for (b_index of raw_nbtFile.blocks) {
                await wait();
                //console.log("pos:",b_index.pos[0], b_index.pos[1], b_index.pos[2],"index:",tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]))
                tglt.LitematicaBitArray.setAt(tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]), b_index.state+1)
                tglt.Metadata.TotalBlocks++;
            }
        }else{
            tglt.palette.splice(airindex, 1);
            tglt.palette.unshift({Name:air})
            for (b_index of raw_nbtFile.blocks) {
                await wait();
                let bst = b_index.state
                if(bst == airindex){
                    tglt.LitematicaBitArray.setAt(tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]), 0)
                }else if(bst<airindex){
                    tglt.LitematicaBitArray.setAt(tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]), bst+1)
                }else{
                    tglt.LitematicaBitArray.setAt(tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]), bst)
                }
                //console.log("pos:",b_index.pos[0], b_index.pos[1], b_index.pos[2],"index:",tglt.index(b_index.pos[0], b_index.pos[1], b_index.pos[2]))
                
                tglt.Metadata.TotalBlocks++;
            }
        }
       // console.log(tglt.palette)
        //to schematic

        return tglt;
    },
    newSchematic: function (name,x,y,z) {
        return new sch(name,x,y,z)
    }

}
class sch {
    //所有子區合併版
    constructor(name = 'Unnamed', x, y, z) {
        this.Metadata = new Metadata(name, x, y, z)
        this.MinecraftDataVersion = 2975  //1.18.2
        this.Version = 6
        this.LitematicaBitArray = new LitematicaBitArray(0,x*y*z,null);
        // RegionName:           name,
        // regionSize:           Vec3D{int32(x), int32(y), int32(z)},
        // data:                 NewEmptyBitArray(x * y * z),
        // palette:              newBlockStatePalette(),
        // entity:               newEntityContainer(),
    }
    LitematicaBitArray
    palette = [{ Name: air }];
    /**
     * if blockState not in add it 
     */
    getPaletteIndex(blockState){
        let index = this.palette.findIndex(item => {
            return item.Name === blockState.Name && JSON.stringify(item.p) === JSON.stringify(searchObject.p);
        }); 
        if(index == -1){
            this.palette.push(blockState)
            return this.palette.length-1;
        }
        return index;
    }
    entity;
    index(x, y, z) {
        return y * this.Metadata.EnclosingSize.x * this.Metadata.EnclosingSize.z + z * this.Metadata.EnclosingSize.x + x
    }
    vec3(id){
        let y = Math.floor(id / (this.Metadata.EnclosingSize.x * this.Metadata.EnclosingSize.z))
        let z = Math.floor((id % (this.Metadata.EnclosingSize.x * this.Metadata.EnclosingSize.z)) / this.Metadata.EnclosingSize.x)
        let x = (id) % this.Metadata.EnclosingSize.x;
        // let x = (id) % this.Metadata.EnclosingSize.x;
        // let y = Math.floor((id) / (this.Metadata.EnclosingSize.z * this.Metadata.EnclosingSize.x));
        // let z = Math.floor((id) / this.Metadata.EnclosingSize.x);
        return new Vec3(x,y,z)
    }
    setBlock(x, y, z, block) {
        if(outOfRange(this.Metadata.EnclosingSize,x,y,z)){
            throw new Error(`SetBlock out of range : enclosingSize: ${this.MetaData.EnclosingSize},Pos: ${x}, ${y}, ${z}`)
        }
        if(this.getBlock(x,y,z).Name==air||block.name!= air){
            this.Metadata.TotalBlocks++
        }else if(block.name== air){
            this.Metadata.TotalBlocks--
        }
        this.LitematicaBitArray.setBlock(this.index(x,y,z),this.getPaletteIndex(block))
        // Implementation of SetBlock
    }
    getBlockByIndex(index) {
        // Implementation of SetBlockByIndex
    }
    // getBlock's Palette Block Name
    getBlockPID(x, y, z) {
        return this.LitematicaBitArray.getAt(this.index(x,y,z))
        // Implementation of GetBlock
    }
    getBlockPIDByIndex(index) {
        return this.LitematicaBitArray.getAt(index)
        //return this.palette[this.LitematicaBitArray.getAt(index)]
        // Implementation of GetBlock
    }
    getBlock(x, y, z) {
        return this.palette[this.LitematicaBitArray.getAt(this.index(x,y,z))]
        // Implementation of GetBlock
    }
    getBlockByIndex(index) {
        //return this.LitematicaBitArray.getAt(index)
        return this.palette[this.LitematicaBitArray.getAt(index)]
        // Implementation of GetBlock
    }
    changeMaterial(from, to,pro){
        let idx = -1
        for(const i in this.palette){
            if(this.palette[i].Name == from){
                idx = i;
                break;
            }
        }
        if(idx == -1){
            return
        }
        let res = {
            Name: to, 
        }
        if(pro){
            res.Properties = pro
        }
        this.palette[idx] = res
        console.log(`替換 ${from} -> ${to}`)
    }
    toMineflayerID(){
        for(const i in this.palette){
            if(this.palette[i].Name.startsWith('minecraft:')){
                this.palette[i].Name = (this.palette[i].Name).substr(10);
            }
        } 
    }
}
function outOfRange(ori,x,y,z){
    if(x<0||y<0||z<0){
        return true;
    }else if(x>ori.x||y>ori.y||z>ori.z){
       return true;
    }
    return false;    
}
class Metadata {
    constructor(name, x, y, z) {
        this.Author = 'Author';
        this.Description = "";
        this.EnclosingSize = new Vec3(x, y, z);
        this.Name = name;
        this.RegionCount = 1;
        this.TimeCreated = Date.now();
        this.TimeModified = Date.now();
        this.TotalBlocks = 0;
        this.TotalVolume = x * y * z;
    }
}
// function NewEmptyBitArray(EntrySize){
//     let b = new LitematicaBitArray()
// }
// https://github.com/maruohon/litematica/blob/liteloader_1.12.2/src/main/java/litematica/schematic/container/LitematicaBitArray.java
class LitematicaBitArray {
    /**
     * 
     * @param {int} bitsPerEntryIn 
     * @param {int} arraySizeIn 
     * @param {bigInt[]} longArrayIn 
     */
    constructor(bitsPerEntryIn, arraySizeIn, longArrayIn = null) {
        bitsPerEntryIn = Math.max(bitsPerEntryIn,defaultBits)
        this.bitsPerEntry = bitsPerEntryIn;
        this.arraySize = arraySizeIn;
        this.maxEntryValue = (1n << BigInt(bitsPerEntryIn)) - 1n;
        const longArraySize = arraySizeIn //Math.ceil((this.arraySize * this.bitsPerEntry) / 64);
        // Initialize the long array
        if (longArrayIn !== null && longArrayIn.length === longArraySize) {
            this.longArray = longArrayIn;
        } else {
            // new Empty 
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
    setBlock(index,value){
        if(value>this.bitsPerEntry){
            let newLitematicBitArray = this.resize(this.bitsPerEntry+1,this.arraySize)
            this.longArray = newLitematicBitArray.longArray
            this.arraySize = newLitematicBitArray.arraySize
            this.bitsPerEntry = newLitematicBitArray.bitsPerEntry
            this.maxEntryValue = newLitematicBitArray.maxEntryValue
        }
        this.setAt(index,value)
    }
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
    getBlock(index){
        return this.getAt(index)
    }
    /**
     * 
     * @param {int} index 
     * @returns
     */
    getAt(index) {
        // if (index < 0 || index >= this.arraySize) {
        //     throw new Error("Index must be between 0 and " + (this.arraySize - 1));
        // }
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
    resize(bits, EntrySize){
        let newLitematicBitArray = new LitematicaBitArray(bits, EntrySize,nil)
        for (let i = 0; i < this.arraySizeIn; i++ ){
            newLitematicBitArray.setAt(i, this.getAt(i))
        }
        return newLitematicBitArray;
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



function getLitematicFirstRegion(lrs) {
    for(i in lrs.Regions){
        return lrs.Regions[i]
    }
    return new Error('No region')
}


function litematicParsePalette(region) {
    let palette = []
    for (np in region.BlockStatePalette) {
        //console.log(region.BlockStatePalette[np])
        palette.push(region.BlockStatePalette[np])
        // Properties 未實現
    }
    return palette
}
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
