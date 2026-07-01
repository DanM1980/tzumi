import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import styles from './AdminView.module.css';

interface LogEntry {
  agentId: string;
  decision: string;
  content: string;
  priority: number;
  timestamp: string;
}

interface TranscriptMsg {
  id: string;
  sessionId: string;
  role: string;
  text: string;
  createdAt: string;
}

export default function AdminView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMsg[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [interventionText, setInterventionText] = useState('');
  const [conductorStatus, setConductorStatus] = useState<string>('ממתין...');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleMessage = useCallback((msg: { type: string; payload: Record<string, unknown> }) => {
    switch (msg.type) {
      case 'transcript:update': {
        const message = msg.payload.message as TranscriptMsg;
        setMessages(prev => [...prev, message]);
        break;
      }
      case 'agent:log': {
        const log: LogEntry = {
          agentId: msg.payload.agentId as string,
          decision: msg.payload.decision as string,
          content: msg.payload.content as string,
          priority: msg.payload.priority as number,
          timestamp: new Date().toLocaleTimeString(),
        };
        setLogs(prev => [log, ...prev]);
        break;
      }
      case 'conductor:status': {
        setConductorStatus(`${msg.payload.agentName}: ${(msg.payload.content as string).substring(0, 80)}...`);
        break;
      }
    }
  }, []);

  const { send, connected } = useWebSocket({
    type: 'admin',
    onMessage: handleMessage,
    onConnected: () => {
      send('session:start', {});
    },
  });

  const handleIntervene = () => {
    if (!interventionText.trim()) return;
    send('admin:intervene', { content: interventionText });
    setLogs(prev => [{
      agentId: 'parent',
      decision: 'intervene',
      content: interventionText,
      priority: 5,
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev]);
    setInterventionText('');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>🎼 ניהול תזמורת AI</h1>
        <div className={styles.status}>
          <div className={`${styles.dot} ${connected ? styles.online : styles.offline}`} />
          <span>{connected ? 'מחובר' : 'מתנתק...'}</span>
          {sessionId && <span className={styles.sessionId}>סשן: {sessionId.substring(0, 8)}...</span>}
        </div>
      </header>

      <div className={styles.grid}>
        {/* Transcript Panel */}
        <div className={`${styles.panel} ${styles.transcriptPanel}`}>
          <h2 className={styles.panelTitle}>📝 תמלול שיחה</h2>
          <div className={styles.transcriptList}>
            {messages.length === 0 && (
              <p className={styles.emptyState}>מחכה לתמלול...</p>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`${styles.msg} ${styles[`role_${msg.role}`]}`}>
                <span className={styles.msgRole}>
                  {msg.role === 'kid' ? '🧒 ילדה' : msg.role === 'friend' ? '🦄 חבר' : '⚙️ מערכת'}
                </span>
                <span className={styles.msgText}>{msg.text}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Agent Logs Panel */}
        <div className={`${styles.panel} ${styles.logsPanel}`}>
          <h2 className={styles.panelTitle}>🤖 פעילות סוכנים</h2>
          <div className={styles.logsList}>
            {logs.length === 0 && (
              <p className={styles.emptyState}>מחכה לפעילות סוכנים...</p>
            )}
            {logs.map((log, idx) => (
              <div key={idx} className={styles.logEntry}>
                <div className={styles.logHeader}>
                  <span className={styles.logAgent}>
                    {log.agentId === 'parent' ? '👩‍👧‍👦 הורה' : '🤖 ' + log.agentId}
                  </span>
                  <span className={styles.logTime}>{log.timestamp}</span>
                  <span className={`${styles.logPriority} ${log.priority >= 4 ? styles.highPriority : ''}`}>
                    דחיפות: {log.priority}
                  </span>
                </div>
                <p className={styles.logContent}>{log.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Conductor Status */}
        <div className={`${styles.panel} ${styles.conductorPanel}`}>
          <h2 className={styles.panelTitle}>🎯 סטטוס מנצח</h2>
          <p className={styles.conductorStatus}>{conductorStatus}</p>
        </div>

        {/* Intervention Panel */}
        <div className={`${styles.panel} ${styles.interventionPanel}`}>
          <h2 className={styles.panelTitle}>🎤 התערבות בזמן אמת</h2>
          <div className={styles.interventionInput}>
            <textarea
              className={styles.textarea}
              placeholder="כתבי מה את רוצה שהמנצח ילחוש לחבר..."
              value={interventionText}
              onChange={(e) => setInterventionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleIntervene();
                }
              }}
            />
            <button className={styles.sendButton} onClick={handleIntervene}>
              שלחי לחבר
            </button>
          </div>
          <div className={styles.quickActions}>
            <button className={styles.quickBtn} onClick={() => {
              setInterventionText('בואו נדבר על דינוזאורים! 🦕');
            }}>🦕 דינוזאורים</button>
            <button className={styles.quickBtn} onClick={() => {
              setInterventionText('בואו נטוס לירח! 🌙');
            }}>🌙 לטוס לירח</button>
            <button className={styles.quickBtn} onClick={() => {
              setInterventionText('בואו נכיר חבר חדש! 🧸');
            }}>🧸 חבר חדש</button>
          </div>
        </div>
      </div>
    </div>
  );
}
