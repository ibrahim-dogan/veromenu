/**
 * Browser-side audio helpers for voice instructions:
 * MediaRecorder blob (webm/opus, mp4/aac …) → decode (AudioContext) → resample to 16 kHz mono
 * (OfflineAudioContext) → 16-bit PCM WAV → base64. Keeps uploads small (~32 KB/s) and provider-neutral.
 */

export const TARGET_SAMPLE_RATE = 16_000;

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

export function isRecordingSupported() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined" &&
    !!audioContextCtor() &&
    typeof window.OfflineAudioContext !== "undefined"
  );
}

/** Best supported recording container (Chrome/Firefox: webm/opus, Safari: mp4). */
export function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}

/** Encodes mono float samples [-1, 1] as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  v.setUint16(32, bytesPerSample, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

/** Decodes a recorded blob and returns a 16 kHz mono WAV as base64 (max `maxSeconds`). */
export async function blobToWavBase64(blob: Blob, maxSeconds = 60): Promise<{ base64: string; seconds: number }> {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error("AudioContext unsupported");
  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const seconds = Math.min(decoded.duration, maxSeconds);
  const length = Math.max(1, Math.ceil(seconds * TARGET_SAMPLE_RATE));
  // mono destination → the browser down-mixes stereo input; sample rate conversion happens on render
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const wav = encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  return { base64: bytesToBase64(wav), seconds };
}
