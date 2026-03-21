import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, 
  Shield, 
  Zap, 
  Settings, 
  Play, 
  Square, 
  RefreshCw, 
  Terminal, 
  Cpu,
  BarChart3,
  Wifi,
  WifiOff,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { fetchXmlWithCache } from '@/utils/freebots-cache';
import './sniper-content.scss';

// --- Constants ---
const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=84755';
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

const SniperContent = () => {
  // --- State ---
  const is_dev = process.env.NODE_ENV === 'development';
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [stake, setStake] = useState<number>(5);
  const [takeProfit, setTakeProfit] = useState<number>(100);
  const [stopLoss, setStopLoss] = useState<number>(100);
  const [multiplier, setMultiplier] = useState<number>(2);
  const [selectedMarket, setSelectedMarket] = useState('AUTO');
  const [selectedStrategy, setSelectedStrategy] = useState('AUTO');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allMarketTicks, setAllMarketTicks] = useState<Record<string, Tick[]>>({});
  const [activeSignals, setActiveSignals] = useState<Signal[]>([]);
  const [executionTimer, setExecutionTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [showSetup, setShowSetup] = useState(true);

  // --- Refs ---
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastDataTime = useRef<number>(Date.now());
  const autoPilotTimer = useRef<NodeJS.Timeout | null>(null);
  const ticksRef = useRef<Record<string, Tick[]>>({});
  const scanSound = useRef<HTMLAudioElement | null>(null);

  // Initialize sound (optional, but keeping for completeness)
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
  }, []); 

  // --- Refs for state used in callbacks ---
  const isScanningRef = useRef(isScanning);
  const selectedMarketRef = useRef(selectedMarket);
  const selectedStrategyRef = useRef(selectedStrategy);
  const isConnectedRef = useRef(isConnected);

  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);
  useEffect(() => { selectedMarketRef.current = selectedMarket; }, [selectedMarket]);
  useEffect(() => { selectedStrategyRef.current = selectedStrategy; }, [selectedStrategy]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  const triggerAnalysis = useCallback(() => {
    if (!isScanningRef.current) return;

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
      .slice(0, 2);
    setActiveSignals(sortedSignals);
  }, [analyzeMarket]);

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
          }).reverse(); 

          ticksRef.current = {
            ...ticksRef.current,
            [symbol]: historyTicks.slice(0, MAX_TICKS)
          };

          setAllMarketTicks({ ...ticksRef.current });
          addLog(`Received ${historyTicks.length} past ticks for ${symbol}`, 'info');

          // Trigger immediate analysis after history to provide instant signals
          triggerAnalysis();
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
          const allTicks = Object.values(ticksRef.current) as Tick[][];
          const totalTicks = allTicks.reduce((acc, t) => acc + t.length, 0);
          const maxPossibleTicks = VOLATILITY_MARKETS.length * MAX_TICKS;
          const progressValue = (totalTicks / maxPossibleTicks) * 100;
          setProgress(progressValue);

          // Analyze if scanning
          triggerAnalysis();
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

    ws.current.onerror = () => {
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

  const { dashboard } = useStore();
  const { setActiveTab, setPendingFreeBot } = dashboard;

  // --- Actions ---
  const startScan = useCallback(() => {
    if (!isConnectedRef.current) {
      addLog('Cannot scan: Offline', 'error');
      return;
    }
    setIsScanning(true);
    setShowSetup(false);
    setActiveSignals([]);
    ticksRef.current = {};
    setAllMarketTicks({});
    setProgress(0);
    subscribe();
    addLog('Smart Scan started...', 'info');
  }, [subscribe, addLog]);

  const cancelScan = useCallback(() => {
    setIsScanning(false);
    setActiveSignals([]);
    if (ws.current) ws.current.send(JSON.stringify({ forget_all: 'ticks' }));
    addLog('Scan cancelled', 'warning');
  }, [addLog]);

  const executeTrade = useCallback(async (signal: Signal) => {
    if (!signal) return;
    
    addLog(`Loading Bot for ${signal.marketId} @ ${signal.entry}...`, 'info');
    setExecutionTimer(5);

    try {
        const response = await fetch('/xml/Entry point Bot over 2.xml');
        const xml = await response.text();

        // Patch XML with signal data
        // Update entry point value (The trigger digit)
        // Fixed regex to correctly match the literal ID "$?c=egHj3+^Omn8#P:L)"
        let modifiedXml = xml.replace(
            /<block type="math_number" id="\$\?c=egHj3\+\^Omn8#P:L\)">\s*<field name="NUM">\d+<\/field>/g,
            `<block type="math_number" id="$?c=egHj3+^Omn8#P:L)"><field name="NUM">${signal.entryDigit ?? 0}</field>`
        );

        // Patch User Defined Settings: Stake, Take Profit, Stop Loss, Multiplier
        modifiedXml = modifiedXml.replace(
            /(<field name="VAR" [^>]*>Stake<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
            `$1${stake}$2`
        );
        modifiedXml = modifiedXml.replace(
            /(<field name="VAR" [^>]*>Take Profit<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
            `$1${takeProfit}$2`
        );
        modifiedXml = modifiedXml.replace(
            /(<field name="VAR" [^>]*>Stop Loss<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
            `$1${stopLoss}$2`
        );
        modifiedXml = modifiedXml.replace(
            /(<field name="VAR" [^>]*>Martingale<\/field>\s*<value name="VALUE">\s*<block type="math_number" [^>]*>\s*<field name="NUM">)[\d.]+(<\/field>)/,
            `$1${multiplier}$2`
        );

        // Also update the symbol if found
        modifiedXml = modifiedXml.replace(
            /<field name="SYMBOL_LIST">.*?<\/field>/g,
            `<field name="SYMBOL_LIST">${signal.marketId}</field>`
        );

        // Update submarket for Jump Indices
        const isJumpIndex = signal.marketId.startsWith('JD');
        modifiedXml = modifiedXml.replace(
            /<field name="SUBMARKET_LIST">.*?<\/field>/g,
            `<field name="SUBMARKET_LIST">${isJumpIndex ? 'jump_index' : 'random_index'}</field>`
        );

        // Update trade type if it's RSI (FALL/RISE) vs Digit (OVER/UNDER/EVEN/ODD)
        const isDigitEntry = ['UNDER 5', 'OVER 4', 'EVEN', 'ODD'].includes(signal.entry);
        if (isDigitEntry) {
            modifiedXml = modifiedXml.replace(
                /<field name="TRADETYPECAT_LIST">.*?<\/field>/g,
                `<field name="TRADETYPECAT_LIST">digits</field>`
            );
            const typeMap: Record<string, string> = {
                'UNDER 5': 'overunder',
                'OVER 4': 'overunder',
                'EVEN': 'evenodd',
                'ODD': 'evenodd',
            };
            const subTypeMap: Record<string, string> = {
                'UNDER 5': 'DIGITUNDER',
                'OVER 4': 'DIGITOVER',
                'EVEN': 'DIGITEVEN',
                'ODD': 'DIGITODD',
            };
            const selectedType = typeMap[signal.entry] || 'overunder';
            const selectedSubType = subTypeMap[signal.entry] || 'DIGITUNDER';
            
            modifiedXml = modifiedXml.replace(
                /<field name="TRADETYPE_LIST">.*?<\/field>/g,
                `<field name="TRADETYPE_LIST">${selectedType}</field>`
            );
            // Update contract type
            modifiedXml = modifiedXml.replace(
                /<field name="TYPE_LIST">.*?<\/field>/g,
                `<field name="TYPE_LIST">${selectedSubType}</field>`
            );
            // Update purchase list
            modifiedXml = modifiedXml.replace(
                /<field name="PURCHASE_LIST">.*?<\/field>/g,
                `<field name="PURCHASE_LIST">${selectedSubType}</field>`
            );
            // Ensure prediction mutation is TRUE for digit trades, FALSE for eventodd
            const needsPrediction = selectedType === 'overunder';
            modifiedXml = modifiedXml.replace(
                /<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6\/\(ac">\s*<mutation xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="(true|false)"><\/mutation>/g,
                `<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6/(ac"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="${needsPrediction ? 'true' : 'false'}"></mutation>`
            );

            // Determine strategy-based prediction
            let prediction = signal.entryDigit;
            if (signal.entry === 'UNDER 5') prediction = 5;
            if (signal.entry === 'OVER 4') prediction = 4;

            // Update prediction value in the XML
            if (needsPrediction) {
                modifiedXml = modifiedXml.replace(
                    /<shadow type="math_number_positive" id="\}!H\]\{1cFD-lwfop@y\{sn"(?: inline="true")?>\s*<field name="NUM">\d+<\/field>/g,
                    `<shadow type="math_number_positive" id="}!H]{1cFD-lwfop@y{sn" inline="true"><field name="NUM">${prediction}</field>`
                );
            }
        } else {
            // RSI - CALL/PUT
            const contractType = signal.entry === 'RISE' ? 'CALL' : 'PUT';
            modifiedXml = modifiedXml.replace(
                /<field name="TYPE_LIST">.*?<\/field>/g,
                `<field name="TYPE_LIST">${contractType}</field>`
            );
            modifiedXml = modifiedXml.replace(
                /<field name="PURCHASE_LIST">.*?<\/field>/g,
                `<field name="PURCHASE_LIST">${contractType}</field>`
            );
            modifiedXml = modifiedXml.replace(
                /<field name="TRADETYPECAT_LIST">.*?<\/field>/g,
                `<field name="TRADETYPECAT_LIST">callput</field>`
            );
            modifiedXml = modifiedXml.replace(
                /<field name="TRADETYPE_LIST">.*?<\/field>/g,
                `<field name="TRADETYPE_LIST">callput</field>`
            );
            modifiedXml = modifiedXml.replace(
                /<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6\/\(ac">\s*<mutation xmlns="http:\/\/www\.w3\.org\/1999\/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="(true|false)"><\/mutation>/g,
                `<block type="trade_definition_tradeoptions" id="bTRRAtlrO1HOKPi6/(ac"><mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="false"></mutation>`
            );
        }

        setPendingFreeBot({ name: 'Entry Point Bot', xml: modifiedXml, should_auto_run: true });
        setActiveTab(DBOT_TABS.BOT_BUILDER);
        addLog(`Bot configured with Entry Digit: ${signal.entryDigit}. Redirecting...`, 'success');
    } catch (err) {
        addLog('Error initializing trade: ' + err, 'error');
    }
  }, [addLog, setActiveTab, setPendingFreeBot, stake, takeProfit, stopLoss, multiplier]);

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

  const renderSetupView = () => (
    <div className="sniper-setup">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="sniper-setup__container"
      >
        <div className="sniper-setup__hero">
          <div className="sniper-setup__hero-icon">
            <Cpu size={42} />
          </div>
          <h2 className="sniper-setup__hero-title">INTELLIGENCE ENGINE</h2>
          <p className="sniper-setup__hero-subtitle">Volatility Scanner Parameters • v3.0</p>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>MARKET SELECTION</label>
            <select 
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
            >
              <option value="AUTO">AUTO (All Markets)</option>
              {VOLATILITY_MARKETS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="sniper-setup__field">
            <label>STRATEGY LOCK</label>
            <select 
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
            >
              <option value="AUTO">AUTO (Best Match)</option>
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>STAKE</label>
            <input 
              type="number" 
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              min="0.35"
              step="0.01"
            />
          </div>
          <div className="sniper-setup__field">
            <label>TAKE PROFIT</label>
            <input 
              type="number" 
              value={takeProfit}
              onChange={(e) => setTakeProfit(Number(e.target.value))}
              min="0"
              step="1"
            />
          </div>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>STOP LOSS</label>
            <input 
              type="number" 
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value))}
              min="0"
              step="1"
            />
          </div>
          <div className="sniper-setup__field">
            <label>MULTIPLIER</label>
            <input 
              type="number" 
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              min="1"
              step="0.1"
            />
          </div>
        </div>

        <div className="sniper-setup__autopilot">
          <div className="sniper-setup__autopilot-info">
            <Shield size={28} />
            <div>
              <div className="title">AUTO-PILOT MODE</div>
              <div className="desc">Automated continuous scanning</div>
            </div>
          </div>
          <button 
            onClick={() => setAutoPilot(!autoPilot)}
            className={`sniper-setup__toggle ${autoPilot ? 'on' : 'off'}`}
          >
            <motion.div 
                animate={{ x: autoPilot ? 24 : 2 }} 
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="knob" 
            />
          </button>
        </div>

        <button onClick={startScan} className="sniper-setup__start-btn">
          <Play size={20} fill="currentColor" />
          START SMART SCAN
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="sniper-content">
      {!showSetup && (
        <header className="sniper-content__header">
          <div className="sniper-content__header-info">
            <div className="sniper-content__header-icon">
              <Cpu size={24} />
            </div>
            <div>
              <h1 className="sniper-content__title">Sniper AI Intelligence</h1>
              <p className="sniper-content__subtitle">Volatility Scanner • v3.0</p>
            </div>
          </div>
          
          <div className="sniper-content__header-actions">
            {isScanning && (
              <button 
                onClick={cancelScan} 
                className="sniper-content__header-stop-btn"
                title="Stop Scan"
              >
                <Square size={14} fill="currentColor" />
                <span>STOP SCAN</span>
              </button>
            )}
            
            <div className="sniper-content__header-status-group">
              <button 
                onClick={connect}
                className="sniper-content__connect-btn"
                title="Manual Reconnect"
              >
                {isConnected ? (
                  <><Wifi size={14} className="text-green" /> <span className="status-live">LIVE</span></>
                ) : (
                  <><WifiOff size={14} className="text-red" /> <span className="status-offline">OFFLINE</span></>
                )}
                <RefreshCw size={10} className={`refresh-icon ${!isConnected ? 'anim-spin' : ''}`} />
              </button>

              <div className="sniper-content__header-progress">
                <div className="progress-info">
                  <span className="label">Collecting Data</span>
                  <span className="value">{Math.round(progress)}%</span>
                </div>
                <div className="progress-bar">
                  <motion.div 
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
            
            <div className="sniper-content__token-input">
              <Settings size={20} className="settings-icon" />
              <input 
                type="password" 
                placeholder="API Token (Optional)" 
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>

            <button 
              onClick={async () => {
                  try {
                      const response = await fetch('/xml/Entry point Bot over 2.xml');
                      const xml = await response.text();
                      setPendingFreeBot({ name: 'Entry Point Bot', xml });
                      setActiveTab(DBOT_TABS.BOT_BUILDER);
                  } catch (error) {
                      console.error('Failed to load bot template:', error);
                  }
              }}
              className="sniper-content__load-bot-btn"
              title="Load Bot Template"
            >
              <ExternalLink size={16} />
              <span>Load Bot</span>
            </button>
          </div>
        </header>
      )}

      {showSetup ? renderSetupView() : (
        /* Main Dashboard */
        <main className="sniper-content__dashboard">
          
          {/* Left Column: Focused Progress Tracking */}
          <div className="sniper-content__main-content">
            {/* Progress Bar moved to header per user request */}

            <div className="sniper-content__minimal-status">
              <Activity size={48} className={`status-icon ${isScanning ? 'anim-pulse highlight' : ''}`} />
              <div className="status-text">
                {isScanning ? (
                  <>
                    <p className="main">INTELLIGENCE SCAN ACTIVE</p>
                    <p className="sub">Analyzing 18 markets for high-probability signals...</p>
                  </>
                ) : (
                  <>
                    <p className="main">SYSTEM IDLE</p>
                    <p className="sub">Ready for next intelligent scanning session.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Signal */}
          <div className="sniper-content__sidebar">
            
            {/* Signals */}
            <div className="sniper-content__signals-section">
              <div className="section-header">
                <span className="label">Top Intelligence Signals</span>
                {activeSignals.length > 0 && (
                  <span className="signal-count">{activeSignals.length} SIGNALS</span>
                )}
              </div>

              <AnimatePresence exitBeforeEnter>
                {activeSignals.length > 0 ? (
                  activeSignals.map((signal, index) => (
                    <motion.div 
                      key={`${signal.marketId}-${signal.strategyId}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`signal-card ${index === 0 ? 'top-signal' : ''}`}
                    >
                      {index === 0 && <Zap className="bg-icon" />}

                      <div className="signal-main">
                        <div className="entry-digit-container">
                          <div className="label">Entry Digit</div>
                          <div className="value">{signal.entryDigit}</div>
                        </div>
                        <div className="signal-info">
                          <div className="entry-type">
                            {signal.entry}
                            {index === 0 && <span className="badge">TOP</span>}
                          </div>
                          <div className="market-strategy">
                            {getMarketName(signal.marketId)} • {getStrategyName(signal.strategyId)}
                          </div>
                          
                          <div className="distribution-chart">
                            {signal.digitDistribution.map((freq, i) => (
                              <div 
                                key={i}
                                className={`bar ${i === signal.entryDigit ? 'active' : ''}`}
                                style={{ height: `${Math.max(10, freq * 100)}%` }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="confidence-container">
                          <div className="value">{Math.round(signal.confidence * 100)}%</div>
                          <div className="label">Confidence</div>
                        </div>
                      </div>

                      <div className="signal-footer">
                        <div className="price-info">
                          <div className="label">Signal Price</div>
                          <div className="value">{signal.price.toFixed(getMarketDecimals(signal.marketId))}</div>
                        </div>
                        <button 
                          onClick={() => executeTrade(signal)}
                          disabled={!!executionTimer}
                          className="execute-btn"
                        >
                          <Zap size={14} />
                          Execute
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="no-signals">
                    <Activity size={32} className="anim-pulse" />
                    <div className="text">Scanning Universe...</div>
                    <p>Waiting for market conditions to align.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls - Only show in setup or if explicitly needed, hidden on mobile dashboard per user request */}
            {showSetup && (
              <div className="sniper-content__controls">
                {/* ... (existing controls) ... */}
              </div>
            )}
          </div>
        </main>
      )}

      {!showSetup && false && ( // Completely hidden per user request
        <footer className="sniper-content__footer">
          {/* ... footer content (now hidden) ... */}
        </footer>
      )}
    </div>
  );
};

export default SniperContent;
