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
    COPY_TRADING: 5,
    SMART_TRADER: 6,
    DTRADER: 7,
    AUTO_TRADES: 8,
    GENERATER: 12,
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
    'id-copy-trading',
    'id-smart-trader',
    'id-dtrader',
    'id-auto-trades',
    'id-tradingview',
    'id-analysis-tool',
    'id-signals',
    'id-generater',
];


export const DEBOUNCE_INTERVAL_TIME = 500;
