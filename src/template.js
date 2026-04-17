const { initModule, saveModuleConfig, taskreply } = require('../lib/commandModule')
let logger, mcData, bot_id, bot

let template_cfg = {
    "example_key": "example_value",
}

const template = {
    identifier: [
        "template",
    ],
    cmd: [
        {
            name: "template TEST",
            identifier: [
                "test",
            ],
            execute: test,
            vaild: true,
            longRunning: true,
            permissionRequre: 0,
        }
    ],
    async init(ctx) {
        const result = await initModule(ctx, [
            { key: 'cfg', filename: 'template.json', scope: 'bot', default: template_cfg },
        ]);
        logger = result.logger;
        mcData = result.mcData;
        bot_id = result.bot_id;
        bot = result.bot;
        template_cfg = result.configs.cfg;
    }
}
async function test(task) {
    taskreply(bot, task, "Not Implemented", "Not Implemented", "Not Implemented")
}
module.exports = template
