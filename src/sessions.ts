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
  started_at: string;
  last_activity: string;
  messages: SessionMessage[];
  context?: string;  // what triggered this session (rhythm, incoming message, etc.)
}

export interface SessionIndex {
  current_session_id: string | null;
  recent_sessions: string[];  // last 5 session IDs for reference
  last_updated: string;
}

// ============================================
// SESSION CONSTANTS
// ============================================

const SESSION_PREFIX = 'micaiah/sessions';
const SESSION_GAP_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours = new session

// ============================================
// SESSION FUNCTIONS
// ============================================

export async function getSessionIndex(bucket: R2Bucket): Promise<SessionIndex> {
  const obj = await bucket.get(`${SESSION_PREFIX}/index.json`);
  if (!obj) {
    return {
      current_session_id: null,
      recent_sessions: [],
      last_updated: new Date().toISOString(),
    };
  }
  return JSON.parse(await obj.text());
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
    // Create new session
    const newSessionId = `${now.toISOString().split('T')[0]}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    
    const newSession: Session = {
      id: newSessionId,
      started_at: now.toISOString(),
      last_activity: now.toISOString(),
      messages: [],
      context,
    };
    
    // Update index
    const recentSessions = index.current_session_id 
      ? [index.current_session_id, ...index.recent_sessions].slice(0, 5)
      : index.recent_sessions;
    
    index.current_session_id = newSessionId;
    index.recent_sessions = recentSessions;
    
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
// SESSION SUMMARY FOR LONG-TERM MEMORY
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
  
  const messageCount = session.messages.length;
  const topics: string[] = [];
  
  // Extract key topics/themes from messages (simple keyword approach)
  const allText = session.messages.map(m => m.content.toLowerCase()).join(' ');
  
  if (allText.includes('writing') || allText.includes('book') || allText.includes('chapter')) {
    topics.push('writing');
  }
  if (allText.includes('work') || allText.includes('client') || allText.includes('meeting')) {
    topics.push('work');
  }
  if (allText.includes('miss') || allText.includes('thinking about') || allText.includes('want')) {
    topics.push('feelings');
  }
  if (allText.includes('sexy') || allText.includes('bed') || allText.includes('tonight') || allText.includes('😏')) {
    topics.push('flirty');
  }
  if (allText.includes('morning') || allText.includes('coffee') || allText.includes('wake')) {
    topics.push('morning chat');
  }
  if (allText.includes('night') || allText.includes('sleep') || allText.includes('tired')) {
    topics.push('evening chat');
  }
  
  const topicStr = topics.length > 0 ? topics.join(', ') : 'casual';
  
  return `${date} ${time}: ${messageCount} messages, ${topicStr}`;
}

// ============================================
// FORMAT SESSION FOR CONTEXT
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
  
  for (const sessionId of index.recent_sessions.slice(0, 3)) {
    const session = await getSession(bucket, sessionId);
    if (session && session.messages.length > 0) {
      summaries.push(summarizeSessionForMemory(session));
    }
  }
  
  return summaries;
}

// ============================================
// CLEANUP OLD SESSIONS (call periodically)
// ============================================

export async function cleanupOldSessions(bucket: R2Bucket): Promise<void> {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  
  const listed = await bucket.list({ prefix: `${SESSION_PREFIX}/` });
  
  for (const obj of listed.objects) {
    if (obj.key.endsWith('index.json')) continue;
    
    // Check if older than 5 days
    if (obj.uploaded && obj.uploaded < fiveDaysAgo) {
      await bucket.delete(obj.key);
    }
  }
}
