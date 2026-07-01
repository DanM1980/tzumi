import { useState, useRef, useCallback } from 'react';
import { GeminiLiveClient } from '../lib/gemini-live-client';
import { AudioCapture } from '../lib/audio-capture';
import { AudioPlayer } from '../lib/audio-player';
import { buildSystemPrompt } from '../lib/system-prompt';
import { getMicrophoneBlockReason } from '../lib/media-support';
import type { AgentStatus } from '../lib/types';
import styles from './KidView.module.css';

export default function KidView() {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const activeRef = useRef(false);

  const teardown = useCallback(() => {
    activeRef.current = false;
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

      client.connect({
        token,
        model,
        systemPrompt: buildSystemPrompt(),
        handlers: {
          onStatus: (s) => { if (activeRef.current) setStatus(s); },
          onTranscript: () => {
            // Transcript hidden from kid view
          },
          onTurnComplete: () => {
            // no-op
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

      // 5. Start capture
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
  }, [teardown]);

  const handleStop = useCallback(() => {
    teardown();
  }, [teardown]);

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
