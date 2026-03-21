import { CopyTradingManager } from './copy-trading-manager';
import { makeAutoObservable, runInAction } from 'mobx';

export interface TradeLog {
  id: string;
  masterTradeId: string;
  copierId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
  error?: string;
  timestamp: number;
}

export class Replicator {
  private manager: CopyTradingManager;
  public tradeLogs: TradeLog[] = [];
  private processedTrades: Set<string> = new Set();

  constructor(manager: CopyTradingManager) {
    this.manager = manager;
    makeAutoObservable(this);
  }

  public init() {
    // In a real app, this would be an event listener from the bot skeleton
    // For this demo, we'll expose a method to trigger it
    window.addEventListener('replicator.purchase', (event: any) => {
      const { tradeData } = event.detail;
      this.replicate(tradeData);
    });
  }

  private async replicate(masterTrade: any) {
    if (!this.manager.isReplicating) return;
    if (this.processedTrades.has(masterTrade.contract_id)) return;
    this.processedTrades.add(masterTrade.contract_id);

    const copiers = Array.from(this.manager.copiers.entries());

    for (const [id, client] of copiers) {
      const settings = this.manager.copierSettings.get(id);
      if (!settings || !settings.isActive) continue;

      // Rate limiter: 300ms delay
      await new Promise(resolve => setTimeout(resolve, 300));

      const stake = Math.min(masterTrade.amount * settings.multiplier, settings.stakeCap);

      const log: TradeLog = {
        id: Math.random().toString(36).substr(2, 9),
        masterTradeId: masterTrade.contract_id,
        copierId: id,
        symbol: masterTrade.symbol,
        action: masterTrade.action,
        amount: stake,
        status: 'PENDING',
        timestamp: Date.now()
      };

      runInAction(() => {
        this.tradeLogs.unshift(log);
        if (this.tradeLogs.length > 50) this.tradeLogs.pop();
      });

      try {
        // Execute trade on copier
        client.send({
          buy: masterTrade.symbol, // This is a simplified buy request
          price: stake,
          parameters: {
            contract_type: masterTrade.contract_type,
            symbol: masterTrade.symbol,
            duration: masterTrade.duration,
            duration_unit: masterTrade.duration_unit,
            basis: 'stake',
            amount: stake,
            currency: client.currency
          }
        });

        runInAction(() => {
          log.status = 'SUCCESS';
        });
      } catch (e: any) {
        runInAction(() => {
          log.status = 'ERROR';
          log.error = e.message;
        });
      }
    }
  }
}

export const initReplicator = (manager: CopyTradingManager) => {
  const replicator = new Replicator(manager);
  replicator.init();
  return replicator;
};
