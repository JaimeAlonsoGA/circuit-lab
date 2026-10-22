'use client';
import { useEffect, useState } from 'react';
import s from './ui.module.css';

type Kind = 'info' | 'ok' | 'danger';
interface T { id: number; text: string; kind: Kind }
const subs = new Set<(t: T) => void>();
let n = 0;
export function toast(text: string, kind: Kind = 'info') { const t = { id: ++n, text, kind }; subs.forEach((f) => f(t)); }

export function Toasts() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    const f = (t: T) => {
      setList((l) => [...l.slice(-3), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 3200);
    };
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={s.toast} data-kind={t.kind}>{t.text}</div>)}
    </div>
  );
}
