/**
 * Bethany Network Manager — Intent Configuration
 *
 * Defines the six relationship intent types, their Dunbar-grounded cadence
 * defaults, health calculation logic, nudge message templates, and drift
 * detection for identifying layer migration.
 *
 * Dunbar's layers:
 *   ~5   Support Clique   → inner_circle  (weekly)
 *   ~15  Sympathy Group   → nurture       (every 2 weeks)
 *   ~50  Affinity Group   → maintain      (monthly)
 *   ~150 Active Network   → transactional (quarterly / as-needed)
 *
 * Energy allocation research suggests ~58% of social energy goes to the
 * innermost 5, ~25% to the next 10, and ~17% to the remaining 135.
 * Cadence defaults reflect this: more frequent contact where more energy
 * should be invested.
 *
 * Kin vs. Non-Kin Decay:
 *   Roberts & Dunbar (2011, 2015) found that friendships are highly
 *   sensitive to decreased contact frequency, while kin relationships
 *   are resistant to decay. The kinDecayModifier relaxes thresholds
 *   for kin contacts — a modifier of 0.5 means kin get 1.5x the
 *   threshold window before status changes.
 *
 * New Relationship Establishment:
 *   Roberts & Dunbar (2011, 2015) found that new relationships need
 *   extra nurturing to establish. The newRelationshipCadenceMultiplier
 *   tightens cadence windows during the establishment period (first 6
 *   months after a contact is added). A multiplier of 0.7 means 30%
 *   shorter cadence windows — e.g., a 14-day nurture cadence becomes
 *   ~10 days for new contacts. After the establishment window passes,
 *   normal intent cadence takes over.
 *
 * Drift Detection:
 *   Health status measures a contact against their OWN cadence.
 *   Drift detection compares actual interaction frequency against ALL
 *   layer thresholds to catch when someone is migrating to a lower
 *   Dunbar layer. This is the core differentiator from every competitor
 *   (Clay, Dex, UpHabit) — none implement cross-layer comparison.
 *
 * Health thresholds (per-layer, from research doc Section 6):
 *   green  = within cadence window (ratio < yellowThreshold)
 *   yellow = slipping — ratio at or above yellowThreshold
 *   red    = overdue — ratio at or above redThreshold
 *
 *   Per-layer values (derived from DUNBAR_LAYERS tolerance/urgency windows):
 *     inner_circle:  yellow 1.43x (10d), red 2.0x (14d)
 *     nurture:       yellow 1.43x (20d), red 2.0x (28d)
 *     maintain:      yellow 1.5x  (45d), red 2.0x (60d)
 *     transactional: yellow 1.33x (120d), red 2.0x (180d)
 *
 *   Inner layers get tighter feedback loops; outer layers get breathing
 *   room. Red threshold is a uniform 2.0x across all layers — "double
 *   your cadence = overdue" universally.
 *
 *   (kin contacts: thresholds multiplied by 1 + kinDecayModifier)
 *   (new contacts in establishment window: cadence *= newRelationshipCadenceMultiplier)
 *
 * @see shared/models.ts for IntentType, HealthStatus, ContactKind, DriftAlert
 * @see Roberts & Dunbar (2011). The costs of family and friends.
 * @see Roberts & Dunbar (2015). Managing relationship decay.
 * @see PLOS ONE (2025). Reflecting on Dunbar's numbers (N=906).
 * @see dunbar-cadence-research-findings.md, Section 6 (DECAY_CONFIG).
 */

import type { IntentType, HealthStatus, DriftSeverity, DriftAlert, DriftEvidence } from './models';

// ===========================================================================
// Intent Configuration
// ===========================================================================

