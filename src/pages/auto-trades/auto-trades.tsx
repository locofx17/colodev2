import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Play, 
    Pause, 
    Square, 
    Shield, 
    Zap, 
    History, 
    TrendingUp, 
    BarChart3, 
    Settings2, 
    RotateCcw, 
    Activity, 
    Wallet,
    Target,
    AlertCircle,
    Youtube
} from 'lucide-react';
import './auto-trades.scss';

// ========== CONFIG ==========
const CONFIG = {
    RECONNECT_DELAY: 2000,
    TRADE_COOLDOWN_MS: 800,
};

const ALL_MARKETS = [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
    'J10', 'J25', 'J50', 'J75', 'J100',
    'RDBULL', 'RDBEAR'
];

const CATEGORIES: Record<string, string[]> = {
    all: ALL_MARKETS,
    volatility: ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V'],
    '1s_jump': ['1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V', 'J10', 'J25', 'J50', 'J75', 'J100'],
    'daily_jump': ['RDBULL', 'RDBEAR', 'J10', 'J25', 'J50', 'J75', 'J100']
};

const DECIMAL_OVERRIDES: Record<string, number> = {
    'R_10': 3, 'R_25': 3, 'R_50': 4, 'R_75': 4, 'R_100': 2,
    '1HZ10V': 2, '1HZ15V': 3, '1HZ25V': 2, '1HZ30V': 3,
    '1HZ50V': 2, '1HZ75V': 2, '1HZ90V': 3, '1HZ100V': 2,
    'RDBULL': 4, 'RDBEAR': 4,
    'J10': 2, 'J25': 2, 'J50': 2, 'J75': 2, 'J100': 2
};

const BrandedYouTubeIcon = ({ size = 18 }: { size?: number }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
    >
        <path 
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" 
            fill="white"
        />
        <path 
            d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" 
            fill="#7a0000"
        />
    </svg>
);

