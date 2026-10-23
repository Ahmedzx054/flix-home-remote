import { WebSocket } from 'ws';
type Message = Record<string, any>;
export class TvSocket {
  ws: WebSocket;
  private sequence = 0;
  constructor(url: string) { this.ws = new WebSocket(url, { handshakeTimeout: 6000, rejectUnauthorized: false, maxPayload: 4 * 1024 * 1024 }); this.ws.on('error', () => undefined); }
  async open() { if (this.ws.readyState === WebSocket.OPEN) return; await new Promise<void>((resolve, reject) => { const done = (error?: Error) => { this.ws.off('open', opened); this.ws.off('error', failed); this.ws.off('close', closed); error ? reject(error) : resolve(); }; const opened = () => done(), failed = (e: Error) => done(e), closed = () => done(new Error('انقطع اتصال التلفزيون.')); this.ws.once('open', opened); this.ws.once('error', failed); this.ws.once('close', closed); }); }
  wait(predicate: (m: Message) => boolean, timeout = 7000): Promise<Message> {
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, message?: Message) => { clearTimeout(timer); this.ws.off('message', read); this.ws.off('close', closed); this.ws.off('error', closed); error ? reject(error) : resolve(message!); };
      const read = (raw: unknown) => { let m: Message; try { m = JSON.parse(String(raw)); } catch { return; } if (!predicate(m)) return; if (m.type === 'error' || m.payload?.returnValue === false || m.event === 'ms.channel.unauthorized') finish(new Error(String(m.error || m.payload?.errorText || 'رفض التلفزيون الإذن.'))); else finish(undefined, m); };
      const closed = () => finish(new Error('انقطع اتصال التلفزيون.'));
      const timer = setTimeout(() => finish(new Error('لم يرد التلفزيون في الوقت المحدد.')), timeout);
      this.ws.on('message', read); this.ws.once('close', closed); this.ws.once('error', closed);
    });
  }
  send(message: Message) { if (this.ws.readyState !== WebSocket.OPEN) throw new Error('اتصال التلفزيون مغلق.'); this.ws.send(JSON.stringify(message)); }
  async request(uri: string, payload: object = {}) { const id = String(++this.sequence); const response = this.wait(m => m.id === id); this.send({ id, type: 'request', uri, payload }); return (await response).payload as Message; }
  close() { this.ws.terminate(); }
  get alive() { return this.ws.readyState === WebSocket.OPEN; }
}
