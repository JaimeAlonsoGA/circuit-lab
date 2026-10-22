import { toProviderBody, fromProviderReply, providerError, type AgentRequest } from '@/lib/agentProtocol';

// Thin pass-through proxy. The user's key arrives in a header, is forwarded to the
// provider and is never stored or logged. No server-side key exists.
export const runtime = 'edge';

const MAX_BODY = 400_000;

export async function POST(req: Request) {
  const key = req.headers.get('x-user-key')?.trim();
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 400 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: 'Conversation too long — clear the chat' }, { status: 413 });
  let body: AgentRequest;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (body.provider !== 'xai' && body.provider !== 'anthropic') return Response.json({ error: 'Unknown provider' }, { status: 400 });
  if (typeof body.model !== 'string' || !/^[\w.:-]{1,80}$/.test(body.model)) return Response.json({ error: 'Bad model name' }, { status: 400 });
  const { url, body: payload, headers } = toProviderBody(body);
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: headers(key), body: JSON.stringify(payload) });
  } catch {
    return Response.json({ error: 'Could not reach the provider' }, { status: 502 });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return Response.json({ error: providerError(data, r.status) }, { status: r.status });
  return Response.json(fromProviderReply(body.provider, data), { headers: { 'cache-control': 'no-store' } });
}
