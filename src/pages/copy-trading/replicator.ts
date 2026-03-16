import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import CopyTradingManager from './copy-trading-manager';

// Simple duplicate guard by purchase_reference or timestamp
const recentKeys = new Set<string>();
const RECENT_TTL_MS = 15000;

// Prefer passthrough.purchase_reference if present

type TradeLog = { id: string; accountId: string; payload: any; time: number; error?: string };
const tradeLogs: TradeLog[] = [];
export const getTradeLogs = () => tradeLogs.slice(-50).reverse();

function makeKey(payload: any) {
  const ref = payload?.request?.parameters?.passthrough?.purchase_reference || payload?.request?.passthrough?.purchase_reference;
  return ref || `${payload?.contract_type}-${payload?.request?.buy || ''}-${Date.now()}`;
}

function cleanupKeys() {
  const now = Date.now();
  for (const k of Array.from(recentKeys)) {
    // naive cleanup: entries older than TTL will be removed upon size growth
    if (recentKeys.size > 1000) recentKeys.delete(k);
  }
}

export function initReplicator(manager: CopyTradingManager) {
  const sub = (payload: any) => {
    try {
      const key = makeKey(payload);
      if (recentKeys.has(key)) return;
      recentKeys.add(key);
      setTimeout(() => recentKeys.delete(key), RECENT_TTL_MS);

      // Safety: basic rate guard by spacing out requests per 300ms
      const clients = [manager['masterClient'], ...Array.from(manager['copierClients'].values())].filter(Boolean) as any[];
      const settings = manager.getSettings?.() ?? { replicationEnabled: true, stakeCap: null, stakeMultiplier: 1 };
      if (!settings.replicationEnabled) return;

      // apply stake multiplier/cap if parameters mode
      const reqBase = JSON.parse(JSON.stringify(payload.request || {}));
      if (payload.mode === 'parameters' && reqBase?.parameters?.amount) {
        let amt = Number(reqBase.parameters.amount) * (settings.stakeMultiplier || 1);
        if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
        reqBase.parameters.amount = Number(amt.toFixed(2));
        if (reqBase.price) reqBase.price = reqBase.parameters.amount;
      }

      let delay = 0;
      const copierEntries = Array.from(manager['copierClients'].entries());
      const enabledClients = [
        manager['masterClient'] ? ['master', manager['masterClient']] as const : null,
        ...copierEntries.filter(([id]) => manager.copiers.find(c => c.id === id)?.enabled) as any,
      ].filter(Boolean) as Array<[string, any]>;

      enabledClients.forEach(([id, client]) => {
        setTimeout(async () => {
          try {
            if (!client?.api) return;
            const res = await client.api.send(reqBase);
            tradeLogs.push({ id: String(id), accountId: client.loginId || '', payload: reqBase, time: Date.now() });
          } catch (e: any) {
            tradeLogs.push({ id: String(id), accountId: client.loginId || '', payload: reqBase, time: Date.now(), error: e?.message || 'send failed' });
            // eslint-disable-next-line no-console
            console.warn('Replicator send failed:', id, e);
          }
        }, delay);
        delay += 300; // rate guard spacing
      });

      cleanupKeys();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Replicator error:', e);
    }
  };

  globalObserver.register('replicator.purchase', sub);

  return () => {
    try { globalObserver.unregister('replicator.purchase', sub); } catch {}
  };
}

