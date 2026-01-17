import { Bethany } from './agent';

export { Bethany };

interface Env {
  BETHANY: DurableObjectNamespace;
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  MICAIAH_PHONE_NUMBER: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Twilio webhook for incoming SMS
    if (url.pathname === '/sms' && request.method === 'POST') {
      return handleIncomingSMS(request, env);
    }

    // Manual trigger endpoints (for testing)
    if (url.pathname === '/trigger/morning') {
      return triggerRhythm(env, 'morningBriefing');
    }
    if (url.pathname === '/trigger/midday') {
      return triggerRhythm(env, 'middayCheck');
    }
    if (url.pathname === '/trigger/evening') {
      return triggerRhythm(env, 'eveningSynthesis');
    }
    if (url.pathname === '/trigger/check') {
      return triggerRhythm(env, 'awarenessCheck');
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', name: 'Bethany' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleIncomingSMS(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const body = formData.get('Body') as string;
  const from = formData.get('From') as string;

  // Verify it's from Micaiah's number
  if (from !== env.MICAIAH_PHONE_NUMBER) {
    console.log('SMS from unknown number:', from);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  }

  // Get the Bethany instance (single instance for Micaiah)
  const id = env.BETHANY.idFromName('micaiah');
  const bethany = env.BETHANY.get(id);

  // Send the message to Bethany
  await bethany.fetch(new Request('https://bethany/sms', {
    method: 'POST',
    body: JSON.stringify({ message: body }),
    headers: { 'Content-Type': 'application/json' }
  }));

  // Return empty TwiML (we'll send the response separately)
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' }
  });
}

async function triggerRhythm(env: Env, rhythm: string): Promise<Response> {
  const id = env.BETHANY.idFromName('micaiah');
  const bethany = env.BETHANY.get(id);

  await bethany.fetch(new Request(`https://bethany/rhythm/${rhythm}`, {
    method: 'POST'
  }));

  return new Response(JSON.stringify({ triggered: rhythm }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
