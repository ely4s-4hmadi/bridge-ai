import { useEffect, useMemo, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Keyboard, Mic, MicOff, Pause, PhoneOff, Play, Send, Sparkles, Volume2 } from "lucide-react";
import { api } from "../services/api";
import { useBridge } from "../hooks/useBridge";
import { useSpeech } from "../hooks/useSpeech";
import { Button, ErrorNote, Modal } from "./ui";

interface Msg { id: string; role: "user" | "penny"; text: string; textId?: string; live?: boolean }

const TOOL_NAMES = ["get_financial_summary", "get_upcoming_payments", "run_what_if_scenario",
  "get_recent_financial_events", "get_rescue_plan"] as const;

/** Penny = live ElevenLabs agent (when configured) + always-available typed assistant grounded in Runway. */
export function Penny({ compact = false, autoQuestion }: { compact?: boolean; autoQuestion?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useBridge();

  // Client tools: the agent calls these; every answer comes from the Bridge backend (Runway), never the prompt.
  const clientTools = useMemo(() => Object.fromEntries(TOOL_NAMES.map((name) => [name,
    async (params: Record<string, unknown>) => {
      try { return JSON.stringify(await api.tool(name, params ?? {})); }
      catch (e) { return JSON.stringify({ error: (e as Error).message }); }
    }])), []);

  return (
    <ConversationProvider
      clientTools={clientTools}
      onMessage={(m) => {
        const role = (m.role ?? m.source) === "user" ? "user" : "penny";
        setMsgs((x) => [...x, { id: `${Date.now()}-${Math.random()}`, role, text: m.message, live: true }]);
        if (role === "penny") refresh();
      }}
      onError={(message) => setError(typeof message === "string" ? message : "The live conversation hit a problem.")}
    >
      <PennyInner msgs={msgs} setMsgs={setMsgs} error={error} setError={setError} compact={compact} autoQuestion={autoQuestion} />
    </ConversationProvider>
  );
}

function PennyInner({ msgs, setMsgs, error, setError, compact, autoQuestion }: {
  msgs: Msg[]; setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>; error: string | null;
  setError: (e: string | null) => void; compact: boolean; autoQuestion?: string | null;
}) {
  const conv = useConversation();
  const { user, refresh } = useBridge();
  const speech = useSpeech();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [agentReady, setAgentReady] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const live = conv.status === "connected";
  const connecting = conv.status === "connecting";
  const consent = user?.preferences.share_with_elevenlabs_consent ?? false;

  useEffect(() => { api.pennyStatus().then((s) => setAgentReady(s.agent_configured)).catch(() => setAgentReady(false)); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (autoQuestion) void ask(autoQuestion); /* eslint-disable-next-line */ }, [autoQuestion]);

  async function startVoice() {
    setError(null); setNotice(null);
    if (!consent) { setConsentOpen(true); return; }
    if (!agentReady) {
      setNotice("Live voice isn't set up on this server yet. You can type to Penny below — answers come from the same forecast.");
      inputRef.current?.focus();
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow the microphone in your browser settings, or type your question instead.");
      return;
    }
    try {
      const { conversation_token } = await api.conversationCredentials();
      conv.startSession({ conversationToken: conversation_token, connectionType: "webrtc" });
    } catch (e) {
      setError(`Live voice is unavailable right now: ${(e as Error).message} You can still type to Penny.`);
      refresh();
    }
  }

  async function giveConsent() {
    await api.setPrefs({ share_with_elevenlabs_consent: true });
    setConsentOpen(false);
    await refresh();
    setNotice("Thanks. Press the microphone again when you're ready to talk.");
  }

  async function ask(q: string) {
    const question = q.trim();
    if (!question) return;
    setText("");
    setMsgs((x) => [...x, { id: `u-${Date.now()}`, role: "user", text: question }]);
    if (live) { conv.sendUserMessage(question); return; }
    setBusy(true);
    try {
      const r = await api.chat(question);
      setMsgs((x) => [...x, { id: `p-${Date.now()}`, role: "penny", text: r.reply, textId: r.text_id }]);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  const orbState = live ? (conv.isSpeaking ? "speaking" : "listening") : connecting ? "connecting" : "idle";
  const stateText = {
    idle: "Tap to talk to Penny", connecting: "Connecting…",
    listening: conv.isMuted ? "Microphone muted" : "Penny is listening…", speaking: "Penny is speaking…",
  }[orbState];
  const suggestions = ["How much will I have on 1 December?", "Can I afford to spend £30 this weekend?",
    "What if I work an extra £100 shift before rent is due?", "Why is my forecast red?", "Explain my plan in simpler words."];

  return (
    <div className={compact ? "" : "card p-5 sm:p-6"}>
      <div className={`flex ${compact ? "flex-col items-center text-center" : "flex-col items-center gap-1 text-center sm:flex-row sm:text-left sm:gap-5"}`}>
        <button
          onClick={live ? undefined : startVoice}
          disabled={connecting}
          aria-label={live ? stateText : "Talk to Penny — start a voice conversation"}
          className={`relative grid size-24 shrink-0 place-items-center rounded-full text-white shadow-lg transition
            bg-[radial-gradient(circle_at_30%_25%,#8f7cff,#4f3cc0_55%,#261a5c)]
            ${orbState === "listening" && !conv.isMuted ? "orb-listening" : ""} ${orbState === "speaking" ? "orb-speaking" : ""}
            ${!live ? "hover:scale-[1.03]" : "cursor-default"}`}
        >
          <Mic className="size-9" aria-hidden />
        </button>
        <div className="mt-3 sm:mt-0">
          <p className="font-display text-xl font-bold">Talk to Penny</p>
          <p className="text-sm text-muted" aria-live="polite">{stateText}</p>
          {agentReady === false && !live && (
            <p className="mt-1 text-xs text-muted">Live voice: not configured · typed answers available</p>
          )}
          {live && (
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button variant="secondary" onClick={() => conv.setMuted(!conv.isMuted)} aria-pressed={conv.isMuted}>
                {conv.isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}{conv.isMuted ? "Unmute" : "Mute"}
              </Button>
              <Button variant="danger" onClick={() => conv.endSession()}><PhoneOff className="size-4" />End</Button>
            </div>
          )}
        </div>
      </div>

      {notice && <p className="mt-4 rounded-xl bg-lav-50 px-3.5 py-2.5 text-sm text-brand-900" role="status">{notice}</p>}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      <div ref={listRef} className={`mt-5 space-y-3 overflow-y-auto pr-1 ${compact ? "max-h-72" : "max-h-96"}`}
        aria-live="polite" aria-label="Conversation transcript">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-brand-800 hover:border-lav-300 hover:bg-lav-50">
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`rise flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user"
              ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md bg-lav-50 text-ink"}`}>
              {m.role === "penny" && <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-brand-600">
                <Sparkles className="size-3" aria-hidden />Penny {m.live ? "· live voice" : "· from your forecast"}</p>}
              <p>{m.text}</p>
              {m.textId && (
                <button onClick={() => (consent ? speech.play(m.textId!) : setConsentOpen(true))}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  {speech.activeId === m.textId && speech.state === "playing" ? <Pause className="size-3.5" /> :
                    speech.activeId === m.textId && speech.state === "loading" ? <Volume2 className="size-3.5 animate-pulse" /> :
                      <Play className="size-3.5" />}
                  {speech.activeId === m.textId && speech.state === "playing" ? "Pause" : "Listen"}
                </button>
              )}
              {speech.activeId === m.textId && speech.state === "error" && (
                <p className="mt-1 text-xs text-bad">Audio unavailable: {speech.error}. The text above is the full answer.</p>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-muted">Penny is checking your forecast…</p>}
      </div>

      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <label htmlFor={`penny-input-${compact ? "c" : "f"}`} className="sr-only">Type a question for Penny</label>
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id={`penny-input-${compact ? "c" : "f"}`} ref={inputRef} value={text}
            onChange={(e) => { setText(e.target.value); if (live) conv.sendUserActivity(); }}
            placeholder="Or type: “Can I afford £30 this weekend?”" maxLength={500}
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-brand-500" />
        </div>
        <Button type="submit" aria-label="Send question" busy={busy}><Send className="size-4" /></Button>
      </form>

      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Use Penny's voice?">
        <div className="space-y-3 text-sm leading-relaxed text-ink">
          <p>Penny's voice is powered by <b>ElevenLabs</b>. To speak, Bridge sends Penny's words — which include figures from your
            forecast — to ElevenLabs. In a live conversation your voice is also sent to ElevenLabs to be understood.</p>
          <p>Bridge only starts listening after you press the microphone, and you can end the conversation at any time.
            You can withdraw this permission in Settings.</p>
          <p className="text-muted">Prefer not to? You can keep typing to Penny — that stays on Bridge's own server.</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConsentOpen(false)}>Not now</Button>
          <Button onClick={giveConsent}>Allow voice</Button>
        </div>
      </Modal>
    </div>
  );
}
