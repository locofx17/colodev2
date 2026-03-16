import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import './dcircle.scss';

const DCircle = observer(() => {
    const [symbol, setSymbol] = useState(() => localStorage.getItem('dcircle_symbol') || '1HZ100V');
    const [tradeType, setTradeType] = useState(() => localStorage.getItem('dcircle_tradeType') || 'Over/Under');
    const [ticks, setTicks] = useState(() => parseInt(localStorage.getItem('dcircle_ticks') || '1000'));
    const [barrier, setBarrier] = useState(() => parseInt(localStorage.getItem('dcircle_barrier') || '4'));
    const [history, setHistory] = useState<any[]>([]);
    const [digitFreq, setDigitFreq] = useState<number[]>(Array(10).fill(0));
    const [pipSize, setPipSize] = useState(-1);
    const [showHistory, setShowHistory] = useState(() => localStorage.getItem('dcircle_showHistory') !== 'false');
    const [streak, setStreak] = useState(1);
    const [price, setPrice] = useState('0.0000');
    const [activeDigit, setActiveDigit] = useState<number | undefined>(undefined);
    const [isConnected, setIsConnected] = useState(false);

    const ws = useRef<WebSocket | null>(null);
    const currentSubscription = useRef<string | null>(null);

    // Persist settings
    useEffect(() => { localStorage.setItem('dcircle_symbol', symbol); }, [symbol]);
    useEffect(() => { localStorage.setItem('dcircle_tradeType', tradeType); }, [tradeType]);
    useEffect(() => { localStorage.setItem('dcircle_ticks', ticks.toString()); }, [ticks]);
    useEffect(() => { localStorage.setItem('dcircle_barrier', barrier.toString()); }, [barrier]);
    useEffect(() => { localStorage.setItem('dcircle_showHistory', showHistory.toString()); }, [showHistory]);

    const detectPrecision = (quote: number) => {
        if (Math.floor(quote) === quote) return 0;
        const str = quote.toString();
        if (str.includes('.')) return str.split('.')[1].length;
        return 0;
    };

    const handleTick = useCallback((quote: number, isBulk = false) => {
        setPipSize(prevPip => {
            const currentPip = prevPip === -1 ? detectPrecision(quote) : prevPip;
            const str = quote.toFixed(currentPip);
            const d = parseInt(str.slice(-1));

            if (!isNaN(d)) {
                if (!isBulk) {
                    setPrice(str);
                    setActiveDigit(d);
                    setHistory(prevHistory => {
                        const newStreak = prevHistory.length > 0 && prevHistory[prevHistory.length - 1].digit === d 
                            ? (streakRef.current + 1) 
                            : 1;
                        streakRef.current = newStreak;
                        setStreak(newStreak);

                        const newHistory = [...prevHistory, { digit: d, quote }];
                        if (newHistory.length > ticksRef.current) {
                            const removed = newHistory.shift();
                            if (removed) {
                                setDigitFreq(prevFreq => {
                                    const nextFreq = [...prevFreq];
                                    nextFreq[removed.digit] = Math.max(0, nextFreq[removed.digit] - 1);
                                    nextFreq[d]++;
                                    return nextFreq;
                                });
                            }
                        } else {
                            setDigitFreq(prevFreq => {
                                const nextFreq = [...prevFreq];
                                nextFreq[d]++;
                                return nextFreq;
                            });
                        }
                        return newHistory;
                    });
                } else {
                    // Bulk update
                    setHistory(prevHistory => {
                        const newHistory = [...prevHistory, { digit: d, quote }];
                        setDigitFreq(prevFreq => {
                            const nextFreq = [...prevFreq];
                            nextFreq[d]++;
                            return nextFreq;
                        });
                        return newHistory;
                    });
                }
            }
            return currentPip;
        });
    }, []);

    // Use refs to access current values in handleTick without re-creating it
    const ticksRef = useRef(ticks);
    const streakRef = useRef(streak);
    useEffect(() => { ticksRef.current = ticks; }, [ticks]);

    const subscribeMarket = useCallback(() => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

        // Reset state for new market
        setPipSize(-1);
        setHistory([]);
        setDigitFreq(Array(10).fill(0));
        setStreak(1);
        streakRef.current = 1;

        // Forget old and subscribe new
        ws.current.send(JSON.stringify({ forget_all: "ticks" }));
        ws.current.send(JSON.stringify({ ticks_history: symbol, count: ticks, end: 'latest', style: 'ticks' }));
        ws.current.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        currentSubscription.current = symbol;
    }, [symbol, ticks]);

    const connect = useCallback(() => {
        if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
            // If already connected/connecting, just update subscription if market changed
            if (ws.current.readyState === WebSocket.OPEN && currentSubscription.current !== symbol) {
                subscribeMarket();
            }
            return;
        }

        const appId = getAppId();
        const serverUrl = getSocketURL();
        ws.current = new WebSocket(`wss://${serverUrl}/websockets/v3?app_id=${appId}`);

        ws.current.onopen = () => {
            setIsConnected(true);
            subscribeMarket();
        };

        ws.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.history) {
                if (data.history.prices.length > 0) {
                    const lastPrice = data.history.prices[data.history.prices.length - 1];
                    setPipSize(detectPrecision(lastPrice));
                }
                data.history.prices.forEach((q: number) => handleTick(q, true));
            }
            if (data.tick) handleTick(data.tick.quote);
        };

        ws.current.onclose = () => {
            setIsConnected(false);
            currentSubscription.current = null;
            setTimeout(connect, 3000);
        };

        ws.current.onerror = () => {
            ws.current?.close();
        };
    }, [symbol, subscribeMarket, handleTick]);

    useEffect(() => {
        connect();
    }, [connect]);

    useEffect(() => {
        return () => {
            if (ws.current) {
                ws.current.onclose = null;
                ws.current.close();
            }
        };
    }, []);

    const formatPercent = (value: number, total: number) => {
        if (total === 0) return "0%";
        let pct = (value / total) * 100;
        if (pct < 0.05) return "0%";
        return pct.toFixed(1) + "%";
    };

    const getSortedFreq = () => {
        const sorted = [...digitFreq].sort((a, b) => b - a);
        return {
            max1: sorted[0],
            max2: sorted[1],
            min1: sorted[sorted.length - 1]
        };
    };

    const { max1, max2, min1 } = getSortedFreq();

    // Forecast calculation
    let a=0, b=0, c=0;
    const totalHistory = history.length;

    if (tradeType === 'Rise/Fall') {
        for(let i=1; i<history.length; i++) {
            if (history[i].quote > history[i-1].quote) a++;
            else if (history[i].quote < history[i-1].quote) b++;
        }
    } else if (tradeType === 'Even/Odd') {
        history.forEach(h => h.digit % 2 === 0 ? a++ : b++);
    } else if (tradeType === 'Over/Under') {
        history.forEach(h => {
            if(h.digit > barrier) a++; else if(h.digit < barrier) b++; else c++;
        });
    } else if (tradeType === 'Matches/Differs') {
        a = digitFreq[barrier];
        b = totalHistory - a;
    }

    const sum = (a+b+c);
    const totalCalc = sum === 0 ? 1 : sum;
    const valA = formatPercent(a, totalCalc);
    const valB = formatPercent(b, totalCalc);
    const valC = formatPercent(c, totalCalc);

    const last60 = history.slice(-60);

    return (
        <div className='dcircle-page'>
            <div className="dcircle-container">
                <div className="header">
                    <h1>DIGIT ELITE PRO</h1>
                    <div className="status-badge">
                        <div className="status-dot" style={{ background: isConnected ? '#3fb950' : '#f85149' }}></div>
                        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                </div>

                <div className="card">
                    <div className="control-row">
                        <div>
                            <div className="card-title">Market</div>
                            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                                <optgroup label="Volatility (1s)">
                                    <option value="1HZ10V">V10 (1s)</option>
                                    <option value="1HZ15V">V15 (1s)</option>
                                    <option value="1HZ25V">V25 (1s)</option>
                                    <option value="1HZ30V">V30 (1s)</option>
                                    <option value="1HZ50V">V50 (1s)</option>
                                    <option value="1HZ75V">V75 (1s)</option>
                                    <option value="1HZ90V">V90 (1s)</option>
                                    <option value="1HZ100V">V100 (1s)</option>
                                </optgroup>
                                <optgroup label="Volatility Standard">
                                    <option value="R_10">V10</option>
                                    <option value="R_25">V25</option>
                                    <option value="R_50">V50</option>
                                    <option value="R_75">V75</option>
                                    <option value="R_100">V100</option>
                                </optgroup>
                                <optgroup label="Daily Reset Indices">
                                    <option value="RDBULL">Bull Market</option>
                                    <option value="RDBEAR">Bear Market</option>
                                </optgroup>
                                <optgroup label="Jump Indices">
                                    <option value="JD10">Jump 10</option>
                                    <option value="JD25">Jump 25</option>
                                    <option value="JD50">Jump 50</option>
                                    <option value="JD75">Jump 75</option>
                                    <option value="JD100">Jump 100</option>
                                </optgroup>
                            </select>
                        </div>
                        <div>
                            <div className="card-title">Trade Type</div>
                            <select value={tradeType} onChange={(e) => setTradeType(e.target.value)}>
                                <option value="Rise/Fall">Rise / Fall</option>
                                <option value="Even/Odd">Even / Odd</option>
                                <option value="Over/Under">Over / Under</option>
                                <option value="Matches/Differs">Matches / Differs</option>
                            </select>
                        </div>
                    </div>
                    <div className="control-row">
                        <div>
                            <div className="card-title">Analysis Ticks</div>
                            <input 
                                type="number" 
                                value={ticks} 
                                onChange={(e) => setTicks(parseInt(e.target.value) || 1)}
                                min="1" 
                                max="1000"
                            />
                        </div>
                        <div className={['Over/Under', 'Matches/Differs'].includes(tradeType) ? '' : 'hidden'}>
                            <div className="card-title">Prediction</div>
                            <input 
                                type="number" 
                                value={barrier} 
                                onChange={(e) => setBarrier(parseInt(e.target.value))}
                                min="0" 
                                max="9"
                            />
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">Market Pulse</div>
                    <div className="price-display">
                        <div className="price-value">{price}</div>
                        <div className="l5-row">
                            {history.slice(-5).map((h, i) => {
                                let col = '#8b949e';
                                if (tradeType === 'Over/Under') {
                                    if (h.digit > barrier) col = '#3fb950';
                                    else if (h.digit < barrier) col = '#f85149';
                                } else if (tradeType === 'Even/Odd') {
                                    col = (h.digit % 2 === 0) ? '#3fb950' : '#f85149';
                                } else if (tradeType === 'Rise/Fall') {
                                    const slice = history.slice(-5);
                                    const actualIndex = history.length - slice.length + i;
                                    const prev = history[actualIndex - 1];
                                    if (prev) {
                                        col = h.quote > prev.quote ? '#3fb950' : '#f85149';
                                    }
                                }
                                return (
                                    <div key={i} className="l5-dot" style={{ border: `1px solid ${col}`, color: col }}>
                                        {h.digit}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="digits-grid-wrapper">
                        <div className="digits-grid">
                            {digitFreq.map((f, i) => {
                                let r = '';
                                if (f === max1 && f > 0) r = 'circle-max1';
                                else if (f === max2 && f > 0) r = 'circle-max2';
                                else if (f === min1) r = 'circle-min1';
                                
                                return (
                                    <div 
                                        key={i} 
                                        className={`digit-circle ${r} ${activeDigit === i ? 'active-digit' : ''}`}
                                        onClick={() => setBarrier(i)}
                                    >
                                        <span className="digit-num">{i}</span>
                                        <span className="digit-pct">{totalHistory > 0 ? ((f/totalHistory)*100).toFixed(1) : 0}%</span>
                                        {activeDigit === i && streak >= 2 && (
                                            <div className="streak-badge" style={{ color: streak > 4 ? '#da3633' : '#000' }}>
                                                x{streak}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-title">Forecast (Last {totalHistory} Ticks)</div>
                    <div className="dist-bar">
                        <div className="side side-a" style={{ flex: a || 0.001 }}>
                            <span className="stat-tag">
                                {tradeType === 'Rise/Fall' ? 'RISE' : 
                                 tradeType === 'Even/Odd' ? 'EVEN' : 
                                 tradeType === 'Over/Under' ? `OVER ${barrier}` : 
                                 `MATCH ${barrier}`}
                            </span>
                            <span className="stat-val">{valA}</span>
                        </div>
                        {tradeType === 'Over/Under' && (
                            <div className="side side-c" style={{ flex: c || 0 }}>
                                <span className="stat-tag">BAR</span>
                                <span className="stat-val">{valC}</span>
                            </div>
                        )}
                        <div className="side side-b" style={{ flex: b || 0.001 }}>
                            <span className="stat-tag">
                                {tradeType === 'Rise/Fall' ? 'FALL' : 
                                 tradeType === 'Even/Odd' ? 'ODD' : 
                                 tradeType === 'Over/Under' ? `UNDER ${barrier}` : 
                                 `DIFF ${barrier}`}
                            </span>
                            <span className="stat-val">{valB}</span>
                        </div>
                    </div>
                    <div className="toggle-history" onClick={() => setShowHistory(!showHistory)}>
                        TOGGLE HISTORY GRID
                    </div>
                </div>

                {showHistory && (
                    <div className="card">
                        <div className="card-title">History (Newest Bottom-Right)</div>
                        <div className="history-grid-60">
                            {last60.map((h, i) => {
                                const isNewest = i === last60.length - 1;
                                let bg = '#8b949e';
                                
                                if (tradeType === 'Over/Under') {
                                    if (h.digit > barrier) bg = '#238636';
                                    else if (h.digit < barrier) bg = '#da3633';
                                } else if (tradeType === 'Even/Odd') {
                                    bg = (h.digit % 2 === 0) ? '#238636' : '#da3633';
                                } else if (tradeType === 'Rise/Fall') {
                                    const prev = last60[i-1] || (history[history.length - last60.length + i - 1]);
                                    if (prev) {
                                        bg = h.quote > prev.quote ? '#238636' : '#da3633';
                                    }
                                }

                                return (
                                    <div key={i} className={`h-dot ${isNewest ? 'h-newest' : ''}`} style={{ background: bg }}>
                                        {h.digit}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default DCircle;