export interface IntentConfig {
  /** The intent type key */
  type: IntentType;
  /** Human-readable label */
  label: string;
  /** Dunbar layer this maps to */
  dunbarLayer: string;
  /** Approximate group size in Dunbar's model */
  dunbarSize: number;
  /** Description shown to users */
  description: string;
  /** Default cadence in days (null = no active cadence) */
  defaultCadenceDays: number | null;
  /**
   * Fraction of cadence elapsed before yellow status.
   * Per-layer values derived from research doc Section 6 tolerance windows:
   *   inner_circle: 1.43 (10d tolerance / 7d cadence)
   *   nurture:      1.43 (interpolated — close relationships, tight windows)
   *   maintain:     1.5  (45d tolerance / 30d cadence)
   *   transactional: 1.33 (120d tolerance / 90d cadence)
   */
  yellowThreshold: number;
  /**
   * Fraction of cadence elapsed before red status.
   * Uniform 2.0x across all active layers — "double your cadence = overdue."
   * Derived from research doc Section 6 urgency windows:
   *   inner_circle: 2.0 (14d urgency / 7d cadence)
   *   nurture:      2.0 (28d / 14d)
   *   maintain:     2.0 (60d / 30d)
   *   transactional: 2.0 (180d / 90d)
   */
  redThreshold: number;
  /**
   * Kin decay modifier — relaxes thresholds for family/kin contacts.
   * Applied as: effectiveThreshold = threshold * (1 + kinDecayModifier)
   *
   * Research basis: Roberts & Dunbar (2011, 2015) found kin relationships
   * resist decay even with reduced contact. Friendships require active
   * maintenance; family ties do not.
   *
   * Values per layer (from Dunbar cadence research doc):
   *   inner_circle: 0.5  (kin get 2x tolerance — yellow at 1.5x, red at 2.25x)
   *   nurture:      0.5
   *   maintain:     0.3
   *   transactional: 0.2
   *   dormant/new:  0.0  (no effect — no active cadence)
   */
  kinDecayModifier: number;
  /** Nudge templates — Bethany picks from these when generating reminders */
  nudgeTemplates: NudgeTemplate[];
}

export interface NudgeTemplate {
  /** When to use this template */
  trigger: 'yellow' | 'red' | 'any';
  /** Template string — {{name}} is replaced with contact name */
  message: string;
}

// ===========================================================================
// New Relationship Establishment Configuration
// ===========================================================================

/**
 * Configuration for new relationship cadence tightening.
 *
 * Research basis: Roberts & Dunbar (2011, 2015) found that new
 * relationships need MORE frequent contact to establish. Without
 * extra nurturing in the early months, new connections decay before
 * they ever solidify.
 *
 * From dunbar-cadence-research-findings.md, Section 6 (DECAY_CONFIG):
 *   newRelationshipCadenceMultiplier: 0.7  (30% shorter windows)
 *   stabilizationMonths: 6
 *
 * How it works:
 *   - When a contact is within the establishment window (based on
 *     their created_at date), the effective cadence is multiplied
 *     by cadenceMultiplier. E.g., a 14-day nurture cadence becomes
 *     14 * 0.7 = ~10 days.
 *   - This applies to ANY intent type that has an active cadence,
 *     not just the 'new' intent. A contact sorted into 'nurture'
 *     on day 1 still gets tighter cadence for the first 6 months.
 *   - The 'new' intent itself gets a fallback cadence during the
 *     establishment window (fallbackCadenceDays) so unsorted contacts
 *     aren't completely ignored.
 *   - After the establishment window passes, normal cadence resumes.
 *   - Stacks with kin modifier: a new kin contact gets tighter cadence
 *     AND relaxed thresholds. The multiplier applies to cadence, the
 *     kin modifier applies to thresholds — they're independent axes.
 */
export const NEW_RELATIONSHIP_CONFIG = {
  /**
   * Multiplier applied to cadence during the establishment period.
   * 0.7 = 30% shorter cadence windows (more frequent contact).
   * Applied as: effectiveCadence = baseCadence * cadenceMultiplier
   */
  cadenceMultiplier: 0.7,
  /**
   * How long the establishment period lasts, in days.
   * 180 days ≈ 6 months. After this, normal cadence takes over.
   */
  establishmentDays: 180,
  /**
   * Fallback cadence for 'new' intent contacts during establishment.
   * The 'new' intent has defaultCadenceDays: null (no cadence), but
   * during the establishment window we want to nudge the user to
   * actually sort and reach out to new contacts. 14 days gives them
   * a reasonable window before Bethany starts nudging.
   *
   * This only applies when intent === 'new' AND the contact is within
   * the establishment window. Once the window closes, 'new' contacts
   * revert to no cadence (they should have been sorted by then).
   */
  fallbackCadenceDays: 14,
} as const;

