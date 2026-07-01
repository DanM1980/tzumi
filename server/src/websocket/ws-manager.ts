import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuid } from 'uuid';

type ClientType = 'kid' | 'admin' | 'unknown';

interface ClientInfo {
  ws: WebSocket;
  id: string;
  type: ClientType;
  sessionId: string | null;
}

type MessageHandler = (client: ClientInfo, type: string, payload: Record<string, unknown>) => void;

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, ClientInfo> = new Map();
  private handlers: Map<string, MessageHandler[]> = new Map();

  constructor(server: any) {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const client = this.createClient(ws, req);
      this.clients.set(client.id, client);

      console.log(`[WS] Client connected: ${client.id} (${client.type})`);

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          const { type, payload } = msg;
          this.handleMessage(client, type, payload);
        } catch (err) {
          console.error('[WS] Invalid message:', err);
        }
      });

      ws.on('close', () => {
        console.log(`[WS] Client disconnected: ${client.id}`);
        this.clients.delete(client.id);
      });

      ws.on('error', (err) => {
        console.error(`[WS] Error for ${client.id}:`, err.message);
        this.clients.delete(client.id);
      });
    });
  }

  private createClient(ws: WebSocket, req: IncomingMessage): ClientInfo {
    const url = new URL(req.url || '/', 'http://localhost');
    const clientType = url.searchParams.get('type') as ClientType || 'unknown';

    return {
      ws,
      id: uuid(),
      type: clientType,
      sessionId: null,
    };
  }

  on(type: string, handler: MessageHandler): void {
    const existing = this.handlers.get(type) || [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  private handleMessage(client: ClientInfo, type: string, payload: Record<string, unknown>): void {
    const handlers = this.handlers.get(type) || [];
    for (const handler of handlers) {
      handler(client, type, payload);
    }
  }

  /** שליחת הודעה ללקוח ספציפי */
  send(clientId: string, type: string, payload: Record<string, unknown>): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    }
  }

  /** שליחת הודעה לכל הלקוחות מסוג מסוים */
  broadcast(type: string, payload: Record<string, unknown>, clientType?: ClientType): void {
    const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (!clientType || client.type === clientType) {
          client.ws.send(msg);
        }
      }
    }
  }

  /** שליחת הודעה לכל הלקוחות בסשן מסוים */
  sendToSession(sessionId: string, type: string, payload: Record<string, unknown>): void {
    const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN && client.sessionId === sessionId) {
        client.ws.send(msg);
      }
    }
  }

  getClient(clientId: string): ClientInfo | undefined {
    return this.clients.get(clientId);
  }

  getClientsByType(type: ClientType): ClientInfo[] {
    return Array.from(this.clients.values()).filter(c => c.type === type);
  }

  getAdminClients(): ClientInfo[] {
    return this.getClientsByType('admin');
  }
}
