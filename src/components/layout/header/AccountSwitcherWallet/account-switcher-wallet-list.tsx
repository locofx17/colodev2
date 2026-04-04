import { observer } from 'mobx-react-lite';

import { useStore } from '@/hooks/useStore';
import { AccountSwitcherWalletItem } from './account-switcher-wallet-item';
import './account-switcher-wallet-list.scss';

type TAccountSwitcherWalletListProps = {
    wallets: any[];
    closeAccountsDialog: () => void;
};

export const AccountSwitcherWalletList = observer(({ wallets, closeAccountsDialog }: TAccountSwitcherWalletListProps) => {
    const filteredWallets = wallets.filter(account => !account.is_dtrader_account_disabled);

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

