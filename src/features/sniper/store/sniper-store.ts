import { action, makeObservable, observable, computed } from 'mobx';
import RootStore from '@/stores/root-store';
import { DerivAPI } from '../services/deriv-api';

import { DBOT_TABS } from '@/constants/bot-contents';

export interface Tick {
    quote: number;
    digit: number;
    epoch: number;
}

export interface StrategyResult {
    strategyId: string;
    match: boolean;
    confidence: number;
    entry: string;
    entryDigit: number;
    digitDistribution: number[];
}

export default class SniperStore {
    root_store: RootStore;
    
    isScanning = false;
    strategyLock = 'none';
    stake = 1;
    takeProfit = 10;
    stopLoss = 10;
    multiplier = 10;
    
    signals: StrategyResult[] = [];
    logs: string[] = [];
    
    ticks: Record<string, Tick[]> = {};
    subscribers: Record<string, any> = {};
    
    MAX_TICKS = 180;
    MIN_TICKS_FOR_SIGNAL = 30;

    constructor(root_store: RootStore) {
        makeObservable(this, {
            isScanning: observable,
            strategyLock: observable,
            stake: observable,
            takeProfit: observable,
            stopLoss: observable,
            multiplier: observable,
            signals: observable,
            logs: observable,
            
            setIsScanning: action,
            setStrategyLock: action,
            setStake: action,
            setTakeProfit: action,
            setStopLoss: action,
            setMultiplier: action,
            addLog: action,
            clearLogs: action,
            updateTicks: action,
            setSignals: action,
            
            startScan: action,
            stopScan: action,
        });
        
        this.root_store = root_store;
    }

    setIsScanning = (val: boolean) => { this.isScanning = val; if (!val) this.stopScan(); };
    setStrategyLock = (val: string) => { this.strategyLock = val; };
    setStake = (val: number) => { this.stake = val; };
    setTakeProfit = (val: number) => { this.takeProfit = val; };
    setStopLoss = (val: number) => { this.stopLoss = val; };
    setMultiplier = (val: number) => { this.multiplier = val; };
    
