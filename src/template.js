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
            // 權限節點:未設 perm 時自動衍生為「模組identifier[0].cmd.identifier[0]」,
            // 此例即 "template.test"。要授權給某身分組,在 config.toml 的
            // [permission.groups] 裡列入該節點(支援 template.* / * 萬用字元)。
            // 需要自訂節點時才覆寫,例如多個指令共用權限:
            // perm: "template.test",
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