// ===========================================================================
// Drift Detection Configuration
// ===========================================================================

/**
 * Configuration for drift detection — comparing actual interaction frequency
 * against layer boundary cadences to detect Dunbar layer migration.
 *
 * From dunbar-cadence-research-findings.md, Section 6 (DECAY_CONFIG):
 *   driftWindowDays: 90 (rolling 90-day assessment window)
 *
 * The "watching" buffer means we flag early — before the contact's
 * average interval actually crosses into the next layer's cadence.
 * This gives Bethany time to nudge before the drift is complete.
 */
export const DRIFT_CONFIG = {
  /** Rolling window in days for assessing interaction frequency */
  windowDays: 90,
  /**
   * Minimum interactions required in the window before drift detection
   * kicks in. With fewer data points, the average is too noisy to be
   * meaningful. 2 interactions = at least one interval to measure.
   */
  minInteractions: 2,
  /**
   * Buffer multiplier for "watching" severity.
   * When avg interval > ownCadence * watchingBuffer but hasn't yet
   * reached the next layer's cadence, we flag as "watching".
   * 1.5 means we start watching at 1.5x their assigned cadence.
   */
  watchingBuffer: 1.5,
} as const;

/**
 * Ordered list of active Dunbar layers from innermost to outermost.
 * Used by drift detection to determine which layer a contact's actual
 * frequency matches. dormant and new are excluded — they have no cadence
 * and can't drift.
 *
 * The order matters: detectDrift() walks outward from the contact's
 * assigned layer, checking each boundary.
 */
export const DUNBAR_LAYER_ORDER: IntentType[] = [
  'inner_circle',  // 7 days
  'nurture',       // 14 days
  'maintain',      // 30 days
  'transactional', // 90 days
];

// ===========================================================================
// The Six Intent Types
// ===========================================================================

