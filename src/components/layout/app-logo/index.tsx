import { useState } from 'react';
import { useDevice } from '@deriv-com/ui';
import { LegacyMenuHamburger1pxIcon } from '@deriv/quill-icons/Legacy';
// Custom icons to match uploaded images exactly
import { useTranslations } from '@deriv-com/translations';
import FollowUsModal from '@/components/follow-us-modal/follow-us-modal';
import './app-logo.scss';

// Menu Icon for mobile/tablet
const MenuIcon = ({ onClick }: { onClick: () => void }) => (
    <button
        className='app-header__menu-icon-button'
        onClick={onClick}
        type='button'
        aria-label='Open menu'
    >
        <LegacyMenuHamburger1pxIcon iconSize='sm' fill='var(--text-general)' />
    </button>
);

export const AppLogo = ({ onMenuClick }: { onMenuClick?: () => void }) => {
    const { isDesktop } = useDevice();
    const { localize } = useTranslations();
    const [is_follow_modal_visible, setFollowModalVisible] = useState(false);

    // Header icons handlers
    const handleMessageClick = () => {
        setFollowModalVisible(true);
    };

    const handleRefreshClick = () => {
        window.location.reload();
    };

    return (
        <div className='app-header__logo-container'>
            {/* On mobile/tablet: Menu icon takes the place of Deriv logo */}
            {onMenuClick && (
                <MenuIcon onClick={onMenuClick} />
            )}

            <div className='app-header__loco-logo'>
                <img src='/loco_logo.png' alt='LOCO Logo' />
            </div>
            <div className='app-header__trader-name'>
                <span>LOCO THE TRADER</span>
                <div className='app-header__chat-icon' onClick={handleMessageClick}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16ZM7 9H9V11H7V9ZM11 9H13V11H11V9ZM15 9H17V11H15V9Z" fill="#00a8ff"/>
                    </svg>
                </div>
            </div>
            <FollowUsModal 
                is_visible={is_follow_modal_visible} 
                onClose={() => setFollowModalVisible(false)} 
            />
        </div>
    );
};
