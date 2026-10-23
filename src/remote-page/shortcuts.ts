import type {TvApp} from '../model.ts';
export function resolveShortcut(id:string,apps:TvApp[]){
 const exact=apps.find(a=>a.id===id);if(exact)return exact.id;
 const aliases:Record<string,RegExp>={netflix:/netflix|نتفلكس/i,'youtube.leanback.v4':/youtube|يوتيوب/i,'com.apple.appletv':/apple\s*tv|أبل تي/i,'net.mbc.shahid-lgapp':/shahid|شاهد/i,'com.netflixfree.s.cloud':/flix\s*s\b|فلكس\s*(اس|إس)/i,'com.netflixfree.f.cloud':/flix\s*f\b|فلكس\s*(اف|إف)/i,'com.netflixfree.tv.cloud':/flix.*iptv|فلكس.*آي بي/i};
 const pattern=aliases[id],matches=pattern?apps.filter(a=>pattern.test(a.label)):[];
 if(matches.length!==1)throw Error(matches.length?'يوجد أكثر من تطبيق مطابق؛ اختر التطبيق من قائمة التلفزيون.':'التطبيق غير موجود في القائمة التي أعادها التلفزيون.');return matches[0].id;
}
