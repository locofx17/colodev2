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
    SMART_ANALYSIS: 5,
    DTRADER: 6,
    AUTO_TRADES: 7,
    TRADING_PLANS: 8,
    SNIPER: 9,
    COPYCAT: 10,
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
    'id-smart-analysis',
    'id-dtrader',
    'id-auto-trades',
    'id-trading-plans',
    'id-sniper',
    'id-copycat',
];


export const DEBOUNCE_INTERVAL_TIME = 500;
