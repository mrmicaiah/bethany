// ============================================
// SESSION TYPES
// ============================================

export interface SessionMessage {
  role: 'micaiah' | 'bethany';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  title?: string;  // AI-generated title when session closes
  started_at: string;
  last_activity: string;
  messages: SessionMessage[];
  context?: string;  // what triggered this session (rhythm, incoming message, etc.)
}

export interface SessionIndexEntry {
  id: string;
  title: string;
  date: string;  // YYYY-MM-DD
  message_count: number;
}

export interface SessionIndex {
  current_session_id: string | null;
  archived_sessions: SessionIndexEntry[];  // All closed sessions with titles
  last_updated: string;
}

// ============================================
// SESSION CONSTANTS
// ============================================

const SESSION_PREFIX = 'micaiah/sessions';
const SESSION_GAP_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours = new session
const SESSION_RETENTION_DAYS = 150; // ~5 months

// ============================================
// SESSION FUNCTIONS
// ============================================

export async function getSessionIndex(bucket: R2Bucket): Promise<SessionIndex> {
  const obj = await bucket.get(`${SESSION_PREFIX}/index.json`);
  if (!obj) {
    return {
      current_session_id: null,
      archived_sessions: [],
      last_updated: new Date().toISOString(),
    };
  }
  const parsed = JSON.parse(await obj.text());
  
  // Migration: handle old format
  if (parsed.recent_sessions && !parsed.archived_sessions) {
    return {
      current_session_id: parsed.current_session_id,
      archived_sessions: [],
      last_updated: parsed.last_updated,
    };
  }
  
  return parsed;
}

async function saveSessionIndex(bucket: R2Bucket, index: SessionIndex): Promise<void> {
  index.last_updated = new Date().toISOString();
  await bucket.put(`${SESSION_PREFIX}/index.json`, JSON.stringify(index, null, 2));
}

