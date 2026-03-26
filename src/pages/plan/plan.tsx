import React, { useState, useEffect } from 'react';
import { Localize } from '@deriv-com/translations';
import './plan.scss';

interface PlanRecord {
    day: number;
    session: number;
    startBal: number;
    endBal: number;
    sessionGain: number;
    cumRoi: number;
}

interface PlanData {
    start: number;
    records: PlanRecord[];
    finalBal: number;
    totalProfitVal: number;
    totalROIVal: number;
    dailyAvgVal: number;
    days: number;
    sessions: number;
}

const Plan: React.FC = () => {
    const [startCapital, setStartCapital] = useState(5000);
    const [calculationMode, setCalculationMode] = useState<'percent' | 'fixed'>('percent');
    const [targetValue, setTargetValue] = useState(3.0);
    const [tradingDays, setTradingDays] = useState(20);
    const [sessionsPerDay, setSessionsPerDay] = useState(1);
    const [planData, setPlanData] = useState<PlanData | null>(null);

    useEffect(() => {
        // Ensure we start at the top so inputs are visible
        window.scrollTo(0, 0);
        const wrapper = document.querySelector('.plan-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }, []);

    const updateTargetDisplay = (mode: 'percent' | 'fixed') => {
        if (mode === 'percent') {
            setTargetValue(3.0);
        } else {
            setTargetValue(150);
        }
    };

    const handleModeChange = (mode: 'percent' | 'fixed') => {
        setCalculationMode(mode);
        updateTargetDisplay(mode);
    };

    const computePlan = (): PlanData => {
        const start = startCapital;
        const days = tradingDays;
        const sessions = sessionsPerDay;
        const records: PlanRecord[] = [];

        let balance = start;
        let finalBal = start;
        let totalProfitVal = 0;
        let totalROIVal = 0;
        let dailyAvgVal = 0;

        if (calculationMode === 'percent') {
            const dailyFactor = 1 + targetValue / 100;
            const sessionFactor = Math.pow(dailyFactor, 1 / sessions);

            for (let d = 1; d <= days; d++) {
                for (let s = 1; s <= sessions; s++) {
                    const startBal = balance;
                    balance = balance * sessionFactor;
                    const sessionGain = (sessionFactor - 1) * 100;
                    const cumRoi = ((balance - start) / start) * 100;
                    records.push({
                        day: d,
                        session: s,
                        startBal,
                        endBal: balance,
                        sessionGain,
                        cumRoi,
                    });
                }
            }
        } else {
            const perSessionIncrement = targetValue / sessions;
            for (let d = 1; d <= days; d++) {
                for (let s = 1; s <= sessions; s++) {
                    const startBal = balance;
                    balance = balance + perSessionIncrement;
                    const sessionGainPercent = (perSessionIncrement / startBal) * 100;
                    const cumRoi = ((balance - start) / start) * 100;
                    records.push({
                        day: d,
                        session: s,
                        startBal,
                        endBal: balance,
                        sessionGain: sessionGainPercent,
                        cumRoi,
                    });
                }
            }
        }

        finalBal = balance;
        totalProfitVal = finalBal - start;
        totalROIVal = (totalProfitVal / start) * 100;
        dailyAvgVal = totalProfitVal / days;

        return { start, records, finalBal, totalProfitVal, totalROIVal, dailyAvgVal, days, sessions };
    };

    const handleGenerate = () => {
        const data = computePlan();
        setPlanData(data);
    };

    useEffect(() => {
        handleGenerate();
    }, [startCapital, calculationMode, targetValue, tradingDays, sessionsPerDay]);

    const exportToPDF = () => {
        window.print();
    };

    const exportToWord = () => {
        const header = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Trading Plan Report</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                    h1 { color: #1f4f7a; border-bottom: 2px solid #1f4f7a; padding-bottom: 10px; }
                    h2 { color: #1f4f7a; margin-top: 20px; }
                    .param-row { margin-bottom: 5px; font-size: 14px; }
                    .summary-box { background: #f4f4f4; padding: 15px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #ddd; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th { background-color: #1f4f7a; color: white; }
                    .positive { color: #2e7d32; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>Trading Plan Report</h1>
                
                <div class="summary-box">
                    <h2>Trading Parameters</h2>
                    <div class="param-row"><b>Starting Capital:</b> $${startCapital.toFixed(2)}</div>
                    <div class="param-row"><b>Calculation Mode:</b> ${calculationMode === 'percent' ? 'Daily Gain %' : 'Fixed Daily $'}</div>
                    <div class="param-row"><b>Target:</b> ${targetValue}${calculationMode === 'percent' ? '%' : '$'}</div>
                    <div class="param-row"><b>Trading Days:</b> ${tradingDays}</div>
                    <div class="param-row"><b>Sessions per Day:</b> ${sessionsPerDay}</div>
                </div>

                ${
                    planData
                        ? `
                <div class="summary-box">
                    <h2>Performance Summary</h2>
                    <div class="param-row"><b>Final Balance:</b> $${planData.finalBal.toFixed(2)}</div>
                    <div class="param-row"><b>Total Profit:</b> <span class="positive">+$${planData.totalProfitVal.toFixed(2)}</span></div>
                    <div class="param-row"><b>Total ROI:</b> ${planData.totalROIVal.toFixed(2)}%</div>
                    <div class="param-row"><b>Daily Average:</b> $${planData.dailyAvgVal.toFixed(2)}</div>
                </div>

                <h2>Trading Plan Details</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Day / Session</th>
                            <th>Starting Balance</th>
                            <th>ROI %</th>
                            <th>Ending Balance</th>
                            <th>Cumulative ROI</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${planData.records
                            .map(rec => {
                                const sessionInfo = [
                                    { label: 'Morning', emoji: '🌅' },
                                    { label: 'Daytime', emoji: '☀️' },
                                    { label: 'Night', emoji: '🌙' },
                                ][rec.session - 1];
                                return `
                            <tr>
                                <td>Day ${rec.day}${planData.sessions > 1 ? ` · S${rec.session} ${sessionInfo.emoji} ${sessionInfo.label}` : ''}</td>
                                <td>$${rec.startBal.toFixed(2)}</td>
                                <td>${rec.sessionGain.toFixed(2)}%</td>
                                <td>$${rec.endBal.toFixed(2)}</td>
                                <td>${rec.cumRoi.toFixed(2)}%</td>
                            </tr>
                            `;
                            })
                            .join('')}
                    </tbody>
                </table>
                `
                        : '<p>No data generated yet.</p>'
                }
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', header], {
            type: 'application/msword',
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Trading_Plan_Full_Report.doc';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className='plan-wrapper'>
            <div className='plan-container'>
                {/* ===== TRADING PARAMETERS ===== */}
                <div className='section'>
                    <div className='section-header'>
                        <i className='fas fa-chart-line'></i>
                        <h2>
                            <Localize i18n_default_text='Trading Parameters' />
                        </h2>
                    </div>

                    <div className='param-row'>
                        <span className='param-label'>
                            <i className='fas fa-coins'></i> <Localize i18n_default_text='Starting Capital ($)' />
                        </span>
                        <div className='param-value'>
                            <span>$</span>
                            <input
                                type='number'
                                value={startCapital}
                                onChange={e => setStartCapital(parseFloat(e.target.value) || 0)}
                                step='100'
                                min='100'
                            />
                        </div>
                    </div>

                    <div className='param-row'>
                        <span className='param-label'>
                            <i className='fas fa-calculator'></i> <Localize i18n_default_text='Calculation Mode' />
                        </span>
                        <div className='calc-mode-toggle'>
                            <div
                                className={`mode-option ${calculationMode === 'percent' ? 'active' : ''}`}
                                onClick={() => handleModeChange('percent')}
                            >
                                <i className='fas fa-percent'></i> <Localize i18n_default_text='Daily Gain %' />
                            </div>
                            <div
                                className={`mode-option ${calculationMode === 'fixed' ? 'active' : ''}`}
                                onClick={() => handleModeChange('fixed')}
                            >
                                <i className='fas fa-dollar-sign'></i> <Localize i18n_default_text='Fixed Daily $' />
                            </div>
                        </div>
                    </div>

                    <div className='param-row'>
                        <span className='param-label'>
                            <i className='fas fa-bullseye'></i>
                            {calculationMode === 'percent' ? (
                                <Localize i18n_default_text='↑ Daily Gain Target (%)' />
                            ) : (
                                <Localize i18n_default_text='↑ Fixed Daily Target ($)' />
                            )}
                        </span>
                        <div className='daily-target-wrapper'>
                            <div className='target-input-group'>
                                <input
                                    type='number'
                                    value={targetValue}
                                    onChange={e => setTargetValue(parseFloat(e.target.value) || 0)}
                                    step={calculationMode === 'percent' ? '0.1' : '1'}
                                    min='0.1'
                                />
                                <span>{calculationMode === 'percent' ? '%' : '$'}</span>
                            </div>
                            <span className='percent-sign'>
                                <i
                                    className={`fas ${calculationMode === 'percent' ? 'fa-percent' : 'fa-dollar-sign'}`}
                                ></i>
                            </span>
                        </div>
                    </div>

                    <div className='param-row'>
                        <span className='param-label'>
                            <i className='fas fa-calendar-alt'></i> <Localize i18n_default_text='Trading Days' />
                        </span>
                        <div className='param-value'>
                            <input
                                type='number'
                                value={tradingDays}
                                onChange={e => setTradingDays(parseInt(e.target.value) || 0)}
                                step='1'
                                min='1'
                                max='100'
                            />
                        </div>
                    </div>

                    <div className='sessions-title'>
                        <i className='fas fa-clock'></i> <Localize i18n_default_text='SESSIONS PER DAY' />
                    </div>
                    <div className='session-options'>
                        {[
                            { val: 1, label: 'Morning', emoji: '🌅' },
                            { val: 2, label: 'Daytime', emoji: '☀️' },
                            { val: 3, label: 'Night', emoji: '🌙' },
                        ].map(session => (
                            <div
                                key={session.val}
                                className={`session-btn ${sessionsPerDay === session.val ? 'active' : ''}`}
                                onClick={() => setSessionsPerDay(session.val)}
                            >
                                <span>
                                    {session.val}. <Localize i18n_default_text={session.label} /> {session.emoji}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className='action-buttons'>
                        <button className='btn-primary' onClick={handleGenerate}>
                            <Localize i18n_default_text='Generate Plan' />
                        </button>
                    </div>
                </div>

                {/* ===== PERFORMANCE SUMMARY ===== */}
                {planData && (
                    <div className='section'>
                        <div className='section-header'>
                            <i className='fas fa-star'></i>
                            <h2>
                                <Localize i18n_default_text='Performance Summary' />
                            </h2>
                        </div>
                        <div className='summary-grid'>
                            <div className='summary-item'>
                                <span className='summary-label'>
                                    <Localize i18n_default_text='Final Balance' />
                                </span>
                                <span className='summary-value'>${planData.finalBal.toFixed(2)}</span>
                            </div>
                            <div className='summary-item'>
                                <span className='summary-label'>
                                    <Localize i18n_default_text='Total Profit' />
                                </span>
                                <span className='summary-value positive'>+${planData.totalProfitVal.toFixed(2)}</span>
                            </div>
                            <div className='summary-item'>
                                <span className='summary-label'>
                                    <Localize i18n_default_text='Total ROI' />
                                </span>
                                <span className='summary-value'>{planData.totalROIVal.toFixed(2)}%</span>
                            </div>
                            <div className='summary-item'>
                                <span className='summary-label'>
                                    <Localize i18n_default_text='Daily Average' />
                                </span>
                                <span className='summary-value'>${planData.dailyAvgVal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== TRADING PLAN DETAILS ===== */}
                {planData && (
                    <div className='section'>
                        <div className='details-header'>
                            <h3>
                                <span>
                                    <Localize
                                        i18n_default_text='Trading Plan Details ({{sessions}} Session{{plural}})'
                                        values={{
                                            sessions: planData.sessions,
                                            plural: planData.sessions > 1 ? 's' : '',
                                        }}
                                    />
                                </span>
                            </h3>
                        </div>
                        <div className='plan-table-container'>
                            <table className='plan-table'>
                                <thead>
                                    <tr>
                                        <th>
                                            <Localize i18n_default_text='Day / Session' />
                                        </th>
                                        <th>
                                            <Localize i18n_default_text='Start Balance' />
                                        </th>
                                        <th>
                                            <Localize i18n_default_text='ROI %' />
                                        </th>
                                        <th>
                                            <Localize i18n_default_text='End Balance' />
                                        </th>
                                        <th>
                                            <Localize i18n_default_text='Cumulative ROI' />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {planData.records.map((rec, idx) => {
                                        const sessionInfo = [
                                            { label: 'Morning', emoji: '🌅' },
                                            { label: 'Daytime', emoji: '☀️' },
                                            { label: 'Night', emoji: '🌙' },
                                        ][rec.session - 1];

                                        return (
                                            <tr key={idx}>
                                                <td>
                                                    <span className='day-val'>Day {rec.day}</span>
                                                    {planData.sessions > 1 && (
                                                        <span className='session-val-extra'>
                                                            S{rec.session} {sessionInfo.emoji}{' '}
                                                            <Localize i18n_default_text={sessionInfo.label} />
                                                        </span>
                                                    )}
                                                </td>
                                                <td>${rec.startBal.toFixed(2)}</td>
                                                <td className='roi-val'>{rec.sessionGain.toFixed(2)}%</td>
                                                <td className='end-bal-val'>${rec.endBal.toFixed(2)}</td>
                                                <td>{rec.cumRoi.toFixed(2)}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===== EXPORT & PROFIT ===== */}
                <div className='export-controls'>
                    <div className='export-section pdf' onClick={exportToPDF}>
                        <h2>
                            <i className='fas fa-file-pdf'></i> <Localize i18n_default_text='Download to PDF' />
                        </h2>
                    </div>
                    <div className='export-section word' onClick={exportToWord}>
                        <h2>
                            <i className='fas fa-file-word'></i> <Localize i18n_default_text='Download to Word' />
                        </h2>
                        <div className='pdf-badge'>
                            <Localize i18n_default_text='DOWNLOAD' />
                        </div>
                    </div>
                </div>

                {planData && (
                    <div className='profit-footer'>
                        <span>
                            <Localize
                                i18n_default_text='Profit +${{profit}}'
                                values={{ profit: planData.totalProfitVal.toFixed(2) }}
                            />
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Plan;