export const INTENT_CONFIGS: Record<IntentType, IntentConfig> = {
  inner_circle: {
    type: 'inner_circle',
    label: 'Inner Circle',
    dunbarLayer: 'Support Clique',
    dunbarSize: 5,
    description: 'Your closest people — the ones you turn to first. Weekly contact keeps these bonds strong.',
    defaultCadenceDays: 7,
    // Research: 10d tolerance / 7d cadence = 1.43x, 14d urgency / 7d = 2.0x
    // Feel: ~3 day grace period, urgent at 2 weeks
    yellowThreshold: 1.43,
    redThreshold: 2.0,
    kinDecayModifier: 0.5,
    nudgeTemplates: [
      {
        trigger: 'yellow',
        message: "It's been about a week since you connected with {{name}}. Even a quick \"thinking of you\" goes a long way with your inner circle.",
      },
      {
        trigger: 'yellow',
        message: "{{name}} is one of your closest people — when's the last time you just checked in? A 2-minute text can carry a lot of weight.",
      },
      {
        trigger: 'red',
        message: "Hey, it's been a while since you and {{name}} connected. Your inner circle needs the most care — want to reach out today?",
      },
      {
        trigger: 'red',
        message: "{{name}} hasn't heard from you in over two weeks. For someone in your inner circle, that's a gap worth closing. Even \"hey, been thinking about you\" works.",
      },
    ],
  },

  nurture: {
    type: 'nurture',
    label: 'Nurture',
    dunbarLayer: 'Sympathy Group',
    dunbarSize: 15,
    description: 'Relationships you\'re actively investing in. Regular contact every couple weeks keeps the momentum going.',
    defaultCadenceDays: 14,
    // Interpolated from inner_circle and maintain — close relationships, tight windows
    // Feel: ~6 day grace period, urgent at 4 weeks
    yellowThreshold: 1.43,
    redThreshold: 2.0,
    kinDecayModifier: 0.5,
    nudgeTemplates: [
      {
        trigger: 'yellow',
        message: "It's been about two weeks since you connected with {{name}}. A quick check-in keeps the relationship growing.",
      },
      {
        trigger: 'yellow',
        message: "{{name}} is someone you're investing in — a short message this week would keep that momentum going.",
      },
      {
        trigger: 'red',
        message: "It's been close to a month since you reached out to {{name}}. Nurture relationships need regular watering — want to reconnect?",
      },
      {
        trigger: 'red',
        message: "{{name}} might be wondering where you went. It's been a while — even a quick \"how are things?\" can reignite the connection.",
      },
    ],
  },

  maintain: {
    type: 'maintain',
    label: 'Maintain',
    dunbarLayer: 'Affinity Group',
    dunbarSize: 50,
    description: 'Stable relationships that stay warm with monthly check-ins. You don\'t need to force it — just stay present.',
    defaultCadenceDays: 30,
    // Research: 45d tolerance / 30d cadence = 1.5x, 60d urgency / 30d = 2.0x
    // Feel: ~2 week grace period, urgent at 2 months
    yellowThreshold: 1.5,
    redThreshold: 2.0,
    kinDecayModifier: 0.3,
    nudgeTemplates: [
      {
        trigger: 'yellow',
        message: "It's been about a month since you touched base with {{name}}. A quick hello keeps the connection alive.",
      },
      {
        trigger: 'yellow',
        message: "{{name}} hasn't heard from you in a while. Even a \"saw this and thought of you\" keeps maintain relationships warm.",
      },
      {
        trigger: 'red',
        message: "It's been about two months since you connected with {{name}}. Maintain relationships can fade quietly — want to send a quick note?",
      },
      {
        trigger: 'red',
        message: "{{name}} is slipping off the radar — it's been well over a month. A short message today could keep this one from going dormant.",
      },
    ],
  },

  transactional: {
    type: 'transactional',
    label: 'Transactional',
    dunbarLayer: 'Active Network',
    dunbarSize: 150,
    description: 'Purpose-driven connections — you reach out when there\'s a reason. Quarterly is a reasonable rhythm.',
    defaultCadenceDays: 90,
    // Research: 120d tolerance / 90d cadence = 1.33x, 180d urgency / 90d = 2.0x
    // Feel: ~1 month grace period, urgent at 6 months
    yellowThreshold: 1.33,
    redThreshold: 2.0,
    kinDecayModifier: 0.2,
    nudgeTemplates: [
      {
        trigger: 'yellow',
        message: "It's been about 3 months since you connected with {{name}}. Worth a check-in to keep the professional relationship active?",
      },
      {
        trigger: 'red',
        message: "{{name}} hasn't been on your radar in a while. Even transactional relationships benefit from an occasional touchpoint.",
      },
    ],
  },

  dormant: {
    type: 'dormant',
    label: 'Dormant',
    dunbarLayer: 'Inactive',
    dunbarSize: 0,
    description: 'Paused relationships — no active reminders. Move them back when you\'re ready to re-engage.',
    defaultCadenceDays: null,
    yellowThreshold: 1.0,
    redThreshold: 1.5,
    kinDecayModifier: 0.0,
    nudgeTemplates: [],
  },

  new: {
    type: 'new',
    label: 'New',
    dunbarLayer: 'Unsorted',
    dunbarSize: 0,
    description: 'Just added — Bethany will help you sort them into the right intent when you\'re ready.',
    defaultCadenceDays: null,
    yellowThreshold: 1.0,
    redThreshold: 1.5,
    kinDecayModifier: 0.0,
    nudgeTemplates: [
      {
        trigger: 'any',
        message: "You added {{name}} recently but haven't sorted them yet. Want to tell me a bit about them so I can help you figure out the right cadence?",
      },
      {
        trigger: 'yellow',
        message: "{{name}} is still new in your network and you haven't reached out yet. New connections need early attention — even a quick hello helps solidify the relationship.",
      },
      {
        trigger: 'red',
        message: "It's been a while since you added {{name}} and they haven't heard from you. New relationships are fragile — if this one matters, now's the time to reach out before the window closes.",
      },
    ],
  },
};

// ===========================================================================
// New Relationship Helpers
// ===========================================================================

/**
 * Determine whether a contact is within the establishment window.
 *
 * During this window, cadence is tightened by NEW_RELATIONSHIP_CONFIG.cadenceMultiplier
 * to give new relationships the extra attention they need to solidify.
 *
 * @param createdAt - ISO timestamp of when the contact was added
 * @param now       - Override current time (for testing)
 * @returns true if the contact is within the establishment window
 */
