// ============================================
// MEMORY TYPES
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
  };
  goals: string[];
  quirks: string[];
  last_updated: string;
}

export type Vibe = 'new' | 'friendly' | 'close' | 'intimate' | 'playful' | 'tense';
export type FlirtLevel = 'light' | 'playful' | 'flirty' | 'spicy' | 'hot';

export interface RelationshipMemory {
  first_contact: string;
  vibe: Vibe;
  flirt_level: FlirtLevel;
  inside_jokes: string[];
  recurring_topics: string[];
  boundaries: string[];
  highlights: string[];
  patterns: string[];
  last_updated: string;
}

export interface PersonMemory {
  name: string;
  relationship: string;
  key_facts: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'complicated';
  last_mentioned: string;
  mention_count: number;
}

export interface PeopleMemory {
  people: PersonMemory[];
  last_updated: string;
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
  active: ActiveThread[];
  last_updated: string;
}

export interface ConversationSummary {
  date: string;
  summary: string;
  topics: string[];
  vibe: string;
  memorable_moment: string | null;
}

export interface HistoryMemory {
  summaries: ConversationSummary[];
  last_updated: string;
}

// ============================================
// SELF-REFLECTION / NOTES
// ============================================

export interface SelfNote {
  id: string;
  type: 'gap' | 'confusion' | 'made_up' | 'improvement' | 'observation';
  note: string;
  context: string | null;
  created_at: string;
}

export interface SelfReflection {
  notes: SelfNote[];
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
// MEMORY FUNCTIONS
// ============================================

const MEMORY_PREFIX = 'micaiah'; // Single user for Bethany

export function getMemoryPath(file: string): string {
  return `${MEMORY_PREFIX}/${file}`;
}

export async function initializeMemory(bucket: R2Bucket): Promise<void> {
  const now = new Date().toISOString();
  
  // Check if already initialized
  const existing = await bucket.get(getMemoryPath('core.json'));
  if (existing) {
    console.log('Memory already initialized');
    
    // Make sure self-reflection file exists
    const selfExists = await bucket.get(getMemoryPath('self.json'));
    if (!selfExists) {
      const self: SelfReflection = { notes: [], last_updated: now };
      await bucket.put(getMemoryPath('self.json'), JSON.stringify(self, null, 2));
    }
    return;
  }
  
  // Initialize core memory
  const core: CoreMemory = {
    name: 'Micaiah',
    age: '38',
    location: 'Alabama',
    job: {
      title: 'Founder',
      company: 'Untitled Publishers',
      industry: 'Publishing / Digital Products',
      notes: 'Builds digital products, books, tools. Works with Irene.',
    },
    relationship_status: 'In a relationship with Amber',
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
    },
    goals: [],
    quirks: [],
    last_updated: now,
  };
  
  // Initialize relationship memory
  const relationship: RelationshipMemory = {
    first_contact: now,
    vibe: 'new',
    flirt_level: 'playful',
    inside_jokes: [],
    recurring_topics: [],
    boundaries: [],
    highlights: [],
    patterns: [],
    last_updated: now,
  };
  
  // Initialize people memory
  const people: PeopleMemory = {
    people: [
      {
        name: 'Irene',
        relationship: 'Business partner at Untitled Publishers',
        key_facts: ['Works with him on projects'],
        sentiment: 'positive',
        last_mentioned: now,
        mention_count: 0,
      },
      {
        name: 'Amber',
        relationship: 'Girlfriend',
        key_facts: [],
        sentiment: 'positive',
        last_mentioned: now,
        mention_count: 0,
      },
    ],
    last_updated: now,
  };
  
  // Initialize threads
  const threads: ThreadsMemory = {
    active: [],
    last_updated: now,
  };
  
  // Initialize history
  const history: HistoryMemory = {
    summaries: [],
    last_updated: now,
  };
  
  // Initialize self-reflection
  const self: SelfReflection = {
    notes: [],
    last_updated: now,
  };
  
  // Write all files
  await Promise.all([
    bucket.put(getMemoryPath('core.json'), JSON.stringify(core, null, 2)),
    bucket.put(getMemoryPath('relationship.json'), JSON.stringify(relationship, null, 2)),
    bucket.put(getMemoryPath('people.json'), JSON.stringify(people, null, 2)),
    bucket.put(getMemoryPath('threads.json'), JSON.stringify(threads, null, 2)),
    bucket.put(getMemoryPath('history.json'), JSON.stringify(history, null, 2)),
    bucket.put(getMemoryPath('self.json'), JSON.stringify(self, null, 2)),
  ]);
  
