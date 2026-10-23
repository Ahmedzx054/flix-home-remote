import { Capacitor, CapacitorHttp } from '@capacitor/core';
export async function request<T>(url: string, route: string, token = '', method = 'GET', data?: unknown, timeout = 15000): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let status: number, payload: any;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({ url: url + route, method, headers, data, connectTimeout: 8000, readTimeout: timeout, responseType: 'json' }); status = response.status; payload = response.data;
  } else {
    const response = await fetch(url + route, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(timeout) }); status = response.status; try { payload = await response.json(); } catch { throw new Error(`الخدمة لم تُعد استجابة التطبيق (${status}). تحقق من العنوان ونشر تحديث خدمة FLIX.`); }
  }
  if (status < 200 || status >= 300) throw new Error(payload.error || payload.receipt?.message || `تعذر الاتصال (${status}).`);
  return payload as T;
}
