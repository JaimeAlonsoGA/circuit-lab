import { beforeEach, describe, expect, it } from 'vitest';
import { execTool, runAgent, systemPrompt, type Transport } from '@/lib/agent';
import { useStore } from '@/store/store';

const call = (name: string, args: Record<string, unknown> = {}) => execTool({ id: 'x', name, args });

describe('agent tools', () => {
  beforeEach(() => useStore.getState().clear());
  it('builds a circuit by reference', async () => {
    expect(await call('add_component', { type: 'battery9v' })).toMatch(/BT1/);
    expect(await call('add_component', { type: 'resistor', props: { resistance: 470 } })).toMatch(/R1/);
    await call('add_component', { type: 'led' });
    await call('connect', { from: 'BT1.+', to: 'R1.a' });
    await call('connect', { from: 'r1.b', to: 'D1.anode' });
    await call('connect', { from: 'D1.cathode', to: 'BT1.-' });
    const c = JSON.parse(await call('get_circuit'));
    expect(c.components).toHaveLength(3);
    expect(c.wires).toHaveLength(3);
    expect(useStore.getState().project.components[1].props.resistance).toBe(470);
  });
  it('reports helpful errors', async () => {
    await call('add_component', { type: 'resistor' });
    await expect(call('connect', { from: 'R1.zz', to: 'R1.a' })).rejects.toThrow(/no pin/);
    await expect(call('set_property', { ref: 'Q9', key: 'x', value: 1 })).rejects.toThrow(/No component/);
    await expect(call('add_component', { type: 'flux_capacitor' })).rejects.toThrow(/Unknown type/);
  });
  it('runs a tool loop with a fake model', async () => {
    let n = 0;
    const transport: Transport = async () => (n++ === 0
      ? { text: '', toolCalls: [{ id: 'a', name: 'add_component', args: { type: 'resistor' } }, { id: 'b', name: 'nope', args: {} }] }
      : { text: 'Done!', toolCalls: [] });
    const h = await runAgent({ provider: 'xai', model: 'm', key: 'k' }, [{ role: 'user', text: 'add a resistor' }], () => {}, { transport });
    expect(h).toHaveLength(4);
    const tool = h[2];
    expect(tool.role === 'tool' && tool.results[1].content).toMatch(/Error/);
    expect(useStore.getState().project.components).toHaveLength(1);
  });
  it('describes the whole catalog', () => { expect(systemPrompt()).toContain('Arduino'); });
});
