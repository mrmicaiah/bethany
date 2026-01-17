import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';

interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  MICAIAH_PHONE_NUMBER: string;
}

interface BethanyState {
  isAvailable: boolean;
  lastInteraction: string | null;
  currentFocus: string | null;
}

export class Bethany implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private bethanyState: BethanyState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.bethanyState = {
      isAvailable: true,
      lastInteraction: null,
      currentFocus: null
    };
    
    // Load state from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<BethanyState>('bethanyState');
      if (stored) {
        this.bethanyState = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/sms' && request.method === 'POST') {
      const data = await request.json() as { message: string };
      await this.onSMS(data.message);
      return new Response('OK');
    }
    
    if (url.pathname.startsWith('/rhythm/')) {
      const rhythm = url.pathname.replace('/rhythm/', '');
      if (rhythm === 'morningBriefing') await this.morningBriefing();
      if (rhythm === 'middayCheck') await this.middayCheck();
      if (rhythm === 'eveningSynthesis') await this.eveningSynthesis();
      if (rhythm === 'awarenessCheck') await this.awarenessCheck();
      return new Response('OK');
    }
    
    return new Response('Not found', { status: 404 });
  }

  private async saveState() {
    await this.state.storage.put('bethanyState', this.bethanyState);
  }

  // ============================================
  // SCHEDULED RHYTHMS
  // ============================================

  async morningBriefing() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's morning. Review Micaiah's day ahead and reach out with something useful. 
    
Consider:
- What's on his calendar today?
- What tasks are hot or overdue?
- Any sprint objectives that need attention?
- Any people stuff (birthdays coming up, someone he hasn't talked to)?

Be natural. This isn't a report — it's you checking in.`;

    const response = await this.think(prompt, context);
    await this.sendSMS(response);
  }

  async middayCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's midday. Check in on how Micaiah's day is going.

Consider:
- Has he made progress on what he said he'd focus on?
- Is he context-switching too much?
- Does he need a nudge or is he in flow (leave him alone)?

Only reach out if you have something worth saying. Silence is fine.`;

    const response = await this.think(prompt, context);
    if (response && response.toLowerCase() !== 'silent' && response.toLowerCase() !== '[silent]') {
      await this.sendSMS(response);
    }
  }

  async eveningSynthesis() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's end of day. Help Micaiah close out.

Consider:
- What did he actually get done today?
- What moved, what's stuck?
- Any list maintenance needed (stale tasks, rephrasing)?
- What should tomorrow's focus be?
- Did he connect with anyone today, or has he been isolated?

