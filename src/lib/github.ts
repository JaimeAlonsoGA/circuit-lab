/** Minimal public-GitHub loader (no token, unauthenticated API: 60 requests/hour per IP). */
export interface RepoRef { owner: string; repo: string; ref?: string; path?: string }
export interface RepoFile { path: string; size: number }

const CODE_EXT = /\.(ino|pde|cpp|cc|c|h|hpp|js|mjs)$/i;

export function parseRepoUrl(input: string): RepoRef | null {
  const t = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(t);
  if (short) return { owner: short[1], repo: short[2] };
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`);
    if (!/^(www\.)?github\.com$/.test(u.hostname)) return null;
    const [owner, repo, kind, ref, ...rest] = u.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    if ((kind === 'tree' || kind === 'blob') && ref) return { owner, repo, ref, path: rest.join('/') || undefined };
    return { owner, repo };
  } catch { return null; }
}

async function gh<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) throw new Error('Repository not found (is it public?)');
  if (r.status === 403) throw new Error('GitHub rate limit reached — try again in a while');
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return r.json() as Promise<T>;
}

export async function listRepoFiles(ref: RepoRef, signal?: AbortSignal): Promise<{ ref: RepoRef; files: RepoFile[]; truncated: boolean }> {
  const branch = ref.ref ?? (await gh<{ default_branch: string }>(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, signal)).default_branch;
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, signal);
  const prefix = ref.path && !CODE_EXT.test(ref.path) ? `${ref.path}/` : ref.path ?? '';
  const files = tree.tree
    .filter((n) => n.type === 'blob' && CODE_EXT.test(n.path) && (!prefix || n.path === prefix || n.path.startsWith(prefix)))
    .map((n) => ({ path: n.path, size: n.size ?? 0 }))
    .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  return { ref: { ...ref, ref: branch }, files, truncated: tree.truncated };
}
const rank = (p: string) => (/\.(ino|pde)$/i.test(p) ? 0 : /\.js$/i.test(p) ? 1 : 2);

export async function fetchRepoFile(ref: RepoRef, path: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(ref.ref ?? 'HEAD')}/${path.split('/').map(encodeURIComponent).join('/')}`, { signal });
  if (!r.ok) throw new Error(`Could not download ${path} (${r.status})`);
  const text = await r.text();
  if (text.length > 200_000) throw new Error('File too large for the simulator');
  return text;
}

/** Arduino concatenates every .ino in a sketch folder (main file first). */
export async function loadSketch(ref: RepoRef, files: RepoFile[], path: string, signal?: AbortSignal): Promise<string> {
  if (!/\.(ino|pde)$/i.test(path)) return fetchRepoFile(ref, path, signal);
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const siblings = files.filter((f) => /\.(ino|pde)$/i.test(f.path) && f.path.startsWith(dir) && !f.path.slice(dir.length).includes('/') && f.path !== path);
  const parts = await Promise.all([path, ...siblings.map((f) => f.path)].map((p) => fetchRepoFile(ref, p, signal)));
  return parts.join('\n\n');
}
