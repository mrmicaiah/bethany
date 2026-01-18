// ============================================
// LIBRARY TYPES
// ============================================

export interface BookMetadata {
  id: string;
  title: string;
  genre: string;
  subgenre?: string;
  status: 'idea' | 'outlining' | 'drafting' | 'revising' | 'complete' | 'published';
  blurb: string;
  word_count: number;
  chapter_count: number;
  started_at: string;
  completed_at?: string;
  published_at?: string;
}

export interface Character {
  name: string;
  role: 'protagonist' | 'love_interest' | 'supporting' | 'antagonist';
  age?: string;
  description: string;
  arc?: string;
  notes?: string;
}

export interface BookCharacters {
  characters: Character[];
  last_updated: string;
}

export interface ChapterMetadata {
  number: number;
  title?: string;
  pov?: string;
  word_count: number;
  summary?: string;
  status: 'outline' | 'draft' | 'revised' | 'final';
  written_at: string;
}

export interface Spark {
  id: string;
  spark: string;
  source?: string;
  type: 'premise' | 'character' | 'dialogue' | 'scene' | 'title' | 'raw';
  status: 'raw' | 'developing' | 'used' | 'discarded';
  created_at: string;
  notes?: string;
}

export interface IdeasFile {
  sparks: Spark[];
  last_updated: string;
}

export interface WritingStatus {
  current_project: string | null;
  mode: 'drafting' | 'revising' | 'resting' | 'outlining';
  word_count_today: number;
  chapter_in_progress: number;
  deadline?: string;
  streak: number;
  last_writing_session: string;
}

// ============================================
// STYLE GUIDE TYPE (matches style-guide.json)
// ============================================

export interface StyleGuide {
  voice: {
    overall: string;
    tone: string;
    pov: string;
    tense: string;
  };
  sentence_craft: {
    rhythm: string;
    paragraphing: string;
    word_choice: string;
    verbs: string;
  };
  dialogue: {
    style: string;
    tags: string;
    realism: string;
    chemistry: string;
  };
  emotional_craft: {
    show_dont_tell: string;
    interiority: string;
    vulnerability: string;
    earned_emotion: string;
  };
  tension_and_pacing: {
    chapter_openings: string;
    chapter_endings: string;
    scene_breaks: string;
    slow_burn: string;
  };
  romance_specific: {
    first_meeting: string;
    physical_awareness: string;
    the_first_kiss: string;
    heat_level: string;
    conflict: string;
    dark_moment: string;
    resolution: string;
  };
  signature_techniques: {
    the_callback: string;
    the_list: string;
    the_direct_address: string;
    the_loaded_pause: string;
    the_body_tells: string;
  };
  things_to_avoid: {
    adverbs: string;
    info_dumps: string;
    perfect_characters: string;
    rushed_pacing: string;
    cliches: string;
    convenient_plot: string;
  };
  process_notes: {
    drafting: string;
    revision: string;
    dialogue_pass: string;
    emotion_pass: string;
  };
}

export interface RomanceBeats {
  meet_cute: string;
  building_tension: string;
  first_kiss: string;
  conflict: string;
  dark_moment: string;
  grand_gesture: string;
  resolution: string;
  heat_level: string;
  emotional_core: string;
}

// ============================================
// THE ACTUAL STYLE GUIDE DATA
// ============================================

