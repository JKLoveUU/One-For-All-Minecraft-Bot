const mp_direction = {
    "north": {
        "inc_dx": -1,
        "inc_dy": -1,
        "inc_dz": 0,
    },
    "south": {
        "inc_dx": 1,
        "inc_dy": -1,
        "inc_dz": 0,
    },
    "west": {
        "inc_dx": 0,
        "inc_dy": -1,
        "inc_dz": 1,
    },
    "east": {
        "inc_dx": 0,
        "inc_dy": -1,
        "inc_dz": -1,
    },
}

const DEFAULT_MAPART_CFG = {
    "schematic": {
        filename: "example_0_0.nbt",
        placementPoint_x: 0,
        placementPoint_y: 100,
        placementPoint_z: 0,
    },
    "materialsMode": "station",
    "station": "mpStation_Example.json",
    "open": {
        "folder": "暫時用不到",
        "warp": "Example_10",
        "height": 9,
        "width": 6,
        "open_start": -1,
        "open_end": -1,
    },
    "wrap": {
        "warp": "Example_10",
        "height": 9,
        "width": 6,
        "origin": [0, 0, 0],
        "anvil": [0, 0, 0],
        "anvil_stand": [0, 0, 0],
        "cartography_table": [0, 0, 0],
        "cartography_table_stand": [0, 0, 0],
        "facing": "north",
        "name": "ExampleMP_Name",
        "source": "https://www.pixiv.net/artworks/92433849",
        "artist": "https://www.pixiv.net/users/3036679",
        "copy_amount": 1,
        "copy_f_shulker": [0, 0, 0],
        "wrap_input_shulker": [0, 0, 0],
        "wrap_output_shulker": [0, 0, 0],
        "wrap_button": [0, 0, 0]
    },
}

const DEFAULT_GLOBAL_CFG = {
    "schematic_folder": "C:/Users/User/AppData/Roaming/.minecraft/schematics/",
    "discord_webhookURL": "https://discord.com/api/webhooks/1234567890123456789/abc",
    replaceMaterials: []
}

const DEFAULT_MATERIALS_DATA = {
    "stationName": "Bot",
    "stationWarp": "example",
    "stationServer": 1,
    "offset": {
        "N": [0, 1, -3],
        "S": [0, 1, 3],
        "W": [-3, 1, 0],
        "E": [3, 1, 0],
        "bN": [0, 1, -2],
        "bS": [0, 1, 2],
        "bW": [-2, 1, 0],
        "bE": [2, 1, 0]
    },
    "overfull": [270, 24, -241, "E", "bE"],
    "materials": []
}

const mapartState = {
    logger: null,
    mcData: null,
    bot_id: null,
    bot: null,
    csafe_success: false,
    mapartBuildUseTime: 0,
    mapart_cfg: JSON.parse(JSON.stringify(DEFAULT_MAPART_CFG)),
    mapart_global_cfg: JSON.parse(JSON.stringify(DEFAULT_GLOBAL_CFG)),
    Materialsdata: JSON.parse(JSON.stringify(DEFAULT_MATERIALS_DATA)),
}

module.exports = { mapartState, mp_direction, DEFAULT_MAPART_CFG, DEFAULT_GLOBAL_CFG, DEFAULT_MATERIALS_DATA }
