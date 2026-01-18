// ============================================
// MEMORY TYPES (R2)
// ============================================

export interface CoreMemory {
  name: string | null;
  age: string | null;
  location: string | null;
  job: {
    title: string | null;
    company: string | null;
    industry: string | null;
    notes: string | null;
  };
  relationship_status: string | null;
  living_situation: string | null;
  interests: string[];
  values: string[];
  communication_style: {
    humor: string | null;
    depth: string | null;
    pace: string | null;
    notes: string | null;
  };
  preferences: {
    likes: string[];
    dislikes: string[];
    pet_peeves: string[];
  };
  goals: string[];
  fears: string[];
  quirks: string[];
  last_updated: string;
}

export type Vibe = 'new' | 'friendly' | 'close' | 'intimate' | 'distant' | 'tense';
export type TrustLevel = 'new' | 'building' | 'established' | 'deep';
export type FlirtLevel = 'none' | 'light' | 'playful' | 'flirty' | 'spicy';

export interface RelationshipMemory {
  first_contact: string;
  vibe: Vibe;
  trust_level: TrustLevel;
  flirt_level: FlirtLevel;
  inside_jokes: string[];
  boundaries_set: string[];
  highlights: string[];
  patterns_noticed: string[];
  last_updated: string;
}

export interface PersonMemory {
  slug: string;
  name: string;
  relationship_to_user: string;
  key_facts: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'complicated';
  first_mentioned: string;
  last_mentioned: string;
  mention_count: number;
}

export interface PeopleMemory {
  people: PersonMemory[];
  last_updated: string;
}

export interface ConversationSummary {
  id: string;
  date: string;
  summary: string;
  topics: string[];
  people_mentioned: string[];
  vibe: string;
  memorable_moment: string | null;
}

export interface MonthlySummaries {
  month: string;
  conversations: ConversationSummary[];
}

export interface ActiveThread {
  id: string;
  topic: string;
  context: string;
  created_at: string;
  last_referenced: string | null;
  resolved: boolean;
}

export interface ThreadsMemory {
  active_threads: ActiveThread[];
  last_updated: string;
}

// ============================================
// HOT MEMORY (loaded every message)
// ============================================

export interface HotMemory {
  core: CoreMemory;
  relationship: RelationshipMemory;
  threads: ActiveThread[];
}

// ============================================
// DEFAULTS
// ============================================

export const DEFAULT_CORE_MEMORY: CoreMemory = {
  name: null,
  age: null,
  location: null,
  job: {
    title: null,
    company: null,
    industry: null,
    notes: null,
  },
  relationship_status: null,
  living_situation: null,
  interests: [],
  values: [],
  communication_style: {
    humor: null,
    depth: null,
    pace: null,
    notes: null,
  },
  preferences: {
    likes: [],
    dislikes: [],
    pet_peeves: [],
  },
  goals: [],
  fears: [],
  quirks: [],
  last_updated: new Date().toISOString(),
};

export const DEFAULT_RELATIONSHIP_MEMORY: RelationshipMemory = {
  first_contact: new Date().toISOString(),
  vibe: 'new',
  trust_level: 'new',
  flirt_level: 'none',
  inside_jokes: [],
  boundaries_set: [],
  highlights: [],
  patterns_noticed: [],
  last_updated: new Date().toISOString(),
};

export const DEFAULT_THREADS_MEMORY: ThreadsMemory = {
  active_threads: [],
  last_updated: new Date().toISOString(),
};

export const DEFAULT_PEOPLE_MEMORY: PeopleMemory = {
  people: [],
  last_updated: new Date().toISOString(),
};