export function isWithinEstablishmentWindow(
  createdAt: string | null | undefined,
  now?: Date,
): boolean {
  if (!createdAt) return false;

  const currentTime = now ?? new Date();
  const createdDate = new Date(createdAt);
  const elapsedMs = currentTime.getTime() - createdDate.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  return elapsedDays <= NEW_RELATIONSHIP_CONFIG.establishmentDays;
}

/**
 * Get the number of days remaining in the establishment window.
 * Returns 0 if the window has closed, null if createdAt is missing.
 *
 * Useful for dashboard display: "New relationship boost: 47 days remaining"
 *
 * @param createdAt - ISO timestamp of when the contact was added
 * @param now       - Override current time (for testing)
 */
export function establishmentDaysRemaining(
  createdAt: string | null | undefined,
  now?: Date,
): number | null {
  if (!createdAt) return null;

  const currentTime = now ?? new Date();
  const createdDate = new Date(createdAt);
  const elapsedMs = currentTime.getTime() - createdDate.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const remaining = NEW_RELATIONSHIP_CONFIG.establishmentDays - elapsedDays;

  return Math.max(0, Math.round(remaining));
}

/**
 * Resolve the effective cadence for a contact, accounting for:
 *   1. Custom cadence override (highest priority)
 *   2. New relationship establishment multiplier (if in window)
 *   3. Intent default cadence (fallback)
 *   4. 'new' intent fallback cadence during establishment (special case)
 *
 * This is the single source of truth for "what cadence should this
 * contact be measured against right now?" All health calculations
 * and nudge scheduling should use this function.
 *
 * @param intent            - The contact's intent type
 * @param customCadenceDays - Optional user override
 * @param createdAt         - ISO timestamp of when the contact was added
 * @param now               - Override current time (for testing)
 * @returns Effective cadence in days, or null if no cadence applies
 *
 * @example
 * // Nurture contact added 2 weeks ago (in establishment window)
 * resolveEffectiveCadence('nurture', null, '2026-01-22T00:00:00Z');
 * // Returns: 9.8 (14 * 0.7)
 *
 * @example
 * // Nurture contact added 8 months ago (past establishment window)
 * resolveEffectiveCadence('nurture', null, '2025-06-01T00:00:00Z');
 * // Returns: 14 (normal cadence)
 *
 * @example
 * // 'new' intent contact added 5 days ago
 * resolveEffectiveCadence('new', null, '2026-01-30T00:00:00Z');
 * // Returns: 9.8 (14 fallback * 0.7 multiplier)
 *
 * @example
 * // 'new' intent contact added 7 months ago (past establishment)
 * resolveEffectiveCadence('new', null, '2025-07-01T00:00:00Z');
 * // Returns: null (no cadence — should have been sorted by now)
 *
 * @example
 * // Contact with custom cadence override (ignores multiplier)
 * resolveEffectiveCadence('nurture', 10, '2026-01-22T00:00:00Z');
 * // Returns: 10 (custom overrides everything)
 */
export function resolveEffectiveCadence(
  intent: IntentType,
  customCadenceDays?: number | null,
  createdAt?: string | null,
  now?: Date,
): number | null {
  // Custom cadence always wins — the user explicitly set it
  if (customCadenceDays !== null && customCadenceDays !== undefined) {
    return customCadenceDays;
  }

  const config = INTENT_CONFIGS[intent];
  const inEstablishment = isWithinEstablishmentWindow(createdAt, now);

  // Special case: 'new' intent has no default cadence, but during
  // establishment we use a fallback to keep new contacts visible
  if (config.defaultCadenceDays === null) {
    if (intent === 'new' && inEstablishment) {
      return NEW_RELATIONSHIP_CONFIG.fallbackCadenceDays * NEW_RELATIONSHIP_CONFIG.cadenceMultiplier;
    }
    return null;
  }

  // During establishment, tighten the cadence
  if (inEstablishment) {
    return config.defaultCadenceDays * NEW_RELATIONSHIP_CONFIG.cadenceMultiplier;
  }

  // Normal cadence
  return config.defaultCadenceDays;
}

// ===========================================================================
// Health Calculation
// ===========================================================================

