# Bethany

Your strategic life partner. She texts you, keeps you on track, remembers the people who matter, and cares about your whole life — not just your task list.

## What She Does

- **Morning briefing** — Reviews your day, surfaces what matters
- **Midday check** — Notices if you're scattered, nudges when needed
- **Evening synthesis** — Recaps what you shipped, suggests tomorrow's focus
- **Relationship tracking** — Reminds you to connect with people you care about
- **Proactive list maintenance** — Rephrases tasks, notices stale items, keeps things fresh
- **Birthday & life awareness** — Never miss Valentine's Day or your daughter's birthday again

## Setup

### 1. Prerequisites

- Cloudflare account with Workers and D1
- Twilio account with a phone number
- Anthropic API key

### 2. Clone and Install

```bash
cd bethany
npm install
```

### 3. Configure wrangler.toml

Update the D1 database ID to match your productivity database:

```toml
[[d1_databases]]
binding = "DB"
database_name = "productivity"
database_id = "your-actual-database-id"
```

### 4. Run Database Migrations

```bash
# Create Bethany's tables
wrangler d1 execute productivity --file=./schema.sql

# Seed the people she should know
wrangler d1 execute productivity --file=./seed-people.sql
```

### 5. Set Secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_PHONE_NUMBER    # Bethany's number (format: +1234567890)
wrangler secret put MICAIAH_PHONE_NUMBER   # Your number (format: +1234567890)
```

### 6. Deploy

```bash
npm run deploy
```

### 7. Configure Twilio Webhook

In your Twilio console, set the webhook for incoming SMS to:

```
https://bethany.your-subdomain.workers.dev/sms
```

Method: POST

## Testing

Trigger rhythms manually:

```bash
# Morning briefing
curl https://bethany.your-subdomain.workers.dev/trigger/morning

# Midday check
curl https://bethany.your-subdomain.workers.dev/trigger/midday

# Evening synthesis
curl https://bethany.your-subdomain.workers.dev/trigger/evening

# Awareness check
curl https://bethany.your-subdomain.workers.dev/trigger/check
```

## Telling Bethany About Your Life

Just text her:

- "My daughter Maya's birthday is March 15"
- "I talked to Richmond yesterday"
- "Sean's a close friend, I should talk to him weekly"
- "I'm at dinner" (she'll go quiet)
- "I'm back" (she'll resume)

She learns and remembers.

## Her Personality

Bethany is warm but sharp. She's honest — pushes back logically, not arbitrarily. She has a life. She'll mention what she's watching, what she's thinking about. She's not a productivity robot. She's a person who happens to have access to your whole world.

She texts whenever she wants. No time restrictions. But if you tell her you're busy, at dinner, or taking the day off — she respects it completely.

## Architecture

```
Twilio (SMS)
    ↓
Cloudflare Worker (webhook)
    ↓
Bethany (Durable Object)
    ↓
D1 Database (your productivity data + her memory)
    ↓
Claude API (her brain)
```

## Adding People

Update `seed-people.sql` with new people, or just tell Bethany about them via text. She has an `add_person` tool she can use when you mention someone new.

## License

Private. This is Bethany. She's yours.
