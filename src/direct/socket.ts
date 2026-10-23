import { Lan, localUrl } from './native.ts';
type Message = Record<string, any>;
export class TvSocket {
  private id = crypto.randomUUID(); private active = false; private sequence = 0;
  private waits = new Set<{ test: (m: Message) => boolean; resolve: (m: Message) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private pending: Message[] = [];
  ws = { send: (data: string) => { void this.write(data).catch(e => this.fail(e)); } };
  constructor(private url: string) { localUrl(url); }
  get alive() { return this.active; }
  async open() { await Lan.open({ id: this.id, kind: 'ws', url: this.url }); this.active = true; void this.pump(); }
  private async pump() {
    try { while (this.active) { const r = await Lan.read({ id: this.id }); if (r.data !== undefined) { let m: Message; try { m = JSON.parse(r.data); } catch { continue; } let consumed = false; for (const w of [...this.waits]) if(w.test(m)) { consumed = true; clearTimeout(w.timer); this.waits.delete(w); if (m.type === 'error' || m.event === 'ms.channel.unauthorized' || m.payload?.returnValue === false) w.reject(new Error(String(m.error || m.payload?.errorText || 'رفض التلفزيون الطلب.'))); else w.resolve(m); } if (!consumed) { this.pending.push(m); if (this.pending.length > 30) this.pending.shift(); } } if (r.closed) throw new Error('انقطع اتصال التلفزيون. أعد الاقتران أو حدّث الحالة.'); } }
    catch (e) { this.fail(e); }
  }
  private fail(error: unknown) { this.active = false; for(const w of this.waits) { clearTimeout(w.timer); w.reject(error instanceof Error ? error : new Error('TV disconnected')); } this.waits.clear(); void Lan.close({ id: this.id }).catch(()=>{}); }
  wait(test: (m: Message) => boolean, ms = 8000): Promise<Message> {
    const index=this.pending.findIndex(test); if(index>=0) { const [m]=this.pending.splice(index,1); return m.type==='error'||m.payload?.returnValue===false||m.event==='ms.channel.unauthorized' ? Promise.reject(new Error(String(m.error||m.payload?.errorText||'رفض التلفزيون الطلب.'))) : Promise.resolve(m); }
    return new Promise((resolve,reject)=>{ const w = {test, resolve, reject, timer:setTimeout(()=>{this.waits.delete(w);reject(new Error('لم يرد التلفزيون خلال المهلة.'));},ms)}; this.waits.add(w); });
  }
  async write(data: string) { if (!this.active) throw new Error('التلفزيون غير متصل.'); await Lan.write({ id: this.id, data }); }
  send(data: unknown) { void this.write(JSON.stringify(data)).catch(e=>this.fail(e)); }
  async request(uri: string, payload?: unknown): Promise<any> { const id=String(++this.sequence); const response=this.wait(m=>m.id===id); void response.catch(()=>{}); try { await this.write(JSON.stringify({ id, type:'request', uri, payload })); return (await response).payload; } catch(e) { this.fail(e); throw e; } }
  close() { this.fail(new Error('أُغلق اتصال التلفزيون.')); }
}
