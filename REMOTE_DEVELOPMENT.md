# One remote page for browser, iPhone and Android

The canonical interface is `local_apps/flix-s/tools/tv-remote.html` in the parent FLIX workspace. Edit it once. Do not maintain a separate phone copy or edit the generated `src/remote-page/source.html` manually. This standalone public repository contains the generated, sanitized page; the private account server and household configuration are excluded.

`npm run build` refreshes the browser account block and revision, synchronizes the original page and shared rules, checks TypeScript, and builds the native shell. It also stages `../flix-s/public/home-remote/ui/release.json` and its content-addressed HTML. Publish both together with the account/download site. A build alone is not publication.

The browser checks its own page revision every minute and reloads while idle. Phone shells from 0.5.5 onward check the trusted HTTPS UI manifest at startup and every minute while idle. They verify the exact byte count, SHA-256, fixed download path, and bridge compatibility before caching or executing a page. Offline or damaged updates retain the last verified page or bundled fallback. Updating pauses during editing, gestures, account dialogs and diagnostic sharing. Foreground, connectivity and idle time determine delivery; devices do not update at exactly the same second. Earlier phone shells need a one-time binary update to enable this channel.

Shared HTML, layout, installed-app display and compatible original-page interactions use this channel. Changes to native plugins, permissions, protocol adapters or shell code still require new Android/iOS binaries. Bump the bridge version/cache namespace when an HTML release cannot safely run in an older shell. Never claim that HTML delivery upgrades native permissions or adds unsupported TV capabilities.

## Release checks

Run `npm run typecheck`, `npm test`, and `npm run build`. Run the original-page, browser-apps, browser-account, UI-delivery and browser-UI-update fixtures; they must intercept all TV/network calls. Build and verify Android, build iOS in the pinned cloud workflow, and match its artifact digest/source receipt. Stage the packages and hashed UI, then verify the candidate and public download endpoints before declaring publication. Use the canonical parent's admin source pin rather than overwriting the production account service from an arbitrary checkout.

Physical TV testing is a separate acceptance gate. Follow the owner's current household restriction. Never change input, playback, volume, apps, settings or power to satisfy a test while background-only work is required.

## Own-app library and diagnostics

The authenticated admin registry combines phone installations and browser installations, with platform filters and separate installation/account remote-access policies. It does not disable the FLIX viewing subscription. Updated clients poll policy; old clients must update before relying on this gate.

Publish each own-app release in the admin library with its app ID, version, TV platform, public HTTPS package URL, exact bytes and SHA-256. The phone filters compatibility, verifies downloads and saves them locally. Installing still requires explicit device/package review and the TV's developer prerequisites. APK, IPK and WGT are different packages; Samsung requires an accepted signed WGT, LG requires Developer Mode/Key Server, and Android requires authorized ADB. Do not infer arbitrary TV installation rights from Wi-Fi access.

To report health from an app you own, integrate `sdk/flix-device-link.mjs` in that app's code:

```js
const link = createDeviceLink({
  serviceUrl: 'https://your-account-service.example',
  appId: 'com.example.tv', platform: 'webos', version: '1.0.0',
  installationId: persistedUUID, deviceName: userVisibleName,
  getSession: async () => currentFlixSessionToken,
  hasConsent: () => diagnosticSharingEnabled
});
await link.report({ state: 'ready', code: 'startup', message: 'Started' });
const release = await link.latest();
```

Import `createDeviceLink` from the module. Supply the existing FLIX session and explicit consent; never embed an account token in a binary. Check the module's exact types/validation before integration. This SDK reports bounded health/version data and reads releases. It provides no arbitrary shell or automatic TV control. Merely publishing the SDK does not integrate it into existing TV app binaries. The real catalog can remain empty until actual compatible packages are published.

Android supports direct APK installation. The supplied unsigned iPhone IPA requires the owner's signing tool/account; a regular Apple account does not provide general public TestFlight distribution. TestFlight requires the owner's Apple Developer membership and Apple's process. Do not purchase membership or claim unsigned IPA downloads install themselves.
