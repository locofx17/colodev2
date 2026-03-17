import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';

const TradingView: React.FC = observer(() => {
    const { ui } = useStore();
    const theme = ui.is_dark_mode_on ? 'dark' : 'light';

    return (
        <IframeWrapper
            src={`https://charts.deriv.com/deriv?theme=${theme}`}
            title='TradingView Charts'
            className='tradingview-container'
        />
    );
});

export default TradingView;
