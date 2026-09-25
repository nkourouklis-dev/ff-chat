import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../services/api";
import { appName } from "../config";

export default function Login() {
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // Το URL που ήθελε πριν τον πετάξουμε στο login (π.χ. invite link δωματίου).
  const from = (location.state as { from?: string } | null)?.from ?? "/home";
  const roomId = from.startsWith("/room/") ? from.split("/")[2] : undefined;
  const inviteCode = params.get("join") ?? undefined;
  const isInvite = Boolean(roomId || inviteCode);

  const ready = name.trim().length >= 2 && (isInvite || workspaceName.trim().length >= 2);

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      await login({ name, workspaceName: isInvite ? undefined : workspaceName, inviteCode, roomId });
      navigate(from, { replace: true });
    } catch (e) {
      const invalid = e instanceof Error && e.message.includes("invalid_invite");
      setError(invalid ? "Το link πρόσκλησης δεν ισχύει πια." : "Δεν έγινε η σύνδεση. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="text-4xl font-bold">{appName}</h1>
        <p className="mt-2 text-white/60">
          {isInvite
            ? "Σε κάλεσαν στην παρέα τους! Πώς σε λένε;"
            : "Φτιάξε τον χώρο της οικογένειας ή της παρέας σου. Θα είσαι ο admin."}
        </p>
      </div>

      <input
        className="input text-lg"
        placeholder="Πώς σε λένε;"
        autoFocus
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />

      {!isInvite && (
        <input
          className="input text-lg"
          placeholder="Όνομα παρέας (π.χ. Οικογένεια Παπά)"
          maxLength={40}
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button className="btn py-3 text-lg" disabled={busy || !ready} onClick={submit}>
        {busy ? "Σύνδεση..." : isInvite ? "Μπες" : "Δημιούργησε την παρέα"}
      </button>

      <p className="text-center text-xs text-white/30">
        Χωρίς κωδικό, χωρίς email.
        {!isInvite && " Αν έχεις πρόσκληση, άνοιξε το link που σου έστειλαν."}
      </p>
    </div>
  );
}
