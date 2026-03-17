import React from 'react';
import classNames from 'classnames';
import './chart-toggle.scss';

interface ChartToggleProps {
    active_chart: 'chart' | 'tradingview';
    onToggle: (chart: 'chart' | 'tradingview') => void;
}

const ChartToggle: React.FC<ChartToggleProps> = ({ active_chart, onToggle }) => {
    return (
        <div className='chart-toggle'>
            <button
                className={classNames('chart-toggle__button', {
                    'chart-toggle__button--active': active_chart === 'chart',
                })}
                onClick={() => onToggle('chart')}
            >
                CHART
            </button>
            <button
                className={classNames('chart-toggle__button', {
                    'chart-toggle__button--active': active_chart === 'tradingview',
                })}
                onClick={() => onToggle('tradingview')}
            >
                TRADINGVIEW
            </button>
        </div>
    );
};

export default ChartToggle;