const STYLE_GUIDE_DATA: StyleGuide = {
  voice: {
    overall: "Intimate, confessional, like the reader is eavesdropping on someone's most private thoughts. The prose feels like a secret being shared.",
    tone: "Conversational but literary. Smart without being pretentious. Emotional without being melodramatic. Funny when it needs to be, devastating when it counts.",
    pov: "First person, deep POV. The reader should forget they're reading — they're inside this person's head. Dual POV for romance, alternating chapters, each voice distinct.",
    tense: "Past tense for narrative, present tense sparingly for emphasis in emotional peaks."
  },
  sentence_craft: {
    rhythm: "Vary sentence length deliberately. Short punchy sentences for impact. Longer flowing ones for emotion and introspection. Fragments for emphasis. The rhythm should match the emotional beat of the scene.",
    paragraphing: "Short paragraphs in tense moments — white space creates pace. Longer paragraphs when settling into emotion or memory. Single-sentence paragraphs hit like a punch.",
    word_choice: "Specific over general. 'Bourbon' not 'drink.' 'Thursday' not 'one day.' Concrete details anchor emotional moments. Avoid adjective stacking.",
    verbs: "Strong verbs carry weight. Cut adverbs ruthlessly. 'She slammed the door' not 'She closed the door angrily.' Let the verb do the work."
  },
  dialogue: {
    style: "Banter-forward. Characters talk around what they mean. Subtext is everything — the tension lives in what's NOT said.",
    tags: "Use 'said' and 'asked' mostly. Avoid adverbs in dialogue tags entirely. Let the dialogue itself convey tone. Better yet, use action beats instead of tags.",
    realism: "Real people interrupt each other. They don't finish sentences. They change subjects. They say 'um' and 'I mean' and trail off. Dialogue should feel overheard, not scripted.",
    chemistry: "Banter reveals character. Each person should have a distinct voice. Witty doesn't mean quippy — it means sharp, specific, earned. The best flirty dialogue feels like a tennis match."
  },
  emotional_craft: {
    show_dont_tell: "Never write 'she felt sad.' Show it in the body — tight chest, held breath, the way she can't look at him. Emotion lives in physical sensation and behavior.",
    interiority: "Internal monologue is where the magic happens. Let the character process, contradict themselves, lie to themselves, realize things mid-thought. Stream of consciousness that still reads clean.",
    vulnerability: "The most powerful moments are when characters admit something true. Not big dramatic confessions — small, specific vulnerabilities. 'I kept the ticket stub' hits harder than 'I never stopped loving you.'",
    earned_emotion: "Big emotional payoffs require buildup. Plant seeds early. The reader should feel the weight of history when the moment arrives. Shortcuts feel cheap."
  },
  tension_and_pacing: {
    chapter_openings: "Hook immediately. Start with action, a striking image, a provocative thought, or mid-conversation. Never start with weather or waking up.",
    chapter_endings: "End on a turn — a revelation, a question, a shift. The reader should feel compelled to keep going. Micro-cliffhangers, not just plot ones. Emotional turns count.",
    scene_breaks: "Use white space strategically. A scene break can skip boring transitions, create tension through what's not shown, or signal a shift in energy.",
    slow_burn: "Anticipation is everything. Delay gratification. The almost-kiss interrupted. The loaded silence. The accidental touch. Make the reader desperate for the payoff."
  },
  romance_specific: {
    first_meeting: "Friction creates spark. They shouldn't like each other, or the timing is wrong, or circumstances are impossible. Attraction should feel inconvenient.",
    physical_awareness: "Before any kiss, there should be chapters of physical awareness. Noticing hands. The way he smells. The space between them feeling charged. The body knows before the mind admits it.",
    the_first_kiss: "Earn it. Build unbearable tension. It should feel inevitable AND surprising. Often best when interrupted or complicated. The kiss changes everything — there's no going back.",
    heat_level: "Steamy but earned. Build anticipation. Their first time together is a scene, not a summary. Emotion intertwined with physical — what does this mean to them? Specific and honest beats flowery.",
    conflict: "Internal wounds meeting external pressure. The thing they're most afraid of should be exactly what the relationship forces them to confront. Miscommunication only works if it's rooted in character, not convenience.",
    dark_moment: "All seems lost. They push each other away. The reader has to genuinely feel it might be over. This is where theme crystallizes — what is this story really about?",
    resolution: "Satisfying but not saccharine. The wound is healed but the scar remains. They're better together, but they've both changed. Earn the happiness."
  },
  signature_techniques: {
    the_callback: "Plant a small detail early — a phrase, an object, a memory. Bring it back later with new meaning. The reader feels smart for remembering, and the story feels crafted.",
    the_list: "Sometimes a character's thoughts come as a list. What she knows. What she wishes she didn't. Three things she'll never tell him. It creates intimacy and rhythm.",
    the_direct_address: "Occasionally, the narrator speaks directly to the reader or to another character in their head. 'You probably think I should have left then. I did too.' Creates intimacy.",
    the_loaded_pause: "After someone says something significant, don't rush to the response. Let the silence breathe. What happens in that pause? What does the character notice, think, feel?",
    the_body_tells: "In emotional moments, ground the reader in physical sensation. Tight throat. Shaking hands. The way she can't quite breathe. The body reacts before the mind processes."
  },
  things_to_avoid: {
    adverbs: "Especially in dialogue tags. Almost always a sign of weak verb choice or unclear dialogue.",
    info_dumps: "Weave backstory through action and dialogue. The reader doesn't need to know everything upfront. Mystery is engaging.",
    perfect_characters: "Flaws make characters lovable, not unlikable. Give them contradictions. Let them make mistakes. Let them be wrong sometimes.",
    rushed_pacing: "If a moment matters, give it space. The dark moment needs weight. The first kiss needs buildup. The resolution needs room to breathe.",
    cliches: "Avoid phrases you've read a hundred times. Find a fresh way to say it or cut it. 'Her heart skipped a beat' is dead. What does YOUR character's body do?",
    convenient_plot: "If something only happens to move plot forward, the reader feels it. Every event should feel both surprising and inevitable in retrospect."
  },
  process_notes: {
    drafting: "Write fast and messy. Don't edit while drafting. Get the story down. The magic happens in revision.",
    revision: "Read aloud. Cut 10% minimum. Every scene should do at least two things — advance plot AND reveal character, or build relationship AND raise stakes.",
    dialogue_pass: "Do a pass just for dialogue. Read it out loud. Does each character sound distinct? Could you tell who's speaking without tags?",
    emotion_pass: "Do a pass for emotional beats. Are you showing or telling? Is every big moment earned? Where can you add physical sensation?"
  }
};

