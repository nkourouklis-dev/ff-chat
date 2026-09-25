# Liakos Chat — Αρχιτεκτονική

**Έκδοση κώδικα:** v1.3.0 · **Ημερομηνία:** 6 Σεπτεμβρίου 2026
**Repo:** `nkourouklis-dev/liakos-chat` · **Worker:** `liakos-chat.nkourouklis.workers.dev`

> Τα διαγράμματα είναι σε Mermaid. Το GitHub τα κάνει render αυτόματα μέσα στο repo.
> Αν θες εικόνα, υπάρχει και το `liakos-architecture.svg`.

---

## 1. Διάγραμμα συστήματος (System Context)

```mermaid
graph TB
    subgraph Χρήστες
        U1[Φίλος με κινητό<br/>PWA στο Home Screen]
        U2[Φίλος με browser]
    end

    subgraph "Cloudflare Edge"
        PAGES[Cloudflare Pages<br/>React SPA · static]
        WORKER[Worker · Hono<br/>REST API + WS edge]
        DO[Durable Object<br/>ChatRoom · 1 ανά δωμάτιο]
        D1[(D1 · SQLite<br/>liakos_db)]
        R2[(R2 · liakos-media<br/>video αρχεία)]
        AI[Workers AI<br/>Llama 4 Scout 17B]
    end

    U1 -->|HTTPS| PAGES
    U2 -->|HTTPS| PAGES
    PAGES -->|fetch REST| WORKER
    PAGES -.->|WebSocket| WORKER
    WORKER -->|upgrade 101| DO
    WORKER --> D1
    WORKER --> R2
    WORKER --> AI
    DO --> D1

    style DO fill:#7c5cff,color:#fff
    style WORKER fill:#f6821f,color:#fff
```

**Το κλειδί:** ο Worker είναι stateless — δεν κρατάει ανοιχτά sockets. Το Durable Object είναι
ένα ζωντανό instance ανά δωμάτιο που κρατάει τα WebSockets και κάνει fan-out. Χωρίς αυτό
δεν υπάρχει real-time.

---

## 2. Component diagram — τι μιλάει με τι

```mermaid
graph LR
    subgraph "Frontend (src/)"
        MAIN[main.tsx<br/>BrowserRouter]
        APP[App.tsx<br/>routes + TabBar]
        API[services/api.ts<br/>fetch wrapper + token]
        UNREAD[services/useUnread.ts<br/>polling 12s]
        P1[pages/Login]
        P2[pages/Home]
        P3[pages/Chats]
        P4[pages/Room]
        P5[pages/Camera]
        P6[pages/Updates]
        P7[pages/AiBuddy]
        P8[pages/Games]
    end

    subgraph "Backend (worker/)"
        IDX[index.ts<br/>Hono app · 745 γρ.]
        AUTH[auth.ts<br/>HMAC token]
        ROOM[room.ts<br/>ChatRoom DO]
        TYPES[types.ts<br/>Env + WsEvent]
    end

    MAIN --> APP
    APP --> P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8
    APP --> UNREAD
    P1 & P3 & P4 & P5 & P6 & P7 --> API
    UNREAD --> API
    API -->|REST| IDX
    API -->|WebSocket| IDX
    IDX --> AUTH
    IDX --> ROOM
    ROOM --> AUTH
    IDX -.-> TYPES
    ROOM -.-> TYPES
```

---

## 3. Ροή real-time μηνύματος (Sequence)

```mermaid
sequenceDiagram
    participant A as Νίκος (browser A)
    participant W as Worker /ws/:roomId
    participant DO as ChatRoom DO
    participant DB as D1
    participant B as Μαρία (browser B)

    A->>W: GET /ws/room123?token=...
    W->>W: verifyToken(HMAC)
    Note over W: 401 αν λάθος token
    W->>DO: stub.fetch(+userId,handle,name)
    DO->>DO: acceptWebSocket + serializeAttachment
    DO-->>A: 101 Switching Protocols
    A->>DO: {"type":"ping"}
    DO-->>A: presence {count:1}

    B->>DO: connect + ping
    DO-->>A: presence {count:2}
    DO-->>B: presence {count:2}

    A->>DO: {"type":"message","body":"Γεια"}
    DO->>DB: INSERT INTO messages
    DO-->>A: message event
    DO-->>B: message event
    Note over B: εμφανίζεται χωρίς refresh
```

**Κρίσιμη λεπτομέρεια στον κώδικα:** το route `/ws/:roomId` δηλώνεται **πάνω** από το CORS
middleware. Μια απάντηση 101 έχει immutable headers — αν το CORS προσπαθήσει να γράψει
header μετά, σκάει η σύνδεση. Γι' αυτό υπάρχει και ο έλεγχος `c.res.status !== 101`.

---

## 4. Ροή AI με μνήμη (Sequence)