  console.log('Memory initialized for Micaiah');
}

export async function loadHotMemory(bucket: R2Bucket): Promise<HotMemory | null> {
  try {
    const [coreObj, relationshipObj, threadsObj] = await Promise.all([
      bucket.get(getMemoryPath('core.json')),
      bucket.get(getMemoryPath('relationship.json')),
      bucket.get(getMemoryPath('threads.json')),
    ]);
    
    if (!coreObj || !relationshipObj || !threadsObj) {
      console.log('Memory not found, initializing...');
      await initializeMemory(bucket);
      return loadHotMemory(bucket); // Retry after init
    }
    
    const core = JSON.parse(await coreObj.text()) as CoreMemory;
    const relationship = JSON.parse(await relationshipObj.text()) as RelationshipMemory;
    const threads = JSON.parse(await threadsObj.text()) as ThreadsMemory;
    
    return {
      core,
      relationship,
      threads: threads.active.filter(t => !t.resolved),
    };
  } catch (error) {
    console.error('Error loading hot memory:', error);
    return null;
  }
}

export async function loadPeople(bucket: R2Bucket): Promise<PersonMemory[]> {
  try {
    const obj = await bucket.get(getMemoryPath('people.json'));
    if (!obj) return [];
    
    const data = JSON.parse(await obj.text()) as PeopleMemory;
    return data.people;
  } catch (error) {
    console.error('Error loading people:', error);
    return [];
  }
}

export async function updateCore(bucket: R2Bucket, updates: Partial<CoreMemory>): Promise<void> {
  const obj = await bucket.get(getMemoryPath('core.json'));
  if (!obj) return;
  
  const core = JSON.parse(await obj.text()) as CoreMemory;
  const updated = { ...core, ...updates, last_updated: new Date().toISOString() };
  
  await bucket.put(getMemoryPath('core.json'), JSON.stringify(updated, null, 2));
}

export async function updateRelationship(bucket: R2Bucket, updates: Partial<RelationshipMemory>): Promise<void> {
  const obj = await bucket.get(getMemoryPath('relationship.json'));
  if (!obj) return;
  
  const relationship = JSON.parse(await obj.text()) as RelationshipMemory;
  const updated = { ...relationship, ...updates, last_updated: new Date().toISOString() };
  
  await bucket.put(getMemoryPath('relationship.json'), JSON.stringify(updated, null, 2));
}

export async function addPerson(bucket: R2Bucket, person: PersonMemory): Promise<void> {
  const obj = await bucket.get(getMemoryPath('people.json'));
  if (!obj) return;
  
  const data = JSON.parse(await obj.text()) as PeopleMemory;
  
  // Check if person already exists
  const existing = data.people.find(p => p.name.toLowerCase() === person.name.toLowerCase());
  if (existing) {
    existing.key_facts = [...new Set([...existing.key_facts, ...person.key_facts])];
    existing.last_mentioned = person.last_mentioned;
    existing.mention_count++;
  } else {
    data.people.push(person);
  }
  
  data.last_updated = new Date().toISOString();
  await bucket.put(getMemoryPath('people.json'), JSON.stringify(data, null, 2));
}

export async function addThread(bucket: R2Bucket, topic: string, context: string): Promise<void> {
  const obj = await bucket.get(getMemoryPath('threads.json'));
  if (!obj) return;
  
  const data = JSON.parse(await obj.text()) as ThreadsMemory;
  const now = new Date().toISOString();
  
  data.active.push({
    id: crypto.randomUUID(),
    topic,
    context,
    created_at: now,
    last_referenced: null,
    resolved: false,
  });
  
  data.last_updated = now;
  await bucket.put(getMemoryPath('threads.json'), JSON.stringify(data, null, 2));
}

export async function resolveThread(bucket: R2Bucket, threadId: string): Promise<void> {
  const obj = await bucket.get(getMemoryPath('threads.json'));
  if (!obj) return;
  
  const data = JSON.parse(await obj.text()) as ThreadsMemory;
  const thread = data.active.find(t => t.id === threadId);
  
  if (thread) {
    thread.resolved = true;
    data.last_updated = new Date().toISOString();
    await bucket.put(getMemoryPath('threads.json'), JSON.stringify(data, null, 2));
  }
}

