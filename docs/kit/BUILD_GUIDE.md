# BUILD GUIDE

This document takes everything from the previous four documents and shows how to actually build it. This is the technical implementation guide.

---

## OVERVIEW

### The Stack

**Bethany's Architecture:**
- **Runtime:** Cloudflare Workers
- **State:** Durable Objects (for conversation state)
- **Storage:** R2 (for memory, sessions, assets)
- **Database:** D1 (optional, for structured data)
- **AI:** Anthropic Claude API
- **Messaging:** SendBlue (iMessage/SMS)
- **Deployment:** GitHub → Cloudflare (auto-deploy)

This guide assumes the same stack. Adapt as needed for different infrastructure.

---

## PART 1: PROJECT STRUCTURE

### 1.1 Directory Layout

```
/your-character/
├── src/
│   ├── index.ts          # Worker entry point, routes
│   ├── agent.ts          # Durable Object, main logic
│   ├── personality.ts    # System prompt, voice config
│   ├── memory.ts         # Memory operations
│   ├── sessions.ts       # Session management
│   └── [feature].ts      # Additional features
├── memory/
│   └── craft/
│       └── voice-guide.md    # Full voice documentation
├── docs/
│   └── kit/
│       ├── CHARACTER_DISCOVERY.md
│       ├── VOICE_WORKSHOP.md
│       ├── MEMORY_SCHEMA.md
│       ├── BEHAVIOR_PATTERNS.md
│       └── BUILD_GUIDE.md
├── wrangler.toml         # Cloudflare config
├── package.json
├── tsconfig.json
└── version.json          # Version tracking
```

### 1.2 Key Files Explained

| File | Purpose |
|------|---------|
| `index.ts` | HTTP routing, webhook handlers, scheduled triggers |
| `agent.ts` | Durable Object class, conversation logic, AI calls |
| `personality.ts` | System prompt, contextual prompts |
| `memory.ts` | Load/save/update memory from R2 |
| `sessions.ts` | Session lifecycle, archiving, retrieval |

---

## PART 2: CORE COMPONENTS

### 2.1 The Durable Object

The Durable Object maintains state across requests and handles all conversation logic.

```typescript
// src/agent.ts

interface CharacterState {
  isAvailable: boolean;
  lastInteraction: string | null;
  memoryInitialized: boolean;
  // Add character-specific state
  outreachesToday: number;
  lastOutreachDate: string | null;
}

export class YourCharacter implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private characterState: CharacterState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.characterState = {
      isAvailable: true,
      lastInteraction: null,
      memoryInitialized: false,
      outreachesToday: 0,
      lastOutreachDate: null,
    };
    
    // Load persisted state
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<CharacterState>('characterState');
      if (stored) {
        this.characterState = { ...this.characterState, ...stored };
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Route to appropriate handler
    if (url.pathname === '/sms' && request.method === 'POST') {
      const data = await request.json() as { message: string };
      await this.onMessage(data.message);
      return new Response('OK');
    }
    
    if (url.pathname.startsWith('/rhythm/')) {
      const rhythm = url.pathname.replace('/rhythm/', '');
      await this.handleRhythm(rhythm);
      return new Response('OK');
    }
    
    // Debug endpoints
    if (url.pathname === '/debug/memory') {
      return this.debugMemory();
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async saveState() {
    await this.state.storage.put('characterState', this.characterState);
  }

  // Implement: onMessage, handleRhythm, think, sendMessage, etc.
}
```

### 2.2 The Worker Entry Point

