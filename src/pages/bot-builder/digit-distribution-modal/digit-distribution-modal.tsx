import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import Draggable from '@/components/draggable';
import { localize } from '@deriv-com/translations';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import './digit-distribution-modal.scss';

const DigitDistributionModal = observer(() => {
    const { dashboard } = useStore();
    const { is_digit_dist_modal_visible, setDigitDistModalVisibility, bot_builder_symbol } = dashboard;

    const [symbol, setSymbol] = useState(bot_builder_symbol || '1HZ10V');
    const [ticks, setTicks] = useState(() => parseInt(localStorage.getItem('dcircle_ticks') || '1000'));
    
    // Sync with Bot Builder symbol
    useEffect(() => {
        if (bot_builder_symbol) {
            setSymbol(bot_builder_symbol);
        }
    }, [bot_builder_symbol]);

    // Sync ticks with localStorage (shared with DCircle)
    useEffect(() => {
        localStorage.setItem('dcircle_ticks', ticks.toString());
    }, [ticks]);

    const [price, setPrice] = useState('0.00');
    const [digitFreq, setDigitFreq] = useState<number[]>(Array(10).fill(0));
    const [history, setHistory] = useState<{ digit: number; quote: number }[]>([]);
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const ws = useRef<WebSocket | null>(null);
    const ticksRef = useRef(ticks);
    const maxPrecRef = useRef<{ [key: string]: number }>({});

    useEffect(() => {
        ticksRef.current = ticks;
    }, [ticks]);

    const detectPrecision = useCallback((quote: number) => {
        const str = quote.toString();
        const p = str.includes('.') ? str.split('.')[1].length : 0;
        if (!maxPrecRef.current[symbol] || p > maxPrecRef.current[symbol]) {
            maxPrecRef.current[symbol] = p;
        }
        return maxPrecRef.current[symbol];
    }, [symbol]);

    const connect = useCallback(() => {
        if (ws.current) ws.current.close();
        
        const appId = getAppId();
        const serverUrl = getSocketURL();
        ws.current = new WebSocket(`wss://${serverUrl}/websockets/v3?app_id=${appId}`);

        ws.current.onopen = () => {
            setIsConnected(true);
            ws.current?.send(JSON.stringify({ forget_all: "ticks" }));
            ws.current?.send(JSON.stringify({ ticks_history: symbol, count: ticksRef.current, end: 'latest', style: 'ticks' }));
            ws.current?.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        };

        ws.current.onmessage = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.history) {
                const prices = data.history.prices;
                if (prices && prices.length > 0) {
                    // Scan batch for max precision
                    let maxP = 0;
                    prices.forEach(q => {
                        const s = q.toString();
                        const p = s.includes('.') ? s.split('.')[1].length : 0;
                        if (p > maxP) maxP = p;
                    });
                    if (!maxPrecRef.current[symbol] || maxP > maxPrecRef.current[symbol]) {
                        maxPrecRef.current[symbol] = maxP;
                    }

                    const precision = maxPrecRef.current[symbol];
                    setPrice(prices[prices.length - 1].toFixed(precision));

                    // Match DCircle slicing
                    const limitedPrices = prices.slice(-ticksRef.current);
                    const newFreq = Array(10).fill(0);
                    const newHistory = limitedPrices.map((q: number) => {
                        const d = parseInt(q.toFixed(precision).slice(-1));
                        newFreq[d]++;
                        return { digit: d, quote: q };
                    });
                    setHistory(newHistory);
                    setDigitFreq(newFreq);
                    if (newHistory.length > 0) {
                        setLastDigit(newHistory[newHistory.length - 1].digit);
                    }
                }
            }
            if (data.tick) {
                const q = data.tick.quote;
                const precision = detectPrecision(q);
                const str = q.toFixed(precision);
                const d = parseInt(str.slice(-1));
                setPrice(str);
                setLastDigit(d);
                setHistory(prev => {
                    const newHistory = [...prev, { digit: d, quote: q }].slice(-ticksRef.current);
                    const freq = Array(10).fill(0);
                    newHistory.forEach(h => freq[h.digit]++);
                    setDigitFreq(freq);
                    return newHistory;
                });
            }
        };

        ws.current.onclose = () => setIsConnected(false);
    }, [symbol]);

    useEffect(() => {
        if (is_digit_dist_modal_visible) {
            connect();
        } else {
            ws.current?.close();
            ws.current = null;
        }
        return () => ws.current?.close();
    }, [is_digit_dist_modal_visible, connect, ticks]);

    const formatPercent = (value: number, total: number) => {
        if (total === 0) return "0.0%";
        let pct = (value / total) * 100;
        return pct.toFixed(1) + "%";
    };

    if (!is_digit_dist_modal_visible) return null;

    const total = history.length || 1;
    let even = 0, odd = 0, over4 = 0, under5 = 0, rise = 0, fall = 0;

    history.forEach((h, i) => {
        if (h.digit % 2 === 0) even++; else odd++;
        if (h.digit > 4) over4++; else under5++;
        if (i > 0) {
            if (h.quote > history[i - 1].quote) rise++;
            else if (h.quote < history[i - 1].quote) fall++;
        }
    });

    const pricePrefix = price.slice(0, -1);
    const priceLastChar = price.slice(-1);

    const maxCount = Math.max(...digitFreq);
    const minCount = Math.min(...digitFreq);

    const symbolMap: { [key: string]: string } = {
        '1HZ10V': 'Volatility 10 (1s) Index',
        '1HZ15V': 'Volatility 15 (1s) Index',
        '1HZ25V': 'Volatility 25 (1s) Index',
        '1HZ30V': 'Volatility 30 (1s) Index',
        '1HZ50V': 'Volatility 50 (1s) Index',
        '1HZ75V': 'Volatility 75 (1s) Index',
        '1HZ90V': 'Volatility 90 (1s) Index',
        '1HZ100V': 'Volatility 100 (1s) Index',
        'R_10': 'Volatility 10 Index',
        'R_25': 'Volatility 25 Index',
        'R_50': 'Volatility 50 Index',
        'R_75': 'Volatility 75 Index',
        'R_100': 'Volatility 100 Index',
        'RDBULL': 'Bull Market Index',
        'RDBEAR': 'Bear Market Index',
        'JD10': 'Jump 10 Index',
        'JD25': 'Jump 25 Index',
        'JD50': 'Jump 50 Index',
        'JD75': 'Jump 75 Index',
        'JD100': 'Jump 100 Index',
    };

    const displayName = symbolMap[symbol] || symbol;

    return (
        <Draggable
            initialValues={{
                width: 600,
                height: 560,
                xAxis: window.innerWidth / 2 - 300,
                yAxis: 100,
            }}
            header={localize('Digit Distribution')}
            onClose={() => setDigitDistModalVisibility(false)}
        >
            <div className='digit-dist-modal__content'>
                <div className='digit-dist-modal__header'>
                    <div className='digit-dist-modal__market-info'>
                        <span className='digit-dist-modal__symbol'>{displayName}</span>
                        <div className='digit-dist-modal__ticks-control'>
                            <input 
                                type='number' 
                                value={ticks} 
                                onChange={(e) => setTicks(parseInt(e.target.value) || 1)}
                                min='1' 
                                max='10000'
                                className='digit-dist-modal__ticks-input'
                            />
                            <span className='digit-dist-modal__ticks-label'>{localize('TICKS')}</span>
                        </div>
                    </div>
                    <div className='digit-dist-modal__price-info'>
                        <span className='digit-dist-modal__price-label'>{localize('CURRENT PRICE')}</span>
                        <div className='digit-dist-modal__price-value'>
                            {pricePrefix}<span className='digit-dist-modal__price-last'>{priceLastChar}</span>
                        </div>
                    </div>
                </div>

                <div className='digit-dist-modal__circles'>
                    {digitFreq.map((f, i) => {
                        const pctStr = formatPercent(f, total);
                        let ringCol = 'var(--border-normal)';
                        if (f === maxCount && f > 0) ringCol = '#2ea043';
                        else if (f === minCount && f > 0) ringCol = '#f85149';

                        return (
                            <div 
                                key={i} 
                                className={`digit-dist-modal__circle ${i === lastDigit ? 'active' : ''}`}
                                style={{ background: `conic-gradient(from 0deg, ${ringCol} 0% ${parseFloat(pctStr)}%, var(--fill-normal) ${parseFloat(pctStr)}% 100%)` }}
                            >
                                <div className='digit-dist-modal__circle-inner'>
                                    <span className='digit-dist-modal__digit'>{i}</span>
                                    <span className='digit-dist-modal__pct'>{pctStr}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className='digit-dist-modal__stats'>
                    {[
                        { label: 'Even', val: formatPercent(even, total), compare: odd },
                        { label: 'Odd', val: formatPercent(odd, total), compare: even },
                        { label: 'Rise', val: formatPercent(rise, history.length - 1 || 1), compare: fall },
                        { label: 'Fall', val: formatPercent(fall, history.length - 1 || 1), compare: rise },
                        { label: 'Over 4', val: formatPercent(over4, total), compare: under5 },
                        { label: 'Under 5', val: formatPercent(under5, total), compare: over4 },
                    ].map((s, i) => {
                        const isGreen = parseFloat(s.val) >= (s.compare / total * 100);
                        return (
                            <div key={i} className={`digit-dist-modal__stat-box ${isGreen ? 'green' : 'red'}`}>
                                <span className='digit-dist-modal__stat-label'>{localize(s.label)}</span>
                                <span className='digit-dist-modal__stat-val'>{s.val}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Draggable>
    );
});

export default DigitDistributionModal;
