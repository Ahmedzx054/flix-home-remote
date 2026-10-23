import type { TvActivity } from '../model.ts';
const text = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200);
// Extract only the foreground package and its matching media session; never upload dumpsys.
export function androidActivity(windowDump: string, mediaDump: string): TvActivity {
  const appId = windowDump.match(/(?:mCurrentFocus|mFocusedApp)[^\n]*?\b([\w]+(?:\.[\w]+)+)\//)?.[1];
  if (!appId) return { available: false, reason: 'لم يكشف Android التطبيق الظاهر.', checkedAt: Date.now() };
  const blocks = mediaDump.split(/(?=^\s*package=)/m);
  const block = blocks.find(b => b.match(/^\s*package=([^\s]+)/m)?.[1] === appId) || '';
  const description = block.match(/metadata:[^\n]*?description=([^\n]+)/)?.[1]?.split(',')[0]?.trim();
  const state = block.match(/state=PlaybackState\s*\{state=(?:[A-Z_]+\()?([0-9]+)/)?.[1];
  return { available: true, appId, title: description && description !== 'null' ? text(description) : undefined, state: ({ '3':'playing','2':'paused','1':'stopped','6':'buffering' } as Record<string,string>)[state || ''], reason: !description || description === 'null' ? 'التطبيق لم يكشف عنوان المحتوى.' : undefined, checkedAt: Date.now() };
}
