import { createContext, useContext } from 'react';
import { CopyTradingManager } from '../pages/copy-trading/copy-trading-manager';
import { initReplicator, Replicator } from '../pages/copy-trading/replicator';

export class RootStore {
  public copy_trading: CopyTradingManager;
  public replicator: Replicator;

  constructor() {
    this.copy_trading = new CopyTradingManager();
    this.replicator = initReplicator(this.copy_trading);
  }
}

export const rootStore = new RootStore();
export const RootStoreContext = createContext<RootStore>(rootStore);

export const useStore = () => {
  const context = useContext(RootStoreContext);
  if (!context) {
    throw new Error('useStore must be used within a RootStoreProvider');
  }
  return context;
};
