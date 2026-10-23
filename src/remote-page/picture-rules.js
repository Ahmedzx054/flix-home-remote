import { runLunaThroughAlert } from "./webos-settings.ts";
const SETTINGS_URI = "com.webos.settingsservice/setSystemSettings";
export const PICTURE_KEYS = [
  "pictureMode",
  "oledLight",
  "backlight",
  "brightness",
  "contrast",
  "color",
  "sharpness",
  "energySaving",
  "eyeComfortMode",
  "motionEyeCare",
  "peakBrightness",
  "dynamicContrast"
];
export const SOUND_KEYS = ["soundMode", "autoVolume"];
export const LUMINANCE_FLOOR = 10;
export const BLACK_LEVEL_NEUTRAL = 50;
export const BLACK_LEVEL_CRUSHED_BELOW = 45;
export function luminanceKeys(settings) {
  const keys = [];
  for (const key of ["oledLight", "backlight"]) {
    if (settings && settings[key] !== void 0 && settings[key] !== null && settings[key] !== "") keys.push(key);
  }
  return keys;
}
export function luminanceOf(settings) {
  const key = luminanceKeys(settings)[0];
  if (!key) return null;
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : null;
}
export function clampLuminance(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  return Math.max(LUMINANCE_FLOOR, Math.min(100, number));
}
export function blackLevelCrushed(settings) {
  const value = Number(settings?.brightness);
  return Number.isFinite(value) && value < BLACK_LEVEL_CRUSHED_BELOW;
}
export function modeFamily(pictureMode) {
  const mode = String(pictureMode || "");
  if (/^dolbyHdr/i.test(mode)) return "dolby";
  if (/^hlg/i.test(mode)) return "hlg";
  if (/^hdr/i.test(mode)) return "hdr";
  return "sdr";
}
const MODE_NAMES = {
  sdr: { vivid: "vivid", standard: "normal", cinema: "cinema", filmMaker: "filmMaker", eco: "eco", game: "game", expert: "expert2" },
  hdr: { vivid: "hdrVivid", standard: "hdrStandard", cinema: "hdrCinema", filmMaker: "hdrFilmMaker", bright: "hdrCinemaBright", game: "hdrGame" },
  dolby: { vivid: "dolbyHdrVivid", standard: "dolbyHdrStandard", cinema: "dolbyHdrCinema", filmMaker: "dolbyHdrFilmMaker", bright: "dolbyHdrCinemaBright", game: "dolbyHdrGame" },
  hlg: { vivid: "hlgVivid", standard: "hlgStandard", cinema: "hlgCinema", game: "hlgGame" }
};
export const MODE_LABELS = {
  cinema: "\u0633\u064A\u0646\u0645\u0627",
  filmMaker: "\u0635\u0627\u0646\u0639 \u0627\u0644\u0623\u0641\u0644\u0627\u0645",
  standard: "\u0642\u064A\u0627\u0633\u064A",
  vivid: "\u062D\u064A\u0648\u064A",
  bright: "\u0633\u064A\u0646\u0645\u0627 \u0633\u0627\u0637\u0639",
  eco: "\u0627\u0642\u062A\u0635\u0627\u062F\u064A",
  game: "\u0623\u0644\u0639\u0627\u0628",
  expert: "\u062E\u0628\u064A\u0631 (\u063A\u0631\u0641\u0629 \u0645\u0638\u0644\u0645\u0629)"
};
export function modesFor(pictureMode) {
  const names = MODE_NAMES[modeFamily(pictureMode)];
  const order = ["cinema", "filmMaker", "bright", "standard", "vivid", "expert", "eco", "game"];
  return order.filter((id) => names[id]).map((id) => ({ id, value: names[id], label: MODE_LABELS[id], on: names[id] === pictureMode }));
}
export function modeValue(id, pictureMode) {
  return MODE_NAMES[modeFamily(pictureMode)][id] || null;
}
export function presetSettings(preset, current = {}) {
  const lights = luminanceKeys(current);
  const light = (value) => Object.fromEntries((lights.length ? lights : ["backlight"]).map((key) => [key, String(value)]));
  const black = blackLevelCrushed(current) ? { brightness: String(BLACK_LEVEL_NEUTRAL) } : {};
  if (preset === "night") return nightSettings(current, nightTargets(current));
  if (preset === "day") return { ...light(80), contrast: "85", ...DAY_PROCESSING, energySaving: "off", ...black };
  if (preset === "best") {
    const mode = modeValue("cinema", current.pictureMode);
    return { ...mode ? { pictureMode: mode } : {}, ...DAY_PROCESSING, energySaving: "off", ...black };
  }
  return null;
}
export const NIGHT_LIGHT = 25;
export const NIGHT_CONTRAST = 75;
const NIGHT_PROCESSING = { eyeComfortMode: "on", peakBrightness: "off", dynamicContrast: "off", hdrDynamicToneMapping: "off", gamma: "low", motionEyeCare: "on" };
const DAY_PROCESSING = { eyeComfortMode: "off", hdrDynamicToneMapping: "on", gamma: "medium", motionEyeCare: "off" };
export function nightTargets(current = {}) {
  const light = luminanceOf(current);
  const contrast = Number(current.contrast);
  return {
    light: clampLuminance(light === null ? NIGHT_LIGHT : Math.min(light, NIGHT_LIGHT)),
    contrast: Number.isFinite(contrast) ? Math.min(Math.round(contrast), NIGHT_CONTRAST) : NIGHT_CONTRAST
  };
}
export function nightSettings(current = {}, targets = nightTargets(current)) {
  const lights = luminanceKeys(current);
  const black = blackLevelCrushed(current) ? { brightness: String(BLACK_LEVEL_NEUTRAL) } : {};
  return {
    ...Object.fromEntries((lights.length ? lights : ["backlight"]).map((key) => [key, String(targets.light)])),
    contrast: String(targets.contrast),
    ...NIGHT_PROCESSING,
    energySaving: "off",
    ...black
  };
}
export function nightDeparted(current = {}, targets = {}) {
  const light = luminanceOf(current);
  const contrast = Number(current.contrast);
  return light !== null && Number.isFinite(targets.light) && light > targets.light + 2 || Number.isFinite(contrast) && Number.isFinite(targets.contrast) && contrast > targets.contrast + 2;
}
export function luminanceSettings(value, current = {}) {
  const level = clampLuminance(value);
  if (level === null) return null;
  const keys = luminanceKeys(current);
  const out = Object.fromEntries((keys.length ? keys : ["backlight"]).map((key) => [key, String(level)]));
  if (current.energySaving && current.energySaving !== "off") out.energySaving = "off";
  return out;
}
export const SOUND_MODES = [
  { value: "aiSoundPlus", label: "\u0630\u0643\u064A" },
  { value: "standard", label: "\u0642\u064A\u0627\u0633\u064A" },
  { value: "movie", label: "\u0633\u064A\u0646\u0645\u0627" },
  { value: "news", label: "\u062D\u0648\u0627\u0631 \u0648\u0627\u0636\u062D" },
  { value: "music", label: "\u0645\u0648\u0633\u064A\u0642\u0649" },
  { value: "sports", label: "\u0631\u064A\u0627\u0636\u0629" },
  { value: "game", label: "\u0623\u0644\u0639\u0627\u0628" }
];
export function clampVolume(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}
export function describePicture(settings = {}) {
  return {
    pictureMode: String(settings.pictureMode || ""),
    family: modeFamily(settings.pictureMode),
    luminance: luminanceOf(settings),
    luminanceKeys: luminanceKeys(settings),
    blackLevel: Number.isFinite(Number(settings.brightness)) ? Number(settings.brightness) : null,
    blackCrushed: blackLevelCrushed(settings),
    contrast: Number.isFinite(Number(settings.contrast)) ? Number(settings.contrast) : null,
    eyeComfort: String(settings.eyeComfortMode || "") === "on",
    energySaving: String(settings.energySaving || ""),
    modes: modesFor(settings.pictureMode),
    floor: LUMINANCE_FLOOR
  };
}
export async function readCategory(call, socket, category, keys) {
  const ask = async (list) => {
    const answer = await call(socket, "ssap://settings/getSystemSettings", { category, keys: list });
    return answer?.settings && typeof answer.settings === "object" ? answer.settings : {};
  };
  try {
    const all = await ask(keys);
    if (Object.keys(all).length) return all;
  } catch (error) {
    if (/401|insufficient permission/i.test(String(error?.message || error))) throw error;
  }
  const one = await Promise.allSettled(keys.map((key) => ask([key])));
  return Object.assign({}, ...one.map((result) => result.status === "fulfilled" ? result.value : {}));
}
export async function writeCategory(call, socket, category, settings) {
  await runLunaThroughAlert(call, socket, SETTINGS_URI, { category, settings });
}
export function settingsKeyFor(all, host, { hosts = [], uids = [] } = {}) {
  const book = all && typeof all === "object" ? all : {};
  if (host && book[host]) return String(book[host]);
  for (const other of hosts) if (other && book[other]) return String(book[other]);
  for (const uid of uids) if (uid && book[`uid:${uid}`]) return String(book[`uid:${uid}`]);
  return "";
}
export function withSettingsKey(all, key, host, { hosts = [], uids = [] } = {}) {
  const book = { ...all && typeof all === "object" ? all : {} };
  for (const other of /* @__PURE__ */ new Set([host, ...hosts])) if (other) book[other] = key;
  for (const uid of uids) if (uid) book[`uid:${uid}`] = key;
  return book;
}
export const DIGITAL_SOUND_KEY = "soundOutputDigital";
export const DIGITAL_SOUND_SAFE = "pcm";
export function digitalSoundNeedsPcm(output, value) {
  const current = String(value ?? "").trim();
  if (!current) return false;
  if (/^external_(?:arc|earc|optical)|^(?:arc|earc|optical)/i.test(String(output || ""))) return false;
  return current.toLowerCase() !== DIGITAL_SOUND_SAFE;
}
export function digitalSoundRearm() {
  return [{ [DIGITAL_SOUND_KEY]: "passThrough" }, { [DIGITAL_SOUND_KEY]: DIGITAL_SOUND_SAFE }];
}
export function soundModeRestart(current) {
  const mode = String(current || "").trim();
  if (!mode) return [];
  return [{ soundMode: mode === "standard" ? "movie" : "standard" }, { soundMode: mode }];
}
