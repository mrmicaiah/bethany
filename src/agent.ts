import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';

interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  SENDBLUE_API_KEY: string;
  SENDBLUE_API_SECRET: string;
  SENDBLUE_PHONE_NUMBER: string;
  MICAIAH_PHONE_NUMBER: string;
  MCP_API_URL: string;
  MCP_API_KEY: string;
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
  // SCHEDULED RHYTHMS - just conversation starters
  // ============================================

  async morningBriefing() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `It's morning. Text him something — could be about your day, something you're thinking about, a question. Keep it natural. You're not briefing him, you're just saying hi.`;

    const response = await this.think(prompt);
    if (response) await this.sendMessage(response);
  }

  async middayCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `It's midday. Decide if you want to text him. If you do, make it interesting — not a check-in, just conversation. If there's nothing worth saying, respond with just: [silent]`;

    const response = await this.think(prompt);
    if (response && response.toLowerCase() !== 'silent' && response.toLowerCase() !== '[silent]') {
      await this.sendMessage(response);
    }
  }

  async eveningSynthesis() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `It's evening. Text him if you feel like it. Could be about your day, could be flirty, could be nothing. Keep it natural.`;

    const response = await this.think(prompt);
    if (response) await this.sendMessage(response);
  }

  async awarenessCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `Random check. Do you want to text him right now? If yes, send something. If not, respond with: [silent]

Most of the time, [silent] is the right answer. You have your own life.`;

    const response = await this.think(prompt);
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
    
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('at dinner') || 
        lowerMessage.includes('taking the day off') ||
        lowerMessage.includes('busy') ||
        lowerMessage.includes('going dark')) {
      this.bethanyState.isAvailable = false;
      await this.saveState();
      const response = "k";
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

    const response = await this.think(message);
    
    if (response) {
      await this.logConversation('bethany', response);
      await this.sendMessage(response);
    }
  }

  // ============================================
  // THINKING (Claude API - no tools by default)
  // ============================================

  async think(input: string): Promise<string | null> {
    const recentConversation = await this.getRecentConversation(20);
    
    const contextualPrompt = getContextualPrompt({
      currentTime: new Date(),
      lastConversation: recentConversation
    });

    const messages: any[] = [{ role: 'user', content: input }];
    
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
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      
      // Check for specific errors
      if (errorText.includes('credit balance is too low')) {
        await this.sendMessage("hey your Anthropic balance is empty. I can't think until you top it up");
        return null;
      }
      
      return "ugh my brain just glitched. what were you saying?";
    }

    const data = await response.json() as any;
    
    // Extract text response
    const textBlock = data.content?.find((block: any) => block.type === 'text');
    return textBlock ? textBlock.text : "...";
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
      SELECT role, content, created_at FROM bethany_conversations ORDER BY created_at DESC LIMIT ?
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
