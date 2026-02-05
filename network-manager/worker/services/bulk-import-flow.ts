/**
 * Bulk Import Flow — Guided Conversation After CSV Upload
 *
 * After a user uploads a CSV of contacts, they typically have a pile of names
 * with minimal organization. This flow helps them:
 *
 *   1. Understand what they just uploaded
 *   2. Define their "worlds" (circles) based on how they actually think
 *   3. Either batch-sort by circle or mark as unsorted for gradual triage
 *
 * The flow is conversational but efficient — Bethany meets them where they are.
 * If they have clean data ("all my DJ clients are here"), she helps with that.
 * If it's chaos, she reassures them and sets up a sustainable triage path.
 *
 * FLOW STAGES:
 *
 *   import_summary     — CSV just uploaded. Show count, ask about organization.
 *   discover_worlds    — Learn about user's circles/contexts. Create them.
 *   assign_strategy    — Per-circle: batch file? Manual sort? Skip for now?
 *   batch_assignment   — User provides circle assignment for a group.
 *   wrap_up            — Summary of what was organized, next steps.
 *
 * CONVERSATION CONTEXT:
 *
 *   Stored in a Durable Object keyed by (userId + importSessionId).
 *   Each import gets its own session. Context expires after 30 minutes
 *   of inactivity (user can always start fresh).
 *
 * INTEGRATION POINTS:
 *
 *   - Called by dashboard after CSV upload success
 *   - Called by SMS router when user replies during an active session
 *   - Uses circle-service.ts for circle CRUD
 *   - Uses contact-service.ts for bulk updates
 *
 * @see worker/services/circle-service.ts for circle creation
 * @see worker/services/contact-service.ts for contact updates
 * @see shared/models.ts for data types
 */

import type { Env } from '../../shared/types';
import type { CircleRow, ContactRow, IntentType } from '../../shared/models';
import {
  createCircle,
  getCircleByName,
  listCircles,
  addContactToCircle,
} from './circle-service';
import { updateContact, listContacts } from './contact-service';

// ===========================================================================
// Types
// ===========================================================================

/**
 * Import flow stages — linear progression with potential loops for multi-circle.
 */
export type ImportFlowStage =
  | 'import_summary'      // Just uploaded, show stats and ask about organization
  | 'discover_worlds'     // Learning about user's circles/contexts
  | 'assign_strategy'     // Per-circle strategy selection
  | 'batch_assignment'    // Processing batch assignment for a circle
  | 'wrap_up';            // Done, show summary

/**
 * Import flow session state — stored in Durable Object.
 */
export interface ImportFlowState {
  userId: string;
  sessionId: string;
  stage: ImportFlowStage;

  // Import stats
  totalImported: number;
  unsortedCount: number;
  importedAt: string;

  // Circles discovered during conversation
  circlesDiscovered: Array<{
    name: string;
    id?: string;           // Set after creation
    created: boolean;
    contactCount?: number; // If user knows a rough count
  }>;

  // Current focus (for multi-step circle flows)
  currentCircleFocus: string | null;

  // Contacts assigned during this session
  assignedContacts: Array<{
    contactId: string;
    circleId: string;
    circleName: string;
  }>;

  // Contacts explicitly marked as unsorted
  markedUnsorted: string[];

  // Conversation history (for AI context)
  messages: Array<{
    role: 'user' | 'bethany';
    content: string;
    timestamp: string;
  }>;

  // Timestamps
  startedAt: string;
  lastMessageAt: string;
}

/**
 * Result from handling a message in the import flow.
 */
export interface ImportFlowResult {
  response: string;
  stage: ImportFlowStage;
  isComplete: boolean;
  circlesCreated: string[];
  contactsAssigned: number;
}

/**
 * Context passed to AI for response generation.
 */
interface AIContext {
  userName: string;
  totalImported: number;
  unsortedCount: number;
  existingCircles: CircleRow[];
  circlesDiscovered: ImportFlowState['circlesDiscovered'];
  currentCircleFocus: string | null;
  stage: ImportFlowStage;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Start a new import flow session after CSV upload.
 *
 * Called by the dashboard when a CSV import completes. Initializes
 * session state and generates Bethany's opening message.
 *
 * @param env          - Worker environment bindings
 * @param userId       - The user who uploaded
 * @param totalCount   - Total contacts in the import
 * @param unsortedCount - Contacts without circle assignment
 * @returns Opening message and session ID
 */
export async function startImportFlow(
  env: Env,
  userId: string,
  totalCount: number,
  unsortedCount: number,
): Promise<{ sessionId: string; message: string; state: ImportFlowState }> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Load existing circles for context
  const existingCircles = await listCircles(env.DB, userId);

