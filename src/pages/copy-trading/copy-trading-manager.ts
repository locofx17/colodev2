import { makeAutoObservable, runInAction } from 'mobx';
import { generateDerivApiInstance } from '@/external/bot-skeleton/services/api/appId';

export type TConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type TCopier = {
  id: string;
  token: string;
  loginId?: string;
  balance?: number;
  currency?: string;
  status: TConnectionStatus;
  addedAt: number;
  enabled?: boolean;
  lastErrorCode?: string;
  lastErrorMsg?: string;
};

export type TMasterState = {
  token: string;
  loginId?: string;
  balance?: number;
  currency?: string;
  status: TConnectionStatus;
};

const LS_KEYS = {
  MASTER_TOKEN: 'copy_trading.master_token',
  COPIERS: 'copy_trading.copiers',
  SETTINGS: 'copy_trading.settings',
};

// Lightweight Deriv API client wrapper for isolated connections per token
class DerivClient {
  api: any | null = null;
  status: TConnectionStatus = 'disconnected';
  loginId?: string;
  balance?: number;
  currency?: string;
  private balanceSub: any | null = null;

  constructor() {
    makeAutoObservable(this, {
      // @ts-ignore
      api: false,
      // @ts-ignore
      balanceSub: false,
    });
  }

  async connectAndAuthorize(token: string) {
    runInAction(() => {
        this.status = 'connecting';
    });
    
    this.api = generateDerivApiInstance();
    // wait for socket open
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        this.api?.connection?.removeEventListener?.('open', onOpen);
        resolve();
      };
      const onErr = () => {
        this.api?.connection?.removeEventListener?.('error', onErr);
        reject(new Error('socket error'));
      };
      this.api?.connection?.addEventListener?.('open', onOpen);
      this.api?.connection?.addEventListener?.('error', onErr);
      // fallback timeout
      setTimeout(() => resolve(), 3000); // Increased timeout for stability
    });

    try {
        const { authorize, error } = await this.api.authorize(token);
        if (error) {
          runInAction(() => {
            this.status = 'error';
          });
          throw error;
        }
        
        runInAction(() => {
            this.status = 'connected';
            this.loginId = authorize?.loginid;
            this.currency = authorize?.currency;
        });

        // subscribe to balance
        const res = await this.api.send({ balance: 1, account: 'all', subscribe: 1 });
        runInAction(() => {
            this.balance = res?.balance?.balance;
            this.currency = res?.balance?.currency || this.currency;
        });

        if (res?.subscription?.id) {
          this.balanceSub = this.api
            .onMessage()
            ?.subscribe(({ data }: any) => {
              if (data?.msg_type === 'balance') {
                runInAction(() => {
                    this.balance = data?.balance?.balance;
                    this.currency = data?.balance?.currency || this.currency;
                });
              }
            });
        }
        return authorize;
    } catch (e) {
        runInAction(() => {
            this.status = 'error';
        });
        throw e;
    }
  }

  disconnect() {
    try {
      this.balanceSub?.unsubscribe?.();
    } catch {}
    try {
      this.api?.disconnect?.();
    } catch {}
    runInAction(() => {
        this.status = 'disconnected';
        this.api = null;
        this.balanceSub = null;
    });
  }
}

export class CopyTradingManager {
  master: TMasterState;
  copiers: TCopier[] = [];

  private masterClient: DerivClient | null = null;
  private copierClients: Map<string, DerivClient> = new Map();

  // replication controls
  replicationEnabled = false;
  stakeCap: number | null = null;
  stakeMultiplier: number = 1;

  constructor() {
    makeAutoObservable(this, {
        // @ts-ignore
        masterClient: false,
        // @ts-ignore
        copierClients: false,
    });

    this.master = { token: '', status: 'disconnected' };
    this.copiers = [];
    void this.restoreState();
  }

  async restoreState() {
    try {
      const encMaster = localStorage.getItem(LS_KEYS.MASTER_TOKEN) || '';
      const encCopiers = localStorage.getItem(LS_KEYS.COPIERS) || '';
      const encSettings = localStorage.getItem(LS_KEYS.SETTINGS) || '';
      
      // Attempt to import crypto lazily
      let master = encMaster;
      let copiersRaw = encCopiers;
      let settingsRaw = encSettings;

      try {
        const { decryptText } = await import('./crypto');
        if (encMaster) master = await decryptText(encMaster);
        if (encCopiers) copiersRaw = await decryptText(encCopiers);
        if (encSettings) settingsRaw = await decryptText(encSettings);
      } catch (e) {
        // Fallback to plain text if crypto fails
      }

      runInAction(() => {
          this.master.token = master;
          try { 
              this.copiers = copiersRaw ? JSON.parse(copiersRaw) : []; 
              // Reset status on restore to trigger reconnect
              this.copiers.forEach(c => c.status = 'disconnected');
          } catch { 
              this.copiers = []; 
          }
          
          if (settingsRaw) {
            try {
                const s = JSON.parse(settingsRaw);
                this.replicationEnabled = !!s.replicationEnabled;
                this.stakeCap = s.stakeCap ?? null;
                this.stakeMultiplier = s.stakeMultiplier ?? 1;
            } catch {}
          }
      });
      
      // Auto reconnect all enabled copiers
      this.refreshAll();
    } catch (e) {
        console.error('Failed to restore CopyTradingManager state', e);
    }
  }