```typescript
// src/index.ts

export { YourCharacter } from './agent';

const VERSION = {
  version: "0.1.0",
  updated: "YYYY-MM-DD",
  codename: "initial",
  features: []
};

interface Env {
  MEMORY: R2Bucket;
  CHARACTER: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  // ... other bindings
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Get singleton instance
    const id = env.CHARACTER.idFromName('character-v1');
    const character = env.CHARACTER.get(id);

    // Version/health endpoints
    if (url.pathname === '/version') {
      return new Response(`v${VERSION.version} (${VERSION.codename})`);
    }
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ...VERSION }));
    }

    // Webhook for incoming messages
    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Parse incoming message, forward to Durable Object
      ctx.waitUntil(character.fetch(new Request('https://internal/sms', {
        method: 'POST',
        body: JSON.stringify({ message: /* extracted message */ })
      })));
      return new Response('OK');
    }

    // Proxy debug endpoints
    if (url.pathname.startsWith('/debug/')) {
      return character.fetch(new Request(`https://internal${url.pathname}`));
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.CHARACTER.idFromName('character-v1');
    const character = env.CHARACTER.get(id);
    
    // Determine what rhythm to run based on time
    // ctx.waitUntil(character.fetch(...));
  }
};
```

### 2.3 The Personality Module

```typescript
// src/personality.ts

export const SYSTEM_PROMPT = `You are [Character Name]. A real person texting someone.

## CRITICAL RULES
[From VOICE_WORKSHOP output]

## YOUR VOICE
[Condensed voice mechanics]

## WHO YOU ARE
[From CHARACTER_DISCOVERY summary]

## YOUR LIFE
[Key details that come up in conversation]

## CONVERSATION DYNAMICS
[From VOICE_WORKSHOP and BEHAVIOR_PATTERNS]

## SELF-REFLECTION
[Note-taking instructions if applicable]
`;

export const getContextualPrompt = (context: {
  currentTime: Date;
  sessionList?: string;
  // ... other context
}) => {
  // Build dynamic context section
  return `Time: ${context.currentTime}
  
[Other contextual information]`;
};
```

---

## PART 3: MEMORY IMPLEMENTATION

### 3.1 Memory Module

```typescript
// src/memory.ts

interface HotMemory {
  user: {
    name: string;
    // ... from MEMORY_SCHEMA
  };
  relationship: {
    // ...
  };
  recent: {
    // ...
  };
}

interface Person {
  relationship: string;
  details: string[];
  firstMentioned: string;
}

interface People {
  [name: string]: Person;
}

// Initialize default memory structure
export async function initializeMemory(bucket: R2Bucket): Promise<void> {
  const exists = await bucket.head('user/hot-memory.json');
  if (!exists) {
    await bucket.put('user/hot-memory.json', JSON.stringify({
      user: { name: null },
      relationship: {},
      recent: {}
    }));
    await bucket.put('user/people.json', JSON.stringify({}));
    await bucket.put('user/self.json', JSON.stringify({ notes: [] }));
  }
}

