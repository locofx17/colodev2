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
            const is_target = account.is_virtual;
            if (pro_mode_view === 'real') {
                return !account.is_virtual || is_target;
            } else {
                return account.is_virtual;
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

