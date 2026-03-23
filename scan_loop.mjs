import WebSocket from 'ws';

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';
const VOLATILITY_MARKETS = [
  '1HZ10V', '1HZ15V', '1HZ25V', '1HZ30V', '1HZ50V', '1HZ75V', '1HZ90V', '1HZ100V',
  'R_10', 'R_25', 'R_50', 'R_75', 'R_100', 'JD10', 'JD25', 'JD50', 'JD75', 'JD100'
];

const MIN_TICKS_FOR_SIGNAL = 20;

const calculateRSI = (ticks, period = 14) => {
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

const findPredictiveEntryDigit = (digits, winningDigits) => {
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

    let bestDigit = null; 
    let maxAvgWins = 0;

    for (let d = 0; d <= 9; d++) {
        if (counts[d] > 0) {
            const avgWins = scores[d] / counts[d];
            if (avgWins > maxAvgWins && avgWins >= 13.75) {
                maxAvgWins = avgWins;
                bestDigit = d;
            }
        }
    }
    return bestDigit;
};

const analyzeMarket = (marketId, ticks) => {
    if (ticks.length < MIN_TICKS_FOR_SIGNAL) return [];
    const price = ticks[ticks.length - 1].quote;
    const lastDigits = ticks.map(t => t.digit);
    const results = [];
    
    const digitFreq = {};
    for (let i = 0; i <= 9; i++) digitFreq[i] = 0;
    lastDigits.forEach(d => digitFreq[d]++);
    const digitDistribution = Array.from({ length: 10 }, (_, i) => (digitFreq[i] || 0) / lastDigits.length);

    const sortedDigits = Object.entries(digitFreq)
        .map(([digit, count]) => ({ digit: parseInt(digit), count }))
        .sort((a, b) => b.count - a.count);
    const mostAppearing = sortedDigits[0].digit;
    const secondMostAppearing = sortedDigits[1].digit;
    const leastCount = sortedDigits[9].count;
    const leastAppearingDigits = sortedDigits.filter(d => d.count === leastCount).map(d => d.digit);

    const getStats = (digits) => {
        if (digits.length === 0) return { pctEven: 0, pctOdd: 0, pctUnder5: 0, pctOver4: 0 };
        return {
            pctEven: digits.filter(d => d % 2 === 0).length / digits.length,
            pctOdd: digits.filter(d => d % 2 !== 0).length / digits.length,
            pctUnder5: digits.filter(d => d < 5).length / digits.length,
            pctOver4: digits.filter(d => d > 4).length / digits.length,
        };
    };

    const stats = getStats(lastDigits);

    const isOver4 = (d) => d >= 5;
    const isUnder5 = (d) => d <= 4;
    const isEven = (d) => d % 2 === 0;
    const isOdd = (d) => d % 2 !== 0;

    const u5Digit = findPredictiveEntryDigit(lastDigits, [0,1,2,3,4]);
    const under5Match = stats.pctOver4 > 0.55 && isOver4(mostAppearing) && isOver4(secondMostAppearing) && leastAppearingDigits.some(isUnder5) && u5Digit !== null;
    if (under5Match) {
        results.push({ marketId, price, strategyId: 'UNDER_5', match: true, confidence: stats.pctOver4, entry: 'UNDER 5', entryDigit: u5Digit });
    }

    const o4Digit = findPredictiveEntryDigit(lastDigits, [5,6,7,8,9]);
    const over4Match = stats.pctUnder5 > 0.55 && isUnder5(mostAppearing) && isUnder5(secondMostAppearing) && leastAppearingDigits.some(isOver4) && o4Digit !== null;
    if (over4Match) {
        results.push({ marketId, price, strategyId: 'OVER_4', match: true, confidence: stats.pctUnder5, entry: 'OVER 4', entryDigit: o4Digit });
    }

    const evDigit = findPredictiveEntryDigit(lastDigits, [0,2,4,6,8]);
    const evenMatch = stats.pctEven > 0.55 && isEven(mostAppearing) && isEven(secondMostAppearing) && leastAppearingDigits.some(isOdd) && evDigit !== null;
    if (evenMatch) {
        results.push({ marketId, price, strategyId: 'EVEN', match: true, confidence: stats.pctEven, entry: 'EVEN', entryDigit: evDigit });
    }

    const odDigit = findPredictiveEntryDigit(lastDigits, [1,3,5,7,9]);
    const oddMatch = stats.pctOdd > 0.55 && isOdd(mostAppearing) && isOdd(secondMostAppearing) && leastAppearingDigits.some(isEven) && odDigit !== null;
    if (oddMatch) {
        results.push({ marketId, price, strategyId: 'ODD', match: true, confidence: stats.pctOdd, entry: 'ODD', entryDigit: odDigit });
    }

    const rsi = calculateRSI(ticks);
    let rsiMatch = false;
    let rsiEntry = '';
    if (rsi > 75) { rsiMatch = true; rsiEntry = 'FALL'; }
    else if (rsi < 25) { rsiMatch = true; rsiEntry = 'RISE'; }
    
    results.push({
        marketId, price, strategyId: 'RSI_TECH', match: rsiMatch, confidence: Math.abs(rsi - 50) / 50, entry: rsiEntry, entryDigit: mostAppearing
    });

    return results;
};

const marketTicks = {};
let foundStrategies = new Set();
let attempts = 0;
let lastLogTime = Date.now();

const runScan = () => {
    let ws = new WebSocket(DERIV_WS_URL);

    const initConnection = () => {
        VOLATILITY_MARKETS.forEach(symbol => {
            marketTicks[symbol] = [];
            // Subscribe to ticks
            ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
            // Get history to prime the pump fast
            ws.send(JSON.stringify({
                ticks_history: symbol, count: 180, end: 'latest', style: 'ticks'
            }));
        });
    }

    ws.on('open', () => {
        console.log("Connected to Market. Waiting for OVER 4, UNDER 5, or EVEN signals...");
        initConnection();
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.error) return;

        let symbol = null;
        let newTicks = [];

        if (msg.msg_type === 'history') {
            symbol = msg.echo_req.ticks_history;
            const history = msg.history;
            newTicks = history.prices.map((p, i) => ({
                quote: p, digit: parseInt(p.toString().slice(-1)), epoch: history.times[i]
            }));
            marketTicks[symbol] = newTicks.slice(-180);
        } else if (msg.msg_type === 'tick') {
            symbol = msg.tick.symbol;
            const t = msg.tick;
            const tickObj = { quote: t.quote, digit: parseInt(t.quote.toString().slice(-1)), epoch: t.epoch };
            marketTicks[symbol] = [...(marketTicks[symbol] || []), tickObj].slice(-180);
        }

        if (symbol && marketTicks[symbol].length >= MIN_TICKS_FOR_SIGNAL) {
            const results = analyzeMarket(symbol, marketTicks[symbol]);
            results.forEach(res => {
                const type = res.entry;
                if (['UNDER 5', 'OVER 4', 'EVEN'].includes(type) && !foundStrategies.has(type + res.marketId)) {
                    foundStrategies.add(type + res.marketId);
                    console.log(`\x1b[32m[FOUND MATCH] \x1b[0m${res.marketId} - ${res.entry} (Digit: ${res.entryDigit}) | Confidence: ${(res.confidence*100).toFixed(1)}%`);
                }
            });

            if (foundStrategies.size >= 10) {
                 console.log("Collected enough signals!");
                 process.exit(0);
            }
        }
    });
    
    setInterval(() => {
        if (Date.now() - lastLogTime > 5000) {
            console.log(`Scanning live ticks... (Found ${foundStrategies.size} matches so far)`);
            lastLogTime = Date.now();
        }
    }, 1000);
};

runScan();
