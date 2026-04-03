import { observer } from 'mobx-react-lite';

import { useStore } from '@/hooks/useStore';
import { AccountSwitcherWalletItem } from './account-switcher-wallet-item';
import './account-switcher-wallet-list.scss';

type TAccountSwitcherWalletListProps = {
    wallets: any[];
    closeAccountsDialog: () => void;
};

export const AccountSwitcherWalletList = observer(({ wallets, closeAccountsDialog }: TAccountSwitcherWalletListProps) => {
    const { pro_mode } = useStore();
    const { is_pro_mode, pro_mode_view } = pro_mode;

    const filteredWallets = wallets.filter(account => {
        if (account.is_dtrader_account_disabled) return false;
        
        if (is_pro_mode) {
            const is_virtual_masked = !!account.is_virtual || account.dtrade_loginid?.toString()?.startsWith('VR');
            const is_real = !is_virtual_masked;
            
            if (pro_mode_view === 'real') {
                // Show all Real accounts plus the Virtual account (which will be masked)
                return is_real || is_virtual_masked;
            } else {
                // Only show the Virtual account when in Demo view
                return is_virtual_masked;
            }
        }
        return true;
    });

    const sortedWallets = [...filteredWallets].sort((a, b) => {

        // Remove commas from balance strings before converting to numbers
        const balanceA = Number(a.dtrade_balance.toString().replace(/,/g, ''));
        const balanceB = Number(b.dtrade_balance.toString().replace(/,/g, ''));
        return balanceB - balanceA;
    });
    return (
        <div className='account-switcher-wallet-list'>
            {sortedWallets?.map(account => {
                if (account.is_dtrader_account_disabled) return null;
                return (
                    <AccountSwitcherWalletItem
                        key={account.dtrade_loginid}
                        account={account}
                        closeAccountsDialog={closeAccountsDialog}
                        show_badge={account?.is_virtual}
                    />
                );
            })}
        </div>
    );
});

