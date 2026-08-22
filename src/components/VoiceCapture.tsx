"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMime, toWav } from "@/lib/audio/wav";
import { fetchJson } from "@/lib/fetchJson";

/**
 * Dictation, with two engines.
 *
 * 1. The browser's SpeechRecognition — instant and free, but it only works in
 *    Google-branded Chrome and Edge. Everything else (Brave, ungoogled
 *    Chromium, Firefox, Safari) throws a bare "network" error, because the API
 *    streams audio to Google's servers.
 * 2. Record locally, then transcribe through the student's own AI provider.
 *    Slower by a few seconds, but works in every browser.
 *
 * The second engine is selected automatically the moment the first one proves
 * unavailable, so the student never has to know which one is running.
 */

export type DictationMode = "browser" | "recording";

export function useDictation(onTranscript: (text: string, isFinal: boolean) => void) {
  const [browserSupported, setBrowserSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DictationMode>("browser");

  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  // Set once the browser engine has failed, so we don't try it again this session.
  const browserBrokenRef = useRef(false);

  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setMode("recording");
      return;
    }

    setBrowserSupported(true);
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      if (final) callbackRef.current(final, true);
      else if (interim) callbackRef.current(interim, false);
    };

    recognition.onerror = (e: any) => {
      setListening(false);

      // "network" here does not mean the student is offline — it means this
      // browser build can't reach Google's speech service at all. Switching
      // engines is the fix, so do it silently rather than reporting a failure.
      if (e.error === "network" || e.error === "service-not-allowed") {
        browserBrokenRef.current = true;
        setMode("recording");
        startRecording();
        return;
      }

      const map: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Allow it in your browser's site settings.",
        "no-speech": "I didn't catch anything — try again a bit closer to the mic.",
        "audio-capture": "No microphone found.",
      };
      setError(map[e.error] ?? `Speech recognition error: ${e.error}`);
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickRecordingMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        chunksRef.current = [];

        if (blob.size < 1024) {
          setError("That was too short to hear — hold the mic a moment longer.");
          return;
        }

        setTranscribing(true);
        try {
          // Normalised to WAV in the browser: provider audio-format support
          // varies, and Gemini rejects the webm Chrome records by default.
          const wav = await toWav(blob);
          const form = new FormData();
          form.append("audio", wav, "speech.wav");

          const { ok, data, error } = await fetchJson<{ text: string }>("/api/ai/transcribe", {
            method: "POST",
            body: form,
          });

          if (!ok || !data?.text) {
            setError(error ?? "Couldn't transcribe that.");
          } else {
            callbackRef.current(data.text, true);
          }
        } catch (err: any) {
          setError(err?.message ?? "Couldn't process that recording.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setListening(true);
    } catch (err: any) {
      stopTracks();
      setListening(false);
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser's site settings."
          : "No microphone available."
      );
    }
  }, [stopTracks]);

  const start = useCallback(() => {
    setError(null);

    if (mode === "browser" && browserSupported && !browserBrokenRef.current) {
      try {
        recognitionRef.current?.start();
        setListening(true);
        return;
      } catch {
        // Already running, or the engine refused — fall through to recording.
      }
    }
    startRecording();
  }, [mode, browserSupported, startRecording]);

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      stopTracks();
    }
    setListening(false);
  }, [stopTracks]);

  useEffect(() => () => { stopTracks(); }, [stopTracks]);

  return {
    // Recording works wherever there's a microphone, so dictation is always
    // available — only the engine behind it changes.
    supported: true,
    listening,
    transcribing,
    error,
    mode,
    start,
    stop,
    toggle: () => (listening ? stop() : start()),
  };
}

/** Kept for compatibility with the previous hook name. */
export const useSpeechRecognition = useDictation;

export function MicButton({
  listening,
  supported,
  transcribing,
  onClick,
}: {
  listening: boolean;
  supported: boolean;
  transcribing?: boolean;
  onClick: () => void;
}) {
  const busy = transcribing && !listening;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!supported || busy}
      title={
        busy ? "Transcribing…" : listening ? "Stop dictation" : "Dictate homework"
      }
      className="group relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl
                 transition-all duration-300 ease-spring disabled:opacity-60
                 disabled:hover:scale-100 hover:scale-105 active:scale-95"
      style={{
        background: listening
          ? "linear-gradient(135deg,#ef4444,#f97316)"
          : "rgba(255,255,255,0.045)",
        border: listening ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.10)",
        boxShadow: listening
          ? "0 10px 34px -10px rgba(239,68,68,0.85), inset 0 1px 0 0 rgba(255,255,255,0.22)"
          : "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      }}
    >
      {listening && (
        <>
          <span className="pointer-events-none absolute inset-0 animate-ripple rounded-2xl border-2 border-red-400/60" />
          <span
            className="pointer-events-none absolute inset-0 animate-ripple rounded-2xl border-2 border-orange-400/50"
            style={{ animationDelay: "0.55s" }}
          />
        </>
      )}

      {busy ? (
        <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] animate-spin text-slate-300" fill="none">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : listening ? (
        <span className="relative h-3.5 w-3.5 rounded-[3px] bg-white shadow" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-[22px] w-[22px] text-slate-300 transition-colors group-hover:text-white"
          fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
        >
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
    </button>
  );
}

/** Live audio-ish bars shown while dictating. Purely decorative feedback. */
export function ListeningBars() {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-red-400"
          style={{
            height: `${6 + ((i * 7) % 12)}px`,
            animation: `breathe ${0.7 + i * 0.13}s ease-in-out ${i * 0.08}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
