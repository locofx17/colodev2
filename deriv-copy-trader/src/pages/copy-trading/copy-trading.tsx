import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  History, 
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Wallet,
  X,
  Settings,
  ArrowRightLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../stores/root-store';
import { cn } from '../../lib/utils';

export const CopyTrading = observer(() => {
  const { copy_trading, replicator } = useStore();
  const [isAddingMaster, setIsAddingMaster] = useState(false);
  const [masterToken, setMasterToken] = useState('');
  const [copierToken, setCopierToken] = useState('');

  const handleAddMaster = () => {
    if (masterToken.trim()) {
      copy_trading.connectMaster(masterToken.trim());
      setMasterToken('');
      setIsAddingMaster(false);
    }
  };

  const handleAddCopier = () => {
    if (copierToken.trim()) {
      copy_trading.addCopier(copierToken.trim());
      setCopierToken('');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
              <ArrowRightLeft className="text-blue-500" size={32} />
              REPLICATOR <span className="text-blue-500">PRO</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1 font-medium tracking-wide uppercase">Institutional Grade Trade Replication</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">System Status</span>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  copy_trading.isReplicating ? "bg-emerald-500" : "bg-red-500"
                )} />
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  copy_trading.isReplicating ? "text-emerald-500" : "text-red-500"
                )}>
                  {copy_trading.isReplicating ? "Active & Monitoring" : "System Paused"}
                </span>
              </div>
            </div>
            <button 
              onClick={() => copy_trading.toggleReplication()}
              className={cn(
                "px-8 py-3 rounded-2xl font-black text-sm transition-all shadow-2xl active:scale-95 flex items-center gap-2",
                copy_trading.isReplicating 
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/40" 
                  : "bg-emerald-500 hover:bg-emerald-600 text-[#0a0a0a] shadow-emerald-900/40"
              )}
            >
              {copy_trading.isReplicating ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {copy_trading.isReplicating ? "STOP REPLICATION" : "START REPLICATION"}
            </button>
          </div>
        </div>

        {/* Master Account Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#111112] border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <ShieldCheck size={120} />
              </div>
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-[0.3em]">
                      <ShieldCheck size={14} />
                      Master Source
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                      {copy_trading.master ? (copy_trading.master.status === 'Connected' ? copy_trading.master.accountId : 'Connecting...') : 'No Master Linked'}
                    </h2>
                  </div>
                  <button 
                    onClick={() => setIsAddingMaster(true)}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 hover:text-white transition-all"
                  >
                    <Settings size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Current Balance</span>
                    <div className="text-3xl font-black text-yellow-500 tabular-nums">
                      {copy_trading.master?.balance.toFixed(2) || '0.00'} <span className="text-sm font-bold text-gray-500">{copy_trading.master?.currency || 'USD'}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Connection Status</span>
                    <div className={cn(
                      "text-sm font-bold flex items-center gap-2",
                      copy_trading.master?.status === 'Connected' ? "text-emerald-500" : "text-yellow-500"
                    )}>
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        copy_trading.master?.status === 'Connected' ? "bg-emerald-500" : "bg-yellow-500"
                      )} />
                      {copy_trading.master?.status || 'Not Configured'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Copier Management */}
            <div className="bg-[#111112] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div>
                  <h3 className="text-lg font-bold text-white">Client Copiers</h3>
                  <p className="text-xs text-gray-500 font-medium">Manage replication targets and individual settings</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                    {copy_trading.copiers.size} Accounts
                  </span>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] border-b border-white/5">
                      <th className="px-8 py-5">Account / Token</th>
                      <th className="px-8 py-5">Balance</th>
                      <th className="px-8 py-5">Settings</th>
                      <th className="px-8 py-5">Status</th>
                      <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {Array.from(copy_trading.copiers.entries()).map(([id, client]) => {
                      const settings = copy_trading.copierSettings.get(id);
                      return (
                        <tr key={id} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="px-8 py-6">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-bold text-white">Copier {id.slice(0, 4)}</span>
                              <span className="text-[10px] font-mono text-gray-600">{(client as any).token.slice(0, 8)}...</span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="text-sm font-black text-yellow-500 tabular-nums">
                              {client.balance.toFixed(2)} <span className="text-[10px] text-gray-600">{client.currency}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Multiplier</span>
                                <input 
                                  type="number"
                                  value={settings?.multiplier || 1}
                                  onChange={(e) => copy_trading.setMultiplier(id, parseFloat(e.target.value))}
                                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Cap</span>
                                <input 
                                  type="number"
                                  value={settings?.stakeCap || 100}
                                  onChange={(e) => copy_trading.setStakeCap(id, parseFloat(e.target.value))}
                                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <button 
                              onClick={() => copy_trading.toggleCopier(id)}
                              className={cn(
                                "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border",
                                settings?.isActive 
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                  : "bg-red-500/10 text-red-500 border-red-500/20"
                              )}
                            >
                              {settings?.isActive ? 'Active' : 'Paused'}
                            </button>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <button 
                              onClick={() => copy_trading.removeCopier(id)}
                              className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {copy_trading.copiers.size === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-4 opacity-20">
                            <Activity size={48} />
                            <p className="text-sm font-bold uppercase tracking-[0.2em]">No Copiers Configured</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar Controls */}
          <div className="space-y-8">
            <div className="bg-[#111112] border border-white/5 rounded-[2rem] p-8 shadow-2xl space-y-6">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Add New Copier</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">API Token</label>
                  <div className="relative">
                    <input 
                      type="password"
                      placeholder="Enter Client Token"
                      value={copierToken}
                      onChange={(e) => setCopierToken(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 focus:outline-none focus:border-blue-500 transition-all text-sm font-mono"
                    />
                    <Wallet className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                  </div>
                </div>
                <button 
                  onClick={handleAddCopier}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Add Copier Account
                </button>
              </div>
            </div>

            <div className="bg-[#111112] border border-white/5 rounded-[2rem] p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Live Activity</h3>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live</span>
                </div>
              </div>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {replicator.tradeLogs.map(log => (
                  <div key={log.id} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase border",
                          log.action === 'BUY' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                        )}>
                          {log.action}
                        </span>
                        <span className="text-xs font-bold text-white">{log.symbol}</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Amount</span>
                        <span className="text-sm font-black text-yellow-500">${log.amount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.status === 'SUCCESS' ? (
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        ) : log.status === 'PENDING' ? (
                          <RefreshCw size={14} className="text-blue-500 animate-spin" />
                        ) : (
                          <AlertCircle size={14} className="text-red-500" />
                        )}
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          log.status === 'SUCCESS' ? "text-emerald-500" : log.status === 'PENDING' ? "text-blue-500" : "text-red-500"
                        )}>{log.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {replicator.tradeLogs.length === 0 && (
                  <div className="py-12 text-center space-y-3 opacity-20">
                    <History size={32} className="mx-auto" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Waiting for trades...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Master Account Modal */}
      <AnimatePresence>
        {isAddingMaster && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingMaster(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-md bg-[#111112] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
              
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-white">Master Source</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-black tracking-[0.2em] mt-2">Primary account for replication</p>
                </div>
                <button 
                  onClick={() => setIsAddingMaster(false)}
                  className="p-3 hover:bg-white/5 rounded-2xl text-gray-500 hover:text-white transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">API Token</label>
                  <input 
                    type="password"
                    placeholder="Enter Master Token"
                    value={masterToken}
                    onChange={(e) => setMasterToken(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-5 focus:outline-none focus:border-blue-500 transition-all text-sm font-mono"
                  />
                </div>

                <div className="flex items-start gap-4 bg-blue-500/5 p-6 rounded-3xl border border-blue-500/10">
                  <AlertCircle size={20} className="text-blue-500 shrink-0 mt-1" />
                  <p className="text-xs text-blue-400/80 leading-relaxed font-medium">
                    This account will be monitored in real-time. Ensure the token has <span className="text-blue-400 font-bold">'Trade'</span> and <span className="text-blue-400 font-bold">'Read'</span> permissions enabled in your Deriv settings.
                  </p>
                </div>

                <button 
                  onClick={handleAddMaster}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98]"
                >
                  Link Master Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
});
