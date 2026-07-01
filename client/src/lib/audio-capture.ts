import { getMicrophoneBlockReason } from "./media-support";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

interface CaptureOptions {
  onChunk: (base64Pcm: string) => void;
  targetSampleRate?: number;
}

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  analyser: AnalyserNode | null = null;

  async start(opts: CaptureOptions): Promise<void> {
    const blockReason = getMicrophoneBlockReason();
    if (blockReason) {
      throw new Error(blockReason);
    }

    console.log("[audio-capture] requesting getUserMedia…");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    console.log("[audio-capture] mic granted");

    this.audioContext = new AudioContext();
    console.log("[audio-capture] AudioContext sampleRate=", this.audioContext.sampleRate);
    await this.audioContext.audioWorklet.addModule(
      "/audio-worklet/recorder-worklet.js",
    );
    console.log("[audio-capture] worklet module loaded");

    this.source = this.audioContext.createMediaStreamSource(this.stream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "recorder-worklet",
      {
        processorOptions: {
          inputSampleRate: this.audioContext.sampleRate,
          targetSampleRate: opts.targetSampleRate ?? 16000,
        },
      },
    );

    let chunkCount = 0;
    this.workletNode.port.onmessage = (event: MessageEvent) => {
      const pcm = event.data as ArrayBuffer;
      if (pcm && pcm.byteLength > 0) {
        chunkCount++;
        if (chunkCount === 1) {
          console.log("[audio-capture] first PCM chunk, bytes=", pcm.byteLength);
        }
        opts.onChunk(arrayBufferToBase64(pcm));
      }
    };

    this.source.connect(this.analyser);
    this.source.connect(this.workletNode);

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
