import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { v4 as uuid } from 'uuid';
import { GoogleGenAI } from '@google/genai';

// Load .env
config();

// Internal imports
import { initDb, getDb } from './db/index.js';
import { WebSocketManager } from './websocket/ws-manager.js';
import { GeminiProvider } from './ai-providers/gemini.js';
import { StoryAgent } from './agents/story.agent.js';
import { FriendAgent } from './agents/friend.agent.js';
import { Conductor } from './orchestrator/conductor.js';
import type { ConversationContext, Intervention, Message, MessageRole } from '../../shared/src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Init ───────────────────────────────────────────────────
console.log('[Boot] Initializing database...');
initDb();

console.log('[Boot] Setting up AI providers...');
const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) {
  console.error('[FATAL] GEMINI_API_KEY not set in .env');
  process.exit(1);
}

const conductorProvider = new GeminiProvider({
  apiKey: geminiKey,
  model: process.env.CONDUCTOR_MODEL || 'gemini-2.5-flash-live-preview',
  temperature: 0.7,
});

const storyProvider = new GeminiProvider({
  apiKey: geminiKey,
  model: process.env.STORY_MODEL || 'gemini-2.5-flash-live-preview',
  temperature: 0.9,
});

const friendProvider = new GeminiProvider({
  apiKey: geminiKey,
  model: process.env.FRIEND_MODEL || 'gemini-2.5-flash-live-preview',
  temperature: 0.8,
});

// ─── Agents ──────────────────────────────────────────────────
const storyAgent = new StoryAgent(storyProvider);
const friendAgent = new FriendAgent(friendProvider);
const conductor = new Conductor(conductorProvider);

// ─── Express + WebSocket ────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wsManager = new WebSocketManager(server);

// Serve static images (for future use)
app.use('/images', express.static(path.join(__dirname, '..', 'output', 'images')));

// ─── Production: serve built client ──────────────────────
const isProd = process.env.NODE_ENV === 'production';
const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (isProd) {
  console.log('[Boot] NODE_ENV=production — serving static client...');
  app.use(express.static(clientDistPath));
  // Fallback to index.html for client-side routing (React Router)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.log('[Boot] Development mode — not serving static client');
}

// ─── REST Endpoints ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/** התחלה: מחזיר token אפמרי ל-Gemini Multimodal Live API */
app.post('/api/live-token', async (_req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY not set in .env' });
    return;
  }

  const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest';
  const now = Date.now();
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
      },
    });

    if (token?.name) {
      res.json({ token: token.name, model });
      return;
    }
  } catch (err) {
    console.warn('[live-token] SDK failed, trying REST fallback:', err);
  }

  // Fallback: REST
  try {
    const fbRes = await fetch(
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
        }),
      },
    );

    if (!fbRes.ok) {
      const detail = await fbRes.text();
      res.status(502).json({ error: `Token creation failed (${fbRes.status}): ${detail}` });
      return;
    }

    const data = (await fbRes.json()) as { name?: string };
    if (!data.name) {
      res.status(502).json({ error: 'No token in response' });
      return;
    }

    res.json({ token: data.name, model });
  } catch (err) {
    res.status(500).json({ error: `Token creation error: ${(err as Error).message}` });
  }
});

app.post('/api/session/start', (req, res) => {
  const { templateId } = req.body;
  const db = getDb();

  const sessionId = uuid();
  db.prepare(
    'INSERT INTO sessions (id, template_id, status) VALUES (?, ?, ?)'
  ).run(sessionId, templateId || null, 'active');

  res.json({ sessionId, status: 'active' });
});

