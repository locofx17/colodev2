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
            this.socket = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=108647');

            this.socket.onopen = () => {
                this.isConnected = true;
                console.log('Connected to Deriv WS');
                this.processQueue();
                resolve(true);
            };

            this.socket.onmessage = event => {
                const data = JSON.parse(event.data);
                this.onMessageCallback(data);
            };

            this.socket.onclose = () => {
                this.isConnected = false;
                console.log('Disconnected from Deriv WS');
            };

            this.socket.onerror = error => {
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

    getTicksHistory(symbol: string, count: number) {
        this.send({
            ticks_history: symbol,
            count: count,
            end: 'latest',
            style: 'ticks',
        });
    }

    buy(price: number, parameters: any) {
        this.send({
            buy: 1,
            price: price,
            parameters: parameters,
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
    }
}
