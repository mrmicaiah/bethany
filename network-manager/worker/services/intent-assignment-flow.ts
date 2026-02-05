/**
 * Intent Assignment Flow — Helping Users Sort Contacts by Relationship Goal
 *
 * Contacts need an intent (inner_circle, nurture, maintain, transactional,
 * dormant) for the nudge system to work. When a contact has a circle but
 * no intent (still 'new'), Bethany surfaces them for sorting.
 *
 * TWO ENTRY POINTS:
 *
 *   1. Weekly Sorting Session (proactive)
 *      - Scheduled cron triggers batch sorting
 *      - Bethany texts: "Hey! I noticed 3 contacts need sorting..."
 *      - User responds to each one in sequence
 *
 *   2. Inline Sorting (reactive)
 *      - User adds a contact via SMS or braindump
 *      - Bethany follows up: "What's the goal with [Name]?"
 *      - Part of the natural conversation flow
 *
 * CONVERSATION FLOW:
 *
 *   [Bethany surfaces unsorted contact]
 *   "Mike Johnson (Golf Buddies) — what's the goal here?
 *    Stay in touch casually, deepen the relationship, or just keep him on file?"
 *   ↓
 *   [User responds: "casual" or "stay in touch"]
 *   ↓
 *   [Bethany maps to 'maintain', confirms, moves to next contact]
 *   "Got it — maintain it is. I'll nudge you monthly. Next up..."
 *
 * INTENT MAPPING:
 *
 *   The user speaks naturally; Bethany maps to intent types:
 *
 *   inner_circle:
 *     - "family" (when it's a non-kin close relationship)
 *     - "closest", "best friend", "my person", "weekly"
 *
 *   nurture:
 *     - "deepen", "grow", "invest", "build"
 *     - "strategic" (business relationships to cultivate)
 *     - "getting closer", "want to know better"
 *
 *   maintain:
 *     - "casual", "stay in touch", "keep warm"
 *     - "monthly", "check in sometimes"
 *     - "don't want to lose touch"
 *
 *   transactional:
 *     - "professional", "business", "networking"
 *     - "when I need something", "useful contact"
 *     - "quarterly", "occasional"
 *
 *   dormant:
 *     - "keep on file", "not now", "pause"
 *     - "don't remind me", "archive"
 *     - "maybe later", "not a priority"
 *
 * CIRCLE-BASED SUGGESTIONS:
 *
 *   When user is unsure ("I don't know", "not sure", "?"), Bethany
 *   suggests based on the circle:
 *
 *   - Family → inner_circle or maintain (ask if they're close)
 *   - Friends → nurture or maintain (ask about investment level)
 *   - Work → nurture or transactional (ask about strategic value)
 *   - Community → maintain (default social cadence)
 *   - Custom circles → maintain (safe default)
 *
 * STATE MANAGEMENT:
 *
 *   IntentSortingDO (Durable Object) tracks:
 *   - Queue of contacts to sort
 *   - Current contact being discussed
 *   - Session start time (expires after 30 minutes)
 *
 * @see worker/services/contact-service.ts for contact updates
 * @see shared/intent-config.ts for intent configurations
 * @see worker/services/conversation-router.ts for routing integration
 */

import type { Env } from '../../shared/types';
import type { UserRow, ContactRow, IntentType, CircleRow } from '../../shared/models';
import { INTENT_CONFIGS } from '../../shared/intent-config';
import { updateContact, listContacts } from './contact-service';

// ===========================================================================
// Types
// ===========================================================================

/**
 * A contact pending intent assignment.
 */
export interface UnsortedContact {
  contactId: string;
  name: string;
  circles: Array<{ id: string; name: string }>;
  notes: string | null;
  createdAt: string;
}

/**
 * State for an active intent sorting session.
 */
export interface IntentSortingState {
  userId: string;
  queue: UnsortedContact[];
  currentIndex: number;
  startedAt: string;
  lastMessageAt: string;
}

/**
 * Result of parsing user's intent response.
 */
export type IntentParseResult =
  | { type: 'intent'; intent: IntentType; confidence: 'high' | 'medium' }
  | { type: 'unsure' }
  | { type: 'skip' }
  | { type: 'stop' }
  | { type: 'unclear' };

/**
 * Circle-based intent suggestion.
 */
