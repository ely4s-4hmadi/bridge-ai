import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../services/api";

export type SpeechState = "idle" | "loading" | "playing" | "paused" | "error";

/** Plays Penny audio generated server-side by ElevenLabs for text Bridge itself produced. */
export function useSpeech() {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  const cleanup = () => {
    audio.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
    audio.current = null; url.current = null;
  };
  useEffect(() => cleanup, []);

  const play = useCallback(async (textId: string) => {
    if (activeId === textId && audio.current) {
      if (audio.current.paused) { await audio.current.play(); setState("playing"); }
      else { audio.current.pause(); setState("paused"); }
      return;
    }
    cleanup();
    setActiveId(textId); setState("loading"); setError(null);
    try {
      const blob = await api.speech(textId);
      url.current = URL.createObjectURL(blob);
      const a = new Audio(url.current);
      audio.current = a;
      a.onended = () => setState("idle");
      a.onpause = () => { if (!a.ended) setState("paused"); };
      a.onplay = () => setState("playing");
      await a.play();
    } catch (e) {
      setState("error");
      const msg = e instanceof ApiError ? e.message : "Audio could not be played on this device.";
      setError(msg);
    }
  }, [activeId]);

  const stop = useCallback(() => { cleanup(); setState("idle"); setActiveId(null); }, []);

  return { state, error, activeId, play, stop };
}
