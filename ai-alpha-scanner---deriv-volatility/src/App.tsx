/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Activity, 
  Shield, 
  Zap, 
  Settings, 
  Play, 
  Square, 
  RefreshCw, 
  Terminal, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Cpu,
  BarChart3,
  Wifi,
  WifiOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants ---
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
const VOLATILITY_MARKETS = [
  { id: '1HZ10V', name: 'Vol 10 (1s)', decimals: 3 },
  { id: '1HZ15V', name: 'Vol 15 (1s)', decimals: 4 },
  { id: '1HZ25V', name: 'Vol 25 (1s)', decimals: 3 },
  { id: '1HZ30V', name: 'Vol 30 (1s)', decimals: 3 },
  { id: '1HZ50V', name: 'Vol 50 (1s)', decimals: 4 },
  { id: '1HZ75V', name: 'Vol 75 (1s)', decimals: 4 },
  { id: '1HZ90V', name: 'Vol 90 (1s)', decimals: 2 },
  { id: '1HZ100V', name: 'Vol 100 (1s)', decimals: 2 },
  { id: 'R_10', name: 'Vol 10', decimals: 3 },
  { id: 'R_25', name: 'Vol 25', decimals: 3 },
  { id: 'R_50', name: 'Vol 50', decimals: 4 },
  { id: 'R_75', name: 'Vol 75', decimals: 4 },
  { id: 'R_100', name: 'Vol 100', decimals: 2 },
  { id: 'JD10', name: 'Jump 10', decimals: 3 },
  { id: 'JD25', name: 'Jump 25', decimals: 3 },
  { id: 'JD50', name: 'Jump 50', decimals: 3 },
  { id: 'JD75', name: 'Jump 75', decimals: 3 },
  { id: 'JD100', name: 'Jump 100', decimals: 3 },
];

const STRATEGIES = [
  { id: 'UNDER_5', name: 'Digit Under 5', logic: 'Under 5% > 55%, Most/2nd Most < 5, Least >= 5' },
  { id: 'OVER_4', name: 'Digit Over 4', logic: 'Over 4% > 55%, Most/2nd Most > 4, Least <= 4' },
  { id: 'EVEN', name: 'Even', logic: 'Even% > 55%, Most/2nd Most Even, Least Odd' },
  { id: 'ODD', name: 'Odd', logic: 'Odd% > 55%, Most/2nd Most Odd, Least Even' },
  { id: 'RSI_TECH', name: 'RSI Tech', logic: 'RSI Overbought/Oversold' },
];

const MAX_TICKS = 180;
const MIN_TICKS_FOR_SIGNAL = 30;
const LOG_LIMIT = 200;

// --- Types ---
interface Tick {
  quote: number;
  digit: number;
  time: number;
  symbol: string;
}

interface StrategyResult {
  match: boolean;
  confidence: number;
  entry: string;
  strategyId: string;
  entryDigit: number;
  digitDistribution: number[];
}

interface Signal {
  marketId: string;
  strategyId: string;
  entry: string;
  confidence: number;
  price: number;
  timestamp: number;
  entryDigit: number;
  currentDigit: number;
  digitDistribution: number[];
}

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'signal';
  timestamp: Date;
}

