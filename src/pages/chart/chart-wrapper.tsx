import React, { useState, Suspense, lazy } from 'react';
import { observer } from 'mobx-react-lite';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/hooks/useStore';
import ChunkLoader from '@/components/loader/chunk-loader';
import { localize } from '@deriv-com/translations';
import Chart from './chart';
import ChartToggle from './chart-toggle';
import './chart.scss';

const TradingView = lazy(() => import('../tradingview'));

interface ChartWrapperProps {
    prefix?: string;
    show_digits_stats: boolean;
}

const ChartWrapper = observer(({ prefix = 'chart', show_digits_stats }: ChartWrapperProps) => {
    const { client } = useStore();
    const [uuid] = useState(uuidv4());
    const [active_chart, setActiveChart] = useState<'chart' | 'tradingview'>('chart');

    const uniqueKey = client.loginid ? `${prefix}-${client.loginid}` : `${prefix}-${uuid}`;

    return (
        <div className="chart-wrapper-container" style={{ position: 'relative', height: '100%', width: '100%' }}>
            <ChartToggle active_chart={active_chart} onToggle={setActiveChart} />
            {active_chart === 'chart' ? (
                <Chart key={uniqueKey} show_digits_stats={show_digits_stats} />
            ) : (
                <Suspense fallback={<ChunkLoader message={localize('Please wait, loading TradingView...')} />}>
                    <TradingView />
                </Suspense>
            )}
        </div>
    );
});

export default ChartWrapper;