  // Generate opening message
  const openingMessage = await generateImportSummaryMessage(
    env,
    totalCount,
    unsortedCount,
    existingCircles,
  );

  // Initialize session state
  const state: ImportFlowState = {
    userId,
    sessionId,
    stage: 'import_summary',
    totalImported: totalCount,
    unsortedCount,
    importedAt: now,
    circlesDiscovered: [],
    currentCircleFocus: null,
    assignedContacts: [],
    markedUnsorted: [],
    messages: [
      {
        role: 'bethany',
        content: openingMessage,
        timestamp: now,
      },
    ],
    startedAt: now,
    lastMessageAt: now,
  };

  // Store in Durable Object
  await storeImportFlowState(env, userId, sessionId, state);

  return { sessionId, message: openingMessage, state };
}

/**
 * Handle a user message during an active import flow.
 *
 * Routes to the appropriate handler based on current stage,
 * advances the state machine, and generates Bethany's response.
 *
 * @param env       - Worker environment bindings
 * @param userId    - The user
 * @param sessionId - The import session
 * @param message   - User's message text
 * @returns Bethany's response and updated state
 */
export async function handleImportFlowMessage(
  env: Env,
  userId: string,
  sessionId: string,
  message: string,
): Promise<ImportFlowResult> {
  // Load session state
  let state = await loadImportFlowState(env, userId, sessionId);

  if (!state) {
    // Session expired or not found
    return {
      response: "Hmm, I lost track of that import session. Want to start fresh? You can re-upload the CSV and I'll walk you through organizing them.",
      stage: 'wrap_up',
      isComplete: true,
      circlesCreated: [],
      contactsAssigned: 0,
    };
  }

  // Record user message
  const now = new Date().toISOString();
  state.messages.push({
    role: 'user',
    content: message,
    timestamp: now,
  });
  state.lastMessageAt = now;

  // Handle based on current stage
  let response: string;

  switch (state.stage) {
    case 'import_summary':
      response = await handleImportSummaryResponse(env, state, message);
      break;

    case 'discover_worlds':
      response = await handleDiscoverWorldsResponse(env, state, message);
      break;

    case 'assign_strategy':
      response = await handleAssignStrategyResponse(env, state, message);
      break;

    case 'batch_assignment':
      response = await handleBatchAssignmentResponse(env, state, message);
      break;

    case 'wrap_up':
      response = await handleWrapUpResponse(env, state, message);
      break;
  }

  // Record Bethany's response
  state.messages.push({
    role: 'bethany',
    content: response,
    timestamp: new Date().toISOString(),
  });

  // Check if complete
  const isComplete = state.stage === 'wrap_up';

  // Persist updated state
  await storeImportFlowState(env, userId, sessionId, state);

  return {
    response,
    stage: state.stage,
    isComplete,
    circlesCreated: state.circlesDiscovered
      .filter(c => c.created && c.id)
      .map(c => c.name),
    contactsAssigned: state.assignedContacts.length,
  };
}

/**
 * Check if a user has an active import flow session.
 *
 * @param env    - Worker environment bindings
 * @param userId - The user to check
 * @returns Session ID if active, null otherwise
 */
export async function getActiveImportSession(
  env: Env,
  userId: string,
): Promise<string | null> {
  // Check the most recent session (stored as 'latest' pointer)
  const latestSessionId = await getLatestSessionId(env, userId);
  if (!latestSessionId) return null;

  const state = await loadImportFlowState(env, userId, latestSessionId);
  if (!state) return null;

  // Check if still active (within 30 minute window)
  const lastMessage = new Date(state.lastMessageAt);
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  if (lastMessage < thirtyMinutesAgo) {
    return null; // Expired
  }

  // Check if not already complete
  if (state.stage === 'wrap_up') {
    return null;
  }

  return latestSessionId;
}

/**
 * Get unsorted contacts (contacts with no circle assignment).
 *
 * @param db     - D1 database binding
 * @param userId - The user
 * @param limit  - Max results (default 100)
 */
