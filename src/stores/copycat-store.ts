import { action, makeObservable, observable, reaction } from 'mobx';
import { DerivAccount, TradeLog } from '../pages/copycat/types';
import { DerivAPI } from '../pages/copycat/services/derivApi';
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

        const existingMaster = this.accounts.find(a => a.type === 'master');
        
        // If already linked to the CORRECT account, do nothing
        if (existingMaster && existingMaster.loginId === client.loginid) {
            return;
        }

        const id = Math.random().toString(36).substr(2, 9);
        const masterAcc: DerivAccount = {
            id,
            name: client.loginid,
            token,
            type: 'master',
            accountType: 'real', // Will be updated to demo if true upon websocket auth
            balance: 0,
            currency: 'USD',
            loginId: client.loginid,
            isActive: true,
            connectionStatus: 'connecting',
            totalProfit: 0
        };

        // Replace the old master with the new one, keeping all clients
        this.setAccounts([masterAcc, ...this.accounts.filter(a => a.type !== 'master')]);
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

                this.setSessionPL(this.sessionPL + profit);
                
                this.setLogs(this.logs.map(log => {
                    const isMasterLog = log.masterAccountId === accountId && log.masterTradeId === contract.contract_id;
                    const isCopierLog = log.copierAccountId === accountId && log.copierTradeId === contract.contract_id;
                    
                    if (isMasterLog || isCopierLog) {
                        return { 
                            ...log, 
                            status: contract.status.toUpperCase() as 'WON' | 'LOST', 
                            profit: profit 
                        };
                    }
                    return log;
                }));

                this.setAccounts(this.accounts.map(a => a.id === accountId ? {
                    ...a,
                    totalProfit: (a.totalProfit || 0) + profit
                } : a));
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

                api.buy(symbol, amount, type);
                
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

    handleToggleReplication = () => {
        const next = !this.isReplicating;
        this.setIsReplicating(next);
        this.setAccounts(this.accounts.map(a => ({ ...a, isActive: next })));
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
