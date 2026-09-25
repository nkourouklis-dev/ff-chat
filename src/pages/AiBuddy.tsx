import { useEffect, useRef, useState } from "react";
import {
  askAi,
  deleteAiSettings,
  errorMessage,
  getAiSettings,
  saveAiSettings,
  type AiProvider,
  type AiSettings
} from "../services/api";

interface ChatLine { role: "user" | "assistant"; content: string; }

const greeting = (botName: string): ChatLine[] => [
  { role: "assistant", content: `Γεια! Με λένε ${botName}. Ρώτα με ό,τι θέλεις.` }
];

const providers: Record<AiProvider, { label: string; keyUrl: string }> = {
  gemini: { label: "Gemini (Google)", keyUrl: "https://aistudio.google.com/apikey" },
  openai: { label: "ChatGPT (OpenAI)", keyUrl: "https://platform.openai.com/api-keys" }
};

function AiSetup({ settings, onSaved }: { settings: AiSettings; onSaved: () => void }) {
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [botName, setBotName] = useState(settings.botName);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = botName.trim().length >= 1 && (settings.hasKey || apiKey.trim().length > 0);

  async function save() {
    if (busy || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      await saveAiSettings({ provider, model, botName, apiKey });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Δεν αποθηκεύτηκε. Δοκίμασε ξανά."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm("Να σβηστεί το key και οι ρυθμίσεις του AI σου;")) return;
    setBusy(true);
    await deleteAiSettings().catch(() => undefined);
    setBusy(false);
    onSaved();
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-2">
      <p className="text-white/70">
        {settings.hasKey || settings.builtinAvailable
          ? "Ρυθμίσεις του AI σου."
          : "Ο AI είναι ανενεργός. Σύνδεσε τον δικό σου βοηθό: η χρέωση πάει στον δικό σου λογαριασμό στον provider."}
      </p>

      <label className="text-sm text-white/60">Πώς θα λέγεται ο AI σου;</label>
      <input className="input" maxLength={30} value={botName} onChange={(e) => setBotName(e.target.value)} />

      <label className="text-sm text-white/60">Provider</label>
      <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
        {(Object.keys(providers) as AiProvider[]).map((key) => (
          <option key={key} value={key} className="text-black">{providers[key].label}</option>
        ))}
      </select>

      <label className="text-sm text-white/60">
        API key{" "}
        <a className="text-liakos-500 underline" href={providers[provider].keyUrl} target="_blank" rel="noreferrer">
          (πού το βρίσκω;)
        </a>
      </label>
      <input
        className="input"
        type="password"
        autoComplete="off"
        placeholder={settings.hasKey ? "Αποθηκευμένο. Γράψε νέο μόνο για αλλαγή" : "Επικόλλησε το key"}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />

      <label className="text-sm text-white/60">Μοντέλο (προαιρετικό)</label>
      <input
        className="input"
        placeholder={settings.defaultModels[provider]}
        value={model}
        onChange={(e) => setModel(e.target.value)}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn py-3" disabled={busy || !canSave} onClick={save}>
        {busy ? "Αποθήκευση..." : "Αποθήκευση"}
      </button>
      {settings.hasKey && (
        <button className="py-2 text-sm text-red-400" disabled={busy} onClick={remove}>
          Διαγραφή key και ρυθμίσεων
        </button>
      )}
      <p className="text-xs text-white/35">
        Το key αποθηκεύεται κρυπτογραφημένο και δεν εμφανίζεται ποτέ ξανά. Το χρησιμοποιεί μόνο ο server όταν μιλάς στον AI.
      </p>
    </div>
  );
}

export default function AiBuddy() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadSettings() {
    try {
      const next = await getAiSettings();
      setSettings(next);
      setLines(greeting(next.botName));
      setEditing(!next.hasKey && !next.builtinAvailable);
    } catch {
      setSettings(null);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, busy]);

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    const next: ChatLine[] = [...lines, { role: "user", content: value }];
    setLines(next);
    setText("");
    setBusy(true);
    try {
      const { reply } = await askAi(next);
      setLines([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setLines([...next, { role: "assistant", content: errorMessage(e, "Ουπς, κάτι πήγε στραβά. Ξαναδοκίμασε.") }]);
    } finally {
      setBusy(false);
    }
  }

  const botName = settings?.botName ?? "AI";
  const canChat = Boolean(settings && (settings.hasKey || settings.builtinAvailable));

  return (
    <main className="screen-grid">
      <header className="flex items-start justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="screen-title">🤖 {botName}</h1>
          <p className="screen-subtitle">{editing ? "Ρυθμίσεις" : "Ρώτα οτιδήποτε, απαντάω απλά"}</p>
        </div>
        {canChat && (
          <button className="rounded-2xl bg-white/10 px-3 py-2 text-xl" onClick={() => setEditing(!editing)} aria-label="Ρυθμίσεις AI">
            {editing ? "✕" : "⚙️"}
          </button>
        )}
      </header>

      {settings && editing ? (
        <AiSetup
          settings={settings}
          onSaved={() => {
            loadSettings().then(() => setEditing(false));
          }}
        />
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 overflow-y-auto px-4 py-2">
            <div className="flex min-h-full flex-col justify-end gap-3">
              {lines.map((line, index) => (
                <div key={index} className={`max-w-[88%] rounded-[1.5rem] px-5 py-3 text-[clamp(1rem,4.6vw,1.2rem)] leading-relaxed ${line.role === "user" ? "self-end rounded-br-md bg-liakos-500" : "self-start rounded-bl-md bg-white/10"}`}>
                  {line.content}
                </div>
              ))}
              {busy && <div className="self-start rounded-2xl bg-white/10 px-5 py-3 text-white/50">{botName} γράφει…</div>}
            </div>
          </div>

          <div className="composer-safe flex gap-2 border-t border-white/10 bg-liakos-900/95 px-3 py-3 backdrop-blur">
            <input className="input min-w-0 flex-1 text-base" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ρώτα κάτι…" />
            <button className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-liakos-500 text-2xl active:scale-90 transition" onClick={send} aria-label="Αποστολή">➤</button>
          </div>
        </>
      )}
    </main>
  );
}
