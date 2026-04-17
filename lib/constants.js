const QUICKBAR_WHITELIST = [
    "netherite_shovel",
    "netherite_pickaxe",
    "netherite_axe",
    "netherite_sword",
    "netherite_hoe",
    "fishing_rod",
]

const HOE_BLOCKS = [
    "nether_wart_block",
    "warped_wart_block",
    "shroomlight",
]

const OPEN_PREVENT_LIST = [
    "bundle",
    "map",
    "filled_map",
    "bone",
    "stick",
    "golden_shovel",
    "fishing_rod",
    "villager_spawn_egg",
    "zombie_spawn_egg",
    "name_tag",
    "ghast_spawn_egg",
]

const INVENTORY = {
    CONTAINER_START: 0,
    INVENTORY_START: 9,
    QUICKBAR_START: 36,
    QUICKBAR_END: 44,
    OFFHAND: 45,
}

module.exports = {
    QUICKBAR_WHITELIST,
    HOE_BLOCKS,
    OPEN_PREVENT_LIST,
    INVENTORY,
}
