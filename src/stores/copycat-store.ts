import { action, makeObservable, observable, reaction } from 'mobx';
import { DerivAccount, TradeLog } from '../pages/copycat/types';
import { DerivAPI } from '../pages/copycat/services/derivApi';
import { transaction_elements } from '../constants/transactions';
import RootStore from './root-store';

export default class CopycatStore {
    root_store: RootStore;
    
    accounts: DerivAccount[] = [];
    logs: TradeLog[] = [];
    isSyncing = false;
    isReplicating = false;
    sessionPL = 0;

    clientTokenInput = '';
    tokenError = '';

    apiRefs: { [key: string]: DerivAPI } = {};
    copiedTrades = new Set<string>();

    constructor(root_store: RootStore) {
        makeObservable(this, {
            accounts: observable,
            logs: observable,
            isSyncing: observable,
            isReplicating: observable,
            sessionPL: observable,
            clientTokenInput: observable,
            tokenError: observable,

            setAccounts: action,
            setLogs: action,
            setIsSyncing: action,
            setIsReplicating: action,
            setSessionPL: action,
            setClientTokenInput: action,
            setTokenError: action,

            handleAddClientToken: action,
            handleSync: action,
            handleToggleReplication: action,
            removeAccount: action,
            toggleAccount: action,
            clearLogs: action,
            autoLinkMaster: action,
        });

        this.root_store = root_store;

        // Automatically sync WebSockets when accounts become active/inactive
        reaction(
            () => this.accounts.map(a => a.id + a.isActive + a.token).join(','),
            () => {
                const currentIds = this.accounts.filter(a => a.isActive).map(a => a.id);
                
                // Remove inactive or deleted accounts
                Object.keys(this.apiRefs).forEach(id => {
                    if (!currentIds.includes(id)) {
                        this.apiRefs[id].disconnect();
                        delete this.apiRefs[id];
                    }
                });

                // Add new active accounts
                this.accounts.forEach(acc => {
                    if (acc.isActive && !this.apiRefs[acc.id]) {
                        const api = new DerivAPI((data) => this.handleApiMessage(acc.id, data));
                        api.connect().then(() => {
                            api.authorize(acc.token);
                        }).catch(err => {
                            console.error(`Failed to connect account ${acc.name}:`, err);
                            this.setAccounts(this.accounts.map(a => a.id === acc.id ? {
                                ...a,
                                error: 'Connection failed',
                                isActive: false
                            } : a));
                        });
                        this.apiRefs[acc.id] = api;
                    }
                });
            }
        );

        // Auto-link master when user logs in
        reaction(
            () => this.root_store.client.is_logged_in + this.root_store.client.loginid,
            () => {
                this.autoLinkMaster();
            }
        );

        // Observe global transactions to replicate Master trades taken within the app (DCircle, Smart Trader, etc.)
        reaction(
            () => this.root_store.transactions.transactions.length,
            () => {
                if (!this.isReplicating) return;
                
                const masterAccount = this.accounts.find(a => a.type === 'master');
                if (!masterAccount || !masterAccount.isActive) return;

                const lastTrx = this.root_store.transactions.transactions[0];
                if (lastTrx?.type === transaction_elements.CONTRACT && typeof lastTrx.data === 'object') {
                    const contract = lastTrx.data;
                    // Ensure it's an open contract and hasn't been copied yet
                    if (contract.contract_id && !this.copiedTrades.has(String(contract.contract_id))) {
                        this.copiedTrades.add(String(contract.contract_id));
                        this.copyTrade(masterAccount, contract);
                    }
                }
            }
        );
    }

    setAccounts = (accounts: DerivAccount[]) => {
        this.accounts = accounts;
    };

    setLogs = (logs: TradeLog[]) => {
        this.logs = logs;
    };

    setIsSyncing = (isSyncing: boolean) => {
        this.isSyncing = isSyncing;
    };

    setIsReplicating = (isReplicating: boolean) => {
        this.isReplicating = isReplicating;
    };

    setSessionPL = (pl: number) => {
        this.sessionPL = pl;
    };

    setClientTokenInput = (input: string) => {
        this.clientTokenInput = input;
    };

    setTokenError = (error: string) => {
        this.tokenError = error;
    };

    clearLogs = () => {
        this.logs = [];
    };