/**
 * Calculate the health status of a contact based on their intent and
 * when they were last contacted.
 *
 * Uses per-layer thresholds derived from Dunbar research tolerance and
 * urgency windows (see INTENT_CONFIGS for specific values per layer).
 * Inner layers have tighter feedback loops; outer layers get more
 * breathing room. Red is uniformly 2.0x across all active layers.
 *
 * @param intent            - The contact's intent type
 * @param lastContact       - ISO timestamp of the last interaction, or null
 * @param customCadenceDays - Optional override of the intent's default cadence
 * @param isKin             - Whether the contact is kin (family). When true,
 *                            thresholds are relaxed by the intent's kinDecayModifier.
 * @param now               - Override current time (for testing)
 * @param createdAt         - ISO timestamp of when the contact was added.
 *                            When provided and within the establishment window,
 *                            cadence is tightened by newRelationshipCadenceMultiplier.
 * @returns HealthStatus: 'green', 'yellow', or 'red'
 *
 * Rules:
 *   - dormant contacts (and new contacts outside establishment) with no
 *     cadence are always 'green'
 *   - contacts with no lastContact date are 'yellow' (unknown state)
 *   - otherwise: days_elapsed / effectiveCadence compared against per-layer thresholds
 *   - kin contacts: thresholds *= (1 + kinDecayModifier)
 *   - new relationships in establishment window: cadence is tightened
 */
export function calculateHealthStatus(
  intent: IntentType,
  lastContact: string | null,
  customCadenceDays?: number | null,
  isKin?: boolean,
  now?: Date,
  createdAt?: string | null,
): HealthStatus {
  const config = INTENT_CONFIGS[intent];
  const cadence = resolveEffectiveCadence(intent, customCadenceDays, createdAt, now);

  // No cadence = no health tracking
  if (cadence === null || cadence === undefined) {
    return 'green';
  }

  // Never contacted = unknown state, nudge-worthy
  if (!lastContact) {
    return 'yellow';
  }

  const currentTime = now ?? new Date();
  const lastContactDate = new Date(lastContact);
  const elapsedMs = currentTime.getTime() - lastContactDate.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  // Apply kin decay modifier: kin contacts get relaxed thresholds
  const kinMultiplier = isKin ? (1 + config.kinDecayModifier) : 1;
  const effectiveYellow = config.yellowThreshold * kinMultiplier;
  const effectiveRed = config.redThreshold * kinMultiplier;

  const ratio = elapsedDays / cadence;

  if (ratio >= effectiveRed) {
    return 'red';
  }

  if (ratio >= effectiveYellow) {
    return 'yellow';
  }

  return 'green';
}

// ===========================================================================
// Drift Detection
// ===========================================================================

/**
 * Detect whether a contact is drifting from their assigned Dunbar layer
 * based on actual interaction frequency over a rolling window.
 *
 * This is DIFFERENT from health status:
 *   - Health = "are you keeping up with THIS contact's cadence?"
 *   - Drift  = "does your actual frequency match a DIFFERENT layer?"
 *
 * Health catches "you're overdue." Drift catches "this person is falling
 * out of your inner circle and into your maintain layer."
 *
 * Algorithm:
 *   1. Calculate average interaction interval over the window
 *   2. Compare against the contact's assigned layer cadence
 *   3. Walk outward through DUNBAR_LAYER_ORDER to find which layer
 *      the actual frequency matches
 *   4. Determine severity based on how many layers they've drifted
 *
 * @param contactId    - The contact's ID (for the alert)
 * @param intent       - The contact's assigned intent type
 * @param interactions - Array of interaction dates (ISO strings) within
 *                       the assessment window, sorted newest-first.
 *                       The caller is responsible for querying the right
 *                       window from the interactions table.
 * @param lastContact  - Most recent interaction date (ISO string), or null
 * @param customCadenceDays - Optional cadence override
 * @param isKin        - Whether this contact is kin (adjusts thresholds)
 * @param now          - Override current time (for testing)
 * @returns DriftAlert if drift detected, null if contact is on track
 *
 * @example
 * // Inner circle contact with 35-day avg interval
 * detectDrift('contact-123', 'inner_circle', interactionDates, lastDate);
 * // Returns: { driftingTowardLayer: 'maintain', severity: 'fallen', ... }
 *
 * @example
 * // Nurture contact with 16-day avg interval (slightly over 14-day cadence)
 * detectDrift('contact-456', 'nurture', interactionDates, lastDate);
 * // Returns: { driftingTowardLayer: 'maintain', severity: 'watching', ... }
 */
