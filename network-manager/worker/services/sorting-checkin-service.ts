/**
 * Sorting Check-in Service — Weekly Proactive Outreach for Unsorted Contacts
 *
 * This service implements the weekly sorting check-in flow:
 *
 *   1. Query users who have unsorted or intent-less contacts
 *   2. Check they haven't received a sorting offer recently
 *   3. Send a friendly check-in via SMS
 *   4. Offer choice: sort via SMS or dashboard
 *   5. Track last_sorting_offer to avoid spamming
 *
 * Tier Limits:
 *
 *   - Free users: Can sort up to 5 contacts per week via SMS
 *   - Premium users: Unlimited sorting
 *
 * Integration:
 *
 *   Called by the Monday 9am UTC cron job in scheduled.ts.
 *   Works alongside bulk-import-flow.ts and intent-assignment-flow.ts.
 *
 * @see worker/cron/scheduled.ts for cron trigger
 * @see worker/services/bulk-import-flow.ts for post-import sorting
 * @see worker/services/intent-assignment-flow.ts for contact-by-contact sorting
 */

import type { Env } from '../../shared/types';
import type { UserRow, IntentType } from '../../shared/models';

// ===========================================================================
// Configuration
// ===========================================================================

/** Minimum days between sorting offers to the same user */
const MIN_DAYS_BETWEEN_OFFERS = 7;

/** Maximum users to process per cron run (rate limiting) */
const MAX_USERS_PER_RUN = 100;

/** Free tier weekly sorting limit */
const FREE_WEEKLY_SORTING_LIMIT = 5;

// ===========================================================================
// Types
// ===========================================================================

/**
 * Stats about a user's unsorted contacts.
 */
export interface UnsortedContactStats {
  /** Contacts with intent = 'new' (never sorted) */
  unsortedCount: number;
  /** Contacts with no intent assigned (shouldn't happen but defensive) */
  noIntentCount: number;
  /** Total needing attention */
  totalNeedingSorting: number;
}

/**
 * Result from processing sorting check-ins.
 */
export interface SortingCheckinResult {
  usersProcessed: number;
  checkInsSent: number;
  usersSkipped: number;
  errors: number;
}

/**
 * User eligible for sorting check-in.
 */
interface EligibleUser {
  id: string;
  phone: string;
  name: string;
  subscriptionTier: string;
  unsortedCount: number;
  noIntentCount: number;
}

// ===========================================================================
// Main Entry Point
// ===========================================================================

/**
 * Process weekly sorting check-ins for all eligible users.
 *
 * Called by the Monday cron job. Finds users with unsorted contacts
 * who haven't received a sorting offer in the past week, then sends
 * them a friendly check-in message.
 *
 * @param env - Worker environment bindings
 * @param now - Override current time (for testing)
 */
export async function processWeeklySortingCheckins(
  env: Env,
  now?: Date,
): Promise<SortingCheckinResult> {
  const currentTime = now ?? new Date();
  const db = env.DB;

  const result: SortingCheckinResult = {
    usersProcessed: 0,
    checkInsSent: 0,
    usersSkipped: 0,
    errors: 0,
  };

  // Find eligible users
  const eligibleUsers = await getEligibleUsers(db, currentTime, MAX_USERS_PER_RUN);

  for (const user of eligibleUsers) {
    result.usersProcessed++;

    try {
      // Build and send the check-in message
      const message = buildCheckinMessage(
        user.name,
        user.unsortedCount,
        user.noIntentCount,
        user.subscriptionTier,
        env.DASHBOARD_URL ?? 'https://app.untitledpublishers.com',
      );

      // Send via SendBlue
      const sent = await sendCheckinSms(env, user.phone, message);

      if (sent) {
        // Update last_sorting_offer timestamp
        await db
          .prepare(
            `UPDATE users SET last_sorting_offer = ? WHERE id = ?`
          )
          .bind(currentTime.toISOString(), user.id)
          .run();

        result.checkInsSent++;
      } else {
        result.errors++;
      }
    } catch (err) {
      console.error(`[sorting-checkin] Error for user ${user.id}:`, err);
      result.errors++;
    }
  }

  // Count skipped users (had unsorted but recently offered)
  result.usersSkipped = await countRecentlyOfferedUsers(db, currentTime);

  return result;
}

