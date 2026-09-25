export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  AI: Ai;
  ROOM: DurableObjectNamespace;
  APP_NAME: string;
  AI_NAME: string;
  // Όρια για να μένει η υπηρεσία μέσα στο free tier.
  MAX_WORKSPACES: string;
  MAX_MEMBERS_PER_WORKSPACE: string;
  MAX_MESSAGES_PER_DAY: string;
  MAX_UPLOAD_MB: string;
  ALLOWED_ORIGIN_SUFFIX: string;
  JWT_SECRET: string;
}

export type WsEvent =
  | { type: "hello"; userId: string; handle: string }
  | {
      type: "message";
      id: string;
      roomId: string;
      userId: string;
      handle: string;
      name: string;
      kind: string;
      body?: string;
      mediaKey?: string;
      createdAt: number;
    }
  | { type: "edit"; id: string; body: string; editedAt: number }
  | { type: "delete"; id: string }
  | { type: "typing"; userId: string; handle: string; name: string }
  | { type: "presence"; count: number; members: string[] }
  | { type: "game"; game: string; state: unknown }
  | { type: "error"; message: string };
