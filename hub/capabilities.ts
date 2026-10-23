import type { Capabilities, Command, Device } from '../src/model.ts';
import { toolPath } from './tools.ts';
const navigation: Command[] = ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'volumeUp', 'volumeDown', 'mute', 'playPause', 'powerOff', 'settings'];
export function capabilities(d: Device): Capabilities {
  const androidReady = d.platform !== 'android' || !!toolPath('adb');
  const supported = d.platform !== 'unknown';
  const ready = supported && d.paired && androidReady;
  const reason = !supported ? 'الجهاز لا يعلن بروتوكول تحكم مدعومًا.' : !androidReady ? 'أداة ADB غير متاحة على وسيط البيت.' : !d.paired ? 'اقترن بالتلفزيون أولًا.' : undefined;
  const tool = d.platform === 'webos' ? 'ares-install' : d.platform === 'tizen' ? 'tizen' : d.platform === 'android' ? 'adb' : undefined;
  const installReady = ready && !!tool && !!toolPath(tool) && (d.platform === 'android' || (d.platform === 'tizen' ? !!toolPath('sdb') : !!d.developerTarget && !!toolPath('ares-setup-device')));
  const guides: Record<string, [string[], string, string]> = {
    webos: [['اقبل طلب الاتصال على التلفزيون للتحكم العادي.', 'لتثبيت IPK: ثبّت Developer Mode من متجر LG وسجل حساب المطوّر على التلفزيون.', 'فعّل Dev Mode وKey Server بنفسك. هذا قد يعيد تشغيل التلفزيون؛ اختر وقتًا مناسبًا.', 'أضف التلفزيون في ares-setup-device ثم اجلب المفتاح بـ ares-novacom --getkey وأدخل اسم الجهاز هنا.'], 'https://webostv.developer.lge.com/develop/getting-started/developer-mode-app', 'يمكن عرض الصوت والمداخل التي يعيدها الجهاز. إعدادات الصورة المحمية تحتاج صلاحيات الشركة ولا تُفترض.'],
    tizen: [['اقبل طلب ريموت البيت من شاشة سامسونغ.', 'لتثبيت WGT: افتح Apps ثم فعّل Developer Mode وفق موديلك وحدد عنوان وسيط البيت.', 'جهّز Tizen Studio وشهادة Samsung المصرح لها بهذا التلفزيون وحزمة WGT موقّعة.', 'أضف الجهاز إلى Tizen Studio وأدخل اسمه هنا. لا يمكن تثبيت APK أو IPK عليه.'], 'https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html', 'بعض موديلات سامسونغ لا تعيد قائمة التطبيقات. الإعدادات تُفتح على الشاشة ويتحكم بها الريموت.'],
    android: [['افتح الإعدادات ← حول الجهاز، واضغط رقم الإصدار 7 مرات لتمكين خيارات المطوّر إذا كانت متاحة.', 'فعّل Wireless debugging أو Network debugging بنفسك، واسمح بهذا الكمبيوتر.', 'Android 11+: أدخل منفذ الاقتران ورمزه، ثم منفذ الاتصال المختلف الظاهر في الشاشة.', 'بعد الاقتران يمكن قراءة التطبيقات والتحكم وتثبيت APK. إيقاف التصحيح يوقف هذا الاتصال.'], 'https://developer.android.com/tools/adb#wireless-android11-command-line', 'يشمل TCL وSony وHisense عندما تعمل بنظام Android/Google TV. تظهر إعدادات الشاشة التي يسمح بها النظام.'],
    roku: [['فعّل Settings ← System ← Advanced system settings ← Control by mobile apps إن كان متاحًا.', 'اسمح بالتحكم من شبكة البيت. بعض إصدارات Roku تقيد ECP.', 'تثبيت APK وIPK وWGT غير متوافق مع Roku. تثبيت قناة تطوير يحتاج مسار Roku الخاص.'], 'https://developer.roku.com/docs/developer-program/debugging/external-control-api.md', 'تطبيقات Roku وأيقوناتها والملاحة عبر ECP حسب صلاحيات النظام.'],
    unknown: [['تحقق من نظام التلفزيون وموديله؛ مشاركة الواي فاي وحدها لا توفر واجهة تحكم.', 'إذا عرفت النظام، أضف عنوانه يدويًا واختر النظام الصحيح.', 'الأجهزة التي لا تدعم التحكم الشبكي تحتاج جهاز بث متوافقًا أو مرسل IR خارجيًا.'], '', 'لا تُعرض أزرار تحكم أو تثبيت على جهاز لا نعرف بروتوكوله.'],
  };
  const [steps, docs, note] = guides[d.platform];
  return { control: { available: ready, reason }, apps: { available: ready, reason }, settings: { available: ready, reason }, install: { available: installReady, reason: installReady ? undefined : !tool ? 'لا يوجد مسار تثبيت لهذه المنصة.' : !toolPath(tool) ? `أداة ${tool} غير متاحة على الوسيط.` : !d.paired ? reason : 'جهّز وضع المطوّر واسم الجهاز على الوسيط أولًا.' }, commands: ready ? navigation.filter(c => d.platform !== 'roku' || c !== 'settings') : [], steps, docs, note };
}