export async function getUnsortedContacts(
  db: D1Database,
  userId: string,
  limit: number = 100,
): Promise<Array<{ id: string; name: string; source: string | null }>> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.source
       FROM contacts c
       LEFT JOIN contact_circles cc ON c.id = cc.contact_id
       WHERE c.user_id = ? AND c.archived = 0 AND cc.contact_id IS NULL
       ORDER BY c.created_at DESC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<{ id: string; name: string; source: string | null }>();

  return results;
}

/**
 * Bulk assign contacts to a circle.
 *
 * @param db        - D1 database binding
 * @param userId    - The user
 * @param contactIds - Contact IDs to assign
 * @param circleId  - Circle to assign them to
 */
export async function bulkAssignToCircle(
  db: D1Database,
  userId: string,
  contactIds: string[],
  circleId: string,
): Promise<{ assigned: number }> {
  if (contactIds.length === 0) return { assigned: 0 };

  const now = new Date().toISOString();
  let assigned = 0;

  // Batch insert into contact_circles
  // D1 doesn't support multi-row INSERT, so we batch prepare statements
  const stmts = contactIds.map(contactId =>
    db
      .prepare(
        `INSERT OR IGNORE INTO contact_circles (contact_id, circle_id, added_at)
         VALUES (?, ?, ?)`
      )
      .bind(contactId, circleId, now)
  );

  const results = await db.batch(stmts);

  for (const result of results) {
    assigned += result.meta.changes ?? 0;
  }

  return { assigned };
}

// ===========================================================================
// Stage Handlers
// ===========================================================================

/**
 * Handle response to the import summary stage.
 *
 * User just saw their import stats. They might:
 * - Want to organize by circles
 * - Ask to skip and mark all unsorted
 * - Ask questions about the process
 */
async function handleImportSummaryResponse(
  env: Env,
  state: ImportFlowState,
  message: string,
): Promise<string> {
  const lowerMessage = message.toLowerCase().trim();

  // Check for "skip" / "later" / "not now" signals
  if (
    lowerMessage.includes('later') ||
    lowerMessage.includes('skip') ||
    lowerMessage.includes('not now') ||
    lowerMessage.includes("don't want to") ||
    lowerMessage.includes('too many')
  ) {
    state.stage = 'wrap_up';
    return generateChaosAcknowledgment(state.unsortedCount);
  }

  // Check for readiness signals
  if (
    lowerMessage.includes('yes') ||
    lowerMessage.includes('sure') ||
    lowerMessage.includes('ok') ||
    lowerMessage.includes("let's") ||
    lowerMessage.includes('organize') ||
    lowerMessage.includes('ready')
  ) {
    state.stage = 'discover_worlds';
    return `Great! Tell me about the different worlds you operate in - businesses, friend groups, family, hobbies. We'll create circles for each. What comes to mind first?`;
  }

  // Otherwise, they might be asking questions or giving mixed signals
  // Use AI to generate an appropriate response
  return await generateAIResponse(
    env,
    state,
    `User responded to import summary with: "${message}". They have ${state.unsortedCount} unsorted contacts. Guide them toward either starting to organize (transition to discover_worlds) or acknowledging it's okay to skip for now (transition to wrap_up). Be warm and non-pressuring.`,
  );
}

/**
 * Handle response during circle discovery.
 *
 * User is telling us about their "worlds". We:
 * - Extract circle names from their message
 * - Create circles that don't already exist
 * - Ask for more or move to assignment strategy
 */
