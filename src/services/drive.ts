// Αποθήκευση media στο Google Drive του ίδιου του χρήστη (scope drive.file).
// Ο browser μιλάει κατευθείαν με το Google: κανένα αρχείο δεν περνάει από τον server μας.
import { googleClientId } from "../config";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "F&F Chat";
const KEY_PREFIX = "drive:";

export const driveEnabled = Boolean(googleClientId);
export const isDriveKey = (key: string) => key.startsWith(KEY_PREFIX);
export const driveFileId = (key: string) => key.slice(KEY_PREFIX.length);

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: () => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;
let token: { value: string; expiresAt: number } | null = null;
let folderId: string | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("google_script_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Το token ζει ~1 ώρα και ζητιέται μόνο στη μνήμη. Η πρώτη φορά ανοίγει το παράθυρο συγκατάθεσης της Google.
async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  await loadGoogleScript();

  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) return reject(new Error(response.error ?? "drive_denied"));
        token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 };
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error("drive_popup_closed"))
    });
    client.requestAccessToken();
  });
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await getToken()}`, ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`drive_${response.status}`);
  return response;
}

// Με drive.file η εφαρμογή βλέπει μόνο τα αρχεία που δημιούργησε η ίδια, οπότε η αναζήτηση είναι ασφαλής.
async function ensureFolder(): Promise<string> {
  if (folderId) return folderId;

  const query = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const found = (await (await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`)).json()) as {
    files?: { id: string }[];
  };
  if (found.files?.[0]) return (folderId = found.files[0].id);

  const created = (await (
    await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
    })
  ).json()) as { id: string };
  return (folderId = created.id);
}

/** Ανεβάζει το αρχείο στο Drive του χρήστη και το κάνει ορατό σε όποιον έχει το link. Επιστρέφει "drive:<id>". */
export async function uploadToDrive(blob: Blob): Promise<string> {
  const parent = await ensureFolder();
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : "bin";
  const metadata = { name: `ff-${Date.now()}.${ext}`, parents: [parent] };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const created = (await (
    await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST",
      body: form
    })
  ).json()) as { id: string };

  await driveFetch(`https://www.googleapis.com/drive/v3/files/${created.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" })
  });

  return `${KEY_PREFIX}${created.id}`;
}

/** Σβήνει το αρχείο από το Drive του χρήστη. Αποτυγχάνει σιωπηλά (π.χ. αν το αρχείο είναι ξένο). */
export async function deleteFromDrive(key: string): Promise<void> {
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${driveFileId(key)}`, { method: "DELETE" });
  } catch {
    /* δεν είναι δικό μας ή έχει ήδη σβηστεί */
  }
}
