'use client';
import { useEffect, useRef, useState } from 'react';
import { events, useStore } from '@/store/store';
import { askAgent } from './AiDrawer';
import s from './ui.module.css';
import p from './Pet.module.css';

type Mood = 'idle' | 'happy' | 'scared' | 'sleepy' | 'talk';
interface Bubble { text: string; actions?: { label: string; run: () => void }[] }

const HAPPY = ['It works! ⚡', 'Look at it go!', 'Beautiful circuit ✨', 'Electrons are flowing!'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function SparkyArt({ mood }: { mood: Mood }) {
  const scared = mood === 'scared';
  return (
    <svg viewBox="-40 -48 80 90" className={p.root} data-mood={mood} aria-hidden>
      <defs>
        <radialGradient id="sparky-g" cx=".4" cy=".35"><stop offset="0" stopColor={scared ? '#ffd0d8' : '#fff7c2'} /><stop offset="1" stopColor={scared ? '#ff4d6d' : '#ffb703'} /></radialGradient>
      </defs>
      <ellipse cx="0" cy="38" rx="18" ry="4" fill="#0006" />
      <circle className={p.glow} cx="0" cy="-2" r="30" fill={scared ? '#ff4d6d' : '#ffd166'} opacity={mood === 'sleepy' ? 0.05 : 0.18} />
      <rect x="-9" y="18" width="18" height="12" rx="3" fill="#8b93b3" /><path d="M-9 22h18M-9 26h18" stroke="#5b6386" strokeWidth="1.5" />
      <path d="M0-30c-15 0-24 11-24 23 0 9 6 14 9 19 2 3 2 6 2 6h26s0-3 2-6c3-5 9-10 9-19 0-12-9-23-24-23z" fill="url(#sparky-g)" stroke="#e09f00" strokeWidth="1.5" />
      <path d="M3-24l-9 14h7l-4 11" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
      <g fill="#1d2140">
        <ellipse className={p.eye} cx="-8" cy="-6" rx="3.2" ry={scared ? 5 : 4} />
        <ellipse className={p.eye} cx="8" cy="-6" rx="3.2" ry={scared ? 5 : 4} />
      </g>
      {mood === 'happy' || mood === 'talk' ? <path d="M-7 4q7 7 14 0" fill="none" stroke="#1d2140" strokeWidth="2.2" strokeLinecap="round" />
        : scared ? <ellipse cx="0" cy="6" rx="4" ry="5" fill="#1d2140" />
          : <path d="M-5 5q5 3 10 0" fill="none" stroke="#1d2140" strokeWidth="2" strokeLinecap="round" />}
      <circle cx="-15" cy="2" r="3" fill="#ff8fab" opacity=".6" /><circle cx="15" cy="2" r="3" fill="#ff8fab" opacity=".6" />
      <g className={p.spark} style={{ transformOrigin: '0 -2px' }} stroke="#ffd166" strokeWidth="2.5" strokeLinecap="round">
        <path d="M-34-20l-6-4M34-20l6-4M-36 6h-7M36 6h7M0-40v-7" />
      </g>
      <text className={p.zz} x="18" y="-26" fill="#cdd3f0" fontSize="11" fontWeight="700">z</text>
    </svg>
  );
}

export function Pet() {
  const [mood, setMood] = useState<Mood>('sleepy');
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const paletteOpen = useStore((x) => x.paletteOpen);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastHappy = useRef(0);
  const hasBubble = useRef(false);
  useEffect(() => { hasBubble.current = !!bubble; }, [bubble]);

  useEffect(() => {
    const show = (b: Bubble, m: Mood, ms = 4500) => {
      setBubble(b); setMood(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { setBubble(null); setMood(useStore.getState().powered ? 'idle' : 'sleepy'); }, ms);
    };
    const off = events.on((e) => {
      if (e.type === 'burn') {
        show({ text: `Yikes! ${e.label}: ${e.reason}`, actions: [
          { label: 'Replace it', run: () => { useStore.getState().repair(e.id); setBubble(null); } },
          { label: 'Why?', run: () => askAgent(`The ${e.label} just burnt (${e.reason}). Why, and how do I fix the circuit?`) },
        ] }, 'scared', 9000);
      } else if (e.type === 'working') {
        if (Date.now() - lastHappy.current > 6000) { lastHappy.current = Date.now(); show({ text: `${pick(HAPPY)} (${e.what})` }, 'happy', 3000); }
      } else if (e.type === 'power') {
        if (!hasBubble.current) setMood(e.on ? 'idle' : 'sleepy');
      } else if (e.type === 'say') {
        show({ text: e.text.length > 220 ? `${e.text.slice(0, 220)}…` : e.text }, 'talk', 6000);
      }
    });
    return () => { off(); clearTimeout(timer.current); };
  }, []);

  return (
    <div className={s.pet} data-shifted={!paletteOpen || undefined} data-testid="pet">
      <button className={s.petBody} onClick={() => useStore.getState().setDrawer(useStore.getState().drawer === 'ai' ? null : 'ai')} aria-label="Sparky, your AI assistant">
        <SparkyArt mood={mood} />
      </button>
      {bubble && (
        <div className={s.bubble} role="status">
          {bubble.text}
          {bubble.actions && <div style={{ display: 'flex', gap: 6 }}>{bubble.actions.map((a) => <button key={a.label} onClick={a.run}>{a.label}</button>)}</div>}
        </div>
      )}
    </div>
  );
}