export interface IntentSuggestion {
  suggestedIntent: IntentType;
  reason: string;
  alternativeIntent?: IntentType;
  alternativeReason?: string;
}

// ===========================================================================
// Query Unsorted Contacts
// ===========================================================================

/**
 * Get contacts that have at least one circle but still have 'new' intent.
 * These are the contacts that need sorting.
 *
 * @param env    - Worker environment bindings
 * @param userId - The user whose contacts to check
 * @param limit  - Maximum contacts to return (default: 10)
 */
export async function getUnsortedContacts(
  env: Env,
  userId: string,
  limit: number = 10,
): Promise<UnsortedContact[]> {
  // Query contacts with intent='new' that have at least one circle
  const { results } = await env.DB
    .prepare(
      `SELECT DISTINCT c.id, c.name, c.notes, c.created_at
       FROM contacts c
       INNER JOIN contact_circles cc ON c.id = cc.contact_id
       WHERE c.user_id = ?
         AND c.intent = 'new'
         AND c.archived = 0
       ORDER BY c.created_at ASC
       LIMIT ?`
    )
    .bind(userId, limit)
    .all<{ id: string; name: string; notes: string | null; created_at: string }>();

  if (results.length === 0) return [];

  // Batch fetch circles for these contacts
  const contactIds = results.map(c => c.id);
  const placeholders = contactIds.map(() => '?').join(', ');

  const { results: circleRows } = await env.DB
    .prepare(
      `SELECT cc.contact_id, cir.id, cir.name
       FROM contact_circles cc
       INNER JOIN circles cir ON cc.circle_id = cir.id
       WHERE cc.contact_id IN (${placeholders})
       ORDER BY cir.sort_order`
    )
    .bind(...contactIds)
    .all<{ contact_id: string; id: string; name: string }>();

  // Group circles by contact
  const circleMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of circleRows) {
    const existing = circleMap.get(row.contact_id) ?? [];
    existing.push({ id: row.id, name: row.name });
    circleMap.set(row.contact_id, existing);
  }

  return results.map(c => ({
    contactId: c.id,
    name: c.name,
    circles: circleMap.get(c.id) ?? [],
    notes: c.notes,
    createdAt: c.created_at,
  }));
}

/**
 * Get count of unsorted contacts for a user.
 * Useful for deciding whether to trigger a sorting session.
 */