// ─── WebSocket Message Handlers ────────────────────────────
wsManager.on('session:start', async (client, _type, payload) => {
  try {
    const db = getDb();

    const sessionId = uuid();
    client.sessionId = sessionId;

    db.prepare(
      'INSERT INTO sessions (id, template_id, status) VALUES (?, ?, ?)'
    ).run(sessionId, payload.templateId || null, 'active');

    // Init agents
    await storyAgent.init(sessionId);
    await friendAgent.init(sessionId);

    wsManager.send(client.id, 'session:started', {
      sessionId,
      status: 'active',
    });

    console.log(`[Session] Started: ${sessionId} for client ${client.id}`);

    // Send an instant welcome greeting (no AI dependency)
    const welcomeText = 'היי! 🦄 אני קסם! איך קוראים לך?';
    const greetingMsgId = uuid();
    db.prepare(
      `INSERT INTO messages (id, session_id, role, text, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).run(greetingMsgId, sessionId, 'friend', welcomeText, null);
    wsManager.send(client.id, 'friend:response', {
      message: {
        id: greetingMsgId,
        sessionId,
        role: 'friend',
        text: welcomeText,
        createdAt: new Date().toISOString(),
      },
    });
    wsManager.sendToSession(sessionId, 'transcript:update', {
      message: {
        id: greetingMsgId,
        sessionId,
        role: 'friend',
        text: welcomeText,
        createdAt: new Date().toISOString(),
      },
    });

    // Then try to generate an AI greeting (non-blocking — if it fails, the hardcoded one is already shown)
    friendAgent.generateResponse({
      transcript: [],
      currentSessionId: sessionId,
      recentMessages: [{
        id: '',
        sessionId,
        role: 'system',
        text: 'הילדה התחברה להרפתקה חדשה!',
        audioUrl: null,
        metadata: null,
        createdAt: new Date().toISOString(),
      }],
    }).then((aiGreeting) => {
      if (aiGreeting && aiGreeting !== welcomeText) {
        const aiMsgId = uuid();
        db.prepare(
          `INSERT INTO messages (id, session_id, role, text, metadata)
           VALUES (?, ?, ?, ?, ?)`
        ).run(aiMsgId, sessionId, 'friend', aiGreeting, null);
        wsManager.send(client.id, 'friend:response', {
          message: {
            id: aiMsgId,
            sessionId,
            role: 'friend',
            text: aiGreeting,
            createdAt: new Date().toISOString(),
          },
        });
        console.log(`[FriendAgent] AI Greeting: ${aiGreeting.substring(0, 100)}...`);
      }
    }).catch((err) => {
      console.log('[FriendAgent] AI greeting skipped (using hardcoded):', err?.message);
    });
  } catch (err) {
    console.error(`[Session] Error starting session for ${client.id}:`, err);
    wsManager.send(client.id, 'session:error', { error: 'Failed to start session' });
  }
});

wsManager.on('session:stop', (client, _type, _payload) => {
  if (!client.sessionId) return;
  const db = getDb();

  db.prepare(
    'UPDATE sessions SET status = ?, ended_at = datetime("now") WHERE id = ?'
  ).run('completed', client.sessionId);

  console.log(`[Session] Ended: ${client.sessionId}`);
});

wsManager.on('transcript:update', async (client, _type, payload) => {
  if (!client.sessionId) {
    console.log(`[Transcript] Ignored — no sessionId for client ${client.id}`);
    return;
  }

  console.log(`[Transcript] Received from ${client.id}:`, JSON.stringify(payload).substring(0, 200));

  const db = getDb();

  // Save message to DB
  const msgId = uuid();
  db.prepare(
    `INSERT INTO messages (id, session_id, role, text, metadata)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    msgId,
    client.sessionId,
    payload.role || 'kid',
    payload.text || '',
    payload.metadata ? JSON.stringify(payload.metadata) : null,
  );

  // Forward transcript to admin clients
  wsManager.sendToSession(client.sessionId, 'transcript:update', {
    message: {
      id: msgId,
      sessionId: client.sessionId,
      role: payload.role || 'kid',
      text: payload.text || '',
      audioUrl: payload.audioUrl || null,
      metadata: payload.metadata || null,
      createdAt: new Date().toISOString(),
    },
  });

  // Run agent loop (fire-and-forget with error handling)
  console.log(`[AgentCycle] Starting for session ${client.sessionId}...`);
  runAgentCycle(client.sessionId).catch((err) => {
    console.error(`[AgentCycle] Error for session ${client.sessionId}:`, err);
  });
});

wsManager.on('admin:intervene', (client, _type, payload) => {
  if (!client.sessionId) return;

  const content = (payload.content as string) || '';
  conductor.addParentInstruction(content);

  console.log(`[Conductor] Parent intervention: "${content.substring(0, 50)}..."`);
});

// ─── Agent Cycle ────────────────────────────────────────────

async function runAgentCycle(sessionId: string): Promise<void> {
  const db = getDb();

  // Build context from recent messages
  const rows = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(sessionId) as Record<string, unknown>[];

  const recentMessages: Message[] = rows.reverse().map((r: Record<string, unknown>) => ({
    id: r.id as string,
    sessionId: r.session_id as string,
    role: r.role as MessageRole,
    text: r.text as string,
    audioUrl: (r.audio_url as string | null) ?? null,
    metadata: r.metadata ? (JSON.parse(r.metadata as string) as Record<string, unknown>) : null,
    createdAt: r.created_at as string,
  }));

  const context: ConversationContext = {
    transcript: recentMessages,
    currentSessionId: sessionId,
    recentMessages,
  };

  // 1. Agents listen
  await storyAgent.listen(context);
  await friendAgent.listen(context);

  // 2. Agents decide
  const storyIntervention = await storyAgent.decide();
  if (storyIntervention) {
    conductor.addIntervention(storyIntervention);
    logAgentDecision(sessionId, storyAgent.id, context, storyIntervention);
  }

  // 3. Conductor decides what to whisper
  const whisper = await conductor.decide(context);
  if (whisper) {
    logAgentDecision(sessionId, 'conductor', context, whisper);

    // Send to admin clients for visibility
    wsManager.sendToSession(sessionId, 'conductor:status', {
      action: 'whisper',
      agentName: whisper.agentName,
      content: whisper.content,
    });

    // Pass whisper to friend agent
    friendAgent.setWhisper(whisper.content);
    console.log(`[Conductor] Whisper to friend: [${whisper.agentName}] ${whisper.content.substring(0, 80)}...`);
  }

  // 4. Friend agent generates a spoken response
  const friendResponse = await friendAgent.generateResponse();
  if (friendResponse) {
    // Save to DB
    const msgId = uuid();
    db.prepare(
      `INSERT INTO messages (id, session_id, role, text, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).run(msgId, sessionId, 'friend', friendResponse, null);

    // Send to all clients in the session
    wsManager.sendToSession(sessionId, 'friend:response', {
      message: {
        id: msgId,
        sessionId,
        role: 'friend',
        text: friendResponse,
        createdAt: new Date().toISOString(),
      },
    });

    // Also forward to admin as transcript
    wsManager.sendToSession(sessionId, 'transcript:update', {
      message: {
        id: msgId,
        sessionId,
        role: 'friend',
        text: friendResponse,
        createdAt: new Date().toISOString(),
      },
    });

    console.log(`[FriendAgent] Response: ${friendResponse.substring(0, 100)}...`);
  }
}

function logAgentDecision(
  sessionId: string,
  agentId: string,
  context: ConversationContext,
  intervention: Intervention,
): void {
  const db = getDb();

  const inputText = context.recentMessages.slice(-3).map(m => `${m.role}: ${m.text}`).join('\n');

  db.prepare(
    `INSERT INTO agent_logs (id, session_id, agent_id, input, output, decision)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    sessionId,
    agentId,
    inputText.substring(0, 500),
    intervention.content.substring(0, 500),
    'intervene',
  );

  // Notify admin clients
  wsManager.sendToSession(sessionId, 'agent:log', {
    agentId,
    decision: 'intervene',
    content: intervention.content,
    priority: intervention.priority,
  });
}

// ─── Start ──────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] WebSocket ready`);
});
