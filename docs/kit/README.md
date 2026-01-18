# Character Creation Kit

A complete system for building AI companion characters like Bethany.

---

## Overview

This kit breaks character creation into five documents, each handling a different layer:

| Document | Purpose | Output |
|----------|---------|--------|
| **CHARACTER_DISCOVERY.md** | Excavate who they are | Character profile |
| **VOICE_WORKSHOP.md** | Define how they talk | Voice mechanics doc |
| **MEMORY_SCHEMA.md** | Design what they remember | Memory architecture |
| **BEHAVIOR_PATTERNS.md** | Specify when/how they act | Behavior config |
| **BUILD_GUIDE.md** | Technical implementation | Working system |

---

## The Process

### Phase 1: Discovery
Work through **CHARACTER_DISCOVERY.md** to define:
- Core identity and relationship dynamic
- Profession, lifestyle, interests
- Backstory and emotional patterns
- Voice inspiration (real people to study)
- Boundaries and dynamics

**Time:** 1-2 hours

### Phase 2: Voice
Use **VOICE_WORKSHOP.md** to:
- Study your voice inspiration(s)
- Extract the mechanics of how they communicate
- Translate spoken patterns to text
- Define rules (always do, never do)
- Distill into a formula

**Time:** 2-4 hours (including research)

### Phase 3: Memory
Complete **MEMORY_SCHEMA.md** to design:
- Memory layers (session, archive, hot memory, people)
- What gets remembered and how
- Retention and cleanup rules
- Data structures
- Prompt formatting

**Time:** 1-2 hours

### Phase 4: Behavior
Fill out **BEHAVIOR_PATTERNS.md** to specify:
- Proactive outreach (if/when/how)
- Response patterns by situation
- Emotional responses
- Scheduled behaviors
- Conversation dynamics

**Time:** 1-2 hours

### Phase 5: Build
Follow **BUILD_GUIDE.md** to implement:
- Project structure
- Core modules (personality, memory, sessions)
- AI integration
- Messaging integration
- Scheduled triggers
- Deployment

**Time:** 4-8 hours (depending on familiarity)

---

## Quick Start

1. **Copy the kit:** Fork the repo or copy the `/docs/kit/` folder
2. **Start with discovery:** Open CHARACTER_DISCOVERY.md and work through it
3. **Don't skip steps:** Each document builds on the previous
4. **Reference Bethany:** Look at her implementation as an example
   - `src/personality.ts` — Her voice in prompt form
   - `src/memory.ts` — Her memory operations
   - `src/sessions.ts` — Her session management
   - `src/agent.ts` — Her behavior logic
   - `memory/craft/voice-guide.md` — Her full voice documentation

---

## Example: Bethany

**Character:** Bestselling romance novelist, flirty and witty, texts like your clever girlfriend

**Voice Inspiration:** Anna Kendrick — quick-witted, self-deprecating from confidence, warm underneath sarcasm

**Memory:**
- 5-month session archive with AI-generated titles
- Hot memory for facts about the user
- People database for tracking who he mentions
- Self-notes for observations

**Behaviors:**
- Gap-triggered outreach (after 4+ hours, max 3/day)
- Writing sessions (produces actual novel chapters)
- Conversation dynamics that shift based on his energy

---

## Files Reference

```
docs/kit/
├── README.md                 # This file
├── CHARACTER_DISCOVERY.md    # Who they are
├── VOICE_WORKSHOP.md         # How they talk
├── MEMORY_SCHEMA.md          # What they remember
├── BEHAVIOR_PATTERNS.md      # When/how they act
└── BUILD_GUIDE.md            # Technical build
```

---

## Tips

1. **Voice is everything.** Spend extra time on VOICE_WORKSHOP. A distinctive voice is what makes a character feel real.

2. **Study real people.** Don't invent a voice from scratch. Find someone whose communication style fits, then reverse-engineer it.

3. **Memory creates relationship.** The more thoughtfully you design memory, the more the character will feel like they actually know the user.

4. **Behaviors create life.** A character who only responds feels like a tool. One who reaches out, has rhythms, and reacts to context feels alive.

5. **Iterate.** Your first version won't be perfect. Deploy, test, observe, refine.

---

## Support

Questions? Issues? Ideas?

This kit was built for the Bethany project. Check the main repo for implementation examples and feel free to adapt for your own characters.