async function handleDiscoverWorldsResponse(
  env: Env,
  state: ImportFlowState,
  message: string,
): Promise<string> {
  const lowerMessage = message.toLowerCase().trim();

  // Check for "done" / "that's it" signals
  if (
    lowerMessage === 'done' ||
    lowerMessage === "that's it" ||
    lowerMessage === 'no more' ||
    lowerMessage.includes("that's all") ||
    lowerMessage.includes('nothing else')
  ) {
    if (state.circlesDiscovered.length === 0) {
      // No circles discovered, go to wrap_up with chaos acknowledgment
      state.stage = 'wrap_up';
      return generateChaosAcknowledgment(state.unsortedCount);
    }

    // Move to assignment strategy for the first circle
    state.stage = 'assign_strategy';
    state.currentCircleFocus = state.circlesDiscovered[0].name;
    return generateAssignmentStrategyPrompt(state.circlesDiscovered[0].name, state.unsortedCount);
  }

  // Extract circle names from the message
  const extractedCircles = await extractCircleNames(env, message, state);

  // Create circles that don't exist
  const existingCircles = await listCircles(env.DB, state.userId);
  const existingNames = new Set(existingCircles.map(c => c.name.toLowerCase()));

  for (const circleName of extractedCircles) {
    const normalizedName = circleName.trim();
    if (existingNames.has(normalizedName.toLowerCase())) {
      // Already exists - find it and add to discovered
      const existing = existingCircles.find(
        c => c.name.toLowerCase() === normalizedName.toLowerCase()
      );
      if (existing) {
        state.circlesDiscovered.push({
          name: existing.name,
          id: existing.id,
          created: false,
        });
      }
    } else {
      // Create new circle
      try {
        const newCircle = await createCircle(env.DB, state.userId, {
          name: normalizedName,
        });
        state.circlesDiscovered.push({
          name: newCircle.name,
          id: newCircle.id,
          created: true,
        });
        existingNames.add(normalizedName.toLowerCase());
      } catch (err) {
        // Likely duplicate name race condition, ignore
        console.warn(`[import-flow] Failed to create circle "${normalizedName}":`, err);
      }
    }
  }

  // Generate response asking for more or confirming
  const circleCount = state.circlesDiscovered.length;
  const newCircles = state.circlesDiscovered.filter(c => c.created);

  if (circleCount === 0) {
    return `I didn't quite catch any specific groups there. Can you tell me about your worlds? Like "DJ clients, college friends, book club" - what spheres do you operate in?`;
  }

  const circleList = state.circlesDiscovered.map(c => c.name).join(', ');
  const createdNote = newCircles.length > 0
    ? `I created ${newCircles.length === 1 ? 'a circle' : 'circles'} for ${newCircles.map(c => c.name).join(', ')}. `
    : '';

  return `${createdNote}So far I've got: ${circleList}. Any other worlds you operate in, or is that the main ones?`;
}

/**
 * Handle response during assignment strategy selection.
 *
 * User is deciding how to handle a specific circle's contacts.
 * Options:
 * - "I have a file" → we offer batch upload for that circle
 * - "One by one" → we'll mark unsorted and use intent-assignment flow
 * - "Skip" → move to next circle or wrap up
 */
async function handleAssignStrategyResponse(
  env: Env,
  state: ImportFlowState,
  message: string,
): Promise<string> {
  const lowerMessage = message.toLowerCase().trim();
  const currentCircle = state.currentCircleFocus;

  if (!currentCircle) {
    // Shouldn't happen, but handle gracefully
    state.stage = 'wrap_up';
    return generateWrapUpMessage(state);
  }

  // Check for batch assignment signals
  if (
    lowerMessage.includes('file') ||
    lowerMessage.includes('list') ||
    lowerMessage.includes('batch') ||
    lowerMessage.includes('all of them') ||
    lowerMessage.includes('these are')
  ) {
    state.stage = 'batch_assignment';
    return `Perfect! Paste the names of your ${currentCircle} contacts here - one per line, or comma-separated. I'll assign them all to that circle.`;
  }

  // Check for "one by one" / gradual signals
  if (
    lowerMessage.includes('one by one') ||
    lowerMessage.includes('gradual') ||
    lowerMessage.includes('over time') ||
    lowerMessage.includes('as i go')
  ) {
    return moveToNextCircleOrWrapUp(state);
  }

  // Check for skip signals
  if (
    lowerMessage.includes('skip') ||
    lowerMessage.includes('next') ||
    lowerMessage.includes('later')
  ) {
    return moveToNextCircleOrWrapUp(state);
  }

  // AI fallback for ambiguous responses
  return await generateAIResponse(
    env,
    state,
    `User is deciding how to assign contacts to "${currentCircle}". They said: "${message}". Options are: batch assignment (they have names ready), one-by-one over time, or skip. Help them choose without being pushy.`,
  );
}

/**
 * Handle batch assignment — user is pasting names for a specific circle.
 */
