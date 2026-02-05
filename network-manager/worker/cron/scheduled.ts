/**
 * Scheduled Jobs — Cloudflare Cron Trigger handlers.
 *
 * Each cron trigger defined in wrangler.toml routes here via the
 * scheduled() export in index.ts. Jobs are lightweight dispatchers
 * that call into the appropriate service functions.
 *
 * Cron schedule (all times UTC):
 *
 *   0 9 * * *    → dailyNudgeGeneration (3am Central) — premium users
 *   0 9 * * 1    → weeklyNudgeGeneration (Monday 3am Central) — free users
 *   0 14 * * *   → nudgeDelivery (8am Central) — send pending nudges
 *   0 0 * * *    → trialExpirationCheck (midnight) — downgrade expired trials
 *   0 0 * * *    → usageDataCleanup (midnight) — purge old usage rows
 *   0 0 * * 0    → healthRecalculation (Sunday midnight) — refresh health statuses
 *
 * Error handling:
 *
 *   Each job catches its own errors and logs them. A failed job doesn't
 *   affect other jobs scheduled at the same time. Cloudflare will retry
 *   failed crons according to its retry policy.
 *
 * @see wrangler.toml [triggers] for cron expressions
 * @see worker/services/subscription-service.ts for processExpiredTrials()
 * @see worker/services/contact-service.ts for recalculateAllHealthStatuses()
 */

import type { Env } from '../../shared/types';
import { processExpiredTrials, purgeOldUsageData } from '../services/subscription-service';
import { recalculateAllHealthStatuses } from '../services/contact-service';

// ===========================================================================
// Types
// ===========================================================================

/**
 * Result from a cron job for logging.
 */
