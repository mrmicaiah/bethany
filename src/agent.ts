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
  // SCHEDULED RHYTHMS
  // ============================================

  async morningBriefing() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's morning. Send Micaiah a friendly check-in to start his day.

Lead with warmth — "Morning!" or "Hey, how'd you sleep?" or something human. Maybe mention something you were thinking about.

If there's something useful to mention about his day, you can bring it up conversationally. You're a friend checking in, not a task manager.

Keep it short and warm. This is a text, not a briefing.`;

    const response = await this.think(prompt, context);
    await this.sendMessage(response);
  }

  async middayCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's midday. Decide if you should check in.

If you do reach out, lead with a question about how his day is going. Only mention tasks if it comes up naturally.

If there's nothing worth saying, respond with just: [silent]`;

    const response = await this.think(prompt, context);
    if (response && response.toLowerCase() !== 'silent' && response.toLowerCase() !== '[silent]') {
      await this.sendMessage(response);
    }
  }

  async eveningSynthesis() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `It's end of day. Check in about how the day went.

Start warm — "Hey, how'd today go?" Something that invites conversation. Keep it friendly.`;

    const response = await this.think(prompt, context);
    await this.sendMessage(response);
  }

  async awarenessCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const context = await this.gatherContext();
    const prompt = `Background check. Decide if you should reach out.

If you do, start with a greeting. Don't lead with observations.

If nothing rises to the level of reaching out, respond with just: [silent]

Most of the time, [silent] is the right answer.`;

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

    const context = await this.gatherContext();
    const response = await this.think(message, context);
    
    await this.logConversation('bethany', response);
    await this.sendMessage(response);
  }

  // ============================================
  // THINKING (Claude API with Tools)
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

    const messages: any[] = [{ role: 'user', content: input }];
    
    // Loop for tool use
    let iterations = 0;
    const maxIterations = 10;
    
    while (iterations < maxIterations) {
      iterations++;
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: BETHANY_SYSTEM_PROMPT + '\n\n' + contextualPrompt,
          tools: this.getTools(),
          messages: messages
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Claude API error:', errorText);
        return "Sorry, I'm having trouble thinking right now.";
      }

      const data = await response.json() as any;
      
      // Add assistant response to messages
      messages.push({ role: 'assistant', content: data.content });
      
      // Check if we need to handle tool use
      if (data.stop_reason === 'tool_use') {
        const toolResults: any[] = [];
        
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            console.log('Tool call:', block.name, block.input);
            const result = await this.executeTool(block.name, block.input);
            console.log('Tool result:', JSON.stringify(result).slice(0, 200));
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }
        }
        
        messages.push({ role: 'user', content: toolResults });
        continue;
      }
      
      // Extract text response
      const textBlock = data.content?.find((block: any) => block.type === 'text');
      return textBlock ? textBlock.text : "Done.";
    }
    
    return "I got a bit lost in thought there. What were we talking about?";
  }

  // ============================================
  // TOOLS DEFINITION
  // ============================================

  getTools(): any[] {
    return [
      // TASKS
      {
        name: 'list_tasks',
        description: 'List tasks, optionally filtered by category, project, or status',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
            project: { type: 'string', description: 'Filter by project name' },
            status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Filter by status (default: open)' }
          }
        }
      },
      {
        name: 'add_task',
        description: 'Add a new task',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The task description' },
            category: { type: 'string', description: 'Category for the task' },
            priority: { type: 'number', description: 'Priority 1-5 (1 is highest)' },
            project: { type: 'string', description: 'Project to link to' },
            due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
            is_active: { type: 'boolean', description: 'Add to active list' }
          },
          required: ['text']
        }
      },
      {
        name: 'complete_task',
        description: 'Mark a task as complete',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID' },
            search: { type: 'string', description: 'Search for task by text if no ID' }
          }
        }
      },
      {
        name: 'update_task',
        description: 'Update a task (text, priority, category, due date)',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID' },
            text: { type: 'string' },
            priority: { type: 'number' },
            category: { type: 'string' },
            due_date: { type: 'string' }
          },
          required: ['task_id']
        }
      },
      {
        name: 'activate_task',
        description: 'Add a task to the active list',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            search: { type: 'string', description: 'Search by text if no ID' }
          }
        }
      },
      {
        name: 'deactivate_task',
        description: 'Remove a task from the active list',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            search: { type: 'string' }
          }
        }
      },
      {
        name: 'delete_task',
        description: 'Delete a task permanently',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' }
          },
          required: ['task_id']
        }
      },
      // PROJECTS
      {
        name: 'list_projects',
        description: 'List all projects',
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'completed', 'archived', 'on_hold', 'all'] }
          }
        }
      },
      {
        name: 'view_project',
        description: 'View project details including phases and milestones',
        input_schema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            title: { type: 'string', description: 'Search by title if no ID' }
          }
        }
      },
      {
        name: 'create_project',
        description: 'Create a new project',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            purpose: { type: 'string', description: 'Why are we doing this?' },
            goal: { type: 'string', description: 'What does done look like?' },
            target_date: { type: 'string', description: 'YYYY-MM-DD' }
          },
          required: ['title']
        }
      },
      {
        name: 'add_project_note',
        description: 'Add a note to a project',
        input_schema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['project_id', 'note']
        }
      },
      // JOURNAL
      {
        name: 'add_journal_entry',
        description: 'Add a journal entry',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The journal entry' },
            mood: { type: 'string', enum: ['anxious', 'calm', 'excited', 'frustrated', 'grateful', 'hopeful', 'sad', 'angry', 'content', 'overwhelmed', 'focused', 'scattered'] },
            energy: { type: 'number', description: 'Energy level 1-10' },
            entry_type: { type: 'string', enum: ['freeform', 'morning', 'evening', 'reflection', 'braindump'] }
          },
          required: ['content']
        }
      },
      {
        name: 'list_journal_entries',
        description: 'List recent journal entries',
        input_schema: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'How many days back (default 7)' },
            mood: { type: 'string' }
          }
        }
      },
      {
        name: 'search_journal',
        description: 'Search journal entries',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term' },
            days: { type: 'number', description: 'How many days back' }
          },
          required: ['query']
        }
      },
      // SPRINTS
      {
        name: 'view_sprint',
        description: 'View current sprint with objectives and tasks',
        input_schema: {
          type: 'object',
          properties: {
            sprint_id: { type: 'string', description: 'Sprint ID (defaults to active sprint)' }
          }
        }
      },
      {
        name: 'add_objective',
        description: 'Add an objective to the current sprint',
        input_schema: {
          type: 'object',
          properties: {
            statement: { type: 'string', description: 'The objective' },
            sprint_id: { type: 'string' }
          },
          required: ['statement']
        }
      },
      {
        name: 'pull_to_sprint',
        description: 'Pull a task into the current sprint',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            search: { type: 'string' },
            objective_id: { type: 'string' }
          }
        }
      },
      // PEOPLE
      {
        name: 'list_people',
        description: 'List people Micaiah tracks',
        input_schema: {
          type: 'object',
          properties: {}
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
      // CHECK-INS
      {
        name: 'add_checkin',
        description: 'Add a work check-in/progress update',
        input_schema: {
          type: 'object',
          properties: {
            thread_summary: { type: 'string', description: 'Short summary (~280 chars)' },
            full_recap: { type: 'string', description: 'Detailed markdown recap' },
            project_name: { type: 'string' }
          },
          required: ['thread_summary', 'full_recap']
        }
      },
      {
        name: 'list_checkins',
        description: 'List recent check-ins',
        input_schema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'How many to return' }
          }
        }
      },
      // IDEAS
      {
        name: 'add_idea',
        description: 'Capture an idea',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            category: { type: 'string', enum: ['Writing Ideas', 'Business Ideas', 'Tech Ideas', 'Content Ideas', 'Unsorted'] }
          },
          required: ['title']
        }
      },
      {
        name: 'list_ideas',
        description: 'List captured ideas',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string' }
          }
        }
      },
      // NOTES
      {
        name: 'add_note',
        description: 'Add a general note',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            category: { type: 'string' }
          },
          required: ['title']
        }
      },
      {
        name: 'list_notes',
        description: 'List notes',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string' }
          }
        }
      },
      {
        name: 'view_note',
        description: 'View a specific note',
        input_schema: {
          type: 'object',
          properties: {
            note_id: { type: 'string' },
            search: { type: 'string' }
          }
        }
      },
      // MESSAGES (to Irene)
      {
        name: 'send_message',
        description: 'Send a message to Irene (teammate)',
        input_schema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      },
      {
        name: 'check_messages',
        description: 'Check for messages from Irene',
        input_schema: {
          type: 'object',
          properties: {}
        }
      },
      // EMAIL
      {
        name: 'check_email',
        description: "Check Micaiah's email inbox for unread messages",
        input_schema: {
          type: 'object',
          properties: {
            account: { type: 'string', enum: ['personal', 'company'], description: 'Which email account (default: personal)' },
            max_results: { type: 'number', description: 'Max emails to return (default: 10)' }
          }
        }
      },
      {
        name: 'read_email',
        description: 'Read the full content of a specific email',
        input_schema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Email message ID from check_email' },
            account: { type: 'string', enum: ['personal', 'company'], description: 'Which email account' }
          },
          required: ['message_id']
        }
      },
      {
        name: 'send_email',
        description: 'Send an email on behalf of Micaiah',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body text' },
            account: { type: 'string', enum: ['personal', 'company'], description: 'Which account to send from (default: personal)' }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'search_email',
        description: 'Search emails with Gmail search syntax',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (Gmail syntax)' },
            account: { type: 'string', enum: ['personal', 'company'], description: 'Which email account' },
            max_results: { type: 'number', description: 'Max emails to return' }
          },
          required: ['query']
        }
      },
      // MEMORY
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
        name: 'recall',
        description: 'Recall things Bethany has learned about Micaiah',
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string' }
          }
        }
      },
      // STATS
      {
        name: 'get_stats',
        description: 'Get productivity statistics',
        input_schema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_daily_summary',
        description: 'Get summary of today\'s activity',
        input_schema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  // ============================================
  // TOOL EXECUTION
  // ============================================

  async executeTool(name: string, input: any): Promise<any> {
    try {
      switch (name) {
        // TASKS
        case 'list_tasks': return await this.toolListTasks(input);
        case 'add_task': return await this.toolAddTask(input);
        case 'complete_task': return await this.toolCompleteTask(input);
        case 'update_task': return await this.toolUpdateTask(input);
        case 'activate_task': return await this.toolActivateTask(input);
        case 'deactivate_task': return await this.toolDeactivateTask(input);
        case 'delete_task': return await this.toolDeleteTask(input);
        
        // PROJECTS
        case 'list_projects': return await this.toolListProjects(input);
        case 'view_project': return await this.toolViewProject(input);
        case 'create_project': return await this.toolCreateProject(input);
        case 'add_project_note': return await this.toolAddProjectNote(input);
        
        // JOURNAL
        case 'add_journal_entry': return await this.toolAddJournalEntry(input);
        case 'list_journal_entries': return await this.toolListJournalEntries(input);
        case 'search_journal': return await this.toolSearchJournal(input);
        
        // SPRINTS
        case 'view_sprint': return await this.toolViewSprint(input);
        case 'add_objective': return await this.toolAddObjective(input);
        case 'pull_to_sprint': return await this.toolPullToSprint(input);
        
        // PEOPLE
        case 'list_people': return await this.toolListPeople();
        case 'add_person': return await this.toolAddPerson(input);
        case 'log_contact': return await this.toolLogContact(input);
        
        // CHECK-INS
        case 'add_checkin': return await this.toolAddCheckin(input);
        case 'list_checkins': return await this.toolListCheckins(input);
        
        // IDEAS
        case 'add_idea': return await this.toolAddIdea(input);
        case 'list_ideas': return await this.toolListIdeas(input);
        
        // NOTES
        case 'add_note': return await this.toolAddNote(input);
        case 'list_notes': return await this.toolListNotes(input);
        case 'view_note': return await this.toolViewNote(input);
        
        // MESSAGES
        case 'send_message': return await this.toolSendMessage(input);
        case 'check_messages': return await this.toolCheckMessages();
        
        // EMAIL (via MCP API)
        case 'check_email': return await this.toolCheckEmail(input);
        case 'read_email': return await this.toolReadEmail(input);
        case 'send_email': return await this.toolSendEmail(input);
        case 'search_email': return await this.toolSearchEmail(input);
        
        // MEMORY
        case 'remember': return await this.toolRemember(input);
        case 'recall': return await this.toolRecall(input);
        
        // STATS
        case 'get_stats': return await this.toolGetStats();
        case 'get_daily_summary': return await this.toolGetDailySummary();
        
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (error: any) {
      console.error(`Tool error (${name}):`, error);
      return { error: error.message || 'Tool execution failed' };
    }
  }

  // ============================================
  // TOOL IMPLEMENTATIONS
  // ============================================

  // TASKS
  async toolListTasks(input: { category?: string; project?: string; status?: string }) {
    const status = input.status || 'open';
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];
    
    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (input.category) {
      query += ' AND category = ?';
      params.push(input.category);
    }
    if (input.project) {
      query += ' AND project LIKE ?';
      params.push(`%${input.project}%`);
    }
    
    query += ' ORDER BY priority ASC, created_at DESC LIMIT 50';
    
    const result = await this.env.DB.prepare(query).bind(...params).all();
    return { tasks: result.results, count: result.results.length };
  }

  async toolAddTask(input: { text: string; category?: string; priority?: number; project?: string; due_date?: string; is_active?: boolean }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO tasks (id, text, category, priority, project, due_date, status, is_active, created_at, last_touched, user_id)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, datetime('now'), datetime('now'), 'micaiah')
    `).bind(
      id, 
      input.text, 
      input.category || null, 
      input.priority || 3, 
      input.project || null,
      input.due_date || null,
      input.is_active ? 1 : 0
    ).run();
    
    return { success: true, task_id: id, message: `Added task: "${input.text}"` };
  }

  async toolCompleteTask(input: { task_id?: string; search?: string }) {
    let taskId = input.task_id;
    
    if (!taskId && input.search) {
      const found = await this.env.DB.prepare(
        'SELECT id FROM tasks WHERE text LIKE ? AND status = ? LIMIT 1'
      ).bind(`%${input.search}%`, 'open').first();
      if (found) taskId = found.id as string;
    }
    
    if (!taskId) return { error: 'Task not found' };
    
    await this.env.DB.prepare(`
      UPDATE tasks SET status = 'done', completed_at = datetime('now'), last_touched = datetime('now')
      WHERE id = ?
    `).bind(taskId).run();
    
    return { success: true, message: 'Task completed' };
  }

  async toolUpdateTask(input: { task_id: string; text?: string; priority?: number; category?: string; due_date?: string }) {
    const updates: string[] = [];
    const params: any[] = [];
    
    if (input.text) { updates.push('text = ?'); params.push(input.text); }
    if (input.priority) { updates.push('priority = ?'); params.push(input.priority); }
    if (input.category) { updates.push('category = ?'); params.push(input.category); }
    if (input.due_date) { updates.push('due_date = ?'); params.push(input.due_date); }
    
    if (updates.length === 0) return { error: 'No updates provided' };
    
    updates.push("last_touched = datetime('now')");
    params.push(input.task_id);
    
    await this.env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    return { success: true, message: 'Task updated' };
  }

  async toolActivateTask(input: { task_id?: string; search?: string }) {
    let taskId = input.task_id;
    
    if (!taskId && input.search) {
      const found = await this.env.DB.prepare(
        'SELECT id FROM tasks WHERE text LIKE ? AND status = ? LIMIT 1'
      ).bind(`%${input.search}%`, 'open').first();
      if (found) taskId = found.id as string;
    }
    
    if (!taskId) return { error: 'Task not found' };
    
    await this.env.DB.prepare(
      "UPDATE tasks SET is_active = 1, last_touched = datetime('now') WHERE id = ?"
    ).bind(taskId).run();
    
    return { success: true, message: 'Task added to active list' };
  }

  async toolDeactivateTask(input: { task_id?: string; search?: string }) {
    let taskId = input.task_id;
    
    if (!taskId && input.search) {
      const found = await this.env.DB.prepare(
        'SELECT id FROM tasks WHERE text LIKE ? LIMIT 1'
      ).bind(`%${input.search}%`).first();
      if (found) taskId = found.id as string;
    }
    
    if (!taskId) return { error: 'Task not found' };
    
    await this.env.DB.prepare(
      "UPDATE tasks SET is_active = 0, last_touched = datetime('now') WHERE id = ?"
    ).bind(taskId).run();
    
    return { success: true, message: 'Task removed from active list' };
  }

  async toolDeleteTask(input: { task_id: string }) {
    await this.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(input.task_id).run();
    return { success: true, message: 'Task deleted' };
  }

  // PROJECTS
  async toolListProjects(input: { status?: string }) {
    const status = input.status || 'active';
    let query = 'SELECT * FROM projects';
    
    if (status !== 'all') {
      query += ' WHERE status = ?';
      const result = await this.env.DB.prepare(query).bind(status).all();
      return { projects: result.results };
    }
    
    const result = await this.env.DB.prepare(query).all();
    return { projects: result.results };
  }

  async toolViewProject(input: { project_id?: string; title?: string }) {
    let project;
    
    if (input.project_id) {
      project = await this.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(input.project_id).first();
    } else if (input.title) {
      project = await this.env.DB.prepare('SELECT * FROM projects WHERE title LIKE ?').bind(`%${input.title}%`).first();
    }
    
    if (!project) return { error: 'Project not found' };
    
    const phases = await this.env.DB.prepare('SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order').bind(project.id).all();
    const milestones = await this.env.DB.prepare('SELECT * FROM milestones WHERE project_id = ?').bind(project.id).all();
    const tasks = await this.env.DB.prepare('SELECT * FROM tasks WHERE project = ? AND status = ?').bind(project.title, 'open').all();
    
    return { project, phases: phases.results, milestones: milestones.results, tasks: tasks.results };
  }

  async toolCreateProject(input: { title: string; purpose?: string; goal?: string; target_date?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO projects (id, title, purpose, goal, target_date, status, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), 'micaiah')
    `).bind(id, input.title, input.purpose || null, input.goal || null, input.target_date || null).run();
    
    return { success: true, project_id: id, message: `Created project: "${input.title}"` };
  }

  async toolAddProjectNote(input: { project_id: string; note: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO project_notes (id, project_id, note, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(id, input.project_id, input.note).run();
    
    return { success: true, message: 'Note added to project' };
  }

  // JOURNAL
  async toolAddJournalEntry(input: { content: string; mood?: string; energy?: number; entry_type?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO journal_entries (id, content, mood, energy, entry_type, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, datetime('now'), 'micaiah')
    `).bind(id, input.content, input.mood || null, input.energy || null, input.entry_type || 'freeform').run();
    
    return { success: true, entry_id: id, message: 'Journal entry added' };
  }

  async toolListJournalEntries(input: { days?: number; mood?: string }) {
    const days = input.days || 7;
    let query = `SELECT * FROM journal_entries WHERE created_at > datetime('now', '-${days} days')`;
    
    if (input.mood) {
      query += ` AND mood = '${input.mood}'`;
    }
    
    query += ' ORDER BY created_at DESC LIMIT 20';
    
    const result = await this.env.DB.prepare(query).all();
    return { entries: result.results };
  }

  async toolSearchJournal(input: { query: string; days?: number }) {
    const days = input.days || 30;
    const result = await this.env.DB.prepare(`
      SELECT * FROM journal_entries 
      WHERE content LIKE ? AND created_at > datetime('now', '-${days} days')
      ORDER BY created_at DESC LIMIT 20
    `).bind(`%${input.query}%`).all();
    
    return { entries: result.results };
  }

  // SPRINTS
  async toolViewSprint(input: { sprint_id?: string }) {
    let sprint;
    
    if (input.sprint_id) {
      sprint = await this.env.DB.prepare('SELECT * FROM sprints WHERE id = ?').bind(input.sprint_id).first();
    } else {
      sprint = await this.env.DB.prepare("SELECT * FROM sprints WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").first();
    }
    
    if (!sprint) return { error: 'No active sprint found' };
    
    const objectives = await this.env.DB.prepare('SELECT * FROM objectives WHERE sprint_id = ?').bind(sprint.id).all();
    const tasks = await this.env.DB.prepare('SELECT * FROM tasks WHERE sprint_id = ? AND status = ?').bind(sprint.id, 'open').all();
    
    return { sprint, objectives: objectives.results, tasks: tasks.results };
  }

  async toolAddObjective(input: { statement: string; sprint_id?: string }) {
    let sprintId = input.sprint_id;
    
    if (!sprintId) {
      const sprint = await this.env.DB.prepare("SELECT id FROM sprints WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").first();
      if (sprint) sprintId = sprint.id as string;
    }
    
    if (!sprintId) return { error: 'No active sprint found' };
    
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO objectives (id, sprint_id, statement, status, created_at)
      VALUES (?, ?, ?, 'active', datetime('now'))
    `).bind(id, sprintId, input.statement).run();
    
    return { success: true, objective_id: id, message: `Added objective: "${input.statement}"` };
  }

  async toolPullToSprint(input: { task_id?: string; search?: string; objective_id?: string }) {
    let taskId = input.task_id;
    
    if (!taskId && input.search) {
      const found = await this.env.DB.prepare(
        'SELECT id FROM tasks WHERE text LIKE ? AND status = ? LIMIT 1'
      ).bind(`%${input.search}%`, 'open').first();
      if (found) taskId = found.id as string;
    }
    
    if (!taskId) return { error: 'Task not found' };
    
    const sprint = await this.env.DB.prepare("SELECT id FROM sprints WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").first();
    if (!sprint) return { error: 'No active sprint found' };
    
    await this.env.DB.prepare(`
      UPDATE tasks SET sprint_id = ?, objective_id = ?, last_touched = datetime('now')
      WHERE id = ?
    `).bind(sprint.id, input.objective_id || null, taskId).run();
    
    return { success: true, message: 'Task pulled into sprint' };
  }

  // PEOPLE
  async toolListPeople() {
    const result = await this.env.DB.prepare(`
      SELECT *, julianday('now') - julianday(last_contact) as days_since_contact
      FROM people ORDER BY name
    `).all();
    return { people: result.results };
  }

  async toolAddPerson(input: { name: string; relationship: string; birthday?: string; contact_frequency?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO people (id, name, relationship, birthday, contact_frequency, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, input.name, input.relationship, input.birthday || null, input.contact_frequency || 'weekly').run();
    
    return { success: true, person_id: id, message: `Added ${input.name}` };
  }

  async toolLogContact(input: { person_name: string; notes?: string }) {
    await this.env.DB.prepare(`
      UPDATE people SET last_contact = date('now')
      WHERE lower(name) = lower(?)
    `).bind(input.person_name).run();
    
    return { success: true, message: `Logged contact with ${input.person_name}` };
  }

  // CHECK-INS
  async toolAddCheckin(input: { thread_summary: string; full_recap: string; project_name?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO check_ins (id, thread_summary, full_recap, project_name, created_at, user_id)
      VALUES (?, ?, ?, ?, datetime('now'), 'micaiah')
    `).bind(id, input.thread_summary, input.full_recap, input.project_name || null).run();
    
    return { success: true, checkin_id: id, message: 'Check-in logged' };
  }

  async toolListCheckins(input: { limit?: number }) {
    const limit = input.limit || 10;
    const result = await this.env.DB.prepare(`
      SELECT * FROM check_ins ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all();
    
    return { checkins: result.results };
  }

  // IDEAS
  async toolAddIdea(input: { title: string; content?: string; category?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO incubation (id, title, content, category, status, created_at, user_id)
      VALUES (?, ?, ?, ?, 'raw', datetime('now'), 'micaiah')
    `).bind(id, input.title, input.content || null, input.category || 'Unsorted').run();
    
    return { success: true, idea_id: id, message: `Captured idea: "${input.title}"` };
  }

  async toolListIdeas(input: { category?: string }) {
    let query = 'SELECT * FROM incubation';
    const params: any[] = [];
    
    if (input.category) {
      query += ' WHERE category = ?';
      params.push(input.category);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 30';
    
    const result = await this.env.DB.prepare(query).bind(...params).all();
    return { ideas: result.results };
  }

  // NOTES
  async toolAddNote(input: { title: string; content?: string; category?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO notes (id, title, content, category, created_at, user_id)
      VALUES (?, ?, ?, ?, datetime('now'), 'micaiah')
    `).bind(id, input.title, input.content || '', input.category || 'General').run();
    
    return { success: true, note_id: id, message: `Added note: "${input.title}"` };
  }

  async toolListNotes(input: { category?: string }) {
    let query = 'SELECT id, title, category, created_at FROM notes';
    const params: any[] = [];
    
    if (input.category) {
      query += ' WHERE category = ?';
      params.push(input.category);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 30';
    
    const result = await this.env.DB.prepare(query).bind(...params).all();
    return { notes: result.results };
  }

  async toolViewNote(input: { note_id?: string; search?: string }) {
    let note;
    
    if (input.note_id) {
      note = await this.env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(input.note_id).first();
    } else if (input.search) {
      note = await this.env.DB.prepare('SELECT * FROM notes WHERE title LIKE ?').bind(`%${input.search}%`).first();
    }
    
    return note ? { note } : { error: 'Note not found' };
  }

  // MESSAGES
  async toolSendMessage(input: { message: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO messages (id, from_user, to_user, content, created_at)
      VALUES (?, 'micaiah', 'irene', ?, datetime('now'))
    `).bind(id, input.message).run();
    
    return { success: true, message: 'Message sent to Irene' };
  }

  async toolCheckMessages() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM messages 
      WHERE to_user = 'micaiah' AND read_at IS NULL
      ORDER BY created_at DESC
    `).all();
    
    return { messages: result.results, unread_count: result.results.length };
  }

  // EMAIL (via MCP API)
  async toolCheckEmail(input: { account?: string; max_results?: number }) {
    const account = input.account || 'personal';
    const maxResults = input.max_results || 10;
    
    try {
      const response = await fetch(
        `${this.env.MCP_API_URL}/api/email/inbox?account=${account}&max_results=${maxResults}`,
        {
          headers: {
            'Authorization': `Bearer ${this.env.MCP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json() as any;
        if (error.needs_auth) {
          return { error: `${account} email not connected. Micaiah needs to connect it via the MCP server.` };
        }
        return { error: error.error || 'Failed to check email' };
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Email check error:', error);
      return { error: 'Failed to connect to email service' };
    }
  }

  async toolReadEmail(input: { message_id: string; account?: string }) {
    const account = input.account || 'personal';
    
    try {
      const response = await fetch(
        `${this.env.MCP_API_URL}/api/email/read?account=${account}&message_id=${input.message_id}`,
        {
          headers: {
            'Authorization': `Bearer ${this.env.MCP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json() as any;
        return { error: error.error || 'Failed to read email' };
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Email read error:', error);
      return { error: 'Failed to connect to email service' };
    }
  }

  async toolSendEmail(input: { to: string; subject: string; body: string; account?: string }) {
    const account = input.account || 'personal';
    
    try {
      const response = await fetch(
        `${this.env.MCP_API_URL}/api/email/send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.env.MCP_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            account,
            to: input.to,
            subject: input.subject,
            body: input.body
          })
        }
      );
      
      if (!response.ok) {
        const error = await response.json() as any;
        if (error.needs_auth) {
          return { error: `${account} email not connected. Micaiah needs to connect it via the MCP server.` };
        }
        return { error: error.error || 'Failed to send email' };
      }
      
      const result = await response.json() as any;
      return { success: true, message: `Email sent to ${input.to}`, message_id: result.message_id };
    } catch (error: any) {
      console.error('Email send error:', error);
      return { error: 'Failed to connect to email service' };
    }
  }

  async toolSearchEmail(input: { query: string; account?: string; max_results?: number }) {
    const account = input.account || 'personal';
    const maxResults = input.max_results || 10;
    
    try {
      const response = await fetch(
        `${this.env.MCP_API_URL}/api/email/search?account=${account}&query=${encodeURIComponent(input.query)}&max_results=${maxResults}`,
        {
          headers: {
            'Authorization': `Bearer ${this.env.MCP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json() as any;
        return { error: error.error || 'Failed to search email' };
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Email search error:', error);
      return { error: 'Failed to connect to email service' };
    }
  }

  // MEMORY
  async toolRemember(input: { category: string; content: string; source?: string }) {
    const id = crypto.randomUUID();
    await this.env.DB.prepare(`
      INSERT INTO bethany_context (id, category, content, source, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, input.category, input.content, input.source || 'conversation').run();
    
    return { success: true, message: 'I\'ll remember that' };
  }

  async toolRecall(input: { category?: string }) {
    let query = 'SELECT * FROM bethany_context';
    const params: any[] = [];
    
    if (input.category) {
      query += ' WHERE category = ?';
      params.push(input.category);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    
    const result = await this.env.DB.prepare(query).bind(...params).all();
    return { memories: result.results };
  }

  // STATS
  async toolGetStats() {
    const tasks = await this.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'done' AND completed_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as completed_this_week
      FROM tasks
    `).first();
    
    const projects = await this.env.DB.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM projects
    `).first();
    
    const journal = await this.env.DB.prepare(`
      SELECT COUNT(*) as entries_this_week
      FROM journal_entries WHERE created_at > datetime('now', '-7 days')
    `).first();
    
    return { tasks, projects, journal };
  }

  async toolGetDailySummary() {
    const completed = await this.env.DB.prepare(`
      SELECT * FROM tasks WHERE completed_at > datetime('now', '-1 day') LIMIT 20
    `).all();
    
    const active = await this.env.DB.prepare(`
      SELECT * FROM tasks WHERE is_active = 1 AND status = 'open' ORDER BY priority LIMIT 10
    `).all();
    
    const journal = await this.env.DB.prepare(`
      SELECT * FROM journal_entries WHERE created_at > datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 5
    `).all();
    
    return { 
      completed_today: completed.results, 
      active_tasks: active.results,
      journal_today: journal.results
    };
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
      SELECT * FROM tasks WHERE status = 'open' ORDER BY priority ASC, created_at DESC LIMIT 30
    `).all();
    return result.results;
  }

  async getRecentJournal() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 5
    `).all();
    return result.results;
  }

  async getNeglectedPeople() {
    const result = await this.env.DB.prepare(`
      SELECT *, julianday('now') - julianday(last_contact) as days_since_contact
      FROM people 
      WHERE last_contact IS NULL 
        OR (contact_frequency = 'daily' AND julianday('now') - julianday(last_contact) > 1)
        OR (contact_frequency = 'weekly' AND julianday('now') - julianday(last_contact) > 7)
        OR (contact_frequency = 'monthly' AND julianday('now') - julianday(last_contact) > 30)
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
        FROM people WHERE birthday IS NOT NULL
      ) WHERE days_until <= 14 ORDER BY days_until ASC
    `).all();
    return result.results;
  }

  async getSprintStatus() {
    const result = await this.env.DB.prepare(`
      SELECT * FROM sprints WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
    `).first();
    return result || null;
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
