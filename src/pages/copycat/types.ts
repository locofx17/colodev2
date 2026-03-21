export interface DerivAccount {
  id: string;
  name: string;
  token: string;
  type: 'master' | 'copier';
  accountType: 'demo' | 'real';
  balance: number;
  currency: string;
  loginId: string;
  isActive: boolean;
  error?: string;
  totalProfit: number;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
}

export interface TradeLog {
  id: string;
  masterAccountId: string;
  copierAccountId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  amount: number;
  profit?: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'WON' | 'LOST';
  timestamp: number;
  error?: string;
  masterTradeId?: number;
  copierTradeId?: number;
}

export interface DerivMessage {
  msg_type: string;
  [key: string]: any;
}
