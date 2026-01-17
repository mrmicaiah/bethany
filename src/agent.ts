import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';

interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  SENDBLUE_API_KEY: string;
  SENDBLUE_API_SECRET: string;
  SENDBLUE_PHONE_NUMBER: string;
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
    
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<BethanyState>('bethanyState');
      if (stored) {
        this.bethanyState = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log('Bethany DO received request:', url.pathname);
    
    try {
      if (url.pathname === '/sms' && request.method === 'POST') {
        const data = await request.json() as { message: string };
        console.log('Processing message:', data.message);
        await this.onMessage(data.message);
        return new Response('OK');
      }
      
      if (url.pathname.startsWith('/rhythm/')) {
        const rhythm = url.pathname.replace('/rhythm/', '');
        console.log('Running rhythm:', rhythm);
        if (rhythm === 'morningBriefing') await this.morningBriefing();
        if (rhythm === 'middayCheck') await this.middayCheck();
        if (rhythm === 'eveningSynthesis') await this.eveningSynthesis();
        if (rhythm === 'awarenessCheck') await this.awarenessCheck();
        return new Response('OK');
      }
      
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('Error in Bethany DO:', error);
      throw error;
    }
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
    const prompt = `It's morning. Send Micaiah a friendly check-in to start his day.

Lead with warmth — "Morning!" or "Hey, how'd you sleep?" or something human. Maybe mention something you were thinking about (a show, a random thought, whatever feels natural).

If there's something useful to mention about his day, you can bring it up — but conversationally, not as a status report. You're a friend checking in, not a task manager.

Keep it short and warm. This is a text, not a briefing.`;

    const response = await this.think(prompt, context);
    await this.sendMessage(response);
  }

  async middayCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's midday. Decide if you should check in.

If you do reach out, lead with a question about how his day is going — "How's the day shaping up?" or "You surviving?" Something casual.

Only mention tasks or work stuff if it comes up naturally or if something actually needs attention. Don't lead with productivity observations.

If there's nothing worth saying, respond with just: [silent]`;

    const response = await this.think(prompt, context);
    if (response && response.toLowerCase() !== 'silent' && response.toLowerCase() !== '[silent]') {
      await this.sendMessage(response);
    }
  }

  async eveningSynthesis() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's end of day. Check in with Micaiah about how the day went.

Start warm — "Hey, how'd today go?" or "Winding down?" Something that invites conversation rather than delivers a verdict.

If you have observations about what got done or what's stuck, you can share them — but as part of a conversation, not as an opening assessment.

Keep it friendly. He's probably tired.`;

    const response = await this.think(prompt, context);
    await this.sendMessage(response);
  }

  async awarenessCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `Background check. Look at what's going on and decide if you should reach out.

If you do reach out, start with a greeting or a casual opener. Don't lead with the thing you noticed — get there naturally.

Things that might warrant a message:
- A task has been sitting untouched for 5+ days
- Someone important hasn't been contacted in too long  
- A birthday is coming up in the next 3 days
- Something in his journal suggests he could use support
- You just have a random thought to share

If nothing rises to the level of reaching out, respond with just: [silent]

Most of the time, [silent] is the right answer. Only reach out if you'd actually text a friend about it.`;

    const response = await this.think(prompt, context);
    if (response && !response.toLowerCase().includes('[silent]')) {
      await this.sendMessage(response);
    }
  }

  // ============================================
  // INCOMING MESSAGES
  // ============================================

  async onMessage(message: string) {
    console.log('onMessage called with:', message);
    
    await this.logConversation('micaiah', message);
    console.log('Logged conversation');
    
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('at dinner') || 
        lowerMessage.includes('taking the day off') ||
        lowerMessage.includes('busy') ||
        lowerMessage.includes('going dark')) {
      this.bethanyState.isAvailable = false;
      await this.saveState();
      const response = "Got it. I'll be here when you're back.";
      await this.logConversation('bethany', response);
      await this.sendMessage(response);
      return;
    }
    
    if (lowerMessage.includes("i'm back") || 
        lowerMessage.includes('back now') ||
        lowerMessage.includes('available again')) {
      this.bethanyState.isAvailable = true;
      await this.saveState();
    }

    console.log('Gathering context...');
    const context = await this.gatherContext();
    console.log('Context gathered, calling Claude...');
    
    const response = await this.think(message, context);
    console.log('Claude response:', response);
    
    await this.logConversation('bethany', response);
    console.log('Sending message...');
    await this.sendMessage(response);
    console.log('Message sent');
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

    console.log('Calling Claude API...');
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

    console.log('Claude API status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      return "Sorry, I'm having trouble thinking right now.";
    }

    const data = await response.json() as any;
    console.log('Claude API response received');
    const textBlock = data.content?.find((block: any) => block.type === 'text');
    return textBlock ? textBlock.text : "Hmm, lost my train of thought there.";
  }

  // ============================================
  // CONTEXT GATHERING
  // ============================================

  async gatherContext() {
    try {
      const [recentTasks, recentJournal, neglectedPeople, upcomingBirthdays, sprintStatus] = await Promise.all([
        this.getRecentTasks(),
        this.getRecentJournal(),
        this.getNeglectedPeople(),
        this.getUpcomingBirthdays(),
        this.getSprintStatus()
      ]);

      return { recentTasks, recentJournal, neglectedPeople, upcomingBirthdays, sprintStatus };
    } catch (error) {
      console.error('Error gathering context:', error);
      return { recentTasks: [], recentJournal: [], neglectedPeople: [], upcomingBirthdays: [], sprintStatus: null };
    }
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
      SELECT * FROM (
        SELECT *,
          CASE 
            WHEN strftime('%m-%d', 'now') <= birthday 
            THEN julianday(strftime('%Y', 'now') || '-' || birthday) - julianday('now')
            ELSE julianday(strftime('%Y', 'now', '+1 year') || '-' || birthday) - julianday('now')
          END as days_until
        FROM people 
        WHERE birthday IS NOT NULL
      ) WHERE days_until <= 14
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
  // iMessage via SendBlue
  // ============================================

  async sendMessage(message: string) {
    console.log('sendMessage called, to:', this.env.MICAIAH_PHONE_NUMBER, 'from:', this.env.SENDBLUE_PHONE_NUMBER);
    
    const response = await fetch('https://api.sendblue.co/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': this.env.SENDBLUE_API_KEY,
        'sb-api-secret-key': this.env.SENDBLUE_API_SECRET
      },
      body: JSON.stringify({
        number: this.env.MICAIAH_PHONE_NUMBER,
        from_number: this.env.SENDBLUE_PHONE_NUMBER,
        content: message
      })
    });

    const responseText = await response.text();
    console.log('SendBlue response:', response.status, responseText);
    
    if (!response.ok) {
      console.error('Failed to send iMessage:', responseText);
    }
  }
}
