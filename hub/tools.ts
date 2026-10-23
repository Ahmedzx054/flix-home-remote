import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export type Tool = 'adb' | 'ares-install' | 'ares-setup-device' | 'tizen' | 'sdb';
export function toolPath(tool: Tool): string | undefined {
  const override = process.env[`HOME_REMOTE_${tool.toUpperCase().replaceAll('-', '_')}`];
  const roots = (process.env.PATH || '').split(path.delimiter);
  const defaults: string[] = tool === 'adb' ? [path.join(process.env.ANDROID_HOME || path.join(os.homedir(), 'AppData/Local/Android/Sdk'), 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'), 'C:/Android/sdk/platform-tools/adb.exe'] : [];
  // Run the npm webOS CLI via node, not a shell. Arguments never become shell text.
  if (tool.startsWith('ares-') && process.platform === 'win32') defaults.push(path.join(process.env.APPDATA || '', `npm/node_modules/@webos-tools/cli/bin/${tool}.js`));
  if (tool === 'sdb' && process.platform === 'win32') defaults.push('C:/tizen-studio/tools/sdb.exe');
  if (tool === 'tizen' && process.platform === 'win32') defaults.push('C:/tizen-studio/tools/ide/bin/tizen.bat');
  const candidates = [override, ...defaults, ...roots.flatMap(r => [path.join(r, tool + (process.platform === 'win32' ? '.exe' : '')), ...(process.platform === 'win32' ? [path.join(r, tool + '.bat')] : [])])];
  return candidates.find((p): p is string => !!p && existsSync(p));
}
export async function runTool(tool: Tool, args: string[], timeout = 20_000) {
  const binary = toolPath(tool);
  if (!binary) throw new Error(`ثبّت أداة ${tool} على وسيط البيت وحدد مسارها في HOME_REMOTE_${tool.toUpperCase().replaceAll('-', '_')}.`);
  return await new Promise<string>((resolve, reject) => {
    let executable = binary.endsWith('.js') ? process.execPath : binary;
    let argumentsList = binary.endsWith('.js') ? [binary, ...args] : args;
    if (/\.bat$/i.test(binary) && process.platform === 'win32') {
      if ([binary, ...args].some(a => /[%!&|<>^"\r\n]/.test(a))) { reject(new Error('مسار أداة المطوّر يحتوي رموزًا لا يمكن تمريرها بأمان.')); return; }
      executable = process.env.ComSpec || 'C:/Windows/System32/cmd.exe';
      argumentsList = ['/d', '/s', '/c', `""${binary}" ${args.map(a => `"${a}"`).join(' ')}"`];
    }
    execFile(executable, argumentsList,
      { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
        // Do not expose stdout/stderr containing pairing codes or credentials to the phone/log.
        if (error || /\bFailure\b|INSTALL_FAILED|install fail|error:/i.test(stdout + stderr)) reject(new Error(`${tool}: تعذر تنفيذ الطلب. راجع الاقتران وصلاحيات المطوّر وتوافق الحزمة.`));
        else resolve(stdout);
      });
  });
}
export function androidSerial(host: string, port = 5555) { return `${host}:${port}`; }
export function safeAppId(id: unknown): asserts id is string { if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(id)) throw new Error('معرّف التطبيق غير صالح.'); }
export function safeTarget(id: unknown): asserts id is string { if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error('اسم جهاز أدوات المطوّر غير صالح.'); }