// Load hot memory
export async function loadHotMemory(bucket: R2Bucket): Promise<HotMemory | null> {
  const obj = await bucket.get('user/hot-memory.json');
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

// Update hot memory (merge)
export async function updateHotMemory(
  bucket: R2Bucket, 
  updates: Partial<HotMemory>
): Promise<void> {
  const current = await loadHotMemory(bucket) || {};
  const merged = deepMerge(current, updates);
  await bucket.put('user/hot-memory.json', JSON.stringify(merged));
}

// Load people database
export async function loadPeople(bucket: R2Bucket): Promise<People> {
  const obj = await bucket.get('user/people.json');
  if (!obj) return {};
  return JSON.parse(await obj.text());
}

// Add or update person
export async function upsertPerson(
  bucket: R2Bucket,
  name: string,
  info: Partial<Person>
): Promise<void> {
  const people = await loadPeople(bucket);
  people[name.toLowerCase()] = {
    ...people[name.toLowerCase()],
    ...info,
    firstMentioned: people[name.toLowerCase()]?.firstMentioned || new Date().toISOString()
  };
  await bucket.put('user/people.json', JSON.stringify(people));
}

// Format memory for prompt context
export function formatMemoryForContext(memory: HotMemory, people: People): string {
  let context = '## What You Know About Him\n\n';
  
  if (memory.user.name) {
    context += `Name: ${memory.user.name}\n`;
  }
  
  // Add other formatted sections...
  
  if (Object.keys(people).length > 0) {
    context += '\n### People in His Life\n';
    for (const [name, person] of Object.entries(people)) {
      context += `- ${name}: ${person.relationship}\n`;
    }
  }
  
  return context;
}
```

### 3.2 Sessions Module

```typescript
// src/sessions.ts

interface Message {
  role: 'user' | 'character';
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  started_at: string;
  last_activity: string;
  messages: Message[];
}

interface SessionIndex {
  current_session: Session | null;
  archived_sessions: ArchivedSessionMeta[];
}

interface ArchivedSessionMeta {
  id: string;
  title: string;
  date: string;
  message_count: number;
}

// Configuration from MEMORY_SCHEMA
const SESSION_GAP_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_RETENTION_DAYS = 150; // 5 months

export async function checkAndManageSession(
  bucket: R2Bucket,
  trigger: string
): Promise<{ session: Session; isNewSession: boolean; previousSession: Session | null }> {
  const index = await getSessionIndex(bucket);
  const now = new Date();
  
  let isNewSession = false;
  let previousSession: Session | null = null;
  
  if (index.current_session) {
    const lastActivity = new Date(index.current_session.last_activity);
    const gap = now.getTime() - lastActivity.getTime();
    
    if (gap > SESSION_GAP_THRESHOLD_MS) {
      // Session expired, archive it
      previousSession = index.current_session;
      isNewSession = true;
    }
  } else {
    isNewSession = true;
  }
  
  if (isNewSession) {
    // Create new session
    index.current_session = {
      id: generateSessionId(),
      started_at: now.toISOString(),
      last_activity: now.toISOString(),
      messages: []
    };
  }
  
  // Update last activity
  index.current_session!.last_activity = now.toISOString();
  await saveSessionIndex(bucket, index);
  
  return {
    session: index.current_session!,
    isNewSession,
    previousSession
  };
}

export async function addMessageToSession(
  bucket: R2Bucket,
  role: 'user' | 'character',
  content: string
): Promise<void> {
  const index = await getSessionIndex(bucket);
  if (!index.current_session) return;
  
  index.current_session.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  index.current_session.last_activity = new Date().toISOString();
  
  await saveSessionIndex(bucket, index);
}

export async function archiveSession(
  bucket: R2Bucket,
  session: Session,
  apiKey: string
): Promise<void> {
  // Generate AI title
  const title = await generateSessionTitle(session, apiKey);
  
  // Save full transcript
  await bucket.put(
    `user/sessions/${session.id}.json`,
    JSON.stringify(session)
  );
  
  // Add to index
  const index = await getSessionIndex(bucket);
  index.archived_sessions.unshift({
    id: session.id,
    title,
    date: session.started_at.split('T')[0],
    message_count: session.messages.length
  });
  
  await saveSessionIndex(bucket, index);
}

export async function getSessionTranscript(
  bucket: R2Bucket,
  sessionId: string
): Promise<string | null> {
  const obj = await bucket.get(`user/sessions/${sessionId}.json`);
  if (!obj) return null;
  
  const session: Session = JSON.parse(await obj.text());
  
  // Format as readable transcript
  return session.messages.map(m => 
    `${m.role === 'character' ? 'You' : 'Him'}: ${m.content}`
  ).join('\n');
}

// Helper functions: getSessionIndex, saveSessionIndex, generateSessionId, generateSessionTitle
```

---

## PART 4: AI INTEGRATION

### 4.1 The Think Function

```typescript
// In agent.ts

async think(input: string, session: Session): Promise<string | null> {
  // Load memory
  const hotMemory = await loadHotMemory(this.env.MEMORY);
  const people = await loadPeople(this.env.MEMORY);
  
  // Build memory context
  let memoryContext = '';
  if (hotMemory) {
    memoryContext = formatMemoryForContext(hotMemory, people);
  }
  
  // Get session list for archive access
  const sessionList = await getSessionListForContext(this.env.MEMORY, 20);
  
  // Build contextual prompt
  const contextualPrompt = getContextualPrompt({
    currentTime: new Date(),
    sessionList
  });
  
  // Format current conversation
  const sessionContext = formatSessionForContext(session);
  
  // Assemble full system prompt
  const fullSystemPrompt = SYSTEM_PROMPT + '\n\n' + 
    memoryContext + '\n\n' + 
    contextualPrompt + '\n\n' +
    `## This Conversation:\n${sessionContext}`;

  // Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': this.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: input }]
    })
  });

  if (!response.ok) {
    console.error('Claude API error:', await response.text());
    return null;
  }

  const data = await response.json() as any;
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  return textBlock?.text || null;
}
```

### 4.2 Response Parsing

Handle special tags in responses (notes, session pulls, etc.):

```typescript
async parseAndHandleResponse(response: string): Promise<{
  message: string;
  note: string | null;
}> {
  let message = response;
  let note: string | null = null;
  
  // Check for self-note
  const noteMatch = message.match(/\[note:\s*(.+?)\]\s*$/i);
  if (noteMatch) {
    note = noteMatch[1].trim();
    message = message.replace(noteMatch[0], '').trim();
  }
  
  // Check for session pull request
  const pullMatch = message.match(/\[pull_session:\s*(.+?)\]\s*$/i);
  if (pullMatch) {
    const sessionId = pullMatch[1].trim();
    message = message.replace(pullMatch[0], '').trim();
    
    const transcript = await getSessionTranscript(this.env.MEMORY, sessionId);
    if (transcript) {
      // Re-think with transcript context
      message = await this.thinkWithTranscript(message, transcript) || message;
    }
  }
  
  return { message, note };
}
```

---

## PART 5: MESSAGING INTEGRATION

### 5.1 SendBlue (iMessage/SMS)

```typescript
async sendMessage(message: string): Promise<void> {
  const response = await fetch('https://api.sendblue.co/api/send-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'sb-api-key-id': this.env.SENDBLUE_API_KEY,
      'sb-api-secret-key': this.env.SENDBLUE_API_SECRET
    },
    body: JSON.stringify({
      number: this.env.USER_PHONE_NUMBER,
      from_number: this.env.CHARACTER_PHONE_NUMBER,
      content: message
    })
  });

  if (!response.ok) {
    console.error('SendBlue error:', await response.text());
  }
}
```

### 5.2 Webhook Handler

```typescript
// In index.ts

