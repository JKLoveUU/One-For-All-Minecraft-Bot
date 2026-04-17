const Status = {
  // 通用
  CLOSED:                'Closed',
  FREE:                  'Free',
  TASKING:               'In tasking',
  RAID:                  'Raid',
  RELOAD_COOLDOWN:       'Waiting Reload CoolDown',
  WAIT_NEXT_QUEST:       'Wait Next Quest',
  PROXY_RESTARTING:      'Proxy Server Restarting',
  HIGH_PING:             'Closed(High Ping)',
  // 錯誤關閉
  CLOSED_PROFILE_NOT_FOUND: 'Closed(Profile Not Found)',
  CLOSED_TYPE_NOT_FOUND:    'Closed(Type Not Found)',
  // Raid
  RAID_RUNNING:          'Running(Raid)',
  RAID_CLOSED_NOT_FOUND: 'Closed(RaidFarm Not Found)',
  // General
  LOGGING_IN:            'Logging in',
  RESTARTING:            'Restarting',
  RUNNING:               'Running',
  IDLE:                  'Running(Idle)',
  RUNNING_TASK:          'Running(Tasking)',
  // Quest
  QUESTING:              'Questing(Handling)',
  QUEST_WAITING:         'Questing(Wait Next)',
  // Task 細項
  TASK_MAPART:           'Tasking(Mapart)',
  TASK_BUILD:            'Tasking(Build)',
  TASK_CLEAR_AREA:       'Tasking(ClearArea)',
  TASK_WAREHOUSE:        'Tasking(Warehouse)',
  TASK_VILLAGER:         'Tasking(Villager)',
  TASK_FARM:             'Tasking(Farm)',
  TASK_PAUSED:           'Tasking(Paused)',
}

module.exports = Status
