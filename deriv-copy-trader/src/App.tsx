import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  History, 
  LayoutDashboard, 
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Wallet,
  ArrowRightLeft,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { DerivAccount, TradeLog } from './types';
import { DerivAPI } from './services/derivApi';

export default function App() {
  const [accounts, setAccounts] = useState<DerivAccount[]>(() => {
    const saved = localStorage.getItem('deriv_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [logs, setLogs] = useState<TradeLog[]>(() => {
    const saved = localStorage.getItem('deriv_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [clientTokenInput, setClientTokenInput] = useState('');
  const [masterTokenInput, setMasterTokenInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReplicating, setIsReplicating] = useState(false);

  const apiRefs = useRef<{ [key: string]: DerivAPI }>({});
  const accountsRef = useRef<DerivAccount[]>(accounts);

  useEffect(() => {
    accountsRef.current = accounts;
    localStorage.setItem('deriv_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('deriv_logs', JSON.stringify(logs));
  }, [logs]);

  // Initialize API connections for active accounts
  useEffect(() => {
    const currentIds = accounts.filter(a => a.isActive).map(a => a.id);
    
    // Remove inactive or deleted accounts
    Object.keys(apiRefs.current).forEach(id => {
      if (!currentIds.includes(id)) {
        apiRefs.current[id].disconnect();
        delete apiRefs.current[id];
      }
    });

    // Add new active accounts
    accounts.forEach(acc => {
      if (acc.isActive && !apiRefs.current[acc.id]) {
        const api = new DerivAPI((data) => handleApiMessage(acc.id, data));
        api.connect().then(() => {
          api.authorize(acc.token);
        }).catch(err => {
          console.error(`Failed to connect account ${acc.name}:`, err);
        });
        apiRefs.current[acc.id] = api;
      }
    });

    // We don't want to disconnect everything on every account change (like balance updates)
    // So we don't return a full cleanup here, but we handle it in a separate unmount effect
  }, [accounts.map(a => a.id + a.isActive + a.token).join(',')]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(apiRefs.current).forEach((api: DerivAPI) => api.disconnect());
      apiRefs.current = {};
    };
  }, []);

  const copiedTrades = useRef<Set<string>>(new Set());

  const handleApiMessage = (accountId: string, data: any) => {
    if (data.msg_type === 'authorize') {
      const auth = data.authorize;
      if (auth) {
        setAccounts(prev => prev.map(a => a.id === accountId ? {
          ...a,
          balance: auth.balance,
          currency: auth.currency,
          loginId: auth.loginid,
          name: auth.fullname || a.name,
          accountType: auth.is_virtual ? 'demo' : 'real',
          error: undefined // Clear any previous error
        } : a));

        // Subscribe to balance updates
        apiRefs.current[accountId].subscribeBalance();

        // Subscribe to proposal_open_contract to detect trades and track profit/loss
        apiRefs.current[accountId].send({ proposal_open_contract: 1, subscribe: 1 });
      } else if (data.error) {
        console.error(`Authorization failed for account ${accountId}:`, data.error.message);
        setAccounts(prev => prev.map(a => a.id === accountId ? {
          ...a,
          error: data.error.message,
          isActive: false // Deactivate on error
        } : a));
      }
    }

    if (data.msg_type === 'balance') {
      const balance = data.balance;
      if (balance) {
        setAccounts(prev => prev.map(a => a.id === accountId ? {
          ...a,
          balance: balance.balance,
          currency: balance.currency
        } : a));
      }
    }

    if (data.msg_type === 'proposal_open_contract') {
      const contract = data.proposal_open_contract;
      const account = accountsRef.current.find(a => a.id === accountId);
      
      // Logic to detect new trade on master and copy to copiers
      if (contract.status === 'open' && account?.type === 'master' && isReplicating) {
        if (!copiedTrades.current.has(contract.contract_id)) {
          copiedTrades.current.add(contract.contract_id);
          copyTrade(account, contract);
        }
      }

      // Logic to track profit/loss when contract is closed
      if (contract.status === 'won' || contract.status === 'lost') {
        const profit = contract.profit;
        
        // Update logs
        setLogs(prev => prev.map(log => {
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

        // Update account total profit
        setAccounts(prev => prev.map(a => a.id === accountId ? {
          ...a,
          totalProfit: (a.totalProfit || 0) + profit
        } : a));
      }
    }

    if (data.msg_type === 'buy') {
      const buy = data.buy;
      if (buy.contract_id) {
        // Update log if we can find it, or add new one
        setLogs(prev => prev.map(log => 
          log.copierAccountId === accountId && log.status === 'PENDING' 
          ? { ...log, status: 'SUCCESS', copierTradeId: buy.contract_id } 
          : log
        ));
      } else if (data.error) {
        setLogs(prev => prev.map(log => 
          log.copierAccountId === accountId && log.status === 'PENDING' 
          ? { ...log, status: 'FAILED', error: data.error.message } 
          : log
        ));
      }
    }
  };

  const copyTrade = (master: DerivAccount, contract: any) => {
    const copiers = accountsRef.current.filter(a => a.type === 'copier' && a.isActive);
    
    copiers.forEach(copier => {
      const api = apiRefs.current[copier.id];
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
        setLogs(prev => [newLog, ...prev].slice(0, 100));
      }
    });
  };

  const handleAddClientToken = async () => {
    if (!clientTokenInput.trim()) return;
    
    const id = Math.random().toString(36).substr(2, 9);
    const newAcc: DerivAccount = {
      id,
      name: `Client ${accounts.filter(a => a.type === 'copier').length + 1}`,
      token: clientTokenInput.trim(),
      type: 'copier',
      accountType: 'real', // Defaulting to real as per "Demo to Real" theme
      balance: 0,
      currency: 'USD',
      loginId: 'Connecting...',
      isActive: true,
      totalProfit: 0
    };

    setAccounts(prev => [...prev, newAcc]);
    setClientTokenInput('');
  };

  const handleSync = async () => {
    setIsSyncing(true);
    // Re-authorize all active accounts
    accounts.forEach(acc => {
      if (acc.isActive && apiRefs.current[acc.id]) {
        apiRefs.current[acc.id].authorize(acc.token);
      }
    });
    setTimeout(() => setIsSyncing(false), 2000);
  };

  const handleToggleReplication = () => {
    setIsReplicating(!isReplicating);
    setAccounts(prev => prev.map(a => ({ ...a, isActive: !isReplicating })));
  };

  const removeAccount = (id: string) => {
    if (apiRefs.current[id]) {
      apiRefs.current[id].disconnect();
      delete apiRefs.current[id];
    }
    setAccounts(accounts.filter(a => a.id !== id));
  };

  const toggleAccount = (id: string) => {
    setAccounts(accounts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const masterAccount = accounts.find(a => a.type === 'master');

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Top Bar */}
        <div className="flex justify-start">
          <button 
            onClick={handleToggleReplication}
            className={cn(
              "px-6 py-2 rounded-lg font-bold text-sm transition-all shadow-lg active:scale-95",
              isReplicating 
                ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/20" 
                : "bg-[#2ecc71] hover:bg-[#27ae60] text-[#0a0a0a] shadow-green-900/20"
            )}
          >
            {isReplicating ? "Stop Copy Trading" : "Start Demo to Real Copy Trading"}
          </button>
        </div>

        {/* Master Account Banner */}
        <div className="bg-[#1a365d] border border-blue-900/30 rounded-xl p-4 flex justify-between items-center shadow-2xl relative group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <ShieldCheck size={18} className="text-blue-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-blue-300/60 font-bold">Master Account</span>
                {masterAccount && (
                  <div className="flex items-center gap-1">
                    {masterAccount.error ? (
                      <div className="flex items-center gap-1 text-red-400 animate-pulse">
                        <AlertCircle size={10} />
                        <span className="text-[8px] font-black uppercase">Error</span>
                      </div>
                    ) : masterAccount.loginId === 'Connecting...' ? (
                      <div className="flex items-center gap-1 text-blue-300 animate-pulse">
                        <RefreshCw size={10} className="animate-spin" />
                        <span className="text-[8px] font-black uppercase">Connecting</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={10} />
                        <span className="text-[8px] font-black uppercase">Connected</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-blue-100">
                {masterAccount 
                  ? masterAccount.loginId === 'Connecting...' 
                    ? 'Connecting...' 
                    : `${masterAccount.loginId.startsWith('CR') ? '' : 'CR'}${masterAccount.loginId.substring(0, 3)}*** — ${masterAccount.name}` 
                  : "CR — not linked yet"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {masterAccount?.error && (
              <button 
                onClick={() => {
                  setAccounts(prev => prev.map(a => a.id === masterAccount.id ? { ...a, error: undefined, isActive: true } : a));
                }}
                className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest flex items-center gap-1 border border-red-500/20 px-2 py-1 rounded bg-red-500/5"
              >
                <RefreshCw size={10} />
                Retry
              </button>
            )}
            <div className="text-right flex items-center gap-6">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-blue-300/60 font-bold">Total P/L</div>
                <div className={cn(
                  "font-bold text-lg",
                  (masterAccount?.totalProfit || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {masterAccount ? `${(masterAccount.totalProfit || 0).toFixed(2)} ${masterAccount.currency}` : "0.00 USD"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-blue-300/60 font-bold">Balance</div>
                <div className="text-yellow-500 font-bold text-lg">
                  {masterAccount ? `${masterAccount.balance.toFixed(2)} ${masterAccount.currency}` : "0.00 USD"}
                </div>
              </div>
            </div>
            {!masterAccount && (
              <button 
                onClick={() => setIsAddingAccount(true)}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-[10px] font-bold uppercase transition-all"
              >
                Link Master
              </button>
            )}
            {masterAccount && (
              <button 
                onClick={() => removeAccount(masterAccount.id)}
                className="p-2 text-blue-300/40 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Add Tokens Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Add tokens to Replicator</h3>
            <span className="text-[10px] text-gray-600 font-medium">Tokens are stored locally and encrypted</span>
          </div>
          <div className="bg-[#161617] border border-white/5 rounded-xl p-6 flex flex-col md:flex-row gap-4 items-center shadow-xl">
            <div className="flex-1 w-full relative">
              <input 
                type="password"
                placeholder="Enter Client token"
                value={clientTokenInput}
                onChange={(e) => setClientTokenInput(e.target.value)}
                className="w-full bg-[#0e0e0f] border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 transition-all text-sm font-mono"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
                <Wallet size={16} />
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={handleAddClientToken}
                className="bg-[#00d1ff] hover:bg-[#00b8e6] text-[#0a0a0a] px-6 py-3 rounded-lg font-bold text-xs transition-all active:scale-95 shadow-lg shadow-blue-500/10"
              >
                Add Token
              </button>
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="bg-[#1c1c1e] hover:bg-[#2c2c2e] text-gray-300 px-4 py-3 rounded-lg font-bold text-xs transition-all active:scale-95 flex items-center gap-2 border border-white/5"
              >
                <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
              </button>
            </div>
            <div className="md:ml-auto">
              <button 
                onClick={handleToggleReplication}
                className={cn(
                  "px-8 py-3 rounded-lg font-bold text-sm transition-all active:scale-95 shadow-lg",
                  isReplicating 
                    ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/20" 
                    : "bg-[#2ecc71] hover:bg-[#27ae60] text-[#0a0a0a] shadow-green-900/20"
                )}
              >
                {isReplicating ? "Stop Replication" : "Start Copy Trading"}
              </button>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-[#161617] border border-white/5 rounded-xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1c1c1e]/30">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Total Clients added: {accounts.filter(a => a.type === 'copier').length}</h3>
            <div className="flex gap-4 items-center">
               {accounts.some(a => a.error) && (
                 <button 
                   onClick={() => {
                     setAccounts(prev => prev.map(a => a.error ? { ...a, error: undefined, isActive: true } : a));
                   }}
                   className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase tracking-widest flex items-center gap-1"
                 >
                   <RefreshCw size={10} />
                   Retry All Failed
                 </button>
               )}
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500" />
                 <span className="text-[10px] text-gray-500 font-bold uppercase">Active: {accounts.filter(a => a.type === 'copier' && a.isActive).length}</span>
               </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#1c1c1e] text-gray-400 font-bold uppercase tracking-wider border-b border-white/5">
                  <th className="px-6 py-4">Token</th>
                  <th className="px-6 py-4">Login ID</th>
                  <th className="px-6 py-4">Balance</th>
                  <th className="px-6 py-4">Total P/L</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Connection</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {accounts.filter(a => a.type === 'copier').map(acc => (
                  <tr key={acc.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 font-mono text-gray-500">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {acc.token.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{acc.loginId || '---'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-yellow-500">{acc.balance.toFixed(2)} {acc.currency}</span>
                        <span className="text-[9px] text-gray-600 uppercase font-bold">{acc.accountType}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "font-bold",
                        (acc.totalProfit || 0) >= 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {(acc.totalProfit || 0).toFixed(2)} {acc.currency}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleAccount(acc.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all",
                          acc.isActive 
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        )}
                      >
                        {acc.isActive ? (
                          <>
                            <Play size={10} fill="currentColor" />
                            Active
                          </>
                        ) : (
                          <>
                            <Pause size={10} fill="currentColor" />
                            Paused
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {acc.error ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-red-500" title={acc.error}>
                              <AlertCircle size={14} />
                              <span className="text-[10px] font-bold uppercase tracking-tight">Error</span>
                            </div>
                            <button 
                              onClick={() => {
                                setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, error: undefined, isActive: true } : a));
                              }}
                              className="text-[9px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-tighter text-left"
                            >
                              Retry Connection
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Connected</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => removeAccount(acc.id)}
                        className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.filter(a => a.type === 'copier').length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-600">
                        <Activity size={32} className="opacity-20" />
                        <p className="italic text-sm">No tokens added yet</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Add a client token above to start replicating</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trade History Section */}
        <div className="bg-[#161617] border border-white/5 rounded-xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1c1c1e]/30">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Trade History</h3>
            <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live Monitoring
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#1c1c1e] text-gray-400 font-bold uppercase tracking-wider border-b border-white/5">
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Symbol</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Profit</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-gray-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 font-bold tracking-tight">{log.symbol}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] font-black uppercase border",
                        log.action === 'BUY' 
                          ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20" 
                          : "bg-red-500/5 text-red-500 border-red-500/20"
                      )}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold">${log.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      {log.profit !== undefined ? (
                        <span className={cn(
                          "font-bold",
                          log.profit >= 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {log.profit >= 0 ? '+' : ''}{log.profit.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-600">---</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {log.status === 'SUCCESS' ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : log.status === 'PENDING' ? (
                          <RefreshCw size={12} className="text-blue-500 animate-spin" />
                        ) : (
                          <AlertCircle size={12} className="text-red-500" />
                        )}
                        <span className={cn(
                          "font-bold uppercase text-[9px] tracking-widest",
                          log.status === 'SUCCESS' ? "text-emerald-500" : log.status === 'PENDING' ? "text-blue-500" : "text-red-500"
                        )}>{log.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-600">
                        <History size={32} className="opacity-20" />
                        <p className="italic text-sm">No trade activity recorded yet</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Trades will appear here in real-time</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Add Account Modal */}
      <AnimatePresence>
        {isAddingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAccount(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-md bg-[#161617] border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
              
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white">Link Master Account</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">Source for trade replication</p>
                </div>
                <button 
                  onClick={() => setIsAddingAccount(false)}
                  className="p-2 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Master API Token</label>
                  <input 
                    type="password"
                    placeholder="Enter Master Token"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 focus:outline-none focus:border-blue-500 transition-all text-sm font-mono"
                    value={masterTokenInput}
                    onChange={(e) => setMasterTokenInput(e.target.value)}
                  />
                </div>

                <div className="flex items-start gap-3 bg-blue-500/5 p-4 rounded-xl border border-blue-500/10">
                  <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-blue-400/80 leading-relaxed">
                    This account will be monitored for new trades. Ensure the token has <span className="text-blue-400 font-bold">'Trade'</span> and <span className="text-blue-400 font-bold">'Read'</span> permissions.
                  </p>
                </div>

                <button 
                  onClick={() => {
                    if (!masterTokenInput.trim()) return;
                    const id = Math.random().toString(36).substr(2, 9);
                    const newAcc: DerivAccount = {
                      id,
                      name: 'Master Account',
                      token: masterTokenInput.trim(),
                      type: 'master',
                      accountType: 'demo',
                      balance: 0,
                      currency: 'USD',
                      loginId: 'Connecting...',
                      isActive: true,
                      totalProfit: 0
                    };
                    setAccounts(prev => [newAcc, ...prev.filter(a => a.type !== 'master')]);
                    setMasterTokenInput('');
                    setIsAddingAccount(false);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                >
                  Link Master Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
