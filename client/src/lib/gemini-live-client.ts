import { buildLiveWebSocketUrl } from "./config";
import type { LiveClientHandlers } from "./types";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface ConnectOptions {
  token: string;
  model: string;
  systemPrompt: string;
  handlers: LiveClientHandlers;
}

const LOG = "[gemini-live]";

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private handlers: LiveClientHandlers | null = null;
  private isSetupComplete = false;
  private closedByUser = false;
  private audioInputEnabled = false;
  private openingGreetingPending = false;

  connect(opts: ConnectOptions): void {
    this.handlers = opts.handlers;
    this.closedByUser = false;
    this.isSetupComplete = false;
    this.audioInputEnabled = false;
    this.openingGreetingPending = false;

    const url = buildLiveWebSocketUrl(opts.token);
    console.log(`${LOG} connecting… model=`, opts.model, "tokenPreview=", opts.token.slice(0, 16) + "…");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    this.handlers.onStatus("connecting");

    ws.onopen = () => {
      console.log(`${LOG} ws OPEN — sending setup`);
      this.sendSetup(opts.model, opts.systemPrompt);
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    ws.onerror = () => {
      this.handlers?.onError("שגיאת חיבור ל-Gemini Live.");
    };

    ws.onclose = (event) => {
      console.warn(`${LOG} ws CLOSE code=${event.code} reason=${event.reason} wasClean=${event.wasClean} setupComplete=${this.isSetupComplete}`);
      if (!this.closedByUser) {
        if (!this.isSetupComplete) {
          this.handlers?.onError(`החיבור נסגר לפני שהושלם (code ${event.code}). נסה שוב.`);
        } else if (event.code !== 1000) {
          this.handlers?.onError(`החיבור נסגר (code ${event.code}).`);
        }
      }
      this.handlers?.onClose();
    };
  }

  private sendSetup(model: string, systemPrompt: string): void {
    const modelName = model.startsWith("models/") ? model : `models/${model}`;

    const setup = {
      setup: {
        model: modelName,
        generationConfig: {
          responseModalities: ["AUDIO"],
          temperature: 0.8,
          thinkingConfig: { thinkingBudget: 0 },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
        },
        systemInstruction: { parts: [{ text: systemPrompt }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {},
          activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
        },
      },
    };

    console.log(`${LOG} → setup`, setup);
    this.send(setup);
  }

  private requestOpeningTurn(): void {
    this.send({
      realtimeInput: {
        text: "שלום",
      },
    });
  }

  sendAudioChunk(base64Pcm: string): void {
    if (!this.isSetupComplete || !this.audioInputEnabled) return;
    this.send({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: base64Pcm,
        },
      },
    });
  }

  /** הזרקת טקסט לזרם ה-Live (לחישה מהמנצח, התערבות הורה) */
  injectText(text: string): void {
    if (!this.isSetupComplete) return;
    this.send({
      realtimeInput: {
        text,
      },
    });
  }

  private async handleMessage(data: unknown): Promise<void> {
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (data instanceof Blob) {
      text = await data.text();
    } else {
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      console.warn(`${LOG} ← non-JSON message`, text.slice(0, 200));
      return;
    }

    if (!this.handlers) return;

    if ("setupComplete" in msg) {
      this.isSetupComplete = true;
      console.log(`${LOG} setupComplete ✓ — requesting opening greeting`);
      this.openingGreetingPending = true;
      this.requestOpeningTurn();
      return;
    }

    const serverContent = msg.serverContent as Record<string, unknown> | undefined;

    if (serverContent) {
      if (serverContent.interrupted === true) {
        this.handlers.onInterrupted();
        this.handlers.onStatus("listening");
      }

      const inputTr = serverContent.inputTranscription as { text?: string } | undefined;
      if (inputTr?.text) {
        this.handlers.onTranscript("user", inputTr.text);
      }

      const outputTr = serverContent.outputTranscription as { text?: string } | undefined;
      if (outputTr?.text) {
        this.handlers.onTranscript("agent", outputTr.text);
      }

      const modelTurn = serverContent.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;
      if (modelTurn?.parts) {
        for (const part of modelTurn.parts) {
          const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
          if (inlineData?.data) {
            this.handlers.onStatus("speaking");
            const pcm = base64ToArrayBuffer(inlineData.data);
            this.handlers.onAudioChunk(pcm);
          }
        }
      }

      if (serverContent.turnComplete === true) {
        if (this.openingGreetingPending) {
          console.log(`${LOG} opening greeting done — enabling mic`);
          this.openingGreetingPending = false;
          this.audioInputEnabled = true;
        }
        this.handlers.onTurnComplete();
        this.handlers.onStatus("listening");
      }
    }

    if ("goAway" in msg) {
      this.close();
    }
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close(): void {
    this.closedByUser = true;
    this.isSetupComplete = false;
    this.audioInputEnabled = false;
    this.openingGreetingPending = false;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  get ready(): boolean {
    return this.isSetupComplete;
  }
}
