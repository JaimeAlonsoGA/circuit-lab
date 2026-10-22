/** Provider-neutral chat protocol shared by the browser and the /api/agent proxy. */
export type Provider = 'xai' | 'anthropic';
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export interface ToolResult { id: string; name: string; content: string }
export type ChatMsg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export interface AgentRequest { provider: Provider; model: string; system: string; messages: ChatMsg[]; tools: ToolSpec[] }
export interface AgentReply { text: string; toolCalls: ToolCall[] }

export const PROVIDERS: Record<Provider, { label: string; models: string[]; keyHint: string; keyUrl: string }> = {
  xai: { label: 'Grok (xAI)', models: ['grok-4.7', 'grok-4.6', 'grok-4.20-non-reasoning'], keyHint: 'xai-…', keyUrl: 'https://console.x.ai' },
  anthropic: { label: 'Claude (Anthropic)', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
};

export function toProviderBody(r: AgentRequest): { url: string; body: unknown; headers: (key: string) => Record<string, string> } {
  if (r.provider === 'anthropic') {
    const messages = r.messages.map((m) => {
      if (m.role === 'user') return { role: 'user', content: m.text };
      if (m.role === 'assistant') return { role: 'assistant', content: [...(m.text ? [{ type: 'text', text: m.text }] : []), ...(m.toolCalls ?? []).map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args }))] };
      return { role: 'user', content: m.results.map((t) => ({ type: 'tool_result', tool_use_id: t.id, content: t.content })) };
    });
    return {
      url: 'https://api.anthropic.com/v1/messages',
      body: { model: r.model, max_tokens: 4096, system: r.system, messages, tools: r.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) },
      headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    };
  }
  const messages: unknown[] = [{ role: 'system', content: r.system }];
  for (const m of r.messages) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.text });
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.text || null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) });
    else for (const t of m.results) messages.push({ role: 'tool', tool_call_id: t.id, content: t.content });
  }
  return {
    url: 'https://api.x.ai/v1/chat/completions',
    body: { model: r.model, messages, tools: r.tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' },
    headers: (key) => ({ authorization: `Bearer ${key}`, 'content-type': 'application/json' }),
  };
}

function safeJson(s: unknown): Record<string, unknown> {
  if (s && typeof s === 'object') return s as Record<string, unknown>;
  try { const v = JSON.parse(String(s || '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function fromProviderReply(provider: Provider, data: unknown): AgentReply {
  const d = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (provider === 'anthropic') {
    const blocks: any[] = d.content ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      text: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
      toolCalls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: safeJson(b.input) })),
    };
  }
  const msg = d.choices?.[0]?.message ?? {};
  return {
    text: String(msg.content ?? '').trim(),
    toolCalls: (msg.tool_calls ?? []).map((c: any) => ({ id: c.id, name: c.function?.name, args: safeJson(c.function?.arguments) })), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

export function providerError(data: unknown, status: number): string {
  const d = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = d?.error?.message ?? d?.error ?? d?.message;
  if (status === 401 || status === 403) return `The provider rejected the key (${status}). Check it in settings.`;
  return typeof m === 'string' ? m : `Provider error ${status}`;
}
