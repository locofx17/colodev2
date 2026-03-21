/**
 * Deriv API Service using WebSockets
 */

export class DerivAPI {
  private socket: WebSocket | null = null;
  private onMessageCallback: (data: any) => void;
  private isConnected: boolean = false;
  private messageQueue: any[] = [];

  constructor(onMessage: (data: any) => void) {
    this.onMessageCallback = onMessage;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');

      this.socket.onopen = () => {
        this.isConnected = true;
        console.log('Connected to Deriv WS');
        this.processQueue();
        resolve(true);
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.onMessageCallback(data);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        console.log('Disconnected from Deriv WS');
      };

      this.socket.onerror = (error) => {
        console.error('Deriv WS Error:', error);
        reject(error);
      };
    });
  }

  private processQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const msg = this.messageQueue.shift();
      this.send(msg);
    }
  }

  send(data: any) {
    if (this.isConnected && this.socket) {
      this.socket.send(JSON.stringify(data));
    } else {
      this.messageQueue.push(data);
    }
  }

  authorize(token: string) {
    this.send({ authorize: token });
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks(symbol: string) {
    this.send({ ticks: symbol, subscribe: 1 });
  }

  buy(symbol: string, amount: number, type: string = 'CALL') {
    this.send({
      buy: 1,
      price: amount,
      parameters: {
        amount: amount,
        basis: 'stake',
        contract_type: type,
        currency: 'USD',
        duration: 1,
        duration_unit: 'm',
        symbol: symbol,
      },
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}
