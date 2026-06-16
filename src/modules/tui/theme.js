// TUI 主題色、版面常數、分頁名稱、輪播提示（由 tui.js 抽出）
const TOP_H    = 12
const CMD_H    = 3
const STATUS_H = 1
const TABS_H   = 2

const T = {
    bg:        '#1e1e2e',
    surface:   '#313244',
    overlay:   '#45475a',
    text:      '#cdd6f4',
    subtext:   '#bac2de',
    muted:     '#6c7086',
    primary:   '#c6a0f6',
    secondary: '#f5c2e7',
    success:   '#a6e3a1',
    warning:   '#f9e2af',
    error:     '#eba0ac',
    accent:    '#89b4fa',
}

const TAB_NAMES = ['Dashboard', 'Console', 'Profiles', 'Helps', 'Settings']

const TIPS = [
    'press / to enter a command',
    'use ←/→ or 1-5 to switch tabs',
    'select a bot in the list to view its info',
    'scroll wheel works in copy mode (press m)',
    'Console: ↑/↓ selects a bot, wheel scrolls the log',
    'G jumps log to bottom, g jumps to top',
    '/exit or /quit to leave the program',
    '↑/↓ walks command history in command mode',
    'press l on a bot to toggle its log filter',
    'press d on a bot to show its DEBUG output',
    'mouse selection requires copy mode (m)',
]

module.exports = { T, TOP_H, CMD_H, STATUS_H, TABS_H, TAB_NAMES, TIPS }