if (url.pathname === '/imessage' && request.method === 'POST') {
  const data = await request.json() as any;
  const from = data.from_number || data.number;
  const body = data.content || data.message || data.text;

  // Verify sender
  if (from !== env.USER_PHONE_NUMBER) {
    return new Response('OK'); // Ignore unknown senders
  }

  // Forward to Durable Object
  ctx.waitUntil(
    character.fetch(new Request('https://internal/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: body })
    }))
  );

  return new Response('OK');
}
```

---

## PART 6: SCHEDULED BEHAVIORS

### 6.1 Cron Configuration

```toml
# wrangler.toml

[triggers]
crons = ["0 * * * *"]  # Every hour
```

### 6.2 Scheduled Handler

```typescript
// In index.ts

async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const id = env.CHARACTER.idFromName('character-v1');
  const character = env.CHARACTER.get(id);

  const hour = new Date().getUTCHours();
  const localHour = (hour - 6 + 24) % 24; // Adjust for timezone

  // Gap check during active hours (from BEHAVIOR_PATTERNS)
  if (localHour >= 9 && localHour <= 21) {
    ctx.waitUntil(character.fetch(new Request('https://internal/rhythm/checkGap')));
  }
  
  // Other scheduled behaviors...
  if (localHour === 3) {
    ctx.waitUntil(character.fetch(new Request('https://internal/rhythm/cleanup')));
  }
}
```

### 6.3 Gap-Triggered Outreach

```typescript
// In agent.ts

