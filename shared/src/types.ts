// ========================
// Shared Types — תזמורת AI
// ========================

// --- Sessions & Messages ---

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface Session {
  id: string;
  templateId: string | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
}

export type MessageRole = 'kid' | 'friend' | 'system' | 'conductor';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  text: string;
  audioUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// --- Agents ---

export type AgentCategory = 'fixed' | 'singleton' | 'dynamic';
export type AgentType = 'art' | 'music' | 'story' | 'general';
export type AIProvider = 'gemini' | 'claude' | 'openai';

export interface AgentTemplate {
  id: string;
  name: string;
  type: AgentType;
  category: AgentCategory;
  aiProvider: AIProvider;
  model: string;
  systemPrompt: string;
  specificConfig: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationContext {
  transcript: Message[];
  currentSessionId: string;
  sceneDescription?: string;
  recentMessages: Message[];
}

export interface Intervention {
  agentId: string;
  agentName: string;
  priority: number; // higher = more urgent
  content: string;
  type: 'narrative' | 'visual' | 'instruction' | 'interrupt';
  scheduling: 'silent' | 'idle' | 'interrupt';
  timestamp: string;
}

export type AgentDecision =
  | { type: 'intervene'; intervention: Intervention }
  | { type: 'silent' }
  | { type: 'pre_generate'; prompt: string; sceneId: string };

export interface AgentLog {
  id: string;
  sessionId: string;
  agentId: string;
  input: string;
  output: string;
  decision: AgentDecision['type'];
  createdAt: string;
}

// --- WebSocket Messages ---

export type WebSocketMessageType =
  // Client → Server
  | 'session:start'
  | 'session:stop'
  | 'session:pause'
  | 'audio:chunk'
  | 'transcript:update'
  | 'admin:intervene'
  | 'admin:mode_switch'
  // Server → Client (Kid)
  | 'session:started'
  | 'session:error'
  | 'friend:response'
  | 'image:ready'
  | 'mode:switch'
  // Server → Client (Admin)
  | 'transcript:update'
  | 'agent:log'
  | 'agent:intervention_suggested'
  | 'conductor:status';

export interface WebSocketEnvelope {
  type: WebSocketMessageType;
  payload: Record<string, unknown>;
  timestamp?: string;
}

// --- Adventure Templates ---

export interface AdventureTemplate {
  id: string;
  name: string;
  description: string;
  agentConfigs: Record<string, { systemPrompt: string; config: Record<string, unknown> }>;
  conductorRules: Record<string, unknown>;
  parameters: {
    theme: string;
    visualStyle: string;
    complexity: number;
  };
  createdAt: string;
  updatedAt: string;
}

// --- Generated Images ---

export type ImageStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface GeneratedImage {
  id: string;
  sessionId: string;
  prompt: string;
  filePath: string;
  status: ImageStatus;
  sceneId: string | null;
  createdAt: string;
}

// --- WebSocket Messages typed payloads ---

export interface SessionStartPayload {
  templateId?: string;
}

export interface SessionStartedPayload {
  sessionId: string;
  status: SessionStatus;
}

export interface AdminIntervenePayload {
  content: string;
  targetAgent: string;
  type?: Intervention['type'];
}

export interface TranscriptUpdatePayload {
  message: Message;
}

export interface ImageReadyPayload {
  url: string;
  sceneId: string;
  prompt: string;
}

export interface ModeSwitchPayload {
  mode: 'chat' | 'adventure';
  reason?: string;
  autoApproveMs?: number; // 0 = needs approval
}