async function handleBatchAssignmentResponse(
  env: Env,
  state: ImportFlowState,
  message: string,
): Promise<string> {
  const currentCircle = state.currentCircleFocus;

  if (!currentCircle) {
    state.stage = 'wrap_up';
    return generateWrapUpMessage(state);
  }

  // Find the circle ID
  const circleData = state.circlesDiscovered.find(c => c.name === currentCircle);
  if (!circleData?.id) {
    // Circle wasn't created properly
    return moveToNextCircleOrWrapUp(state);
  }

  // Parse names from the message
  const names = parseNamesFromMessage(message);

  if (names.length === 0) {
    return `I didn't catch any names there. Try pasting them one per line, or separated by commas. Like:\n\nJohn Smith\nMary Johnson\nBob Wilson`;
  }

  // Match names against unsorted contacts
  const unsortedContacts = await getUnsortedContacts(env.DB, state.userId, 500);
  const matched: Array<{ id: string; name: string }> = [];
  const unmatched: string[] = [];

  for (const name of names) {
    const normalizedName = name.toLowerCase().trim();
    const contact = unsortedContacts.find(
      c => c.name.toLowerCase() === normalizedName ||
           c.name.toLowerCase().includes(normalizedName) ||
           normalizedName.includes(c.name.toLowerCase())
    );

    if (contact) {
      matched.push(contact);
    } else {
      unmatched.push(name);
    }
  }

  // Assign matched contacts to the circle
  if (matched.length > 0) {
    await bulkAssignToCircle(
      env.DB,
      state.userId,
      matched.map(c => c.id),
      circleData.id,
    );

    // Track in state
    for (const contact of matched) {
      state.assignedContacts.push({
        contactId: contact.id,
        circleId: circleData.id,
        circleName: currentCircle,
      });
    }
  }

  // Generate response
  let response = '';

  if (matched.length > 0) {
    response = `Got it! Added ${matched.length} ${matched.length === 1 ? 'person' : 'people'} to ${currentCircle}.`;
  }

  if (unmatched.length > 0 && unmatched.length <= 5) {
    response += ` I couldn't find matches for: ${unmatched.join(', ')}. They might not be in your import or the name might be slightly different.`;
  } else if (unmatched.length > 5) {
    response += ` I couldn't find matches for ${unmatched.length} names - they might not be in your import or spelled differently.`;
  }

  // Move to next circle or wrap up
  return response + ' ' + moveToNextCircleOrWrapUp(state);
}

/**
 * Handle wrap-up stage — session is ending.
 */
async function handleWrapUpResponse(
  env: Env,
  state: ImportFlowState,
  message: string,
): Promise<string> {
  // User might have a follow-up question or want to continue
  const lowerMessage = message.toLowerCase().trim();

  if (
    lowerMessage.includes('more') ||
    lowerMessage.includes('continue') ||
    lowerMessage.includes('another')
  ) {
    state.stage = 'discover_worlds';
    return `Sure! What other circles should we add?`;
  }

  // Otherwise just acknowledge
  return `You got it! Your contacts are ready to go. If you want to organize more later, just let me know.`;
}

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Move to the next undiscussed circle or wrap up.
 */
function moveToNextCircleOrWrapUp(state: ImportFlowState): string {
  // Find next circle that hasn't been focused on
  const currentIndex = state.circlesDiscovered.findIndex(
    c => c.name === state.currentCircleFocus
  );

  if (currentIndex < state.circlesDiscovered.length - 1) {
    // Move to next circle
    const nextCircle = state.circlesDiscovered[currentIndex + 1];
    state.currentCircleFocus = nextCircle.name;
    state.stage = 'assign_strategy';
    return generateAssignmentStrategyPrompt(nextCircle.name, state.unsortedCount - state.assignedContacts.length);
  }

  // No more circles, wrap up
  state.stage = 'wrap_up';
  return generateWrapUpMessage(state);
}

/**
 * Generate the assignment strategy prompt for a circle.
 */
function generateAssignmentStrategyPrompt(circleName: string, remainingUnsorted: number): string {
  return `Now for ${circleName}. Do you have your ${circleName} contacts together in a list? If yes, paste them here and I'll assign them all at once. Or we can sort them one by one over time — whatever works for you.`;
}

/**
 * Generate the wrap-up message.
 */
