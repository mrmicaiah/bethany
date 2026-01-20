import {
  CoreMemory,
  RelationshipMemory,
  PeopleMemory,
  ThreadsMemory,
  HotMemory,
  DEFAULT_CORE_MEMORY,
  DEFAULT_RELATIONSHIP_MEMORY,
  DEFAULT_THREADS_MEMORY,
  DEFAULT_PEOPLE_MEMORY,
} from './types';

export * from './types';
export * from './extraction';

interface MemoryEnv {
  MEMORY: R2Bucket;
}

// ============================================
// INITIALIZE MEMORY
// ============================================

export async function initializeMemory(env: MemoryEnv): Promise<void> {
  // Check if already initialized
  const existing = await env.MEMORY.get('core.json');
  if (existing) {
    console.log('Memory already initialized');
    return;
  }

  // Create default memory files
  await env.MEMORY.put('core.json', JSON.stringify(DEFAULT_CORE_MEMORY, null, 2));
  await env.MEMORY.put('relationship.json', JSON.stringify(DEFAULT_RELATIONSHIP_MEMORY, null, 2));
  await env.MEMORY.put('threads.json', JSON.stringify(DEFAULT_THREADS_MEMORY, null, 2));
  await env.MEMORY.put('people.json', JSON.stringify(DEFAULT_PEOPLE_MEMORY, null, 2));

  console.log('Memory initialized');
}

// ============================================
// LOAD MEMORY
// ============================================

export async function loadHotMemory(env: MemoryEnv): Promise<HotMemory> {
  const [coreObj, relationshipObj, threadsObj] = await Promise.all([
    env.MEMORY.get('core.json'),
    env.MEMORY.get('relationship.json'),
    env.MEMORY.get('threads.json'),
  ]);

  const core: CoreMemory = coreObj 
    ? JSON.parse(await coreObj.text()) 
    : DEFAULT_CORE_MEMORY;
    
  const relationship: RelationshipMemory = relationshipObj 
    ? JSON.parse(await relationshipObj.text()) 
    : DEFAULT_RELATIONSHIP_MEMORY;
    
  const threads: ThreadsMemory = threadsObj 
    ? JSON.parse(await threadsObj.text()) 
    : DEFAULT_THREADS_MEMORY;

  return {
    core,
    relationship,
    threads: threads.active_threads.filter(t => !t.resolved),
  };
}

export async function loadPeople(env: MemoryEnv): Promise<PeopleMemory> {
  const obj = await env.MEMORY.get('people.json');
  return obj ? JSON.parse(await obj.text()) : DEFAULT_PEOPLE_MEMORY;
}

// ============================================
// UPDATE MEMORY
// ============================================

export async function updateCoreMemory(
  env: MemoryEnv, 
  updates: Partial<CoreMemory>
): Promise<CoreMemory> {
  const current = await loadCoreMemory(env);
  const updated: CoreMemory = {
    ...current,
    ...updates,
    job: { ...current.job, ...updates.job },
    communication_style: { ...current.communication_style, ...updates.communication_style },
    preferences: { 
      ...current.preferences, 
      ...updates.preferences,
      likes: updates.preferences?.likes ?? current.preferences.likes,
      dislikes: updates.preferences?.dislikes ?? current.preferences.dislikes,
      pet_peeves: updates.preferences?.pet_peeves ?? current.preferences.pet_peeves,
    },
    last_updated: new Date().toISOString(),
  };
  
  await env.MEMORY.put('core.json', JSON.stringify(updated, null, 2));
  return updated;
}

export async function updateRelationshipMemory(
  env: MemoryEnv, 
  updates: Partial<RelationshipMemory>
): Promise<RelationshipMemory> {
  const current = await loadRelationshipMemory(env);
  const updated: RelationshipMemory = {
    ...current,
    ...updates,
    last_updated: new Date().toISOString(),
  };
  
  await env.MEMORY.put('relationship.json', JSON.stringify(updated, null, 2));
  return updated;
}

export async function addInsideJoke(env: MemoryEnv, joke: string): Promise<void> {
  const current = await loadRelationshipMemory(env);
  if (!current.inside_jokes.includes(joke)) {
    current.inside_jokes.push(joke);
    current.last_updated = new Date().toISOString();
    await env.MEMORY.put('relationship.json', JSON.stringify(current, null, 2));
  }
}

