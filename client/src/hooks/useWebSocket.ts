import { useEffect, useRef, useCallback, useState } from 'react';

interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type MessageHandler = (msg: WebSocketMessage) => void;

interface UseWebSocketOptions {
  type: 'kid' | 'admin';
  onMessage?: MessageHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;

export function useWebSocket({ type, onMessage, onConnected, onDisconnected }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const connectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  // Store callbacks in refs to avoid re-connecting when they change
  const onMessageRef = useRef(onMessage);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  onMessageRef.current = onMessage;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws?type=${type}`;
    console.log(`[WS ${type}] Connecting to ${url}...`);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    connectAttemptRef.current++;

    ws.onopen = () => {
      console.log(`[WS ${type}] Connected`);
      setConnected(true);
      connectAttemptRef.current = 0; // Reset on successful connection
      setTimeout(() => onConnectedRef.current?.(), 100);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage;
        onMessageRef.current?.(msg);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WS ${type}] Disconnected (code: ${event.code})`);
      setConnected(false);
      onDisconnectedRef.current?.();

      // Auto-reconnect with exponential backoff
      if (shouldReconnectRef.current && event.code !== 1000 && connectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, connectAttemptRef.current - 1);
        console.log(`[WS ${type}] Reconnecting in ${delay}ms (attempt ${connectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose
    };
  }, [type]);

  const send = useCallback((msgType: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: msgType,
        payload,
        timestamp: new Date().toISOString(),
      }));
    }
  }, []);

  useEffect(() => {
    // Prevent re-connecting if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    shouldReconnectRef.current = true;
    connect();

    return () => {
      console.log(`[WS ${type}] Cleanup`);
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, [type, connect]);

  return { send, connected };
}
