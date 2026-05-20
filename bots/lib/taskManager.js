const fs = require('fs')
const fsp = require('fs').promises
const { sleep, readConfig } = require('../../lib/common')
const Status = require('../../src/modules/botstatus')

function createTaskManager(deps) {
    const { commands, basicCommand, logger, getLogin } = deps

    const taskManager = {
        tasks: [],
        err_tasks: [],
        defaultPriority: 10,
        tasking: false,
        commands,
        basicCommand,
        moduleStatusMap: {
            mapart: Status.TASK_MAPART, mp: Status.TASK_MAPART, map: Status.TASK_MAPART,
            bt: Status.TASK_BUILD, farm: Status.TASK_BUILD,
            ca: Status.TASK_CLEAR_AREA, cleararea: Status.TASK_CLEAR_AREA,
            wms: Status.TASK_WAREHOUSE,
            vt: Status.TASK_VILLAGER, villager: Status.TASK_VILLAGER, v: Status.TASK_VILLAGER,
            aq: Status.QUESTING, quest: Status.TASK_FARM,
        },
        tasksort() {
            this.tasks.sort((a, b) => {
                if (a.priority === b.priority) {
                    return a.timestamp - b.timestamp;
                } else {
                    return a.priority - b.priority;
                }
            });
        },
        async init() {
            bot.taskManager = this;
            if (!fs.existsSync(`${process.cwd()}/config/${process.argv[2]}/task.json`)) {
                this.save()
            } else {
                try {
                    let tt = await readConfig(`${process.cwd()}/config/${process.argv[2]}/task.json`)
                    this.tasks = tt.tasks
                    this.err_tasks = tt.err_tasks
                } catch (e) {
                    await this.save()
                }
            }
            if (this.tasks.length != 0 && !this.tasking) {
                logger(false, 'INFO', process.argv[2], `Found ${this.tasks.length} Task, will run at 3 second later.`)
                await sleep(3000)
                await this.loop(false)
            }
        },
        isTask(args) {
            let result
            for (let fc = 0; fc < this.commands.length && !result; fc++) {
                if (this.commands[fc].identifier.includes(args[0])) {
                    for (let cmd_index = 0; cmd_index < this.commands[fc].cmd.length && !result; cmd_index++) {
                        let args2 = args.slice(1, args.length)[0];
                        if (this.commands[fc].cmd[cmd_index].identifier.includes(args2)) {
                            result = this.commands[fc].cmd[cmd_index];
                        }
                    }
                    if (!result) {
                        result = this.commands[fc].cmdhelper
                    }
                }
            }
            if (!result) {
                for (let cmd_index = 0; cmd_index < basicCommand.cmd.length && !result; cmd_index++) {
                    if (basicCommand.cmd[cmd_index].identifier.includes(args[0])) {
                        result = basicCommand.cmd[cmd_index];
                    }
                }
            }
            if (!result) result = { vaild: false };
            return result
        },
        async execute(task) {
            let args = task.content
            if (task.source == 'console') task.console = logger;
            let result
            for (let fc = 0; fc < this.commands.length && !result; fc++) {
                if (this.commands[fc].identifier.includes(args[0])) {
                    for (let cmd_index = 0; cmd_index < this.commands[fc].cmd.length && !result; cmd_index++) {
                        let args2 = args.slice(1, args.length)[0];
                        if (this.commands[fc].cmd[cmd_index].identifier.includes(args2)) {
                            result = this.commands[fc].cmd[cmd_index];
                        }
                    }
                    if (!result) {
                        result = this.commands[fc].cmdhelper
                    }
                }
            }
            if (!result) {
                for (let cmd_index = 0; cmd_index < basicCommand.cmd.length && !result; cmd_index++) {
                    if (basicCommand.cmd[cmd_index].identifier.includes(args[0])) {
                        result = basicCommand.cmd[cmd_index];
                    }
                }
            }
            logger(true, 'INFO', process.argv[2], `execute task ${task.displayName}`)
            if (result.vaild != true) {
                console.log(task)
                logger(true, 'ERROR', process.argv[2], `task ${task.displayName} not found`)
                return
            }
            // 有些設定等 即時指令不該設狀態
            // const taskStatus = this.moduleStatusMap[args[0]]
            // if (taskStatus) process.send({ type: 'setStatus', value: taskStatus })
            await result.execute(task)
            if (result.longRunning) logger(true, 'INFO', process.argv[2], `任務 ${task.displayName} \x1b[32mcompleted\x1b[0m`)
        },
        async assign(task, longRunning = true) {
            if (longRunning) {
                if (task.sendNotification) {
                    switch (task.source) {
                        case 'minecraft-dm':
                            bot.chat(`/m ${task.minecraftUser} Receive Task Success Add To The Queue`);
                            break;
                        case 'console':
                            logger(true, 'INFO', process.argv[2], "Receive Task \x1b[33mSuccess Add To The Queue\x1b[0m")
                            break;
                        case 'discord':
                            logger(true, 'INFO', process.argv[2], "Receive Task \x1b[33mSuccess Add To The Queue\x1b[0m")
                            break;
                        default:
                            break;
                    }
                }
                this.tasks.push(task)
                if (getLogin()) await this.save();
                if (!this.tasking) await this.loop(true)
            } else {
                this.execute(task)
            }
        },
        async loop(sort = true) {
            if (this.tasking) return
            this.tasking = true;
            process.send({ type: 'setStatus', value: Status.RUNNING_TASK })
            if (sort) this.tasksort()
            let crtTask = this.tasks[0]
            if (getLogin()) await this.save();
            await this.execute(crtTask)
            // 用 indexOf 找回 crtTask 再 splice — 避免「執行中其他指令把 tasks[0] 移除」
            // 後本行誤把後一筆當成已完成任務而再次 shift。
            const idx = this.tasks.indexOf(crtTask)
            if (idx >= 0) this.tasks.splice(idx, 1)
            if (getLogin()) await this.save();
            this.tasking = false;
            process.send({ type: 'setStatus', value: Status.IDLE })
            if (this.tasks.length) await this.loop(true)
        },
        // 從佇列移除任務。target: 'all' / 'top' / 1-indexed 整數。
        // 注意:tasks[0] 若正在執行,移除只清除佇列與持久化,執行中的本體不會被中止。
        // 回傳 { ok, removed: [...], message }。
        async removeTask(target) {
            if (target === 'all' || target === '*') {
                const removed = this.tasks.slice()
                this.tasks = []
                if (getLogin()) await this.save()
                return { ok: true, removed, message: `已移除全部 ${removed.length} 個任務` }
            }
            if (target === 'top' || target === 'first') {
                if (this.tasks.length === 0) return { ok: false, removed: [], message: '無任務可移除' }
                const [removed] = this.tasks.splice(0, 1)
                if (getLogin()) await this.save()
                const note = this.tasking ? ' (注意: 該任務正在執行中,持久化已清除但執行不會中止)' : ''
                return { ok: true, removed: [removed], message: `已移除頂端任務: ${removed?.displayName ?? '<unknown>'}${note}` }
            }
            const n = parseInt(target, 10)
            if (Number.isFinite(n) && n >= 1 && n <= this.tasks.length) {
                const [removed] = this.tasks.splice(n - 1, 1)
                if (getLogin()) await this.save()
                const note = (n === 1 && this.tasking) ? ' (注意: 該任務正在執行中,持久化已清除但執行不會中止)' : ''
                return { ok: true, removed: [removed], message: `已移除索引 ${n} 任務: ${removed?.displayName ?? '<unknown>'}${note}` }
            }
            return { ok: false, removed: [], message: `無效目標: ${target} (用 all / top / 1..${this.tasks.length})` }
        },
        async save() {
            let data = {
                'tasks': this.tasks,
                'err_tasks': this.err_tasks,
            }
            await fsp.writeFile(`${process.cwd()}/config/${process.argv[2]}/task.json`, JSON.stringify(data, null, '\t'), function (err, result) {
                if (err) console.log('tasks save error', err);
            });
        }
    }

    // bind bot reference after init is called
    let bot = null
    const origInit = taskManager.init.bind(taskManager)
    taskManager.init = async function (botRef) {
        bot = botRef
        return origInit()
    }

    return taskManager
}

module.exports = createTaskManager