function generateWrapUpMessage(state: ImportFlowState): string {
  const assigned = state.assignedContacts.length;
  const remaining = state.unsortedCount - assigned;
  const circlesCreated = state.circlesDiscovered.filter(c => c.created).length;

  if (assigned === 0 && circlesCreated === 0) {
    return generateChaosAcknowledgment(state.unsortedCount);
  }

  let message = '';

  if (circlesCreated > 0) {
    message += `Created ${circlesCreated} new ${circlesCreated === 1 ? 'circle' : 'circles'}. `;
  }

  if (assigned > 0) {
    message += `Assigned ${assigned} ${assigned === 1 ? 'contact' : 'contacts'}. `;
  }

  if (remaining > 0) {
    message += `${remaining} ${remaining === 1 ? 'contact is' : 'contacts are'} still unsorted — we can work through those over time.`;
  } else {
    message += `All set!`;
  }

  return message;
}

/**
 * Generate the "chaos acknowledgment" message for users who skip organization.
 */
function generateChaosAcknowledgment(unsortedCount: number): string {
  return `No worries — I've marked all ${unsortedCount} contacts as unsorted. We'll work through them over time. Whenever you're ready, just text me "sort my contacts" and I'll help you tackle them a few at a time.`;
}

/**
 * Generate the import summary opening message.
 */
async function generateImportSummaryMessage(
  env: Env,
  totalCount: number,
  unsortedCount: number,
  existingCircles: CircleRow[],
): Promise<string> {
  const circleNames = existingCircles.map(c => c.name).join(', ');
  const hasCustomCircles = existingCircles.some(c => c.type === 'custom');

  let message = `You've got ${totalCount} ${totalCount === 1 ? 'contact' : 'contacts'} now.`;

  if (unsortedCount > 0) {
    if (unsortedCount === totalCount) {
      message += ` None of them are organized into circles yet.`;
    } else {
      message += ` ${unsortedCount} of them aren't in any circle.`;
    }

    message += ` Want me to help you sort them, or would you rather tackle that later?`;
  } else {
    message += ` They're all organized — nice work!`;
  }

  return message;
}

/**
 * Extract circle names from a user message using AI.
 */
async function extractCircleNames(
  env: Env,
  message: string,
  state: ImportFlowState,
): Promise<string[]> {
  // Quick pattern matching for common formats
  const patterns = [
    /(?:^|,|\band\b|\+)\s*([A-Z][a-zA-Z\s]+?)(?=\s*(?:,|and|\+|$))/g,
  ];

  const extracted: string[] = [];

  // Try simple extraction first
  const simpleMatches = message
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 50)
    .filter(s => !s.match(/^(yes|no|ok|sure|yeah|nope|maybe)$/i));

  if (simpleMatches.length > 0) {
    return simpleMatches;
  }

  // Fall back to AI extraction
  const systemPrompt = `
    Extract circle/group names from the user's message. These are categories for organizing contacts.
    
    Common patterns:
    - "DJ clients, college friends, book club"
    - "I have my work people, my gym buddies, and family"
    - "There's the real estate group and the neighborhood association"
    
    Return ONLY a JSON array of strings with the extracted circle names.
    Normalize capitalization (title case).
    Skip default circles (Family, Friends, Work, Community) - we already have those.
    Return empty array [] if no specific circles are mentioned.
    
    Example input: "Well there's my DJ clients obviously, and my book club, plus my old college crew"
    Example output: ["DJ Clients", "Book Club", "College Crew"]
  `;

  try {
    const response = await callAnthropicAPI(env, systemPrompt, [
      { role: 'user', content: message },
    ]);

    const cleaned = response.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.filter(s => typeof s === 'string');
    }
  } catch (err) {
    console.error('[import-flow] Circle extraction failed:', err);
  }

  return [];
}

/**
 * Parse contact names from a user message (for batch assignment).
 */
function parseNamesFromMessage(message: string): string[] {
  // Split by common delimiters
  const names = message
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100)
    // Filter out obvious non-names
    .filter(s => !s.match(/^(and|or|also|plus|\d+|the|my)$/i));

  return names;
}

/**
 * Generate an AI response for ambiguous situations.
 */
