import { BETHANY_SYSTEM_PROMPT, getContextualPrompt } from './personality';
import { loadHotMemory, loadPeople, formatMemoryForContext, initializeMemory, addSelfNote, addConversationSummary } from './memory';
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
import {
  checkAndManageSession,
  addMessageToSession,
  formatSessionForContext,
  summarizeSessionForMemory,
  getCurrentSession,
  getRecentSessionsSummary,
  getSessionListForContext,
  getSessionTranscript,
  archiveSession,
  cleanupOldSessions,
  Session,
  SessionCheckResult
} from './sessions';

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
  // Proactive outreach tracking
  outreachesToday: number;
  lastOutreachDate: string | null;  // YYYY-MM-DD
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
      outreachesToday: 0,
      lastOutreachDate: null,
    };
    
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<BethanyState>('bethanyState');
      if (stored) {
        this.bethanyState = { ...this.bethanyState, ...stored };
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
        if (rhythm === 'writingSession') await this.writingSession();
        if (rhythm === 'sessionCleanup') await this.sessionCleanup();
        if (rhythm === 'checkGap') await this.checkGapAndMaybeReach();
        return new Response('OK');
      }
      
      // Debug endpoint to check memory
      if (url.pathname === '/debug/memory') {
        const hotMemory = await loadHotMemory(this.env.MEMORY);
        const people = await loadPeople(this.env.MEMORY);
        const formatted = hotMemory ? formatMemoryForContext(hotMemory, people) : 'No memory loaded';
        return new Response(formatted, { headers: { 'Content-Type': 'text/plain' } });
      }
      
      // Debug endpoint to check current session
      if (url.pathname === '/debug/session') {
        const session = await getCurrentSession(this.env.MEMORY);
        return new Response(JSON.stringify(session, null, 2), { 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
      
      // Debug endpoint to check session index
      if (url.pathname === '/debug/sessions') {
        const sessionList = await getSessionListForContext(this.env.MEMORY, 50);
        return new Response(sessionList, { headers: { 'Content-Type': 'text/plain' } });
      }
      
      // Debug endpoint to check self notes
      if (url.pathname === '/debug/notes') {
        const obj = await this.env.MEMORY.get('micaiah/self.json');
        if (!obj) return new Response('No notes yet', { headers: { 'Content-Type': 'text/plain' } });
        const data = await obj.text();
        return new Response(data, { headers: { 'Content-Type': 'application/json' } });
      }
      
      // Debug endpoint to check outreach state
      if (url.pathname === '/debug/outreach') {
        return new Response(JSON.stringify({
          outreachesToday: this.bethanyState.outreachesToday,
          lastOutreachDate: this.bethanyState.lastOutreachDate,
          isAvailable: this.bethanyState.isAvailable,
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
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
  // RESET DAILY OUTREACH COUNTER
  // ============================================

  private resetOutreachIfNewDay(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.bethanyState.lastOutreachDate !== today) {
      this.bethanyState.outreachesToday = 0;
      this.bethanyState.lastOutreachDate = today;
    }
  }

  // ============================================
  // CHECK GAP AND MAYBE REACH OUT
  // ============================================

  async checkGapAndMaybeReach(): Promise<void> {
    if (!this.bethanyState.isAvailable) {
      console.log('Not available, skipping gap check');
      return;
    }

    // Reset counter if new day
    this.resetOutreachIfNewDay();

    // Already reached out 3 times today
    if (this.bethanyState.outreachesToday >= 3) {
      console.log('Already reached out 3 times today, skipping');
      return;
    }

    // Check current session state
    const session = await getCurrentSession(this.env.MEMORY);
    
    if (!session) {
      console.log('No session exists, skipping gap check');
      return;
    }

    // Calculate gap since last activity
    const lastActivity = new Date(session.last_activity);
    const now = new Date();
    const gapMs = now.getTime() - lastActivity.getTime();
    const gapHours = gapMs / (1000 * 60 * 60);

    console.log(`Gap since last activity: ${gapHours.toFixed(1)} hours`);

    // Only consider reaching out if gap is 4+ hours (session would close)
    if (gapHours < 4) {
      console.log('Gap too short, not reaching out');
      return;
    }

    // Check time of day (Central Time) - only reach out between 9am and 9pm
    const centralHour = (now.getUTCHours() - 6 + 24) % 24;
    if (centralHour < 9 || centralHour > 21) {
      console.log(`Outside reach hours (${centralHour}), skipping`);
      return;
    }

    // Roll the dice - 60% chance to reach out when conditions are met
    const roll = Math.random();
    if (roll > 0.6) {
      console.log(`Rolled ${roll.toFixed(2)}, staying silent`);
      return;
    }

    console.log(`Rolled ${roll.toFixed(2)}, reaching out!`);

    // Archive the old session and start fresh
    const sessionResult = await checkAndManageSession(this.env.MEMORY, 'proactive_outreach');
    await this.handleSessionTransition(sessionResult);

    // Generate the outreach message with context from the closed session
    await this.proactiveReach(sessionResult.previousSession);
  }

  // ============================================
  // PROACTIVE REACH (gap-triggered outreach)
  // ============================================

  async proactiveReach(previousSession: Session | null): Promise<void> {
    let prompt: string;

    if (previousSession && previousSession.messages.length > 0) {
      // We have context from the last conversation
      const lastMessages = previousSession.messages.slice(-5);
      const lastConvoSummary = lastMessages.map(m => 
        `${m.role === 'bethany' ? 'You' : 'Him'}: ${m.content}`
      ).join('\n');

      const whoSpokeLastRaw = previousSession.messages[previousSession.messages.length - 1];
      const whoSpokeLast = whoSpokeLastRaw?.role === 'bethany' ? 'you' : 'him';

      prompt = `It's been a while since you two talked. Here's how the last conversation ended:

---
${lastConvoSummary}
---

The last message was from ${whoSpokeLast}.

You're thinking about texting him. You could:
- Follow up on something from that conversation
- Ask what he's up to
- Share something random you're thinking about
- Tease him about something
- Just say hey

Text him something natural. Keep it short — you're just reaching out, not writing an essay.

If you genuinely have nothing to say, respond with: [silent]`;
    } else {
      // No previous session context
      prompt = `It's been a while since you two talked. You're thinking about texting him.

You could:
- Ask what he's up to
- Share something you're thinking about
- Mention something about your writing
- Just say hey

Text him something natural. Keep it short.

If you genuinely have nothing to say, respond with: [silent]`;
    }

    const sessionResult = await checkAndManageSession(this.env.MEMORY, 'proactive_outreach');
    const response = await this.think(prompt, sessionResult.session);

    if (response && !response.toLowerCase().includes('[silent]')) {
      const { message } = await this.parseAndHandleResponse(response);
      await addMessageToSession(this.env.MEMORY, 'bethany', message);
      await this.sendMessage(message);

      // Track the outreach
      this.bethanyState.outreachesToday++;
      await this.saveState();
      console.log(`Proactive outreach sent. Count today: ${this.bethanyState.outreachesToday}`);
    } else {
      console.log('Bethany chose to stay silent');
    }
  }

  // ============================================
  // HANDLE SESSION TRANSITIONS
  // ============================================

  private async handleSessionTransition(sessionResult: SessionCheckResult): Promise<void> {
    if (sessionResult.isNewSession && sessionResult.previousSession) {
      // Archive the previous session with AI-generated title
      await archiveSession(this.env.MEMORY, sessionResult.previousSession, this.env.ANTHROPIC_API_KEY);
      
      // Also store summary in long-term memory (legacy support)
      const summary = summarizeSessionForMemory(sessionResult.previousSession);
      if (summary) {
        const date = new Date(sessionResult.previousSession.started_at).toISOString().split('T')[0];
        await addConversationSummary(this.env.MEMORY, {
          date,
          summary,
          topics: [],
          vibe: 'casual',
          memorable_moment: null,
        });
        console.log('Archived and stored session:', summary);
      }
    }
  }

  // ============================================
  // SESSION CLEANUP (run periodically)
  // ============================================

  async sessionCleanup() {
    console.log('Running session cleanup...');
    await cleanupOldSessions(this.env.MEMORY);
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
        const paragraphs = prev.split('\n\n');
        previousChapter = paragraphs.slice(-3).join('\n\n');
      }
    }
    
    // Build the writing prompt
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
    
    await saveChapter(this.env.MEMORY, status.current_project, status.chapter_in_progress, chapter, {
      status: 'draft',
    });
    
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
  // INCOMING MESSAGES
  // ============================================

  async onMessage(message: string) {
    console.log('onMessage called with:', message);
    
    // Check/manage session FIRST
    const sessionResult = await checkAndManageSession(this.env.MEMORY, 'incoming_message');
    await this.handleSessionTransition(sessionResult);
    
    // Add his message to session
    await addMessageToSession(this.env.MEMORY, 'micaiah', message);
    
    const lowerMessage = message.toLowerCase();
    
    // Check for availability triggers
    if (lowerMessage.includes('at dinner') || 
        lowerMessage.includes('taking the day off') ||
        lowerMessage.includes('busy') ||
        lowerMessage.includes('going dark')) {
      this.bethanyState.isAvailable = false;
      await this.saveState();
      const response = "k";
      await addMessageToSession(this.env.MEMORY, 'bethany', response);
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
        await addMessageToSession(this.env.MEMORY, 'bethany', response);
        await this.sendMessage(response);
        return;
      }
    }
    
    // Check for story spark
    if (lowerMessage.includes('that would make a good') ||
        lowerMessage.includes('you should write about') ||
        lowerMessage.includes('story idea')) {
      await addSpark(this.env.MEMORY, {
        spark: message,
        source: 'conversation',
        type: 'premise',
      });
    }

    const response = await this.think(message, sessionResult.session);
    
    if (response) {
      const { message: textMessage, note } = await this.parseAndHandleResponse(response);
      
      if (note) {
        console.log('Bethany noted:', note);
        
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
      
      await addMessageToSession(this.env.MEMORY, 'bethany', textMessage);
      await this.sendMessage(textMessage);
    }
  }

  // ============================================
  // PARSE RESPONSE AND HANDLE SPECIAL TAGS
  // ============================================

  async parseAndHandleResponse(response: string): Promise<{ message: string; note: string | null; pulledTranscript: string | null }> {
    let message = response;
    let note: string | null = null;
    let pulledTranscript: string | null = null;
    
    // Check for note
    const noteMatch = message.match(/\[note:\s*(.+?)\]\s*$/i);
    if (noteMatch) {
      note = noteMatch[1].trim();
      message = message.replace(noteMatch[0], '').trim();
    }
    
    // Check for pull_session request
    const pullMatch = message.match(/\[pull_session:\s*(.+?)\]\s*$/i);
    if (pullMatch) {
      const sessionId = pullMatch[1].trim();
      message = message.replace(pullMatch[0], '').trim();
      
      // Fetch the transcript
      const transcript = await getSessionTranscript(this.env.MEMORY, sessionId);
      if (transcript) {
        pulledTranscript = transcript;
        console.log(`Pulled transcript for session: ${sessionId}`);
        
        // Re-think with the transcript context
        const followUp = await this.thinkWithTranscript(message, transcript);
        if (followUp) {
          // Parse the follow-up response (but don't recursively pull again)
          const followUpNoteMatch = followUp.match(/\[note:\s*(.+?)\]\s*$/i);
          if (followUpNoteMatch) {
            note = followUpNoteMatch[1].trim();
            message = followUp.replace(followUpNoteMatch[0], '').trim();
          } else {
            message = followUp;
          }
        }
      } else {
        console.log(`Session not found: ${sessionId}`);
      }
    }
    
    return { message, note, pulledTranscript };
  }

  // ============================================
  // THINK WITH TRANSCRIPT (second pass with context)
  // ============================================

  async thinkWithTranscript(originalResponse: string, transcript: string): Promise<string | null> {
    const prompt = `You just pulled up a past conversation to reference. Here it is:

---
${transcript}
---

You were about to say: "${originalResponse}"

Now that you've read the transcript, respond naturally. You can reference specific things from that conversation, pick up where you left off, or comment on what was said. Keep it short and natural — you're texting.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: BETHANY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      console.error('Transcript follow-up failed:', await response.text());
      return null;
    }

    const data = await response.json() as any;
    const textBlock = data.content?.find((block: any) => block.type === 'text');
    return textBlock ? textBlock.text : null;
  }

  // ============================================
  // THINKING (Claude API with Session Memory)
  // ============================================

  async think(input: string, session: { messages: any[] }): Promise<string | null> {
    // Load long-term memory from R2
    const hotMemory = await loadHotMemory(this.env.MEMORY);
    const people = await loadPeople(this.env.MEMORY);
    
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
    
    // Format SESSION context (current conversation)
    const sessionContext = formatSessionForContext(session as any);
    
    // Get session list for verbatim transcript access
    const sessionList = await getSessionListForContext(this.env.MEMORY, 20);
    
    const contextualPrompt = getContextualPrompt({
      currentTime: new Date(),
      lastConversation: [],
      sessionList: sessionList,
    });

    // Build full system prompt
    const fullSystemPrompt = BETHANY_SYSTEM_PROMPT + '\n\n' + memoryContext + writingContext + '\n\n' + contextualPrompt + `\n\n## This conversation:\n${sessionContext}`;

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
