export { Bethany } from './agent';

interface Env {
  DB: D1Database;
  BETHANY: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  MICAIAH_PHONE_NUMBER: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Get the singleton Bethany instance
    const id = env.BETHANY.idFromName('bethany-singleton');
    const bethany = env.BETHANY.get(id);

    // Twilio SMS webhook
    if (url.pathname === '/sms' && request.method === 'POST') {
      const formData = await request.formData();
      const from = formData.get('From') as string;
      const body = formData.get('Body') as string;

      console.log('SMS from', from, ':', body);

      // Verify it's from Micaiah
      if (from !== env.MICAIAH_PHONE_NUMBER) {
        console.log('SMS from unknown number:', from);
        return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
          headers: { 'Content-Type': 'text/xml' }
        });
      }

      // Forward to Bethany DO
      ctx.waitUntil(
        bethany.fetch(new Request('https://bethany/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: body })
        }))
      );

      // Return empty TwiML (we'll respond async)
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Manual triggers for testing
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

    // Health check
    if (url.pathname === '/health') {
      return new Response('Bethany is here.');
    }

    return new Response('Not found', { status: 404 });
  },

  // Scheduled triggers (cron)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.BETHANY.idFromName('bethany-singleton');
    const bethany = env.BETHANY.get(id);

    const hour = new Date().getUTCHours();
    
    // Convert to Eastern time (UTC-5)
    const easternHour = (hour - 5 + 24) % 24;

    if (easternHour === 6) {
      // 6:30 AM Eastern - morning briefing
      await bethany.fetch(new Request('https://bethany/rhythm/morningBriefing'));
    } else if (easternHour === 12) {
      // 12 PM Eastern - midday check
      await bethany.fetch(new Request('https://bethany/rhythm/middayCheck'));
    } else if (easternHour === 18) {
      // 6 PM Eastern - evening synthesis
      await bethany.fetch(new Request('https://bethany/rhythm/eveningSynthesis'));
    } else if (easternHour % 2 === 0) {
      // Every 2 hours - awareness check
      await bethany.fetch(new Request('https://bethany/rhythm/awarenessCheck'));
    }
  }
};