export interface CronJobResult {
  job: string;
  success: boolean;
  duration: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ===========================================================================
// Main Dispatcher
// ===========================================================================

/**
 * Route a scheduled event to the appropriate job handler(s).
 *
 * Called from index.ts scheduled() export. A single cron time can
 * trigger multiple jobs (e.g., midnight runs both trial check and
 * usage cleanup).
 *
 * @param event - Cloudflare ScheduledEvent with cron trigger info
 * @param env   - Worker environment bindings
 * @param ctx   - Execution context for waitUntil
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const trigger = event.cron;
  const results: CronJobResult[] = [];

  console.log(`[cron] Triggered: ${trigger} at ${new Date().toISOString()}`);

  // ─── 9am UTC daily (3am Central) — Premium nudge generation ───
  if (trigger === '0 9 * * *') {
    results.push(await runJob('dailyNudgeGeneration', () => dailyNudgeGeneration(env)));
  }

  // ─── 9am UTC Monday (3am Central Monday) — Free tier weekly nudges ───
  if (trigger === '0 9 * * 1') {
    results.push(await runJob('weeklyNudgeGeneration', () => weeklyNudgeGeneration(env)));
  }

  // ─── 2pm UTC daily (8am Central) — Deliver pending nudges ───
  if (trigger === '0 14 * * *') {
    results.push(await runJob('nudgeDelivery', () => nudgeDelivery(env)));
  }

  // ─── Midnight UTC daily — Trial expiration + usage cleanup ───
  if (trigger === '0 0 * * *') {
    results.push(await runJob('trialExpirationCheck', () => trialExpirationCheck(env)));
    results.push(await runJob('usageDataCleanup', () => usageDataCleanup(env)));
  }

  // ─── Midnight UTC Sunday — Weekly health recalculation ───
  if (trigger === '0 0 * * 0') {
    results.push(await runJob('healthRecalculation', () => healthRecalculation(env)));
  }

  // Log summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`[cron] Completed: ${successful} succeeded, ${failed} failed`);

  for (const result of results) {
    if (result.success) {
      console.log(`[cron] ✓ ${result.job} (${result.duration}ms)`, result.details);
    } else {
      console.error(`[cron] ✗ ${result.job} (${result.duration}ms):`, result.error);
    }
  }
}

// ===========================================================================
// Job Wrapper
// ===========================================================================

/**
 * Run a job with timing and error handling.
 */
async function runJob(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<CronJobResult> {
  const start = Date.now();

  try {
    const details = await fn();
    return {
      job: name,
      success: true,
      duration: Date.now() - start,
      details,
    };
  } catch (err) {
    return {
      job: name,
      success: false,
      duration: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ===========================================================================
// Job Implementations
// ===========================================================================

/**
 * Daily nudge generation for premium users.
 *
 * Runs at 3am Central so nudges are ready for the 8am delivery window.
 * Only processes premium and active trial users — they get daily nudges.
 */
async function dailyNudgeGeneration(env: Env): Promise<Record<string, unknown>> {
  const db = env.DB;

  // Get all premium/trial users with at least one contact
  const { results: users } = await db
    .prepare(
      `SELECT DISTINCT u.id, u.name
       FROM users u
       INNER JOIN contacts c ON u.id = c.user_id
       WHERE u.subscription_tier IN ('premium', 'trial')
         AND c.archived = 0`
    )
    .all<{ id: string; name: string }>();

  let nudgesGenerated = 0;
  let usersProcessed = 0;

  for (const user of users) {
    try {
      // TODO: TASK — Call nudge generation service
      // const generated = await generateNudgesForUser(db, env, user.id);
      // nudgesGenerated += generated;
      usersProcessed++;
    } catch (err) {
      console.error(`[cron:dailyNudge] Failed for user ${user.id}:`, err);
    }
  }

  return {
    usersProcessed,
    nudgesGenerated,
    tier: 'premium/trial',
  };
}

/**
 * Weekly nudge generation for free tier users.
 *
 * Runs Monday 3am Central. Free users get a single weekly batch of
 * nudges (up to their FREE_TIER_LIMITS.max_nudges_per_day).
 */
async function weeklyNudgeGeneration(env: Env): Promise<Record<string, unknown>> {
  const db = env.DB;

  // Get all free tier users with at least one contact
  const { results: users } = await db
    .prepare(
      `SELECT DISTINCT u.id, u.name
       FROM users u
       INNER JOIN contacts c ON u.id = c.user_id
       WHERE u.subscription_tier = 'free'
         AND c.archived = 0`
    )
    .all<{ id: string; name: string }>();

  let nudgesGenerated = 0;
  let usersProcessed = 0;

  for (const user of users) {
    try {
      // TODO: TASK — Call nudge generation service with weekly flag
      // const generated = await generateNudgesForUser(db, env, user.id, { weekly: true });
      // nudgesGenerated += generated;
      usersProcessed++;
    } catch (err) {
      console.error(`[cron:weeklyNudge] Failed for user ${user.id}:`, err);
    }
  }

  return {
    usersProcessed,
    nudgesGenerated,
    tier: 'free',
  };
}

/**
 * Deliver pending nudges via SMS.
 *
 * Runs at 8am Central — the "morning coffee" delivery window.
 * Fetches all nudges with status='pending' and scheduled_for <= now,
 * sends them via SendBlue, and marks them delivered.
 */
async function nudgeDelivery(env: Env): Promise<Record<string, unknown>> {
  const db = env.DB;
  const now = new Date().toISOString();

  // Get pending nudges that are ready to send
  const { results: nudges } = await db
    .prepare(
      `SELECT n.id, n.user_id, n.contact_id, n.message, u.phone
       FROM nudges n
       INNER JOIN users u ON n.user_id = u.id
       WHERE n.status = 'pending'
         AND n.scheduled_for <= ?
       ORDER BY n.scheduled_for ASC
       LIMIT 100`
    )
    .bind(now)
    .all<{
      id: string;
      user_id: string;
      contact_id: string;
      message: string;
      phone: string;
    }>();

  let delivered = 0;
  let failed = 0;

  for (const nudge of nudges) {
    try {
      // TODO: TASK — Send via SendBlue and mark delivered
      // await sendNudge(env, nudge);
      // await markNudgeDelivered(db, nudge.id);
      delivered++;
    } catch (err) {
      console.error(`[cron:nudgeDelivery] Failed for nudge ${nudge.id}:`, err);
      failed++;
    }
  }

  return {
    pending: nudges.length,
    delivered,
    failed,
  };
}

/**
 * Check for expired trials and downgrade to free tier.
 *
 * Runs at midnight UTC daily. This catches users whose trial expired
 * but haven't made any requests (so lazy downgrade hasn't triggered).
 */
async function trialExpirationCheck(env: Env): Promise<Record<string, unknown>> {
  const result = await processExpiredTrials(env.DB);
  return { usersDowngraded: result.downgraded };
}

/**
 * Clean up old usage tracking data.
 *
 * Runs at midnight UTC daily. Purges rows older than 90 days to
 * keep the usage_tracking table lean. Historical data beyond 90
 * days isn't needed for daily limit enforcement.
 */
async function usageDataCleanup(env: Env): Promise<Record<string, unknown>> {
  const result = await purgeOldUsageData(env.DB, 90);
  return { rowsDeleted: result.rowsDeleted };
}

/**
 * Recalculate health statuses for all contacts.
 *
 * Runs Sunday midnight UTC weekly. Health is stored denormalized
 * on contact rows for query performance, but it can drift if no
 * interactions are logged. This ensures the dashboard always shows
 * accurate health colors.
 */
async function healthRecalculation(env: Env): Promise<Record<string, unknown>> {
  const result = await recalculateAllHealthStatuses(env.DB);
  return {
    usersProcessed: result.usersProcessed,
    contactsUpdated: result.contactsUpdated,
  };
}
