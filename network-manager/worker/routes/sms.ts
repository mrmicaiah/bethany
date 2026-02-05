/**
 * SMS Webhook Route — SendBlue inbound message handling.
 *
 * Responsibilities:
 *   1. Parse the SendBlue webhook payload (handles multiple formats)
 *   2. Normalize the phone number
 *   3. Look up the sender in D1
 *   4. Route to the correct handler:
 *      - New phone → onboarding flow
 *      - Existing user → main conversation handler
 *      - Locked account → locked account response
 *   5. Return 200 quickly (actual processing via ctx.waitUntil)
 *
 * This is the single entry point for all inbound SMS traffic.
 */

import type { Env } from '../../shared/types';
import type { UserRow } from '../../shared/models';
import { jsonResponse, errorResponse } from '../../shared/http';
import { getUserByPhone, getActivePendingSignup, isAccountLocked } from '../services/user-service';

// ---------------------------------------------------------------------------
// SendBlue Payload Types
// ---------------------------------------------------------------------------

/**
 * SendBlue sends webhooks in slightly different shapes depending on
 * the message type. We normalize all of them.
 */
export interface SendBlueWebhookPayload {
  // Phone number fields (SendBlue uses different keys)
  from_number?: string;
  number?: string;
  // Message content fields
  content?: string;
  message?: string;
  text?: string;
  // Metadata
  media_url?: string;
  is_outbound?: boolean;
  date?: string;
  // Group messaging
  group_id?: string;
  participants?: string[];
}

export interface NormalizedInboundMessage {
  phone: string;         // E.164 format
  body: string;          // Message text
  mediaUrl?: string;     // Attached media URL
  receivedAt: string;    // ISO timestamp
  raw: SendBlueWebhookPayload; // Original payload for debugging
}

// ---------------------------------------------------------------------------
// Routing Result
// ---------------------------------------------------------------------------

export type RoutingDecision =
  | { action: 'onboarding_new'; phone: string; message: NormalizedInboundMessage }
  | { action: 'onboarding_resume'; phone: string; pendingSignupId: string; message: NormalizedInboundMessage }
  | { action: 'conversation'; user: UserRow; message: NormalizedInboundMessage }
  | { action: 'account_locked'; user: UserRow; message: NormalizedInboundMessage }
  | { action: 'ignore'; reason: string };

// ---------------------------------------------------------------------------
// Phone Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a phone number to E.164 format.
 * Handles common SendBlue variations.
 */
export function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  let cleaned = raw.replace(/[^\d+]/g, '');

  // If it starts with +, keep it; otherwise assume US
  if (!cleaned.startsWith('+')) {
    // Strip leading 1 if 11 digits (US country code)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else {
      // Best effort — prepend +
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Payload Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a SendBlue webhook payload into a normalized message.
 * Returns null if the payload is invalid or should be ignored.
 */
export function parseWebhookPayload(
  data: SendBlueWebhookPayload,
): NormalizedInboundMessage | null {
  // Extract phone
  const rawPhone = data.from_number || data.number;
  if (!rawPhone) {
    console.warn('[sms] Webhook missing phone number:', JSON.stringify(data));
    return null;
  }

  // Ignore outbound messages (our own sends echoing back)
  if (data.is_outbound === true) {
    return null;
  }

  // Extract message body
  const body = data.content || data.message || data.text || '';

  // Ignore empty messages (unless there's media)
  if (!body.trim() && !data.media_url) {
    console.warn('[sms] Empty message from', rawPhone);
    return null;
  }

  return {
    phone: normalizePhone(rawPhone),
    body: body.trim(),
    mediaUrl: data.media_url || undefined,
    receivedAt: data.date || new Date().toISOString(),
    raw: data,
  };
}

// ---------------------------------------------------------------------------
// Routing Logic
// ---------------------------------------------------------------------------

/**
 * Given a normalized inbound message, decide what to do with it.
 *
 * Decision tree:
 *   1. Look up phone in users table
 *   2. If found → check if account is locked → route to conversation
 *   3. If not found → check for active pending signup
 *      a. If pending signup exists → resume onboarding
 *      b. If no pending signup → start fresh onboarding
 */
export async function routeInboundMessage(
  db: D1Database,
  message: NormalizedInboundMessage,
): Promise<RoutingDecision> {
  // Step 1: Look up existing user
  const lookup = await getUserByPhone(db, message.phone);

  if (lookup.found) {
    const user = lookup.user;

    // Step 2a: Account locked?
    if (isAccountLocked(user)) {
      console.log(`[sms] Locked account: ${message.phone}`);
      return { action: 'account_locked', user, message };
    }

    // Step 2b: Route to main conversation handler
    console.log(`[sms] Existing user: ${user.name} (${message.phone})`);
    return { action: 'conversation', user, message };
  }

  // Step 3: Not a registered user — check for in-progress onboarding
  const pendingSignup = await getActivePendingSignup(db, message.phone);

  if (pendingSignup) {
    console.log(`[sms] Resuming onboarding for ${message.phone}`);
    return {
      action: 'onboarding_resume',
      phone: message.phone,
      pendingSignupId: pendingSignup.id,
      message,
    };
  }

  // Step 3b: Brand new phone number
  console.log(`[sms] New phone number: ${message.phone}`);
  return { action: 'onboarding_new', phone: message.phone, message };
}

// ---------------------------------------------------------------------------
// Webhook Handler
// ---------------------------------------------------------------------------

/**
 * Handle the /webhook/sms POST endpoint.
 *
 * Returns 200 immediately — actual message processing happens in
 * ctx.waitUntil() so SendBlue doesn't timeout.
 */
export async function handleSmsWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Parse payload
  let data: SendBlueWebhookPayload;
  try {
    data = await request.json() as SendBlueWebhookPayload;
  } catch {
    console.error('[sms] Failed to parse webhook JSON');
    return errorResponse('Invalid JSON', 400);
  }

  // Normalize
  const message = parseWebhookPayload(data);
  if (!message) {
    return jsonResponse({ received: true, processed: false, reason: 'ignored' });
  }

  // Route and dispatch (non-blocking)
  ctx.waitUntil(
    (async () => {
      try {
        const decision = await routeInboundMessage(env.DB, message);

        switch (decision.action) {
          case 'conversation':
            // TODO: TASK — Main conversation handler
            // Forward to Bethany with user context
            console.log(`[sms] → conversation handler for ${decision.user.name}`);
            break;

          case 'onboarding_new':
            // TODO: TASK — Onboarding flow (TASK-36776bae-4)
            console.log(`[sms] → new onboarding for ${decision.phone}`);
            break;

          case 'onboarding_resume':
            // TODO: TASK — Onboarding flow (TASK-36776bae-4)
            console.log(`[sms] → resume onboarding for ${decision.phone}`);
            break;

          case 'account_locked':
            // TODO: TASK — Send locked account response via SendBlue
            console.log(`[sms] → account locked for ${decision.user.name}`);
            break;

          case 'ignore':
            console.log(`[sms] → ignored: ${decision.reason}`);
            break;
        }
      } catch (err) {
        console.error('[sms] Routing error:', err);
      }
    })()
  );

  // Respond immediately so SendBlue doesn't retry
  return jsonResponse({ received: true, processed: true });
}
