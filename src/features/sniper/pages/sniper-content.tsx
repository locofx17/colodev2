import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, 
  Shield, 
  Zap, 
  Settings, 
  Play, 
  Square, 
  RefreshCw, 
  Terminal, 
  Cpu,
  BarChart3,
  Wifi,
  WifiOff,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Target,
  CircleStop
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';
import { fetchXmlWithCache } from '@/utils/freebots-cache';
import './sniper-content.scss';

// --- Constants ---
const VOLATILITY_MARKETS = [
  { id: '1HZ10V', name: 'Vol 10 (1s)', decimals: 3 },
  { id: '1HZ15V', name: 'Vol 15 (1s)', decimals: 4 },
  { id: '1HZ25V', name: 'Vol 25 (1s)', decimals: 3 },
  { id: '1HZ30V', name: 'Vol 30 (1s)', decimals: 3 },
  { id: '1HZ50V', name: 'Vol 50 (1s)', decimals: 4 },
  { id: '1HZ75V', name: 'Vol 75 (1s)', decimals: 4 },
  { id: '1HZ90V', name: 'Vol 90 (1s)', decimals: 2 },
  { id: '1HZ100V', name: 'Vol 100 (1s)', decimals: 2 },
  { id: 'R_10', name: 'Vol 10', decimals: 3 },
  { id: 'R_25', name: 'Vol 25', decimals: 3 },
  { id: 'R_50', name: 'Vol 50', decimals: 4 },
  { id: 'R_75', name: 'Vol 75', decimals: 4 },
  { id: 'R_100', name: 'Vol 100', decimals: 2 },
  { id: 'JD10', name: 'Jump 10', decimals: 3 },
  { id: 'JD25', name: 'Jump 25', decimals: 3 },
  { id: 'JD50', name: 'Jump 50', decimals: 3 },
  { id: 'JD75', name: 'Jump 75', decimals: 3 },
  { id: 'JD100', name: 'Jump 100', decimals: 3 },
];

const STRATEGIES = [
  { id: 'UNDER_5', name: 'Digit Under 5', logic: 'Under 5% > 55%, Most/2nd Most < 5, Least >= 5' },
  { id: 'OVER_4', name: 'Digit Over 4', logic: 'Over 4% > 55%, Most/2nd Most > 4, Least <= 4' },
  { id: 'EVEN', name: 'Even', logic: 'Even% > 55%, Most/2nd Most Even, Least Odd' },
  { id: 'ODD', name: 'Odd', logic: 'Odd% > 55%, Most/2nd Most Odd, Least Even' },
  { id: 'RSI_TECH', name: 'RSI Tech', logic: 'RSI Overbought/Oversold' },
];

