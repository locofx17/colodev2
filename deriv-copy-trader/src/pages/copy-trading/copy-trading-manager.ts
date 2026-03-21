import { makeAutoObservable, runInAction } from 'mobx';
import { encrypt, decrypt } from '../../utils/crypto';

export type AccountStatus = 'Disconnected' | 'Connecting' | 'Connected' | 'Error';

export interface DerivAccountData {
  id: string;
  token: string;
  name: string;
  balance: number;
  currency: string;
  status: AccountStatus;
  error?: string;
  isActive: boolean;
  multiplier: number;
  stakeCap: number;
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private token: string;
  public accountId: string;
  public balance: number = 0;
  public currency: string = 'USD';
  public status: AccountStatus = 'Disconnected';
  public error?: string;
  public onMessage?: (data: any) => void;

  constructor(token: string, accountId: string) {
    this.token = token;
    this.accountId = accountId;
    makeAutoObservable(this);
  }

  public connect() {
    if (this.ws) return;
    this.status = 'Connecting';
    this.ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

    this.ws.onopen = () => {
      this.authorize();
    };

    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (this.onMessage) this.onMessage(data);

      runInAction(() => {
        if (data.msg_type === 'authorize') {
          if (data.error) {
            this.status = 'Error';
            this.error = data.error.message;
          } else {
            this.status = 'Connected';
            this.balance = data.authorize.balance;
            this.currency = data.authorize.currency;
            this.subscribeBalance();
          }
        }

        if (data.msg_type === 'balance') {
          this.balance = data.balance.balance;
        }
      });
    };

    this.ws.onerror = () => {
      runInAction(() => {
        this.status = 'Error';
        this.error = 'Connection error';
      });
    };

    this.ws.onclose = () => {
      runInAction(() => {
        this.status = 'Disconnected';
        this.ws = null;
      });
    };
  }

  private authorize() {
    this.send({ authorize: this.token });
  }

  private subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  public send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export class CopyTradingManager {
  public master: DerivClient | null = null;
  public copiers: Map<string, DerivClient> = new Map();
  public copierSettings: Map<string, { multiplier: number; stakeCap: number; isActive: boolean }> = new Map();
  public isReplicating: boolean = false;

  constructor() {
    makeAutoObservable(this);
    this.loadFromStorage();
  }

  public connectMaster(token: string) {
    if (this.master) this.master.disconnect();
    this.master = new DerivClient(token, 'master');
    this.master.connect();
    this.saveToStorage();
  }

  public addCopier(token: string) {
    const id = Math.random().toString(36).substr(2, 9);
    const client = new DerivClient(token, id);
    this.copiers.set(id, client);
    this.copierSettings.set(id, { multiplier: 1, stakeCap: 100, isActive: true });
    client.connect();
    this.saveToStorage();
  }

  public removeCopier(id: string) {
    const client = this.copiers.get(id);
    if (client) {
      client.disconnect();
      this.copiers.delete(id);
      this.copierSettings.delete(id);
      this.saveToStorage();
    }
  }

  public toggleCopier(id: string) {
    const settings = this.copierSettings.get(id);
    if (settings) {
      settings.isActive = !settings.isActive;
      this.saveToStorage();
    }
  }

  public setMultiplier(id: string, multiplier: number) {
    const settings = this.copierSettings.get(id);
    if (settings) {
      settings.multiplier = multiplier;
      this.saveToStorage();
    }
  }

  public setStakeCap(id: string, cap: number) {
    const settings = this.copierSettings.get(id);
    if (settings) {
      settings.stakeCap = cap;
      this.saveToStorage();
    }
  }

  public toggleReplication() {
    this.isReplicating = !this.isReplicating;
    this.saveToStorage();
  }

  private saveToStorage() {
    const data = {
      masterToken: this.master ? encrypt((this.master as any).token) : null,
      copiers: Array.from(this.copiers.entries()).map(([id, client]) => ({
        id,
        token: encrypt((client as any).token),
        settings: this.copierSettings.get(id)
      })),
      isReplicating: this.isReplicating
    };
    localStorage.setItem('copy_trading_settings', JSON.stringify(data));
  }

  private loadFromStorage() {
    const saved = localStorage.getItem('copy_trading_settings');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.isReplicating = data.isReplicating;
        if (data.masterToken) {
          this.connectMaster(decrypt(data.masterToken));
        }
        data.copiers.forEach((c: any) => {
          const token = decrypt(c.token);
          const client = new DerivClient(token, c.id);
          this.copiers.set(c.id, client);
          this.copierSettings.set(c.id, c.settings);
          client.connect();
        });
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
  }
}
