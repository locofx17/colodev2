import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './copy-trading.scss';

const CopyTrading = observer(() => {
    const { copy_trading } = useStore();
    const [tokenInput, setTokenInput] = useState('');
    const [statusMsg, setStatusMsg] = useState({ text: '', color: '' });
    const [statusTimer, setStatusTimer] = useState<NodeJS.Timeout | null>(null);

    const showStatus = (text: string, color: string) => {
        if (statusTimer) clearTimeout(statusTimer);
        setStatusMsg({ text, color });
        const timer = setTimeout(() => {
            setStatusMsg({ text: '', color: '' });
        }, 3000);
        setStatusTimer(timer);
    };

    const handleAddToken = () => {
        if (!tokenInput.trim()) return;
        try {
            copy_trading.addCopier(tokenInput);
            setTokenInput('');
            showStatus('Token added successfully!', 'green');
        } catch (e: any) {
            showStatus(e.message || 'Failed to add token', 'red');
        }
    };

    const toggleDemoToReal = async () => {
        if (copy_trading.master.status === 'connected') {
            copy_trading.disconnectMaster();
            showStatus('Stopped successfully', 'red');
        } else {
            try {
                // If we don't have a token, we might need a prompt or just use the first account if linked
                // For now, let's assume if there's no master token, we show an error
                if (!copy_trading.master.token) {
                    showStatus('No master token set!', 'red');
                    return;
                }
                await copy_trading.connectMaster();
                showStatus('Demo to real set successfully', 'green');
            } catch (e: any) {
                showStatus(e.message || 'Connection failed', 'red');
            }
        }
    };

    const toggleCopyTrading = () => {
        const newState = !copy_trading.replicationEnabled;
        copy_trading.enableReplication(newState);
        showStatus(newState ? 'Copy trading started successfully' : 'Copy trading stopped successfully', newState ? 'green' : 'red');
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'connected': return '#28a745';
            case 'connecting': return '#ffc107';
            case 'error': return '#dc3545';
            default: return '#6c757d';
        }
    };

    return (
        <div className='copy-trading' style={{width: '100%', height: '100vh', minHeight: '100vh'}}>
            <div className="top-bar">
                <button 
                    id="copy-trading-btn" 
                    className="btn" 
                    style={{ 
                        backgroundColor: copy_trading.master.status === 'connected' ? 'red' : '#28a745',
                        color: 'white'
                    }}
                    onClick={toggleDemoToReal}
                >
                    {copy_trading.master.status === 'connected' ? 'Stop Demo to Real Copy Trading' : 'Start Demo to Real Copy Trading'}
                </button>
            </div>

            <div className="replicator-token mb-3">
                <span>
                    <h5 id="login-id" style={{ margin: 0 }}>
                        {copy_trading.master.loginId ? `CR: ${copy_trading.master.loginId}` : 'CR — not linked yet'}
                    </h5>
                    {statusMsg.text && (
                        <p className={`status-msg show`} style={{ color: statusMsg.color }}>
                            {statusMsg.text}
                        </p>
                    )}
                </span>
                <span id="bal-id" style={{color: 'gold', fontWeight: 'bold'}}>
                    {copy_trading.master.balance !== undefined ? 
                        `${copy_trading.master.balance.toFixed(2)} ${copy_trading.master.currency || 'USD'}` : 
                        '0.00 USD'
                    }
                </span>
            </div>

            <h5>Add tokens to Replicator</h5>

            <div className="card p-3">
                <div className="input-group mb-2">
                    <input 
                        id="tokenInput" 
                        type="text" 
                        className="form-control" 
                        placeholder="Enter Client token" 
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                    />
                    <button 
                        id="start-token" 
                        className="btn"
                        style={{ 
                            backgroundColor: copy_trading.replicationEnabled ? 'red' : '#28a745',
                            color: 'white'
                        }}
                        onClick={toggleCopyTrading}
                    >
                        {copy_trading.replicationEnabled ? 'Stop Copy Trading' : 'Start Copy Trading'}
                    </button>
                </div>
                <div className="d-flex gap-2">
                    <button id="btn-add" className="btn btn-cyan" onClick={handleAddToken}>Add</button>
                    <button id="btn-refresh" className="btn btn-cyan" onClick={() => copy_trading.refreshAll()}>Sync &#x21bb;</button>
                </div>
            </div>

            <div className="card p-3">
                <h6 id="tokens-num">Total Clients added: {copy_trading.copiers.length}</h6>
                {copy_trading.copiers.length === 0 && (
                    <small id="no-tokens" className="text-muted">No tokens added yet</small>
                )}
                <table id="tokenTable">
                    <thead>
                        <tr>
                            <th>Token</th>
                            <th>Login ID</th>
                            <th>Balance</th>
                            <th>Status</th>
                            <th>Remove</th>
                        </tr>
                    </thead>
                    <tbody>
                        {copy_trading.copiers.map((copier) => (
                            <tr key={copier.id}>
                                <td title={copier.token}>{copier.token.substring(0, 4) + '...' + copier.token.slice(-4)}</td>
                                <td>{copier.loginId || '---'}</td>
                                <td style={{ color: 'gold' }}>
                                    {copier.balance !== undefined ? `${copier.balance.toFixed(2)} ${copier.currency || ''}` : '---'}
                                </td>
                                <td>
                                    <span style={{ 
                                        display: 'inline-block', 
                                        width: '8px', 
                                        height: '8px', 
                                        borderRadius: '50%', 
                                        backgroundColor: getStatusColor(copier.status),
                                        marginRight: '5px'
                                    }}></span>
                                    {copier.status}
                                </td>
                                <td>
                                    <span 
                                        className="delete-btn" 
                                        onClick={() => copy_trading.removeCopier(copier.id)}
                                    >
                                        X
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default CopyTrading;
