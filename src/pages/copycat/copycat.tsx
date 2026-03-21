import React from 'react';
import { observer } from 'mobx-react-lite';
import { 
  Activity, Trash2, Play, Pause, History, 
  ShieldCheck, AlertCircle, CheckCircle2, RefreshCw, Wallet, UserCheck
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '@/hooks/useStore';
import { DerivAccount } from './types';
import './copycat.scss';

const Copycat = observer(() => {
  const { client, copycat } = useStore();
  const { loginid, is_logged_in } = client;

  const {
    accounts,
    logs,
    clientTokenInput,
    isSyncing,
    isReplicating,
    tokenError,
    sessionPL,
    setClientTokenInput,
    handleAddClientToken,
    handleSync,
    handleToggleReplication,
    removeAccount,
    toggleAccount,
    clearLogs,
    setAccounts,
    setTokenError
  } = copycat;

  const getConnectionColor = (acc: DerivAccount) => {
    if (acc.error) return '#ef4444';           // Red
    if (acc.loginId === 'Connecting...') return '#eab308'; // Yellow
    return '#10b981';                           // Green
  };

  const masterAccount = accounts.find(a => a.type === 'master');

  return (
    <div className="copycat-page">
      <div className="copycat-container">
        
        {/* Top Bar */}
        <div className="top-bar">
          <div className="session-pl">
            <span className="session-pl__label">Session P/L</span>
            <span className={clsx("session-pl__value", sessionPL >= 0 ? "pos" : "neg")}>
              {sessionPL >= 0 ? '+' : ''}{sessionPL.toFixed(2)} USD
            </span>
          </div>
          <button
            onClick={handleToggleReplication}
            className={clsx("btn", isReplicating ? "btn-stop" : "btn-start")}
          >
            {isReplicating ? "⏹ Stop Copy Trading" : masterAccount?.accountType === 'demo' ? "▶ Start Demo to Real Copy Trading" : "▶ Start Copy Trading"}
          </button>
        </div>

        {/* Master Account Banner */}
        <div className="master-banner">
          <div className="banner-left">
            <div className="icon-wrapper">
              <ShieldCheck size={18} />
            </div>
            <div className="text-wrapper">
              <div className="banner-label">
                <span className="label-title">Master Account</span>
                {/* Show "Auto-linked" badge when using logged-in account */}
                {masterAccount && is_logged_in && masterAccount.loginId === loginid && (
                  <span style={{fontSize:'8px', backgroundColor:'rgba(59,130,246,0.15)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.3)', borderRadius:'4px', padding:'1px 5px', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:'3px'}}>
                    <UserCheck size={8} /> Logged-in Account
                  </span>
                )}
                {masterAccount && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                    {masterAccount.error ? (
                      <div className="status error">
                        <AlertCircle size={10} /><span>Error</span>
                      </div>
                    ) : masterAccount.loginId === 'Connecting...' ? (
                      <div className="status connecting">
                        <RefreshCw size={10} className="spin" /><span>Connecting</span>
                      </div>
                    ) : (
                      <div className="status connected">
                        <CheckCircle2 size={10} /><span>Connected</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="account-name">
                {masterAccount
                  ? masterAccount.loginId === 'Connecting...'
                    ? `${loginid} — Connecting...`
                    : `${masterAccount.loginId} — ${masterAccount.accountType === 'demo' ? 'Demo' : 'Real'} Account`
                  : is_logged_in ? "Auto-linking..." : "Not linked — please log in"}
              </span>
            </div>
          </div>
          <div className="banner-right">
            {masterAccount?.error && (
              <button
                onClick={() => setAccounts(prev => prev.map(a => a.id === masterAccount.id ? { ...a, error: undefined, isActive: true } : a))}
                className="btn btn-link"
              >
                <RefreshCw size={10} style={{marginRight: '4px'}}/>Retry
              </button>
            )}
            <div className="stats">
              <div className="stat-item">
                <div className="stat-label">Session P/L</div>
                <div className={clsx("stat-value", (masterAccount?.totalProfit || 0) >= 0 ? "text-green" : "text-red")}>
                  {masterAccount ? `${(masterAccount.totalProfit || 0).toFixed(2)} USD` : "0.00 USD"}
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Balance</div>
                <div className="stat-value text-yellow">
                  {masterAccount ? `${Number(client.balance).toFixed(2)} ${client.currency || 'USD'}` : "0.00 USD"}
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* Add Tokens Section */}
        <div className="add-tokens-section">
          <div className="add-tokens-header">
            <h3>Add tokens to Replicator</h3>
            <span>Tokens are stored in session only — not saved permanently</span>
          </div>
          <div className="section-card">
            <div className="card-body">
              <div className="input-wrapper">
                <input 
                  type="password"
                  placeholder="Enter Client API token (min 10 characters)"
                  value={clientTokenInput}
                  onChange={(e) => { setClientTokenInput(e.target.value); setTokenError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddClientToken()}
                />
                <div className="input-icon"><Wallet size={16} /></div>
              </div>
              {tokenError && <div className="token-error"><AlertCircle size={12} /> {tokenError}</div>}
              <div className="action-buttons">
                <button onClick={handleAddClientToken} className="btn btn-add-token">Add Token</button>
                <button onClick={handleSync} disabled={isSyncing} className="btn btn-sync">
                  <RefreshCw size={14} className={clsx(isSyncing && "spin")} />
                </button>
              </div>
              <div style={{marginLeft: 'auto'}}>
                <button 
                  onClick={handleToggleReplication}
                  className={clsx("btn", isReplicating ? "btn-stop" : "btn-start")}
                  style={{whiteSpace: 'nowrap'}}
                >
                  {isReplicating ? "Stop Replication" : "Start Copy Trading"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="section-card">
          <div className="card-header">
            <h3>Total Clients: {accounts.filter(a => a.type === 'copier').length}</h3>
            <div className="header-right">
               {accounts.some(a => a.error) && (
                 <button 
                   onClick={() => setAccounts(prev => prev.map(a => a.error ? { ...a, error: undefined, isActive: true } : a))}
                   className="btn btn-link" style={{background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)'}}
                 >
                   <RefreshCw size={10} style={{display: 'inline', marginRight: '4px'}}/>Retry All Failed
                 </button>
               )}
               <div className="active-count">
                 <div className="dot" />
                 <span>Active: {accounts.filter(a => a.type === 'copier' && a.isActive).length}</span>
               </div>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Login ID (CR)</th>
                  <th>Balance</th>
                  <th>Session P/L</th>
                  <th>Status</th>
                  <th>Connection</th>
                  <th style={{textAlign: 'right'}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.filter(a => a.type === 'copier').map(acc => (
                  <tr key={acc.id}>
                    <td className="token-cell">
                      <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: getConnectionColor(acc), flexShrink: 0}} />
                      {acc.token.substring(0, 8)}...
                    </td>
                    <td className="login-cell">{acc.loginId || '---'}</td>
                    <td className="balance-cell">
                      <span className="val">{acc.balance.toFixed(2)} {acc.currency}</span>
                      <span className="type">{acc.accountType}</span>
                    </td>
                    <td className={clsx("pl-cell", (acc.totalProfit || 0) >= 0 ? "pos" : "neg")}>
                      {(acc.totalProfit || 0) >= 0 ? '+' : ''}{(acc.totalProfit || 0).toFixed(2)} {acc.currency}
                    </td>
                    <td>
                      <button 
                        onClick={() => toggleAccount(acc.id)}
                        className={clsx("badge", acc.isActive ? "badge-active" : "badge-paused")}
                        style={{cursor: 'pointer'}}
                      >
                        {acc.isActive ? <><Play size={10} /> Active</> : <><Pause size={10} /> Paused</>}
                      </button>
                    </td>
                    <td>
                      {acc.error ? (
                        <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                          <div style={{display:'flex', alignItems:'center', gap:'4px', color:'#ef4444'}}>
                            <AlertCircle size={14} />
                            <span style={{fontSize:'10px', fontWeight:'bold', textTransform:'uppercase'}}>Error</span>
                          </div>
                          <button 
                            onClick={() => setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, error: undefined, isActive: true } : a))}
                            style={{fontSize:'9px', color:'#60a5fa', background:'transparent', border:'none', cursor:'pointer', textAlign:'left', textTransform:'uppercase', fontWeight:'bold'}}
                          >
                            Retry Connection
                          </button>
                        </div>
                      ) : acc.loginId === 'Connecting...' ? (
                        <div style={{display:'flex', alignItems:'center', gap:'4px', color:'#eab308'}}>
                          <RefreshCw size={14} className="spin" />
                          <span style={{fontSize:'10px', fontWeight:'bold', textTransform:'uppercase'}}>Connecting</span>
                        </div>
                      ) : (
                        <div style={{display:'flex', alignItems:'center', gap:'4px', color:'#10b981'}}>
                          <CheckCircle2 size={14} />
                          <span style={{fontSize:'10px', fontWeight:'bold', textTransform:'uppercase'}}>Connected</span>
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:'right'}}>
                      <button 
                        onClick={() => removeAccount(acc.id)}
                        style={{padding:'0.5rem', color:'#6b7280', background:'transparent', border:'none', cursor:'pointer', borderRadius:'0.5rem'}}
                        onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseOut={e => e.currentTarget.style.color = '#6b7280'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {accounts.filter(a => a.type === 'copier').length === 0 && (
                  <tr>
                    <td colSpan={7} style={{textAlign:'center', padding:'4rem 1.5rem'}}>
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', color:'#4b5563'}}>
                        <Activity size={32} style={{opacity:0.2}} />
                        <p className="empty">No tokens added yet</p>
                        <p className="empty-subtitle">Add a client token above to start replicating</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trade History Section */}
        <div className="section-card">
          <div className="card-header">
            <h3>Trade History</h3>
            <div className="header-right">
              <div style={{display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'10px', color:'#10b981', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.1em'}}>
                <div style={{width:'6px', height:'6px', backgroundColor:'#10b981', borderRadius:'50%'}} className="pulse" />
                Live Monitoring
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} style={{fontSize:'9px', color:'#6b7280', background:'transparent', border:'none', cursor:'pointer', textTransform:'uppercase', fontWeight:'bold'}}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>Profit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="token-cell text-muted">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="login-cell">{log.symbol}</td>
                    <td>
                      <span className={clsx("badge", log.action === 'BUY' ? "badge-success" : "badge-danger")}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{fontFamily:'monospace', fontWeight:'bold'}}>${log.amount.toFixed(2)}</td>
                    <td>
                      {log.profit !== undefined ? (
                        <span className={clsx("pl-cell", log.profit >= 0 ? "pos" : "neg")}>
                          {log.profit >= 0 ? '+' : ''}{log.profit.toFixed(2)}
                        </span>
                      ) : <span className="text-muted">---</span>}
                    </td>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                        {log.status === 'SUCCESS' || log.status === 'WON' ? (
                          <CheckCircle2 size={12} className="text-success" />
                        ) : log.status === 'PENDING' ? (
                          <RefreshCw size={12} className="text-info spin" />
                        ) : (
                          <AlertCircle size={12} className="text-danger" />
                        )}
                        <span className={clsx(
                          "badge",
                          (log.status === 'SUCCESS' || log.status === 'WON') ? "text-success" : log.status === 'PENDING' ? "text-info" : "text-danger"
                        )} style={{background:'transparent', padding:0, border:'none'}}>{log.status}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center', padding:'4rem 1.5rem'}}>
                      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', color:'#4b5563'}}>
                        <History size={32} style={{opacity:0.2}} />
                        <p className="empty">No trade activity recorded yet</p>
                        <p className="empty-subtitle">Trades will appear here in real-time</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
});

export default Copycat;