```mermaid
sequenceDiagram
    participant U as Χρήστης
    participant W as Worker /api/ai/chat
    participant AI as Workers AI
    participant DB as D1 user_memory

    U->>W: messages[] (τελευταία 12)
    W->>W: looksPersonal? (regex: είμαι/έχω/μένω/...)
    alt Το μήνυμα δείχνει προσωπική πληροφορία
        W->>AI: extraction prompt (temp 0.1)
        AI-->>W: {"memories":[{key,value,category,importance}]}
        W->>DB: UPSERT user_memory
    end
    W->>DB: SELECT top 30 by importance
    DB-->>W: αποθηκευμένες μνήμες
    W->>AI: system prompt Λιάκου + μνήμες + ιστορικό
    AI-->>W: απάντηση
    W->>W: hasCyrillic? → retry → φιλτράρισμα λέξεων
    W-->>U: {reply, memoriesUsed}
```

Το `looksPersonal` gate υπάρχει για κόστος: το extraction είναι **δεύτερη** κλήση AI.
Τρέχει μόνο όταν το μήνυμα είναι >25 χαρακτήρες και ταιριάζει σε regex.

---

## 5. Μοντέλο δεδομένων (D1)

```mermaid
erDiagram
    users ||--o{ rooms : "created_by"
    users ||--o{ room_members : ""
    users ||--o{ messages : ""
    users ||--o{ updates : ""
    users ||--o{ user_memory : ""
    users ||--o{ room_reads : ""
    rooms ||--o{ room_members : ""
    rooms ||--o{ messages : ""
    rooms ||--o{ room_reads : ""
    rooms ||--o{ game_sessions : ""

    users {
        TEXT id PK
        TEXT handle UK "auto-generated slug + 4 hex"
        TEXT display_name
        TEXT avatar_url "αχρησιμοποίητο"
        INTEGER created_at
    }
    rooms {
        TEXT id PK
        TEXT name
        TEXT kind "group"
        TEXT created_by FK
        INTEGER created_at
    }
    room_members {
        TEXT room_id PK
        TEXT user_id PK
        INTEGER joined_at
    }
    messages {
        TEXT id PK
        TEXT room_id FK
        TEXT user_id FK
        TEXT kind "text | media"
        TEXT body
        TEXT media_key "R2 key"
        INTEGER expires_at "nullable TTL"
        INTEGER edited_at
        INTEGER deleted_at "soft delete"
        INTEGER created_at
    }
    updates {
        TEXT id PK
        TEXT user_id FK
        TEXT caption
        TEXT media_key
        INTEGER expires_at "default +24h"
        INTEGER created_at
    }
    room_reads {
        TEXT room_id PK
        TEXT user_id PK
        INTEGER last_read_at
    }
    user_memory {
        TEXT id PK
        TEXT user_id FK
        TEXT memory_key UK
        TEXT memory_value
        TEXT category
        INTEGER importance "1-10"
        INTEGER updated_at
    }
    game_sessions {
        TEXT id PK
        TEXT room_id FK
        TEXT game
        TEXT state "JSON"
        INTEGER updated_at
    }
```

**Σημείωση:** δεν υπάρχουν FOREIGN KEY constraints στο schema — μόνο λογικές σχέσεις.
Ο πίνακας `game_sessions` έχει δημιουργηθεί αλλά **δεν χρησιμοποιείται πουθενά** ακόμη.

### Migrations

| Αρχείο | Τι πρόσθεσε |
|---|---|
| `0001_init.sql` | users, rooms, room_members, messages, updates, game_sessions |
| `0002_memory.sql` | user_memory (πρώτη προσπάθεια) |
| `0003_fix_user_memory.sql` | DROP + ξαναφτιάξιμο του user_memory |
| `0004_room_reads.sql` | room_reads — παρακολούθηση αδιάβαστων |
| `0005_message_edits.sql` | `edited_at`, `deleted_at` στα messages |
| `0006_workspaces_ai_settings.sql` | `workspaces`, `users.workspace_id/role`, `user_ai_settings` (βλ. `05_WORKSPACES_AND_AI.md`) |

---

## 6. Deployment / CI-CD

```mermaid
graph LR
    DEV[Τοπικό dev<br/>wrangler dev :8787<br/>vite :5173] -->|git push main| GH[GitHub Actions<br/>deploy.yml]
    GH -->|npm ci + build| B[dist/]
    GH -->|wrangler deploy| CFW[Cloudflare Worker<br/>+ DO + bindings]
    GH -->|wrangler pages deploy| CFP[Cloudflare Pages<br/>liakos-chat]
    CFP -.->|VITE_API_BASE_URL| CFW

    style GH fill:#24292e,color:#fff
```

**Secrets που χρειάζονται:**

