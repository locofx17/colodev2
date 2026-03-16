import React from 'react';
import { useTranslations } from '@deriv-com/translations';
import { Tooltip } from '@deriv-com/ui';
import { Youtube, Music2, MessageCircle, Send } from 'lucide-react';

const SocialLinks = () => {
    const { localize } = useTranslations();

    const socialLinks = [
        {
            name: 'YouTube',
            href: 'https://www.youtube.com/@LocoTradinghub',
            icon: <Youtube size={16} />,
            tooltip: localize('YouTube')
        },
        {
            name: 'TikTok',
            href: 'https://www.tiktok.com/@loco_fx1',
            icon: <Music2 size={16} />,
            tooltip: localize('TikTok')
        },
        {
            name: 'WhatsApp',
            href: 'https://chat.whatsapp.com/LvAW1tmssZgAqmSffDm61e?mode=gi_t',
            icon: <MessageCircle size={16} />,
            tooltip: localize('WhatsApp')
        },
        {
            name: 'Telegram',
            href: 'https://t.me/Loco_tradinghub',
            icon: <Send size={16} />,
            tooltip: localize('Telegram')
        }
    ];

    return (
        <>
            {socialLinks.map((link) => (
                <Tooltip
                    key={link.name}
                    as='a'
                    className='app-footer__icon'
                    href={link.href}
                    target='_blank'
                    tooltipContent={link.tooltip}
                >
                    {link.icon}
                </Tooltip>
            ))}
        </>
    );
};

export default SocialLinks;
