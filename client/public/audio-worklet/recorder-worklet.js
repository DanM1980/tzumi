/**
 * recorder-worklet.js
 *
 * Runs on the audio rendering thread. Receives mic audio at the device sample
 * rate (commonly 48kHz), resamples it to 16kHz with linear interpolation,
 * converts Float32 -> Int16 (little-endian PCM), and posts ~100ms chunks back
 * to the main thread as a transferable ArrayBuffer.
 */
class RecorderWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.inputSampleRate = opts.inputSampleRate || sampleRate;
    this.targetSampleRate = opts.targetSampleRate || 16000;
    this.ratio = this.inputSampleRate / this.targetSampleRate;

    // Pending input samples not yet consumed by the resampler.
    this.pending = new Float32Array(0);
    // Fractional read position into `pending` (in input-sample units).
    this.readPos = 0;

    // Accumulated output (Int16) before posting. ~100ms @ 16kHz = 1600 samples.
    this.outBuffer = [];
    this.flushThreshold = Math.round(this.targetSampleRate * 0.1);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Append new samples to pending.
    const merged = new Float32Array(this.pending.length + channel.length);
    merged.set(this.pending, 0);
    merged.set(channel, this.pending.length);
    this.pending = merged;

    // Resample: produce output samples while we have room to interpolate.
    let pos = this.readPos;
    while (pos + 1 < this.pending.length) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const s0 = this.pending[i0];
      const s1 = this.pending[i0 + 1];
      const sample = s0 + (s1 - s0) * frac;

      // Float -> Int16 with clamping.
      let v = Math.max(-1, Math.min(1, sample));
      v = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.outBuffer.push(v | 0);

      pos += this.ratio;
    }

    // Drop fully-consumed input samples, keep the fractional remainder.
    const consumed = Math.floor(pos);
    if (consumed > 0) {
      this.pending = this.pending.slice(consumed);
      pos -= consumed;
    }
    this.readPos = pos;

    // Flush accumulated output as PCM16 bytes.
    if (this.outBuffer.length >= this.flushThreshold) {
      this.flush();
    }

    return true;
  }

  flush() {
    const len = this.outBuffer.length;
    if (len === 0) return;
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) pcm[i] = this.outBuffer[i];
    this.outBuffer = [];
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
  }
}

registerProcessor("recorder-worklet", RecorderWorklet);