async function generateAIResponse(
  env: Env,
  state: ImportFlowState,
  guidance: string,
): Promise<string> {
  const systemPrompt = `
    You are Bethany — a warm, helpful assistant guiding a user through organizing their contacts after a bulk import.
    
    Current stage: ${state.stage}
    Total imported: ${state.totalImported}
    Still unsorted: ${state.unsortedCount - state.assignedContacts.length}
    Circles discovered: ${state.circlesDiscovered.map(c => c.name).join(', ') || 'none yet'}
    Current focus: ${state.currentCircleFocus || 'none'}
    
    CRITICAL RULES FOR SMS:
    - Keep responses to 2-3 sentences max. This is texting.
    - Be warm and non-pressuring.
    - If they seem overwhelmed, offer to skip and sort later.
    - Never sound like a robot or corporate assistant.
    
    GUIDANCE:
    ${guidance}
    
    Respond ONLY with Bethany's message. No metadata.
  `;

  // Build conversation history (last 4 messages for context)
  const recentMessages = state.messages.slice(-4).map(m => ({
    role: m.role === 'bethany' ? 'assistant' as const : 'user' as const,
    content: m.content,
  }));

  return callAnthropicAPI(env, systemPrompt, recentMessages);
}

// ===========================================================================
// Durable Object State Management
// ===========================================================================

/**
 * Store import flow state in Durable Object.
 */
async function storeImportFlowState(
  env: Env,
  userId: string,
  sessionId: string,
  state: ImportFlowState,
): Promise<void> {
  const doId = (env as any).IMPORT_FLOW_DO.idFromName(`${userId}:${sessionId}`);
  const doStub = (env as any).IMPORT_FLOW_DO.get(doId);
  await doStub.fetch(new Request('https://do/state', {
    method: 'PUT',
    body: JSON.stringify(state),
  }));

  // Also store as "latest" for quick lookup
  const latestDoId = (env as any).IMPORT_FLOW_DO.idFromName(`${userId}:latest`);
  const latestDoStub = (env as any).IMPORT_FLOW_DO.get(latestDoId);
  await latestDoStub.fetch(new Request('https://do/state', {
    method: 'PUT',
    body: JSON.stringify({ sessionId }),
  }));
}

/**
 * Load import flow state from Durable Object.
 */
async function loadImportFlowState(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<ImportFlowState | null> {
  const doId = (env as any).IMPORT_FLOW_DO.idFromName(`${userId}:${sessionId}`);
  const doStub = (env as any).IMPORT_FLOW_DO.get(doId);
  const response = await doStub.fetch(new Request('https://do/state'));

  if (response.status === 404) return null;
  return response.json();
}

/**
 * Get the latest session ID for a user.
 */
async function getLatestSessionId(
  env: Env,
  userId: string,
): Promise<string | null> {
  const doId = (env as any).IMPORT_FLOW_DO.idFromName(`${userId}:latest`);
  const doStub = (env as any).IMPORT_FLOW_DO.get(doId);
  const response = await doStub.fetch(new Request('https://do/state'));

  if (response.status === 404) return null;

  const data = await response.json() as { sessionId: string };
  return data.sessionId;
}

// ===========================================================================
// Anthropic API
// ===========================================================================

/**
 * Call the Anthropic API for response generation.
 */
async function callAnthropicAPI(
  env: Env,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [
        { role: 'user', content: '(generate response)' },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[anthropic] API error: ${response.status} — ${errorBody}`);
    throw new Error(`Anthropic API failed: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content.find(b => b.type === 'text');
  return textBlock?.text?.trim() ?? "Let me know how you'd like to proceed with your contacts!";
}

// ===========================================================================
// Durable Object Class
// ===========================================================================

/**
 * ImportFlowDO — Durable Object for import flow session state.
 *
 * Handles GET (load) and PUT (store) requests for session data.
 *
 * Wrangler config:
 *   [[durable_objects.bindings]]
 *   name = "IMPORT_FLOW_DO"
 *   class_name = "ImportFlowDO"
 */
export class ImportFlowDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/state') {
      if (request.method === 'GET') {
        const data = await this.state.storage.get<ImportFlowState | { sessionId: string }>('state');
        if (!data) {
          return new Response(null, { status: 404 });
        }
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'PUT') {
        const body = await request.json();
        await this.state.storage.put('state', body);
        return new Response('ok', { status: 200 });
      }

      if (request.method === 'DELETE') {
        await this.state.storage.delete('state');
        return new Response('ok', { status: 200 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
}