const SniperContent = observer(() => {
  const { dashboard, sniper, client, run_panel, summary_card, transactions } = useStore();
  const { setActiveTab, setPendingFreeBot } = dashboard;

  // --- UI-only State ---
  const is_dev = process.env.NODE_ENV === 'development';
  const [showSetup, setShowSetup] = useState(true);
  const [executionTimer, setExecutionTimer] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [autoPilot, setAutoPilot] = useState(false);

  // --- Refs ---
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastDataTime = useRef<number>(Date.now());
  const autoPilotTimer = useRef<NodeJS.Timeout | null>(null);
  const ticksRef = useRef<Record<string, Tick[]>>({});
  const scanSound = useRef<HTMLAudioElement | null>(null);

  // Initialize sound (optional, but keeping for completeness)
  useEffect(() => {
    scanSound.current = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
    scanSound.current.loop = true;
    scanSound.current.volume = 0.1;
    
    return () => {
      if (scanSound.current) {
        scanSound.current.pause();
        scanSound.current = null;
      }
    };
  }, []);

  // Handle scanning sound
  useEffect(() => {
    if (sniper.isScanning && scanSound.current) {
      scanSound.current.play().catch(e => console.log('Audio play blocked by browser'));
    } else if (scanSound.current) {
      scanSound.current.pause();
      scanSound.current.currentTime = 0;
    }
  }, [sniper.isScanning]);

  const startScan = useCallback(() => {
    const markets = sniper.strategyLock === 'none' 
      ? VOLATILITY_MARKETS.map(m => m.id)
      : VOLATILITY_MARKETS.map(m => m.id); // Or a specific subset
    
    sniper.startScan(VOLATILITY_MARKETS.map(m => m.id));
    setShowSetup(false);
  }, [sniper]);

  const cancelScan = useCallback(() => {
    sniper.stopScan();
  }, [sniper]);

  useEffect(() => {
    if (!autoPilot && autoPilotTimer.current) {
      clearTimeout(autoPilotTimer.current);
    }
  }, [autoPilot]);

  useEffect(() => {
    if (autoPilot && sniper.isScanning && sniper.signals.length > 0 && !executionTimer) {
      sniper.addLog('Auto-Pilot: High confidence signal found, executing...');
      sniper.executeTrade(sniper.signals[0]);
      sniper.stopScan();
    }
  }, [autoPilot, sniper.isScanning, sniper.signals, executionTimer, sniper]);

  // --- Render Helpers ---
  const getMarketName = (id: string) => VOLATILITY_MARKETS.find(m => m.id === id)?.name || id;
  const getMarketDecimals = (id: string) => VOLATILITY_MARKETS.find(m => m.id === id)?.decimals || 2;
  const getStrategyName = (id: string) => STRATEGIES.find(s => s.id === id)?.name || id;

  const renderSetupView = () => (
    <div className="sniper-setup">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="sniper-setup__container"
      >
        <div className="sniper-setup__hero">
          <div className="sniper-setup__hero-icon">
            <Cpu size={42} />
          </div>
          <h2 className="sniper-setup__hero-title">INTELLIGENCE ENGINE</h2>
          <p className="sniper-setup__hero-subtitle">Volatility Scanner Parameters • v3.0</p>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>MARKET SELECTION</label>
            <select 
              value={sniper.selectedMarket}
              onChange={(e) => sniper.setScannerSettings({ selectedMarket: e.target.value })}
            >
              <option value="AUTO">AUTO (All Markets)</option>
              {VOLATILITY_MARKETS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="sniper-setup__field">
            <label>STRATEGY LOCK</label>
            <select 
              value={sniper.strategyLock}
              onChange={(e) => sniper.setScannerSettings({ strategyLock: e.target.value })}
            >
              <option value="none">AUTO (Best Match)</option>
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>STAKE</label>
            <input 
              type="number" 
              value={sniper.stake}
              onChange={(e) => sniper.setScannerSettings({ stake: Number(e.target.value) })}
              min="0.35"
              step="0.01"
            />
          </div>
          <div className="sniper-setup__field">
            <label>TAKE PROFIT</label>
            <input 
              type="number" 
              value={sniper.takeProfit}
              onChange={(e) => sniper.setScannerSettings({ takeProfit: Number(e.target.value) })}
              min="0"
              step="1"
            />
          </div>
        </div>

        <div className="sniper-setup__row">
          <div className="sniper-setup__field">
            <label>STOP LOSS</label>
            <input 
              type="number" 
              value={sniper.stopLoss}
              onChange={(e) => sniper.setScannerSettings({ stopLoss: Number(e.target.value) })}
              min="0"
              step="1"
            />
          </div>
          <div className="sniper-setup__field">
            <label>MULTIPLIER</label>
            <input 
              type="number" 
              value={sniper.multiplier}
              onChange={(e) => sniper.setScannerSettings({ multiplier: Number(e.target.value) })}
              min="1"
              step="0.1"
            />
          </div>
        </div>

        <div className="sniper-setup__autopilot">
          <div className="sniper-setup__autopilot-info">
            <Shield size={28} />
            <div>
              <div className="title">AUTO-PILOT MODE</div>
              <div className="desc">Auto-execute top signal on scan</div>
            </div>
          </div>
          <button 
            onClick={() => {
              const nextVal = !autoPilot;
              setAutoPilot(nextVal);
              if (nextVal && !sniper.isScanning) {
                startScan();
              }
            }}
            className={`sniper-setup__toggle ${autoPilot ? 'on' : 'off'}`}
          >
            <motion.div 
                animate={{ x: autoPilot ? 24 : 2 }} 
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="knob" 
            />
          </button>
        </div>

        <button onClick={startScan} className="sniper-setup__start-btn">
          <Play size={20} fill="currentColor" />
          START SMART SCAN
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="sniper-content">
      {!showSetup && (
        <header className="sniper-content__header">
          <div className="sniper-content__header-info">
            <div className="sniper-content__header-icon">
              <Cpu size={24} />
            </div>
            <div>
              <h1 className="sniper-content__title">Sniper AI Intelligence</h1>
              <p className="sniper-content__subtitle">Volatility Scanner • v3.0</p>
            </div>
          </div>
          
          <div className="sniper-content__header-actions">
            {sniper.isScanning && (
              <button 
                onClick={cancelScan} 
                className="sniper-content__header-stop-btn"
                title="Stop Scan"
              >
                <Square size={14} fill="currentColor" />
                <span>STOP SCAN</span>
              </button>
            )}
            
            <div className="sniper-content__header-status-group">
              <button 
                className="sniper-content__connect-btn"
                title="Manual Reconnect"
              >
                {sniper.isScanning ? (
                  <><Wifi size={14} className="text-green" /> <span className="status-live">LIVE</span></>
                ) : (
                  <><WifiOff size={14} className="text-red" /> <span className="status-offline">IDLE</span></>
                )}
                <RefreshCw size={10} className={`refresh-icon ${!sniper.isScanning ? 'anim-spin' : ''}`} />
              </button>

              <div className="sniper-content__header-progress">
                <div className="progress-info">
                  <span className="label">Collecting Data</span>
                  <span className="value">{Math.round(sniper.scanningProgress)}%</span>
                </div>
                <div className="progress-bar">
                  <motion.div 
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${sniper.scanningProgress}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
            
            <button 
              onClick={async () => {
                  try {
                      const response = await fetch('/xml/Entry point Bot over 2.xml');
                      const xml = await response.text();
                      setPendingFreeBot({ name: 'Entry Point Bot', xml });
                      setActiveTab(DBOT_TABS.BOT_BUILDER);
                  } catch (error) {
                      console.error('Failed to load bot template:', error);
                  }
              }}
              className="sniper-content__load-bot-btn"
              title="Load Bot Template"
            >
              <ExternalLink size={16} />
              <span>Load Bot</span>
            </button>
          </div>
        </header>
      )}

      {showSetup ? renderSetupView() : (
        /* Main Dashboard */
        <main className="sniper-content__dashboard">
          
          {/* Left Column: Focused Progress Tracking */}
          <div className="sniper-content__main-content">
            <div className="sniper-content__trade-dashboard">
              <div className="dashboard-grid">
                {/* Active Status Card */}
                <div className={`status-card ${run_panel.is_running ? 'running' : 'idle'}`}>
                  <div className="card-header">
                    <span className="label">SYSTEM STATUS</span>
                    {run_panel.is_running && <span className="live-tag">LIVE</span>}
                  </div>
                  <div className="status-main">
                    <div className="status-icon-wrapper">
                      {run_panel.is_running ? (
                        <Activity className="anim-pulse" size={32} />
                      ) : (
                        <Shield size={32} opacity={0.5} />
                      )}
                    </div>
                    <div>
                      <div className="status-title">
                        {run_panel.is_running ? 'BOT IS EXECUTING' : 'READY FOR ACTION'}
                      </div>
                      <div className="status-desc">
                        {run_panel.is_running ? `Stage: ${run_panel.contract_stage}` : 'Sniper Intelligence standing by...'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profit/Loss Card */}
                <div className={`stats-card pl-card ${summary_card.profit_loss >= 0 ? 'profit' : 'loss'}`}>
                  <div className="card-header">
                    <span className="label">REAL-TIME P/L</span>
                  </div>
                  <div className="stats-main">
                    <div className="value">
                      {summary_card.profit_loss >= 0 ? '+' : ''}
                      {summary_card.profit_loss.toFixed(2)}
                    </div>
                    <div className="movement-icon">
                      {summary_card.profit_loss >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                  </div>
                  <div className="card-footer">
                    Current session active contract
                  </div>
                </div>

                {/* Win/Loss Card */}
                <div className="stats-card counters-card">
                  <div className="card-header">
                    <span className="label">SESSION SUCCESS</span>
                  </div>
                  <div className="counters-main">
                    <div className="counter-item win">
                      <div className="v">{transactions.statistics.won_contracts}</div>
                      <div className="l">WINS</div>
                    </div>
                    <div className="counter-divider" />
                    <div className="counter-item loss">
                      <div className="v">{transactions.statistics.lost_contracts}</div>
                      <div className="l">LOSSES</div>
                    </div>
                  </div>
                </div>

                {/* Total Stats Card */}
                <div className="stats-card summary-card-mini">
                  <div className="card-header">
                    <span className="label">TOTAL NET PROFIT</span>
                  </div>
                  <div className="stats-main">
                    <div className={`value ${transactions.statistics.total_profit >= 0 ? 'text-green' : 'text-red'}`}>
                        {transactions.statistics.total_profit.toFixed(2)}
                        <span className="currency">{client.currency}</span>
                    </div>
                  </div>
                  <div className="card-footer">
                    Total from {transactions.statistics.number_of_runs} runs
                  </div>
                </div>
              </div>

              {/* Bot Control Bar */}
              {run_panel.is_stop_button_visible && (
                <div className="bot-controls-bar">
                  <div className="bot-info">
                    <Target size={18} />
                    <span>BOT MONITOR ACTIVE</span>
                  </div>
                  <button 
                    onClick={() => run_panel.onStopButtonClick()}
                    disabled={run_panel.is_stop_button_disabled}
                    className="stop-bot-btn"
                  >
                    <CircleStop size={18} />
                    STOP TRADING BOT
                  </button>
                </div>
              )}

              {/* Advanced Logs (Compact) */}
              <div className="sniper-logs-container">
                <div className="section-header">
                    <Terminal size={14} />
                    <span>INTELLIGENCE LOGS</span>
                </div>
                <div className="logs-list">
                    {sniper.logs.slice(0, 10).map((log, i) => (
                        <div key={i} className="log-item">{log}</div>
                    ))}
                    {sniper.logs.length === 0 && <div className="log-empty">Waiting for events...</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Controls & Signal */}
          <div className="sniper-content__sidebar">
            
            {/* Signals */}
            <div className="sniper-content__signals-section">
              <div className="section-header">
                <span className="label">Top Intelligence Signals</span>
                {sniper.signals.length > 0 && (
                  <span className="signal-count">{sniper.signals.length} SIGNALS</span>
                )}
              </div>

              <AnimatePresence>
                {sniper.signals.length > 0 ? (
                  sniper.signals.map((signal, index) => (
                    <motion.div 
                      key={`${signal.marketId}-${signal.strategyId}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`signal-card ${index === 0 ? 'top-signal' : ''}`}
                    >
                      {index === 0 && <Zap className="bg-icon" />}

                      <div className="signal-main">
                        <div className="entry-digit-container">
                          <div className="label">Entry Digit</div>
                          <div className="value">{signal.entryDigit}</div>
                        </div>
                        <div className="signal-info">
                          <div className="entry-type">
                            {signal.entry}
                            {index === 0 && <span className="badge">TOP</span>}
                          </div>
                          <div className="market-strategy">
                            {getMarketName(signal.marketId)} • {getStrategyName(signal.strategyId)}
                          </div>
                          
                          <div className="distribution-chart">
                            {signal.digitDistribution.map((freq, i) => (
                              <div 
                                key={i}
                                className={`bar ${i === signal.entryDigit ? 'active' : ''}`}
                                style={{ height: `${Math.max(10, freq * 100)}%` }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="confidence-container">
                          <div className="value">{Math.round(signal.confidence * 100)}%</div>
                          <div className="label">Confidence</div>
                        </div>
                      </div>

                      <div className="signal-footer">
                        <div className="price-info">
                          <div className="label">Signal Price</div>
                          <div className="value">{signal.price.toFixed(getMarketDecimals(signal.marketId))}</div>
                        </div>
                        <button 
                          onClick={() => sniper.executeTrade(signal)}
                          disabled={run_panel.is_running}
                          className="execute-btn"
                        >
                          <Zap size={14} />
                          {run_panel.is_running ? 'Bot Running' : 'Execute'}
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="no-signals">
                    <Activity size={32} className="anim-pulse" />
                    <div className="text">Scanning Universe...</div>
                    <p>Waiting for market conditions to align.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls - Only show in setup or if explicitly needed, hidden on mobile dashboard per user request */}
            {showSetup && (
              <div className="sniper-content__controls">
                {/* ... (existing controls) ... */}
              </div>
            )}
          </div>
        </main>
      )}

      {!showSetup && false && ( // Completely hidden per user request
        <footer className="sniper-content__footer">
          {/* ... footer content (now hidden) ... */}
        </footer>
      )}
    </div>
  );
});

export default SniperContent;
