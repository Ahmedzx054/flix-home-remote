export const BLUETOOTH_ADDRESS = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
export const BLUETOOTH_OPS = ["status", "scan", "stop", "connect", "disconnect", "remove"];
export const BLUETOOTH_SCAN_MS = 3e4;
export function bluetoothKind(classOfDevice) {
  const cod = Number(classOfDevice) || 0;
  const major = cod >> 8 & 31;
  const minor = cod >> 2 & 63;
  if (major !== 4) return "";
  if (minor === 1 || minor === 2 || minor === 6) return "headphones";
  if (minor >= 11 && minor <= 15) return "screen";
  return "speaker";
}
const REMOTE_NAME = /^LGE\s*MR|magic\s*remote/i;
export function bluetoothListing(devices) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const device of Array.isArray(devices) ? devices : []) {
    const address = String((device == null ? void 0 : device.address) || "").toLowerCase();
    if (!BLUETOOTH_ADDRESS.test(address) || seen.has(address)) continue;
    const name = String((device == null ? void 0 : device.name) || "").trim();
    const profiles = Array.isArray(device == null ? void 0 : device.connectedProfiles) ? device.connectedProfiles.map(String) : [];
    const connected = profiles.includes("a2dp");
    const kind = bluetoothKind(device == null ? void 0 : device.classOfDevice) || (connected ? "speaker" : "");
    if (!kind || REMOTE_NAME.test(name)) continue;
    seen.add(address);
    out.push({ address, name: name || address.toUpperCase(), kind, paired: Boolean(device == null ? void 0 : device.paired), connected, pairing: Boolean(device == null ? void 0 : device.pairing) });
  }
  const rank = (one) => one.connected ? 0 : one.paired ? 1 : 2;
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
export function bluetoothOnTelevision(op, address, waitMs) {
  var BT = "luna://com.webos.service.bluetooth2/";
  var heard = [];
  function ask(path, params, keep, onEach, holder) {
    return new Promise(function(resolve) {
      var bridge;
      try {
        bridge = new PalmServiceBridge();
      } catch (e) {
        resolve({ returnValue: false, errorText: "no_bridge" });
        return;
      }
      var done = false;
      function finish(answer) {
        if (done) return;
        done = true;
        try {
          bridge.cancel();
        } catch (e) {
        }
        resolve(answer);
      }
      if (holder) holder.finish = finish;
      bridge.onservicecallback = function(raw) {
        var message;
        try {
          message = JSON.parse(raw);
        } catch (e) {
          message = { returnValue: false, errorText: String(raw).slice(0, 160) };
        }
        if (path !== "device/getStatus" && path !== "adapter/getStatus") heard.push(path + " " + JSON.stringify(message).slice(0, 160));
        if (!keep) {
          finish(message);
          return;
        }
        if (message.returnValue === false) {
          finish(message);
          return;
        }
        if (onEach) onEach(message, finish);
      };
      var body = {};
      for (var key in params) body[key] = params[key];
      if (keep) body.subscribe = true;
      bridge.call(BT + path, JSON.stringify(body));
      setTimeout(function() {
        finish({ returnValue: false, errorText: "timeout", timedOut: true });
      }, keep ? waitMs : 9e3);
    });
  }
  function pause(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }
  function slim(d) {
    return {
      address: String(d.address || "").toLowerCase(),
      name: String(d.name || ""),
      paired: Boolean(d.paired),
      pairing: Boolean(d.pairing),
      connectedProfiles: Array.isArray(d.connectedProfiles) ? d.connectedProfiles : [],
      classOfDevice: Number(d.classOfDevice) || 0
    };
  }
  function devicesNow() {
    return ask("device/getStatus", {}, false).then(function(answer) {
      return (answer && answer.devices ? answer.devices : []).map(slim);
    });
  }
  function find(devices, wanted) {
    for (var i = 0; i < devices.length; i++) if (devices[i].address === wanted) return devices[i];
    return null;
  }
  function a2dpOn(d) {
    return Boolean(d && d.connectedProfiles.indexOf("a2dp") >= 0);
  }
  async function until(test, ms) {
    var end = Date.now() + ms;
    var d = null;
    while (Date.now() < end) {
      d = find(await devicesNow(), address);
      if (test(d)) return d;
      await pause(700);
    }
    return find(await devicesNow(), address);
  }
  async function run() {
    if (typeof PalmServiceBridge !== "function") return { ok: false, error: "no_bridge" };
    if (op === "status") {
      var adapter = await ask("adapter/getStatus", {}, false);
      var list = await ask("device/getStatus", {}, false);
      var first = adapter && adapter.adapters && adapter.adapters[0] || {};
      return {
        ok: list.returnValue !== false,
        adapter: { powered: first.powered !== false, discovering: Boolean(first.discovering), name: String(first.name || "") },
        devices: (list.devices || []).map(slim),
        error: list.errorText || ""
      };
    }
    if (op === "scan" || op === "stop") {
      var answer = await ask(op === "scan" ? "adapter/startDiscovery" : "adapter/cancelDiscovery", {}, false);
      return { ok: answer.returnValue !== false, error: answer.errorText || "" };
    }
    var all = await devicesNow();
    var device = find(all, address);
    if (!device) return { ok: false, error: "gone" };
    if (op === "connect") {
      if (!device.paired) {
        await ask("adapter/cancelDiscovery", {}, false);
        var failed = null;
        var pairing = {};
        ask("adapter/pair", { address }, true, function(message, finish) {
          var request = String(message.request || "");
          if (request === "confirmPasskey" || request === "displayPasskey") ask("adapter/supplyPasskeyConfirmation", { address, accept: true }, false);
          else if (request === "promptPinCode") ask("adapter/supplyPinCode", { address, pin: "0000" }, false);
          else if (request === "promptPasskey") ask("adapter/supplyPasskey", { address, passkey: 0 }, false);
          if (message.subscribed === false) finish(message);
        }, pairing).then(function(last) {
          if (last && last.returnValue === false && !last.timedOut) failed = last;
        });
        var end = Date.now() + waitMs;
        while (Date.now() < end && !failed) {
          await pause(700);
          device = find(await devicesNow(), address);
          if (device && device.paired) break;
        }
        if (pairing.finish) pairing.finish({ returnValue: true, ended: true });
        if (!device || !device.paired) await ask("adapter/cancelPairing", { address }, false);
        if (!device || !device.paired) return { ok: false, error: failed ? String(failed.errorText || "pair_failed") : "pair_timeout", device, heard: heard.slice(-6) };
      }
      var before = [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].address !== address && a2dpOn(all[i])) {
          before.push(all[i].address);
          await ask("a2dp/disconnect", { address: all[i].address }, false);
        }
      }
      var started = await ask("a2dp/connect", { address }, false);
      var error = started.returnValue === false && !started.timedOut ? String(started.errorText || "connect_failed") : "";
      if (!error) {
        device = await until(a2dpOn, 15e3);
        if (!a2dpOn(device)) error = "connect_timeout";
      }
      if (!error) return { ok: true, error: "", device, heard: heard.slice(-6) };
      for (var j = 0; j < before.length; j++) await ask("a2dp/connect", { address: before[j] }, false);
      if (before.length) {
        var end2 = Date.now() + 1e4;
        while (Date.now() < end2) {
          var now = await devicesNow();
          if (before.every(function(one) {
            return a2dpOn(find(now, one));
          })) break;
          await pause(700);
        }
      }
      return { ok: false, error, device, restored: before, heard: heard.slice(-6) };
    }
    if (op === "disconnect") {
      await ask("a2dp/disconnect", { address }, false);
      device = await until(function(d) {
        return !a2dpOn(d);
      }, 8e3);
      return { ok: !a2dpOn(device), error: a2dpOn(device) ? "disconnect_timeout" : "", device, heard: heard.slice(-6) };
    }
    if (op === "remove") {
      if (a2dpOn(device)) {
        await ask("a2dp/disconnect", { address }, false);
        await until(function(d) {
          return !a2dpOn(d);
        }, 6e3);
      }
      var removed = await ask("adapter/unpair", { address }, false);
      device = await until(function(d) {
        return !d || !d.paired;
      }, 8e3);
      var gone = !device || !device.paired;
      return { ok: gone, error: gone ? "" : String(removed.errorText || "remove_timeout"), device, heard: heard.slice(-6) };
    }
    return { ok: false, error: "unknown_op" };
  }
  return run().catch(function(e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 160), heard: heard.slice(-6) };
  });
}
export function bluetoothExpression(op, address = "", waitMs = 25e3) {
  return `(${bluetoothOnTelevision.toString()})(${JSON.stringify(String(op))}, ${JSON.stringify(String(address).toLowerCase())}, ${Number(waitMs) || 25e3})`;
}
export function bluetoothMessage(error) {
  const text = String(error || "");
  if (text === "app_closed") return "\u0627\u0644\u0628\u0644\u0648\u062A\u0648\u062B \u064A\u064F\u062F\u0627\u0631 \u0645\u0646 \u062F\u0627\u062E\u0644 \u0641\u0644\u0643\u0633 \u2014 \u0627\u0641\u062A\u062D \u0641\u0644\u0643\u0633 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0623\u0648\u0644\u064B\u0627";
  if (text === "no_bridge") return "\u0647\u0630\u0627 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0644\u0627 \u064A\u0635\u0644 \u0644\u0628\u0644\u0648\u062A\u0648\u062B \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u2014 \u0627\u0641\u062A\u062D \u0641\u0644\u0643\u0633 \u0627\u0633";
  if (text === "busy") return "\u0639\u0645\u0644\u064A\u0629 \u0628\u0644\u0648\u062A\u0648\u062B \u0623\u062E\u0631\u0649 \u062C\u0627\u0631\u064A\u0629 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u2014 \u0644\u062D\u0638\u0627\u062A";
  if (text === "gone") return "\u0627\u0644\u062C\u0647\u0627\u0632 \u0644\u0645 \u064A\u0639\u062F \u0638\u0627\u0647\u0631\u064B\u0627 \u2014 \u0634\u063A\u0651\u0644\u0647 \u0648\u0636\u0639\u0647 \u0642\u0631\u064A\u0628\u064B\u0627 \u062B\u0645 \u0627\u0628\u062D\u062B \u0645\u0646 \u062C\u062F\u064A\u062F";
  if (text === "pair_timeout") return "\u0644\u0645 \u064A\u0642\u0628\u0644 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0627\u0642\u062A\u0631\u0627\u0646 \u2014 \u062A\u0623\u0643\u062F \u0623\u0646\u0647 \u0641\u064A \u0648\u0636\u0639 \u0627\u0644\u0627\u0642\u062A\u0631\u0627\u0646 (\u0627\u0644\u0636\u0648\u0621 \u064A\u0648\u0645\u0636) \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629";
  if (text === "connect_timeout" || /connect_failed|failed to connect/i.test(text)) return "\u0644\u0645 \u064A\u062A\u0635\u0644 \u2014 \u062A\u0623\u0643\u062F \u0623\u0646 \u0627\u0644\u062C\u0647\u0627\u0632 \u064A\u0639\u0645\u0644 \u0648\u0642\u0631\u064A\u0628 \u0645\u0646 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646";
  if (text === "disconnect_timeout") return "\u0644\u0645 \u064A\u0646\u0641\u0635\u0644 \u0627\u0644\u062C\u0647\u0627\u0632 \u0628\u0639\u062F \u2014 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629";
  if (text === "remove_timeout") return "\u0644\u0645 \u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u062C\u0647\u0627\u0632 \u2014 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629";
  if (/timeout/i.test(text)) return "\u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0645 \u064A\u064F\u0643\u0645\u0644 \u0627\u0644\u0637\u0644\u0628 \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u2014 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629";
  return text ? `\u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0631\u0641\u0636: ${text.slice(0, 80)}` : "\u062A\u0639\u0630\u0651\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0637\u0644\u0628";
}