export function detectDrift(
  contactId: string,
  intent: IntentType,
  interactions: string[],
  lastContact: string | null,
  customCadenceDays?: number | null,
  isKin?: boolean,
  now?: Date,
): DriftAlert | null {
  const config = INTENT_CONFIGS[intent];
  const cadence = customCadenceDays ?? config.defaultCadenceDays;

  // Can't drift if there's no cadence (dormant, new)
  if (cadence === null || cadence === undefined) {
    return null;
  }

  // Can't assess drift without enough data
  if (interactions.length < DRIFT_CONFIG.minInteractions) {
    return null;
  }

  // Can't drift if the intent isn't in the active layer order
  const currentLayerIndex = DUNBAR_LAYER_ORDER.indexOf(intent);
  if (currentLayerIndex === -1) {
    return null;
  }

  // Already at the outermost active layer — can't drift further
  // (transactional contacts drifting would mean dormant, which is a
  // different concept handled by health status going red)
  if (currentLayerIndex === DUNBAR_LAYER_ORDER.length - 1) {
    return null;
  }

  const currentTime = now ?? new Date();

  // Calculate average interaction interval
  // Sort interactions newest-first, compute gaps between consecutive dates
  const sortedDates = interactions
    .map(d => new Date(d).getTime())
    .sort((a, b) => b - a); // newest first

  // Include the gap from now to most recent interaction
  // This prevents a false "all good" when someone had 3 interactions
  // 80 days ago but nothing since
  const gaps: number[] = [];
  gaps.push((currentTime.getTime() - sortedDates[0]) / (1000 * 60 * 60 * 24));

  for (let i = 0; i < sortedDates.length - 1; i++) {
    const gapDays = (sortedDates[i] - sortedDates[i + 1]) / (1000 * 60 * 60 * 24);
    gaps.push(gapDays);
  }

  const avgInterval = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  // Apply kin modifier to the assigned cadence for comparison
  const kinMultiplier = isKin ? (1 + config.kinDecayModifier) : 1;
  const effectiveCadence = cadence * kinMultiplier;

  // Not even past the watching buffer — contact is on track
  if (avgInterval <= effectiveCadence * DRIFT_CONFIG.watchingBuffer) {
    return null;
  }

  // Walk outward through layers to find where the frequency matches
  let matchedLayerIndex = currentLayerIndex;
  for (let i = currentLayerIndex + 1; i < DUNBAR_LAYER_ORDER.length; i++) {
    const layerConfig = INTENT_CONFIGS[DUNBAR_LAYER_ORDER[i]];
    const layerCadence = layerConfig.defaultCadenceDays;
    if (layerCadence === null) continue;

    // Apply kin modifier to the comparison layer too
    const effectiveLayerCadence = isKin
      ? layerCadence * (1 + layerConfig.kinDecayModifier)
      : layerCadence;

    if (avgInterval >= effectiveLayerCadence) {
      matchedLayerIndex = i;
    } else {
      // Haven't reached this layer's cadence yet, stop walking
      break;
    }
  }

  // Determine the layer they're drifting toward
  // If avgInterval didn't reach any lower layer's cadence, they're
  // in the gap between their own layer and the next — "watching"
  const driftingTowardLayer = matchedLayerIndex > currentLayerIndex
    ? DUNBAR_LAYER_ORDER[matchedLayerIndex]
    : DUNBAR_LAYER_ORDER[currentLayerIndex + 1];

  // Determine severity based on distance
  const layerDistance = matchedLayerIndex - currentLayerIndex;
  let severity: DriftSeverity;
  if (layerDistance >= 2) {
    severity = 'fallen';
  } else if (layerDistance === 1) {
    severity = 'drifting';
  } else {
    severity = 'watching';
  }

  // Calculate days since last contact for evidence
  const daysSinceLastContact = lastContact
    ? (currentTime.getTime() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24)
    : DRIFT_CONFIG.windowDays; // If no last contact, use full window

  // Build the matched layer cadence for evidence
  const matchedConfig = INTENT_CONFIGS[driftingTowardLayer];
  const matchedCadence = matchedConfig.defaultCadenceDays ?? 0;

  const evidence: DriftEvidence = {
    avgInteractionInterval: Math.round(avgInterval * 10) / 10,
    expectedCadenceDays: cadence,
    matchedLayerCadenceDays: matchedCadence,
    interactionCount: interactions.length,
    windowDays: DRIFT_CONFIG.windowDays,
    daysSinceLastContact: Math.round(daysSinceLastContact * 10) / 10,
  };

  return {
    contactId,
    currentLayer: intent,
    driftingTowardLayer,
    severity,
    evidence,
    detectedAt: currentTime.toISOString(),
  };
}

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Get the effective cadence for a contact, falling back to intent default.
 *
 * NOTE: This is the legacy helper that does NOT account for the new
 * relationship establishment multiplier. For full cadence resolution
 * including establishment window logic, use resolveEffectiveCadence().
 * This function is kept for backward compatibility with callers that
 * don't have access to createdAt.
 */
