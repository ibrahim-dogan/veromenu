"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { blobToWavBase64, isRecordingSupported, pickRecorderMime } from "./wav";

export type RecorderState = "idle" | "recording" | "processing";
export type RecorderError = "unsupported" | "denied" | "tooShort" | "failed";

/**
 * MediaRecorder wrapper: start/stop, auto-stop after `maxSeconds`, returns a 16 kHz mono WAV (base64).
 */
export function useVoiceRecorder(opts: { maxSeconds?: number; onWav: (wavBase64: string, seconds: number) => void; onError: (e: RecorderError) => void }) {
  const maxSeconds = opts.maxSeconds ?? 60;
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const cbRef = useRef(opts);
  useEffect(() => {
    cbRef.current = opts;
  });

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      const r = recRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
      cleanup();
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state === "recording") recRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!isRecordingSupported()) return cbRef.current.onError("unsupported");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      return cbRef.current.onError("denied");
    }
    streamRef.current = stream;
    const mime = pickRecorderMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      const seconds = (Date.now() - startedRef.current) / 1000;
      cleanup();
      setState("processing");
      try {
        if (seconds < 0.8) throw new Error("tooShort");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        const wav = await blobToWavBase64(blob, maxSeconds);
        cbRef.current.onWav(wav.base64, wav.seconds);
      } catch (e) {
        cbRef.current.onError(e instanceof Error && e.message === "tooShort" ? "tooShort" : "failed");
      } finally {
        setState("idle");
      }
    };
    startedRef.current = Date.now();
    setElapsed(0);
    rec.start(250);
    setState("recording");
    timerRef.current = setInterval(() => {
      const s = (Date.now() - startedRef.current) / 1000;
      setElapsed(Math.floor(s));
      if (s >= maxSeconds) stop();
    }, 250);
  }, [cleanup, maxSeconds, stop]);

  return { state, elapsed, maxSeconds, start, stop, setState };
}
