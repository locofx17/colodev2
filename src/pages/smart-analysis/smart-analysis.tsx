import React, { Suspense, lazy, useState } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import { localize } from '@deriv-com/translations';
import Div100vhContainer from '@/components/shared_ui/div100vh-container';
import './smart-analysis.scss';

const SmartTrader = lazy(() => import('../smart-trader'));
const AnalysisTool = lazy(() => import('../analysis-tool'));
const Signals = lazy(() => import('../signals'));

const SMART_ANALYSIS_SUBTABS = [
    { id: 'smart-trader', label: 'Smart Trader' },
    { id: 'analysis-tool', label: 'Analysis Tool' },
    { id: 'signals', label: 'Signals' },
] as const;

type TSubTab = (typeof SMART_ANALYSIS_SUBTABS)[number]['id'];

const SmartAnalysis: React.FC = () => {
    const [active_sub_tab, setActiveSubTab] = useState<TSubTab>('smart-trader');

    return (
        <Div100vhContainer className='smart-analysis' height_offset='260px'>
            <div className='smart-analysis__subtab-bar'>
                {SMART_ANALYSIS_SUBTABS.map(tab => (
                    <button
                        key={tab.id}
                        id={`id-smart-analysis-${tab.id}`}
                        className={`smart-analysis__subtab-btn${active_sub_tab === tab.id ? ' smart-analysis__subtab-btn--active' : ''}`}
                        onClick={() => setActiveSubTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className='smart-analysis__content'>
                {active_sub_tab === 'smart-trader' && (
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Smart Trader...')} />}>
                        <SmartTrader />
                    </Suspense>
                )}
                {active_sub_tab === 'analysis-tool' && (
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Analysis Tool...')} />}>
                        <AnalysisTool />
                    </Suspense>
                )}
                {active_sub_tab === 'signals' && (
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Signals...')} />}>
                        <Signals />
                    </Suspense>
                )}
            </div>
        </Div100vhContainer>
    );
};

export default SmartAnalysis;