    autoLinkMaster = () => {
        const { client } = this.root_store;
        if (!client.is_logged_in || !client.loginid) {
            // Unlink master if user logs out
            if (this.accounts.some(a => a.type === 'master')) {
                this.setAccounts(this.accounts.filter(a => a.type !== 'master'));
            }
            return;
        }
        
        const token = client.getToken();
        if (!token) return;

        const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const newAccounts = [...this.accounts];
        let hasChanges = false;

        const existingMasterIndex = newAccounts.findIndex(a => a.type === 'master');
        if (existingMasterIndex === -1 || newAccounts[existingMasterIndex].loginId !== client.loginid) {
            const masterAcc: DerivAccount = {
                id: Math.random().toString(36).substr(2, 9),
                name: client.loginid,
                token,
                type: 'master',
                accountType: client.loginid.startsWith('VRTC') ? 'demo' : 'real',
                balance: 0,
                currency: 'USD',
                loginId: client.loginid,
                isActive: true,
                connectionStatus: 'connecting',
                totalProfit: 0
            };

            if (existingMasterIndex !== -1) {
                newAccounts.splice(existingMasterIndex, 1);
            }
            newAccounts.unshift(masterAcc);
            hasChanges = true;
        }

        if (hasChanges) {
            this.setAccounts(newAccounts);
        }
    };

    handleApiMessage = (accountId: string, data: any) => {
        if (data.msg_type === 'authorize') {
            const auth = data.authorize;
            if (auth) {
                this.setAccounts(this.accounts.map(a => a.id === accountId ? {
                    ...a,
                    balance: auth.balance,
                    currency: auth.currency,
                    loginId: auth.loginid,
                    name: auth.fullname || a.name,
                    accountType: auth.is_virtual ? 'demo' : 'real',
                    connectionStatus: 'connected',
                    error: undefined
                } : a));

                this.apiRefs[accountId]?.subscribeBalance();
                this.apiRefs[accountId]?.send({ proposal_open_contract: 1, subscribe: 1 });
            } else if (data.error) {
                this.setAccounts(this.accounts.map(a => a.id === accountId ? {
                    ...a,
                    error: data.error.message,
                    connectionStatus: 'disconnected',
                    isActive: false
                } : a));
            }
        }

        if (data.msg_type === 'balance') {
            const balance = data.balance;
            if (balance) {
                this.setAccounts(this.accounts.map(a => a.id === accountId ? {
                    ...a,
                    balance: balance.balance,
                    currency: balance.currency
                } : a));
            }
        }

        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            const account = this.accounts.find(a => a.id === accountId);
            
            if (contract.status === 'open' && account?.type === 'master' && this.isReplicating) {
                if (!this.copiedTrades.has(contract.contract_id)) {
                    this.copiedTrades.add(contract.contract_id);
                    this.copyTrade(account, contract);
                }
            }

            if (contract.status === 'won' || contract.status === 'lost') {
                const profit = contract.profit;

                let isNewResolution = false;
                
                this.setLogs(this.logs.map(log => {
                    const isMasterLog = log.masterAccountId === accountId && log.masterTradeId === contract.contract_id;
                    const isCopierLog = log.copierAccountId === accountId && log.copierTradeId === contract.contract_id;
                    
                    if (isMasterLog || isCopierLog) {
                        if (log.status !== 'WON' && log.status !== 'LOST') {
                            isNewResolution = true;
                        }
                        return { 
                            ...log, 
                            status: contract.status.toUpperCase() as 'WON' | 'LOST', 
                            profit: profit 
                        };
                    }
                    return log;
                }));

                // Only add the profit if it hasn't been added yet for this specific copier log
                if (isNewResolution && account?.type === 'copier') {
                    this.setSessionPL(this.sessionPL + profit);
                }

                if (isNewResolution) {
                    this.setAccounts(this.accounts.map(a => a.id === accountId ? {
                        ...a,
                        totalProfit: (a.totalProfit || 0) + profit
                    } : a));
                }
            }
        }

