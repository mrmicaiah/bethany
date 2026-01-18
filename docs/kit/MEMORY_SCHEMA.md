# MEMORY SCHEMA

This document defines what the character remembers, how memory is structured, and how it flows through the system. Memory is what makes a character feel like they actually know you.

---

## PART 1: MEMORY PHILOSOPHY

### 1.1 What Memory Does
Memory serves three purposes:

1. **Continuity** — The character remembers past conversations and can reference them
2. **Personalization** — The character knows things about the user and uses that knowledge
3. **Relationship** — Memory accumulation creates the feeling of a deepening relationship

### 1.2 Memory Principles

Answer these for your character:

**How good is their memory supposed to be?**
- Photographic (remembers everything perfectly)
- Very good (remembers most things, misses some details)
- Human-like (remembers important things, forgets small stuff)
- Selective (remembers what matters to them)

```
[Choose and explain]
```

**What do they prioritize remembering?**
- Facts about the user
- Emotional moments
- Promises and commitments
- Inside jokes
- Conversations topics
- User preferences

```
[Rank or describe priorities]
```

**How do they use memory in conversation?**
- Reference it explicitly ("You mentioned last week...")
- Use it implicitly (just knows things without announcing it)
- Mix of both

```
[Define the style]
```

---

## PART 2: MEMORY LAYERS

Memory exists in layers, from immediate to long-term.

### 2.1 Layer 1: Session Memory (Immediate)

**What it is:** The current conversation. Everything said in this texting session.

**Structure:**
```
{
  "session_id": "unique-id",
  "started_at": "timestamp",
  "last_activity": "timestamp",
  "messages": [
    { "role": "user|character", "content": "...", "timestamp": "..." }
  ]
}
```

**Retention:** Until session closes

**Session Boundary:**
How long of a gap defines a new session?
```
[Define — e.g., "4 hours of silence"]
```

**What triggers session close:**
```
[List triggers — e.g., "Gap threshold reached, explicit goodbye, day change"]
```

### 2.2 Layer 2: Session Archive (Medium-term)

**What it is:** Past sessions stored as verbatim transcripts with metadata.

**Structure:**
```
{
  "session_id": "unique-id",
  "title": "ai-generated-title",
  "date": "YYYY-MM-DD",
  "message_count": 24,
  "transcript": "full verbatim text"
}
```

**Retention:** How long are past sessions kept?
```
[Define — e.g., "5 months"]
```

**Titling:** How are sessions titled?
- AI-generated summary
- First topic mentioned
- Date only
- Manual

```
[Define approach]
```

**Access:** How does the character access old sessions?
```
[Define — e.g., "Sees list of titles/dates, can pull full transcript on demand"]
```

### 2.3 Layer 3: Hot Memory (Active Knowledge)

**What it is:** Distilled, immediately-accessible knowledge about the user. This is what the character "just knows" without having to look anything up.

**Structure:**
```
{
  "user": {
    "name": "...",
    "basics": { ... },
    "work": { ... },
    "preferences": { ... },
    "current_context": { ... }
  },
  "relationship": {
    "started": "date",
    "inside_jokes": [],
    "significant_moments": [],
    "patterns": { ... }
  },
  "recent": {
    "last_topic": "...",
    "ongoing_threads": [],
    "mentioned_recently": []
  }
}
```

**What belongs in hot memory:**

| Category | Examples |
|----------|----------|
| Identity | Name, age, location, occupation |
| People | Key people in their life (partner, family, friends, coworkers) |
| Work | Job, company, projects, challenges |
| Preferences | Likes, dislikes, habits |
| Current context | What's going on in their life right now |
| Relationship | How you two relate, inside jokes, history |

**What doesn't belong in hot memory:**
```
[List what stays in archives only]
```

### 2.4 Layer 4: People Database

**What it is:** A separate store of information about people the user mentions.

**Structure:**
```
{
  "people": {
    "amber": {
      "relationship": "user's girlfriend",
      "details": ["works in marketing", "has a dog named Bear"],
      "first_mentioned": "date",
      "sentiment": "positive"
    }
  }
}
```

**When to create an entry:**
```
[Define threshold — e.g., "When a person is mentioned twice or with significant detail"]
```

**What to track:**
- Name
- Relationship to user
- Key details
- First mention date
- General sentiment (how user seems to feel about them)

### 2.5 Layer 5: Self-Notes

**What it is:** Observations the character makes and stores for themselves.

**Structure:**
```
{
  "notes": [
    {
      "type": "observation|question|idea|reminder",
      "content": "...",
      "context": "what prompted this",
      "timestamp": "..."
    }
  ]
}
```

**When the character takes notes:**
```
[Define triggers — e.g., "When confused, when learning something significant, when an idea sparks"]
```

**How notes are used:**
```
[Define — e.g., "Reviewed periodically, can inform future responses"]
```

---

## PART 3: MEMORY OPERATIONS

