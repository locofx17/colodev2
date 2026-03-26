import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import { useStore } from '@/hooks/useStore';
import { generateDerivApiInstance, V2GetActiveToken } from '@/external/bot-skeleton/services/api/appId';
import { contract_stages } from '@/constants/contract-stage';
import './dcircle.scss';

const tradeOptionToBuy = (contract_type: string, trade_option: any) => {
    const buy: any = {
        buy: '1',
        price: trade_option.amount,
        parameters: {
            amount: trade_option.amount,
            basis: trade_option.basis,
            contract_type,
            currency: trade_option.currency,
            duration: trade_option.duration,
            duration_unit: trade_option.duration_unit,
            symbol: trade_option.symbol,
        },
    };
    if (trade_option.prediction !== undefined) {
        buy.parameters.selected_tick = trade_option.prediction;
    }
    if (!['TICKLOW', 'TICKHIGH'].includes(contract_type) && trade_option.prediction !== undefined) {
        buy.parameters.barrier = trade_option.prediction;
    }
    return buy;
};

const DCircle = observer(() => {
    const store = useStore();
    const { run_panel, transactions } = store;
    const apiRef = useRef<any>(null);

    const [symbol, setSymbol] = useState(() => localStorage.getItem('dcircle_symbol') || '1HZ100V');
    const [tradeType, setTradeType] = useState(() => localStorage.getItem('dcircle_tradeType') || 'Over/Under');
    const [ticks, setTicks] = useState(() => parseInt(localStorage.getItem('dcircle_ticks') || '1000'));
    const [barrier, setBarrier] = useState(() => parseInt(localStorage.getItem('dcircle_barrier') || '4'));
    const [tradeDuration, setTradeDuration] = useState(() => parseInt(localStorage.getItem('dcircle_tradeDuration') || '1'));
    const [tradeStake, setTradeStake] = useState(() => parseFloat(localStorage.getItem('dcircle_tradeStake') || '0.35'));
    const [isTrading, setIsTrading] = useState(false);
    const [tradeStatus, setTradeStatus] = useState('');
    const [history, setHistory] = useState<any[]>([]);
    const [digitFreq, setDigitFreq] = useState<number[]>(Array(10).fill(0));
    const [pipSize, setPipSize] = useState(-1);
    const [streak, setStreak] = useState(1);
    const [price, setPrice] = useState('0.0000');
    const [activeDigit, setActiveDigit] = useState<number | undefined>(undefined);
    const [isConnected, setIsConnected] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [lastTradeResult, setLastTradeResult] = useState<{ profit: number; exitDigit: number; isWin: boolean; exitTime: number; contractId: string } | null>(null);
    const [showExtendedHistory, setShowExtendedHistory] = useState(false);

    const ws = useRef<WebSocket | null>(null);
    const currentSubscription = useRef<string | null>(null);

    // Persist settings
    useEffect(() => { localStorage.setItem('dcircle_symbol', symbol); }, [symbol]);
    useEffect(() => { localStorage.setItem('dcircle_tradeType', tradeType); }, [tradeType]);
    useEffect(() => { localStorage.setItem('dcircle_ticks', ticks.toString()); }, [ticks]);
    useEffect(() => { localStorage.setItem('dcircle_barrier', barrier.toString()); }, [barrier]);
    useEffect(() => { localStorage.setItem('dcircle_tradeDuration', tradeDuration.toString()); }, [tradeDuration]);
    useEffect(() => { localStorage.setItem('dcircle_tradeStake', tradeStake.toString()); }, [tradeStake]);

    // Pre-authorize the trading API instance for faster execution
    useEffect(() => {
        const initApi = async () => {
            if (!apiRef.current) {
                apiRef.current = generateDerivApiInstance();
            }
            const token = V2GetActiveToken();
            if (token && !isAuthorized) {
                try {
                    const { authorize, error } = await apiRef.current.authorize(token);
                    if (!error && authorize) {
                        setIsAuthorized(true);
                        try {
                            store?.client?.setLoginId?.(authorize?.loginid || '');
                            store?.client?.setCurrency?.(authorize?.currency || 'USD');
                            store?.client?.setIsLoggedIn?.(true);
                        } catch {}
                    }
                } catch (e) {
                    console.error("BG Auth failed", e);
                }
            }
        };
        initApi();
    }, [isAuthorized, V2GetActiveToken()]); // Re-run if authorization is lost or token changes


    const executeTrade = async (specificTradeType: string) => {
        if (isTrading) return;
        setIsTrading(true);
        setTradeStatus('');
        try {
            if (!apiRef.current) {
                apiRef.current = generateDerivApiInstance();
            }
            const token = V2GetActiveToken();
            if (!token) throw new Error('No active token found.');
            
            let currency = store?.client?.currency || 'USD';

            if (!isAuthorized) {
                setTradeStatus('Authorizing...');
                const { authorize, error: authErr } = await apiRef.current.authorize(token);
                if (authErr) throw authErr;
                setIsAuthorized(true);
                currency = authorize?.currency || 'USD';
                try {
                    store?.client?.setLoginId?.(authorize?.loginid || '');
                    store?.client?.setCurrency?.(currency);
                    store?.client?.setIsLoggedIn?.(true);
                } catch {}
            }

            run_panel.toggleDrawer(true);
            run_panel.setActiveTabIndex(1);
            run_panel.run_id = `dcircle-${Date.now()}`;
            run_panel.setIsRunning(true);
            run_panel.setContractStage(contract_stages.STARTING);

            const trade_option: any = {
                amount: Number(tradeStake),
                basis: 'stake',
                contractTypes: [specificTradeType],
                currency,
                duration: Number(tradeDuration),
                duration_unit: 't',
                symbol,
            };

            if (tradeType === 'Over/Under' || tradeType === 'Matches/Differs') {
                trade_option.prediction = Number(barrier);
            }

            const buy_req = tradeOptionToBuy(specificTradeType, trade_option);
            
            setLastTradeResult(null);
            
            let targetId: string | null = null;
            let pocSubId: string | null = null;
            let handled = false;

            const onMsg = (evt: MessageEvent) => {
                try {
                    const data = JSON.parse(evt.data as any);
                    if (data?.msg_type === 'proposal_open_contract') {
                        const poc = data.proposal_open_contract;
                        if (!pocSubId && data?.subscription?.id) pocSubId = data.subscription.id;
                        
                        if (targetId && String(poc?.contract_id || '') === targetId) {
                            if (handled && poc?.status === 'open') return;

                            const isFinalTick = poc?.tick_count && Number(poc.tick_count) === Number(tradeDuration);
                            const isOfficiallyClosed = poc?.is_sold || poc?.status !== 'open';

                            if (isFinalTick || isOfficiallyClosed) {
                                if (!handled) {
                                    handled = true;
                                    const dVal = String(poc.current_spot_display_value || '');
                                    const currentDigit = parseInt(dVal.slice(-1) || '0');
                                    
                                    let isWin = false;
                                    if (isOfficiallyClosed) {
                                        isWin = Number(poc.profit || 0) > 0;
                                    } else {
                                        if (specificTradeType === 'CALL') isWin = Number(poc.current_spot) > Number(poc.entry_tick);
                                        else if (specificTradeType === 'PUT') isWin = Number(poc.current_spot) < Number(poc.entry_tick);
                                        else if (specificTradeType === 'DIGITEVEN') isWin = currentDigit % 2 === 0;
                                        else if (specificTradeType === 'DIGITODD') isWin = currentDigit % 2 !== 0;
                                        else if (specificTradeType === 'DIGITOVER') isWin = currentDigit > Number(barrier);
                                        else if (specificTradeType === 'DIGITUNDER') isWin = currentDigit < Number(barrier);
                                        else if (specificTradeType === 'DIGITMATCH') isWin = currentDigit === Number(barrier);
                                        else if (specificTradeType === 'DIGITDIFF') isWin = currentDigit !== Number(barrier);
                                    }

                                    const exitDigit = isOfficiallyClosed ? parseInt(String(poc.exit_tick_display_value || '').slice(-1) || '0') : currentDigit;
                                    
                                    setLastTradeResult({
                                        profit: Number(poc.profit || (isWin ? Number(tradeStake) * 0.95 : -Number(tradeStake))),
                                        exitDigit,
                                        isWin,
                                        exitTime: Number(poc.exit_tick_time || poc.last_tick_time || Date.now()/1000),
                                        contractId: String(poc.contract_id),
                                    });
             
                                    setTradeStatus(isWin ? 'WIN' : 'LOSS');
                                    setIsTrading(false);
                                }

                                if (isOfficiallyClosed) {
                                    if (pocSubId) apiRef.current?.forget?.({ forget: pocSubId });
                                    apiRef.current?.connection?.removeEventListener('message', onMsg);
                                    setTimeout(() => setTradeStatus(''), 5000);
                                }
                            } else if (!handled && poc?.tick_count && poc?.status === 'open') {
                                const lastDigit = String(poc.current_spot_display_value || '').slice(-1);
                                setTradeStatus(`Tick ${poc.tick_count} of ${tradeDuration}: ${lastDigit}`);
                            }
                        }
                    }
                } catch {}
            };

            // Add listener BEFORE sending buy with subscribe
            apiRef.current?.connection?.addEventListener('message', onMsg);

            try {
                // Unified Buy + Subscribe
                const buyPromise = apiRef.current.send({
                    ...buy_req,
                    subscribe: 1
                });
                
                setTradeStatus('Sending Buy ...');
                const buyRes = await buyPromise;
                
                const { buy: buyData, error: buyErr, subscription } = buyRes || {};
                if (buyErr) throw buyErr;
                
                targetId = String(buyData?.contract_id || '');
                if (subscription?.id) pocSubId = subscription.id;

                setTradeStatus(`Purchased successfully!`);
            } catch (e) {
                apiRef.current?.connection?.removeEventListener('message', onMsg);
                setIsTrading(false);
                throw e;
            }

            
        } catch (e: any) {
            setTradeStatus(`Error: ${e?.message || e?.error?.message || 'Trade failed'}`);
            setIsTrading(false);
            run_panel.setIsRunning(false);
            run_panel.setHasOpenContract(false);
            run_panel.setContractStage(contract_stages.NOT_RUNNING);
        }
    };

    const detectPrecision = (quote: number) => {
        if (Math.floor(quote) === quote) return 0;
        const str = quote.toString();
        if (str.includes('.')) return str.split('.')[1].length;
        return 0;
    };

    const handleTick = useCallback((quote: number, time: number, isBulk = false) => {
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
 
                        const newHistory = [...prevHistory, { digit: d, quote, time }];
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
                        const newHistory = [...prevHistory, { digit: d, quote, time }];
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
                const prices = data.history.prices;
                if (prices && prices.length > 0) {
                    const lastPrice = prices[prices.length - 1];
                    const precision = detectPrecision(lastPrice);
                    setPipSize(precision);
                    setPrice(lastPrice.toFixed(precision));

                    // Process history in bulk
                    const times = data.history.times;
                    const limitedPrices = prices.slice(-ticksRef.current);
                    const limitedTimes = times.slice(-ticksRef.current);
                    const newFreq = Array(10).fill(0);
                    const newHistory = limitedPrices.map((q: number, idx: number) => {
                        const d = parseInt(q.toFixed(precision).slice(-1));
                        newFreq[d]++;
                        return { digit: d, quote: q, time: limitedTimes[idx] };
                    });

                    setHistory(newHistory);
                    setDigitFreq(newFreq);
                    if (newHistory.length > 0) {
                        setActiveDigit(newHistory[newHistory.length - 1].digit);
                    }
                }
            }
            if (data.tick) handleTick(data.tick.quote, data.tick.epoch);
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

    // Automatically re-subscribe and refresh analysis when market or ticks change
    useEffect(() => {
        if (isConnected) {
            subscribeMarket();
        }
    }, [subscribeMarket, isConnected]);

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
            min1: sorted[sorted.length - 1],
            min2: sorted[sorted.length - 2]
        };
    };

    const { max1, max2, min1, min2 } = getSortedFreq();

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
    const last120 = history.slice(-120);

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
                                    <option value="1HZ10V">Volatility 10 (1s)</option>
                                    <option value="1HZ25V">Volatility 25 (1s)</option>
                                    <option value="1HZ50V">Volatility 50 (1s)</option>
                                    <option value="1HZ75V">Volatility 75 (1s)</option>
                                    <option value="1HZ100V">Volatility 100 (1s)</option>
                                </optgroup>
                                <optgroup label="Volatility Indices">
                                    <option value="R_10">Volatility 10</option>
                                    <option value="R_25">Volatility 25</option>
                                    <option value="R_50">Volatility 50</option>
                                    <option value="R_75">Volatility 75</option>
                                    <option value="R_100">Volatility 100</option>
                                </optgroup>
                                <optgroup label="Crash/Boom">
                                    <option value="BOOM500">Boom 500</option>
                                    <option value="BOOM1000">Boom 1000</option>
                                    <option value="CRASH500">Crash 500</option>
                                    <option value="CRASH1000">Crash 1000</option>
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
                        {(tradeType === 'Over/Under' || tradeType === 'Matches/Differs') && (
                            <div>
                                <div className="card-title">Prediction</div>
                                <input 
                                    type="number" 
                                    value={barrier} 
                                    onChange={(e) => setBarrier(parseInt(e.target.value))}
                                    min="0" 
                                    max="9"
                                />
                            </div>
                        )}
                    </div>
                </div>
                {/* settings card end — col-left continues */}


                <div className="card">
                    <div className="card-title">Market Pulse</div>
                    <div className="price-display">
                        <div className="price-value">{price}</div>
                        <div className="l5-row">
                            {history.slice(-5).map((h, i) => {
                                let col = '#8b949e';
                                const isExitTick = lastTradeResult && h.time === lastTradeResult.exitTime;
                                
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
                                    <div key={i} className={`l5-dot ${isExitTick ? 'is-exit' : ''}`} style={{ border: `1px solid ${col}`, color: col, position: 'relative' }}>
                                        {h.digit}
                                        {isExitTick && (
                                            <div style={{ position: 'absolute', top: '-15px', fontSize: '10px', color: lastTradeResult.isWin ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                                                {lastTradeResult.isWin ? 'WIN' : 'LOSS'}
                                            </div>
                                        )}
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
                                else if (f === min2 && f > 0) r = 'circle-min2';
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
                    <div className="card-title">Manual Execution</div>
                    <div className="control-row">
                        <div>
                            <div className="card-title" style={{ color: '#4bb4b3' }}>Trade Ticks</div>
                            <input 
                                type="number" 
                                value={tradeDuration} 
                                onChange={(e) => setTradeDuration(Math.max(1, parseInt(e.target.value) || 1))}
                                min="1" 
                                max="10"
                            />
                        </div>
                        <div>
                            <div className="card-title" style={{ color: '#4bb4b3' }}>Stake (USD)</div>
                            <input 
                                type="number" 
                                value={tradeStake} 
                                onChange={(e) => setTradeStake(Math.max(0.35, parseFloat(e.target.value) || 0.35))}
                                step="0.01"
                                min="0.35" 
                            />
                        </div>
                    </div>
                    
                    <div className="manual-trade-actions" style={{ marginTop: '15px', display: 'flex', gap: '10px', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>                             {tradeType === 'Rise/Fall' && (
                                <>
                                    <button className="trade-btn buy-btn" disabled={isTrading} onMouseDown={() => executeTrade('CALL')} style={{ background: '#238636', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>RISE</span>
                                    </button>
                                    <button className="trade-btn sell-btn" disabled={isTrading} onMouseDown={() => executeTrade('PUT')} style={{ background: '#da3633', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>FALL</span>
                                    </button>
                                </>
                            )}
                             {tradeType === 'Even/Odd' && (
                                <>
                                    <button className="trade-btn buy-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITEVEN')} style={{ background: '#238636', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>EVEN</span>
                                    </button>
                                    <button className="trade-btn sell-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITODD')} style={{ background: '#da3633', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>ODD</span>
                                    </button>
                                </>
                            )}
                             {tradeType === 'Over/Under' && (
                                <>
                                    <button className="trade-btn buy-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITOVER')} style={{ background: '#238636', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>OVER {barrier}</span>
                                    </button>
                                    <button className="trade-btn sell-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITUNDER')} style={{ background: '#da3633', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>UNDER {barrier}</span>
                                    </button>
                                </>
                            )}
                             {tradeType === 'Matches/Differs' && (
                                <>
                                    <button className="trade-btn buy-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITMATCH')} style={{ background: '#238636', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>MATCH {barrier}</span>
                                    </button>
                                    <button className="trade-btn sell-btn" disabled={isTrading} onMouseDown={() => executeTrade('DIGITDIFF')} style={{ background: '#da3633', flex: 1, padding: '10px', borderRadius: '4px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: isTrading ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span>DIFFERS {barrier}</span>
                                    </button>
                                </>
                            )}

                        </div>
                        {tradeStatus && (
                            <div className="trade-status-msg" style={{ fontSize: '13px', color: tradeStatus.includes('Error') ? '#f85149' : (tradeStatus.includes('WIN') ? '#3fb950' : '#8b949e'), textAlign: 'center', fontWeight: 'bold', padding: '5px', borderRadius: '4px', background: tradeStatus.includes('WIN') ? 'rgba(63, 185, 80, 0.1)' : 'transparent' }}>
                                {tradeStatus}
                            </div>
                        )}
                        {lastTradeResult && !isTrading && (
                             <div className="last-result-summary" style={{ textAlign: 'center', padding: '8px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', borderLeft: `3px solid ${lastTradeResult.isWin ? '#3fb950' : '#f85149'}` }}>
                                <span style={{ fontSize: '11px', opacity: 0.7 }}>LAST RESULT: </span>
                                <span style={{ fontWeight: 'bold', color: lastTradeResult.isWin ? '#3fb950' : '#f85149' }}>
                                    {lastTradeResult.isWin ? 'PROFIT' : 'LOSS'} ${Math.abs(lastTradeResult.profit).toFixed(2)}
                                </span>
                                <div style={{ fontSize: '10px', opacity: 0.6 }}>Exit Digit: {lastTradeResult.exitDigit}</div>
                             </div>
                        )}
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
                </div>

                <div className="card">
                    <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span>History (Last {showExtendedHistory ? last120.length : last60.length} Ticks)</span>
                        <button 
                            className="history-toggle-btn"
                            onClick={() => setShowExtendedHistory(!showExtendedHistory)}
                        >
                            {showExtendedHistory ? 'Show Less' : 'Show More'}
                        </button>
                    </div>
                    <div className="history-scroll-container" style={{ maxHeight: showExtendedHistory ? '400px' : '200px' }}>
                        <div className="history-grid">
                            {(showExtendedHistory ? last120 : last60).map((h, i) => {
                                const currentList = showExtendedHistory ? last120 : last60;
                                const isNewest = i === currentList.length - 1;
                                let bg = '#8b949e';
                                let displayVal: string | number = h.digit;
                                
                                if (tradeType === 'Over/Under') {
                                    if (h.digit > barrier) bg = '#238636';
                                    else if (h.digit < barrier) bg = '#da3633';
                                } else if (tradeType === 'Even/Odd') {
                                    bg = (h.digit % 2 === 0) ? '#238636' : '#da3633';
                                } else if (tradeType === 'Rise/Fall') {
                                    const actualIndex = history.length - currentList.length + i;
                                    const prev = history[actualIndex - 1];
                                    if (prev) {
                                        const isRise = h.quote > prev.quote;
                                        bg = isRise ? '#238636' : '#da3633';
                                        displayVal = isRise ? 'R' : 'F';
                                    }
                                } else if (tradeType === 'Matches/Differs') {
                                    bg = (h.digit === barrier) ? '#238636' : '#da3633';
                                }

                                 const isExitTick = lastTradeResult && h.time === lastTradeResult.exitTime;
                                 return (
                                     <div key={i} className={`h-dot ${isNewest ? 'h-newest' : ''} ${isExitTick ? 'is-exit-history' : ''}`} style={{ background: bg, position: 'relative' }}>
                                         {displayVal}
                                         {isExitTick && (
                                             <div style={{ position: 'absolute', bottom: '-8px', fontSize: '8px', color: lastTradeResult.isWin ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                                                 {lastTradeResult.isWin ? 'W' : 'L'}
                                             </div>
                                         )}
                                     </div>
                                 );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default DCircle;
