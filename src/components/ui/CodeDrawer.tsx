'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useSim } from '@/store/store';
import { getDef } from '@/lib/catalog';
import { refDesignators } from '@/lib/export';
import { EXAMPLES } from '@/lib/examples';
import { parseRepoUrl, listRepoFiles, loadSketch, type RepoFile, type RepoRef } from '@/lib/github';
import { restartBoard } from '@/hooks/useSimulation';
import type { CodeLang } from '@/lib/types';
import { toast } from './Toasts';
import s from './ui.module.css';
import { IX, IRefresh, IGithub } from './icons';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => <div className={s.note} style={{ padding: 12 }}>Loading editor…</div> });

function Serial({ id }: { id: string }) {
  const st = useSim((x) => x.frame?.serial[id]);
  const ref = useRef<HTMLPreElement>(null);
  const text = (st?.lines ?? []).join('');
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [text, st?.error]);
  return (
    <>
      <div className={s.row} style={{ justifyContent: 'space-between' }}>
        <span className={s.status}><span className={s.dot} data-on={st?.running || undefined} data-err={st?.error ? true : undefined} />{st?.error ? 'error' : st?.running ? 'running' : 'stopped'}</span>
        <button className={s.iconBtn} onClick={() => restartBoard(id)} aria-label="Restart board" title="Reset"><IRefresh /></button>
      </div>
      <pre ref={ref} className={s.serial} aria-label="Serial monitor" aria-live="polite" data-testid="serial">
        {st?.warnings.map((w, i) => <div key={i} className={s.serialWarn}>⚠ {w}</div>)}
        {text.slice(-6000)}
        {st?.error && <div className={s.serialErr}>✖ {st.error}</div>}
      </pre>
    </>
  );
}

function GitHubLoader({ onLoad }: { onLoad: (src: string, lang: CodeLang, origin: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [repo, setRepo] = useState<{ ref: RepoRef; files: RepoFile[] } | null>(null);
  const [filter, setFilter] = useState('');
  const abort = useRef<AbortController | null>(null);
  const list = async () => {
    const ref = parseRepoUrl(url);
    if (!ref) { toast('Paste a GitHub repo like owner/name', 'danger'); return; }
    abort.current?.abort(); abort.current = new AbortController();
    setBusy(true);
    try {
      const r = await listRepoFiles(ref, abort.current.signal);
      if (!r.files.length) toast('No .ino / .cpp / .js files found', 'danger');
      setRepo(r);
    } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'danger'); }
    finally { setBusy(false); }
  };
  const pick = async (path: string) => {
    if (!repo) return;
    setBusy(true);
    try {
      const src = await loadSketch(repo.ref, repo.files, path);
      onLoad(src, /\.m?js$/i.test(path) ? 'js' : 'arduino', `github.com/${repo.ref.owner}/${repo.ref.repo}/${path}`);
      toast(`Loaded ${path.split('/').pop()}`, 'ok');
    } catch (e) { toast((e as Error).message, 'danger'); }
    finally { setBusy(false); }
  };
  const shown = repo?.files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase())).slice(0, 300) ?? [];
  return (
    <details>
      <summary className={s.status} style={{ cursor: 'pointer' }}><IGithub width={16} /> GitHub</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <form className={s.row} onSubmit={(e) => { e.preventDefault(); void list(); }}>
          <input className={s.input} style={{ flex: 1 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="owner/repo or github.com/…" aria-label="GitHub repository" data-testid="gh-url" />
          <button className={`${s.iconBtn} ${s.primary}`} disabled={busy} type="submit">{busy ? '…' : 'Open'}</button>
        </form>
        {repo && (
          <>
            {repo.files.length > 12 && <input className={s.input} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files" aria-label="Filter files" />}
            <div className={s.fileList} role="listbox" aria-label="Files" data-testid="gh-files">
              {shown.map((f) => <button key={f.path} role="option" aria-selected={false} className={s.fileItem} onClick={() => void pick(f.path)} disabled={busy}>{f.path}</button>)}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

export function CodeDrawer() {
  const { drawer, setDrawer, project, codeTarget, setCode, openCode } = useStore();
  const boards = useMemo(() => project.components.filter((c) => getDef(c.type).mcu), [project.components]);
  const id = boards.find((b) => b.id === codeTarget)?.id ?? boards[0]?.id;
  const file = id ? project.code[id] : undefined;
  const refs = refDesignators(project);
  const open = drawer === 'code';
  const [draft, setDraft] = useState(file?.source ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setDraft(file?.source ?? ''); }, [id, file?.source]);
  const lang: CodeLang = file?.lang ?? 'arduino';
  const commit = (source: string, l: CodeLang = lang, origin = file?.origin) => { if (id) setCode(id, { lang: l, source, origin }); };
  const onEdit = (v: string | undefined) => {
    setDraft(v ?? '');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v ?? ''), 700); // debounce re-flashing while typing
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <aside className={`${s.drawer} ${s.wide}`} data-closed={!open || undefined} aria-label="Code" inert={!open || undefined} data-testid="code-drawer">
      <div className={s.drawerHead}>
        <h2>🧠 {id ? <select className={s.select} value={id} onChange={(e) => openCode(e.target.value)} aria-label="Board">{boards.map((b) => <option key={b.id} value={b.id}>{refs[b.id]} · {getDef(b.type).label}</option>)}</select> : 'Code'}</h2>
        <button className={s.iconBtn} onClick={() => setDrawer(null)} aria-label="Close"><IX /></button>
      </div>
      {open && !id && <div className={s.drawerBody}><p className={s.note}>Add an Arduino Uno, ESP32 or Pico from the parts drawer to write code.</p></div>}
      {open && id && (
        <div className={s.drawerBody}>
          <div className={s.row}>
            <select className={s.select} value={lang} onChange={(e) => commit(draft, e.target.value as CodeLang)} aria-label="Language">
              <option value="arduino">Arduino C++</option>
              <option value="js">JavaScript</option>
            </select>
            <select className={s.select} value="" onChange={(e) => { const ex = EXAMPLES.find((x) => x.name === e.target.value); if (ex) { setDraft(ex.source); commit(ex.source, ex.lang, undefined); } }} aria-label="Examples" data-testid="examples">
              <option value="" disabled>Examples…</option>
              {EXAMPLES.map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
            {file?.origin && <span className={s.note} title={file.origin}>📎 {file.origin.split('/').slice(-1)[0]}</span>}
          </div>
          <div className={s.editorWrap}>
            <Editor height="100%" theme="vs-dark" language={lang === 'js' ? 'javascript' : 'cpp'} value={draft} onChange={onEdit}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, padding: { top: 8 } }} />
          </div>
          <Serial id={id} />
          <GitHubLoader onLoad={(src, l, origin) => { setDraft(src); commit(src, l, origin); }} />
          <p className={s.note}>
            Code runs in your browser on simulated time: Arduino C++ is translated to JavaScript, covering the core API (pins, analog/PWM, delay/millis, Serial, Servo, tone, SSD1306 OLED).
            Other libraries, interrupts, pointers, structs/classes and templates are not emulated, and there is no real AVR/ESP compilation.
          </p>
        </div>
      )}
    </aside>
  );
}
