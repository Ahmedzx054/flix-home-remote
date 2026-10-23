# تطبيق iPhone دون امتلاك Mac

نسخة جهاز iPhone ‏0.4.0/build5، iOS 17 فأحدث، جُمّعت فعليا يوم 2026-10-23 على Xcode 27.1 وSwift 6.4. النسخة العامة الأخيرة `releases/public-ios-build-1/HomeRemote-unsigned.ipa` وقعت وثبتت فعليا على iPhone عبر iLoader2.4.0 من Windows بحساب Apple العادي؛ تحقق USB سجل0.4.0/build5. ملف المصدر المحفوظ ما زال بلا توقيع؛ تشغيل التطبيق وقبول LAN/الدعم لم يتحققا بعد. تطبيق الهاتف يتصل بالشاشة مباشرة؛ Windows يستخدم للتثبيت والتجديد فقط ولا يمر التحكم بالتلفزيون من خلاله.

البناء العام [#1 من المستودع المفتوح](https://github.com/Ahmedzx054/flix-home-remote/actions/runs/39960334666) نجح من commit `51929e0ed738456ec886da2bab923bb0a1b39a4b`، مع 8/8 فحوص توزيع وبدء. نزل Artifact `12505256282` وطابقت بصمة ZIP الرسمية وفحص CRC والمنصة ARM64/iPhoneOS وهوية التطبيق وإذن الشبكة المحلية وفئات الأدوات الأربع. حجم IPA ‏3,149,690 بايت وSHA-256: `1c0e8c344e75174a1d0c40cd62ed5dc98213fb29ff90d575fa7ec07f83ccc2ed`. الأدلة `evidence/ios-public-run.json` و`ios-public-device.json`. ينتهي احتفاظ GitHub به في 2026-10-30؛ النسخة المحلية محفوظة.

المستودع الخاص: [Ahmedzx054/flix-home-remote-ios](https://github.com/Ahmedzx054/flix-home-remote-ios). [البناء الناجح #3](https://github.com/Ahmedzx054/flix-home-remote-ios/actions/runs/39952010968) من المصدر `0ba0784ed4082eff381a72ef9a25ee071dd674ac` أنتج Artifact `HomeRemote-iPhone-unsigned-3` (ينتهي احتفاظ GitHub به 2026-10-30؛ النسخة المحلية محفوظة). حجم IPA ‏3,149,701 بايت وبصمته SHA-256: `88e890c80d076454330b6c64df5974e022ac5d988bbe2a53070e9829945b57c5`. أدلة البناء والحزمة في `evidence/ios-cloud-run.json` و`ios-cloud-device.json` وسجل `ios-xcode-job-120408480002.log`.

أصلح مسار SceneDelegate ليستخدم HomeRemoteViewController الذي يسجل HomeDiscovery وDirectLan وDirectAdb؛ المشهد البرمجي كان يستبدل مشهد storyboard بمتـحكم Capacitor العام. فحص المسارين وتسجيل الأدوات نجح ضمن 8/8 فحوص، وجُمّعت فئاتها فعليا داخل الملف. هذا لا يثبت تشغيلها على iPhone حتى تثبت النسخة وتجرب.

تحديث جلسة التثبيت: متابعة 2026-10-23: نجح دخول Apple في iLoader2.4.0، ثم استوردت الأداة حزمة HomeRemote-unsigned.ipa الموثقة من public-ios-build-1 وظهرت Operation completed عند Sign & Install App. تحقق فعلي عبر USB عند15:54:33UTC أثبت تثبيت FLIX Home Remote0.4.0/build5. AltStore غير مثبت وخطؤه -80046 لم يصلح داخل AltServer؛ تجاوزنا تعطل التثبيت بتثبيت الريموت مباشرة. يحتاج المالك الآن فتح التطبيق وإكمال الوثوق/وضع المطور إن طلبهما الهاتف؛ تشغيله وربط التلفزيون والدعم الفعلي لم يتحقق بعد. الأدلة: evidence/ios-signing-alternative.json وios-usb-app-presence.json. راجع [المسار الحالي في دليل Windows](WINDOWS_INSTALL_STEPS_AR.md).

## المسار بحساب Apple عادي وWindows

1. نفذ `python scripts/stage-ios-cloud.py`. الناتج `releases/home-remote-ios-cloud.zip` مصدر مستقل؛ بصماته في `evidence/ios-cloud-source.json`. لا ترفع مجلد FLIX الكامل أو `.data` أو بيانات حسابات أو شهادات. الحزمة تستخدم قائمة ملفات مسموحة وتستبعد المفاتيح والإعدادات المحلية والمخرجات.
2. ادخل GitHub بحسابك، وأنشئ مستودعا **خاصا** مخصصا لـHome Remote. فك الحزمة محليا وارفع محتوياتها مع المجلد المخفي `.github` إلى جذر المستودع. إذا استخدمت GitHub Desktop فالرفع يتطلب دخولك ولا يحتاج رمز وصول في المحادثة. لا ترفع الحزمة كملف ZIP وحيد؛ يجب أن يظهر `.github/workflows/ios-cloud.yml` داخل المستودع.
3. لإعادة البناء افتح Actions ← iPhone cloud build ← Run workflow، واختر `unsigned`؛ تحديث main يشغله أيضا. المسار يستعمل ماك GitHub السحابي `xcode-27` ويفحص Swift 6.4 أو أحدث كما تتطلب نسخة ADBCore المثبتة، ويثبت Go بإجراء مثبت البصمة. لا يخفض المتطلبات عند الفشل. لا يحتاج هذا البناء مفتاح Apple أو OpenAI. توفر المشغل ووقت البناء يخضعان لحساب GitHub وحصته؛ لا تضف وسيلة دفع لمجرد التجربة.
4. بعد نجاح المهمة نزّل Artifact باسم `HomeRemote-iPhone-unsigned-…` وفكه. يلزم `HomeRemote-unsigned.ipa` و`ios-build.json`، ويجب أن يكون `compiledWithXcode=true` و`signedIPA=false`. طابق SHA-256 قبل التثبيت. هذا ملف جهاز ARM64 بلا توقيع؛ نجاحه لا يثبت تشغيل التطبيق على الهاتف.
5. جهز [AltStore Classic من دليله الرسمي لـWindows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows): iTunes وiCloud من Apple حسب متطلبات الدليل، ثم AltServer. صل iPhone بالـUSB، وافق «الوثوق بهذا الكمبيوتر»، وشغّل Wi-Fi sync عند توفره. من AltServer اختر Install AltStore وأدخل حساب Apple بنفسك في واجهته؛ لا ترسل كلمة المرور أو رموزها إلى الدعم.
6. على iPhone وثّق ملف المطور من الإعدادات حسب الدليل وفعّل Developer Mode إن طلب النظام. من AltStore ← My Apps ← `+` اختر ملف IPA بعد نقله إلى Files. قد تفشل إعادة التوقيع إذا كان الحساب أو ملف provisioning أو صلاحيات iOS لا تسمح؛ احفظ الخطأ بدلا من تجاوز التحقق. حساب Apple المجاني يتطلب عادة تجديد التطبيق خلال 7 أيام باستخدام AltServer، ولا يجعل Windows وسيط تحكم بالشاشة.

ملفات Windows الرسمية موجودة محليا في `.data/windows-ios-setup/`: `iTunes64Setup.exe` و`iCloudSetup.exe` و`AltInstaller/setup.exe`. فحص 2026-10-23 الساعة 13:42 UTC أكد تثبيت iTunes 12.13.11.1 وApple Mobile Device Support 20.0.0.35 وتشغيل خدمته. iCloud وAltServer غير مثبتين، ولم يظهر iPhone متصل. شغل iCloud ثم AltInstaller يدويا بالترتيب؛ أداة التحكم رفضت `msiexec.exe` بسبب سياسة المنتج، فلا نتجاوزها بتثبيت صامت أو أداة بديلة. توقيعا Apple ظهرا Valid عند تنزيلهما؛ ملفا AltStore داخل ZIP الرسمي ليس لهما Authenticode، لذلك سجلت بصمة التنزيل ومصدره بدلا من نسب توقيع غير موجود. سجل التنزيلات السابق في `evidence/ios-windows-{downloads,signatures}.json`؛ الحالة الحالية في `ios-windows-readiness.json`. يحتاج المالك توصيل الهاتف وفتح قفله والموافقة على الثقة وإدخال حساب Apple بنفسه.

لنقل IPA بعد تثبيت AltStore: استخدم `releases/public-ios-build-1/HomeRemote-unsigned.ipa` وانقله إلى تطبيق Files على iPhone عبر iCloud Drive أو وسيلة نقل تختارها، ثم اختره من My Apps ← `+`. يمكن أيضا تنزيل Artifact البناء العام #1 من GitHub في Safari بعد دخول حسابك وفك ZIP في Files. لا يكفي فتح ملف IPA في Safari لتثبيته؛ AltStore يعيد توقيعه أولا. النسخة الخاصة السابقة محفوظة في `releases/HomeRemote-unsigned.ipa` دون استبدالها.

مسار unsigned يبني دون صلاحية Apple المقيدة `com.apple.developer.networking.multicast` حتى يمكن توقيعه بحساب عادي. يبقى إذن الشبكة المحلية ضروريا، وتتوفر محاولة Bonjour للخدمات المعلنة أو إدخال IPv4 للشاشة. اكتشاف SSDP الخاص ببعض LG/Samsung قد لا يعمل بهذه النسخة؛ لا يعني ذلك أن اتصال TCP/WebSocket المباشر بعنوان الشاشة فشل. اكتمال دعم multicast يحتاج موافقة Apple وملف توقيع يتضمن الصلاحية ثم قبول جهاز فعلي.

## التجربة الفعلية بحساب FLIX

1. افتح التطبيق الأصلي على iPhone، امنحه Local Network، واجعل الهاتف والتلفزيون على Wi-Fi واحد دون عزل عملاء. أبق التطبيق في الواجهة أثناء الدعم.
2. اكتشف الشاشة أو أضف IPv4 من إعدادات الشبكة فيها، واختر نظامها الفعلي. LG يحتاج موافقة شاشة الاقتران، Samsung موافقته، وTCL بنظام Android/Google TV يحتاج Wireless debugging ورمز الاقتران ومنفذي pairing/connect. TCL Roku يستخدم مساره المختلف.
3. افتح «حسابك والمساعدة» وسجّل بنفس بريد وكلمة مرور FLIX داخل التطبيق. دخول FLIX في متصفح الكمبيوتر لا ينقل جلسته إلى التطبيق. افتح [حساب FLIX](https://flix-s-phi.vercel.app/account) عند الحاجة لمراجعة الحساب دون تسجيل خروج الجلسة الحالية.
4. افتح [دخول FLIX Admin](https://flix-admin-tan.vercel.app/) للمشغل، ثم [لوحة دعم الهاتف](https://flix-admin-tan.vercel.app/home-remote-support.html). افتتحت الصفحتان في متصفح Codex؛ تحديث اللوحة طلب دخول الإدارة عند فحص 13:42 UTC. مشاهدة 0 بلاغات من جلسة Chrome السابقة دليل تاريخي فقط؛ لم يتحقق وصول تقرير هاتف فعلي. شارك التشخيص من الهاتف واختر بلاغ البريد نفسه في اللوحة. ابدأ برسالة وقراءة حالة، ثم امنح التحكم للشاشة المحددة لمدة 15 دقيقة واختبر إجراء واحدا مأذونا ونتيجته. ألغ المشاركة وتحقق من انتهاء الإذن.
5. لتثبيت تطبيق تلفزيون، أضف من Files الحزمة المتوافقة مع نظام الشاشة إلى مكتبة الهاتف وراجع المعرف والبصمة. APK لأندرويد TV، IPK لـLG مع Developer Mode/Key Server، وWGT لسامسونغ مع Developer Mode وشهادة/DUID مناسبين. للتثبيت موافقة مستقلة؛ نجاح النقل لا يكفي حتى تفتح النسخة على التلفزيون وتتأكد منها.

لا يوجد ذكاء اصطناعي أو اشتراك OpenAI مطلوب في هذه القناة. لوحة المشغل تربط الحساب والتشخيص والأوامر والنتائج. لا تستطيع هذه المحادثة البقاء مشغلا دائما، ولا تصل لجلسة هاتف أو تلفزيون ما لم يكن التطبيق متصلا ومشاركا للدعم ومشغل الإدارة مسجلا.

## إذا كانت لديك عضوية Apple Developer

يمكن بناء وتوقيع نسخة عبر خدمة Mac سحابية مع فريقك وشهادة وprovisioning، ثم توزيعها عبر TestFlight بعد إعداد App Store Connect. لا يحتاج ذلك امتلاك Mac في المنزل. `scripts/build-ios.sh archive` يدعم شهادة مثبتة على الماك و`FLIX_APPLE_TEAM`، والتصدير الاختياري عبر `FLIX_IOS_EXPORT_OPTIONS`. المسار لا يرفع للمتجر ولا ينشئ عضوية أو مفاتيح أو شهادات بالنيابة عنك. صلاحية multicast يجب أن تدخل التوقيع فعلا حتى نعدها مقبولة.

## الفحص والحالة

- `bash scripts/build-ios.sh unsigned`: بناء جهاز على Mac السحابي، ثم تحقق Mach-O/ARM64 ومنصة iPhone وحزمة التطبيق، ثم تغليف بلا توقيع. يفشل عند ظهور provisioning أو توقيع قديم في الحزمة.
- `bash scripts/build-ios.sh simulator`: فحص تجميع فقط، لا ينتج IPA جهاز ولا يحل محل تجربة iPhone.
- `python -m unittest discover -s tests -p 'test_ios_*.py'`: ‏8/8، فحص أدوات التوزيع باستخدام ملفات اصطناعية وربط بدء iOS بالأدوات المحلية؛ لا يمثل وحده نجاح Xcode أو هاتف.
- Windows وحده لا يشغّل Xcode. رفع المصدر وتشغيل المهمة وتوقيع IPA وتجربة الهاتف خطوات منفصلة؛ لا يسجل أي منها ناجحا قبل دليله.

المراجع: [مشغلات GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)، [صورة Xcode 27](https://github.com/actions/runner-images/blob/main/images/macos/xcode-27-arm64-Readme.md)، [خصوصية الشبكة المحلية من Apple](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)، [حساب Apple Developer](https://developer.apple.com/help/account/basics/about-your-developer-account).