// ===========================================================================
// User Queries
// ===========================================================================

/**
 * Find users eligible for a sorting check-in.
 *
 * Criteria:
 *   - Has at least one contact with intent = 'new' OR no circles
 *   - Hasn't received a sorting offer in the past MIN_DAYS_BETWEEN_OFFERS days
 *   - Is not in onboarding (onboarding_stage is null)
 */
async function getEligibleUsers(
  db: D1Database,
  now: Date,
  limit: number,
): Promise<EligibleUser[]> {
  const cutoffDate = new Date(now.getTime() - MIN_DAYS_BETWEEN_OFFERS * 24 * 60 * 60 * 1000);

  // Query for users with unsorted contacts who haven't been offered recently
  const { results } = await db
    .prepare(`
      SELECT 
        u.id,
        u.phone,
        u.name,
        u.subscription_tier as subscriptionTier,
        (
          SELECT COUNT(*)
          FROM contacts c
          WHERE c.user_id = u.id
            AND c.archived = 0
            AND c.intent = 'new'
        ) as unsortedCount,
        (
          SELECT COUNT(*)
          FROM contacts c
          WHERE c.user_id = u.id
            AND c.archived = 0
            AND NOT EXISTS (
              SELECT 1 FROM contact_circles cc WHERE cc.contact_id = c.id
            )
            AND c.intent != 'new'
        ) as noIntentCount
      FROM users u
      WHERE u.onboarding_stage IS NULL
        AND (u.last_sorting_offer IS NULL OR u.last_sorting_offer < ?)
      HAVING unsortedCount > 0 OR noIntentCount > 0
      LIMIT ?
    `)
    .bind(cutoffDate.toISOString(), limit)
    .all<EligibleUser>();

  return results;
}

/**
 * Count users who have unsorted contacts but were recently offered.
 */
async function countRecentlyOfferedUsers(
  db: D1Database,
  now: Date,
): Promise<number> {
  const cutoffDate = new Date(now.getTime() - MIN_DAYS_BETWEEN_OFFERS * 24 * 60 * 60 * 1000);

  const result = await db
    .prepare(`
      SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      WHERE u.last_sorting_offer >= ?
        AND EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.user_id = u.id
            AND c.archived = 0
            AND (c.intent = 'new' OR NOT EXISTS (
              SELECT 1 FROM contact_circles cc WHERE cc.contact_id = c.id
            ))
        )
    `)
    .bind(cutoffDate.toISOString())
    .first<{ count: number }>();

  return result?.count ?? 0;
}

// ===========================================================================
// Message Building
// ===========================================================================

/**
 * Build the sorting check-in message.
 *
 * Friendly, conversational tone. Offers choice of SMS or dashboard.
 */
function buildCheckinMessage(
  userName: string,
  unsortedCount: number,
  noIntentCount: number,
  subscriptionTier: string,
  dashboardUrl: string,
): string {
  const total = unsortedCount + noIntentCount;
  const isFree = subscriptionTier === 'free';

  // Build the counts description
  let countsDescription: string;
  if (unsortedCount > 0 && noIntentCount > 0) {
    countsDescription = `${unsortedCount} contact${unsortedCount === 1 ? '' : 's'} I haven't placed yet, and ${noIntentCount} without a clear goal`;
  } else if (unsortedCount > 0) {
    countsDescription = `${unsortedCount} contact${unsortedCount === 1 ? '' : 's'} I haven't placed yet`;
  } else {
    countsDescription = `${noIntentCount} contact${noIntentCount === 1 ? '' : 's'} without a clear goal`;
  }

  // Opening line
  let message = `Hey ${userName}! You've got ${countsDescription}. Want to sort through a few?`;

  // Offer options
  message += `\n\nYou can do it here by replying "sort" — or head to your dashboard: ${dashboardUrl}/contacts?filter=unsorted`;

  // Free tier note
  if (isFree && total > FREE_WEEKLY_SORTING_LIMIT) {
    message += `\n\n(Free plan: ${FREE_WEEKLY_SORTING_LIMIT} contacts/week via text. Upgrade for unlimited sorting!)`;
  }

  return message;
}

