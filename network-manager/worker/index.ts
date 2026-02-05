/**
 * Bethany Network Manager — Cloudflare Worker Entry Point
 *
 * Handles:
 *   - Web signup (GET = page, POST = create account)
 *   - SMS webhook routing (inbound messages from SendBlue)
 *   - Dashboard API endpoints
 *   - Cron triggers for nudges and health checks
 *   - Internal API for Bethany worker communication
 *
 * IMPORTANT: The OnboardingDO Durable Object class MUST be re-exported
 * from this entry point for Wrangler to register it.
 */

import { Env } from '../shared/types';
import { corsHeaders, jsonResponse, errorResponse } from '../shared/http';
import { handleSmsWebhook } from './routes/sms';
import { handleSignupPost, handleSignupPage } from './routes/signup';
import { handleApiRoute } from './routes/api';

// Re-export Durable Object classes — Wrangler requires these at the entry point
export { OnboardingDO } from './services/onboarding-service';

const VERSION = {
  version: '0.5.0',
  updated: '2026-02-05',
  codename: 'dashboard-api',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ===========================================
      // Health & Version
      // ===========================================
      if (url.pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          ...VERSION,
          timestamp: new Date().toISOString(),
        });
      }

      if (url.pathname === '/version') {
        return new Response(
          `Bethany Network Manager v${VERSION.version} (${VERSION.codename})`,
          { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
        );
      }

      // ===========================================
      // Web Signup (TASK-7cfa060a-2)
      // ===========================================
      if (url.pathname === '/signup') {
        if (request.method === 'GET') {
          return handleSignupPage();
        }
        if (request.method === 'POST') {
          return handleSignupPost(request, env, ctx);
        }
        return errorResponse('Method not allowed', 405);
      }

      // ===========================================
      // SMS Webhook (SendBlue inbound)
      // ===========================================
      if (url.pathname === '/webhook/sms' && request.method === 'POST') {
        return handleSmsWebhook(request, env, ctx);
      }

      // ===========================================
      // Dashboard API (TASK-c3d31ee9-3)
      // ===========================================
      if (url.pathname.startsWith('/api/')) {
        return handleApiRoute(request, env, ctx);
      }

      // ===========================================
      // Internal API (Bethany worker → Network Manager)
      // ===========================================
      if (url.pathname.startsWith('/internal/')) {
        const apiKey = request.headers.get('X-API-Key');
        if (apiKey !== env.INTERNAL_API_KEY) {
          return errorResponse('Unauthorized', 401);
        }
        // TODO: TASK — Internal API routes
        return errorResponse('Not implemented', 501);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      console.error('Unhandled error:', err);
      return errorResponse('Internal server error', 500);
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const trigger = event.cron;

    // Daily nudge generation (3am Central / 9am UTC)
    if (trigger === '0 9 * * *') {
      // TODO: TASK — Nudge generation cron
      console.log('[cron] Nudge generation triggered');
    }

    // Morning delivery window (8am Central / 2pm UTC)
    if (trigger === '0 14 * * *') {
      // TODO: TASK — Nudge delivery cron
      console.log('[cron] Nudge delivery triggered');
    }

    // Weekly health recalculation (Sunday midnight UTC)
    if (trigger === '0 0 * * 0') {
      // TODO: TASK — Health recalculation cron
      console.log('[cron] Weekly health recalculation triggered');
    }
  },
};
