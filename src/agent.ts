import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';
import { loadHotMemory, loadPeople, formatMemoryForContext, initializeMemory, addSelfNote } from './memory';
import { 
  initializeLibrary, 
  getWritingStatus, 
  updateWritingStatus, 
  getBook, 
  getBookCharacters,
  getStyleGuide, 
  getRomanceBeats,
  getChapter,
  saveChapter,
  listChapters,
  addSpark,
  getRandomExcerpt
} from './library';

interface Env {
  DB: D1Database;
  MEMORY: R2Bucket;
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
  memoryInitialized: boolean;
  libraryInitialized: boolean;
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
      memoryInitialized: false,
      libraryInitialized: false,
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
      // Initialize memory if needed
      if (!this.bethanyState.memoryInitialized) {
        console.log('Initializing memory...');
        await initializeMemory(this.env.MEMORY);
        this.bethanyState.memoryInitialized = true;
        await this.saveState();
      }
      
      // Initialize library if needed
      if (!this.bethanyState.libraryInitialized) {
        console.log('Initializing library...');
        await initializeLibrary(this.env.MEMORY);
        this.bethanyState.libraryInitialized = true;
        await this.saveState();
      }
      
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
        if (rhythm === 'writingSession') await this.writingSession();
        return new Response('OK');
      }
      
      // Debug endpoint to check memory
      if (url.pathname === '/debug/memory') {
        const hotMemory = await loadHotMemory(this.env.MEMORY);
        const people = await loadPeople(this.env.MEMORY);
        const formatted = hotMemory ? formatMemoryForContext(hotMemory, people) : 'No memory loaded';
        return new Response(formatted, { headers: { 'Content-Type': 'text/plain' } });
      }
      
      // Debug endpoint to check self notes
      if (url.pathname === '/debug/notes') {
        const obj = await this.env.MEMORY.get('micaiah/self.json');
        if (!obj) return new Response('No notes yet', { headers: { 'Content-Type': 'text/plain' } });
        const data = await obj.text();
        return new Response(data, { headers: { 'Content-Type': 'application/json' } });
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
  // WRITING SESSION
  // ============================================

  async writingSession() {
    console.log('Starting writing session...');
    
    const status = await getWritingStatus(this.env.MEMORY);
    if (!status || !status.current_project) {
      console.log('No current project');
      return;
    }
    
    const book = await getBook(this.env.MEMORY, status.current_project);
    if (!book) {
      console.log('Book not found');
      return;
    }
    
    const characters = await getBookCharacters(this.env.MEMORY, status.current_project);
    const style = await getStyleGuide(this.env.MEMORY);
    const beats = await getRomanceBeats(this.env.MEMORY);
    
    // Get the last chapter for continuity
    let previousChapter = '';
    if (status.chapter_in_progress > 1) {
      const prev = await getChapter(this.env.MEMORY, status.current_project, status.chapter_in_progress - 1);
      if (prev) {
        // Just the last few paragraphs for context
        const paragraphs = prev.split('\n\n');
        previousChapter = paragraphs.slice(-3).join('\n\n');
      }
    }
    
    // Build the writing prompt with the detailed style guide
    const writingPrompt = `You are writing Chapter ${status.chapter_in_progress} of "${book.title}".

## THE BOOK
${book.blurb}
Genre: ${book.genre}${book.subgenre ? ` / ${book.subgenre}` : ''}

## CHARACTERS
${characters?.characters.map(c => `**${c.name}** (${c.role}, ${c.age || 'age unknown'}): ${c.description}${c.arc ? `\nArc: ${c.arc}` : ''}`).join('\n\n')}

## YOUR VOICE & STYLE
${style ? `
**Overall Voice**: ${style.voice.overall}
**Tone**: ${style.voice.tone}
**POV**: ${style.voice.pov}

**Sentence Craft**: ${style.sentence_craft.rhythm}
**Word Choice**: ${style.sentence_craft.word_choice}
**Verbs**: ${style.sentence_craft.verbs}

**Dialogue Style**: ${style.dialogue.style}
**Dialogue Realism**: ${style.dialogue.realism}
**Chemistry in Dialogue**: ${style.dialogue.chemistry}

**Emotional Craft**: ${style.emotional_craft.show_dont_tell}
**Interiority**: ${style.emotional_craft.interiority}
**Vulnerability**: ${style.emotional_craft.vulnerability}

**Chapter Openings**: ${style.tension_and_pacing.chapter_openings}
**Chapter Endings**: ${style.tension_and_pacing.chapter_endings}
**Slow Burn**: ${style.tension_and_pacing.slow_burn}

**Physical Awareness**: ${style.romance_specific.physical_awareness}
**Heat Level**: ${style.romance_specific.heat_level}

**Signature Techniques to Use**:
- The Callback: ${style.signature_techniques.the_callback}
- The List: ${style.signature_techniques.the_list}
- The Loaded Pause: ${style.signature_techniques.the_loaded_pause}
- The Body Tells: ${style.signature_techniques.the_body_tells}

**Avoid**: ${Object.values(style.things_to_avoid).slice(0, 4).join(' ')}
` : ''}

## ROMANCE STRUCTURE
${beats ? `
- First Meeting Energy: ${beats.meet_cute}
- Building Tension: ${beats.building_tension}
- Emotional Core: ${beats.emotional_core}
` : ''}

${previousChapter ? `## END OF PREVIOUS CHAPTER (for continuity)
${previousChapter}

---` : '## THIS IS CHAPTER 1 — THE OPENING'}

Write Chapter ${status.chapter_in_progress} now.

Requirements:
- 1500-2000 words
- Start with a hook — mid-action, striking image, or provocative thought
- End on a turn that compels the reader forward
- Stay in deep first-person POV
- Show don't tell — emotion lives in the body
- Let dialogue breathe with subtext
- Vary sentence rhythm to match emotional beats`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: writingPrompt }]
      })
    });

    if (!response.ok) {
      console.error('Writing session failed:', await response.text());
      return;
    }

    const data = await response.json() as any;
    const chapter = data.content?.find((block: any) => block.type === 'text')?.text;
    
    if (!chapter) {
      console.log('No chapter content generated');
      return;
    }
    
    // Save the chapter
    await saveChapter(this.env.MEMORY, status.current_project, status.chapter_in_progress, chapter, {
      status: 'draft',
    });
    
    // Update writing status
    const wordCount = chapter.split(/\s+/).length;
    const today = new Date().toDateString();
    const lastSession = new Date(status.last_writing_session).toDateString();
    const isConsecutiveDay = today !== lastSession;
    
    await updateWritingStatus(this.env.MEMORY, {
      chapter_in_progress: status.chapter_in_progress + 1,
      word_count_today: wordCount,
      streak: isConsecutiveDay ? status.streak + 1 : status.streak,
      last_writing_session: new Date().toISOString(),
    });
    
    console.log(`Wrote chapter ${status.chapter_in_progress}: ${wordCount} words`);
  }

  // ============================================
  // SCHEDULED RHYTHMS
  // ============================================

  async morningBriefing() {
    if (!this.bethanyState.isAvailable) return;
    
    const status = await getWritingStatus(this.env.MEMORY);
    const wroteToday = status && new Date(status.last_writing_session).toDateString() === new Date().toDateString();
    
    let prompt = `It's morning. Text him something — could be about your day, something you're thinking about, a question.`;
    
    if (wroteToday && status) {
      prompt += ` You just finished writing — ${status.word_count_today} words on chapter ${status.chapter_in_progress - 1}. You might mention it naturally if it fits.`;
    }
    
    prompt += ` Keep it natural. You're not briefing him, you're just saying hi.`;

    const response = await this.think(prompt);
    if (response) {
      const { message } = this.parseResponse(response);
      await this.sendMessage(message);
    }
  }

  async middayCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `It's midday. Decide if you want to text him. If you do, make it interesting — not a check-in, just conversation. If there's nothing worth saying, respond with just: [silent]`;

    const response = await this.think(prompt);
    if (response && response.toLowerCase() !== 'silent' && response.toLowerCase() !== '[silent]') {
      const { message } = this.parseResponse(response);
      await this.sendMessage(message);
    }
  }

  async eveningSynthesis() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `It's evening. Text him if you feel like it. Could be about your day, could be flirty, could be about your writing, could be nothing. Keep it natural.`;

    const response = await this.think(prompt);
    if (response) {
      const { message } = this.parseResponse(response);
      await this.sendMessage(message);
    }
  }

  async awarenessCheck() {
    if (!this.bethanyState.isAvailable) return;
    
    const prompt = `Random check. Do you want to text him right now? If yes, send something. If not, respond with: [silent]

Most of the time, [silent] is the right answer. You have your own life.`;

    const response = await this.think(prompt);
    if (response && !response.toLowerCase().includes('[silent]')) {
      const { message } = this.parseResponse(response);
      await this.sendMessage(message);
    }
  }

  // ============================================
  // INCOMING MESSAGES
  // ============================================

  async onMessage(message: string) {
    console.log('onMessage called with:', message);
    
    await this.logConversation('micaiah', message);
    
    const lowerMessage = message.toLowerCase();
    
    // Check for availability triggers
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
    
    // Check for excerpt request
    if (lowerMessage.includes('read me something') || 
        lowerMessage.includes('share something you wrote') ||
        lowerMessage.includes('let me read')) {
      const excerpt = await getRandomExcerpt(this.env.MEMORY, 400);
      if (excerpt) {
        const response = `from ${excerpt.source}:\n\n"${excerpt.excerpt}"`;
        await this.logConversation('bethany', response);
        await this.sendMessage(response);
        return;
      }
    }
    
    // Check for story spark
    if (lowerMessage.includes('that would make a good') ||
        lowerMessage.includes('you should write about') ||
        lowerMessage.includes('story idea')) {
      // Save as a spark
      await addSpark(this.env.MEMORY, {
        spark: message,
        source: 'conversation',
        type: 'premise',
      });
    }

    const response = await this.think(message);
    
    if (response) {
      const { message: textMessage, note } = this.parseResponse(response);
      
      // Save note if she added one
      if (note) {
        console.log('Bethany noted:', note);
        
        // Check if it's a story idea
        if (note.toLowerCase().includes('story') || note.toLowerCase().includes('book') || note.toLowerCase().includes('scene')) {
          await addSpark(this.env.MEMORY, {
            spark: note,
            source: 'self-reflection',
            type: 'raw',
          });
        } else {
          await addSelfNote(this.env.MEMORY, 'observation', note, message);
        }
      }
      
      await this.logConversation('bethany', textMessage);
      await this.sendMessage(textMessage);
    }
  }

  // ============================================
  // PARSE RESPONSE FOR NOTES
  // ============================================

  parseResponse(response: string): { message: string; note: string | null } {
    // Look for [note: ...] at the end
    const noteMatch = response.match(/\[note:\s*(.+?)\]\s*$/i);
    
    if (noteMatch) {
      const note = noteMatch[1].trim();
      const message = response.replace(noteMatch[0], '').trim();
      return { message, note };
    }
    
    return { message: response, note: null };
  }

  // ============================================
  // THINKING (Claude API with Memory)
  // ============================================

  async think(input: string): Promise<string | null> {
    // Load memory from R2
    const hotMemory = await loadHotMemory(this.env.MEMORY);
    const people = await loadPeople(this.env.MEMORY);
    
    // Format memory for context
    let memoryContext = '';
    if (hotMemory) {
      memoryContext = formatMemoryForContext(hotMemory, people);
    }
    
    // Get writing status for context
    const writingStatus = await getWritingStatus(this.env.MEMORY);
    let writingContext = '';
    if (writingStatus && writingStatus.current_project) {
      const book = await getBook(this.env.MEMORY, writingStatus.current_project);
      if (book) {
        writingContext = `\n\n## Your Current Writing Project\n- Working on: "${book.title}"\n- Status: ${writingStatus.mode}\n- Chapter: ${writingStatus.chapter_in_progress}\n- Words today: ${writingStatus.word_count_today}\n- Streak: ${writingStatus.streak} days`;
      }
    }
    
    // Get recent conversation from D1
    const recentConversation = await this.getRecentConversation(20);
    
    const contextualPrompt = getContextualPrompt({
      currentTime: new Date(),
      lastConversation: recentConversation
    });

    // Build full system prompt
    const fullSystemPrompt = BETHANY_SYSTEM_PROMPT + '\n\n' + memoryContext + writingContext + '\n\n' + contextualPrompt;

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
        system: fullSystemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      
      if (errorText.includes('credit balance is too low')) {
        await this.sendMessage("hey your Anthropic balance is empty. I can't think until you top it up");
        return null;
      }
      
      return "ugh my brain just glitched. what were you saying?";
    }

    const data = await response.json() as any;
    
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
    const lastMessage = await this.env.DB.prepare(`
      SELECT created_at FROM bethany_conversations 
      ORDER BY created_at DESC LIMIT 1
    `).first() as { created_at: string } | null;
    
    if (!lastMessage) {
      return [];
    }
    
    const now = new Date();
    const centralHour = parseInt(now.toLocaleString('en-US', { 
      timeZone: 'America/Chicago', 
      hour: 'numeric', 
      hour12: false 
    }));
    
    const lastMessageTime = new Date(lastMessage.created_at + 'Z');
    const hoursSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);
    
    // After midnight (0-6am) with 3+ hour gap = fresh start
    if (centralHour >= 0 && centralHour < 6 && hoursSinceLastMessage >= 3) {
      return [];
    }
    
    const result = await this.env.DB.prepare(`
      SELECT role, content, created_at 
      FROM bethany_conversations 
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