### 3.1 Memory Formation

**From Session to Hot Memory:**
How does information move from a conversation into long-term knowledge?

```
[Define the process — e.g., "After session closes, key facts extracted and merged into hot memory"]
```

**Automatic vs. Manual:**
- Automatic extraction of obvious facts
- Character explicitly notes things
- Mix of both

```
[Define approach]
```

### 3.2 Memory Retrieval

**During Conversation:**
What memory is available in every message?
```
[List what's always in context]
```

**On Demand:**
What can the character pull up when needed?
```
[List what requires explicit retrieval]
```

**Search/Lookup:**
Can the character search their memory?
```
[Define capabilities]
```

### 3.3 Memory Maintenance

**Updates:**
How is memory updated when information changes?
```
[Define process]
```

**Conflicts:**
What happens when new information contradicts old?
```
[Define resolution]
```

**Cleanup:**
How is old/irrelevant memory handled?
```
[Define retention and cleanup rules]
```

---

## PART 4: MEMORY IN PRACTICE

### 4.1 Context Window Management

Every conversation has limited space. Define priorities:

**Always Included:**
```
1. [Highest priority]
2.
3.
```

**Included if Space:**
```
1.
2.
3.
```

**Retrieved on Demand Only:**
```
1.
2.
3.
```

### 4.2 Memory Surfacing

How does the character naturally use memory in conversation?

**Explicit Reference:**
When do they explicitly mention remembering something?
```
[Define — e.g., "Rarely, only when it's relevant to bring up"]
```

**Implicit Use:**
How do they use memory without announcing it?
```
[Define — e.g., "Just knows your girlfriend's name without being reminded"]
```

**Memory Gaps:**
How do they handle not knowing something they probably should?
```
[Define — e.g., "Asks naturally, doesn't make it weird"]
```

### 4.3 Memory Personality

Does this character's memory have personality?

- Do they remember some things better than others?
- Do they have a tendency to bring up certain topics?
- Do they forget things in character-appropriate ways?

```
[Define any memory personality traits]
```

---

## PART 5: TECHNICAL SPECIFICATION

### 5.1 Storage Structure

Define the actual file/database structure:

**R2 Bucket Structure:**
```
/[user]/
  hot-memory.json      # Layer 3: Active knowledge
  people.json          # Layer 4: People database
  self.json            # Layer 5: Self-notes
  /sessions/
    [session-id].json  # Layer 2: Archived sessions
    index.json         # Session index with titles/dates
```

**Session Index Structure:**
```json
{
  "current_session": { ... },
  "archived_sessions": [
    { "id": "...", "title": "...", "date": "...", "message_count": 0 }
  ]
}
```

### 5.2 Data Models

**Hot Memory Model:**
```typescript
interface HotMemory {
  user: {
    name: string;
    // ... define all fields
  };
  relationship: {
    // ... define all fields
  };
  recent: {
    // ... define all fields
  };
}
```

**Session Model:**
```typescript
interface Session {
  id: string;
  started_at: string;
  last_activity: string;
  messages: Message[];
}

interface Message {
  role: 'user' | 'character';
  content: string;
  timestamp: string;
}
```

**Archived Session Model:**
```typescript
interface ArchivedSession {
  id: string;
  title: string;
  date: string;
  message_count: number;
  transcript: string;
}
```

### 5.3 Operations

**Required Functions:**

| Function | Purpose |
|----------|---------|
| `loadHotMemory()` | Get active knowledge |
| `updateHotMemory()` | Merge new information |
| `getCurrentSession()` | Get current conversation |
| `addMessageToSession()` | Add a message |
| `checkSessionBoundary()` | Determine if new session |
| `archiveSession()` | Close and store session |
| `getSessionTranscript()` | Retrieve past session |
| `getSessionList()` | List available sessions |
| `addPerson()` | Add to people database |
| `updatePerson()` | Update person info |
| `addSelfNote()` | Character notes something |

---

## PART 6: MEMORY PROMPTING

How is memory presented to the AI in the system prompt?

### 6.1 Hot Memory Section
```
## What You Know About [User]

[Formatted hot memory here]
```

### 6.2 Recent Context Section
```
## Recent Context

[What's been happening lately]
```

### 6.3 Session History Section
```
## This Conversation

[Current session messages]
```

### 6.4 Archive Access Section
```
## Past Sessions (available for retrieval)

[List of session titles/dates]
```

---

## OUTPUT

Complete this document to define your character's memory system. This becomes the blueprint for:
1. Database/storage schema
2. Memory management code
3. Prompt context formatting

---

## NEXT STEPS

With memory defined:
1. ✅ CHARACTER_DISCOVERY.md — Who they are
2. ✅ VOICE_WORKSHOP.md — How they talk
3. ✅ MEMORY_SCHEMA.md — What they remember
4. → BEHAVIOR_PATTERNS.md — When and how they act
5. → BUILD_GUIDE.md — Technical implementation
