import React from 'react';
import { observer } from 'mobx-react-lite';

import { Localize, localize } from '@deriv-com/translations';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import './risk-calculator.scss';



const RiskCalculator: React.FC = observer(() => {
    const [balance, setBalance] = React.useState(1000);
    const [balanceInput, setBalanceInput] = React.useState('1000');
    const [baseStake, setBaseStake] = React.useState(20);
    const [stakeInputString, setStakeInputString] = React.useState('20');
    const [currentPayoutPerDollar, setCurrentPayoutPerDollar] = React.useState(0);
    const [apiConnected, setApiConnected] = React.useState(false);
    const [apiStatusText, setApiStatusText] = React.useState('Connecting to Deriv API...');
    const [contractType, setContractType] = React.useState('DIGITOVER');
    const [selectedBarrier, setSelectedBarrier] = React.useState(5);
    const [multiplier, setMultiplier] = React.useState(2);
    const [tradesCount, setTradesCount] = React.useState(3);
    const [takeProfit, setTakeProfit] = React.useState(3);
    const [stopLoss, setStopLoss] = React.useState(9);
    const [sessionsPerDay, setSessionsPerDay] = React.useState(1);
    const [applyFee, setApplyFee] = React.useState(true);

    const ws = React.useRef<WebSocket | null>(null);
    const pingInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchProposal = React.useCallback(() => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

        const proposalRequest: any = {
            proposal: 1,
            amount: 1,
            basis: 'stake',
            contract_type: contractType,
            currency: 'USD',
            barrier: selectedBarrier.toString(),
            duration: 1,
            duration_unit: 't',
            symbol: 'R_50',
        };

        if (contractType === 'DIGITEVEN' || contractType === 'DIGITODD') {
            delete proposalRequest.barrier;
        }

        ws.current.send(JSON.stringify(proposalRequest));
    }, [contractType, selectedBarrier]);

    const connectWebSocket = React.useCallback(() => {
        if (
            ws.current &&
            (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        setApiConnected(false);
        setApiStatusText('Connecting to Deriv API...');

        ws.current = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');

        ws.current.onopen = () => {
            setApiConnected(true);
            setApiStatusText('Connected to Deriv API');

            // Start heartbeat
            if (pingInterval.current) clearInterval(pingInterval.current);
            pingInterval.current = setInterval(() => {
                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({ ping: 1 }));
                }
            }, 30000);

            fetchProposal();
        };

        ws.current.onerror = () => {
            setApiConnected(false);
            setApiStatusText('Connection error');
        };

        ws.current.onclose = () => {
            setApiConnected(false);
            setApiStatusText('Disconnected - reconnecting...');
            if (pingInterval.current) clearInterval(pingInterval.current);
            setTimeout(connectWebSocket, 3000);
        };

        ws.current.onmessage = message => {
            try {
                const data = JSON.parse(message.data);
                if (data.msg_type === 'ping') return;

                if (data.error) {
                    setApiStatusText('API error: ' + data.error.message);
                    return;
                }

                if (data.proposal) {
                    const proposal = data.proposal;
                    const payout = parseFloat(proposal.payout);
                    if (!isNaN(payout)) {
                        setCurrentPayoutPerDollar(payout);
                    }
                }
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };
    }, [fetchProposal]);

    React.useEffect(() => {
        connectWebSocket();
        return () => {
            ws.current?.close();
            if (pingInterval.current) clearInterval(pingInterval.current);
        };
    }, [connectWebSocket]);

    React.useEffect(() => {
        fetchProposal();
    }, [contractType, selectedBarrier, fetchProposal]);

    const handleSetBalance = () => {
        let bal = parseFloat(balanceInput);
        if (isNaN(bal) || bal <= 0) bal = 1000;
        setBalance(bal);
    };

    const handlePercentClick = (pct: number) => {
        const stake = balance * (pct / 100);
        const finalStake = stake < 0.01 ? 0.01 : stake;
        setBaseStake(finalStake);
        setStakeInputString(finalStake.toString());
    };

    const handleKeypadPress = (key: string) => {
        let newString = stakeInputString;
        if (key === 'C') {
            newString = '';
        } else if (key === 'X') {
            newString = newString.slice(0, -1);
        } else if (key === '.') {
            if (!newString.includes('.')) {
                newString += '.';
            }
        } else {
            newString += key;
        }
        setStakeInputString(newString);
        let val = parseFloat(newString);
        if (!isNaN(val)) {
            setBaseStake(val);
        } else {
            setBaseStake(0);
        }
    };

    const handleReset = () => {
        setBalance(1000);
        setBalanceInput('1000');
        setBaseStake(20);
        setStakeInputString('20');
        setMultiplier(2);
        setTradesCount(3);
        setTakeProfit(3);
        setStopLoss(9);
        setSessionsPerDay(1);
        setContractType('DIGITOVER');
        setApplyFee(true);
        setSelectedBarrier(5);
    };

    // Calculations
    const stakes: number[] = [];
    let current = baseStake;
    for (let i = 0; i < tradesCount; i++) {
        stakes.push(current);
        current = current * multiplier;
    }

    const totalRisk = stakes.reduce((a, b) => a + b, 0);
    const effectivePayoutMultiplier = applyFee ? currentPayoutPerDollar * 0.97 : currentPayoutPerDollar;
    const profitFirst = baseStake * (effectivePayoutMultiplier - 1);
    const runsToTP = profitFirst > 0 ? Math.ceil(takeProfit / profitFirst) : 0;
    const runsToSL = totalRisk > 0 ? Math.floor(stopLoss / totalRisk) : 0;

    let probWin = 0.5;
    if (contractType === 'DIGITMATCH') probWin = 0.1;
    else if (contractType === 'DIGITDIFF') probWin = 0.9;
    else if (contractType === 'DIGITEVEN' || contractType === 'DIGITODD') probWin = 0.5;
    else if (contractType === 'DIGITOVER') probWin = (9 - selectedBarrier) / 10;
    else if (contractType === 'DIGITUNDER') probWin = selectedBarrier / 10;

    const probLose = 1 - probWin;
    const streakProb = Math.pow(probLose, tradesCount);

    const isBalanceInsufficient = totalRisk > balance;
    const payoutPercent = ((currentPayoutPerDollar - 1) * 100).toFixed(1);

    return (
        <div className='risk-calculator-wrapper'>
            <div className='card'>
                <div className='balance-section'>
                    <div className='balance-row'>
                        <span className='balance-label'>
                            <Localize i18n_default_text='ACCOUNT BALANCE' />
                        </span>
                        <span className='balance-amount'>${balance.toFixed(2)}</span>
                    </div>
                    <div className='set-balance-area'>
                        <input
                            type='number'
                            step='any'
                            min='1'
                            value={balanceInput}
                            onChange={e => setBalanceInput(e.target.value)}
                            placeholder='1000.00'
                        />
                        <button onClick={handleSetBalance}>
                            <Localize i18n_default_text='SET BALANCE' />
                        </button>
                    </div>
                    <div className='percentage-buttons'>
                        {[1, 2, 5, 10, 15, 25, 50, 100].map(pct => (
                            <button key={pct} className='percent-btn' onClick={() => handlePercentClick(pct)}>
                                {pct}%
                            </button>
                        ))}
                    </div>
                    <div className='current-stake'>
                        <span>
                            <Localize i18n_default_text='CURRENT STAKE' />
                        </span>
                        <span>
                            <span className='stake-value'>${baseStake.toFixed(2)}</span>{' '}
                            <span className='stake-percent'>( {((baseStake / balance) * 100).toFixed(2)}% )</span>
                        </span>
                    </div>
                    <div className='keypad'>
                        {[7, 8, 9, 'C', 4, 5, 6, 'X', 1, 2, 3, '.', 0].map((key, i) => (
                            <button
                                key={i}
                                className={`key ${key === 'C' ? 'key-clear' : ''} ${key === 'X' ? 'key-back' : ''}`}
                                onClick={() => handleKeypadPress(key.toString())}
                                style={key === 0 ? { gridColumn: 'span 2' } : {}}
                            >
                                {key === 'X' ? '⌫' : key}
                            </button>
                        ))}
                    </div>
                </div>

                <div className='grid'>
                    <div className='field'>
                        <label>
                            <Localize i18n_default_text='🎯 Contract type' />
                        </label>
                        <select value={contractType} onChange={e => setContractType(e.target.value)}>
                            <option value='DIGITMATCH'>{localize('Digit Match')}</option>
                            <option value='DIGITDIFF'>{localize('Digit Diff')}</option>
                            <option value='DIGITEVEN'>{localize('Even')}</option>
                            <option value='DIGITODD'>{localize('Odd')}</option>
                            <option value='DIGITOVER'>{localize('Over')}</option>
                            <option value='DIGITUNDER'>{localize('Under')}</option>
                        </select>
                    </div>

                    <div className='barrier-row'>
                        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                            <Localize i18n_default_text='🎯 Select barrier digit (0-9)' />
                        </div>
                        <div className='barrier-digits'>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
                                <button
                                    key={digit}
                                    className={`digit-btn ${selectedBarrier === digit ? 'selected' : ''}`}
                                    onClick={() => setSelectedBarrier(digit)}
                                >
                                    {digit}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className='payout-display'>
                        <span>
                            <Localize
                                i18n_default_text='📊 Live payout for ${{stake}} stake:'
                                values={{ stake: baseStake.toFixed(2) }}
                            />
                        </span>
                        <span>
                            <span className='payout-amount'>
                                {currentPayoutPerDollar > 0
                                    ? `$${(currentPayoutPerDollar * baseStake).toFixed(2)}`
                                    : '...'}
                            </span>{' '}
                            <span className='payout-note'>(+{payoutPercent}%)</span>
                        </span>
                    </div>

                    <div className='payout-display' style={{ borderTop: 'none', paddingTop: 0 }}>
                        <span>
                            <Localize i18n_default_text='💰 Net payout (after 3% markup):' />
                        </span>
                        <span>
                            <span className='payout-amount' style={{ color: '#ff4444' }}>
                                {currentPayoutPerDollar > 0
                                    ? `$${(effectivePayoutMultiplier * baseStake).toFixed(2)}`
                                    : '...'}
                            </span>
                        </span>
                    </div>

                    <div className='fee-row'>
                        <input
                            type='checkbox'
                            id='feeCheckbox'
                            checked={applyFee}
                            onChange={e => setApplyFee(e.target.checked)}
                        />
                        <label htmlFor='feeCheckbox'>
                            <Localize i18n_default_text='Apply 3% app markup (your fee)' />
                        </label>
                        <span className='fee-note'>
                            {applyFee ? localize('‑3% from payout') : localize('no markup applied')}
                        </span>
                    </div>
                </div>

                <div className='martingale-settings'>
                    <div className='inline-group'>
                        <div className='field'>
                            <label>
                                <Localize i18n_default_text='🔁 Multiplier' />
                            </label>
                            <input
                                type='number'
                                step='0.1'
                                min='1'
                                value={multiplier}
                                onChange={e => setMultiplier(parseFloat(e.target.value))}
                            />
                        </div>
                        <div className='field'>
                            <label>
                                <Localize i18n_default_text='📊 Trades in sequence' />
                            </label>
                            <input
                                type='number'
                                min='1'
                                max='10'
                                value={tradesCount}
                                onChange={e => setTradesCount(parseInt(e.target.value))}
                            />
                            <div className='helper'>
                                <Localize i18n_default_text='Total number of stakes (including base)' />
                            </div>
                        </div>
                    </div>
                    <div className='inline-group' style={{ marginTop: '1rem' }}>
                        <div className='field'>
                            <label>
                                <Localize i18n_default_text='🎯 Take profit ($)' />
                            </label>
                            <input
                                type='number'
                                step='any'
                                min='0'
                                value={takeProfit}
                                onChange={e => setTakeProfit(parseFloat(e.target.value))}
                            />
                        </div>
                        <div className='field'>
                            <label>
                                <Localize i18n_default_text='🛑 Stop loss ($)' />
                            </label>
                            <input
                                type='number'
                                step='any'
                                min='0'
                                value={stopLoss}
                                onChange={e => setStopLoss(parseFloat(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className='field' style={{ marginTop: '1rem' }}>
                        <label>
                            <Localize i18n_default_text='📅 Sessions per day' />
                        </label>
                        <select value={sessionsPerDay} onChange={e => setSessionsPerDay(parseInt(e.target.value))}>
                            <option value='1'>{localize('1 Session')}</option>
                            <option value='2'>{localize('2 Sessions')}</option>
                            <option value='3'>{localize('3 Sessions')}</option>
                        </select>
                    </div>
                </div>

                <div className='sequence-box'>
                    <div className='sequence-title'>
                        <Localize i18n_default_text='🔁 Martingale stake sequence' />
                    </div>
                    <div className='chips'>
                        {stakes.map((s, idx) => (
                            <span key={idx} className='chip'>
                                {idx === 0 ? localize('Base') : `x${multiplier.toFixed(1)}`} ${s.toFixed(2)}
                            </span>
                        ))}
                    </div>
                    <div className='info-row'>
                        <span>
                            <Localize i18n_default_text='💰 Total required capital' />
                        </span>
                        <span>${totalRisk.toFixed(2)}</span>
                    </div>
                    <div className='info-row'>
                        <span>
                            <Localize i18n_default_text='📈 Profit if win on 1st (after fee)' />
                        </span>
                        <span>${profitFirst.toFixed(2)}</span>
                    </div>
                    <div className='info-row'>
                        <span>
                            <Localize i18n_default_text='📉 Loss if all steps fail' />
                        </span>
                        <span>${totalRisk.toFixed(2)}</span>
                    </div>
                    <div className='info-row'>
                        <span>
                            <Localize i18n_default_text='⚡ Risk of full streak' />
                        </span>
                        <span>{(streakProb * 100).toFixed(2)}%</span>
                    </div>
                </div>

                <div className='actions'>
                    <button className='btn btn-primary' disabled={!apiConnected || currentPayoutPerDollar === 0}>
                        {!apiConnected
                            ? localize('connecting...')
                            : currentPayoutPerDollar === 0
                              ? localize('fetching payout...')
                              : localize('update calculator')}
                    </button>
                    <button className='btn' onClick={handleReset}>
                        <Localize i18n_default_text='reset' />
                    </button>
                </div>

                <div className='results'>
                    <h3>
                        <Localize i18n_default_text='📋 martingale risk report' />
                    </h3>
                    <div className='results-grid'>
                        <div className='metric'>
                            <div className='metric-label'>{localize('total required')}</div>
                            <div className='metric-value'>
                                ${totalRisk.toFixed(2)}
                                <br />
                                <small>{((totalRisk / balance) * 100).toFixed(1)}% of balance</small>
                            </div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('base stake')}</div>
                            <div className='metric-value'>${baseStake.toFixed(2)}</div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('profit if win 1st')}</div>
                            <div className='metric-value'>${profitFirst.toFixed(2)}</div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('win probability')}</div>
                            <div className='metric-value'>{(probWin * 100).toFixed(1)}%</div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('sessions/day')}</div>
                            <div className='metric-value'>{sessionsPerDay}</div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('take profit / stop')}</div>
                            <div className='metric-value'>
                                ${takeProfit} / ${stopLoss}
                            </div>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('runs to hit tp')}</div>
                            <div className='metric-value'>
                                {runsToTP} <small>{localize('wins')}</small>
                            </div>
                            <small>{localize('at ${{profit}} profit/win', { profit: profitFirst.toFixed(2) })}</small>
                        </div>
                        <div className='metric'>
                            <div className='metric-label'>{localize('runs to hit sl')}</div>
                            <div className='metric-value'>
                                {runsToSL} <small>{localize('failed streaks')}</small>
                            </div>
                            <small>{localize('at ${{loss}} loss/streak', { loss: totalRisk.toFixed(2) })}</small>
                        </div>
                    </div>
                    <div className='warning'>
                        {localize('Martingale sequence of {{count}} trades: base ${{base}}, multiplier {{mult}}x.', {
                            count: tradesCount,
                            base: baseStake.toFixed(2),
                            mult: multiplier,
                        })}{' '}
                        {isBalanceInsufficient
                            ? localize('⚠️ Balance insufficient for full sequence!')
                            : localize('✅ Balance covers full sequence.')}{' '}
                        {localize('Live payout multiplier: {{payout}}x for $1 stake.', {
                            payout: effectivePayoutMultiplier.toFixed(2),
                        })}{' '}
                        {applyFee && localize('3% markup applied (your fee).')}
                    </div>
                </div>
                {/* Footnote removed */}
                
                <div className='risk-calculator-results-placeholder'></div>
            </div>
        </div>

    );
});


export default RiskCalculator;
