'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store/store';
import { runAgent, type AgentConfig } from '@/lib/agent';
import { PROVIDERS, type ChatMsg, type Provider } from '@/lib/agentProtocol';
import s from './ui.module.css';
import { IX, IGear, ISend } from './icons';

const LS = 'circuitlab.ai';
const SUGGESTIONS = ['Blink an LED with an Arduino', 'Why is my LED dark?', 'Build a transistor motor driver', 'Make an RC low-pass and run it', 'Explain this circuit'];

function loadCfg(): AgentConfig {
  try { const c = JSON.parse(localStorage.getItem(LS) ?? ''); if (c.provider in PROVIDERS) return c; } catch { /* first visit */ }
  return { provider: 'xai', model: PROVIDERS.xai.models[0], key: '' };
}

/** Lets other parts of the UI (the pet) hand the agent a question. */
let externalAsk: ((q: string) => void) | null = null;
export function askAgent(q: string) { useStore.getState().setDrawer('ai'); setTimeout(() => externalAsk?.(q), 0); }

export function AiDrawer() {
  const open = useStore((x) => x.drawer === 'ai');
  const setDrawer = useStore((x) => x.setDrawer);
  const [cfg, setCfg] = useState<AgentConfig>({ provider: 'xai', model: PROVIDERS.xai.models[0], key: '' });
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { const c = loadCfg(); setCfg(c); if (!c.key) setSettings(true); }, []);
  const save = (c: AgentConfig) => { setCfg(c); try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* private mode */ } };
  useEffect(() => { chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' }); }, [history, busy, error]);

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (!cfg.key) { setSettings(true); setError('Add your API key first.'); return; }
    setError(null); setInput('');
    const h: ChatMsg[] = [...history, { role: 'user', text: q }];
    setHistory(h); setBusy(true);
    abort.current = new AbortController();
    try { await runAgent(cfg, h, setHistory, { signal: abort.current.signal }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [busy, cfg, history]);
  useEffect(() => { externalAsk = (q) => void send(q); return () => { externalAsk = null; }; }, [send]);

  const p = PROVIDERS[cfg.provider];
  return (
    <aside className={`${s.drawer}`} data-closed={!open || undefined} aria-label="AI assistant" inert={!open || undefined} data-testid="ai-drawer">
      <div className={s.drawerHead}>
        <h2>✨ Sparky <span className={s.note}>{p.label}</span></h2>
        <button className={s.iconBtn} onClick={() => setSettings(!settings)} aria-label="AI settings" aria-expanded={settings} data-testid="ai-settings"><IGear /></button>
        {history.length > 0 && <button className={s.iconBtn} onClick={() => { abort.current?.abort(); setHistory([]); setError(null); }} aria-label="New chat" title="New chat">🧹</button>}
        <button className={s.iconBtn} onClick={() => setDrawer(null)} aria-label="Close"><IX /></button>
      </div>
      {settings && (
        <form className={s.settings} onSubmit={(e) => { e.preventDefault(); setSettings(false); setError(null); }}>
          <div className={s.row}>
            {(Object.keys(PROVIDERS) as Provider[]).map((k) => (
              <button type="button" key={k} className={s.cat} aria-pressed={cfg.provider === k} onClick={() => save({ ...cfg, provider: k, model: PROVIDERS[k].models[0] })}>{PROVIDERS[k].label}</button>
            ))}
          </div>
          <div className={s.field}>
            <label htmlFor="ai-model">Model</label>
            <input id="ai-model" className={s.input} list="ai-models" value={cfg.model} onChange={(e) => save({ ...cfg, model: e.target.value })} />
            <datalist id="ai-models">{p.models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div className={s.field}>
            <label htmlFor="ai-key">API key <a href={p.keyUrl} target="_blank" rel="noreferrer">get one ↗</a></label>
            <input id="ai-key" className={s.input} type="password" autoComplete="off" spellCheck={false} placeholder={p.keyHint} value={cfg.key} onChange={(e) => save({ ...cfg, key: e.target.value.trim() })} data-testid="ai-key" />
          </div>
          <p className={s.note}>Stored only in this browser. Requests go through a pass-through proxy that never stores or logs it. Chat subscriptions (SuperGrok, Claude Pro) can’t be used — an API key is required.</p>
          <div className={s.row}>
            <button className={s.primary} type="submit">Done</button>
            {cfg.key && <button type="button" className={s.danger} onClick={() => save({ ...cfg, key: '' })}>Forget key</button>}
          </div>
        </form>
      )}
      <div className={s.chat} ref={chat} aria-live="polite" data-testid="chat">
        {history.length === 0 && <div className={`${s.msg} ${s.bot}`}>Hi! Tell me what to build and I’ll wire it up for you. ⚡</div>}
        {history.map((m, i) => {
          if (m.role === 'user') return <div key={i} className={`${s.msg} ${s.user}`}>{m.text}</div>;
          if (m.role === 'assistant') return (
            <div key={i} style={{ display: 'contents' }}>
              {m.text && <div className={`${s.msg} ${s.bot}`}>{m.text}</div>}
              {m.toolCalls?.map((c) => <div key={c.id} className={`${s.msg} ${s.tool}`}>▸ {c.name}({Object.entries(c.args).filter(([k]) => k !== 'source').map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})</div>)}
            </div>
          );
          return <div key={i} style={{ display: 'contents' }}>{m.results.filter((r) => r.content.startsWith('Error')).map((r) => <div key={r.id} className={`${s.msg} ${s.tool}`} style={{ borderColor: 'var(--danger)' }}>✖ {r.content.slice(7, 200)}</div>)}</div>;
        })}
        {busy && <div className={`${s.msg} ${s.bot} ${s.typing}`} aria-label="Thinking"><span /><span /><span /></div>}
        {error && <div className={`${s.msg} ${s.err}`} role="alert">{error}</div>}
      </div>
      {history.length === 0 && <div className={s.chips}>{SUGGESTIONS.map((q) => <button key={q} className={s.chip} onClick={() => send(q)}>{q}</button>)}</div>}
      <form className={s.composer} onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Sparky…" aria-label="Message" rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} data-testid="ai-input" />
        {busy
          ? <button type="button" className={s.iconBtn} onClick={() => abort.current?.abort()} aria-label="Stop">■</button>
          : <button type="submit" className={s.primary} aria-label="Send" disabled={!input.trim()}><ISend /></button>}
      </form>
    </aside>
  );
}