export async function getSession(bucket: R2Bucket, sessionId: string): Promise<Session | null> {
  const obj = await bucket.get(`${SESSION_PREFIX}/${sessionId}.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

async function saveSession(bucket: R2Bucket, session: Session): Promise<void> {
  await bucket.put(`${SESSION_PREFIX}/${session.id}.json`, JSON.stringify(session, null, 2));
}

export async function getCurrentSession(bucket: R2Bucket): Promise<Session | null> {
  const index = await getSessionIndex(bucket);
  if (!index.current_session_id) return null;
  return getSession(bucket, index.current_session_id);
}

// ============================================
// TITLE GENERATION
// ============================================

export async function generateSessionTitle(
  session: Session,
  anthropicApiKey: string
): Promise<string> {
  if (session.messages.length === 0) {
    return 'empty-session';
  }
  
  // Build a transcript summary for Claude to title
  const transcript = session.messages
    .map(m => `${m.role === 'bethany' ? 'Bethany' : 'Him'}: ${m.content}`)
    .join('\n');
  
  const prompt = `Here's a text conversation. Generate a short, descriptive title (2-5 words, lowercase, hyphens instead of spaces). The title should capture what they talked about.

Examples of good titles:
- pancakes-and-morning-routine
- venting-about-work
- flirty-late-night
- planning-weekend-trip
- his-new-project-idea
- amber-birthday-gift

Conversation:
${transcript}

Reply with ONLY the title, nothing else.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      console.error('Title generation failed:', await response.text());
      return fallbackTitle(session);
    }

    const data = await response.json() as any;
    const title = data.content?.find((block: any) => block.type === 'text')?.text?.trim();
    
    if (!title) {
      return fallbackTitle(session);
    }
    
    // Clean up the title
    return title
      .toLowerCase()
      .replace(/[^a-z0-9-\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
      
  } catch (error) {
    console.error('Title generation error:', error);
    return fallbackTitle(session);
  }
}

function fallbackTitle(session: Session): string {
  // Simple keyword-based fallback
  const allText = session.messages.map(m => m.content.toLowerCase()).join(' ');
  
  if (allText.includes('writing') || allText.includes('book') || allText.includes('chapter')) {
    return 'writing-talk';
  }
  if (allText.includes('work') || allText.includes('client') || allText.includes('meeting')) {
    return 'work-stuff';
  }
  if (allText.includes('sexy') || allText.includes('bed') || allText.includes('want you')) {
    return 'flirty-chat';
  }
  if (allText.includes('morning') || allText.includes('coffee')) {
    return 'morning-chat';
  }
  if (allText.includes('night') || allText.includes('sleep')) {
    return 'evening-chat';
  }
  
  return 'casual-chat';
}

// ============================================
// CORE SESSION LOGIC
// ============================================

export interface SessionCheckResult {
  isNewSession: boolean;
  session: Session;
  previousSession: Session | null;  // if new session, this is what got closed
}

export async function checkAndManageSession(
  bucket: R2Bucket,
  context: string = 'message'
): Promise<SessionCheckResult> {
  const now = new Date();
  const index = await getSessionIndex(bucket);
  
  // Get current session if exists
  let currentSession: Session | null = null;
  if (index.current_session_id) {
    currentSession = await getSession(bucket, index.current_session_id);
  }
  
  // Check if we need a new session
  let needsNewSession = false;
  let previousSession: Session | null = null;
  
  if (!currentSession) {
    // No current session, start one
    needsNewSession = true;
  } else {
    // Check time gap
    const lastActivity = new Date(currentSession.last_activity);
    const gap = now.getTime() - lastActivity.getTime();
    
    if (gap > SESSION_GAP_THRESHOLD_MS) {
      // Gap too long, close old session and start new
      needsNewSession = true;
      previousSession = currentSession;
    }
  }
  
  if (needsNewSession) {
    // Create new session with simple ID (title added when archived)
    const newSessionId = `${now.toISOString().split('T')[0]}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    
    const newSession: Session = {
      id: newSessionId,
      started_at: now.toISOString(),
      last_activity: now.toISOString(),
      messages: [],
      context,
    };
    
    index.current_session_id = newSessionId;
    
    await saveSession(bucket, newSession);
    await saveSessionIndex(bucket, index);
    
    return {
      isNewSession: true,
      session: newSession,
      previousSession,
    };
  }
  
  // Continue current session
  return {
    isNewSession: false,
    session: currentSession!,
    previousSession: null,
  };
}

// ============================================
// ARCHIVE SESSION (called when session closes)
// ============================================

export async function archiveSession(
  bucket: R2Bucket,
  session: Session,
  anthropicApiKey: string
): Promise<void> {
  if (session.messages.length === 0) {
    // Don't archive empty sessions
    return;
  }
  
  // Generate title
  const title = await generateSessionTitle(session, anthropicApiKey);
  session.title = title;
  
  // Save session with title
  await saveSession(bucket, session);
  
  // Add to index
  const index = await getSessionIndex(bucket);
  const date = session.started_at.split('T')[0];
  
  index.archived_sessions.unshift({
    id: session.id,
    title,
    date,
    message_count: session.messages.length,
  });
  
  await saveSessionIndex(bucket, index);
  
  console.log(`Archived session: ${date}_${title} (${session.messages.length} messages)`);
}

export async function addMessageToSession(
  bucket: R2Bucket,
  role: 'micaiah' | 'bethany',
  content: string
): Promise<void> {
  const index = await getSessionIndex(bucket);
  if (!index.current_session_id) {
    // This shouldn't happen, but create session if needed
    await checkAndManageSession(bucket, 'message');
  }
  
  const session = await getSession(bucket, index.current_session_id!);
  if (!session) return;
  
  session.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  session.last_activity = new Date().toISOString();
  
  await saveSession(bucket, session);
}

// ============================================
// GET VERBATIM TRANSCRIPT
// ============================================

export async function getSessionTranscript(bucket: R2Bucket, sessionId: string): Promise<string | null> {
  const session = await getSession(bucket, sessionId);
  if (!session || session.messages.length === 0) {
    return null;
  }
  
  const date = new Date(session.started_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  
  const time = new Date(session.started_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  let transcript = `Session: ${session.title || 'untitled'} (${date} ${time})\n`;
  transcript += '---\n';
  
  for (const msg of session.messages) {
    const who = msg.role === 'bethany' ? 'You' : 'Him';
    transcript += `${who}: ${msg.content}\n`;
  }
  
  return transcript;
}

// ============================================
// GET SESSION LIST FOR CONTEXT
// ============================================

export async function getSessionListForContext(bucket: R2Bucket, limit: number = 20): Promise<string> {
  const index = await getSessionIndex(bucket);
  
  if (index.archived_sessions.length === 0) {
    return '(no past sessions yet)';
  }
  
  const sessions = index.archived_sessions.slice(0, limit);
  
  return sessions.map(s => `${s.date} | ${s.title} (${s.message_count} msgs)`).join('\n');
}

// ============================================
// FIND SESSION BY TOPIC
// ============================================

export async function findSessionByTopic(bucket: R2Bucket, searchTerm: string): Promise<SessionIndexEntry | null> {
  const index = await getSessionIndex(bucket);
  const term = searchTerm.toLowerCase();
  
  // Search titles for matching term
  const match = index.archived_sessions.find(s => 
    s.title.toLowerCase().includes(term)
  );
  
  return match || null;
}

// ============================================
// GET MOST RECENT ARCHIVED SESSION
// ============================================

export async function getMostRecentSession(bucket: R2Bucket): Promise<Session | null> {
  const index = await getSessionIndex(bucket);
  
  if (index.archived_sessions.length === 0) {
    return null;
  }
  
  return getSession(bucket, index.archived_sessions[0].id);
}

// ============================================
// SESSION SUMMARY FOR LONG-TERM MEMORY (legacy support)
// ============================================

export function summarizeSessionForMemory(session: Session): string {
  if (session.messages.length === 0) return '';
  
  const date = new Date(session.started_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  
  const time = new Date(session.started_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  const title = session.title || 'casual chat';
  
  return `${date} ${time}: ${title} (${session.messages.length} messages)`;
}

// ============================================
// FORMAT SESSION FOR CONTEXT (current conversation)
// ============================================

export function formatSessionForContext(session: Session): string {
  if (session.messages.length === 0) {
    return '(new conversation)';
  }
  
  // Only include last 10 messages from current session
  const recentMessages = session.messages.slice(-10);
  
  return recentMessages.map(m => {
    if (m.role === 'bethany') {
      return `[you said]: ${m.content}`;
    } else {
      return `[he said]: ${m.content}`;
    }
  }).join('\n');
}

// ============================================
// GET RECENT SESSION CONTEXT (for reference, not injection)
// ============================================

export async function getRecentSessionsSummary(bucket: R2Bucket): Promise<string[]> {
  const index = await getSessionIndex(bucket);
  const summaries: string[] = [];
  
  for (const entry of index.archived_sessions.slice(0, 3)) {
    const session = await getSession(bucket, entry.id);
    if (session && session.messages.length > 0) {
      summaries.push(summarizeSessionForMemory(session));
    }
  }
  
  return summaries;
}

// ============================================
// CLEANUP OLD SESSIONS (5 month retention)
// ============================================

export async function cleanupOldSessions(bucket: R2Bucket): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SESSION_RETENTION_DAYS);
  
  const index = await getSessionIndex(bucket);
  const sessionsToKeep: SessionIndexEntry[] = [];
  const sessionsToDelete: string[] = [];
  
  for (const entry of index.archived_sessions) {
    const sessionDate = new Date(entry.date);
    if (sessionDate >= cutoffDate) {
      sessionsToKeep.push(entry);
    } else {
      sessionsToDelete.push(entry.id);
    }
  }
  
  // Delete old session files
  for (const sessionId of sessionsToDelete) {
    await bucket.delete(`${SESSION_PREFIX}/${sessionId}.json`);
    console.log(`Deleted old session: ${sessionId}`);
  }
  
  // Update index if we removed anything
  if (sessionsToDelete.length > 0) {
    index.archived_sessions = sessionsToKeep;
    await saveSessionIndex(bucket, index);
    console.log(`Cleaned up ${sessionsToDelete.length} sessions older than 5 months`);
  }
}