// ============================================
// LIBRARY FUNCTIONS
// ============================================

const LIBRARY_PREFIX = 'bethany/library';
const CRAFT_PREFIX = 'bethany/craft';
const WRITING_PREFIX = 'bethany/writing';
const IDEAS_PREFIX = 'bethany/ideas';

export async function initializeLibrary(bucket: R2Bucket): Promise<void> {
  const existing = await bucket.get(`${WRITING_PREFIX}/status.json`);
  if (existing) {
    // Check if style guide needs updating (wrong format)
    const styleObj = await bucket.get(`${CRAFT_PREFIX}/style-guide.json`);
    if (styleObj) {
      const styleText = await styleObj.text();
      const style = JSON.parse(styleText);
      // If old format (voice is array), update it
      if (Array.isArray(style.voice)) {
        console.log('Updating style guide to new format...');
        await bucket.put(`${CRAFT_PREFIX}/style-guide.json`, JSON.stringify(STYLE_GUIDE_DATA, null, 2));
      }
    } else {
      // No style guide, create it
      await bucket.put(`${CRAFT_PREFIX}/style-guide.json`, JSON.stringify(STYLE_GUIDE_DATA, null, 2));
    }
    return;
  }

  const now = new Date().toISOString();

  // Initialize writing status
  const status: WritingStatus = {
    current_project: 'whiskey-and-regret',
    mode: 'drafting',
    word_count_today: 0,
    chapter_in_progress: 1,
    streak: 0,
    last_writing_session: now,
  };

  // Initialize ideas
  const ideas: IdeasFile = {
    sparks: [],
    last_updated: now,
  };

  // Initialize romance beats
  const romanceBeats: RomanceBeats = {
    meet_cute: 'Friction first. They don\'t like each other, or circumstances are wrong. The attraction is inconvenient. Something forces proximity.',
    building_tension: 'Forced togetherness. Small moments of connection. They see each other differently. Physical awareness grows. Almost-moments.',
    first_kiss: 'Earned, not rushed. Tension has to be unbearable. Often interrupted or complicated. The kiss changes everything — no going back.',
    conflict: 'Internal wounds meet external pressure. The thing they\'re afraid of happens. Miscommunication rooted in character, not convenience.',
    dark_moment: 'All seems lost. They push each other away. The reader has to feel it\'s really over. This is where theme crystallizes.',
    grand_gesture: 'Not about scale — about meaning. Character growth made visible. They choose each other knowing the cost.',
    resolution: 'Satisfying but not saccharine. The wound is healed but the scar remains. They\'re better together than apart.',
    heat_level: 'Steamy but earned. Build anticipation. First time together is a scene, not a summary. Emotion intertwined with physical.',
    emotional_core: 'Every romance is about two people learning to be vulnerable. The external plot serves the internal journey.',
  };

  // Create first book
  const firstBook: BookMetadata = {
    id: 'whiskey-and-regret',
    title: 'Whiskey and Regret',
    genre: 'Contemporary Romance',
    subgenre: 'Second Chance',
    status: 'drafting',
    blurb: 'She left town to forget him. Ten years later, she\'s back for her father\'s funeral — and he\'s the one handling the estate.',
    word_count: 0,
    chapter_count: 0,
    started_at: now,
  };

  const firstBookCharacters: BookCharacters = {
    characters: [
      {
        name: 'Margot Chen',
        role: 'protagonist',
        age: '32',
        description: 'Literary agent in NYC. Sharp, guarded, still carrying the weight of leaving. Hasn\'t been home in a decade. Uses sarcasm as armor. Workaholic who\'s forgotten what she actually wants.',
        arc: 'Learning that running from pain doesn\'t heal it. Opening up again. Choosing to stay instead of flee.',
      },
      {
        name: 'Eli Vance',
        role: 'love_interest',
        age: '34',
        description: 'Estate attorney who stayed in their small town. Steady, patient exterior masking buried anger about being left behind. Builds furniture in his spare time. Never got over her.',
        arc: 'Confronting whether staying was strength or fear. Letting go of resentment. Risking heartbreak again.',
      },
      {
        name: 'June Chen',
        role: 'supporting',
        age: '68',
        description: 'Margot\'s mother. Keeper of secrets. Knows more about why Margot really left than she lets on.',
        arc: 'Revealing the truth. Letting her daughter make her own choices.',
      },
      {
        name: 'Ben Vance',
        role: 'supporting',
        age: '30',
        description: 'Eli\'s younger brother. Bartender. Comic relief but with depth. Was a kid when Margot left, sees the situation more clearly than either lead.',
        arc: 'Catalyst for truth-telling. Forces the leads to confront their bullshit.',
      },
    ],
    last_updated: now,
  };

  // Write all files
  await Promise.all([
    bucket.put(`${WRITING_PREFIX}/status.json`, JSON.stringify(status, null, 2)),
    bucket.put(`${IDEAS_PREFIX}/sparks.json`, JSON.stringify(ideas, null, 2)),
    bucket.put(`${CRAFT_PREFIX}/romance-beats.json`, JSON.stringify(romanceBeats, null, 2)),
    bucket.put(`${CRAFT_PREFIX}/style-guide.json`, JSON.stringify(STYLE_GUIDE_DATA, null, 2)),
    bucket.put(`${LIBRARY_PREFIX}/whiskey-and-regret/metadata.json`, JSON.stringify(firstBook, null, 2)),
    bucket.put(`${LIBRARY_PREFIX}/whiskey-and-regret/characters.json`, JSON.stringify(firstBookCharacters, null, 2)),
  ]);

  console.log('Library initialized');
}