const AutoTrades = observer(() => {
    const { client, transactions, run_panel } = useStore();
    // --- UI State ---
    const [baseStake, setBaseStake] = useState(0.35);
    const [multiplier, setMultiplier] = useState(2.1);
    const [recoveryToggle, setRecoveryToggle] = useState(true);
    const [martingaleToggle, setMartingaleToggle] = useState(true);
    const [stopLoss, setStopLoss] = useState(10);
    const [takeProfit, setTakeProfit] = useState(20);
    const [consecutiveLossLimit, setConsecutiveLossLimit] = useState(3);
    const [stopType, setStopType] = useState('amount');
    const [mainStrategy, setMainStrategy] = useState('over1');
    const [selectedCategory, setSelectedCategory] = useState('all');

    // Recovery patterns
    const [recoveryTicks, setRecoveryTicks] = useState(10);
    const [recoveryConditionType, setRecoveryConditionType] = useState('over');
    const [recoveryConditionOperator, setRecoveryConditionOperator] = useState('>');
    const [recoveryConditionBarrier, setRecoveryConditionBarrier] = useState(3);
    const [recoveryTradeType, setRecoveryTradeType] = useState('under');
    const [recoveryTradeBarrier, setRecoveryTradeBarrier] = useState(5);

    // Dynamic stats
    const [balance, setBalance] = useState('0.00');
    const [totalStakeVal, setTotalStakeVal] = useState(0);
    const [totalProfitVal, setTotalProfitVal] = useState(0);
    const [winCount, setWinCount] = useState(0);
    const [lossCount, setLossCount] = useState(0);
    const [isTrading, setIsTrading] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [journal, setJournal] = useState<{id: number, type: string, message: string, color: string, time: string}[]>([]);
    const [marketData, setMarketData] = useState<Record<string, {digit: number|string, price: string, history: number[]}>>({});

    // --- Logic Refs ---
    const wsRef = useRef<WebSocket | null>(null);
    const stateRef = useRef({
        isTrading: false,
        isPaused: false,
        isRecovery: false,
        currentStake: 0.35,
        totalProfitVal: 0,
        totalStakeVal: 0,
        winCount: 0,
        lossCount: 0,
        consecutiveLosses: 0,
        recoveryAttempts: 0,
        recoveryWinStreak: 0,
        tickHistory: new Map<string, number[]>(),
        priceHistory: new Map<string, number[]>(),
        pipSizes: new Map<string, number>(),
        globalTradeLock: false,
        pendingProposalSymbol: null as string | null,
        activeContracts: new Set<string>(),
        tradeCooldownUntil: 0,
        isAuthorized: false,
    });

    const journalIdRef = useRef(0);

    useEffect(() => {
        stateRef.current.isTrading = isTrading;
        stateRef.current.isPaused = isPaused;
        stateRef.current.isRecovery = isRecoveryMode;
    }, [isTrading, isPaused, isRecoveryMode]);

    useEffect(() => {
        stateRef.current.currentStake = baseStake;
    }, [baseStake]);

    useEffect(() => {
        if (client.balance && !isTrading) {
            setBalance(Number(client.balance).toFixed(2));
        }
    }, [client.balance, isTrading]);

    // --- Utilities ---
    const logJournal = useCallback((type: string, message: string, color: string) => {
        const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setJournal(prev => [{
            id: ++journalIdRef.current,
            type,
            message,
            color,
            time
        }, ...prev].slice(0, 30));
    }, []);

    const updateMarketTile = useCallback((symbol: string, digit: number, formattedPrice: string, history: number[]) => {
        setMarketData(prev => ({
            ...prev,
            [symbol]: { digit, price: formattedPrice, history }
        }));
    }, []);

    const getLastDigit = (quote: number, symbol: string) => {
        if (DECIMAL_OVERRIDES[symbol] !== undefined) {
            const decimals = DECIMAL_OVERRIDES[symbol];
            const multiplier = Math.pow(10, decimals);
            const scaled = Math.round(quote * multiplier);
            return scaled % 10;
        }
        let pipSize = stateRef.current.pipSizes.get(symbol);
        if (!pipSize) pipSize = symbol.startsWith('1HZ') ? 0.001 : 0.01;
        const multiplier = Math.round(1 / pipSize);
        const scaled = Math.round(quote * multiplier);
        return scaled % 10;
    };

    const formatPrice = (quote: number, symbol: string) => {
        if (DECIMAL_OVERRIDES[symbol] !== undefined) return Number(quote).toFixed(DECIMAL_OVERRIDES[symbol]);
        let pipSize = stateRef.current.pipSizes.get(symbol);
        if (!pipSize) pipSize = symbol.startsWith('1HZ') ? 0.001 : 0.01;
        const decimals = Math.round(Math.log10(1 / pipSize));
        return Number(quote).toFixed(decimals);
    };

    const digitMatchesOperator = (digit: number, operator: string, barrier: number) => {
        if (operator === '>') return digit > barrier;
        if (operator === '>=') return digit >= barrier;
        if (operator === '<') return digit < barrier;
        if (operator === '<=') return digit <= barrier;
        if (operator === '=') return digit === barrier;
        return false;
    };

    const getContractForTrade = (tradeType: string, barrier: number) => {
        if (tradeType === 'odd') return { contract: 'DIGITODD', barrier: '0' };
        if (tradeType === 'even') return { contract: 'DIGITEVEN', barrier: '0' };
        if (tradeType === 'rise') return { contract: 'CALL', barrier: null };
        if (tradeType === 'fall') return { contract: 'PUT', barrier: null };
        if (tradeType === 'equal') return { contract: 'DIGITMATCH', barrier: barrier.toString() };
        if (tradeType === 'over') return { contract: 'DIGITOVER', barrier: barrier.toString() };
        if (tradeType === 'under') return { contract: 'DIGITUNDER', barrier: barrier.toString() };
        return { contract: 'DIGITOVER', barrier: '0' };
    };

    const priceConditionMatches = (symbol: string, ticksNeeded: number, condType: string) => {
        const priceHist = stateRef.current.priceHistory.get(symbol);
        if (!priceHist || priceHist.length < ticksNeeded + 1) return false;
        const startIdx = priceHist.length - ticksNeeded - 1;
        for (let i = 0; i < ticksNeeded; i++) {
            const curr = priceHist[startIdx + i + 1];
            const prev = priceHist[startIdx + i];
            if (condType === 'rise' && curr <= prev) return false;
            if (condType === 'fall' && curr >= prev) return false;
        }
        return true;
    };

    // --- Trading Logic ---
    const requestProposal = (symbol: string, contractType: string, barrier: string | null) => {
        if (!stateRef.current.isTrading || stateRef.current.isPaused || stateRef.current.globalTradeLock) return;
        
        stateRef.current.globalTradeLock = true;
        setTimeout(() => { stateRef.current.globalTradeLock = false; }, 10000);

        const roundedStake = Math.round(stateRef.current.currentStake * 100) / 100;
        if (roundedStake <= 0) {
            logJournal('ERROR', 'Stake must be positive', 'text-red-500');
            stateRef.current.globalTradeLock = false;
            stateRef.current.pendingProposalSymbol = null;
            return;
        }

        const req: any = {
            proposal: 1,
            amount: roundedStake,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: symbol
        };
        if (barrier !== null && (contractType.includes('OVER') || contractType.includes('UNDER') || contractType.includes('MATCH'))) {
            req.barrier = barrier;
        }

        logJournal('PROPOSAL', `${contractType} ${symbol} @ $${roundedStake.toFixed(2)}`, 'text-blue-400');
        wsRef.current?.send(JSON.stringify(req));
    };

    const checkLogic = (symbol: string, digit: number) => {
        if (Date.now() < stateRef.current.tradeCooldownUntil) return;
        if (stateRef.current.pendingProposalSymbol === symbol) return;

        if (!stateRef.current.isRecovery) {
            const hist = stateRef.current.tickHistory.get(symbol);
            if (!hist) return;

            if (mainStrategy === 'over1' || mainStrategy === 'under8') {
                if (hist.length < 3) return;
                const last3 = hist.slice(-3);
                if (mainStrategy === 'over1' && last3.every(d => d < 4)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITOVER', '1');
                } else if (mainStrategy === 'under8' && last3.every(d => d > 6)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITUNDER', '8');
                }
            } else if (mainStrategy === 'over1_5_le2') {
                if (hist.length < 5) return;
                const last5 = hist.slice(-5);
                if (last5.every(d => d <= 2)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITOVER', '1');
                }
            } else if (mainStrategy === 'under8_5_ge7') {
                if (hist.length < 5) return;
                const last5 = hist.slice(-5);
                if (last5.every(d => d >= 7)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITUNDER', '8');
                }
            } else if (mainStrategy === 'over2_7_le3') {
                if (hist.length < 7) return;
                const last7 = hist.slice(-7);
                if (last7.every(d => d <= 3)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITOVER', '2');
                }
            } else if (mainStrategy === 'under7_7_ge6') {
                if (hist.length < 7) return;
                const last7 = hist.slice(-7);
                if (last7.every(d => d >= 6)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITUNDER', '7');
                }
            } else if (mainStrategy === 'over3_7_le3') {
                if (hist.length < 7) return;
                const last7 = hist.slice(-7);
                if (last7.every(d => d <= 3)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITOVER', '3');
                }
            } else if (mainStrategy === 'under6_7_ge6') {
                if (hist.length < 7) return;
                const last7 = hist.slice(-7);
                if (last7.every(d => d >= 6)) {
                    stateRef.current.pendingProposalSymbol = symbol;
                    requestProposal(symbol, 'DIGITUNDER', '6');
                }
            }
        } else {
            let conditionMet = false;
            if (recoveryConditionType === 'rise' || recoveryConditionType === 'fall') {
                conditionMet = priceConditionMatches(symbol, recoveryTicks, recoveryConditionType);
            } else {
                const hist = stateRef.current.tickHistory.get(symbol);
                if (!hist || hist.length < recoveryTicks) return;
                const recent = hist.slice(-recoveryTicks);
                if (recoveryConditionType === 'odd') conditionMet = recent.every(d => d % 2 !== 0);
                else if (recoveryConditionType === 'even') conditionMet = recent.every(d => d % 2 === 0);
                else conditionMet = recent.every(d => digitMatchesOperator(d, recoveryConditionOperator, recoveryConditionBarrier));
            }
            if (!conditionMet) return;
            const mapping = getContractForTrade(recoveryTradeType, recoveryTradeBarrier);
            stateRef.current.pendingProposalSymbol = symbol;
            requestProposal(symbol, mapping.contract, mapping.barrier);
        }
    };

    const handleContractResult = (contract: any) => {
        // Log to global transactions store
        transactions.onBotContractEvent(contract);

        if (!contract.is_sold) return;
        const contractId = contract.contract_id;
        if (!stateRef.current.activeContracts.has(contractId)) return;
        stateRef.current.activeContracts.delete(contractId);
        stateRef.current.pendingProposalSymbol = null;

        const profit = parseFloat(contract.profit);
        stateRef.current.totalProfitVal += profit;
        stateRef.current.totalStakeVal += contract.buy_price;

        setTotalProfitVal(stateRef.current.totalProfitVal);
        setTotalStakeVal(stateRef.current.totalStakeVal);

        if (profit > 0) {
            stateRef.current.winCount++;
            setWinCount(stateRef.current.winCount);
            stateRef.current.consecutiveLosses = 0;
            if (stateRef.current.isRecovery) {
                stateRef.current.recoveryWinStreak++;
                logJournal('RECOVERY', `Win #${stateRef.current.recoveryWinStreak} in recovery`, 'text-green-400');
                if (stateRef.current.recoveryWinStreak >= 2) {
                    stateRef.current.isRecovery = false;
                    stateRef.current.recoveryAttempts = 0;
                    stateRef.current.recoveryWinStreak = 0;
                    setIsRecoveryMode(false);
                    stateRef.current.currentStake = baseStake;
                    logJournal('SYSTEM', 'Recovery complete – back to main logic', 'text-blue-400');
                } else {
                    stateRef.current.currentStake = baseStake;
                    stateRef.current.recoveryAttempts = 0;
                }
            } else {
                stateRef.current.currentStake = baseStake;
            }
        } else {
            stateRef.current.lossCount++;
            setLossCount(stateRef.current.lossCount);
            stateRef.current.consecutiveLosses++;
            if (recoveryToggle) {
                stateRef.current.isRecovery = true;
                stateRef.current.recoveryAttempts++;
                stateRef.current.recoveryWinStreak = 0;
                setIsRecoveryMode(true);
            }
            if (martingaleToggle) {
                stateRef.current.currentStake *= multiplier;
                if (stateRef.current.currentStake > 100) stateRef.current.currentStake = 100;
            }
        }

        logJournal('RESULT', `${contract.symbol} ${profit > 0 ? 'WIN' : 'LOSS'} (Net: $${profit.toFixed(2)})`, profit > 0 ? 'text-green-400' : 'text-red-400');
        stateRef.current.tradeCooldownUntil = Date.now() + CONFIG.TRADE_COOLDOWN_MS;
        stateRef.current.globalTradeLock = false;

        // Risk Halt
        let stopTriggered = false;
        let reason = '';
        if (stateRef.current.totalProfitVal >= takeProfit) { stopTriggered = true; reason = 'TAKE PROFIT'; }
        else if (stopType === 'amount') { if (stateRef.current.totalProfitVal <= -stopLoss) { stopTriggered = true; reason = 'STOP LOSS'; } }
        else if (stopType === 'consec') { if (stateRef.current.consecutiveLosses >= consecutiveLossLimit) { stopTriggered = true; reason = 'LOSS LIMIT'; } }

        if (stopTriggered) { logJournal('SYSTEM', `${reason} reached. Stopping.`, 'text-yellow-400'); stopBot(); }
    };

    const connect = () => {
        const activeToken = client.getToken();
        if (!activeToken) { 
            logJournal('SYSTEM', 'Active account token not found. Please ensure you are logged in.', 'text-red-400'); 
            setIsTrading(false);
            return; 
        }
        const ws = new WebSocket(`wss://ws.binaryws.com/websockets/v3?app_id=${getAppId()}`);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ authorize: activeToken }));
        ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.msg_type === 'authorize') {
                if (data.error) { logJournal('ERROR', data.error.message, 'text-red-500'); setIsTrading(false); return; }
                stateRef.current.isAuthorized = true;
                ws.send(JSON.stringify({ asset_index: 1 }));
                ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            }
            if (data.msg_type === 'asset_index') {
                Object.values(data.asset_index).forEach((cat: any) => cat.forEach((asset: any) => {
                    if (asset.symbol && typeof asset.pip_size === 'number') stateRef.current.pipSizes.set(asset.symbol, asset.pip_size);
                }));
                logJournal('SYSTEM', `Pip sizes loaded.`, 'text-blue-400');
                subscribeMarkets();
            }
            if (data.msg_type === 'balance') setBalance(data.balance.balance.toFixed(2));
            if (data.msg_type === 'tick') {
                const { symbol, quote } = data.tick;
                const digit = getLastDigit(quote, symbol);
                const price = formatPrice(quote, symbol);
                if (!stateRef.current.tickHistory.has(symbol)) stateRef.current.tickHistory.set(symbol, []);
                const tHist = stateRef.current.tickHistory.get(symbol)!;
                tHist.push(digit); if (tHist.length > 10) tHist.shift();
                if (!stateRef.current.priceHistory.has(symbol)) stateRef.current.priceHistory.set(symbol, []);
                const pHist = stateRef.current.priceHistory.get(symbol)!;
                pHist.push(quote); if (pHist.length > 20) pHist.shift();
                updateMarketTile(symbol, digit, price, [...tHist]);
                if (stateRef.current.isTrading && !stateRef.current.isPaused && !stateRef.current.globalTradeLock) checkLogic(symbol, digit);
            }
            if (data.msg_type === 'proposal') {
                if (data.error) { logJournal('ERROR', data.error.message, 'text-red-500'); stateRef.current.pendingProposalSymbol = null; stateRef.current.globalTradeLock = false; }
                else ws.send(JSON.stringify({ buy: data.proposal.id, price: data.echo_req.amount }));
            }
            if (data.msg_type === 'buy') {
                if (data.error) { logJournal('ERROR', `Buy failed: ${data.error.message}`, 'text-red-500'); stateRef.current.pendingProposalSymbol = null; stateRef.current.globalTradeLock = false; }
                else { stateRef.current.activeContracts.add(data.buy.contract_id); ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 })); }
            }
            if (data.msg_type === 'proposal_open_contract') handleContractResult(data.proposal_open_contract);
        };
        ws.onclose = () => { stateRef.current.isAuthorized = false; if (stateRef.current.isTrading) setTimeout(connect, CONFIG.RECONNECT_DELAY); };
    };

    const subscribeMarkets = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        CATEGORIES[selectedCategory].forEach(s => wsRef.current?.send(JSON.stringify({ ticks: s, subscribe: 1 })));
        logJournal('SYSTEM', `Subscribed to ${CATEGORIES[selectedCategory].length} markets`, 'text-blue-400');
    };

    const startTrading = () => {
        setIsTrading(true); 
        setIsPaused(false); 
        logJournal('SYSTEM', 'Bot started', 'text-green-400');
        
        // Sync with global run panel
        run_panel.run_id = `auto-run-${Date.now()}`;
        run_panel.setIsRunning(true);

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) connect(); else subscribeMarkets();
    };

    const stopBot = () => { 
        setIsTrading(false); 
        setIsPaused(false); 
        logJournal('SYSTEM', 'Bot Stopped', 'text-slate-400'); 
        
        // Sync with global run panel
        run_panel.setIsRunning(false);
        
        wsRef.current?.send(JSON.stringify({ forget_all: 'ticks' })); 
    };

    const clearJournalAndReset = () => {
        setJournal([]); setTotalStakeVal(0); setTotalProfitVal(0); setWinCount(0); setLossCount(0); setIsRecoveryMode(false);
        stateRef.current.totalProfitVal = 0; stateRef.current.totalStakeVal = 0; stateRef.current.winCount = 0; stateRef.current.lossCount = 0;
        stateRef.current.consecutiveLosses = 0; stateRef.current.isRecovery = false; stateRef.current.recoveryAttempts = 0;
        stateRef.current.recoveryWinStreak = 0; stateRef.current.currentStake = baseStake;
        logJournal('SYSTEM', 'Stats reset', 'text-blue-400');
    };

    useEffect(() => { if (wsRef.current && stateRef.current.isAuthorized) { wsRef.current.send(JSON.stringify({ forget_all: 'ticks' })); subscribeMarkets(); } }, [selectedCategory]);

    useEffect(() => { return () => wsRef.current?.close(); }, []);

    const totalTrades = winCount + lossCount;
    const winRate = totalTrades ? ((winCount / totalTrades) * 100).toFixed(0) : '0';

    const getStrategyLabel = (val: string) => {
        const labels: any = {
            over1: 'Over 1 (3 digits < 4)',
            under8: 'Under 8 (3 digits > 6)',
            over1_5_le2: 'Over 1 (5 digits ≤ 2)',
            under8_5_ge7: 'Under 8 (5 digits ≥ 7)',
            over2_7_le3: 'Over 2 (7 digits ≤ 3)',
            under7_7_ge6: 'Under 7 (7 digits ≥ 6)',
            over3_7_le3: 'Over 3 (7 digits ≤ 3)',
            under6_7_ge6: 'Under 6 (7 digits ≥ 6)',
        };
        return labels[val] || val;
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="auto-trades"
        >
            <header className="dash-header">
                <div className="brand">
                    <h1 className="title">LOCO THE TRADER</h1>
                    <p className="subtitle">ELITE AUTO ENGINE</p>
                </div>
                <div className="status-badge">
                    <Shield className="icon text-blue-400" size={14} />
                    <span className="text-[10px] uppercase tracking-wider font-bold">
                        {client.is_logged_in ? `Account: ${client.loginid}` : 'Guest Mode'}
                    </span>
                </div>
                <button 
                    onClick={() => window.open('https://youtu.be/_6-6kHGF-1s?si=1PVqAAIgIRXFL4Z8', '_blank')}
                    className="btn-guide"
                >
                    <BrandedYouTubeIcon size={20} />
                    <span>YouTube Guide</span>
                </button>
            </header>

            <section className="stats-grid">
                <div className="glass-panel stat-card">
                    <span className="label"><Wallet size={12} className="mr-1" /> Balance</span>
                    <span className="value mono text-white">${balance}</span>
                </div>
                <div className="glass-panel stat-card">
                    <span className="label"><Activity size={12} className="mr-1" /> Stake</span>
                    <span className="value mono text-white">${totalStakeVal.toFixed(2)}</span>
                </div>
                <div className="glass-panel stat-card">
                    <span className="label"><TrendingUp size={12} className="mr-1" /> Profit</span>
                    <span className={`value mono ${totalProfitVal >= 0 ? 'text-green-400' : 'text-red-400'}`}>${totalProfitVal.toFixed(2)}</span>
                </div>
                <div className="glass-panel stat-card">
                    <span className="label"><BarChart3 size={12} className="mr-1" /> Accuracy</span>
                    <span className="value mono text-blue-400">{winRate}%</span>
                </div>
            </section>

            <section className="info-grid">
                <div className="glass-panel stat-card">
                    <span className="label">Total</span>
                    <span className="value mono">{totalTrades}</span>
                </div>
                <div className="glass-panel stat-card">
                    <span className="label">Wins</span>
                    <span className="value mono text-green-400">{winCount}</span>
                </div>
                <div className="glass-panel stat-card">
                    <span className="label">Losses</span>
                    <span className="value mono text-red-400">{lossCount}</span>
                </div>
            </section>

            <motion.div 
                layout
                className={`glass-panel logic-display ${isRecoveryMode ? 'glow-red' : 'glow-green'}`}
            >
                <div className="decorator"></div>
                <div className="header">
                    <div className="badge">
                        <span className={`dot animate-pulse ${isRecoveryMode ? 'bg-red-500' : 'bg-green-500'}`}></span>
                        {isRecoveryMode ? 'RECOVERY ACTIVE' : 'SYSTEM STATUS: OPTIMAL'}
                    </div>
                    {isRecoveryMode && <div className="recovery-tag">⚡ HIGH VOLATILITY RECOVERY</div>}
                </div>
                <AnimatePresence mode="wait">
                    <motion.h2 
                        key={isRecoveryMode ? 'rec' : 'main'}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 5 }}
                        className="desc"
                    >
                        {isRecoveryMode 
                            ? `${recoveryTicks} TICKS ${recoveryConditionType.toUpperCase()} → ${recoveryTradeType.toUpperCase()}` 
                            : getStrategyLabel(mainStrategy)}
                    </motion.h2>
                </AnimatePresence>
            </motion.div>

            <div className="glass-panel controls-panel">
                <div className="grid grid-cols-2 gap-3">
                    <div className="control-group">
                        <label><Target size={12} /> Strategy Architecture</label>
                        <select 
                            value={mainStrategy} 
                            onChange={(e) => setMainStrategy(e.target.value)} 
                            className="custom-select"
                        >
                            <option value="over1">OVER 1 PRO (3-TICKS)</option>
                            <option value="under8">UNDER 8 PRO (3-TICKS)</option>
                            <option value="over1_5_le2">OVER 1 FLEX (5-TICKS)</option>
                            <option value="under8_5_ge7">UNDER 8 FLEX (5-TICKS)</option>
                            <option value="over2_7_le3">OVER 2 ULTRA (7-TICKS)</option>
                            <option value="under7_7_ge6">UNDER 7 ULTRA (7-TICKS)</option>
                            <option value="over3_7_le3">OVER 3 ELITE (7-TICKS)</option>
                            <option value="under6_7_ge6">UNDER 6 ELITE (7-TICKS)</option>
                        </select>
                    </div>
                    <div className="control-group">
                        <label><RotateCcw size={12} /> Recovery Engine</label>
                        <div className="recovery-box">
                            <div className="row">
                                IF <input type="number" value={recoveryTicks} onChange={e => setRecoveryTicks(parseInt(e.target.value) || 0)} className="mini-input" /> TICKS = 
                                <select value={recoveryConditionType} onChange={e => setRecoveryConditionType(e.target.value)} className="mini-select">
                                    <option value="odd">ODD</option><option value="even">EVEN</option><option value="over">OVER</option><option value="under">UNDER</option><option value="equal">EQUAL</option><option value="rise">RISE</option><option value="fall">FALL</option>
                                </select>
                                {recoveryConditionType.match(/over|under|equal/) && (
                                    <>
                                        <select value={recoveryConditionOperator} onChange={e => setRecoveryConditionOperator(e.target.value)} className="mini-select">
                                            <option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option><option value="=">=</option>
                                        </select>
                                        <input type="number" value={recoveryConditionBarrier} onChange={e => setRecoveryConditionBarrier(parseInt(e.target.value))} className="mini-input" />
                                    </>
                                )}
                            </div>
                            <div className="row">
                                THEN TRADE
                                <select value={recoveryTradeType} onChange={e => setRecoveryTradeType(e.target.value)} className="mini-select">
                                    <option value="odd">ODD</option><option value="even">EVEN</option><option value="over">OVER</option><option value="under">UNDER</option><option value="equal">EQUAL</option><option value="rise">RISE</option><option value="fall">FALL</option>
                                </select>
                                {recoveryTradeType.match(/over|under|equal/) && (
                                    <input type="number" value={recoveryTradeBarrier} onChange={e => setRecoveryTradeBarrier(parseInt(e.target.value))} className="mini-input" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="settings-row">
                    <div className="info">
                        <span className="name">Automated Recovery</span>
                        <span className="hint">Switch to recovery pattern on loss</span>
                    </div>
                    <label className="switch">
                        <input type="checkbox" checked={recoveryToggle} onChange={e => setRecoveryToggle(e.target.checked)} />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="control-group">
                        <label>Base Stake ($)</label>
                        <input type="number" value={baseStake} onChange={e => setBaseStake(parseFloat(e.target.value))} step="0.01" className="custom-select text-center font-bold" />
                    </div>
                    <div className="control-group">
                        <label>Multiplier</label>
                        <input type="number" value={multiplier} onChange={e => setMultiplier(parseFloat(e.target.value))} step="0.1" className="custom-select text-center font-bold" />
                    </div>
                </div>

                <div className="settings-row">
                    <div className="info">
                        <span className="name">Martingale Logic</span>
                        <span className="hint">Multiply stake after loss</span>
                    </div>
                    <label className="switch">
                        <input type="checkbox" checked={martingaleToggle} onChange={e => setMartingaleToggle(e.target.checked)} />
                        <span className="slider"></span>
                    </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="control-group">
                        <div className="flex items-center gap-2 mb-1">
                            <input type="radio" checked={stopType === 'amount'} onChange={() => setStopType('amount')} />
                            <label className="mb-0">Stop Loss ($)</label>
                        </div>
                        <input type="number" value={stopLoss} onChange={e => setStopLoss(parseFloat(e.target.value))} className="custom-select text-center" />
                    </div>
                    <div className="control-group">
                        <div className="flex items-center gap-2 mb-1">
                            <input type="radio" checked={stopType === 'consec'} onChange={() => setStopType('consec')} />
                            <label className="mb-0">Consec. Losses</label>
                        </div>
                        <input type="number" value={consecutiveLossLimit} onChange={e => setConsecutiveLossLimit(parseInt(e.target.value))} className="custom-select text-center" />
                    </div>
                </div>

                <div className="control-group">
                    <label>Take Profit Target ($)</label>
                    <input type="number" value={takeProfit} onChange={e => setTakeProfit(parseFloat(e.target.value))} className="custom-select text-center font-bold text-green-400" />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                    <button 
                        onClick={isTrading ? (isPaused ? () => setIsPaused(false) : () => setIsPaused(true)) : startTrading} 
                        className={`btn-main ${isTrading ? (isPaused ? 'start' : 'pause') : 'start'}`}
                    >
                        {isTrading ? (isPaused ? <><Play size={18} /> Resume</> : <><Pause size={18} /> Pause</>) : <><Play size={18} /> Run</>}
                    </button>
                    <button 
                        onClick={stopBot} 
                        disabled={!isTrading} 
                        className="btn-main stop"
                    >
                        <Square size={18} /> Stop
                    </button>
                </div>
            </div>

            <section className="glass-panel market-box">
                <div className="header">
                    <h3 className="title">Market Intelligence</h3>
                    <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)} 
                        className="mini-select bg-transparent border-none text-[10px] font-bold text-blue-400 outline-none"
                    >
                        <option value="all">ALL ASSETS</option>
                        <option value="volatility">VOLATILITY ONLY</option>
                        <option value="1s_jump">1S & JUMPS</option>
                        <option value="daily_jump">DAILY & JUMP</option>
                    </select>
                </div>
                <div className="grid">
                    {CATEGORIES[selectedCategory].map(sym => (
                        <div key={sym} className={`glass-panel tile ${marketData[sym]?.digit > 2 && marketData[sym]?.digit < 8 ? 'active shadow-blue-500/20' : ''}`}>
                            <div className="row-top">
                                <span className="sym">{sym.replace('1HZ','⚡')}</span>
                                <span className="prc">{marketData[sym]?.price || '---'}</span>
                            </div>
                            <div className="row-main">
                                <span className="digit">{marketData[sym]?.digit ?? '-'}</span>
                                <div className="hist">
                                    {marketData[sym]?.history?.slice(-5).map((h, i) => (
                                        <span key={i} className={`mx-0.5 ${h > 5 ? 'text-green-500' : 'text-red-500'}`}>{h}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="journal-box">
                <div className="header">
                    <h4 className="title"><div className="dot animate-pulse"></div> Live Operations Journal</h4>
                    <button onClick={clearJournalAndReset} className="reset-btn flex items-center gap-1"><RotateCcw size={10} /> Reset</button>
                </div>
                <div className="entries">
                    {journal.length === 0 ? (
                        <div className="text-center py-10 text-slate-600 text-xs italic glass-panel border-dashed">
                            <History size={24} className="mx-auto mb-2 opacity-20" />
                            Awaiting market data and operations...
                        </div>
                    ) : (
                        journal.map(j => (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={j.id} 
                                className={`entry ${j.color === 'text-green-400' ? 'border-l-green-500' : (j.color === 'text-red-400' || j.color === 'text-red-500' ? 'border-l-red-500' : 'border-l-blue-500')}`}
                            >
                                <span className="time mono">{j.time}</span>
                                <div className="msg">
                                    <span className={`type ${j.color}`}>{j.type}</span>
                                    <span className="text-slate-300">{j.message}</span>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </section>
        </motion.div>
    );
});

export default AutoTrades;