    addLog = (msg: string) => {
        this.logs = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...this.logs.slice(0, 99)];
    };
    
    clearLogs = () => { this.logs = []; };
    
    setSignals = (signals: StrategyResult[]) => { this.signals = signals; };

    updateTicks = (symbol: string, tick: Tick) => {
        if (!this.ticks[symbol]) this.ticks[symbol] = [];
        this.ticks[symbol] = [tick, ...this.ticks[symbol]].slice(0, this.MAX_TICKS);
        
        // Analyze after update
        const result = this.analyzeMarket(symbol, this.ticks[symbol]);
        if (result && result.match) {
            this.handleSignalFound(symbol, result);
        }
    };

    startScan = (markets: string[]) => {
        this.stopScan();
        this.isScanning = true;
        this.addLog(`Starting scan on ${markets.length} markets...`);
        
        markets.forEach(mId => {
            const api = new DerivAPI((data) => {
                if (data.msg_type === 'tick') {
                    const t = data.tick;
                    const quote = t.quote;
                    const digit = parseInt(quote.toString().slice(-1));
                    this.updateTicks(mId, { quote, digit, epoch: t.epoch });
                }
                if (data.msg_type === 'history') {
                    const history = data.history;
                    const ticks = history.prices.map((p: number, i: number) => ({
                        quote: p,
                        digit: parseInt(p.toString().slice(-1)),
                        epoch: history.times[i]
                    }));
                    this.ticks[mId] = ticks.reverse();
                }
            });

            api.connect().then(() => {
                const token = this.root_store.client.getToken();
                if (token) api.authorize(token);
                api.subscribeTicks(mId);
            });
            this.subscribers[mId] = api;
        });
    };

    stopScan = () => {
        this.isScanning = false;
        Object.values(this.subscribers).forEach(s => s.disconnect());
        this.subscribers = {};
        this.signals = [];
        this.addLog("Scanner stopped.");
    };

    handleSignalFound = (symbol: string, result: StrategyResult) => {
        if (this.strategyLock !== 'none' && result.strategyId.toLowerCase() !== this.strategyLock.toLowerCase()) {
            return;
        }
        
        // Check if signal already exists
        const existingIdx = this.signals.findIndex(s => s.strategyId === result.strategyId);
        if (existingIdx > -1) {
            this.signals[existingIdx] = result;
        } else {
            this.signals = [result, ...this.signals];
        }
    };

    calculateRSI = (ticks: Tick[], period: number = 14): number => {
        if (ticks.length <= period) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const t1 = ticks[ticks.length - i];
            const t2 = ticks[ticks.length - i - 1];
            if (!t1 || !t2) continue;
            const diff = t1.quote - t2.quote;
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        
        if (losses === 0) return 100;
        const rs = gains / losses;
        return 100 - (100 / (1 + rs));
    };

    findPredictiveEntryDigit = (digits: number[], winningDigits: number[], mostAppearing: number) => {
        const windowSize = 121; 
        const lookAhead = 25;
        const analysisDigits = digits.slice(-windowSize);
        
        const scores = Array(10).fill(0);
        const counts = Array(10).fill(0);

        for (let i = 0; i < analysisDigits.length - lookAhead; i++) {
            const currentDigit = analysisDigits[i];
            let wins = 0;
            for (let j = 1; j <= lookAhead; j++) {
                if (winningDigits.includes(analysisDigits[i + j])) {
                    wins++;
                }
            }
            scores[currentDigit] += wins;
            counts[currentDigit]++;
        }

        let bestDigit = mostAppearing; 
        let maxAvgWins = -1;

        for (let d = 0; d <= 9; d++) {
            if (counts[d] > 0) {
                const avgWins = scores[d] / counts[d];
                if (avgWins > maxAvgWins) {
                    maxAvgWins = avgWins;
                    bestDigit = d;
                }
            }
        }
        return bestDigit;
    };

    analyzeMarket = (marketId: string, ticks: Tick[]): StrategyResult | null => {
        if (ticks.length < this.MIN_TICKS_FOR_SIGNAL) return null;

        const lastDigits = ticks.map(t => t.digit);
        const results: StrategyResult[] = [];
        
        // Digit Distribution for UI
        const digitFreq: Record<number, number> = {};
        for (let i = 0; i <= 9; i++) digitFreq[i] = 0;
        lastDigits.forEach(d => digitFreq[d]++);
        const digitDistribution = Array.from({ length: 10 }, (_, i) => (digitFreq[i] || 0) / lastDigits.length);

        const sortedDigits = Object.entries(digitFreq)
            .map(([digit, count]) => ({ digit: parseInt(digit), count }))
            .sort((a, b) => b.count - a.count);
        const mostAppearing = sortedDigits[0].digit;

        // === NEW RESPONSIVE LOGIC ===
        const trendWindow = lastDigits.slice(-60); 
        const momentumWindow = lastDigits.slice(-15);

        const getWindowStats = (digits: number[]) => {
            if (digits.length === 0) return { most: -1, pctEven: 0, pctOdd: 0, pctUnder5: 0, pctOver4: 0 };
            const counts: Record<number, number> = {};
            digits.forEach(d => counts[d] = (counts[d] || 0) + 1);
            const most = Object.entries(counts).sort((a,b) => b[1] - a[1])[0];
            
            return {
                most: most ? parseInt(most[0]) : -1,
                pctEven: digits.filter(d => d % 2 === 0).length / digits.length,
                pctOdd: digits.filter(d => d % 2 !== 0).length / digits.length,
                pctUnder5: digits.filter(d => d < 5).length / digits.length,
                pctOver4: digits.filter(d => d > 4).length / digits.length,
            };
        };

        const trend = getWindowStats(trendWindow);
        const momentum = getWindowStats(momentumWindow);

        // UNDER 5
        const under5Match = (trend.pctUnder5 > 0.53 && trend.most < 5) || (momentum.pctUnder5 > 0.65);
        results.push({
            strategyId: 'UNDER_5',
            match: under5Match,
            confidence: Math.max(trend.pctUnder5, momentum.pctUnder5),
            entry: 'UNDER 5',
            entryDigit: this.findPredictiveEntryDigit(lastDigits, [0,1,2,3,4], mostAppearing),
            digitDistribution
        });

        // OVER 4
        const over4Match = (trend.pctOver4 > 0.53 && trend.most > 4) || (momentum.pctOver4 > 0.65);
        results.push({
            strategyId: 'OVER_4',
            match: over4Match,
            confidence: Math.max(trend.pctOver4, momentum.pctOver4),
            entry: 'OVER 4',
            entryDigit: this.findPredictiveEntryDigit(lastDigits, [5,6,7,8,9], mostAppearing),
            digitDistribution
        });

        // EVEN
        const evenMatch = (trend.pctEven > 0.53 && trend.most % 2 === 0) || (momentum.pctEven > 0.65);
        results.push({
            strategyId: 'EVEN',
            match: evenMatch,
            confidence: Math.max(trend.pctEven, momentum.pctEven),
            entry: 'EVEN',
            entryDigit: this.findPredictiveEntryDigit(lastDigits, [0,2,4,6,8], mostAppearing),
            digitDistribution
        });

        // ODD
        const oddMatch = (trend.pctOdd > 0.53 && trend.most % 2 !== 0) || (momentum.pctOdd > 0.65);
        results.push({
            strategyId: 'ODD',
            match: oddMatch,
            confidence: Math.max(trend.pctOdd, momentum.pctOdd),
            entry: 'ODD',
            entryDigit: this.findPredictiveEntryDigit(lastDigits, [1,3,5,7,9], mostAppearing),
            digitDistribution
        });

        // RSI
        const rsi = this.calculateRSI(ticks);
        let rsiMatch = false;
        let rsiEntry = '';
        if (rsi > 75) { rsiMatch = true; rsiEntry = 'FALL'; }
        else if (rsi < 25) { rsiMatch = true; rsiEntry = 'RISE'; }
        
        results.push({
            strategyId: 'RSI_TECH',
            match: rsiMatch,
            confidence: Math.abs(rsi - 50) / 50,
            entry: rsiEntry,
            entryDigit: mostAppearing,
            digitDistribution
        });

        // Filter by lock
        const finalResults = this.strategyLock === 'none' 
            ? results 
            : results.filter(r => r.strategyId.toUpperCase() === this.strategyLock.toUpperCase());

        const best = finalResults.reduce((prev, curr) => (curr.match && curr.confidence > prev.confidence) ? curr : prev, { match: false, confidence: 0 } as any);

        return best.match ? best : null;
    };

    executeTrade = async (signal: any) => {
        if (!signal) return;
        
        this.addLog(`Loading Bot for ${signal.marketId} @ ${signal.entry}...`);

        try {
            const response = await fetch('/xml/Entry point Bot over 2.xml');
            const xml = await response.text();

            // Patch XML with signal data
            let modifiedXml = xml.replace(
                /<block type="math_number" id="\$\?c=egHj3\+\^Omn8#P:L\)">\s*<field name="NUM">\d+<\/field>/g,
                `<block type="math_number" id="$?c=egHj3+^Omn8#P:L)"><field name="NUM">${signal.entryDigit ?? 0}</field>`
            );

            // Patch User Defined Settings
            modifiedXml = modifiedXml.replace(
                /(<field name="VAR" [^>]*>Stake<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
                `$1${this.stake}$2`
            );
            modifiedXml = modifiedXml.replace(
                /(<field name="VAR" [^>]*>Take Profit<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
                `$1${this.takeProfit}$2`
            );
            modifiedXml = modifiedXml.replace(
                /(<field name="VAR" [^>]*>Stop Loss<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
                `$1${this.stopLoss}$2`
            );
            modifiedXml = modifiedXml.replace(
                /(<field name="VAR" [^>]*>Martingale<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
                `$1${this.multiplier}$2`
            );

            // Market and Strategy mapping
            modifiedXml = modifiedXml.replace(/<field name="SYMBOL_LIST">.*?<\/field>/g, `<field name="SYMBOL_LIST">${signal.marketId}</field>`);
            const isJumpIndex = signal.marketId.startsWith('JD');
            modifiedXml = modifiedXml.replace(/<field name="SUBMARKET_LIST">.*?<\/field>/g, `<field name="SUBMARKET_LIST">${isJumpIndex ? 'jump_index' : 'random_index'}</field>`);

            const isDigitEntry = ['UNDER 5', 'OVER 4', 'EVEN', 'ODD'].includes(signal.entry);
            if (isDigitEntry) {
                modifiedXml = modifiedXml.replace(/<field name="TRADETYPECAT_LIST">.*?<\/field>/g, `<field name="TRADETYPECAT_LIST">digits</field>`);
                const typeMap: Record<string, string> = { 'UNDER 5': 'overunder', 'OVER 4': 'overunder', 'EVEN': 'evenodd', 'ODD': 'evenodd' };
                const subTypeMap: Record<string, string> = { 'UNDER 5': 'DIGITUNDER', 'OVER 4': 'DIGITOVER', 'EVEN': 'DIGITEVEN', 'ODD': 'DIGITODD' };
                
                modifiedXml = modifiedXml.replace(/<field name="TRADETYPE_LIST">.*?<\/field>/g, `<field name="TRADETYPE_LIST">${typeMap[signal.entry] || 'overunder'}</field>`);
                modifiedXml = modifiedXml.replace(/<field name="TYPE_LIST">.*?<\/field>/g, `<field name="TYPE_LIST">${subTypeMap[signal.entry] || 'DIGITUNDER'}</field>`);
                modifiedXml = modifiedXml.replace(/<field name="PURCHASE_LIST">.*?<\/field>/g, `<field name="PURCHASE_LIST">${subTypeMap[signal.entry] || 'DIGITUNDER'}</field>`);
                
                const needsPrediction = typeMap[signal.entry] === 'overunder';
                modifiedXml = modifiedXml.replace(
                    /<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6\/\(ac">\s*<mutation xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="(true|false)"><\/mutation>/g,
                    `<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6/(ac"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="${needsPrediction ? 'true' : 'false'}"></mutation>`
                );

                if (needsPrediction) {
                    let prediction = signal.entryDigit;
                    if (signal.entry === 'UNDER 5') prediction = 5;
                    if (signal.entry === 'OVER 4') prediction = 4;
                    modifiedXml = modifiedXml.replace(
                        /<shadow type="math_number_positive" id="\}!H\]\{1cFD-lwfop@y\{sn"(?: inline="true")?>\s*<field name="NUM">\d+<\/field>/g,
                        `<shadow type="math_number_positive" id="}!H]{1cFD-lwfop@y{sn" inline="true"><field name="NUM">${prediction}</field>`
                    );
                }
            } else {
                const contractType = signal.entry === 'RISE' ? 'CALL' : 'PUT';
                modifiedXml = modifiedXml.replace(/<field name="TYPE_LIST">.*?<\/field>/g, `<field name="TYPE_LIST">${contractType}</field>`);
                modifiedXml = modifiedXml.replace(/<field name="PURCHASE_LIST">.*?<\/field>/g, `<field name="PURCHASE_LIST">${contractType}</field>`);
                modifiedXml = modifiedXml.replace(/<field name="TRADETYPECAT_LIST">.*?<\/field>/g, `<field name="TRADETYPECAT_LIST">callput</field>`);
                modifiedXml = modifiedXml.replace(/<field name="TRADETYPE_LIST">.*?<\/field>/g, `<field name="TRADETYPE_LIST">callput</field>`);
            }

            this.root_store.dashboard.setPendingFreeBot({ name: 'Entry Point Bot', xml: modifiedXml, should_auto_run: true });
            this.root_store.dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            this.addLog(`Bot configured with Entry Digit: ${signal.entryDigit}. Redirecting...`);
        } catch (err) {
            this.addLog('Error initializing trade: ' + err);
        }
    };
}
