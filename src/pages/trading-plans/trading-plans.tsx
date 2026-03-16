import React, { Suspense, lazy, useState } from 'react';
import ChunkLoader from '@/components/loader/chunk-loader';
import { localize } from '@deriv-com/translations';
import './trading-plans.scss';

const RiskCalculator = lazy(() => import('../risk-calculator'));
const Plan = lazy(() => import('../plan'));

const TRADING_PLAN_SUBTABS = [
    { id: 'risk-calculator', label: 'Risk Calculator' },
    { id: 'plans', label: 'Plans' },
] as const;

type TSubTab = (typeof TRADING_PLAN_SUBTABS)[number]['id'];

const TradingPlans: React.FC = () => {
    const [active_sub_tab, setActiveSubTab] = useState<TSubTab>('risk-calculator');

    return (
        <div className='trading-plans'>
            <div className='trading-plans__subtab-bar'>
                {TRADING_PLAN_SUBTABS.map(tab => (
                    <button
                        key={tab.id}
                        id={`id-trading-plans-${tab.id}`}
                        className={`trading-plans__subtab-btn${active_sub_tab === tab.id ? ' trading-plans__subtab-btn--active' : ''}`}
                        onClick={() => setActiveSubTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className='trading-plans__content'>
                {active_sub_tab === 'risk-calculator' && (
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Risk Calculator...')} />}>
                        <RiskCalculator />
                    </Suspense>
                )}
                {active_sub_tab === 'plans' && (
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Plans...')} />}>
                        <Plan />
                    </Suspense>
                )}
            </div>
        </div>
    );
};

export default TradingPlans;