export async function getWritingStatus(bucket: R2Bucket): Promise<WritingStatus | null> {
  const obj = await bucket.get(`${WRITING_PREFIX}/status.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function updateWritingStatus(bucket: R2Bucket, updates: Partial<WritingStatus>): Promise<void> {
  const current = await getWritingStatus(bucket);
  if (!current) return;
  
  const updated = { ...current, ...updates };
  await bucket.put(`${WRITING_PREFIX}/status.json`, JSON.stringify(updated, null, 2));
}

export async function getStyleGuide(bucket: R2Bucket): Promise<StyleGuide | null> {
  const obj = await bucket.get(`${CRAFT_PREFIX}/style-guide.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function getRomanceBeats(bucket: R2Bucket): Promise<RomanceBeats | null> {
  const obj = await bucket.get(`${CRAFT_PREFIX}/romance-beats.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function listBooks(bucket: R2Bucket): Promise<BookMetadata[]> {
  const listed = await bucket.list({ prefix: `${LIBRARY_PREFIX}/` });
  const bookIds = new Set<string>();
  
  for (const obj of listed.objects) {
    const parts = obj.key.replace(`${LIBRARY_PREFIX}/`, '').split('/');
    if (parts[0]) bookIds.add(parts[0]);
  }
  
  const books: BookMetadata[] = [];
  for (const bookId of bookIds) {
    const metaObj = await bucket.get(`${LIBRARY_PREFIX}/${bookId}/metadata.json`);
    if (metaObj) {
      books.push(JSON.parse(await metaObj.text()));
    }
  }
  
  return books;
}

export async function getBook(bucket: R2Bucket, bookId: string): Promise<BookMetadata | null> {
  const obj = await bucket.get(`${LIBRARY_PREFIX}/${bookId}/metadata.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function getBookCharacters(bucket: R2Bucket, bookId: string): Promise<BookCharacters | null> {
  const obj = await bucket.get(`${LIBRARY_PREFIX}/${bookId}/characters.json`);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function listChapters(bucket: R2Bucket, bookId: string): Promise<ChapterMetadata[]> {
  const listed = await bucket.list({ prefix: `${LIBRARY_PREFIX}/${bookId}/chapters/` });
  const chapters: ChapterMetadata[] = [];
  
  for (const obj of listed.objects) {
    if (obj.key.endsWith('-meta.json')) {
      const metaObj = await bucket.get(obj.key);
      if (metaObj) {
        chapters.push(JSON.parse(await metaObj.text()));
      }
    }
  }
  
  return chapters.sort((a, b) => a.number - b.number);
}

export async function getChapter(bucket: R2Bucket, bookId: string, chapterNum: number): Promise<string | null> {
  const obj = await bucket.get(`${LIBRARY_PREFIX}/${bookId}/chapters/chapter-${chapterNum.toString().padStart(2, '0')}.md`);
  if (!obj) return null;
  return await obj.text();
}

export async function saveChapter(
  bucket: R2Bucket, 
  bookId: string, 
  chapterNum: number, 
  content: string,
  metadata: Partial<ChapterMetadata>
): Promise<void> {
  const now = new Date().toISOString();
  const paddedNum = chapterNum.toString().padStart(2, '0');
  
  // Save content
  await bucket.put(
    `${LIBRARY_PREFIX}/${bookId}/chapters/chapter-${paddedNum}.md`,
    content
  );
  
  // Save/update metadata
  const meta: ChapterMetadata = {
    number: chapterNum,
    word_count: content.split(/\s+/).length,
    status: 'draft',
    written_at: now,
    ...metadata,
  };
  
  await bucket.put(
    `${LIBRARY_PREFIX}/${bookId}/chapters/chapter-${paddedNum}-meta.json`,
    JSON.stringify(meta, null, 2)
  );
  
  // Update book metadata
  const book = await getBook(bucket, bookId);
  if (book) {
    const chapters = await listChapters(bucket, bookId);
    const totalWords = chapters.reduce((sum, ch) => sum + ch.word_count, 0) + meta.word_count;
    
    await bucket.put(
      `${LIBRARY_PREFIX}/${bookId}/metadata.json`,
      JSON.stringify({
        ...book,
        word_count: totalWords,
        chapter_count: Math.max(book.chapter_count, chapterNum),
      }, null, 2)
    );
  }
}

export async function addSpark(bucket: R2Bucket, spark: Omit<Spark, 'id' | 'created_at' | 'status'>): Promise<void> {
  const obj = await bucket.get(`${IDEAS_PREFIX}/sparks.json`);
  let ideas: IdeasFile;
  
  if (!obj) {
    ideas = { sparks: [], last_updated: new Date().toISOString() };
  } else {
    ideas = JSON.parse(await obj.text());
  }
  
  ideas.sparks.push({
    ...spark,
    id: crypto.randomUUID(),
    status: 'raw',
    created_at: new Date().toISOString(),
  });
  
  ideas.last_updated = new Date().toISOString();
  await bucket.put(`${IDEAS_PREFIX}/sparks.json`, JSON.stringify(ideas, null, 2));
}

export async function getSparks(bucket: R2Bucket): Promise<Spark[]> {
  const obj = await bucket.get(`${IDEAS_PREFIX}/sparks.json`);
  if (!obj) return [];
  const ideas = JSON.parse(await obj.text()) as IdeasFile;
  return ideas.sparks;
}

// ============================================
// EXCERPT FOR TEXTING (limited length)
// ============================================

export async function getRandomExcerpt(bucket: R2Bucket, maxLength: number = 500): Promise<{ excerpt: string; source: string } | null> {
  const books = await listBooks(bucket);
  const booksWithChapters = [];
  
  for (const book of books) {
    const chapters = await listChapters(bucket, book.id);
    if (chapters.length > 0) {
      booksWithChapters.push({ book, chapters });
    }
  }
  
  if (booksWithChapters.length === 0) return null;
  
  // Pick random book and chapter
  const { book, chapters } = booksWithChapters[Math.floor(Math.random() * booksWithChapters.length)];
  const chapter = chapters[Math.floor(Math.random() * chapters.length)];
  
  const content = await getChapter(bucket, book.id, chapter.number);
  if (!content) return null;
  
  // Find a good excerpt - look for paragraph breaks
  const paragraphs = content.split('\n\n').filter(p => p.trim().length > 100);
  if (paragraphs.length === 0) return null;
  
  let excerpt = paragraphs[Math.floor(Math.random() * paragraphs.length)];
  
  // Trim to max length at sentence boundary
  if (excerpt.length > maxLength) {
    const sentences = excerpt.match(/[^.!?]+[.!?]+/g) || [];
    excerpt = '';
    for (const sentence of sentences) {
      if ((excerpt + sentence).length > maxLength) break;
      excerpt += sentence;
    }
  }
  
  return {
    excerpt: excerpt.trim(),
    source: `${book.title}, Chapter ${chapter.number}`,
  };
}
