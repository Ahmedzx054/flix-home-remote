export function keepAwakeOnTelevision(on) {
  var w = window;
  var power = "luna://com.webos.service.tvpower/power/";
  if (!on) {
    if (w.__flixKeepAwake) {
      try {
        w.__flixKeepAwake.cancel();
      } catch (e) {
      }
    }
    w.__flixKeepAwake = null;
    w.__flixKeepAwakeReady = false;
    return "off";
  }
  if (w.__flixKeepAwake) return "already";
  if (typeof PalmServiceBridge !== "function") return "no_bridge";
  w.__flixKeepAwakeReady = false;
  w.__flixKeepAwakeError = "";
  var listener = new PalmServiceBridge();
  listener.onservicecallback = function(raw) {
    var message;
    try {
      message = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (message && message.returnValue === false) {
      w.__flixKeepAwakeError = message.errorText || "TV refused";
      return;
    }
    if (message && message.subscribed === true) w.__flixKeepAwakeReady = true;
    if (!message || message.timestamp === void 0) return;
    var answer = new PalmServiceBridge();
    answer.onservicecallback = function() {
      try {
        answer.cancel();
      } catch (e) {
      }
    };
    answer.call(power + "responseScreenSaverRequest", JSON.stringify({ clientName: "flix-keep-awake", ack: false, timestamp: message.timestamp }));
    w.__flixKeepAwakeRefused = (w.__flixKeepAwakeRefused || 0) + 1;
    w.__flixKeepAwakeLastAt = Date.now();
  };
  listener.call(power + "registerScreenSaverRequest", JSON.stringify({ subscribe: true, clientName: "flix-keep-awake" }));
  w.__flixKeepAwake = listener;
  return "on";
}
export function keepAwakeExpression(on) {
  return `(${keepAwakeOnTelevision.toString()})(${on ? "true" : "false"})`;
}
export const KEEP_AWAKE_STATE = `JSON.stringify({ on: Boolean(window.__flixKeepAwake), refused: window.__flixKeepAwakeRefused || 0, lastAt: window.__flixKeepAwakeLastAt || 0 })`;
