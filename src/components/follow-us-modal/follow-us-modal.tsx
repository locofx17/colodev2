import React from 'react';
import classNames from 'classnames';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import './follow-us-modal.scss';

type TFollowUsModalProps = {
    is_visible: boolean;
    onClose: () => void;
};

const social_links = [
    {
        name: 'WhatsApp Group',
        icon: (
            <svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                    d='M12.004 2C6.48 2 2.004 6.48 2.004 12C2.004 13.76 2.468 15.42 3.28 16.86L2.004 22L7.308 20.72C8.688 21.54 10.3 22 12.004 22C17.528 22 22.004 17.52 22.004 12C22.004 6.48 17.528 2 12.004 2ZM17.152 16.48C16.94 17.08 16.128 17.62 15.524 17.78C14.988 17.92 14.304 18.02 11.936 17.04C8.92 15.8 6.972 12.74 6.82 12.54C6.672 12.34 5.568 10.88 5.568 9.36C5.568 7.84 6.34 7.1 6.64 6.78C6.884 6.54 7.288 6.42 7.684 6.42C7.812 6.42 7.928 6.42 8.032 6.43C8.332 6.44 8.484 6.46 8.68 6.94C8.928 7.54 9.536 9.03 9.612 9.18C9.688 9.33 9.764 9.53 9.664 9.73C9.564 9.93 9.488 10.02 9.336 10.2C9.184 10.38 9.044 10.51 8.892 10.7C8.752 10.86 8.596 11.03 8.764 11.33C8.932 11.63 9.516 12.58 10.384 13.35C11.504 14.35 12.428 14.67 12.748 14.8C13.068 14.93 13.256 14.9 13.436 14.7C13.616 14.5 14.216 13.8 14.416 13.5C14.616 13.2 14.816 13.25 15.088 13.35C15.36 13.45 16.816 14.17 17.112 14.32C17.408 14.47 17.608 14.55 17.68 14.67C17.752 14.8 17.752 15.42 17.152 16.48Z'
                    fill='#25D366'
                />
            </svg>
        ),
        url: 'https://chat.whatsapp.com/LvAW1tmssZgAqmSffDm61e?mode=gi_t',
    },
    {
        name: 'Telegram',
        icon: (
            <svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                    d='M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.45 15.83 14.32 15.5 16.12C15.36 16.88 15.08 17.14 14.81 17.16C14.22 17.22 13.77 16.78 13.2 16.41C12.31 15.83 11.81 15.47 10.95 14.9C9.96 14.24 10.6 13.88 11.17 13.29C11.32 13.14 13.87 10.82 13.92 10.6C13.93 10.57 13.93 10.45 13.86 10.39C13.79 10.33 13.69 10.35 13.61 10.37C13.51 10.39 12.02 11.38 9.13 13.33C8.71 13.62 8.32 13.76 7.98 13.75C7.6 13.74 6.87 13.54 6.33 13.36C5.66 13.14 5.13 13.03 5.18 12.66C5.2 12.47 5.46 12.27 5.96 12.07C9.05 10.72 11.11 9.82 12.14 9.39C15.08 8.16 15.7 7.95 16.1 7.95C16.18 7.95 16.37 7.97 16.5 8.07C16.61 8.16 16.64 8.3 16.65 8.41C16.65 8.52 16.65 8.68 16.64 8.8Z'
                    fill='#0088CC'
                />
            </svg>
        ),
        url: 'https://t.me/SebastianBlood_tradinghub',
    },
    {
        name: 'YouTube',
        icon: (
            <svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                    d='M21.8 8C21.7 6.7 21.2 5.7 20.3 4.8C19 3.5 17.1 3.2 12 3.2C6.9 3.2 5 3.5 3.7 4.8C2.8 5.7 2.3 6.7 2.2 8C2.1 9.3 2 10.7 2 12C2 13.3 2.1 14.7 2.2 16C2.3 17.3 2.8 18.3 3.7 19.2C5 20.5 6.9 20.8 12 20.8C17.1 20.8 19 20.5 20.3 19.2C21.2 18.3 21.7 17.3 21.8 16C21.9 14.7 22 13.3 22 12C22 10.7 21.9 9.3 21.8 8ZM10 15V9L15.3 12L10 15Z'
                    fill='#FF0000'
                />
            </svg>
        ),
        url: 'https://www.youtube.com/@SebastianBlood',
    },
    {
        name: 'TikTok',
        icon: (
            <svg width='32' height='32' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                    d='M19.59 6.69C18.35 6.69 17.11 6.26 16.14 5.42C16.03 5.33 15.93 5.23 15.83 5.12V13.33C15.83 16.18 13.51 18.49 10.64 18.49C7.77 18.49 5.45 16.18 5.45 13.33C5.45 10.48 7.77 8.16 10.64 8.16C10.87 8.16 11.08 8.18 11.29 8.21V11.2C11.08 11.16 10.86 11.14 10.64 11.14C9.42 11.14 8.42 12.13 8.42 13.33C8.42 14.53 9.42 15.52 10.64 15.52C11.86 15.52 12.86 14.53 12.86 13.33V2C14.88 2 15.83 3.53 15.83 3.53C16.89 4.88 18.47 5.75 20.28 5.75V8.67C19.81 8.67 19.34 8.58 18.9 8.39V8.67C18.9 8.68 18.89 8.68 18.89 8.69H19.59V6.69Z'
                    fill='#EE1D52'
                />
                <path d='M15.83 5.12V3.53C15.83 3.53 14.88 2 12.86 2V5.12H15.83Z' fill='#69C9D0' />
                <path
                    d='M10.64 8.16C7.77 8.16 5.45 10.48 5.45 13.33C5.45 16.18 7.77 18.49 10.64 18.49C13.51 18.49 15.83 16.18 15.83 13.33V11.14C15.83 11.14 14.88 11.14 12.86 11.14V13.33C12.86 14.53 11.86 15.52 10.64 15.52C9.42 15.52 8.42 14.53 8.42 13.33C8.42 12.13 9.42 11.14 10.64 11.14C10.86 11.14 11.08 11.16 11.29 11.2V8.21C11.08 8.18 10.87 8.16 10.64 8.16Z'
                    fill='#000000'
                />
            </svg>
        ),
        url: 'https://www.tiktok.com/@sebastianblood_fx',
    },
];

const FollowUsModal = ({ is_visible, onClose }: TFollowUsModalProps) => {
    if (!is_visible) return null;

    return (
        <div className='follow-us-overlay' onClick={onClose}>
            <div className='follow-us-modal' onClick={e => e.stopPropagation()}>
                <div className='follow-us-modal__header'>
                    <Text as='h2' weight='bold' color='prominent'>
                        Follow Us
                    </Text>
                    <div className='follow-us-modal__close-icon' onClick={onClose}>
                        <LegacyClose1pxIcon height='24px' width='24px' fill='#FFFFFF' />
                    </div>
                </div>
                <div className='follow-us-modal__content'>
                    {social_links.map(link => (
                        <a
                            key={link.name}
                            href={link.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='follow-us-modal__link'
                        >
                            <div className='follow-us-modal__icon'>{link.icon}</div>
                            <Text size='m' weight='bold' color='prominent'>
                                {link.name}
                            </Text>
                        </a>
                    ))}
                </div>
                <div className='follow-us-modal__footer'>
                    <Button onClick={onClose} text='Close' primary className='follow-us-modal__close-button' />
                </div>
            </div>
        </div>
    );
};

export default FollowUsModal;
