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
// DETAILED STYLE GUIDE TYPE
// ============================================

export interface DetailedStyleGuide {
  voice: {
    core_quality: string;
    tone: string;
    emotional_register: string;
  };
  prose_style: {
    sentence_rhythm: {
      pattern: string;
      short_sentences: string;
      long_sentences: string;
      fragments: string;
    };
    word_choice: {
      principle: string;
      avoid: string;
      dialogue_tags: string;
    };
    paragraph_structure: {
      principle: string;
      interiority: string;
    };
  };
  pov_and_tense: {
    default: string;
    dual_pov: string;
    close_third: string;
    head_hopping: string;
  };
  dialogue: {
    principle: string;
    subtext: string;
    banter: {
      rhythm: string;
      function: string;
      balance: string;
    };
    tension_in_dialogue: string;
    avoid: {
      exposition_dumps: string;
      on_the_nose: string;
      uniform_voice: string;
    };
  };
  emotional_beats: {
    building: string;
    earning_moments: string;
    the_gut_punch: string;
    aftermath: string;
  };
  tension_and_pacing: {
    romantic_tension: {
      proximity: string;
      interruption: string;
      awareness: string;
      denial: string;
    };
    scene_pacing: {
      enter_late_leave_early: string;
      chapter_endings: string;
      chapter_openings: string;
    };
  };
  writing_heat: {
    philosophy: string;
    building_to_it: string;
    during: {
      stay_in_pov: string;
      sensory_specific: string;
      dialogue: string;
      emotion: string;
    };
    avoid: {
      purple_prose: string;
      mechanical: string;
      out_of_character: string;
    };
  };
  character_work: {
    interiority: string;
    wounds: string;
    flaws: string;
    desire_vs_need: string;
    growth: string;
  };
  structure: {
    opening: string;
    first_act: string;
    midpoint: string;
    dark_moment: string;
    resolution: string;
  };
  signature_techniques: {
    the_callback: string;
    the_list: string;
    the_pivot: string;
    the_mirror: string;
    the_specificity: string;
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
// LIBRARY FUNCTIONS
// ============================================

const LIBRARY_PREFIX = 'bethany/library';
const CRAFT_PREFIX = 'bethany/craft';
const WRITING_PREFIX = 'bethany/writing';
const IDEAS_PREFIX = 'bethany/ideas';

export async function initializeLibrary(bucket: R2Bucket): Promise<void> {
  const existing = await bucket.get(`${WRITING_PREFIX}/status.json`);
  if (existing) {
    console.log('Library already initialized');
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
    bucket.put(`${LIBRARY_PREFIX}/whiskey-and-regret/metadata.json`, JSON.stringify(firstBook, null, 2)),
    bucket.put(`${LIBRARY_PREFIX}/whiskey-and-regret/characters.json`, JSON.stringify(firstBookCharacters, null, 2)),
  ]);

  // Load and save the detailed style guide
  const styleGuide = await fetch('https://raw.githubusercontent.com/mrmicaiah/bethany/main/src/craft/style-guide-detailed.json');
  if (styleGuide.ok) {
    const styleData = await styleGuide.text();
    await bucket.put(`${CRAFT_PREFIX}/style-guide.json`, styleData);
  }

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

export async function getStyleGuide(bucket: R2Bucket): Promise<DetailedStyleGuide | null> {
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

// ============================================
// FORMAT STYLE GUIDE FOR WRITING PROMPT
// ============================================

export function formatStyleGuideForWriting(style: DetailedStyleGuide): string {
  return `## YOUR WRITING VOICE

**Core Quality**: ${style.voice.core_quality}
**Tone**: ${style.voice.tone}
**Emotional Register**: ${style.voice.emotional_register}

## PROSE MECHANICS

**Sentence Rhythm**: ${style.prose_style.sentence_rhythm.pattern}
- Short sentences: ${style.prose_style.sentence_rhythm.short_sentences}
- Fragments: ${style.prose_style.sentence_rhythm.fragments}

**Word Choice**: ${style.prose_style.word_choice.principle}
**Avoid**: ${style.prose_style.word_choice.avoid}

**POV**: ${style.pov_and_tense.default}

## DIALOGUE

${style.dialogue.principle}
**Subtext**: ${style.dialogue.subtext}
**Banter**: ${style.dialogue.banter.rhythm}
**Tension**: ${style.dialogue.tension_in_dialogue}

## EMOTIONAL BEATS

**Building**: ${style.emotional_beats.building}
**The Gut Punch**: ${style.emotional_beats.the_gut_punch}
**Aftermath**: ${style.emotional_beats.aftermath}

## ROMANTIC TENSION

**Proximity**: ${style.tension_and_pacing.romantic_tension.proximity}
**Interruption**: ${style.tension_and_pacing.romantic_tension.interruption}
**Denial**: ${style.tension_and_pacing.romantic_tension.denial}

## SCENE PACING

**Enter Late, Leave Early**: ${style.tension_and_pacing.scene_pacing.enter_late_leave_early}
**Chapter Endings**: ${style.tension_and_pacing.scene_pacing.chapter_endings}
**Chapter Openings**: ${style.tension_and_pacing.scene_pacing.chapter_openings}

## SIGNATURE TECHNIQUES

- **The Callback**: ${style.signature_techniques.the_callback}
- **The List**: ${style.signature_techniques.the_list}
- **The Pivot**: ${style.signature_techniques.the_pivot}
- **The Specificity**: ${style.signature_techniques.the_specificity}`;
}
