// ============================================
// FACT EXTRACTION
// ============================================
// Extracts facts from conversation exchanges and
// updates memory in real-time.

import { CoreMemory, PersonMemory } from './types';

// ============================================
// TYPES
// ============================================

interface ExtractionResult {
  core_updates: Partial<CoreMemory> | null;
  people_updates: Array<{
    slug: string;
    name: string;
    relationship: string;
    facts: string[];
    sentiment: 'positive' | 'negative' | 'neutral' | 'complicated';
  }>;
  new_interests: string[];
  new_likes: string[];
  new_dislikes: string[];
  new_goals: string[];
  new_quirks: string[];
  inside_joke: string | null;
  thread_to_open: { topic: string; context: string } | null;
  thread_to_close: string | null;
}

interface ExtractionEnv {
  ANTHROPIC_API_KEY: string;
}

// ============================================
// EXTRACTION PROMPT
// ============================================

const EXTRACTION_SYSTEM = `You extract facts from text conversations to update a memory system.

You will receive:
1. The user's message
2. The AI's response
3. Current memory state (so you know what's already stored)

Your job: Identify NEW facts worth remembering. Be selective — only extract things that would be useful to remember in future conversations.

## What to extract:

**Core facts** (only if explicitly stated or clearly implied):
- Name, age, location changes
- Job/work updates
- Relationship status changes
- Living situation

**People mentioned**:
- New people with their relationship to the user
- New facts about known people
- Sentiment toward people (positive/negative/neutral/complicated)

**Preferences & personality**:
- Interests, hobbies
- Likes and dislikes
- Goals or aspirations
- Quirks or habits

**Relationship dynamics**:
- Inside jokes (if something becomes a recurring joke or reference)
- Threads to follow up on (topics left unresolved)
- Threads to close (if a topic was resolved)

## What NOT to extract:
- Things already in memory
- Trivial conversational filler
- Temporary states ("I'm tired today")
- Anything uncertain or ambiguous

Respond with JSON only. Use null for fields with no updates.`;

const EXTRACTION_FORMAT = `{
  "core_updates": {
    "name": "string or null",
    "age": "string or null",
    "location": "string or null",
    "job": {
      "title": "string or null",
      "company": "string or null",
      "industry": "string or null"
    },
    "relationship_status": "string or null",
    "living_situation": "string or null"
  },
  "people_updates": [
    {
      "slug": "lowercase-no-spaces",
      "name": "Display Name",
      "relationship": "who they are to the user",
      "facts": ["fact 1", "fact 2"],
      "sentiment": "positive|negative|neutral|complicated"
    }
  ],
  "new_interests": ["interest1", "interest2"],
  "new_likes": ["like1"],
  "new_dislikes": ["dislike1"],
  "new_goals": ["goal1"],
  "new_quirks": ["quirk1"],
  "inside_joke": "string or null",
  "thread_to_open": {
    "topic": "topic name",
    "context": "brief context"
  },
  "thread_to_close": "topic name or null"
}`;

// ============================================
// EXTRACT FACTS
// ============================================

export async function extractFacts(
  env: ExtractionEnv,
  userMessage: string,
  aiResponse: string,
  currentMemory: string
): Promise<ExtractionResult | null> {
  const prompt = `## Current Memory State
${currentMemory}

## New Exchange

**Him**: ${userMessage}

**You replied**: ${aiResponse}

---

Extract any NEW facts worth remembering. Respond with JSON only.

Format:
${EXTRACTION_FORMAT}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Extraction API error:', await response.text());
      return null;
    }

    const data = await response.json() as any;
    const text = data.content?.find((b: any) => b.type === 'text')?.text;
    
    if (!text) {
      console.error('No text in extraction response');
      return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
    }

    const result = JSON.parse(jsonStr) as ExtractionResult;
    return result;
  } catch (error) {
    console.error('Fact extraction failed:', error);
    return null;
  }
}

// ============================================
// CHECK IF EXTRACTION HAS CONTENT
// ============================================

export function hasExtractedContent(result: ExtractionResult): boolean {
  if (!result) return false;
  
  // Check core updates
  if (result.core_updates) {
    const core = result.core_updates;
    if (core.name || core.age || core.location || core.relationship_status || core.living_situation) {
      return true;
    }
    if (core.job && (core.job.title || core.job.company || core.job.industry)) {
      return true;
    }
  }
  
  // Check arrays
  if (result.people_updates?.length > 0) return true;
  if (result.new_interests?.length > 0) return true;
  if (result.new_likes?.length > 0) return true;
  if (result.new_dislikes?.length > 0) return true;
  if (result.new_goals?.length > 0) return true;
  if (result.new_quirks?.length > 0) return true;
  
  // Check singles
  if (result.inside_joke) return true;
  if (result.thread_to_open) return true;
  if (result.thread_to_close) return true;
  
  return false;
}
