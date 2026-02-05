/**
 * Bethany Network Manager — Intent Configuration
 *
 * Defines the six relationship intent types, their Dunbar-grounded cadence
 * defaults, health calculation logic, and nudge message templates.
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
 * Health thresholds:
 *   green  = within cadence window
 *   yellow = 1.0x–1.5x cadence elapsed (slipping)
 *   red    = >1.5x cadence elapsed (overdue)
 *   (kin contacts: thresholds multiplied by 1 + kinDecayModifier)
 *
 * @see shared/models.ts for IntentType, HealthStatus, and ContactKind
 * @see Roberts & Dunbar (2011). The costs of family and friends.
 * @see Roberts & Dunbar (2015). Managing relationship decay.
 */

import type { IntentType, HealthStatus } from './models';

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
  /** Fraction of cadence elapsed before yellow status (1.0 = at cadence) */
  yellowThreshold: number;
  /** Fraction of cadence elapsed before red status */
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
    yellowThreshold: 1.0,
    redThreshold: 1.5,
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
        message: "{{name}} hasn't heard from you in over 10 days. For someone in your inner circle, that's a gap worth closing. Even \"hey, been thinking about you\" works.",
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
    yellowThreshold: 1.0,
    redThreshold: 1.5,
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
        message: "It's been over three weeks since you reached out to {{name}}. Nurture relationships need regular watering — want to reconnect?",
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
    yellowThreshold: 1.0,
    redThreshold: 1.5,
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
        message: "It's been over 6 weeks since you connected with {{name}}. Maintain relationships can fade quietly — want to send a quick note?",
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
    yellowThreshold: 1.0,
    redThreshold: 1.5,
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
    // No nudges — dormant contacts don't generate reminders
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
    ],
  },
};

// ===========================================================================
// Health Calculation
// ===========================================================================

/**
 * Calculate the health status of a contact based on their intent and
 * when they were last contacted.
 *
 * @param intent       - The contact's intent type
 * @param lastContact  - ISO timestamp of the last interaction, or null
 * @param customCadenceDays - Optional override of the intent's default cadence
 * @param isKin        - Whether the contact is kin (family). When true,
 *                       thresholds are relaxed by the intent's kinDecayModifier.
 *                       E.g., inner_circle with kinDecayModifier 0.5:
 *                       yellow goes from 1.0x to 1.5x, red from 1.5x to 2.25x.
 * @param now          - Override current time (for testing)
 * @returns HealthStatus: 'green', 'yellow', or 'red'
 *
 * Rules:
 *   - dormant and new contacts with no cadence are always 'green'
 *   - contacts with no lastContact date are 'yellow' (unknown state)
 *   - otherwise: days_elapsed / cadence compared against thresholds
 *   - kin contacts: thresholds *= (1 + kinDecayModifier)
 */
export function calculateHealthStatus(
  intent: IntentType,
  lastContact: string | null,
  customCadenceDays?: number | null,
  isKin?: boolean,
  now?: Date,
): HealthStatus {
  const config = INTENT_CONFIGS[intent];
  const cadence = customCadenceDays ?? config.defaultCadenceDays;

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
// Helper Functions
// ===========================================================================

/**
 * Get the effective cadence for a contact, falling back to intent default.
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
 * Useful for scheduling nudge delivery at the right time.
 */
export function daysUntilStatusChange(
  intent: IntentType,
  lastContact: string | null,
  customCadenceDays?: number | null,
  isKin?: boolean,
  now?: Date,
): { daysUntilYellow: number | null; daysUntilRed: number | null } {
  const config = INTENT_CONFIGS[intent];
  const cadence = customCadenceDays ?? config.defaultCadenceDays;

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