Synthesize, don't list. Be a person reflecting on the day with him.`;

    const response = await this.think(prompt, context);
    await this.sendSMS(response);
  }

  async awarenessCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `Background awareness check. Look at what's going on and decide if you should reach out.

Things that might warrant a message:
- A task has been sitting untouched for 5+ days
- Someone important hasn't been contacted in too long
- A birthday is coming up in the next 3 days
- He seems stuck based on task patterns
- Something in his journal suggests he needs support
- You have a thought about his work that feels worth sharing

If nothing rises to the level of reaching out, respond with just: [silent]
If something does, send a natural message.`;

    const response = await this.think(prompt, context);
    if (response && !response.toLowerCase().includes('[silent]')) {
      await this.sendSMS(response);
    }
  }

  // ============================================
  // INCOMING MESSAGES
  // ============================================

  async onSMS(message: string) {
    // Log the incoming message
    await this.logConversation('micaiah', message);
    
    // Check for availability signals
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('at dinner') || 
        lowerMessage.includes('taking the day off') ||
        lowerMessage.includes('busy') ||
        lowerMessage.includes('going dark')) {
      this.bethanyState.isAvailable = false;
      await this.saveState();
      const response = "Got it. I'll be here when you're back.";
      await this.logConversation('bethany', response);
      await this.sendSMS(response);
      return;
    }
    
    if (lowerMessage.includes("i'm back") || 
        lowerMessage.includes('back now') ||
        lowerMessage.includes('available again')) {
      this.bethanyState.isAvailable = true;
      await this.saveState();
    }

    // Gather context and respond
    const context = await this.gatherContext();
    const response = await this.think(message, context);
    
    await this.logConversation('bethany', response);
    await this.sendSMS(response);
  }

  // ============================================
  // THINKING (Claude API)
  // ============================================

  async think(input: string, context: any): Promise<string> {
    const recentConversation = await this.getRecentConversation(20);
    
    const contextualPrompt = getContextualPrompt({
      currentTime: new Date(),
      recentTasks: context.recentTasks,
      recentJournal: context.recentJournal,
      neglectedPeople: context.neglectedPeople,
      upcomingBirthdays: context.upcomingBirthdays,
      sprintStatus: context.sprintStatus,
      lastConversation: recentConversation,
      isAvailable: this.bethanyState.isAvailable
    });

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
        system: BETHANY_SYSTEM_PROMPT + '\n\n' + contextualPrompt,
        messages: [
          { role: 'user', content: input }
        ]
      })
    });

    if (!response.ok) {
      console.error('Claude API error:', await response.text());
      return "Sorry, I'm having trouble thinking right now.";
    }

    const data = await response.json() as any;
    const textBlock = data.content?.find((block: any) => block.type === 'text');
    return textBlock ? textBlock.text : "Hmm, lost my train of thought there.";
  }

  // ============================================
  // CONTEXT GATHERING
  // ============================================

  async gatherContext() {
    const [recentTasks, recentJournal, neglectedPeople, upcomingBirthdays, sprintStatus] = await Promise.all([
      this.getRecentTasks(),
      this.getRecentJournal(),
      this.getNeglectedPeople(),
      this.getUpcomingBirthdays(),
      this.getSprintStatus()
    ]);

    return { recentTasks, recentJournal, neglectedPeople, upcomingBirthdays, sprintStatus };
  }

  async getRecentTasks() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM tasks 
      WHERE status = 'open' 
      ORDER BY priority ASC, created_at DESC 
      LIMIT 30
    `).all();
    return result.results;
  }

  async getRecentJournal() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM journal_entries 
      ORDER BY created_at DESC 
      LIMIT 5
    `).all();
    return result.results;
  }

  async getNeglectedPeople() {
    const result = await this.env.DB.prepare(`
      SELECT *, 
        julianday('now') - julianday(last_contact) as days_since_contact
      FROM people 
      WHERE last_contact IS NULL 
        OR (contact_frequency = 'daily' AND julianday('now') - julianday(last_contact) > 1)
        OR (contact_frequency = 'weekly' AND julianday('now') - julianday(last_contact) > 7)
        OR (contact_frequency = 'monthly' AND julianday('now') - julianday(last_contact) > 30)
        OR (contact_frequency = 'quarterly' AND julianday('now') - julianday(last_contact) > 90)
      ORDER BY days_since_contact DESC
    `).all();
    return result.results;
  }

  async getUpcomingBirthdays() {
    const result = await this.env.DB.prepare(`
      SELECT *,
        CASE 
          WHEN strftime('%m-%d', 'now') <= birthday 
          THEN julianday(strftime('%Y', 'now') || '-' || birthday) - julianday('now')
          ELSE julianday(strftime('%Y', 'now', '+1 year') || '-' || birthday) - julianday('now')
        END as days_until
      FROM people 
      WHERE birthday IS NOT NULL
      HAVING days_until <= 14
      ORDER BY days_until ASC
    `).all();
    return result.results;
  }

  async getSprintStatus() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM sprints 
      WHERE status = 'active' 
      ORDER BY created_at DESC 
      LIMIT 1
    `).all();
    return result.results[0] || null;
  }

  // ============================================
  // CONVERSATION HISTORY
  // ============================================

  async logConversation(role: string, content: string) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO bethany_conversations (id, role, content, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(id, role, content).run();
  }

  async getRecentConversation(limit: number = 20) {
    const result = await this.env.DB.prepare(`
      SELECT role, content, created_at FROM bethany_conversations 
      ORDER BY created_at DESC 
      LIMIT ?
    `).bind(limit).all();
    return result.results.reverse();
  }

  // ============================================
  // SMS (Twilio)
  // ============================================

  async sendSMS(message: string) {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const auth = btoa(`${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`);
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: this.env.MICAIAH_PHONE_NUMBER,
        From: this.env.TWILIO_PHONE_NUMBER,
        Body: message
      })
    });

    if (!response.ok) {
      console.error('Failed to send SMS:', await response.text());
    }
  }
}