export async function getUnsortedContactCount(
  env: Env,
  userId: string,
): Promise<number> {
  const result = await env.DB
    .prepare(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM contacts c
       INNER JOIN contact_circles cc ON c.id = cc.contact_id
       WHERE c.user_id = ?
         AND c.intent = 'new'
         AND c.archived = 0`
    )
    .bind(userId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ===========================================================================
// Intent Parsing
// ===========================================================================

/**
 * Parse user's response to determine their intended relationship goal.
 *
 * Uses keyword matching with semantic understanding. Claude-powered
 * parsing could be added for ambiguous cases, but most responses
 * are clear enough for keyword matching.
 *
 * @param userMessage - The user's reply text
 */
export function parseIntentResponse(userMessage: string): IntentParseResult {
  const lower = userMessage.toLowerCase().trim();

  // Stop signals — user wants to exit the session
  const stopSignals = [
    'stop', 'done', 'enough', 'later', 'exit', 'quit', 'bye',
    'that\'s all', 'thats all', 'no more', 'finished',
  ];
  if (stopSignals.some(s => lower === s || lower.startsWith(s + ' '))) {
    return { type: 'stop' };
  }

  // Skip signals — skip this contact for now
  const skipSignals = [
    'skip', 'next', 'pass', 'idk', 'not sure yet', 'come back to',
  ];
  if (skipSignals.some(s => lower.includes(s))) {
    return { type: 'skip' };
  }

  // Unsure signals — ask for suggestion
  const unsureSignals = [
    'not sure', 'don\'t know', 'dont know', 'i don\'t know', 'i dont know',
    'unsure', 'help', 'suggest', 'what do you think', '?', 'idk',
    'hmm', 'hm', 'um',
  ];
  if (unsureSignals.some(s => lower === s || lower.includes(s))) {
    return { type: 'unsure' };
  }

  // Inner circle signals
  const innerCircleSignals = [
    'inner circle', 'inner-circle', 'innercircle',
    'closest', 'best friend', 'bestie', 'my person', 'ride or die',
    'weekly', 'every week', 'talk all the time', 'super close',
    'like family', 'chosen family', 'core',
  ];
  if (innerCircleSignals.some(s => lower.includes(s))) {
    return { type: 'intent', intent: 'inner_circle', confidence: 'high' };
  }

  // Nurture signals
  const nurtureSignals = [
    'nurture', 'deepen', 'grow', 'invest', 'build',
    'getting closer', 'want to know better', 'developing',
    'strategic', 'cultivate', 'important relationship',
    'working on', 'biweekly', 'every two weeks', 'every couple weeks',
  ];
  if (nurtureSignals.some(s => lower.includes(s))) {
    return { type: 'intent', intent: 'nurture', confidence: 'high' };
  }

  // Maintain signals
  const maintainSignals = [
    'maintain', 'casual', 'stay in touch', 'keep warm', 'keep in touch',
    'monthly', 'every month', 'check in sometimes', 'occasional',
    'don\'t want to lose touch', 'dont want to lose', 'keep the connection',
    'friendly', 'catch up sometimes', 'low key',
  ];
  if (maintainSignals.some(s => lower.includes(s))) {
    return { type: 'intent', intent: 'maintain', confidence: 'high' };
  }

  // Transactional signals
  const transactionalSignals = [
    'transactional', 'professional', 'business', 'networking',
    'when i need', 'useful', 'contact for', 'resource',
    'quarterly', 'every few months', 'as needed', 'when relevant',
    'work contact', 'industry', 'referral',
  ];
  if (transactionalSignals.some(s => lower.includes(s))) {
    return { type: 'intent', intent: 'transactional', confidence: 'high' };
  }

  // Dormant signals
  const dormantSignals = [
    'dormant', 'keep on file', 'on file', 'not now', 'pause',
    'don\'t remind', 'dont remind', 'archive', 'back burner',
    'maybe later', 'not a priority', 'not right now', 'hold off',
    'no need', 'forget about', 'ignore',
  ];
  if (dormantSignals.some(s => lower.includes(s))) {
    return { type: 'intent', intent: 'dormant', confidence: 'high' };
  }

  // Number-based shortcuts (1-5)
  const numberMap: Record<string, IntentType> = {
    '1': 'inner_circle',
    '2': 'nurture',
    '3': 'maintain',
    '4': 'transactional',
    '5': 'dormant',
  };
  if (numberMap[lower]) {
    return { type: 'intent', intent: numberMap[lower], confidence: 'high' };
  }

  // Single word shortcuts
  const wordMap: Record<string, IntentType> = {
    'close': 'inner_circle',
    'grow': 'nurture',
    'invest': 'nurture',
    'casual': 'maintain',
    'warm': 'maintain',
    'pro': 'transactional',
    'work': 'transactional',
    'pause': 'dormant',
    'file': 'dormant',
  };
  if (wordMap[lower]) {
    return { type: 'intent', intent: wordMap[lower], confidence: 'medium' };
  }

  return { type: 'unclear' };
}

// ===========================================================================
// Circle-Based Suggestions
// ===========================================================================

/**
 * Suggest an intent based on the contact's circle(s).
 *
 * When the user is unsure, Bethany makes an educated guess based on
 * which circle(s) the contact belongs to.
 *
 * @param circles - The contact's circle names
 */
export function suggestIntentFromCircles(
  circles: Array<{ id: string; name: string }>,
): IntentSuggestion {
  if (circles.length === 0) {
    return {
      suggestedIntent: 'maintain',
      reason: "No circles — I'd guess monthly check-ins until you tell me more",
    };
  }

  const circleNames = circles.map(c => c.name.toLowerCase());

  // Family circle
  if (circleNames.some(n => n.includes('family'))) {
    return {
      suggestedIntent: 'maintain',
      reason: 'Family usually stays connected naturally — monthly check-ins work well',
      alternativeIntent: 'inner_circle',
      alternativeReason: 'unless they\'re someone you talk to every week',
    };
  }

  // Friends circle
  if (circleNames.some(n => n.includes('friend'))) {
    return {
      suggestedIntent: 'nurture',
      reason: 'Friendships grow with regular investment — I\'d suggest every couple weeks',
      alternativeIntent: 'maintain',
      alternativeReason: 'or monthly if it\'s more of a casual friendship',
    };
  }

  // Work circle
  if (circleNames.some(n => n.includes('work') || n.includes('colleague') || n.includes('coworker'))) {
    return {
      suggestedIntent: 'transactional',
      reason: 'Work contacts usually need attention as-needed, not on a schedule',
      alternativeIntent: 'nurture',
      alternativeReason: 'unless you\'re actively building this relationship',
    };
  }

  // Community / church / neighborhood
  if (circleNames.some(n =>
    n.includes('community') || n.includes('church') ||
    n.includes('neighbor') || n.includes('club') ||
    n.includes('group')
  )) {
    return {
      suggestedIntent: 'maintain',
      reason: 'Community connections stay warm with monthly touchpoints',
    };
  }

  // Sports / hobby circles
  if (circleNames.some(n =>
    n.includes('golf') || n.includes('tennis') || n.includes('gym') ||
    n.includes('sport') || n.includes('hobby') || n.includes('team')
  )) {
    return {
      suggestedIntent: 'maintain',
      reason: 'Activity buddies usually see each other through the activity — monthly check-ins fill the gaps',
    };
  }

  // Default for custom circles
  return {
    suggestedIntent: 'maintain',
    reason: 'Monthly check-ins are a solid default — you can always adjust later',
  };
}

// ===========================================================================
// Message Generation
// ===========================================================================

/**
 * Generate Bethany's question for a single contact.
 */
export function generateSortingQuestion(contact: UnsortedContact): string {
  const circleList = contact.circles.map(c => c.name).join(', ') || 'no circles';
  const contextNote = contact.notes ? ` (${truncate(contact.notes, 30)})` : '';

  return `${contact.name} (${circleList})${contextNote} — what's the goal here?\n` +
    `Stay in touch casually, deepen the relationship, or just keep them on file?`;
}

/**
 * Generate the intro message for a batch sorting session.
 */
export function generateBatchSortingIntro(contacts: UnsortedContact[]): string {
  const count = contacts.length;

  if (count === 1) {
    return `Hey! I noticed ${contacts[0].name} still needs sorting. Quick question:\n\n` +
      generateSortingQuestion(contacts[0]);
  }

  const preview = contacts.slice(0, 3).map(c => c.name).join(', ');
  const andMore = count > 3 ? ` and ${count - 3} more` : '';

  return `Hey! I've got ${count} contacts that need sorting: ${preview}${andMore}.\n\n` +
    `Let's knock these out — I'll ask about each one.\n\n` +
    `First up:\n${generateSortingQuestion(contacts[0])}`;
}

/**
 * Generate confirmation message after assigning an intent.
 */
export function generateConfirmation(
  contact: UnsortedContact,
  intent: IntentType,
  hasMore: boolean,
  nextContact?: UnsortedContact,
): string {
  const config = INTENT_CONFIGS[intent];
  const cadenceNote = config.defaultCadenceDays
    ? ` I'll nudge you every ${formatCadence(config.defaultCadenceDays)}.`
    : '';

  let message = `Got it — ${contact.name} is now ${config.label}.${cadenceNote}`;

  if (hasMore && nextContact) {
    message += `\n\nNext up:\n${generateSortingQuestion(nextContact)}`;
  } else if (!hasMore) {
    message += `\n\nThat's everyone! Your contacts are all sorted. 🎉`;
  }

  return message;
}

/**
 * Generate suggestion message when user is unsure.
 */
export function generateSuggestionMessage(
  contact: UnsortedContact,
  suggestion: IntentSuggestion,
): string {
  let message = `Since ${contact.name} is in ${contact.circles[0]?.name ?? 'your network'}, ` +
    `I'd guess ${INTENT_CONFIGS[suggestion.suggestedIntent].label} — ${suggestion.reason}`;

  if (suggestion.alternativeIntent) {
    message += `\n\nOr ${INTENT_CONFIGS[suggestion.alternativeIntent].label} ${suggestion.alternativeReason}`;
  }

  message += `\n\nSound right? Or tell me what works better.`;

  return message;
}

/**
 * Generate skip confirmation.
 */
export function generateSkipMessage(
  contact: UnsortedContact,
  hasMore: boolean,
  nextContact?: UnsortedContact,
): string {
  let message = `Skipped ${contact.name} for now — I'll ask again later.`;

  if (hasMore && nextContact) {
    message += `\n\nNext up:\n${generateSortingQuestion(nextContact)}`;
  } else if (!hasMore) {
    message += `\n\nThat's everyone for now!`;
  }

  return message;
}

/**
 * Generate clarification request when response is unclear.
 */
export function generateClarificationMessage(contact: UnsortedContact): string {
  return `I didn't quite catch that for ${contact.name}. Try one of these:\n\n` +
    `• "close" or "inner circle" — your closest people (weekly)\n` +
    `• "nurture" or "invest" — relationships you're growing (biweekly)\n` +
    `• "casual" or "maintain" — stay in touch (monthly)\n` +
    `• "professional" — as-needed basis (quarterly)\n` +
    `• "dormant" or "file" — pause reminders\n\n` +
    `Or say "skip" to come back to this one later.`;
}

/**
 * Generate session end message.
 */
export function generateStopMessage(remaining: number): string {
  if (remaining === 0) {
    return `All done! Your contacts are sorted. I'll start nudging you based on the cadences we set.`;
  }

  return `Got it, we'll pick this up later. ${remaining} contact${remaining === 1 ? '' : 's'} still need${remaining === 1 ? 's' : ''} sorting — I'll remind you.`;
}

// ===========================================================================
// Session Handler
// ===========================================================================

/**
 * Handle user's response during an active sorting session.
 *
 * Called by the conversation router when pending context is 'intent_sorting'.
 *
 * @param env     - Worker environment bindings
 * @param user    - The user
 * @param message - Their reply text
 * @param state   - Current sorting session state
 */
export async function handleSortingResponse(
  env: Env,
  user: UserRow,
  message: string,
  state: IntentSortingState,
): Promise<{
  reply: string;
  expectsReply: boolean;
  newState: IntentSortingState | null;
}> {
  const currentContact = state.queue[state.currentIndex];
  if (!currentContact) {
    return {
      reply: 'Looks like we\'ve gone through everyone! Your contacts are sorted.',
      expectsReply: false,
      newState: null,
    };
  }

  const parseResult = parseIntentResponse(message);

  switch (parseResult.type) {
    case 'intent': {
      // Assign the intent
      await updateContact(env.DB, user.id, currentContact.contactId, {
        intent: parseResult.intent,
      });

      // Advance to next contact
      const newIndex = state.currentIndex + 1;
      const hasMore = newIndex < state.queue.length;
      const nextContact = hasMore ? state.queue[newIndex] : undefined;

      const newState: IntentSortingState | null = hasMore
        ? {
            ...state,
            currentIndex: newIndex,
            lastMessageAt: new Date().toISOString(),
          }
        : null;

      return {
        reply: generateConfirmation(currentContact, parseResult.intent, hasMore, nextContact),
        expectsReply: hasMore,
        newState,
      };
    }

    case 'unsure': {
      // Suggest based on circles
      const suggestion = suggestIntentFromCircles(currentContact.circles);
      return {
        reply: generateSuggestionMessage(currentContact, suggestion),
        expectsReply: true,
        newState: {
          ...state,
          lastMessageAt: new Date().toISOString(),
        },
      };
    }

    case 'skip': {
      // Move to next, put this one at end of queue
      const reorderedQueue = [
        ...state.queue.slice(0, state.currentIndex),
        ...state.queue.slice(state.currentIndex + 1),
        currentContact,
      ];
      const hasMore = state.currentIndex < reorderedQueue.length - 1;
      const nextContact = hasMore ? reorderedQueue[state.currentIndex] : undefined;

      const newState: IntentSortingState | null = hasMore
        ? {
            ...state,
            queue: reorderedQueue,
            lastMessageAt: new Date().toISOString(),
          }
        : null;

      return {
        reply: generateSkipMessage(currentContact, hasMore, nextContact),
        expectsReply: hasMore,
        newState,
      };
    }

    case 'stop': {
      const remaining = state.queue.length - state.currentIndex;
      return {
        reply: generateStopMessage(remaining),
        expectsReply: false,
        newState: null,
      };
    }

    case 'unclear':
    default: {
      return {
        reply: generateClarificationMessage(currentContact),
        expectsReply: true,
        newState: {
          ...state,
          lastMessageAt: new Date().toISOString(),
        },
      };
    }
  }
}

// ===========================================================================
// Session Initiation
// ===========================================================================

/**
 * Start a new sorting session for a user.
 *
 * Called by the weekly cron or when manually triggered.
 *
 * @param env    - Worker environment bindings
 * @param userId - The user to start sorting for
 * @param limit  - Maximum contacts to include in session
 */
export async function startSortingSession(
  env: Env,
  userId: string,
  limit: number = 10,
): Promise<{
  initialMessage: string;
  state: IntentSortingState;
} | null> {
  const unsorted = await getUnsortedContacts(env, userId, limit);

  if (unsorted.length === 0) {
    return null; // Nothing to sort
  }

  const state: IntentSortingState = {
    userId,
    queue: unsorted,
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
  };

  return {
    initialMessage: generateBatchSortingIntro(unsorted),
    state,
  };
}

/**
 * Generate an inline sorting question for a single contact.
 *
 * Used after adding a contact via SMS to immediately ask about intent.
 *
 * @param contact - The contact to ask about
 */
export function generateInlineSortingQuestion(contact: UnsortedContact): string {
  if (contact.circles.length === 0) {
    return `What's the goal with ${contact.name}? ` +
      `Stay in touch casually, deepen the relationship, or just keep them on file?`;
  }

  return generateSortingQuestion(contact);
}

// ===========================================================================
// Durable Object for Session State
// ===========================================================================

/**
 * IntentSortingDO — Stores active intent sorting sessions.
 *
 * Sessions expire after 30 minutes of inactivity.
 *
 * Wrangler config:
 *   [[durable_objects.bindings]]
 *   name = "INTENT_SORTING_DO"
 *   class_name = "IntentSortingDO"
 */
export class IntentSortingDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/session') {
      if (request.method === 'GET') {
        const data = await this.state.storage.get<IntentSortingState>('session');
        if (!data) {
          return new Response(null, { status: 404 });
        }

        // Check expiration (30 minutes)
        const lastMessage = new Date(data.lastMessageAt).getTime();
        if (Date.now() - lastMessage > 30 * 60 * 1000) {
          await this.state.storage.delete('session');
          return new Response(null, { status: 404 });
        }

        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'PUT') {
        const body = await request.json() as IntentSortingState;
        await this.state.storage.put('session', body);
        return new Response('ok', { status: 200 });
      }

      if (request.method === 'DELETE') {
        await this.state.storage.delete('session');
        return new Response('ok', { status: 200 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
}

// ===========================================================================
// Session State Management
// ===========================================================================

/**
 * Get active sorting session for a user.
 */
export async function getActiveSortingSession(
  env: Env,
  userId: string,
): Promise<IntentSortingState | null> {
  try {
    const doId = (env as any).INTENT_SORTING_DO?.idFromName(userId);
    if (!doId) return null;

    const doStub = (env as any).INTENT_SORTING_DO.get(doId);
    const response = await doStub.fetch(new Request('https://do/session'));

    if (response.status === 404) return null;

    return await response.json() as IntentSortingState;
  } catch {
    return null;
  }
}

/**
 * Store sorting session state.
 */
export async function storeSortingSession(
  env: Env,
  userId: string,
  state: IntentSortingState,
): Promise<void> {
  try {
    const doId = (env as any).INTENT_SORTING_DO?.idFromName(userId);
    if (!doId) return;

    const doStub = (env as any).INTENT_SORTING_DO.get(doId);
    await doStub.fetch(new Request('https://do/session', {
      method: 'PUT',
      body: JSON.stringify(state),
    }));
  } catch (err) {
    console.error('[intent-sorting] Failed to store session:', err);
  }
}

/**
 * Clear sorting session.
 */
export async function clearSortingSession(
  env: Env,
  userId: string,
): Promise<void> {
  try {
    const doId = (env as any).INTENT_SORTING_DO?.idFromName(userId);
    if (!doId) return;

    const doStub = (env as any).INTENT_SORTING_DO.get(doId);
    await doStub.fetch(new Request('https://do/session', { method: 'DELETE' }));
  } catch {
    // Ignore cleanup failures
  }
}

// ===========================================================================
// Utility Functions
// ===========================================================================

/**
 * Format cadence days as human-readable text.
 */
function formatCadence(days: number): string {
  if (days === 1) return 'day';
  if (days === 7) return 'week';
  if (days === 14) return 'couple weeks';
  if (days === 30) return 'month';
  if (days === 90) return 'quarter';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

/**
 * Truncate text with ellipsis.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
