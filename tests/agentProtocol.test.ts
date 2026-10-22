import { describe, expect, it } from 'vitest';
import { toProviderBody, fromProviderReply, type AgentRequest } from '@/lib/agentProtocol';

const req = (provider: 'xai' | 'anthropic'): AgentRequest => ({
  provider, model: 'm', system: 'sys', tools: [{ name: 'run', description: 'd', parameters: { type: 'object', properties: {} } }],
  messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: '', toolCalls: [{ id: 't1', name: 'run', args: { a: 1 } }] }, { role: 'tool', results: [{ id: 't1', name: 'run', content: 'ok' }] }],
});

describe('agent protocol', () => {
  it('maps to OpenAI-style for xAI', () => {
    const { url, body, headers } = toProviderBody(req('xai'));
    expect(url).toContain('api.x.ai');
    const b = body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(b.messages[2].tool_calls[0].function).toEqual({ name: 'run', arguments: '{"a":1}' });
    expect(b.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'ok' });
    expect(headers('K').authorization).toBe('Bearer K');
  });
  it('maps to Anthropic messages', () => {
    const { body, headers } = toProviderBody(req('anthropic'));
    const b = body as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.system).toBe('sys');
    expect(b.messages[1].content[0]).toEqual({ type: 'tool_use', id: 't1', name: 'run', input: { a: 1 } });
    expect(b.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: 'ok' });
    expect(b.tools[0].input_schema).toBeDefined();
    expect(headers('K')['x-api-key']).toBe('K');
  });
  it('parses replies from both', () => {
    expect(fromProviderReply('xai', { choices: [{ message: { content: 'yo', tool_calls: [{ id: 'a', function: { name: 'run', arguments: '{"x":2}' } }] } }] }))
      .toEqual({ text: 'yo', toolCalls: [{ id: 'a', name: 'run', args: { x: 2 } }] });
    expect(fromProviderReply('anthropic', { content: [{ type: 'text', text: 'hey' }, { type: 'tool_use', id: 'b', name: 'run', input: { y: 1 } }] }))
      .toEqual({ text: 'hey', toolCalls: [{ id: 'b', name: 'run', args: { y: 1 } }] });
    expect(fromProviderReply('xai', { choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'run', arguments: 'not json' } }] } }] }).toolCalls[0].args).toEqual({});
  });
});