  async saveState() {
    try {
      const { encryptText } = await import('./crypto');
      const encMaster = await encryptText(this.master.token || '');
      const encCopiers = await encryptText(JSON.stringify(this.copiers));
      const encSettings = await encryptText(JSON.stringify({
        replicationEnabled: this.replicationEnabled,
        stakeCap: this.stakeCap,
        stakeMultiplier: this.stakeMultiplier,
      }));
      localStorage.setItem(LS_KEYS.MASTER_TOKEN, encMaster);
      localStorage.setItem(LS_KEYS.COPIERS, encCopiers);
      localStorage.setItem(LS_KEYS.SETTINGS, encSettings);
    } catch {
      localStorage.setItem(LS_KEYS.MASTER_TOKEN, this.master.token || '');
      localStorage.setItem(LS_KEYS.COPIERS, JSON.stringify(this.copiers));
      localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify({
        replicationEnabled: this.replicationEnabled,
        stakeCap: this.stakeCap,
        stakeMultiplier: this.stakeMultiplier,
      }));
    }
  }

  setMasterToken(token: string) {
    runInAction(() => {
        this.master.token = token.trim();
    });
    void this.saveState();
  }

  async connectMaster() {
    if (!this.master.token) throw new Error('Missing master token');
    this.masterClient?.disconnect();
    this.masterClient = new DerivClient();
    try {
      await this.masterClient.connectAndAuthorize(this.master.token);
      runInAction(() => {
          this.master.status = 'connected';
          this.master.loginId = this.masterClient?.loginId;
          this.master.balance = this.masterClient?.balance;
          this.master.currency = this.masterClient?.currency;
      });
    } catch (e) {
      runInAction(() => {
          this.master.status = 'error';
      });
      throw e;
    }
  }

  disconnectMaster() {
    this.masterClient?.disconnect();
    runInAction(() => {
        this.master.status = 'disconnected';
    });
  }

  addCopier(token: string) {
    const trimmed = token.trim();
    if (!trimmed) throw new Error('Token required');
    if (this.copiers.some(c => c.token === trimmed)) throw new Error('Token already added');
    
    const copier: TCopier = {
      id: `${Date.now()}`,
      token: trimmed,
      status: 'disconnected',
      addedAt: Date.now(),
      enabled: true,
    };
    
    runInAction(() => {
        this.copiers.push(copier);
    });
    
    void this.saveState();
    void this.connectCopier(copier.id);
    return copier;
  }

  removeCopier(id: string) {
    const copier = this.copiers.find(c => c.id === id);
    if (copier) {
      this.copierClients.get(id)?.disconnect();
      this.copierClients.delete(id);
      runInAction(() => {
          this.copiers = this.copiers.filter(c => c.id !== id);
      });
      void this.saveState();
    }
  }

  async connectCopier(id: string) {
    const copier = this.copiers.find(c => c.id === id);
    if (!copier) throw new Error('Copier not found');
    
    let client = this.copierClients.get(id);
    if (client) client.disconnect();
    
    client = new DerivClient();
    this.copierClients.set(id, client);

    try {
      runInAction(() => {
          copier.status = 'connecting';
      });
      
      await client.connectAndAuthorize(copier.token);
      
      runInAction(() => {
          copier.status = 'connected';
          copier.loginId = client?.loginId;
          copier.balance = client?.balance;
          copier.currency = client?.currency;
          copier.lastErrorCode = undefined;
          copier.lastErrorMsg = undefined;
      });
      
      // Update balance when client balance changes
      // Since DerivClient is observable, we could also just use its properties in the UI directly.
      // But we maintain them in the copier object for persistence and easy listing.
      
      void this.saveState();
    } catch (e: any) {
      runInAction(() => {
          copier.status = 'error';
          copier.lastErrorCode = e?.code || e?.error?.code || 'Error';
          copier.lastErrorMsg = e?.message || e?.error?.message || 'Authorization failed';
      });
      void this.saveState();
      throw e;
    }
  }

  disconnectCopier(id: string) {
    this.copierClients.get(id)?.disconnect();
    // we keep the client in the map but disconnected? No, let's remove it
    this.copierClients.delete(id);
    const copier = this.copiers.find(c => c.id === id);
    if (copier) {
      runInAction(() => {
          copier.status = 'disconnected';
      });
      void this.saveState();
    }
  }

  refreshAll() {
      this.copiers.forEach(c => {
          if (c.enabled && c.status !== 'connected') {
              void this.connectCopier(c.id);
          }
      });
  }

  enableReplication(enable: boolean) {
    runInAction(() => {
        this.replicationEnabled = enable;
    });
    void this.saveState();
  }
  
  setStakeCap(cap: number | null) { 
    runInAction(() => {
        this.stakeCap = cap; 
    });
    void this.saveState(); 
  }
  
  setStakeMultiplier(mult: number) { 
    runInAction(() => {
        this.stakeMultiplier = Math.max(0.01, mult); 
    });
    void this.saveState(); 
  }

  getSettings() {
    return { 
        replicationEnabled: this.replicationEnabled, 
        stakeCap: this.stakeCap, 
        stakeMultiplier: this.stakeMultiplier 
    };
  }
}

const copyTradingManager = new CopyTradingManager();
export default copyTradingManager;