export default function App() {
  // --- State ---
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [selectedMarket, setSelectedMarket] = useState('AUTO');
  const [selectedStrategy, setSelectedStrategy] = useState('AUTO');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allMarketTicks, setAllMarketTicks] = useState<Record<string, Tick[]>>({});
  const [activeSignals, setActiveSignals] = useState<Signal[]>([]);
  const [executionTimer, setExecutionTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  // --- Refs ---
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const watchdogTimer = useRef<NodeJS.Timeout | null>(null);
  const lastDataTime = useRef<number>(Date.now());
  const autoPilotTimer = useRef<NodeJS.Timeout | null>(null);
  const ticksRef = useRef<Record<string, Tick[]>>({});
  const scanSound = useRef<HTMLAudioElement | null>(null);

  // Initialize sound
  useEffect(() => {
    scanSound.current = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
    scanSound.current.loop = true;
    scanSound.current.volume = 0.1;
    
    return () => {
      if (scanSound.current) {
        scanSound.current.pause();
        scanSound.current = null;
      }
    };
  }, []);

  // Handle scanning sound
  useEffect(() => {
    if (isScanning && scanSound.current) {
      scanSound.current.play().catch(e => console.log('Audio play blocked by browser'));
    } else if (scanSound.current) {
      scanSound.current.pause();
      scanSound.current.currentTime = 0;
    }
  }, [isScanning]);

  // --- Helpers ---
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [
      { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date() },
      ...prev.slice(0, LOG_LIMIT - 1)
    ]);
  }, []);

  const calculateRSI = (ticks: Tick[], period: number = 14): number => {
    if (ticks.length <= period) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const diff = ticks[ticks.length - i].quote - ticks[ticks.length - i - 1].quote;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
  };

  const analyzeMarket = useCallback((marketId: string, ticks: Tick[]): StrategyResult | null => {
    if (ticks.length < MIN_TICKS_FOR_SIGNAL) return null;

    const lastDigits = ticks.map(t => t.digit);
    const results: StrategyResult[] = [];

    // Calculate digit frequencies for advanced logic
    const digitFreq: Record<number, number> = {};
    for (let i = 0; i <= 9; i++) digitFreq[i] = 0;
    lastDigits.forEach(d => digitFreq[d]++);

    const sortedDigits = Object.entries(digitFreq)
      .map(([digit, count]) => ({ digit: parseInt(digit), count }))
      .sort((a, b) => b.count - a.count);

    const mostAppearing = sortedDigits[0].digit;
    const secondMostAppearing = sortedDigits[1].digit;
    const leastAppearing = sortedDigits[sortedDigits.length - 1].digit;
    const digitDistribution = Array.from({ length: 10 }, (_, i) => (digitFreq[i] || 0) / lastDigits.length);

    // Advanced Predictive Entry Digit Logic
    const findPredictiveEntryDigit = (digits: number[], winningDigits: number[]) => {
      const windowSize = 121; // 120 historical ticks + current market tick
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

      let bestDigit = mostAppearing; // Fallback to frequency if no predictive data
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

    // Strategy: Under 5
    const under5Count = lastDigits.filter(d => d < 5).length;
    const under5Percentage = under5Count / lastDigits.length;
    const under5Match = 
      under5Percentage > 0.55 && 
      mostAppearing < 5 && 
      secondMostAppearing < 5 && 
      leastAppearing >= 5;

    results.push({
      strategyId: 'UNDER_5',
      match: under5Match,
      confidence: under5Percentage,
      entry: 'UNDER 5',
      entryDigit: findPredictiveEntryDigit(lastDigits, [0, 1, 2, 3, 4]),
      digitDistribution
    });

    // Strategy: Over 4
    const over4Count = lastDigits.filter(d => d > 4).length;
    const over4Percentage = over4Count / lastDigits.length;
    const over4Match = 
      over4Percentage > 0.55 && 
      mostAppearing > 4 && 
      secondMostAppearing > 4 && 
      leastAppearing <= 4;

    results.push({
      strategyId: 'OVER_4',
      match: over4Match,
      confidence: over4Percentage,
      entry: 'OVER 4',
      entryDigit: findPredictiveEntryDigit(lastDigits, [5, 6, 7, 8, 9]),
      digitDistribution
    });

    // Strategy: Even
    const evenCount = lastDigits.filter(d => d % 2 === 0).length;
    const evenPercentage = evenCount / lastDigits.length;
    const evenMatch = 
      evenPercentage > 0.55 && 
      mostAppearing % 2 === 0 && 
      secondMostAppearing % 2 === 0 && 
      leastAppearing % 2 !== 0;

    results.push({
      strategyId: 'EVEN',
      match: evenMatch,
      confidence: evenPercentage,
      entry: 'EVEN',
      entryDigit: findPredictiveEntryDigit(lastDigits, [0, 2, 4, 6, 8]),
      digitDistribution
    });

    // Strategy: Odd
    const oddCount = lastDigits.filter(d => d % 2 !== 0).length;
    const oddPercentage = oddCount / lastDigits.length;
    const oddMatch = 
      oddPercentage > 0.55 && 
      mostAppearing % 2 !== 0 && 
      secondMostAppearing % 2 !== 0 && 
      leastAppearing % 2 === 0;

    results.push({
      strategyId: 'ODD',
      match: oddMatch,
      confidence: oddPercentage,
      entry: 'ODD',
      entryDigit: findPredictiveEntryDigit(lastDigits, [1, 3, 5, 7, 9]),
      digitDistribution
    });

    // Strategy: RSI Tech
    const rsi = calculateRSI(ticks);
    let rsiMatch = false;
    let rsiEntry = '';
    let rsiConfidence = 0;

    if (rsi > 75) {
      rsiMatch = true;
      rsiEntry = 'FALL';
      rsiConfidence = (rsi - 50) / 50;
    } else if (rsi < 25) {
      rsiMatch = true;
      rsiEntry = 'RISE';
      rsiConfidence = (50 - rsi) / 50;
    }
    results.push({
      strategyId: 'RSI_TECH',
      match: rsiMatch,
      confidence: rsiConfidence,
      entry: rsiEntry,
      entryDigit: mostAppearing,
      digitDistribution
    });

    // Filter by selected strategy if not AUTO - Use Ref
    const currentStrategy = selectedStrategyRef.current;
    const filteredResults = currentStrategy === 'AUTO' 
      ? results 
      : results.filter(r => r.strategyId === currentStrategy);

    // Find best match
    const bestMatch = filteredResults.reduce((prev, curr) => 
      (curr.confidence > prev.confidence) ? curr : prev
    , { match: false, confidence: 0, entry: '', strategyId: '', entryDigit: 0, digitDistribution: [] });

    return bestMatch.match ? bestMatch : null;
  }, []); // No dependencies

  // --- Refs for state used in callbacks ---
  const isScanningRef = useRef(isScanning);
  const selectedMarketRef = useRef(selectedMarket);
  const selectedStrategyRef = useRef(selectedStrategy);
  const isConnectedRef = useRef(isConnected);

  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);
  useEffect(() => { selectedMarketRef.current = selectedMarket; }, [selectedMarket]);
  useEffect(() => { selectedStrategyRef.current = selectedStrategy; }, [selectedStrategy]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  // --- WebSocket Logic ---
  const connect = useCallback(() => {
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
    }

    addLog('Connecting to Deriv WebSocket...', 'info');
    ws.current = new WebSocket(DERIV_WS_URL);

    ws.current.onopen = () => {
      setIsConnected(true);
      addLog('Connected to Deriv API', 'success');
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };

    ws.current.onmessage = (msg) => {
      try {
        if (!msg.data) return;
        const data = JSON.parse(msg.data.toString());
        lastDataTime.current = Date.now();

        if (data.msg_type === 'history') {
          const history = data.history;
          const symbol = data.echo_req?.ticks_history;
          
          if (!history || !symbol || !history.prices || !history.times) {
            addLog(`Incomplete history data received for ${symbol || 'unknown'}`, 'warning');
            return;
          }

          const prices = history.prices;
          const times = history.times;
          
          const historyTicks: Tick[] = prices.map((price: number, index: number) => {
            const quote = price;
            const digit = parseInt(quote.toString().slice(-1));
            return {
              quote,
              digit,
              time: times[index],
              symbol
            };
          }).reverse(); // Reverse so newest is at index 0

          ticksRef.current = {
            ...ticksRef.current,
            [symbol]: historyTicks.slice(0, MAX_TICKS)
          };

          setAllMarketTicks({ ...ticksRef.current });
          addLog(`Received ${historyTicks.length} past ticks for ${symbol}`, 'info');
        }

        if (data.msg_type === 'tick') {
          const tickData = data.tick;
          if (!tickData || !tickData.symbol || tickData.quote === undefined) return;

          const symbol = tickData.symbol;
          const quote = tickData.quote;
          const digit = parseInt(quote.toString().slice(-1));

          const newTick: Tick = {
            quote,
            digit,
            time: tickData.epoch,
            symbol
          };

          ticksRef.current = {
            ...ticksRef.current,
            [symbol]: [newTick, ...(ticksRef.current[symbol] || [])].slice(0, MAX_TICKS)
          };

          setAllMarketTicks({ ...ticksRef.current });

          // Update progress
          const totalTicks: number = (Object.values(ticksRef.current) as Tick[][]).reduce((acc: number, t: Tick[]) => acc + t.length, 0);
          const maxPossibleTicks: number = VOLATILITY_MARKETS.length * MAX_TICKS;
          const progressValue: number = (totalTicks / maxPossibleTicks) * 100;
          setProgress(progressValue);

          // Analyze if scanning
          if (isScanningRef.current) {
            const marketsToAnalyze = selectedMarketRef.current === 'AUTO' 
              ? VOLATILITY_MARKETS.map(m => m.id)
              : [selectedMarketRef.current];

            let currentSignals: Signal[] = [];

            marketsToAnalyze.forEach(mId => {
              const marketTicks = ticksRef.current[mId] || [];
              const result = analyzeMarket(mId, marketTicks);
              if (result) {
                const lastDigit = marketTicks.length > 0 ? marketTicks[0].digit : 0;
                const lastPrice = marketTicks.length > 0 ? marketTicks[0].quote : 0;
                currentSignals.push({
                  marketId: mId,
                  strategyId: result.strategyId,
                  entry: result.entry,
                  confidence: result.confidence,
                  price: lastPrice,
                  timestamp: Date.now(),
                  entryDigit: result.entryDigit,
                  currentDigit: lastDigit,
                  digitDistribution: result.digitDistribution
                });
              }
            });

            const sortedSignals = currentSignals
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 5);
            setActiveSignals(sortedSignals);
          }
        }

        if (data.error) {
          addLog(`API Error: ${data.error.message}`, 'error');
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
        addLog('Error processing market data', 'error');
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      addLog('Connection closed. Reconnecting...', 'warning');
      reconnectTimeout.current = setTimeout(connect, 5000);
    };

    ws.current.onerror = (err) => {
      addLog('WebSocket error occurred', 'error');
    };
  }, [addLog, analyzeMarket]);

  const subscribe = useCallback(() => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const marketsToSubscribe = selectedMarket === 'AUTO' 
      ? VOLATILITY_MARKETS.map(m => m.id)
      : [selectedMarket];

    addLog(`Subscribing to ${marketsToSubscribe.length} markets...`, 'info');
    
    // Forget all first
    ws.current.send(JSON.stringify({ forget_all: 'ticks' }));

    marketsToSubscribe.forEach(symbol => {
      ws.current?.send(JSON.stringify({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: MAX_TICKS,
        end: 'latest',
        start: 1,
        style: 'ticks',
        subscribe: 1
      }));
    });
  }, [selectedMarket, addLog]);

  // --- Actions ---
  const startScan = useCallback(() => {
    if (!isConnected) {
      addLog('Cannot scan: Offline', 'error');
      return;
    }
    setIsScanning(true);
    setActiveSignals([]);
    ticksRef.current = {};
    setAllMarketTicks({});
    setProgress(0);
    subscribe();
    addLog('Smart Scan started...', 'info');
  }, [isConnected, subscribe, addLog]);

  const cancelScan = useCallback(() => {
    setIsScanning(false);
    setActiveSignals([]);
    if (ws.current) ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
    addLog('Scan cancelled', 'warning');
  }, [addLog]);

  const executeTrade = useCallback((signal: Signal) => {
    if (!signal) return;
    
    addLog(`Executing smart trade: ${signal.marketId} ${signal.entry} @ ${signal.price.toFixed(getMarketDecimals(signal.marketId))}`, 'signal');
    setExecutionTimer(10);
    
    // Simulated result after 2 seconds
    setTimeout(() => {
      const win = Math.random() > 0.4;
      addLog(`Trade Result: ${win ? 'PROFIT' : 'LOSS'}`, win ? 'success' : 'error');
    }, 2000);
  }, [addLog]);

  const reScan = useCallback(() => {
    cancelScan();
    setTimeout(startScan, 500);
  }, [cancelScan, startScan]);

  // --- Effects ---
  useEffect(() => {
    connect();
    
    // Watchdog & Ping
    const interval = setInterval(() => {
      // Watchdog: Reconnect if no data for 10s while connected
      if (ws.current?.readyState === WebSocket.OPEN && Date.now() - lastDataTime.current > 10000) {
        addLog('Watchdog: No data for 10s, reconnecting...', 'warning');
        connect();
      }
      
      // Ping: Keep connection alive
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ ping: 1 }));
      }
    }, 5000);

    return () => {
      if (ws.current) ws.current.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      clearInterval(interval);
      if (autoPilotTimer.current) clearTimeout(autoPilotTimer.current);
    };
  }, [connect, addLog]);

  useEffect(() => {
    if (executionTimer !== null && executionTimer > 0) {
      const t = setTimeout(() => setExecutionTimer(executionTimer - 1), 1000);
      return () => clearTimeout(t);
    } else if (executionTimer === 0) {
      setExecutionTimer(null);
    }
  }, [executionTimer]);

  useEffect(() => {
    if (autoPilot && !isScanning && activeSignals.length === 0) {
      const delay = Math.floor(Math.random() * (60000 - 30000 + 1) + 30000);
      addLog(`Auto-Pilot: Next scan in ${Math.round(delay/1000)}s`, 'info');
      autoPilotTimer.current = setTimeout(startScan, delay);
    } else if (!autoPilot && autoPilotTimer.current) {
      clearTimeout(autoPilotTimer.current);
    }
  }, [autoPilot, isScanning, activeSignals.length, startScan, addLog]);

  useEffect(() => {
    if (autoPilot && activeSignals.length > 0 && !executionTimer) {
      addLog('Auto-Pilot: High confidence signal found, executing...', 'signal');
      executeTrade(activeSignals[0]);
    }
  }, [autoPilot, activeSignals, executionTimer, executeTrade, addLog]);

  // --- Render Helpers ---
  const getMarketName = (id: string) => VOLATILITY_MARKETS.find(m => m.id === id)?.name || id;
  const getMarketDecimals = (id: string) => VOLATILITY_MARKETS.find(m => m.id === id)?.decimals || 2;
  const getStrategyName = (id: string) => STRATEGIES.find(s => s.id === id)?.name || id;

  return (
    <div className="min-h-screen bg-bg-dark text-white p-4 md:p-6 lg:p-8 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-panel-dark p-4 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-accent-blue/20 p-2 rounded-lg">
            <Cpu className="text-accent-blue w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Intelligence Stream</h1>
            <p className="text-xs text-text-muted uppercase tracking-widest font-medium">Volatility Scanner • v2.5</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={connect}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/20 rounded-full border border-white/5 hover:bg-white/5 transition-colors"
            title="Manual Reconnect"
          >
            {isConnected ? (
              <><Wifi className="w-4 h-4 text-accent-green" /> <span className="text-xs font-semibold text-accent-green">LIVE</span></>
            ) : (
              <><WifiOff className="w-4 h-4 text-accent-red" /> <span className="text-xs font-semibold text-accent-red">OFFLINE</span></>
            )}
            <RefreshCw className={`w-3 h-3 text-text-muted ${!isConnected ? 'animate-spin' : ''}`} />
          </button>
          <div className="h-8 w-px bg-white/10 hidden md:block"></div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-text-muted cursor-pointer hover:text-white transition-colors" />
            <input 
              type="password" 
              placeholder="API Token (Optional)" 
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent-blue transition-all w-32 md:w-48"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Left Column: Logs & Market Grid */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Progress Bar */}
          <div className="bg-panel-dark p-4 rounded-2xl border border-white/5 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Data Collection Progress</span>
              <span className="text-xs font-mono text-accent-blue">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-accent-blue"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
              />
            </div>
          </div>

          {/* Market Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {VOLATILITY_MARKETS.map(market => {
              const ticks = allMarketTicks[market.id] || [];
              const lastTick = ticks[0];
              const isTarget = selectedMarket === 'AUTO' || selectedMarket === market.id;
              
              return (
                <div 
                  key={market.id}
                  className={`bg-panel-dark p-3 rounded-xl border transition-all duration-300 ${
                    isTarget ? 'border-white/10 opacity-100' : 'border-transparent opacity-40'
                  } ${activeSignals.some(s => s.marketId === market.id) ? 'pulse-match border-accent-green/50' : ''}`}
                >
                  <div className="text-[10px] font-bold text-text-muted uppercase mb-1 truncate">{market.name}</div>
                  <div className="flex items-baseline justify-between gap-1">
                    <div className="text-sm font-mono font-bold">
                      {lastTick ? lastTick.quote.toFixed(market.decimals) : '---'}
                    </div>
                    <div className={`text-xs font-mono font-black ${
                      lastTick ? (lastTick.digit >= 7 ? 'text-accent-red' : lastTick.digit <= 2 ? 'text-accent-green' : 'text-accent-blue') : 'text-text-muted'
                    }`}>
                      {lastTick ? lastTick.digit : '-'}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-0.5 h-1">
                    {ticks.slice(0, 15).reverse().map((t, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 rounded-full ${t.digit % 2 === 0 ? 'bg-accent-blue/40' : 'bg-white/10'}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Logs */}
          <div className="bg-panel-dark rounded-2xl border border-white/5 shadow-lg flex flex-col flex-1 min-h-[300px]">
            <div className="p-4 border-bottom border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent-blue" />
                <span className="text-xs font-bold uppercase tracking-wider">System Intelligence Log</span>
              </div>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-text-muted hover:text-white transition-colors uppercase font-bold"
              >
                Clear Log
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar font-mono text-[11px] space-y-2">
              <AnimatePresence initial={false}>
                {logs.map(log => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3"
                  >
                    <span className="text-text-muted shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
                    <span className={`
                      ${log.type === 'success' ? 'text-accent-green' : ''}
                      ${log.type === 'error' ? 'text-accent-red' : ''}
                      ${log.type === 'warning' ? 'text-yellow-500' : ''}
                      ${log.type === 'signal' ? 'text-accent-blue font-bold' : ''}
                      ${log.type === 'info' ? 'text-white/70' : ''}
                    `}>
                      {log.message}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {logs.length === 0 && (
                <div className="h-full flex items-center justify-center text-text-muted italic">
                  System idle. Waiting for scan...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Controls & Signal */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Signal Result Box */}
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center px-2">
              <span className="text-xs font-bold text-text-muted uppercase tracking-widest">Top Intelligence Signals</span>
              {activeSignals.length > 0 && (
                <span className="bg-accent-blue/20 text-accent-blue text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                  {activeSignals.length} SIGNALS FOUND
                </span>
              )}
            </div>

            <AnimatePresence mode="popLayout">
              {activeSignals.length > 0 ? (
                activeSignals.map((signal, index) => (
                  <motion.div 
                    key={`${signal.marketId}-${signal.strategyId}`}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`bg-panel-dark p-4 rounded-2xl border transition-all duration-300 shadow-xl relative overflow-hidden ${
                      index === 0 
                        ? 'border-accent-blue/60 ring-2 ring-accent-blue/20 shadow-[0_0_30px_rgba(59,130,246,0.25)]' 
                        : 'border-white/5'
                    }`}
                  >
                    {index === 0 && (
                      <div className="absolute -right-4 -bottom-4 opacity-5">
                        <Zap className="w-20 h-20 text-accent-blue" />
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-4 items-center">
                        <div className="flex flex-col items-center justify-center bg-accent-blue/10 border border-accent-blue/20 rounded-xl p-3 min-w-[64px]">
                          <div className="text-[8px] text-accent-blue uppercase font-black mb-1">Entry Digit</div>
                          <div className="text-4xl font-black text-accent-blue leading-none">
                            {signal.entryDigit}
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl p-3 min-w-[64px]">
                          <div className="text-[8px] text-text-muted uppercase font-black mb-1">Current</div>
                          <div className={`text-4xl font-black leading-none ${signal.currentDigit === signal.entryDigit ? 'text-accent-green' : 'text-white/40'}`}>
                            {signal.currentDigit}
                          </div>
                        </div>
                        <div>
                          <div className="text-xl font-black tracking-tighter text-white flex items-center gap-2">
                            {signal.entry}
                            {index === 0 && <span className="text-[10px] bg-accent-blue text-black px-1.5 py-0.5 rounded font-black">TOP</span>}
                          </div>
                          <div className="text-[10px] text-text-muted font-medium mt-0.5">
                            {getMarketName(signal.marketId)} • {getStrategyName(signal.strategyId)}
                          </div>
                          
                          {/* Digit Distribution Sparkline */}
                          <div className="flex items-end gap-0.5 h-6 mt-2">
                            {signal.digitDistribution.map((freq, i) => (
                              <div 
                                key={i}
                                className={`w-1.5 rounded-t-[1px] transition-all duration-500 ${
                                  i === signal.entryDigit ? 'bg-accent-blue' : 'bg-white/10'
                                }`}
                                style={{ height: `${Math.max(10, freq * 100)}%` }}
                                title={`Digit ${i}: ${Math.round(freq * 100)}%`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-mono font-bold ${index === 0 ? 'text-accent-green' : 'text-white/60'}`}>
                          {Math.round(signal.confidence * 100)}%
                        </div>
                        <div className="text-[8px] text-text-muted uppercase font-bold">Confidence</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex gap-2 flex-1">
                        <div className="bg-black/40 px-3 py-2 rounded-xl border border-white/5 flex-1">
                          <div className="text-[8px] text-text-muted uppercase font-bold mb-0.5">Signal Price</div>
                          <div className="text-xs font-mono font-bold">{signal.price.toFixed(getMarketDecimals(signal.marketId))}</div>
                        </div>
                        <div className="bg-black/40 px-3 py-2 rounded-xl border border-white/5 flex-1">
                          <div className="text-[8px] text-text-muted uppercase font-bold mb-0.5">Time</div>
                          <div className="text-xs font-mono font-bold text-white/60">{new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => executeTrade(signal)}
                        disabled={!!executionTimer}
                        className={`px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${
                          executionTimer 
                            ? 'bg-white/5 text-text-muted cursor-not-allowed' 
                            : 'bg-accent-green text-black hover:bg-accent-green/90 active:scale-95'
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        Execute
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="bg-panel-dark py-12 rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-black/20 rounded-full flex items-center justify-center border border-white/5">
                    <Activity className="w-8 h-8 text-text-muted animate-pulse" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white/40 uppercase tracking-wider">Scanning Universe...</div>
                    <p className="text-xs text-text-muted max-w-[200px] mt-2">
                      Waiting for market conditions to align with strategy parameters.
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="bg-panel-dark p-6 rounded-2xl border border-white/5 shadow-lg space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Market Selection</label>
                <select 
                  value={selectedMarket}
                  onChange={(e) => setSelectedMarket(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-accent-blue appearance-none cursor-pointer"
                >
                  <option value="AUTO">AUTO (All Markets)</option>
                  {VOLATILITY_MARKETS.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Strategy Lock</label>
                <select 
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-accent-blue appearance-none cursor-pointer"
                >
                  <option value="AUTO">AUTO (Best Match)</option>
                  {STRATEGIES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg transition-colors ${autoPilot ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-text-muted'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">Auto-Pilot Mode</div>
                  <div className="text-[10px] text-text-muted">Automated continuous scanning</div>
                </div>
              </div>
              <button 
                onClick={() => setAutoPilot(!autoPilot)}
                className={`w-12 h-6 rounded-full transition-all relative ${autoPilot ? 'bg-accent-blue' : 'bg-white/10'}`}
              >
                <motion.div 
                  animate={{ x: autoPilot ? 24 : 4 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md"
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isScanning ? (
                <button 
                  onClick={startScan}
                  className="col-span-2 bg-accent-blue text-white py-3.5 rounded-xl font-bold uppercase tracking-widest hover:bg-accent-blue/90 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Smart Scan
                </button>
              ) : (
                <>
                  <button 
                    onClick={cancelScan}
                    className="bg-accent-red/10 text-accent-red border border-accent-red/20 py-3.5 rounded-xl font-bold uppercase tracking-widest hover:bg-accent-red/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Cancel
                  </button>
                  <button 
                    onClick={reScan}
                    className="bg-white/5 text-white py-3.5 rounded-xl font-bold uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Re-Scan
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Strategy Status */}
          <div className="bg-panel-dark p-6 rounded-2xl border border-white/5 shadow-lg">
            <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4">Strategy Engine Status</div>
            <div className="space-y-3">
              {STRATEGIES.map(strategy => {
                const isActive = activeSignals.some(s => s.strategyId === strategy.id);
                return (
                  <div key={strategy.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent-green animate-pulse' : 'bg-white/10'}`} />
                      <span className={`text-[11px] font-medium ${isActive ? 'text-white' : 'text-text-muted'}`}>{strategy.name}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${isActive ? 'text-accent-green font-bold' : 'text-text-muted'}`}>
                      {isActive ? 'BEST MATCH' : isScanning ? 'CHECKING' : 'IDLE'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="bg-panel-dark px-6 py-3 rounded-xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-text-muted font-bold uppercase tracking-widest">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-accent-green' : 'bg-accent-red'}`} />
            <span>Connection: {isConnected ? 'Stable' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3 h-3" />
            <span>Markets: {VOLATILITY_MARKETS.length} Active</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>Slippage Protection: 0.1% Max</span>
          <span className="text-accent-blue">Simulated Execution Mode</span>
        </div>
      </footer>
    </div>
  );
}
