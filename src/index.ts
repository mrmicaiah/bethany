export { Bethany } from './agent';
import { 
  initializeLibrary, 
  getWritingStatus, 
  listBooks, 
  getBook, 
  listChapters, 
  getChapter,
  getStyleGuide,
  getRomanceBeats,
  getSparks
} from './library';

interface Env {
  DB: D1Database;
  MEMORY: R2Bucket;
  BETHANY: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  SENDBLUE_API_KEY: string;
  SENDBLUE_API_SECRET: string;
  SENDBLUE_PHONE_NUMBER: string;
  MICAIAH_PHONE_NUMBER: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers for dashboard
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Get the singleton Bethany instance
    const id = env.BETHANY.idFromName('bethany-v12');
    const bethany = env.BETHANY.get(id);

    // ============================================
    // LIBRARY API ROUTES
    // ============================================
    
    // Initialize library if needed
    if (url.pathname.startsWith('/library')) {
      await initializeLibrary(env.MEMORY);
    }
    
    // Writing status
    if (url.pathname === '/library/status') {
      const status = await getWritingStatus(env.MEMORY);
      return new Response(JSON.stringify(status), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // List all books
    if (url.pathname === '/library/books' && request.method === 'GET') {
      const books = await listBooks(env.MEMORY);
      return new Response(JSON.stringify(books), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get specific book
    const bookMatch = url.pathname.match(/^\/library\/books\/([^/]+)$/);
    if (bookMatch && request.method === 'GET') {
      const book = await getBook(env.MEMORY, bookMatch[1]);
      if (!book) return new Response('Not found', { status: 404, headers: corsHeaders });
      return new Response(JSON.stringify(book), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // List chapters for a book
    const chaptersMatch = url.pathname.match(/^\/library\/books\/([^/]+)\/chapters$/);
    if (chaptersMatch && request.method === 'GET') {
      const chapters = await listChapters(env.MEMORY, chaptersMatch[1]);
      return new Response(JSON.stringify(chapters), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get specific chapter
    const chapterMatch = url.pathname.match(/^\/library\/books\/([^/]+)\/chapters\/(\d+)$/);
    if (chapterMatch && request.method === 'GET') {
      const content = await getChapter(env.MEMORY, chapterMatch[1], parseInt(chapterMatch[2]));
      if (!content) return new Response('Not found', { status: 404, headers: corsHeaders });
      return new Response(content, {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
    
    // Get style guide
    if (url.pathname === '/library/craft/style') {
      const style = await getStyleGuide(env.MEMORY);
      return new Response(JSON.stringify(style), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get romance beats
    if (url.pathname === '/library/craft/romance-beats') {
      const beats = await getRomanceBeats(env.MEMORY);
      return new Response(JSON.stringify(beats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get ideas/sparks
    if (url.pathname === '/library/ideas') {
      const sparks = await getSparks(env.MEMORY);
      return new Response(JSON.stringify(sparks), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ============================================
    // MESSAGING ROUTES
    // ============================================

    // SendBlue iMessage webhook
    if (url.pathname === '/imessage' && request.method === 'POST') {
      const data = await request.json() as any;
      const from = data.from_number || data.number;
      const body = data.content || data.message || data.text;

      console.log('iMessage from', from, ':', body);

      if (from !== env.MICAIAH_PHONE_NUMBER) {
        console.log('iMessage from unknown number:', from);
        return new Response('OK');
      }

      ctx.waitUntil(
        bethany.fetch(new Request('https://bethany/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body })
        }))
      );

      return new Response('OK');
    }

    // Legacy SMS webhook
    if (url.pathname === '/sms' && request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      
      let from: string;
      let body: string;
      
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        from = formData.get('From') as string;
        body = formData.get('Body') as string;
      } else {
        const data = await request.json() as any;
        from = data.from_number || data.From;
        body = data.content || data.Body;
      }

      console.log('SMS from', from, ':', body);

      if (from !== env.MICAIAH_PHONE_NUMBER) {
        console.log('SMS from unknown number:', from);
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' }
        });
      }

      ctx.waitUntil(
        bethany.fetch(new Request('https://bethany/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body })
        }))
      );

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // ============================================
    // TRIGGERS & DEBUG
    // ============================================

    if (url.pathname === '/trigger/morning') {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/morningBriefing')));
      return new Response('Morning briefing triggered');
    }
    if (url.pathname === '/trigger/midday') {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/middayCheck')));
      return new Response('Midday check triggered');
    }
    if (url.pathname === '/trigger/evening') {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/eveningSynthesis')));
      return new Response('Evening synthesis triggered');
    }
    if (url.pathname === '/trigger/check') {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/awarenessCheck')));
      return new Response('Awareness check triggered');
    }
    if (url.pathname === '/trigger/write') {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/writingSession')));
      return new Response('Writing session triggered - check /library/status in a minute');
    }

    // Debug: check memory
    if (url.pathname === '/debug/memory') {
      return bethany.fetch(new Request('https://bethany/debug/memory'));
    }
    
    // Debug: check current session
    if (url.pathname === '/debug/session') {
      return bethany.fetch(new Request('https://bethany/debug/session'));
    }
    
    // Debug: check notes
    if (url.pathname === '/debug/notes') {
      return bethany.fetch(new Request('https://bethany/debug/notes'));
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('Bethany v12 - session memory');
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.BETHANY.idFromName('bethany-v12');
    const bethany = env.BETHANY.get(id);

    const hour = new Date().getUTCHours();
    const centralHour = (hour - 6 + 24) % 24; // Central time

    // Morning writing session (9am Central)
    if (centralHour === 9) {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/writingSession')));
    }
    
    // Regular rhythms
    if (centralHour === 10) {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/morningBriefing')));
    } else if (centralHour === 14) {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/middayCheck')));
    } else if (centralHour === 20) {
      ctx.waitUntil(bethany.fetch(new Request('https://bethany/rhythm/eveningSynthesis')));
    }
  }
};
