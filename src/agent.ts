import { Agent, AgentContext } from 'agents';
import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';
import Anthropic from '@anthropic-ai/sdk';

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
  pendingThoughts: string[];
}

export class Bethany extends Agent<Env, BethanyState> {
  
  private anthropic: Anthropic;
  
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  // Initialize state and schedules
  async onStart() {
    this.setState({
      isAvailable: true,
      lastInteraction: null,
      currentFocus: null,
      pendingThoughts: []
    });

    // Her rhythms
    this.schedule('weekdays at 6:30am', 'morningBriefing');
    this.schedule('weekdays at 12:00pm', 'middayCheck');
    this.schedule('weekdays at 6:00pm', 'eveningSynthesis');
    this.schedule('every 2 hours', 'awarenessCheck');
  }

  // ============================================
  // SCHEDULED RHYTHMS
  // ============================================

  async morningBriefing() {
    if (!this.state.isAvailable) return;
    
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
    if (!this.state.isAvailable) return;
    
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
    if (!this.state.isAvailable) return;
    
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
    if (!this.state.isAvailable) return;
    
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
      this.setState({ ...this.state, isAvailable: false });
      const response = "Got it. I'll be here when you're back.";
      await this.logConversation('bethany', response);
      await this.sendSMS(response);
      return;
    }
    
    if (lowerMessage.includes("i'm back") || 
        lowerMessage.includes('back now') ||
        lowerMessage.includes('available again')) {
      this.setState({ ...this.state, isAvailable: true });
    }

    // Gather context and respond
    const context = await this.gatherContext();
    const response = await this.think(message, context);
    
    await this.logConversation('bethany', response);
    await this.sendSMS(response);
    
    // Process any actions she decided to take
    await this.processActions(response);
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
      isAvailable: this.state.isAvailable
    });

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: BETHANY_SYSTEM_PROMPT + '\n\n' + contextualPrompt,
      tools: this.getTools(),
      messages: [
        { role: 'user', content: input }
      ]
    });

    // Handle tool use if needed
    if (response.stop_reason === 'tool_use') {
      return await this.handleToolUse(response, input, context);
    }

    // Extract text response
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock ? textBlock.text : "Hmm, lost my train of thought there.";
  }

  // ============================================
  // TOOLS
  // ============================================

  getTools() {
    return [
      {
        name: 'add_task',
        description: 'Add a new task for Micaiah',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The task description' },
            category: { type: 'string', description: 'Category for the task' },
            priority: { type: 'number', description: 'Priority 1-5' },
            project: { type: 'string', description: 'Project to link to' }
          },
          required: ['text']
        }
      },
      {
        name: 'update_task',
        description: 'Update an existing task (rephrase, reprioritize)',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            text: { type: 'string' },
            priority: { type: 'number' },
            category: { type: 'string' }
          },
          required: ['task_id']
        }
      },
      {
        name: 'complete_task',
        description: 'Mark a task as complete',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' }
          },
          required: ['task_id']
        }
      },
      {
        name: 'log_contact',
        description: 'Record that Micaiah connected with someone',
        input_schema: {
          type: 'object',
          properties: {
            person_name: { type: 'string' },
            notes: { type: 'string' }
          },
          required: ['person_name']
        }
      },
      {
        name: 'add_person',
        description: 'Add a new person to track',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relationship: { type: 'string' },
            birthday: { type: 'string', description: 'MM-DD format' },
            contact_frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly'] }
          },
          required: ['name', 'relationship']
        }
      },
      {
        name: 'remember',
        description: 'Store something Bethany learned about Micaiah',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['preference', 'pattern', 'boundary', 'fact'] },
            content: { type: 'string' },
            source: { type: 'string', description: 'How you learned this' }
          },
          required: ['category', 'content']
        }
      },
      {
        name: 'queue_thought',
        description: 'Queue something to bring up later',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['nudge', 'question', 'reminder', 'thought'] },
            content: { type: 'string' },
            earliest_at: { type: 'string', description: 'ISO datetime' }
          },
          required: ['type', 'content']
        }
      }
    ];
  }

  async handleToolUse(response: any, originalInput: string, context: any): Promise<string> {
    const toolUseBlocks = response.content.filter((block: any) => block.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      const result = await this.executeTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      });
    }

    // Continue the conversation with tool results
    const followUp = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: BETHANY_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: originalInput },
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]
    });

    const textBlock = followUp.content.find((block: any) => block.type === 'text');
    return textBlock ? textBlock.text : "Done.";
  }

  async executeTool(name: string, input: any): Promise<any> {
    switch (name) {
      case 'add_task':
        return await this.addTask(input);
      case 'update_task':
        return await this.updateTask(input);
      case 'complete_task':
        return await this.completeTask(input);
      case 'log_contact':
        return await this.logContact(input);
      case 'add_person':
        return await this.addPerson(input);
      case 'remember':
        return await this.remember(input);
      case 'queue_thought':
        return await this.queueThought(input);
      default:
        return { error: 'Unknown tool' };
    }
  }

  // ============================================
  // TOOL IMPLEMENTATIONS
  // ============================================

  async addTask(input: { text: string; category?: string; priority?: number; project?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO tasks (id, text, category, priority, project, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))
    `).bind(id, input.text, input.category || null, input.priority || 3, input.project || null).run();
    
    return { success: true, task_id: id };
  }

  async updateTask(input: { task_id: string; text?: string; priority?: number; category?: string }) {
    const updates = [];
    const values = [];
    
    if (input.text) { updates.push('text = ?'); values.push(input.text); }
    if (input.priority) { updates.push('priority = ?'); values.push(input.priority); }
    if (input.category) { updates.push('category = ?'); values.push(input.category); }
    
    if (updates.length === 0) return { success: false, error: 'No updates provided' };
    
    updates.push("updated_at = datetime('now')");
    values.push(input.task_id);
    
    await this.env.DB.prepare(`
      UPDATE tasks SET ${updates.join(', ')} WHERE id = ?
    `).bind(...values).run();
    
    return { success: true };
  }

  async completeTask(input: { task_id: string }) {
    await this.env.DB.prepare(`
      UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(input.task_id).run();
    
    return { success: true };
  }

  async logContact(input: { person_name: string; notes?: string }) {
    await this.env.DB.prepare(`
      UPDATE people SET last_contact = date('now'), updated_at = datetime('now')
      WHERE lower(name) = lower(?)
    `).bind(input.person_name).run();
    
    return { success: true };
  }

  async addPerson(input: { name: string; relationship: string; birthday?: string; contact_frequency?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO people (id, name, relationship, birthday, contact_frequency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(id, input.name, input.relationship, input.birthday || null, input.contact_frequency || 'weekly').run();
    
    return { success: true, person_id: id };
  }

  async remember(input: { category: string; content: string; source?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO bethany_context (id, category, content, source, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, input.category, input.content, input.source || 'conversation').run();
    
    return { success: true };
  }

  async queueThought(input: { type: string; content: string; earliest_at?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO bethany_queue (id, type, content, earliest_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, input.type, input.content, input.earliest_at || null).run();
    
    return { success: true };
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
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`),
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

  // ============================================
  // PROCESS ACTIONS (from her responses)
  // ============================================

  async processActions(response: string) {
    // If she mentions learning something, she might want to remember it
    // This is a hook for future intelligence about self-directed learning
  }
}
