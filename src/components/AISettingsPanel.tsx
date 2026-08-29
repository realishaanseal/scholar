"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE_OUT, SPRING } from "@/components/motion";
import { COST_LABEL, PROVIDERS, PROVIDER_MAP, type ProviderId } from "@/lib/ai/catalog";
import { fetchJson } from "@/lib/fetchJson";
import ModelPicker, { type ModelListState } from "./ModelPicker";

type AISettings = {
  provider: string;
  model: string | null;
  hasKey: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  usingEnvFallback: boolean;
  envProvider: string | null;
};

type TestResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; ms: number; model: string; sample: { title: string; subject: string; dueAt: string | null } }
  | { state: "fail"; error: string };

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [model, setModel] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [test, setTest] = useState<TestResult>({ state: "idle" });
  const [models, setModels] = useState<ModelListState>({ state: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const info = PROVIDER_MAP[provider];
  const providerChanged = settings ? settings.provider !== provider : false;
  const keyIsSaved = Boolean(settings?.hasKey) && !providerChanged && !settings?.usingEnvFallback;
  const haveSomeKey = Boolean(keyInput.trim()) || keyIsSaved;

  /** OpenRouter's catalogue is public; Ollama is local. Others need a key first. */
  const canDetect =
    provider === "openrouter" || provider === "ollama" || (info.needsKey ? haveSomeKey : true);

  async function load() {
    const { data } = await fetchJson<AISettings>("/api/settings/ai");
    if (!data) return;
    setSettings(data);
    setProvider((data.provider as ProviderId) ?? "gemini");
    setModel(data.model ?? null);
  }

  useEffect(() => { load(); }, []);

  const detect = useCallback(
    async (opts?: { silent?: boolean }) => {
      setModels({ state: "loading" });
      const { data, error } = await fetchJson<{
        ok: boolean; models?: any[]; suggested?: string | null; error?: string;
      }>("/api/settings/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: keyInput.trim() || undefined }),
      });

      if (!data) {
        setModels({ state: "error", error: error ?? "Could not reach the server." });
        return;
      }
      if (!data.ok) {
        setModels({ state: "error", error: data.error ?? "Could not list models." });
        return;
      }
      setModels({
        state: "ready",
        models: (data.models ?? []) as any,
        suggested: data.suggested ?? null,
      });
      if (!opts?.silent) setMessage(null);
    },
    [provider, keyInput]
  );

  /* Auto-detect once a usable key is present, so the student never has to think
     about model names. Debounced so it doesn't fire on every keystroke. */
  const detectRef = useRef(detect);
  detectRef.current = detect;

  useEffect(() => {
    if (!canDetect) {
      setModels({ state: "idle" });
      return;
    }
    const t = setTimeout(() => detectRef.current({ silent: true }), keyInput.trim() ? 700 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, keyInput, canDetect]);

  function pickProvider(id: ProviderId) {
    setProvider(id);
    setKeyInput("");
    setTest({ state: "idle" });
    setMessage(null);
    setConfirmDelete(false);
    setModels({ state: "idle" });
    setModel(settings?.provider === id ? settings.model ?? null : null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = { provider, model };
    if (keyInput.trim()) body.apiKey = keyInput.trim();

    const { ok, data, error } = await fetchJson<AISettings>("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!ok || !data) {
      setMessage({ tone: "err", text: error ?? "Could not save." });
      return;
    }

    setSettings(data);
    setKeyInput("");
    setMessage({ tone: "ok", text: "Saved. New homework will be parsed with this provider." });
  }

  async function runTest() {
    setTest({ state: "running" });
    const { data, error } = await fetchJson<any>("/api/settings/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, apiKey: keyInput.trim() || undefined }),
    });

    if (!data) {
      setTest({ state: "fail", error: error ?? "The test didn't come back. Check the terminal running the app." });
      return;
    }
    setTest(
      data.ok
        ? { state: "ok", ms: data.ms, model: data.model, sample: data.sample }
        : { state: "fail", error: data.error ?? "Test failed." }
    );
  }

  async function removeKey() {
    const { data } = await fetchJson<AISettings>("/api/settings/ai?scope=key", { method: "DELETE" });
    if (data) setSettings(data);
    setKeyInput("");
    setConfirmDelete(false);
    setTest({ state: "idle" });
    setModels({ state: "idle" });
    setMessage({ tone: "ok", text: "API key deleted. Parsing falls back to the offline parser until you add another." });
  }

  async function resetAll() {
    const { data } = await fetchJson<AISettings>("/api/settings/ai?scope=all", { method: "DELETE" });
    if (data) {
      setSettings(data);
      setProvider((data.provider as ProviderId) ?? "gemini");
      setModel(data.model ?? null);
    }
    setKeyInput("");
    setConfirmDelete(false);
    setModels({ state: "idle" });
    setMessage({ tone: "ok", text: "Reverted to the server's .env configuration." });
  }

  const prefixes = info.keyPrefixes ?? [];
  const keyLooksOff =
    Boolean(keyInput.trim()) &&
    prefixes.length > 0 &&
    !prefixes.some((prefix) => keyInput.trim().startsWith(prefix));

  const current = PROVIDER_MAP[settings?.provider ?? "heuristic"];

  return (
    <div className="space-y-6">
      {/* Current status */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Currently parsing with</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className="chip border"
                style={{
                  background: `${current?.accent ?? "#64748b"}1f`,
                  color: current?.accent ?? "#64748b",
                  borderColor: `${current?.accent ?? "#64748b"}44`,
                }}
              >
                {current?.label ?? "—"}
              </span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-slate-400">
                {settings?.model ?? `auto · ${current?.defaultModel ?? "—"}`}
              </span>
              {settings?.hasKey && settings.keyHint && (
                <span className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                  key {settings.keyHint}
                </span>
              )}
              {settings && !settings.hasKey && current?.needsKey && (
                <span className="rounded-md border border-amber-500/25 bg-amber-500/[0.08] px-2 py-0.5 text-[11px] text-amber-300">
                  no key saved
                </span>
              )}
            </div>
          </div>

          {settings && !settings.usingEnvFallback && (
            <button onClick={resetAll} className="btn-ghost px-3 py-2 text-xs">Reset to .env</button>
          )}
        </div>

        {settings?.usingEnvFallback && (
          <p className="mt-3.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-xs leading-relaxed text-slate-400">
            Nothing saved here yet, so Scholar is using the configuration in your{" "}
            <code className="font-mono text-slate-300">.env.local</code> file. Anything you set below
            takes priority over it, per account.
          </p>
        )}
      </div>

      {/* Provider picker */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-white">Choose a provider</h3>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          Your key is encrypted before it's stored and is never sent to the browser again — only a
          masked hint comes back.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((p, i) => {
            const selected = provider === p.id;
            return (
              <motion.button
                key={p.id}
                onClick={() => pickProvider(p.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: Math.min(i, 8) * 0.04 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                className={`card card-hover p-4 text-left ${selected ? "border-vx-500/50" : ""}`}
                style={
                  selected
                    ? { boxShadow: `0 0 0 1px ${p.accent}55, 0 18px 50px -20px rgba(0,0,0,0.85)` }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.accent, boxShadow: `0 0 10px ${p.accent}` }} />
                    <span className="text-sm font-semibold text-white">{p.label}</span>
                  </div>
                  <span className={`chip shrink-0 border text-[10px] ${
                    p.cost === "paid"
                      ? "border-amber-500/25 bg-amber-500/[0.08] text-amber-300"
                      : "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300"
                  }`}>
                    {COST_LABEL[p.cost]}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{p.blurb}</p>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Key + model */}
      <motion.div
        className="card-aurora"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 }}
      >
        <div className="p-5 xl:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">{info.label} settings</h3>
            <span className="text-[11px] text-slate-500">{info.vendor}</span>
          </div>

          {info.needsKey ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <a href={info.keyUrl} target="_blank" rel="noreferrer noopener" className="btn-ghost px-3.5 py-2 text-xs">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                  Get a key — {info.keyUrlLabel}
                </a>
                {info.docsUrl && (
                  <a href={info.docsUrl} target="_blank" rel="noreferrer noopener"
                    className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
                    Docs
                  </a>
                )}
              </div>

              <label className="label" htmlFor="apikey">API key</label>
              <div className="relative">
                <input
                  id="apikey"
                  type={showKey ? "text" : "password"}
                  className="input pr-11 font-mono text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    keyIsSaved
                      ? `Saved (${settings?.keyHint}) — type a new key to replace it`
                      : `${prefixes[0] ?? ""}…`
                  }
                  value={keyInput}
                  onChange={(e) => { setKeyInput(e.target.value); setTest({ state: "idle" }); }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-3.2 4.5M6.6 6.6A18.5 18.5 0 0 0 2 12s3 8 10 8a10.8 10.8 0 0 0 4.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {keyLooksOff && (
                <p className="mt-2 text-xs text-slate-500">
                  Most {info.label} keys start with{" "}
                  {prefixes.map((prefix, i) => (
                    <span key={prefix}>
                      {i > 0 && (i === prefixes.length - 1 ? " or " : ", ")}
                      <code className="font-mono text-slate-400">{prefix}</code>
                    </span>
                  ))}
                  . If yours doesn&apos;t, it may still be fine — hit Test connection to find out.
                </p>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 text-xs leading-relaxed text-slate-400">
              {info.id === "ollama" ? (
                <>
                  No API key needed — this runs on your own machine. Install it from{" "}
                  <a href={info.keyUrl} target="_blank" rel="noreferrer noopener" className="text-vx-300 hover:text-vx-200">
                    {info.keyUrlLabel}
                  </a>, then run <code className="font-mono text-slate-300">ollama pull {info.defaultModel}</code>.
                </>
              ) : (
                "No API key needed. This is the built-in fallback — it works offline but won't rewrite messy notes well."
              )}
            </p>
          )}

          {info.id !== "heuristic" && (
            <div className="mt-5">
              <ModelPicker
                info={info}
                value={model}
                onChange={(m) => { setModel(m); setTest({ state: "idle" }); }}
                list={models}
                onRefresh={() => detect()}
                canDetect={canDetect}
              />
            </div>
          )}

          <AnimatePresence>
          {test.state !== "idle" && (
            <motion.div
              className="mt-5"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              {test.state === "running" && (
                <p className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-xs text-slate-400">
                  <Spinner /> Sending a test note to {info.label}…
                </p>
              )}
              {test.state === "ok" && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3 text-xs text-emerald-200">
                  <div className="font-medium">
                    Connected — <span className="font-mono">{test.model}</span> replied in {test.ms} ms.
                  </div>
                  <div className="mt-1.5 text-emerald-200/70">
                    Test note parsed as <span className="text-emerald-100">“{test.sample.title}”</span>
                    {" · "}{test.sample.subject}
                    {test.sample.dueAt && ` · due ${new Date(test.sample.dueAt).toLocaleString()}`}
                  </div>
                </div>
              )}
              {test.state === "fail" && (
                <p className="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3.5 py-2.5 text-xs leading-relaxed text-red-300">
                  {test.error}
                </p>
              )}
            </motion.div>
          )}
          </AnimatePresence>

          <AnimatePresence>
          {message && (
            <motion.p
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 20 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className={`overflow-hidden rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                message.tone === "ok"
                  ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200"
                  : "border-red-500/25 bg-red-500/[0.08] text-red-300"
              }`}
            >
              {message.text}
            </motion.p>
          )}
          </AnimatePresence>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button className="btn-primary px-5" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              className="btn-ghost"
              onClick={runTest}
              disabled={test.state === "running" || (info.needsKey && !haveSomeKey)}
            >
              Test connection
            </button>

            {keyIsSaved && (
              confirmDelete ? (
                <span className="ml-auto flex animate-popIn items-center gap-2">
                  <span className="text-xs text-slate-400">Delete the saved key?</span>
                  <button className="btn-danger px-3 py-2" onClick={removeKey}>Yes, delete</button>
                  <button className="btn-ghost px-3 py-2" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </span>
              ) : (
                <button className="btn-danger ml-auto" onClick={() => setConfirmDelete(true)}>Delete key</button>
              )
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
