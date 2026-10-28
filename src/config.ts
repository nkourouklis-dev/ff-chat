const configured = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");

export const apiBaseUrl = import.meta.env.DEV ? "http://127.0.0.1:8787" : configured ?? "";
export const wsBaseUrl = apiBaseUrl.replace(/^http/, "ws");

// Προαιρετικό: αν οριστεί, τα video/φωτό αποθηκεύονται στο Google Drive του κάθε χρήστη αντί για R2.
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

export const appName = import.meta.env.VITE_APP_NAME?.trim() || "F&F Chat";
export const appTagline = "Friends & Family Chat";
