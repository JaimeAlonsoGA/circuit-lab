'use client';
import { useEffect } from 'react';
import { useStore } from '@/store/store';
import { parseProject, toJson } from '@/lib/export';
import { TEMPLATES } from '@/lib/templates';

const KEY = 'circuitlab.project';

/** Restores the last project (or the starter template) and saves edits, debounced. */
export function useAutosave() {
  useEffect(() => {
    let restored = false;
    try { const raw = localStorage.getItem(KEY); if (raw) { useStore.getState().load(parseProject(raw)); restored = true; } } catch { /* corrupt or blocked */ }
    if (!restored) useStore.getState().load(TEMPLATES[0].make());
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      clearTimeout(t);
      t = setTimeout(() => { try { localStorage.setItem(KEY, toJson(s.project)); } catch { /* quota */ } }, 500);
    });
    return () => { unsub(); clearTimeout(t); };
  }, []);
}
