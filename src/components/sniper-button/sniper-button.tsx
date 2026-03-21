import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import './sniper-button.scss';

const SniperButton = observer(() => {
    const { dashboard } = useStore();
    const { setSniperModalVisibility, is_sniper_modal_visible } = dashboard;

    if (is_sniper_modal_visible) return null;

    const handleClick = () => {
        setSniperModalVisibility(true);
    };

    return (
        <div className='sniper-button' onClick={handleClick}>
            <div className='sniper-button__circle'>
                <div className='sniper-button__status' />
                <span className='sniper-button__text'>Ai</span>
            </div>
            <div className='sniper-button__label'>SNIPER</div>
        </div>
    );
});

export default SniperButton;