// ===========================================================================
// SMS Delivery
// ===========================================================================

/**
 * Send the check-in SMS via SendBlue.
 */
async function sendCheckinSms(
  env: Env,
  phone: string,
  message: string,
): Promise<boolean> {
  try {
    const response = await fetch('https://api.sendblue.co/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': env.SENDBLUE_API_KEY,
        'sb-api-secret-key': env.SENDBLUE_API_SECRET,
      },
      body: JSON.stringify({
        number: phone,
        content: message,
        send_style: 'regular',
      }),
    });

    if (!response.ok) {
      console.error('[sorting-checkin] SendBlue error:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('[sorting-checkin] SMS send failed:', err);
    return false;
  }
}

// ===========================================================================
// Direct Query Helpers (for API/Dashboard use)
// ===========================================================================

/**
 * Get unsorted contact stats for a specific user.
 *
 * Used by the dashboard to show "X contacts need sorting" badges.
 */
export async function getUnsortedStats(
  db: D1Database,
  userId: string,
): Promise<UnsortedContactStats> {
  const unsortedResult = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM contacts
      WHERE user_id = ? AND archived = 0 AND intent = 'new'
    `)
    .bind(userId)
    .first<{ count: number }>();

  const noCirclesResult = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM contacts c
      WHERE c.user_id = ?
        AND c.archived = 0
        AND c.intent != 'new'
        AND NOT EXISTS (
          SELECT 1 FROM contact_circles cc WHERE cc.contact_id = c.id
        )
    `)
    .bind(userId)
    .first<{ count: number }>();

  const unsortedCount = unsortedResult?.count ?? 0;
  const noIntentCount = noCirclesResult?.count ?? 0;

  return {
    unsortedCount,
    noIntentCount,
    totalNeedingSorting: unsortedCount + noIntentCount,
  };
}

/**
 * Check if a user can sort more contacts this week (free tier limit).
 *
 * @param db     - D1 database binding
 * @param userId - The user's ID
 * @param now    - Override current time (for testing)
 * @returns Number of contacts they can still sort this week
 */
export async function getWeeklySortingQuota(
  db: D1Database,
  userId: string,
  now?: Date,
): Promise<{ limit: number; used: number; remaining: number }> {
  const currentTime = now ?? new Date();

  // Get user's subscription tier
  const user = await db
    .prepare('SELECT subscription_tier FROM users WHERE id = ?')
    .bind(userId)
    .first<{ subscription_tier: string }>();

  if (!user || user.subscription_tier !== 'free') {
    // Premium/trial users have unlimited
    return { limit: Infinity, used: 0, remaining: Infinity };
  }

  // Count contacts sorted this week (intent changed from 'new' in last 7 days)
  // We track this by looking at contacts where updated_at is recent and intent != 'new'
  // This is an approximation — a more accurate approach would be a dedicated tracking table
  const weekStart = new Date(currentTime);
  weekStart.setDate(weekStart.getDate() - 7);

  const sortedThisWeek = await db
    .prepare(`
      SELECT COUNT(*) as count
      FROM contacts
      WHERE user_id = ?
        AND intent != 'new'
        AND source = 'import'
        AND updated_at >= ?
    `)
    .bind(userId, weekStart.toISOString())
    .first<{ count: number }>();

  const used = sortedThisWeek?.count ?? 0;
  const remaining = Math.max(0, FREE_WEEKLY_SORTING_LIMIT - used);

  return {
    limit: FREE_WEEKLY_SORTING_LIMIT,
    used,
    remaining,
  };
}

/**
 * Mark that a user has been offered sorting (for manual triggers).
 */
export async function markSortingOffered(
  db: D1Database,
  userId: string,
  now?: Date,
): Promise<void> {
  const currentTime = now ?? new Date();
  await db
    .prepare('UPDATE users SET last_sorting_offer = ? WHERE id = ?')
    .bind(currentTime.toISOString(), userId)
    .run();
}