export async function addHighlight(env: MemoryEnv, highlight: string): Promise<void> {
  const current = await loadRelationshipMemory(env);
  current.highlights.push(highlight);
  current.last_updated = new Date().toISOString();
  await env.MEMORY.put('relationship.json', JSON.stringify(current, null, 2));
}

// ============================================
// ARRAY HELPERS (for appending to lists)
// ============================================

export async function appendToCore(
  env: MemoryEnv,
  field: 'interests' | 'goals' | 'quirks' | 'values' | 'fears',
  items: string[]
): Promise<void> {
  if (!items || items.length === 0) return;
  
  const current = await loadCoreMemory(env);
  const existing = current[field] || [];
  const newItems = items.filter(item => !existing.includes(item));
  
  if (newItems.length > 0) {
    current[field] = [...existing, ...newItems];
    current.last_updated = new Date().toISOString();
    await env.MEMORY.put('core.json', JSON.stringify(current, null, 2));
    console.log(`Added to ${field}:`, newItems);
  }
}

export async function appendToPreferences(
  env: MemoryEnv,
  field: 'likes' | 'dislikes' | 'pet_peeves',
  items: string[]
): Promise<void> {
  if (!items || items.length === 0) return;
  
  const current = await loadCoreMemory(env);
  const existing = current.preferences[field] || [];
  const newItems = items.filter(item => !existing.includes(item));
  
  if (newItems.length > 0) {
    current.preferences[field] = [...existing, ...newItems];
    current.last_updated = new Date().toISOString();
    await env.MEMORY.put('core.json', JSON.stringify(current, null, 2));
    console.log(`Added to preferences.${field}:`, newItems);
  }
}

// ============================================
// PEOPLE MEMORY
// ============================================

export async function addOrUpdatePerson(
  env: MemoryEnv,
  slug: string,
  name: string,
  relationship: string,
  facts: string[] = [],
  sentiment: 'positive' | 'negative' | 'neutral' | 'complicated' = 'neutral'
): Promise<void> {
  const people = await loadPeople(env);
  const existing = people.people.find(p => p.slug === slug);
  
  if (existing) {
    existing.key_facts = [...new Set([...existing.key_facts, ...facts])];
    existing.sentiment = sentiment;
    existing.last_mentioned = new Date().toISOString();
    existing.mention_count++;
  } else {
    people.people.push({
      slug,
      name,
      relationship_to_user: relationship,
      key_facts: facts,
      sentiment,
      first_mentioned: new Date().toISOString(),
      last_mentioned: new Date().toISOString(),
      mention_count: 1,
    });
  }
  
  people.last_updated = new Date().toISOString();
  await env.MEMORY.put('people.json', JSON.stringify(people, null, 2));
}

export async function getPerson(env: MemoryEnv, slug: string): Promise<import('./types').PersonMemory | null> {
  const people = await loadPeople(env);
  return people.people.find(p => p.slug === slug) || null;
}

// ============================================
// THREADS
// ============================================

export async function addThread(
  env: MemoryEnv,
  topic: string,
  context: string
): Promise<string> {
  const threads = await loadThreads(env);
  const id = crypto.randomUUID();
  
  threads.active_threads.push({
    id,
    topic,
    context,
    created_at: new Date().toISOString(),
    last_referenced: null,
    resolved: false,
  });
  
  threads.last_updated = new Date().toISOString();
  await env.MEMORY.put('threads.json', JSON.stringify(threads, null, 2));
  return id;
}

export async function resolveThread(env: MemoryEnv, threadId: string): Promise<void> {
  const threads = await loadThreads(env);
  const thread = threads.active_threads.find(t => t.id === threadId);
  
  if (thread) {
    thread.resolved = true;
    threads.last_updated = new Date().toISOString();
    await env.MEMORY.put('threads.json', JSON.stringify(threads, null, 2));
  }
}

export async function resolveThreadByTopic(env: MemoryEnv, topic: string): Promise<void> {
  const threads = await loadThreads(env);
  const thread = threads.active_threads.find(
    t => t.topic.toLowerCase().includes(topic.toLowerCase()) && !t.resolved
  );
  
  if (thread) {
    thread.resolved = true;
    threads.last_updated = new Date().toISOString();
    await env.MEMORY.put('threads.json', JSON.stringify(threads, null, 2));
    console.log(`Resolved thread: ${thread.topic}`);
  }
}