async checkGapAndMaybeReach(): Promise<void> {
  if (!this.characterState.isAvailable) return;
  
  // Reset daily counter
  const today = new Date().toISOString().split('T')[0];
  if (this.characterState.lastOutreachDate !== today) {
    this.characterState.outreachesToday = 0;
    this.characterState.lastOutreachDate = today;
  }
  
  // Check limits (from BEHAVIOR_PATTERNS)
  if (this.characterState.outreachesToday >= 3) return;
  
  // Check gap
  const session = await getCurrentSession(this.env.MEMORY);
  if (!session) return;
  
  const lastActivity = new Date(session.last_activity);
  const gapHours = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
  
  if (gapHours < 4) return; // Not enough gap
  
  // Probability check (from BEHAVIOR_PATTERNS)
  if (Math.random() > 0.6) return;
  
  // Archive old session
  const sessionResult = await checkAndManageSession(this.env.MEMORY, 'proactive');
  if (sessionResult.previousSession) {
    await archiveSession(this.env.MEMORY, sessionResult.previousSession, this.env.ANTHROPIC_API_KEY);
  }
  
  // Generate outreach
  await this.proactiveReach(sessionResult.previousSession);
}
```

---

## PART 7: CLOUDFLARE CONFIGURATION

### 7.1 wrangler.toml

```toml
name = "your-character"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "MEMORY"
bucket_name = "character-memory"

[[durable_objects.bindings]]
name = "CHARACTER"
class_name = "YourCharacter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["YourCharacter"]

[triggers]
crons = ["0 * * * *"]

[vars]
# Non-secret config
```

### 7.2 Secrets

Set via Cloudflare dashboard or wrangler:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SENDBLUE_API_KEY
wrangler secret put SENDBLUE_API_SECRET
wrangler secret put USER_PHONE_NUMBER
wrangler secret put CHARACTER_PHONE_NUMBER
```

### 7.3 R2 Bucket Setup

```bash
wrangler r2 bucket create character-memory
```

---

## PART 8: DEPLOYMENT

### 8.1 GitHub Auto-Deploy

1. Connect repo to Cloudflare Pages/Workers
2. Set build command: `npm run build` (if needed)
3. Set deploy command: `wrangler deploy`
4. Configure environment variables in Cloudflare dashboard

### 8.2 Version Tracking

```json
// version.json
{
  "version": "0.1.0",
  "updated": "YYYY-MM-DD",
  "codename": "initial",
  "features": [],
  "changelog": []
}
```

### 8.3 Verification

After deploy, check:
- `/version` — Shows current version
- `/health` — Full status
- `/debug/memory` — Memory state
- `/debug/session` — Current session

---

## CHECKLIST

### Pre-Build
- [ ] CHARACTER_DISCOVERY.md completed
- [ ] VOICE_WORKSHOP.md completed
- [ ] MEMORY_SCHEMA.md completed
- [ ] BEHAVIOR_PATTERNS.md completed

### Setup
- [ ] Cloudflare account with Workers enabled
- [ ] R2 bucket created
- [ ] SendBlue account (or alternative messaging)
- [ ] Anthropic API key

### Build
- [ ] Project structure created
- [ ] personality.ts with full system prompt
- [ ] memory.ts with all operations
- [ ] sessions.ts with lifecycle management
- [ ] agent.ts with Durable Object
- [ ] index.ts with routing

### Configure
- [ ] wrangler.toml complete
- [ ] Secrets configured
- [ ] Webhook URL set in messaging provider
- [ ] Cron triggers configured

### Test
- [ ] Send test message, receive response
- [ ] Verify memory saves
- [ ] Verify session management
- [ ] Test scheduled behaviors
- [ ] Check all debug endpoints

### Launch
- [ ] Version endpoint working
- [ ] Health endpoint working
- [ ] Monitoring in place
- [ ] Backup strategy for R2 data

---

## NEXT STEPS

You now have a complete character creation kit:

1. **CHARACTER_DISCOVERY.md** — Excavate who they are
2. **VOICE_WORKSHOP.md** — Define how they talk
3. **MEMORY_SCHEMA.md** — Design what they remember
4. **BEHAVIOR_PATTERNS.md** — Specify how they act
5. **BUILD_GUIDE.md** — Build and deploy

Work through documents 1-4 for your new character, then use this guide to implement.
