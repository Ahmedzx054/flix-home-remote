import { parseUtterance, prepareTitle, matchTitles, validIntent, alignSeekDirection, fold, clockText, spokenDuration, MODEL_INSTRUCTIONS } from "./voice-commands-rules.js";
const APP_IDS = { s: "com.netflixfree.s.cloud", f: "com.netflixfree.f.cloud" };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomUUID = () => crypto.randomUUID();
const loadTitlePool = async () => [];
export function createVoiceExecutor(tv, options) {
  const houseJson = (route, timeoutMs = 8e3) => options.houseJson(route, timeoutMs);
  async function screen(host) {
    const read = await tv.evaluate(`(function(){
      var state = typeof window.__flixPlayerState === "function" ? window.__flixPlayerState() : null;
      var video = document.querySelector("video");
      return JSON.stringify({
        path: location.pathname, search: location.search,
        player: state,
        video: video ? { t: video.currentTime || 0, d: isFinite(video.duration) ? video.duration : 0, paused: video.paused } : null,
        title: document.title || ""
      });
    })()`, host).catch(() => null);
    if (!read || !read.ok || typeof read.value !== "string") return null;
    try {
      const value = JSON.parse(read.value);
      value.app = String(value.path || "").startsWith("/faselhd") ? "f" : "s";
      value.watching = /\/watch(?:$|[/?])/.test(String(value.path || "")) || Boolean(value.video && value.player);
      return value;
    } catch {
      return null;
    }
  }
  async function tmdbCandidates(query) {
    try {
      const payload = await houseJson(`/api/search?q=${encodeURIComponent(query)}`, 6e3);
      return (payload.results || []).filter((item) => item && (item.media_type === "movie" || item.media_type === "tv")).slice(0, 12).map((item) => prepareTitle({
        id: item.id,
        media: item.media_type,
        title: item.title || item.name || "",
        original: item.original_title || item.original_name || "",
        year: Number(String(item.release_date || item.first_air_date || "").slice(0, 4)) || null,
        votes: Number(item.vote_count || 0)
      }));
    } catch {
      return [];
    }
  }
  async function resolveTitle(intent) {
    const titles = await loadTitlePool(options.root);
    const queries = [intent.query, intent.english].filter(Boolean);
    const extra = [];
    for (const query of queries) extra.push(...await tmdbCandidates(query));
    const seen = /* @__PURE__ */ new Set();
    const candidates = [];
    for (const query of queries) {
      for (const hit of matchTitles(titles.concat(extra), query, { mediaType: intent.mediaType, year: intent.year, limit: 6 })) {
        const key = `${hit.entry.media}:${hit.entry.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(hit);
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    if (!best) return { best: null, alternatives: [], sure: false };
    const second = candidates[1];
    const sure = best.letters >= 0.8 || !second || best.score - second.score >= 0.08;
    return { best: best.entry, alternatives: candidates.slice(1, 4).map((hit) => hit.entry), sure, score: best.score };
  }
  async function resolveFasel(entry, intent) {
    const names = [intent.english, /[a-z]/i.test(entry?.original || "") ? entry.original : "", entry?.title, intent.query].filter(Boolean);
    for (const name of [...new Set(names)]) {
      try {
        const payload = await houseJson(`/api/faselhd?mode=search&q=${encodeURIComponent(name)}`, 1e4);
        const results = payload.results || payload.items || [];
        if (!results.length) continue;
        const wanted = fold(name);
        const scored = results.map((item) => {
          const title2 = fold(item.title || "");
          let score = title2 === wanted ? 1 : title2.startsWith(wanted) || wanted.startsWith(title2) ? 0.8 : title2.includes(wanted) ? 0.6 : 0.3;
          if (entry?.year && String(item.year || "") === String(entry.year)) score += 0.2;
          if (intent.season || intent.episode) score += item.mediaType === "series" ? 0.1 : -0.2;
          return { item, score };
        }).sort((a, b) => b.score - a.score);
        if (scored[0].score >= 0.6) return scored[0].item;
      } catch {
      }
    }
    return null;
  }
  function titlePath(app, entry, { play, season, episode: episode2, faselId }) {
    if (app === "f") {
      const base = `/faselhd/watch?id=${encodeURIComponent(faselId)}`;
      if (season && episode2) return `${base}&season=${season}&episode=${episode2}`;
      if (episode2) return `${base}&season=1&episode=${episode2}`;
      return play ? base : `/faselhd?title=${encodeURIComponent(faselId)}`;
    }
    const kind = entry.media === "tv" ? "tv" : "movie";
    if (kind === "tv" && (season || episode2)) return `/tv/${entry.id}/watch?s=${season || 1}&e=${episode2 || 1}`;
    if (!play) return `/${kind}/${entry.id}`;
    return kind === "tv" ? `/tv/${entry.id}` : `/movie/${entry.id}/watch`;
  }
  function fragmentsFor(target) {
    const detail = /^\/(movie|tv)\/(\d+)$/.exec(target.split("?")[0]);
    return detail ? [target, `flixDetail=${detail[1]}-${detail[2]}`] : [target];
  }
  async function arrived(host, fragment, withinMs = 7e3) {
    const wanted = Array.isArray(fragment) ? fragment : [fragment];
    const until = Date.now() + withinMs;
    while (Date.now() < until) {
      await wait(600);
      const state = await screen(host);
      const where = state ? `${state.path}${state.search}` : "";
      if (state && wanted.some((piece) => piece && where.includes(piece))) return true;
    }
    return false;
  }
  async function playerCommand(host, state, command) {
    const id = randomUUID().slice(0, 12);
    const detail = JSON.stringify({ id, ...command });
    const sent = await tv.evaluate(`(function(){ if (typeof window.__flixPlayerState !== "function") return "no-hook"; window.dispatchEvent(new CustomEvent("flix:player-command", { detail: ${detail} })); return "sent"; })()`, host);
    if (!sent?.ok) return { ok: false, error: "\u0635\u0641\u062D\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0627 \u062A\u062C\u064A\u0628" };
    if (sent.value === "no-hook") return { ok: false, noHook: true, error: "\u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062E\u0629 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0627 \u062A\u0639\u0631\u0641 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u0628\u0639\u062F" };
    await wait(command.op === "next" || command.op === "previous" ? 2500 : 900);
    const after = await screen(host);
    const note = after?.player?.lastCommand;
    if (note && note.id === id && !note.ok) return { ok: false, error: note.note || "\u0631\u0641\u0636 \u0627\u0644\u0645\u0634\u063A\u0651\u0644 \u0627\u0644\u0623\u0645\u0631" };
    return { ok: true, before: state, after, note };
  }
  function describePlayer(after) {
    if (!after?.player) return "";
    const p = after.player;
    return `${p.paused ? "\u0645\u062A\u0648\u0642\u0641" : "\u064A\u0639\u0645\u0644"} \u0639\u0646\u062F ${clockText(p.currentTime)}${p.duration ? ` \u0645\u0646 ${clockText(p.duration)}` : ""}`;
  }
  async function perform(intent, host, context) {
    const state = context.state;
    switch (intent.kind) {
      case "power": {
        if (intent.on) {
          await tv.wake(host);
          return { ok: true, did: "\u0623\u0631\u0633\u0644\u062A\u064F \u0625\u0634\u0627\u0631\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644", verified: false };
        }
        await tv.powerOff(host);
        return { ok: true, did: "\u0623\u064F\u0637\u0641\u0626 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", verified: false };
      }
      case "sleep":
        return { ok: false, error: "\u0627\u0636\u0628\u0637 \u0645\u0624\u0642\u062A \u0627\u0644\u0625\u0637\u0641\u0627\u0621 \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646\u061B \u0644\u0627 \u064A\u0636\u0645\u0646 \u0627\u0644\u062C\u0648\u0627\u0644 \u062A\u0634\u063A\u064A\u0644 \u0645\u0624\u0642\u062A\u0647 \u0628\u0639\u062F \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u062A\u0637\u0628\u064A\u0642." };
      case "volume":
        return volume(intent, host);
      case "player": {
        if (!state?.player && !state?.video) return { ok: false, error: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0641\u064A\u062F\u064A\u0648 \u064A\u0639\u0645\u0644 \u0627\u0644\u0622\u0646 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" };
        const command = { op: intent.op };
        if (intent.op === "seek-by" || intent.op === "seek-to") command.seconds = intent.seconds;
        if (intent.op === "subtitles") command.enabled = intent.enabled;
        if (intent.op === "subtitle-delay") command.deltaMs = intent.deltaMs;
        let result = await playerCommand(host, state, command);
        if (!result.ok && result.noHook) return legacyPlayer(intent, host, state);
        if (!result.ok) return result;
        let verdict = verifyPlayer(intent, result);
        if (!verdict.verified && (intent.op === "pause" || intent.op === "play")) {
          await wait(900);
          result = await playerCommand(host, result.after || state, command);
          if (result.ok) verdict = verifyPlayer(intent, result);
        }
        return verdict;
      }
      case "episode":
        return episode(intent, host, state);
      case "info":
        return info(intent, state);
      case "page":
        return page(intent, host, state);
      case "search":
        return search(intent, host, state);
      case "settings":
        await tv.openSettings(intent.page, host);
        return { ok: true, did: intent.label, verified: false };
      case "input":
        await tv.switchInput(intent.id, host);
        return { ok: true, did: `\u062A\u062D\u0648\u064A\u0644 \u0625\u0644\u0649 ${intent.id.replace("_", " ")}`, verified: false };
      case "launch":
        await tv.launch(intent.id, host);
        return { ok: true, did: `\u0641\u064F\u062A\u062D ${intent.label}`, verified: false };
      case "button": {
        for (let press = 0; press < (intent.times || 1); press += 1) {
          await tv.press(intent.name, host);
          if (press + 1 < (intent.times || 1)) await wait(140);
        }
        return { ok: true, did: intent.label, verified: false };
      }
      case "recommend":
        return recommend(intent, host, state);
      case "title":
        return title(intent, host, state, context);
      default:
        return { ok: false, error: "\u0623\u0645\u0631 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641" };
    }
  }
  async function volume(intent, host) {
    let status = null;
    const read = async () => {
      const answer = await tv.ssap(host, "ssap://audio/getVolume", {});
      const level = Number(answer?.volumeStatus?.volume ?? answer?.volume);
      const rawMuted = answer?.volumeStatus?.muteStatus ?? answer?.volumeStatus?.muted ?? answer?.volumeStatus?.mute ?? answer?.muted ?? answer?.mute;
      if (typeof rawMuted !== "boolean") return null;
      const muted = rawMuted;
      return Number.isFinite(level) ? { level, muted } : null;
    };
    try {
      status = await read();
    } catch {
      status = null;
    }
    if (!status) {
      if (intent.op === "unmute") return { ok: false, error: "\u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0627 \u064A\u0639\u064A\u062F \u062D\u0627\u0644\u0629 \u0627\u0644\u0643\u062A\u0645\u061B \u0627\u0633\u062A\u062E\u062F\u0645 \u0632\u0631 \u0627\u0644\u0643\u062A\u0645 \u0648\u0631\u0627\u0642\u0628 \u0627\u0644\u0634\u0627\u0634\u0629.", verified: false };
      if (intent.op === "mute") {
        await tv.press("MUTE", host);
        return { ok: true, did: intent.label, verified: false };
      }
      const steps = intent.op === "set" ? 0 : Math.min(30, intent.amount || 5);
      for (let step = 0; step < steps; step += 1) {
        await tv.press(intent.op === "up" ? "VOLUMEUP" : "VOLUMEDOWN", host);
        await wait(90);
      }
      return { ok: steps > 0, did: steps ? intent.label : "", error: steps ? "" : "\u0647\u0630\u0627 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0627 \u064A\u062E\u0628\u0631 \u0628\u0645\u0633\u062A\u0648\u0649 \u0635\u0648\u062A\u0647", verified: false };
    }
    if (intent.op === "mute" || intent.op === "unmute") {
      await tv.ssap(host, "ssap://audio/setMute", { mute: intent.op === "mute" });
    } else {
      const target = intent.op === "set" ? intent.level : Math.max(0, Math.min(100, status.level + (intent.op === "up" ? 1 : -1) * (intent.amount || 5)));
      if (status.muted && intent.op !== "down") await tv.ssap(host, "ssap://audio/setMute", { mute: false }).catch(() => void 0);
      await tv.ssap(host, "ssap://audio/setVolume", { volume: target });
    }
    await wait(350);
    const after = await read().catch(() => null);
    if (!after) return { ok: true, did: intent.label, verified: false };
    if (intent.op === "mute" || intent.op === "unmute") {
      const good = after.muted === (intent.op === "mute");
      return { ok: good, did: after.muted ? "\u0627\u0644\u0635\u0648\u062A \u0645\u0643\u062A\u0648\u0645" : `\u0627\u0644\u0635\u0648\u062A ${after.level}`, verified: good, error: good ? "" : "\u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0644\u0645 \u064A\u063A\u064A\u0651\u0631 \u0627\u0644\u0643\u062A\u0645" };
    }
    return { ok: true, did: `\u0627\u0644\u0635\u0648\u062A ${after.level}${intent.op === "set" ? "" : ` (\u0643\u0627\u0646 ${status.level})`}`, verified: after.level !== status.level || intent.op === "set" };
  }
  function verifyPlayer(intent, result) {
    const before = result.before?.player;
    const after = result.after?.player;
    if (!after) {
      return { ok: true, did: intent.label, verified: intent.op === "next" || intent.op === "previous" ? `${result.after?.path || ""}${result.after?.search || ""}` !== `${result.before?.path || ""}${result.before?.search || ""}` : false };
    }
    switch (intent.op) {
      case "seek-by": {
        const expected = (before?.currentTime || 0) + intent.seconds;
        const good = Math.abs(after.currentTime - Math.max(0, expected)) < 25;
        return { ok: true, did: `\u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0639\u0646\u062F ${clockText(after.currentTime)}`, verified: good };
      }
      case "seek-to":
      case "restart": {
        const target = intent.op === "restart" ? 0 : intent.seconds;
        return { ok: true, did: `\u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0639\u0646\u062F ${clockText(after.currentTime)}`, verified: Math.abs(after.currentTime - target) < 25 };
      }
      case "pause":
        return { ok: true, did: describePlayer(result.after), verified: after.paused === true };
      case "play":
        return { ok: true, did: describePlayer(result.after), verified: after.paused === false };
      case "subtitles":
        return { ok: true, did: after.subtitles ? "\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0638\u0627\u0647\u0631\u0629" : "\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0645\u062E\u0641\u064A\u0629", verified: after.subtitles === intent.enabled };
      case "subtitle-delay":
      case "subtitle-reset":
        return { ok: true, did: `\u062A\u0648\u0642\u064A\u062A \u0627\u0644\u062A\u0631\u062C\u0645\u0629 ${after.subtitleOffsetMs > 0 ? "+" : ""}${(after.subtitleOffsetMs / 1e3).toFixed(1)} \u062B`, verified: true };
      case "next":
      case "previous":
        return { ok: true, did: result.note?.note ? `${intent.label}: ${result.note.note}` : intent.label, verified: true };
      default:
        return { ok: true, did: intent.label, verified: Boolean(result.note?.ok) };
    }
  }
  async function legacyPlayer(intent, host, state) {
    if (intent.op === "pause" || intent.op === "play" || intent.op === "toggle") {
      await tv.press(intent.op === "pause" ? "PAUSE" : "PLAY", host);
      return { ok: true, did: intent.label, verified: false };
    }
    if (intent.op === "seek-by" || intent.op === "seek-to" || intent.op === "restart") {
      const target = intent.op === "seek-by" ? (state?.video?.t || 0) + intent.seconds : intent.op === "restart" ? 0 : intent.seconds;
      await tv.evaluate(`(function(){ var v = document.querySelector("video"); if (v) v.currentTime = Math.max(0, ${Number(target) || 0}); return "ok"; })()`, host);
      return { ok: true, did: `\u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0639\u0646\u062F ${clockText(target)}`, verified: false };
    }
    if (intent.op === "next" || intent.op === "previous") {
      await tv.press(intent.op === "next" ? "CHANNELUP" : "CHANNELDOWN", host);
      return { ok: true, did: intent.label, verified: false };
    }
    return { ok: false, error: "\u0647\u0630\u0627 \u0627\u0644\u0623\u0645\u0631 \u064A\u062D\u062A\u0627\u062C \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" };
  }
  function seriesOnScreen(state) {
    if (!state) return null;
    const query = new URLSearchParams(state.search || "");
    const sWatch = /^\/tv\/(\d+)(?:\/watch)?/.exec(state.path || "");
    if (sWatch) return { app: "s", id: sWatch[1], season: Number(query.get("s")) || state.player?.season || 1, episode: Number(query.get("e")) || state.player?.episode || 1 };
    const detail = /^tv-(\d+)$/.exec(query.get("flixDetail") || "");
    if (detail) return { app: "s", id: detail[1], season: 1, episode: 0 };
    if ((state.path || "").startsWith("/faselhd")) {
      const id = query.get("id") || query.get("title");
      if (id) return { app: "f", id, season: Number(query.get("season")) || state.player?.season || 1, episode: Number(query.get("episode")) || state.player?.episode || 1 };
    }
    return null;
  }
  async function episode(intent, host, state) {
    if ((intent.op === "next" || intent.op === "previous") && state?.watching) {
      const result = await playerCommand(host, state, { op: intent.op });
      if (result.ok) return verifyPlayer({ ...intent, kind: "player" }, result);
      if (result.noHook) return legacyPlayer({ ...intent, op: intent.op }, host, state);
      return result;
    }
    const series = seriesOnScreen(state);
    if (!series) return { ok: false, error: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0633\u0644\u0633\u0644 \u0645\u0641\u062A\u0648\u062D \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u2014 \u0642\u0644 \u0627\u0633\u0645\u0647 \u0645\u0639 \u0627\u0644\u062D\u0644\u0642\u0629" };
    let season = intent.season ?? series.season;
    let number = intent.episode ?? (intent.season !== null && intent.season !== void 0 ? 1 : series.episode);
    if (intent.op === "next") number = (series.episode || 0) + 1;
    if (intent.op === "previous") number = Math.max(1, (series.episode || 1) - 1);
    if (intent.op === "next-season") {
      season = series.season + 1;
      number = 1;
    }
    if (intent.op === "previous-season") {
      season = Math.max(1, series.season - 1);
      number = 1;
    }
    const target = series.app === "f" ? `/faselhd/watch?id=${encodeURIComponent(series.id)}&season=${season}&episode=${number}` : `/tv/${series.id}/watch?s=${season}&e=${number}`;
    const opened = await tv.openInApp({ host, path: target, appId: APP_IDS[series.app], wantsPlay: true });
    if (!opened?.ok) return { ok: false, error: opened?.message || opened?.error || "\u062A\u0639\u0630\u0651\u0631 \u0641\u062A\u062D \u0627\u0644\u062D\u0644\u0642\u0629" };
    const fragment = series.app === "f" ? `episode=${number}` : `e=${number}`;
    return { ok: true, did: `\u0627\u0644\u0645\u0648\u0633\u0645 ${season} \u0627\u0644\u062D\u0644\u0642\u0629 ${number}`, verified: await arrived(host, fragment) };
  }
  function info(intent, state) {
    if (intent.what === "clock") {
      return { ok: true, did: `\u0627\u0644\u0633\u0627\u0639\u0629 ${(/* @__PURE__ */ new Date()).toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" })}`, verified: true, speak: true };
    }
    const p = state?.player;
    if (!p) return { ok: false, error: state ? "\u0644\u0627 \u064A\u0648\u062C\u062F \u0641\u064A\u062F\u064A\u0648 \u064A\u0639\u0645\u0644 \u0627\u0644\u0622\u0646" : "\u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u063A\u064A\u0631 \u0645\u0641\u062A\u0648\u062D \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" };
    if (intent.what === "left") {
      const left = Math.max(0, (p.duration || 0) - (p.currentTime || 0));
      return { ok: Boolean(p.duration), did: p.duration ? `\u0628\u0627\u0642\u064A ${spokenDuration(left)}` : "\u0627\u0644\u0645\u062F\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629 \u0628\u0639\u062F", verified: true, speak: true };
    }
    const episodeLine = p.season && p.episode ? ` \u2014 \u0627\u0644\u0645\u0648\u0633\u0645 ${p.season} \u0627\u0644\u062D\u0644\u0642\u0629 ${p.episode}` : "";
    return { ok: true, did: `${p.title || "\u0641\u064A\u062F\u064A\u0648"}${episodeLine} \xB7 ${clockText(p.currentTime)}`, verified: true, speak: true };
  }
  async function page(intent, host, state) {
    const app = intent.app || state?.app || "s";
    if (intent.page === "detail") {
      const href = state?.player?.detailHref || (() => {
        const series = seriesOnScreen(state);
        if (series?.app === "s") return `/tv/${series.id}`;
        if (series?.app === "f") return `/faselhd?title=${encodeURIComponent(series.id)}`;
        const film = /^\/movie\/(\d+)/.exec(state?.path || "");
        return film ? `/movie/${film[1]}` : "";
      })();
      if (!href) return { ok: false, error: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0639\u0646\u0648\u0627\u0646 \u0645\u0641\u062A\u0648\u062D \u0644\u0623\u0641\u062A\u062D \u0635\u0641\u062D\u062A\u0647" };
      const opened2 = await tv.openInApp({ host, path: href, appId: APP_IDS[app], wantsPlay: false });
      if (!opened2?.ok) return { ok: false, error: opened2?.message || "\u062A\u0639\u0630\u0651\u0631 \u0641\u062A\u062D \u0627\u0644\u0635\u0641\u062D\u0629" };
      const page2 = href.split("?")[0].replace(/\/watch$/, "");
      return { ok: true, did: "\u0635\u0641\u062D\u0629 \u0627\u0644\u0639\u0646\u0648\u0627\u0646", verified: await arrived(host, href.startsWith("/faselhd") ? href.split("?")[1] || href : fragmentsFor(page2)) };
    }
    const home = app === "f" ? "/faselhd" : "/";
    const opened = await tv.openInApp({ host, path: home, appId: APP_IDS[app], wantsPlay: false });
    if (!opened?.ok) return { ok: false, error: opened?.message || "\u062A\u0639\u0630\u0651\u0631 \u0641\u062A\u062D \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" };
    const until = Date.now() + 15e3;
    while (Date.now() < until) {
      await wait(700);
      const now = await screen(host);
      if (now && (app === "f" ? now.path === "/faselhd" : now.path === "/")) return { ok: true, did: app === "f" ? "\u0631\u0626\u064A\u0633\u064A\u0629 \u0641\u0644\u0643\u0633 \u0627\u0641" : "\u0631\u0626\u064A\u0633\u064A\u0629 \u0641\u0644\u0643\u0633 \u0627\u0633", verified: true };
    }
    return { ok: true, did: "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", verified: false };
  }
  async function search(intent, host, state) {
    const app = intent.app || state?.app || "s";
    if (!state || state.watching || intent.app && intent.app !== state.app) {
      await tv.openInApp({ host, path: app === "f" ? "/faselhd" : "/", appId: APP_IDS[app], wantsPlay: false });
      await wait(2500);
    }
    if (!intent.query) {
      await tv.evaluate(`(function(){ window.dispatchEvent(new CustomEvent("flix:open-search", { detail: { source: "voice" } })); return "ok"; })()`, host);
      return { ok: true, did: "\u0641\u064F\u062A\u062D \u0627\u0644\u0628\u062D\u062B", verified: false };
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const typed = await tv.setSearchText(intent.query, host);
      if (typed === "page") return { ok: true, did: `\u064A\u0628\u062D\u062B \u0639\u0646 \xAB${intent.query}\xBB`, verified: true };
      await wait(900);
    }
    return { ok: false, error: "\u0644\u0645 \u0623\u062C\u062F \u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0628\u062D\u062B \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629" };
  }
  async function recommend(intent, host, state) {
    const parameters = new URLSearchParams({ page: "1", pageSize: "12", mode: "trending", mediaType: intent.mediaType || "movie" });
    if (intent.genre) parameters.set("genres", String(intent.genre));
    const payload = await houseJson(`/api/catalog/browse?${parameters.toString()}`).catch(() => null);
    const items = (payload?.items || []).filter((item) => item && item.id);
    if (!items.length) return { ok: false, error: "\u0644\u0645 \u0623\u062C\u062F \u0627\u0642\u062A\u0631\u0627\u062D\u064B\u0627 \u0627\u0644\u0622\u0646" };
    const pick = items[Math.floor(Math.random() * Math.min(5, items.length))];
    const entry = { id: pick.id, media: pick.media_type === "tv" ? "tv" : "movie", title: pick.title || pick.name || "" };
    const target = titlePath("s", entry, { play: intent.play });
    const opened = await tv.openInApp({ host, path: target, appId: APP_IDS.s, wantsPlay: intent.play });
    if (!opened?.ok) return { ok: false, error: opened?.message || "\u062A\u0639\u0630\u0651\u0631 \u0641\u062A\u062D \u0627\u0644\u0627\u0642\u062A\u0631\u0627\u062D" };
    return {
      ok: true,
      did: `${intent.play ? "\u064A\u0634\u063A\u0651\u0644" : "\u0627\u0642\u062A\u0631\u0627\u062D\u064A"}: ${entry.title}`,
      verified: await arrived(host, fragmentsFor(`/${entry.media}/${entry.id}`)),
      alternatives: items.filter((item) => item !== pick).slice(0, 4).map((item) => ({ id: item.id, media: item.media_type === "tv" ? "tv" : "movie", title: item.title || item.name || "" })),
      speak: true
    };
  }
  async function title(intent, host, state, context) {
    let resolution = await resolveTitle(intent);
    if ((!resolution.best || !resolution.sure) && !intent.english && context.allowModel) {
      const restated = await askModel(`${intent.query}`, { purpose: "english-title" }).catch(() => null);
      const english = restated?.find((order) => order.kind === "title" && order.english)?.english;
      if (english) {
        const again = await resolveTitle({ ...intent, english });
        if (again.best && (!resolution.best || again.score > resolution.score)) resolution = again;
      }
    }
    const entry = resolution.best;
    if (!entry) return { ok: false, error: `\u0644\u0645 \u0623\u062C\u062F \xAB${intent.query}\xBB` };
    const app = intent.app || (state?.app === "f" ? "f" : "s");
    const play = intent.play && resolution.sure;
    let target;
    let usedApp = app;
    if (app === "f") {
      const fasel = await resolveFasel(entry, intent);
      if (fasel) target = titlePath("f", entry, { play, season: intent.season, episode: intent.episode, faselId: fasel.id });
      else usedApp = "s";
    }
    if (!target) target = titlePath("s", entry, { play, season: intent.season, episode: intent.episode });
    const opened = await tv.openInApp({ host, path: target, appId: APP_IDS[usedApp], wantsPlay: play });
    if (!opened?.ok) return { ok: false, error: opened?.message || opened?.error || "\u062A\u0639\u0630\u0651\u0631 \u0641\u062A\u062D \u0627\u0644\u0639\u0646\u0648\u0627\u0646" };
    const fragment = usedApp === "f" ? target.split("?")[1]?.split("&")[0] || "" : fragmentsFor(`/${entry.media}/${entry.id}`);
    const verified = opened.did === "launching" ? false : await arrived(host, fragment);
    const episodeLine = intent.season || intent.episode ? ` \u2014 \u0627\u0644\u0645\u0648\u0633\u0645 ${intent.season || 1} \u0627\u0644\u062D\u0644\u0642\u0629 ${intent.episode || 1}` : "";
    return {
      ok: true,
      did: `${play ? "\u064A\u0634\u063A\u0651\u0644" : "\u0641\u062A\u062D"}: ${entry.title}${entry.year ? ` (${entry.year})` : ""}${episodeLine}${usedApp !== app ? " \u2014 \u0645\u0646 \u0641\u0644\u0643\u0633 \u0627\u0633 (\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0641\u0644\u0643\u0633 \u0627\u0641)" : ""}${intent.play && !play ? " \u2014 \u062A\u0623\u0643\u0651\u062F \u0623\u0646\u0647 \u0627\u0644\u0645\u0642\u0635\u0648\u062F \u062B\u0645 \u0627\u0636\u063A\u0637 \u062A\u0634\u063A\u064A\u0644" : ""}`,
      verified,
      alternatives: resolution.alternatives.map((alt) => ({ id: alt.id, media: alt.media, title: alt.title, year: alt.year }))
    };
  }
  const modelEndpoint = async () => "";
  const askModel = async () => null;
  async function run(said, host) {
    const startedAt = Date.now();
    const text = String(said || "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!text) return { ok: false, heard: "", error: "\u0644\u0645 \u064A\u0635\u0644\u0646\u064A \u0643\u0644\u0627\u0645" };
    let intents = parseUtterance(text);
    let via = "rules";
    if (!intents.length || intents.every((intent) => intent.bare) && await modelEndpoint()) {
      const state = await screen(host);
      const restated = await askModel(text, state ? { app: state.app, page: state.path, watching: state.watching, title: state.player?.title || "" } : null).catch(() => null);
      if (restated?.length) {
        intents = restated;
        via = "model";
      } else if (Array.isArray(restated) && intents.every((intent) => intent.bare)) {
        intents = [];
        via = "model";
      }
    }
    if (!intents.length) {
      return { ok: false, heard: text, error: await modelEndpoint() ? "\u0644\u0645 \u0623\u0641\u0647\u0645 \u0627\u0644\u0623\u0645\u0631" : "\u0644\u0645 \u0623\u0641\u0647\u0645 \u0627\u0644\u0623\u0645\u0631 \u2014 \u062C\u0631\u0651\u0628: \xAB\u0634\u063A\u0651\u0644 \u0628\u0631\u064A\u0643\u0646\u0642 \u0628\u0627\u062F \u0627\u0644\u0645\u0648\u0633\u0645 \u0662 \u0627\u0644\u062D\u0644\u0642\u0629 \u0663\xBB \u0623\u0648 \xAB\u0642\u062F\u0651\u0645 \u0661\u0660 \u062F\u0642\u0627\u0626\u0642\xBB", via };
    }
    const orders = [];
    for (const intent of intents) {
      const began = Date.now();
      const state = await screen(host);
      let outcome;
      try {
        outcome = await perform(intent, host, { state, allowModel: via === "rules" });
      } catch (error) {
        outcome = { ok: false, error: String(error?.message || error).slice(0, 140) };
      }
      orders.push({ understood: intent.label, kind: intent.kind, ...outcome, ms: Date.now() - began });
      options.log?.({ host, action: `voice: ${intent.label}`, ok: outcome.ok !== false, ms: Date.now() - began, error: outcome.error || "" });
      if (outcome.ok === false) break;
    }
    const failed = orders.find((order) => order.ok === false);
    return {
      ok: !failed,
      heard: text,
      via,
      orders,
      did: orders.map((order) => order.did || order.understood).filter(Boolean).join(" \xB7 "),
      error: failed?.error || "",
      ms: Date.now() - startedAt
    };
  }
  return { run, screen, resolveTitle, askModel, modelEndpoint };
}