        if (data.msg_type === 'buy') {
            const buy = data.buy;
            if (buy?.contract_id) {
                this.setLogs(this.logs.map(log => 
                    log.copierAccountId === accountId && log.status === 'PENDING' 
                    ? { ...log, status: 'SUCCESS', copierTradeId: buy.contract_id } 
                    : log
                ));
            } else if (data.error) {
                this.setLogs(this.logs.map(log => 
                    log.copierAccountId === accountId && log.status === 'PENDING' 
                    ? { ...log, status: 'FAILED', error: data.error.message } 
                    : log
                ));
            }
        }
    };

    copyTrade = (master: DerivAccount, contract: any) => {
        const copiers = this.accounts.filter(a => a.type === 'copier' && a.isActive);
        
        copiers.forEach(copier => {
            const api = this.apiRefs[copier.id];
            if (api) {
                const symbol = contract.underlying_symbol || contract.underlying;
                const amount = contract.buy_price;
                const type = contract.contract_type;

                const parameters: any = {
                    amount: amount,
                    basis: 'stake',
                    contract_type: type,
                    currency: copier.currency || 'USD',
                    symbol: symbol,
                };
                
                if (contract.duration) parameters.duration = contract.duration;
                if (contract.duration_unit) parameters.duration_unit = contract.duration_unit;
                if (contract.date_expiry) parameters.date_expiry = contract.date_expiry;
                if (contract.barrier) parameters.barrier = contract.barrier;
                if (contract.high_barrier || contract.barrier2) parameters.barrier2 = contract.high_barrier || contract.barrier2;
                if (contract.low_barrier) parameters.barrier = contract.low_barrier;

                api.buy(amount, parameters);
                
                const newLog: TradeLog = {
                    id: Math.random().toString(36).substr(2, 9),
                    masterAccountId: master.id,
                    copierAccountId: copier.id,
                    symbol: symbol,
                    action: type === 'CALL' ? 'BUY' : 'SELL',
                    amount: amount,
                    status: 'PENDING',
                    timestamp: Date.now(),
                    masterTradeId: contract.contract_id
                };
                this.setLogs([newLog, ...this.logs].slice(0, 100));
            }
        });
    };

    handleAddClientToken = () => {
        const token = this.clientTokenInput.trim();
        this.setTokenError('');

        if (!token) {
            this.setTokenError('Please enter a token.');
            return;
        }
        if (token.length < 10) {
            this.setTokenError('Token must be at least 10 characters long.');
            return;
        }
        if (this.accounts.some(a => a.token === token)) {
            this.setTokenError('This token is already added.');
            return;
        }
        
        const id = Math.random().toString(36).substr(2, 9);
        const newAcc: DerivAccount = {
            id,
            name: `Client ${this.accounts.filter(a => a.type === 'copier').length + 1}`,
            token,
            type: 'copier',
            accountType: 'real',
            balance: 0,
            currency: 'USD',
            loginId: 'Connecting...',
            isActive: true,
            connectionStatus: 'connecting',
            totalProfit: 0
        };

        this.setAccounts([...this.accounts, newAcc]);
        this.setClientTokenInput('');
    };

    handleSync = () => {
        this.setIsSyncing(true);
        this.accounts.forEach(acc => {
            if (acc.isActive && this.apiRefs[acc.id]) {
                this.apiRefs[acc.id].authorize(acc.token);
            }
        });
        setTimeout(() => this.setIsSyncing(false), 2000);
    };

    autoLinkCopiers = () => {
        const { client } = this.root_store;
        // ONLY link copiers automatically if we are on a Demo account
        if (!client.loginid || !client.loginid.startsWith('VRTC')) return;
        
        const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
        const newAccounts = [...this.accounts];
        let hasChanges = false;

        // Setup Auto Copiers for other valid accounts automatically
        Object.keys(accountsList).forEach(loginId => {
            if (loginId.startsWith('CR') || loginId.startsWith('VRTC') || loginId.startsWith('MF')) {
                if (loginId !== client.loginid) {
                    if (!newAccounts.some(a => a.loginId === loginId)) {
                        const accToken = accountsList[loginId];
                        const isDemo = loginId.startsWith('VRTC');
                        const copierAcc: DerivAccount = {
                            id: Math.random().toString(36).substr(2, 9),
                            name: `${isDemo ? 'Demo' : 'Real'} ${loginId}`,
                            token: accToken,
                            type: 'copier',
                            accountType: isDemo ? 'demo' : 'real',
                            balance: 0,
                            currency: 'USD',
                            loginId: loginId,
                            isActive: true, // Auto-copier active by default
                            connectionStatus: 'connecting',
                            totalProfit: 0
                        };
                        newAccounts.push(copierAcc);
                        hasChanges = true;
                    }
                }
            }
        });

        if (hasChanges) {
            this.setAccounts(newAccounts);
        }
    };

    handleToggleReplication = () => {
        const next = !this.isReplicating;
        
        if (next) {
            this.autoLinkCopiers();
            this.setIsReplicating(next);
            this.setAccounts(this.accounts.map(a => ({ ...a, isActive: next })));
        } else {
            this.setIsReplicating(next);
            const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
            const autoLoginIds = Object.keys(accountsList);

            // Remove automatically linked copiers when replication is stopped
            const remainingAccounts = this.accounts.filter(a => {
                if (a.type === 'master') return true;
                // If it's a copier and its loginId matches an owned account loginId, remove it
                if (a.loginId && autoLoginIds.includes(a.loginId)) return false;
                return true;
            });

            this.setAccounts(remainingAccounts.map(a => ({ ...a, isActive: false })));
        }
    };

    removeAccount = (id: string) => {
        if (this.apiRefs[id]) {
            this.apiRefs[id].disconnect();
            delete this.apiRefs[id];
        }
        this.setAccounts(this.accounts.filter(a => a.id !== id));
    };

    toggleAccount = (id: string) => {
        this.setAccounts(this.accounts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
    };

    onUnmount = () => {
        // Optional: Call this from RootStore on app exit if needed
        // But normally it lives forever while tab is open
        Object.values(this.apiRefs).forEach((api: DerivAPI) => api.disconnect());
        this.apiRefs = {};
    };
}
