const Status = {
  // 通用
  CLOSED:                'Closed',
  FREE:                  'Free',
  TASKING:               'In tasking',
  RAID:                  'Raid',
  RELOAD_COOLDOWN:       'Waiting Reload CoolDown',
  ACCOUNT_LIMIT:         'Account limit',
  SERVER_RELOADING:         'Server Reloading',
  PROXY_RESTARTING:      'Proxy Server Restarting',
  HIGH_PING:             'Closed(High Ping)',
  // 錯誤關閉
  CLOSED_PROFILE_NOT_FOUND: 'Closed(Profile Not Found)',
  CLOSED_TYPE_NOT_FOUND:    'Closed(Type Not Found)',
  // Raid
  RAID_RUNNING:          'Running(Raid)',
  RAID_CLOSED_NOT_FOUND: 'Closed(RaidFarm Not Found)',
  // General
  MSA_AUTH_REQUIRED:     'MSA Auth Required',
  LOGGING_IN:            'Logging in',
  RESTARTING:            'Restarting',
  RUNNING:               'Running',
  IDLE:                  'Running(Idle)',
  RUNNING_TASK:          'Running(Tasking)',
  // Quest
  QUESTING:              'Questing(Handling)',
  QUEST_WAITING:         'Questing(Wait Next)',
  QUEST_DAILY_LIMIT:     'Questing(Daily Limit)',
  // Task 細項
  TASK_MAPART:           'Tasking(Mapart)',
  TASK_BUILD:            'Tasking(Build)',
  TASK_CLEAR_AREA:       'Tasking(ClearArea)',
  TASK_WAREHOUSE:        'Tasking(Warehouse)',
  TASK_FARM:             'Tasking(Farm)',
  TASK_PAUSED:           'Tasking(Paused)',
  // VILLAGER 細項
  TASK_VILLAGER:         'Tasking(Villager)',
  VILLAGER_TRAINING:     'Villager(Training)',
  VILLAGER_CURING:       'Villager(CURING)',
  VILLAGER_PUT:          'Villager(PUTTING)',
  VILLAGER_TRADING_MP:   'Trading(MP)',
  VILLAGER_TRADING_IRON: 'Trading(IRON)',
  // WareHouse 細項
  WAREHOUSE_STANDBY:     'WAREHOUSE(Standby)',
  WAREHOUSE_DEPOSIT:     'WAREHOUSE(Depositing)',
  WAREHOUSE_WITHDRAW:    'WAREHOUSE(Withdrawing)',
  WAREHOUSE_FIX:         'WAREHOUSE(Fixing)',
  WAREHOUSE_TRANSFER:    'WAREHOUSE(Transfering)',
  WAREHOUSE_UNPACK:      'WAREHOUSE(Unpacking)',
  WAREHOUSE_PACK:        'WAREHOUSE(Packing)'
}

module.exports = Status