export function getEffectiveCadence(
  intent: IntentType,
  customCadenceDays?: number | null,
): number | null {
  return customCadenceDays ?? INTENT_CONFIGS[intent].defaultCadenceDays;
}

/**
 * Get the number of days until a contact's health status would change.
 * Returns null for dormant/new contacts with no cadence.
 *
 * When isKin is true, thresholds are relaxed by kinDecayModifier,
 * giving family contacts more breathing room before status changes.
 *
 * When createdAt is provided and within the establishment window,
 * cadence is tightened, which means status changes come sooner.
 *
 * Useful for scheduling nudge delivery at the right time.
 */
export function daysUntilStatusChange(
  intent: IntentType,
  lastContact: string | null,
  customCadenceDays?: number | null,
  isKin?: boolean,
  now?: Date,
  createdAt?: string | null,
): { daysUntilYellow: number | null; daysUntilRed: number | null } {
  const config = INTENT_CONFIGS[intent];
  const cadence = resolveEffectiveCadence(intent, customCadenceDays, createdAt, now);

  if (cadence === null || cadence === undefined || !lastContact) {
    return { daysUntilYellow: null, daysUntilRed: null };
  }

  const currentTime = now ?? new Date();
  const lastContactDate = new Date(lastContact);
  const elapsedMs = currentTime.getTime() - lastContactDate.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  // Apply kin decay modifier
  const kinMultiplier = isKin ? (1 + config.kinDecayModifier) : 1;
  const yellowAt = cadence * config.yellowThreshold * kinMultiplier;
  const redAt = cadence * config.redThreshold * kinMultiplier;

  return {
    daysUntilYellow: Math.max(0, yellowAt - elapsedDays),
    daysUntilRed: Math.max(0, redAt - elapsedDays),
  };
}

/**
 * Pick a nudge template for a contact based on their current health status.
 * Returns null if no templates match (e.g., dormant contacts).
 */
export function pickNudgeTemplate(
  intent: IntentType,
  healthStatus: HealthStatus,
): NudgeTemplate | null {
  const config = INTENT_CONFIGS[intent];
  const templates = config.nudgeTemplates;

  if (templates.length === 0) {
    return null;
  }

  // Filter to matching trigger
  const matching = templates.filter(
    (t) => t.trigger === healthStatus || t.trigger === 'any',
  );

  if (matching.length === 0) {
    // Fall back to any available template
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Random selection for variety
  return matching[Math.floor(Math.random() * matching.length)];
}

/**
 * Render a nudge template with the contact's name.
 */
export function renderNudge(template: string, contactName: string): string {
  return template.replace(/\{\{name\}\}/g, contactName);
}

/**
 * Get all intent types as an ordered array (for dropdowns, etc.).
 * Ordered by engagement level: inner_circle → new.
 */
export function getIntentOptions(): Array<{ value: IntentType; label: string; description: string }> {
  const order: IntentType[] = [
    'inner_circle',
    'nurture',
    'maintain',
    'transactional',
    'dormant',
    'new',
  ];

  return order.map((type) => ({
    value: type,
    label: INTENT_CONFIGS[type].label,
    description: INTENT_CONFIGS[type].description,
  }));
}