export async function touchThread(env: MemoryEnv, threadId: string): Promise<void> {
  const threads = await loadThreads(env);
  const thread = threads.active_threads.find(t => t.id === threadId);
  
  if (thread) {
    thread.last_referenced = new Date().toISOString();
    threads.last_updated = new Date().toISOString();
    await env.MEMORY.put('threads.json', JSON.stringify(threads, null, 2));
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

async function loadCoreMemory(env: MemoryEnv): Promise<CoreMemory> {
  const obj = await env.MEMORY.get('core.json');
  return obj ? JSON.parse(await obj.text()) : DEFAULT_CORE_MEMORY;
}

async function loadRelationshipMemory(env: MemoryEnv): Promise<RelationshipMemory> {
  const obj = await env.MEMORY.get('relationship.json');
  return obj ? JSON.parse(await obj.text()) : DEFAULT_RELATIONSHIP_MEMORY;
}

async function loadThreads(env: MemoryEnv): Promise<ThreadsMemory> {
  const obj = await env.MEMORY.get('threads.json');
  return obj ? JSON.parse(await obj.text()) : DEFAULT_THREADS_MEMORY;
}

// ============================================
// FORMAT FOR PROMPT
// ============================================

export function formatMemoryForPrompt(hotMemory: HotMemory, people?: PeopleMemory): string {
  const { core, relationship, threads } = hotMemory;
  
  let memoryText = '## What you know about him\n\n';
  
  // Core facts
  if (core.name) memoryText += `Name: ${core.name}\n`;
  if (core.age) memoryText += `Age: ${core.age}\n`;
  if (core.location) memoryText += `Location: ${core.location}\n`;
  if (core.job.title || core.job.company) {
    memoryText += `Work: ${[core.job.title, core.job.company].filter(Boolean).join(' at ')}\n`;
  }
  if (core.relationship_status) memoryText += `Relationship: ${core.relationship_status}\n`;
  
  if (core.interests.length > 0) {
    memoryText += `\nInterests: ${core.interests.join(', ')}\n`;
  }
  
  if (core.preferences.likes.length > 0) {
    memoryText += `Likes: ${core.preferences.likes.join(', ')}\n`;
  }
  
  if (core.preferences.dislikes.length > 0) {
    memoryText += `Dislikes: ${core.preferences.dislikes.join(', ')}\n`;
  }
  
  if (core.goals.length > 0) {
    memoryText += `Goals: ${core.goals.join(', ')}\n`;
  }
  
  if (core.quirks.length > 0) {
    memoryText += `Quirks: ${core.quirks.join(', ')}\n`;
  }
  
  // People in his life
  if (people && people.people.length > 0) {
    memoryText += `\n## People in his life\n\n`;
    people.people.slice(0, 10).forEach(p => {
      const facts = p.key_facts.length > 0 ? ` — ${p.key_facts.join(', ')}` : '';
      memoryText += `- ${p.name} (${p.relationship_to_user})${facts}\n`;
    });
  }
  
  // Relationship
  memoryText += `\n## Your relationship\n\n`;
  memoryText += `Vibe: ${relationship.vibe}\n`;
  memoryText += `Trust: ${relationship.trust_level}\n`;
  memoryText += `Flirt level: ${relationship.flirt_level}\n`;
  
  if (relationship.inside_jokes.length > 0) {
    memoryText += `Inside jokes: ${relationship.inside_jokes.join('; ')}\n`;
  }
  
  if (relationship.highlights.length > 0) {
    memoryText += `Memorable moments: ${relationship.highlights.slice(-3).join('; ')}\n`;
  }
  
  if (relationship.patterns_noticed.length > 0) {
    memoryText += `Patterns you've noticed: ${relationship.patterns_noticed.join('; ')}\n`;
  }
  
  // Active threads
  if (threads.length > 0) {
    memoryText += `\n## Open threads to follow up on\n\n`;
    threads.forEach(t => {
      memoryText += `- ${t.topic}: ${t.context}\n`;
    });
  }
  
  return memoryText;
}
