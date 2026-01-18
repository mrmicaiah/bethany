export { Bethany } from './agent';

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
    
    // Get the singleton Bethany instance - v10 with memory
    const id = env.BETHANY.idFromName('bethany-v10');
    const bethany = env.BETHANY.get(id);

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

    // Manual triggers
    if (url.pathname === '/trigger/morning') {
      await bethany.fetch(new Request('https://bethany/rhythm/morningBriefing'));
      return new Response('Morning briefing triggered');
    }
    if (url.pathname === '/trigger/midday') {
      await bethany.fetch(new Request('https://bethany/rhythm/middayCheck'));
      return new Response('Midday check triggered');
    }
    if (url.pathname === '/trigger/evening') {
      await bethany.fetch(new Request('https://bethany/rhythm/eveningSynthesis'));
      return new Response('Evening synthesis triggered');
    }
    if (url.pathname === '/trigger/check') {
      await bethany.fetch(new Request('https://bethany/rhythm/awarenessCheck'));
      return new Response('Awareness check triggered');
    }

    // Debug: check memory
    if (url.pathname === '/debug/memory') {
      return bethany.fetch(new Request('https://bethany/debug/memory'));
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('Bethany v10 - with R2 memory');
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.BETHANY.idFromName('bethany-v10');
    const bethany = env.BETHANY.get(id);

    const hour = new Date().getUTCHours();
    const easternHour = (hour - 5 + 24) % 24;

    if (easternHour === 6) {
      await bethany.fetch(new Request('https://bethany/rhythm/morningBriefing'));
    } else if (easternHour === 12) {
      await bethany.fetch(new Request('https://bethany/rhythm/middayCheck'));
    } else if (easternHour === 18) {
      await bethany.fetch(new Request('https://bethany/rhythm/eveningSynthesis'));
    } else if (easternHour % 2 === 0) {
      await bethany.fetch(new Request('https://bethany/rhythm/awarenessCheck'));
    }
  }
};
