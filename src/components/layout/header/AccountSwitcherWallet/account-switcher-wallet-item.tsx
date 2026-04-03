import classNames from 'classnames';


import { observer } from 'mobx-react-lite';

import { formatMoney, getCurrencyDisplayCode } from '@/components/shared';
import { AppLinkedWithWalletIcon } from '@/components/shared_ui/app-linked-with-wallet-icon';
import Text from '@/components/shared_ui/text';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import useStoreWalletAccountsList from '@/hooks/useStoreWalletAccountsList';
import { Localize } from '@deriv-com/translations';
import WalletBadge from '../wallets/wallet-badge';
import './account-switcher-wallet-item.scss';

type TAccountSwitcherWalletItemProps = {
    account: Exclude<ReturnType<typeof useStoreWalletAccountsList>['data'], undefined>[number];
    closeAccountsDialog: () => void;
    show_badge?: boolean;
};

export const AccountSwitcherWalletItem = observer(
    ({ closeAccountsDialog, account, show_badge = false }: TAccountSwitcherWalletItemProps) => {
        const {
            currency,
            dtrade_loginid,
            dtrade_balance,
            gradients,
            icons,
            is_virtual,
            landing_company_name,
            icon_type,
        } = account;

        const {
            ui: { is_dark_mode_on },
            client: { loginid: active_loginid, is_eu },
            pro_mode: { is_pro_mode, pro_mode_view, MASKED_ID, MASKED_NAME, BASE_BALANCE },
        } = useStore();


        const theme = is_dark_mode_on ? 'dark' : 'light';
        const app_icon = is_dark_mode_on ? 'IcWalletOptionsDark' : 'IcWalletOptionsLight';
        
        // Apply Masking Logic - Strictly target any virtual account (prefix VR)
        const is_target_account = !!is_virtual || dtrade_loginid?.toString()?.startsWith('VR');
        const is_real_account = dtrade_loginid?.toString()?.startsWith('CR') && !dtrade_loginid?.toString()?.startsWith('CRW');
        const should_mask = is_pro_mode && is_target_account && !is_real_account;
        
        let display_balance = dtrade_balance || 0;
        if (should_mask) {
            if (pro_mode_view === 'real') {
                display_balance = Math.max(0, Number(dtrade_balance) - BASE_BALANCE);
            } else {
                display_balance = Math.min(Number(dtrade_balance), BASE_BALANCE);
            }
        }

        const is_dtrade_active = dtrade_loginid === active_loginid;



        const switchAccount = async (loginId: number) => {
            const account_list = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
            const token = account_list[loginId];

            // If token is missing, store the currency in session storage and return
            if (!token) {
                // Store the currency in session storage
                if (currency) {
                    sessionStorage.setItem('query_param_currency', currency);
                }

                // Set clientHasCurrency to false
                if (typeof (window as any).setClientHasCurrency === 'function') {
                    (window as any).setClientHasCurrency(false);
                }
                return;
            }

            localStorage.setItem('authToken', token);
            localStorage.setItem('active_loginid', loginId.toString());
            await api_base?.init(true);
            closeAccountsDialog();

            const client_accounts = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
            const search_params = new URLSearchParams(window.location.search);
            const selected_account = Object.values(client_accounts)?.find(
                (acc: any) => acc.loginid === loginId.toString()
            ) as { currency?: string; loginid: string } | undefined;
            if (!selected_account) return;
            const account_param = is_virtual ? 'demo' : (selected_account.currency || '');

            search_params.set('account', account_param);

            window.history.pushState({}, '', `${window.location.pathname}?${search_params.toString()}`);
        };

        return (
            <div
                className={classNames('acc-switcher-wallet-item__container', {
                    'acc-switcher-wallet-item__container--active': is_dtrade_active,
                })}
                data-testid='account-switcher-wallet-item'
                onClick={() => switchAccount(dtrade_loginid)}
                role='button'
            >
                <div>
                    <AppLinkedWithWalletIcon
                        app_icon={app_icon}
                        gradient_class={gradients?.card[theme] ?? ''}
                        type={icon_type}
                        wallet_icon={icons?.[theme] ?? ''}
                        hide_watermark
                    />
                </div>
                <div className='acc-switcher-wallet-item__content'>
                    <Text size='xxxs'>
                        {is_eu ? (
                            <Localize i18n_default_text='Multipliers' />
                        ) : (
                            <Localize i18n_default_text='Options' />
                        )}
                    </Text>
                    <Text size='xxxs'>
                        {should_mask && pro_mode_view === 'real' ? (
                            <Localize i18n_default_text='{{name}} ({{id}})' values={{ name: MASKED_NAME, id: MASKED_ID }} />
                        ) : is_virtual ? (
                            <Localize i18n_default_text='Demo Wallet' />
                        ) : (
                            <Localize
                                i18n_default_text='{{currency}} Wallet'
                                values={{ currency: getCurrencyDisplayCode(currency) }}
                            />
                        )}
                    </Text>


                    <Text size='xs' weight='bold'>
                        {`${formatMoney(currency ?? '', display_balance, true)} ${
                            should_mask && pro_mode_view === 'real' ? 'USD' : getCurrencyDisplayCode(currency)
                        }`}
                    </Text>

                </div>
                {show_badge && (
                    <WalletBadge
                        is_demo={(should_mask && pro_mode_view === 'real' ? undefined : (Boolean(is_virtual) ? 'demo' : undefined)) as any}
                        label={(should_mask && pro_mode_view === 'real' ? MASKED_NAME : landing_company_name) || ''}
                    />
                )}




            </div>
        );
    }
);
