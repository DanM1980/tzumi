export type Role = "user" | "agent";

export interface TranscriptEntry {
  id: string;
  role: Role;
  text: string;
  pending: boolean;
}

export type AgentStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface LiveTokenResponse {
  token: string;
  model: string;
}

export interface LiveClientHandlers {
  onStatus: (status: AgentStatus) => void;
  onTranscript: (role: Role, textChunk: string) => void;
  onTurnComplete: () => void;
  onAudioChunk: (pcm: ArrayBuffer) => void;
  onInterrupted: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}
