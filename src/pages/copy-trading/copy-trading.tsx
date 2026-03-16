import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import './copy-trading.scss';

const CopyTrading = observer(() => {
    const htmlContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (htmlContentRef.current) {
            // Initialize the copy trading functionality
            initializeCopyTrading();
        }
    }, []);

    const initializeCopyTrading = () => {
        // Get DOM elements
        const btn = document.getElementById('copy-trading-btn');
        const btnStart = document.getElementById('start-token');
        const statusMsg = document.getElementById('status-msg');
        const statusMsg2 = document.getElementById('status-msg2');
        const btnAdd = document.getElementById('btn-add');
        const btnRef = document.getElementById('btn-refresh');
        const tokenInput = document.getElementById('tokenInput') as HTMLInputElement;

        if (!btn || !btnStart || !statusMsg || !statusMsg2 || !btnAdd || !btnRef || !tokenInput) return;

        // Demo to real functionality
        btn.addEventListener('click', () => {
            const isStart = btn.textContent?.includes('Start');
            const accounts_list = JSON.parse(localStorage.getItem('accountsList') || '{}');

            if (isStart) {
                const keys = Object.keys(accounts_list);
                const key = keys[0];
                if (keys.length > 0 && !key.startsWith("VR")) {
                    const value = accounts_list[key];
                    let storedArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
                    storedArray.push(value);
                    localStorage.setItem('copyTokensArray', JSON.stringify(storedArray));
                    localStorage.setItem('demo_to_real', 'true');

                    btn.textContent = 'Stop Demo to Real Copy Trading';
                    btn.style.backgroundColor = 'red';
                    statusMsg.textContent = "Demo to real set successfully";
                    statusMsg.style.color = "green";
                } else {
                    alert('no real account found!');
                }
            } else {
                const keys = Object.keys(accounts_list);
                const key = keys[0];
                const value = accounts_list[key];
                let storedArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
                storedArray = storedArray.filter((token: string) => token !== value);
                localStorage.setItem('copyTokensArray', JSON.stringify(storedArray));
                localStorage.setItem('demo_to_real', 'false');

                btn.textContent = 'Start Demo to Real Copy Trading';
                btn.style.backgroundColor = '';
                statusMsg.textContent = "Stopped successfully";
                statusMsg.style.color = "red";
            }

            renderTable();
            showStatusMessage(statusMsg);
        });

        // Start copy trading functionality
        btnStart.addEventListener('click', () => {
            const isStart = btnStart.textContent?.includes('Start');
            if (isStart) {
                localStorage.setItem('iscopyTrading', 'true');
                btnStart.textContent = 'Stop Copy Trading';
                btnStart.style.backgroundColor = 'red';
                statusMsg2.textContent = "Copy trading started successfully";
                statusMsg2.style.color = "green";
            } else {
                localStorage.setItem('iscopyTrading', 'false');
                btnStart.textContent = 'Start Copy Trading';
                btnStart.style.backgroundColor = '';
                statusMsg2.textContent = "Copy trading Stopped successfully";
                statusMsg2.style.color = "red";
            }
            showStatusMessage(statusMsg2);
        });

        // Add tokens functionality
        btnAdd.addEventListener('click', () => {
            if (tokenInput) {
                const the_new = tokenInput.value.trim();
                const storedArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
                let msgg;
                if (storedArray.includes(the_new)) {
                    msgg = 'token already exists';
                    statusMsg2.style.color = "red";
                } else {
                    storedArray.push(the_new);
                    localStorage.setItem('copyTokensArray', JSON.stringify(storedArray));
                    msgg = 'token has been added';
                    statusMsg2.style.color = "green";
                    tokenInput.value = '';
                }

                statusMsg2.textContent = msgg;
                showStatusMessage(statusMsg2);
                renderTable();
            }
        });

        // Refresh tokens
        btnRef.addEventListener('click', () => {
            renderTable();
        });

        // Helper functions
        const showStatusMessage = (element: HTMLElement) => {
            element.classList.remove('show');
            void element.offsetWidth; // Force reflow
            element.classList.add('show');
            setTimeout(() => {
                element.classList.remove('show');
            }, 2000);
        };

        const renderTable = () => {
            const isdemo_toreal = localStorage.getItem('demo_to_real');
            if (isdemo_toreal === 'true') {
                btn.textContent = 'Stop Demo to Real Copy Trading';
                btn.style.backgroundColor = 'red';
            }

            const iscopyTrading = localStorage.getItem('iscopyTrading');
            if (iscopyTrading === 'true') {
                btnStart.textContent = 'Stop Copy Trading';
                btnStart.style.backgroundColor = 'red';
            }

            const sArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
            const noTokensEl = document.getElementById('no-tokens');
            const tokensNumEl = document.getElementById('tokens-num');
            const tokenTableBody = document.querySelector('#tokenTable tbody');

            if (noTokensEl) {
                noTokensEl.textContent = sArray.length === 0 ? 'No tokens added yet' : '';
            }
            if (tokensNumEl) {
                tokensNumEl.textContent = `Total Clients added: ${sArray.length}`;
            }

            if (tokenTableBody) {
                tokenTableBody.innerHTML = '';
                sArray.forEach((token: string, index: number) => {
                    const row = document.createElement('tr');

                    const tokenCell = document.createElement('td');
                    tokenCell.textContent = token;
                    row.appendChild(tokenCell);

                    const actionCell = document.createElement('td');
                    const deleteBtn = document.createElement('span');
                    deleteBtn.textContent = 'X';
                    deleteBtn.classList.add('delete-btn');
                    deleteBtn.onclick = () => {
                        const tokens = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
                        tokens.splice(index, 1);
                        localStorage.setItem('copyTokensArray', JSON.stringify(tokens));
                        renderTable();
                        statusMsg2.textContent = 'token removed!';
                        statusMsg2.style.color = 'red';
                        showStatusMessage(statusMsg2);
                    };
                    actionCell.appendChild(deleteBtn);
                    row.appendChild(actionCell);

                    tokenTableBody.appendChild(row);
                });
            }
        };

        // WebSocket functionality
            // Display CR if user is currently on a demo login in local storage
            try {
                const active_loginid = localStorage.getItem('active_loginid') || '';
                if (active_loginid && active_loginid.startsWith('VR')) {
                    const cr = (localStorage.getItem('cr_loginid') || '').toString();
                    const el = document.getElementById('login-id');
                    if (el) el.textContent = cr || 'CR — not linked yet';
                }
            } catch {}

        const webSS = () => {
            // Build token list from localStorage accounts mapping
            const accounts_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
            const tokens: string[] = Object.keys(accounts_list).map(k => accounts_list[k]).filter(Boolean);

            // Also check for tokens in copyTokensArray as fallback
            const copyTokensArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
            const additionalTokens = copyTokensArray.map((item: any) => item.token).filter(Boolean);
            tokens.push(...additionalTokens);

            // Deriv config-aware endpoint
            const APP_ID = String(getAppId?.() ?? localStorage.getItem('APP_ID') ?? '29934');
            const server = getSocketURL?.() || 'ws.derivws.com';
            const ws_url = `wss://${server}/websockets/v3?app_id=${APP_ID}`;

            let ws: WebSocket | null = null;
            let reconnectAttempts = 0;
            let pingTimer: number | null = null;

            const setLoginId = (loginid: string | null) => {
                const loginIdEl = document.getElementById('login-id');
                if (loginIdEl) loginIdEl.textContent = loginid ? String(loginid) : '---';
            };

            const setBalance = (text: string) => {
                const balIdEl = document.getElementById('bal-id');
                if (balIdEl) balIdEl.textContent = text;
            };

            const startPing = () => {
                stopPing();
                // @ts-ignore
                pingTimer = window.setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ ping: 1 }));
                    }
                }, 30000);
            };
            const stopPing = () => {
                if (pingTimer) {
                    clearInterval(pingTimer);
                    pingTimer = null;
                }
            };

            const connect = () => {
                ws = new WebSocket(ws_url);

                ws.addEventListener('open', () => {
                    reconnectAttempts = 0;
                    startPing();
                    authorize();
                });

                ws.addEventListener('close', () => {
                    stopPing();
                    scheduleReconnect();
                });

                ws.addEventListener('error', () => {
                    stopPing();
                    scheduleReconnect();
                });

                ws.addEventListener('message', evt => {
                    const ms = JSON.parse(evt.data);
                    const req_id = ms?.echo_req?.req_id;
                    const error = ms?.error;

                    if (error) {
                        console.error('Copy Trading API Error:', error);
                        const errorMsg = `Error: ${error.message || 'Unknown error'}${error.code ? ` (${error.code})` : ''}`;
                        setLoginId('API Error');
                        setBalance(errorMsg);
                        return;
                    }
                    if (req_id === 2111 && ms.authorize?.account_list) {
                        const list = ms.authorize.account_list as Array<any>;
                        let realLogin: string | null = null;
                        for (const acc of list) {
                            if ((acc.currency_type === 'fiat' || String(acc.loginid).startsWith('CR')) && acc.is_virtual === 0) {
                                realLogin = acc.loginid;
                                break;
                            }
                        }
                        if (realLogin) {
                            localStorage.setItem('cr_loginid', String(realLogin));
                        }
                        const active_loginid = localStorage.getItem('active_loginid') || '';
                        setLoginId(realLogin ? (active_loginid?.startsWith('VR') ? `CR: ${realLogin}` : String(realLogin)) : null);
                        if (realLogin) getBalance(realLogin);
                    }
                    if (req_id === 2112 && ms.balance) {
                        const balance = ms.balance.balance;
                        const currency = ms.balance.currency;
                        setBalance(`${balance} ${currency}`);
                    }
                });
            };

            const scheduleReconnect = () => {
                const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts++));
                setTimeout(() => connect(), delay);
            };

            const authorize = () => {
                if (!ws || ws.readyState === WebSocket.CLOSED) return;

                // Check if we have any tokens
                if (!tokens || tokens.length === 0) {
                    console.warn('Copy Trading: No tokens available for authorization');
                    setLoginId('No tokens');
                    setBalance('Please add tokens first');
                    return;
                }

                console.log('Copy Trading: Authorizing with', tokens.length, 'tokens');
                const msg = JSON.stringify({ authorize: 'MULTI', tokens, req_id: 2111 });
                ws.send(msg);
            };

            const getBalance = (loginid: string) => {
                if (!ws || ws.readyState === WebSocket.CLOSED) return;
                const msg = JSON.stringify({ balance: 1, loginid, req_id: 2112 });
                ws.send(msg);
            };

            connect();
        };

        // Initialize everything
        renderTable();
        webSS();
    };

    return (
        <div className='copy-trading' ref={htmlContentRef} style={{width: '100%', height: '100vh', minHeight: '100vh'}}>
            <div className="top-bar">
                <button id="copy-trading-btn" className="btn btn-green">Start Demo to Real Copy Trading</button>
            </div>

            <div className="replicator-token mb-3">
                <span>
                    <h5 id="login-id">---</h5>
                    <p id="status-msg" className="status-msg">Demo to real set successfully</p>
                </span>
                <span id="bal-id" style={{color: 'gold'}}>0.00 USD</span>
            </div>

            <h5>Add tokens to Replicator</h5>

            <div className="card p-3">
                <div className="input-group mb-2">
                    <input id="tokenInput" type="text" className="form-control" placeholder="Enter Client token" />
                    <button id="start-token" className="btn btn-green">Start Copy Trading</button>
                </div>
                <div className="d-flex gap-2">
                    <button id="btn-add" className="btn btn-cyan">Add</button>
                    <button id="btn-refresh" className="btn btn-cyan">Sync &#x21bb;</button>
                </div>
                <p id="status-msg2" className="status-msg">Demo to real set successfully</p>
            </div>

            <div className="card p-3">
                <h6 id="tokens-num">Total Clients added: 0</h6>
                <small id="no-tokens" className="text-muted"></small>
                <table id="tokenTable">
                    <thead>
                        <tr>
                            <th>Token</th>
                            <th>Remove</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>

        </div>
    );
});

export default CopyTrading;