export async function addConversationSummary(bucket: R2Bucket, summary: ConversationSummary): Promise<void> {
  const obj = await bucket.get(getMemoryPath('history.json'));
  if (!obj) return;
  
  const data = JSON.parse(await obj.text()) as HistoryMemory;
  
  // Keep last 30 days of summaries
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  data.summaries = data.summaries.filter(s => new Date(s.date) > thirtyDaysAgo);
  data.summaries.push(summary);
  data.last_updated = new Date().toISOString();
  
  await bucket.put(getMemoryPath('history.json'), JSON.stringify(data, null, 2));
}

// ============================================
// SELF-REFLECTION FUNCTIONS
// ============================================

export async function addSelfNote(
  bucket: R2Bucket, 
  type: SelfNote['type'], 
  note: string, 
  context: string | null = null
): Promise<void> {
  const obj = await bucket.get(getMemoryPath('self.json'));
  
  let data: SelfReflection;
  if (!obj) {
    data = { notes: [], last_updated: new Date().toISOString() };
  } else {
    data = JSON.parse(await obj.text()) as SelfReflection;
  }
  
  const now = new Date().toISOString();
  
  data.notes.push({
    id: crypto.randomUUID(),
    type,
    note,
    context,
    created_at: now,
  });
  
  // Keep last 100 notes
  if (data.notes.length > 100) {
    data.notes = data.notes.slice(-100);
  }
  
  data.last_updated = now;
  await bucket.put(getMemoryPath('self.json'), JSON.stringify(data, null, 2));
}

export async function loadSelfNotes(bucket: R2Bucket): Promise<SelfNote[]> {
  try {
    const obj = await bucket.get(getMemoryPath('self.json'));
    if (!obj) return [];
    
    const data = JSON.parse(await obj.text()) as SelfReflection;
    return data.notes;
  } catch (error) {
    console.error('Error loading self notes:', error);
    return [];
  }
}

// ============================================
// FORMAT FOR CONTEXT
// ============================================

export function formatMemoryForContext(hot: HotMemory, people: PersonMemory[]): string {
  const lines: string[] = [];
  
  // Core facts
  lines.push('## What you know about him:');
  if (hot.core.name) lines.push(`- Name: ${hot.core.name}`);
  if (hot.core.job.company) lines.push(`- Work: ${hot.core.job.title} at ${hot.core.job.company}`);
  if (hot.core.location) lines.push(`- Location: ${hot.core.location}`);
  if (hot.core.relationship_status) lines.push(`- Relationship: ${hot.core.relationship_status}`);
  if (hot.core.interests.length) lines.push(`- Interests: ${hot.core.interests.join(', ')}`);
  if (hot.core.goals.length) lines.push(`- Goals: ${hot.core.goals.join(', ')}`);
  if (hot.core.quirks.length) lines.push(`- Quirks: ${hot.core.quirks.join(', ')}`);
  
  // Relationship
  lines.push('');
  lines.push('## Your dynamic:');
  lines.push(`- Vibe: ${hot.relationship.vibe}`);
  lines.push(`- Flirt level: ${hot.relationship.flirt_level}`);
  if (hot.relationship.inside_jokes.length) {
    lines.push(`- Inside jokes: ${hot.relationship.inside_jokes.join('; ')}`);
  }
  if (hot.relationship.patterns.length) {
    lines.push(`- Patterns you've noticed: ${hot.relationship.patterns.join('; ')}`);
  }
  
  // People he's mentioned
  if (people.length > 0) {
    lines.push('');
    lines.push('## People in his life:');
    for (const person of people.slice(0, 10)) {
      lines.push(`- ${person.name} (${person.relationship}): ${person.key_facts.join(', ') || 'no details yet'}`);
    }
  }
  
  // Active threads
  if (hot.threads.length > 0) {
    lines.push('');
    lines.push('## Topics to maybe follow up on:');
    for (const thread of hot.threads.slice(0, 5)) {
      lines.push(`- ${thread.topic}: ${thread.context}`);
    }
  }
  
  return lines.join('\n');
}