| Πού | Όνομα | Τι είναι |
|---|---|---|
| GitHub → Actions Secrets | `CLOUDFLARE_API_TOKEN` | για τα deploys |
| GitHub → Actions Secrets | `CLOUDFLARE_ACCOUNT_ID` | account id |
| Cloudflare Worker secret | `JWT_SECRET` | υπογραφή HMAC token |
| Cloudflare Pages env var | `VITE_API_BASE_URL` | το URL του Worker (build-time!) |
| Τοπικά `.dev.vars` | `JWT_SECRET` | τοπικό secret, **ποτέ στο git** |

⚠️ Το `VITE_API_BASE_URL` μπαίνει στο bundle σε **build time**. Αν το αλλάξεις,
πρέπει να ξανακάνεις build + deploy — δεν αρκεί το restart.

---

## 7. Χάρτης API

| Method | Route | Auth | Τι κάνει |
|---|---|:--:|---|
| GET | `/health` | — | health check |
| POST | `/api/auth/login` | — | δημιουργεί χρήστη + token (365 μέρες). Νέα παρέα (`workspaceName`) ή είσοδος με `inviteCode`/`roomId` |
| GET | `/api/workspace` | ✅ | όνομα παρέας, invite code, ρόλος |
| PATCH | `/api/workspace` | ✅ | μετονομασία παρέας — **μόνο admin** |
| GET | `/ws/:roomId` | token | WebSocket upgrade → Durable Object |
| GET | `/api/rooms` | ✅ | τα δωμάτιά μου |
| POST | `/api/rooms` | ✅ | νέο δωμάτιο (γίνομαι owner + member) |
| GET | `/api/rooms/:id` | ✅ | στοιχεία δωματίου |
| PATCH | `/api/rooms/:id` | ✅ | μετονομασία — **μόνο owner** |
| DELETE | `/api/rooms/:id` | ✅ | owner → σβήνει για όλους · άλλος → αποχωρεί |
| POST | `/api/rooms/:id/join` | ✅ | είσοδος με invite link — **μόνο από την ίδια παρέα** |
| GET | `/api/rooms/:id/messages` | ✅ | τελευταία 100, χωρίς deleted/expired |
| GET | `/api/unread` | ✅ | σύνολο + ανά δωμάτιο |
| POST | `/api/rooms/:id/read` | ✅ | σφράγισμα «διαβάστηκε» |
| POST | `/api/media` | ✅ | upload στο R2 → επιστρέφει key |
| GET | `/api/media/:userId/:file` | ❌ | σερβίρει video, με Range support |
| GET | `/api/updates` | ✅ | ενεργά updates της **παρέας μου** (expires_at > τώρα) |
| POST | `/api/updates` | ✅ | νέο update, default TTL 24h |
| DELETE | `/api/updates/:id` | ✅ | μόνο δικό μου, σβήνει και το R2 object |
| POST | `/api/ai/chat` | ✅ | ο AI μου (δικό μου key, ή ενσωματωμένος αν το workspace το επιτρέπει) + μνήμη · 409 αν ανενεργός |
| GET/PUT/DELETE | `/api/ai/settings` | ✅ | provider, όνομα bot, API key (κρυπτογραφημένο, δεν επιστρέφεται) |
| GET | `/api/ai/memory` | ✅ | τι θυμάται για μένα |
| DELETE | `/api/ai/memory/:key` | ✅ | σβήνει μία μνήμη |
| DELETE | `/api/ai/memory` | ✅ | σβήνει όλες |

### WebSocket events

**Client → Server:** `ping`, `message`, `edit`, `delete`, `typing`, `game`
**Server → Client:** `message`, `edit`, `delete`, `presence`, `typing`, `game`, `error`

Τα `typing` και `game` **υποστηρίζονται ήδη από τον server** αλλά δεν είναι συνδεδεμένα
στο UI. Είναι δωρεάν feature — μόνο frontend δουλειά.

---

## 8. Ασφάλεια — τι ισχύει σήμερα

```mermaid
graph TD
    L[POST /api/auth/login<br/>μόνο όνομα] --> T[HMAC-SHA256 token<br/>payload.signature]
    T --> LS[localStorage<br/>liakos.token]
    LS --> H[Authorization: Bearer]
    LS --> Q[?token= στο WebSocket URL]
    H --> V[verifyToken]
    Q --> V
    V --> S{έγκυρο & όχι expired?}
    S -->|ναι| OK[c.set session]
    S -->|όχι| E[401]

    style Q fill:#c0392b,color:#fff
```

**Τι είναι εντάξει:** HMAC υπογραφή με WebCrypto, χωρίς εξωτερικά libs. Το `WHERE user_id = ?`
στα edit/delete εμποδίζει κάποιον να πειράξει ξένο μήνυμα ακόμη κι αν στείλει χειροκίνητα
το event. Το CORS δέχεται μόνο localhost + `*.pages.dev`.

**Τι δεν είναι:** αναλυτικά στο `04_PRODUCT_OWNER_MANUAL.md`, ενότητα «Ρίσκα».
