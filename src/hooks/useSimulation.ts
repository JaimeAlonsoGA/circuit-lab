'use client';
import { useEffect } from 'react';
import { audio } from '@/audio/audio';
import { getDef } from '@/lib/catalog';
import { Controller } from '@/sim/controller';
import { events, useSim, useStore } from '@/store/store';

const SCOPE_POINTS = 160;
let active: Controller | null = null;

/** Owns the Controller and drives it from requestAnimationFrame. */
export function useSimulation() {
  useEffect(() => {
    const st = useStore.getState();
    const ctl = new Controller(st.project);
    ctl.load(st.project, Object.keys(st.damaged));
    ctl.setPowered(st.powered);
    ctl.speed = st.speed;
    active = ctl;
    let dirty = false;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project !== prev.project || s.damaged !== prev.damaged) dirty = true;
      if (s.powered !== prev.powered) { ctl.setPowered(s.powered); events.emit({ type: 'power', on: s.powered }); working.clear(); }
      if (s.speed !== prev.speed) ctl.speed = s.speed;
      if (s.muted !== prev.muted) audio.setMuted(s.muted);
    });
    const working = new Set<string>();
    const relayState = new Map<string, boolean>();
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let lastScopeT = 0;

    const tick = async () => {
      if (!alive) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (dirty) {
        dirty = false;
        const s = useStore.getState();
        ctl.load(s.project, Object.keys(s.damaged));
      }
      try {
        const f = await ctl.frame(dt);
        if (!alive) return;
        const s = useStore.getState();
        // burns
        const burnt = Object.entries(f.burnt);
        if (burnt.length) {
          s.burn(f.burnt);
          audio.pop();
          for (const [id, reason] of burnt) {
            const c = s.project.components.find((x) => x.id === id);
            events.emit({ type: 'burn', id, reason, label: c ? getDef(c.type).label : 'Part' });
          }
        }
        // animation state
        const prevAnim = useSim.getState().anim;
        const motor: Record<string, number> = {};
        const scope: Record<string, number[]> = {};
        const tones: Record<string, { f: number; type: OscillatorType }> = {};
        const sampleScope = f.t - lastScopeT >= 0.004 * ctl.speed;
        if (sampleScope) lastScopeT = f.t;
        for (const c of s.project.components) {
          const o = f.out[c.id];
          if (!o || s.damaged[c.id]) continue;
          if (c.type === 'motor') motor[c.id] = ((prevAnim.motor[c.id] ?? 0) + Number(o.speed) * dt * 1440) % 360;
          if (c.type === 'scope') {
            const arr = prevAnim.scope[c.id] ?? [];
            scope[c.id] = sampleScope ? [...arr, Number(o.v)].slice(-SCOPE_POINTS) : arr;
          }
          if (c.type === 'buzzer' && (o.on || f.periph.tone[c.id])) tones[c.id] = { f: f.periph.tone[c.id] || 2300, type: 'square' };
          if (c.type === 'speaker' && Number(o.level) > 0.03 && f.periph.tone[c.id]) tones[c.id] = { f: f.periph.tone[c.id], type: 'triangle' };
          if (c.type === 'relay') {
            const cl = !!o.closed;
            if (relayState.has(c.id) && relayState.get(c.id) !== cl) audio.click();
            relayState.set(c.id, cl);
          }
          const isOn = (c.type === 'led' && Number(o.brightness) > 0.25) || (c.type === 'lamp' && Number(o.brightness) > 0.25)
            || (c.type === 'motor' && Math.abs(Number(o.speed)) > 0.25) || (c.type === 'buzzer' && !!o.on) || (c.type === 'sevenseg' && Object.values(o).some((x) => Number(x) > 0.3));
          if (isOn && !working.has(c.id)) { working.add(c.id); events.emit({ type: 'working', what: getDef(c.type).label }); }
        }
        audio.sync(s.powered ? tones : {});
        useSim.setState({ frame: f, anim: { motor, scope } });
      } catch (e) {
        console.error(e);
      }
      raf = requestAnimationFrame(() => void tick());
    };
    raf = requestAnimationFrame(() => void tick());
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      alive = false;
      active = null;
      cancelAnimationFrame(raf);
      unsub();
      ctl.stopAll();
      audio.sync({});
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}

/** Restart a board's program from setup(). */
export function restartBoard(id: string) {
  active?.reflash(id);
}
