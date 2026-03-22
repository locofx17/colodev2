/**
 * Lightweight DerivAPI wrapper for the Sniper feature.
 * Uses the Deriv WebSocket API for tick subscriptions.
 */

const WS_URL = 'wss://ws.derivws.com/websockets/v3?app_id=1089';

type MessageHandler = (data: Record<string, unknown>) => void;

export class DerivAPI {
    private ws: WebSocket | null = null;
    private messageHandler: MessageHandler;

    constructor(messageHandler: MessageHandler) {
        this.messageHandler = messageHandler;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.messageHandler(data);
                } catch (_) { /* ignore parse errors */ }
            };
        });
    }

    authorize(token: string): void {
        this.send({ authorize: token });
    }

    subscribeTicks(symbol: string): void {
        this.send({ ticks: symbol, subscribe: 1 });
    }

    getHistory(symbol: string, count = 200): void {
        this.send({
            ticks_history: symbol,
            count,
            end: 'latest',
            style: 'ticks',
        });
    }

    send(data: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }
}
