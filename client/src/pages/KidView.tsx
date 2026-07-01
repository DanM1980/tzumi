import { useState, useRef, useCallback, useEffect } from 'react';
import { GeminiLiveClient } from '../lib/gemini-live-client';
import { AudioCapture } from '../lib/audio-capture';
import { AudioPlayer } from '../lib/audio-player';
import { buildSystemPrompt } from '../lib/system-prompt';
import { getMicrophoneBlockReason } from '../lib/media-support';
import { useWebSocket } from '../hooks/useWebSocket';
import type { AgentStatus } from '../lib/types';
import type { WebSocketMessage } from '../hooks/useWebSocket';
import styles from './KidView.module.css';

export default function KidView() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const activeRef = useRef(false);
  const sessionStartedRef = useRef(false);

  // ── Server WebSocket connection (so transcripts reach the conductor) ──
  const { send: wsSend, connected: wsConnected } = useWebSocket({
    type: 'kid',
    onMessage: useCallback((msg: WebSocketMessage) => {
      switch (msg.type) {
        case 'session:started': {
          console.log('[Kid] Session started on server:', msg.payload.sessionId);
          break;
        }
        case 'session:error': {
          console.error('[Kid] Session error:', msg.payload.error);
          break;
        }
        case 'friend:response': {
          const text = (msg.payload.message as Record<string, unknown>)?.text as string;
          console.log('[Kid] Server friend response:', text?.substring(0, 80));
          break;
        }
        case 'whisper:inject': {
          // Parent intervention: inject into Gemini Live stream
          const text = msg.payload.text as string;
          console.log('[Kid] Injecting whisper:', text?.substring(0, 80));
          if (text && clientRef.current?.ready) {
            clientRef.current.injectText(text);
          }
          break;
        }
      }
    }, []),
    onConnected: useCallback(() => {
      console.log('[Kid] WS connected');
    }, []),
    onDisconnected: useCallback(() => {
      console.log('[Kid] WS disconnected');
    }, []),
  });

  // Track wsConnected in a ref so we can use it inside Gemini Live callbacks
  const wsConnectedRef = useRef(false);
  useEffect(() => {
    wsConnectedRef.current = wsConnected;
  }, [wsConnected]);

  // Start server session as soon as WS connects (so kid has a sessionId for transcript forwarding)
  useEffect(() => {
    if (wsConnected && !sessionStartedRef.current) {
      sessionStartedRef.current = true;
      wsSend('session:start', {});
    }
  }, [wsConnected, wsSend]);

  const teardown = useCallback(() => {
    activeRef.current = false;
    sessionStartedRef.current = false;
    captureRef.current?.stop();
    captureRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    setStatus('idle');
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    activeRef.current = true;

    const blockReason = getMicrophoneBlockReason();
    if (blockReason) {
      setError(blockReason);
      return;
    }

    try {
      // 1. Fetch token from our server
      setStatus('connecting');
      const tokenRes = await fetch('/api/live-token', { method: 'POST' });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body.error || `שגיאה בקבלת token (${tokenRes.status})`);
      }
      const { token, model } = await tokenRes.json() as { token: string; model: string };

      // 2. Init audio player
      const player = new AudioPlayer();
      playerRef.current = player;
      player.init(() => {
        if (!activeRef.current) return;
        setStatus('listening');
      });

      // 3. Init Gemini Live client
      const client = new GeminiLiveClient();
      clientRef.current = client;

      // 4. Init audio capture (will start after greeting)
      const capture = new AudioCapture();
      captureRef.current = capture;

      // Accumulate transcript text per turn (for forwarding to server on turn completion)
      let turnUserText = '';
      let turnAgentText = '';

      client.connect({
        token,
        model,
        systemPrompt: buildSystemPrompt(),
        handlers: {
          onStatus: (s) => { if (activeRef.current) setStatus(s); },
          onTranscript: (role, textChunk) => {
            // Accumulate transcript chunks until turn completes
            if (role === 'user') {
              turnUserText += textChunk + ' ';
            } else {
              turnAgentText += textChunk + ' ';
            }
          },
          onTurnComplete: () => {
            // Forward accumulated transcripts to the server agent cycle
            const userText = turnUserText.trim();
            const agentText = turnAgentText.trim();

            if (userText && wsConnectedRef.current) {
              wsSend('transcript:update', {
                role: 'kid',
                text: userText,
              });
            }
            if (agentText && wsConnectedRef.current) {
              wsSend('transcript:update', {
                role: 'friend',
                text: agentText,
              });
            }

            turnUserText = '';
            turnAgentText = '';
          },
          onAudioChunk: (pcm) => {
            player.enqueue(pcm);
          },
          onInterrupted: () => {
            player.flush();
          },
          onError: (msg) => {
            if (!activeRef.current) return;
            setError(msg);
            setStatus('error');
          },
          onClose: () => {
            if (!activeRef.current) return;
            teardown();
          },
        },
      });

      // 5. Start capture (sends mic audio to Gemini Live)
      await capture.start({
        onChunk: (b64) => client.sendAudioChunk(b64),
      });

    } catch (err) {
      if (!activeRef.current) return;
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      setError(msg);
      setStatus('error');
      teardown();
    }
  }, [teardown, wsSend]);

  const handleStop = useCallback(() => {
    if (sessionStartedRef.current) {
      sessionStartedRef.current = false;
      wsSend('session:stop', {});
    }
    teardown();
  }, [teardown, wsSend]);

  const isSpeaking = status === 'speaking';
  const isActive = status === 'connecting' || status === 'listening' || status === 'thinking' || status === 'speaking';

  return (
    <div className={styles.container}>
      {/* Status Bar */}
      <div className={styles.statusBar}>
        <div className={`${styles.statusDot} ${isActive ? styles.online : styles.offline}`} />
        <span>
          {status === 'idle' && 'לחצ/י על הכפתור להתחלת שיחה'}
          {status === 'connecting' && 'מתחברת...'}
          {status === 'listening' && 'מקשיבה...'}
          {status === 'thinking' && 'חושבת...'}
          {status === 'speaking' && 'מדברת...'}
          {status === 'error' && 'שגיאה'}
        </span>
      </div>

      {/* Main Content — Avatar */}
      <div className={styles.main}>
        <div className={styles.avatarSection}>
          <div className={`${styles.avatar} ${isSpeaking ? styles.avatarTalking : ''}`}>
            <span className={styles.avatarEmoji}>🦄</span>
          </div>
          <p className={styles.friendName}>קסם</p>
          {isSpeaking && (
            <div className={styles.speakingIndicator}>
              <span className={styles.wave}></span>
              <span className={styles.wave}></span>
              <span className={styles.wave}></span>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Start / Stop Button */}
      <button
        className={`${styles.talkButton} ${isActive ? styles.talkButtonActive : ''}`}
        onClick={isActive ? handleStop : handleStart}
      >
        {isActive ? '⏹ סיום שיחה' : '🎤 התחלת שיחה'}
      </button>
    </div>
  );
}
