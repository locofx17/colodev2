type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
    DASHBOARD: 0,
    BOT_BUILDER: 1,
    CHART: 2,
    FREE_BOTS: 3,
    DCIRCLE: 4,
    COPYCAT: 5,
    SMART_ANALYSIS: 6,
    DTRADER: 7,
    AUTO_TRADES: 8,
    TRADING_PLANS: 9,
    SNIPER: 10,
    // Keep TUTORIAL as a non-active sentinel to avoid index mismatches in legacy checks
    TUTORIAL: 999,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
    'id-dbot-dashboard',
    'id-bot-builder',
    'id-charts',
    'id-free-bots',
    'id-dcircle',
    'id-copycat',
    'id-smart-analysis',
    'id-dtrader',
    'id-auto-trades',
    'id-trading-plans',
    'id-sniper',
];

export const DEBOUNCE_INTERVAL_TIME = 500;
