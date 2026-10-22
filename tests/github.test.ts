import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from '@/lib/github';

describe('parseRepoUrl', () => {
  it('parses short and full forms', () => {
    expect(parseRepoUrl('arduino/arduino-examples')).toEqual({ owner: 'arduino', repo: 'arduino-examples' });
    expect(parseRepoUrl('https://github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseRepoUrl('github.com/a/b/tree/main/examples/01.Basics')).toEqual({ owner: 'a', repo: 'b', ref: 'main', path: 'examples/01.Basics' });
  });
  it('rejects other hosts and junk', () => {
    expect(parseRepoUrl('https://gitlab.com/a/b')).toBeNull();
    expect(parseRepoUrl('hello world')).toBeNull();
  });
});
