import React, { Suspense, lazy } from 'react';
import { observer } from 'mobx-react-lite';
import { LayoutDashboard, ArrowRightLeft, History, Settings, Activity, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

const CopyTrading = lazy(() => import('../copy-trading/copy-trading').then(m => ({ default: m.CopyTrading })));

export const Main = observer(() => {
  const [activeTab, setActiveTab] = React.useState('copy-trading');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'copy-trading', label: 'Copy Trading', icon: ArrowRightLeft },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Sidebar */}
      <div className="w-20 md:w-64 bg-[#0e0e0f] border-r border-white/5 flex flex-col">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Activity className="text-white" size={24} />
            </div>
            <span className="hidden md:block text-xl font-black tracking-tighter text-white">DERIV<span className="text-blue-500">BOT</span></span>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all group",
                activeTab === tab.id 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                  : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
              )}
            >
              <tab.icon size={20} className={cn(activeTab === tab.id ? "text-white" : "group-hover:text-blue-400")} />
              <span className={cn("hidden md:block font-bold text-sm uppercase tracking-widest", activeTab === tab.id ? "text-white" : "text-gray-500")}>
                {tab.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-white/5">
          <div className="flex items-center gap-4 px-4 py-4 bg-white/[0.02] rounded-2xl border border-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
            <div className="hidden md:block">
              <p className="text-xs font-black text-white uppercase tracking-widest">Trader Pro</p>
              <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Premium Plan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="text-blue-500 animate-spin" size={48} />
          </div>
        }>
          {activeTab === 'copy-trading' && <CopyTrading />}
          {activeTab !== 'copy-trading' && (
            <div className="flex items-center justify-center h-full text-gray-600 italic">
              Module "{activeTab}" is coming soon...
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
});
