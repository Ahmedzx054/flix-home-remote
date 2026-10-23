export function fold(value) {
  return String(value || "").toLowerCase().replace(/[ً-ٰٟۖ-ۭـ]/g, "").replace(/[آأإٱ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ئ/g, "\u064A").replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).replace(/[​-‏‪-‮⁦-⁩]/g, "").replace(/(\d)[:٫.](\d)/g, "$1:$2").replace(/[\s;,!?؟،؛"'«»()[\]{}\-–—_/\\|·•&+]+/g, " ").replace(/(^|\s):|:(\s|$)/g, " ").replace(/\s+/g, " ").trim();
}
const ARABIC = /[؀-ۿ]/;
const LATIN = /[a-z]/;
export function skeleton(value) {
  let text = fold(value);
  if (!text) return "";
  const out = [];
  const push = (klass) => {
    if (klass && out[out.length - 1] !== klass) out.push(klass);
  };
  for (let word of text.split(" ")) {
    if (!word) continue;
    if (ARABIC.test(word)) {
      if (["\u0630\u0627", "\u0630\u064A", "\u062F\u0627", "\u0630"].includes(word)) continue;
      if (word.startsWith("\u0627\u0644") && word.length > 3) word = word.slice(2);
      for (let index = 0; index < word.length; index += 1) {
        const letter = word[index];
        const initial = index === 0;
        const final = index === word.length - 1;
        switch (letter) {
          case "\u0628":
            push("B");
            break;
          case "\u0641":
          case "\u06A4":
            push("F");
            break;
          case "\u062A":
          case "\u062F":
          case "\u0637":
          case "\u0636":
          case "\u0630":
          case "\u0638":
          case "\u062B":
            push("T");
            break;
          case "\u0633":
          case "\u0635":
          case "\u0632":
          case "\u0634":
            push("S");
            break;
          case "\u0643":
          case "\u0642":
          case "\u062C":
          case "\u063A":
          case "\u062E":
          case "\u06AF":
            push("K");
            break;
          case "\u0644":
            push("L");
            break;
          case "\u0645":
            push("M");
            break;
          case "\u0646":
            push("N");
            break;
          case "\u0631":
            push("R");
            break;
          case "\u062D":
            push("H");
            break;
          case "\u0647":
            if (!final) push("H");
            break;
          case "\u0648":
            if (initial) push("W");
            break;
          case "\u064A":
            if (initial) push("Y");
            break;
          default:
            break;
        }
      }
      continue;
    }
    if (!LATIN.test(word)) {
      for (const digit of word) if (/\d/.test(digit)) push(digit);
      continue;
    }
    if (word === "the" || word === "a" || word === "an") continue;
    for (let index = 0; index < word.length; index += 1) {
      const letter = word[index];
      const next = word[index + 1] || "";
      const initial = index === 0;
      if ((letter === "s" || letter === "c") && next === "h") {
        push("S");
        index += 1;
        continue;
      }
      if (letter === "t" && next === "h") {
        push("T");
        index += 1;
        continue;
      }
      if (letter === "p" && next === "h") {
        push("F");
        index += 1;
        continue;
      }
      if ((letter === "k" || letter === "g") && next === "h") {
        push("K");
        index += 1;
        continue;
      }
      if (letter === "c" && next === "k") {
        push("K");
        index += 1;
        continue;
      }
      switch (letter) {
        case "b":
        case "p":
          push("B");
          break;
        case "f":
        case "v":
          push("F");
          break;
        case "t":
        case "d":
          push("T");
          break;
        case "s":
        case "z":
          push("S");
          break;
        case "c":
          push(/[eiy]/.test(next) ? "S" : "K");
          break;
        case "k":
        case "q":
        case "g":
        case "j":
          push("K");
          break;
        case "x":
          push("K");
          push("S");
          break;
        case "l":
          push("L");
          break;
        case "m":
          push("M");
          break;
        case "n":
          push("N");
          break;
        case "r":
          push("R");
          break;
        case "h":
          if (initial) push("H");
          break;
        case "w":
          if (initial) push("W");
          break;
        case "y":
          if (initial) push("Y");
          break;
        default:
          if (/\d/.test(letter)) push(letter);
          break;
      }
    }
  }
  return out.join("");
}
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
const UNIT_WORDS = new Map(Object.entries({
  "\u0648\u0627\u062D\u062F": 1,
  "\u0648\u0627\u062D\u062F\u0647": 1,
  "\u0627\u0648\u0644": 1,
  "\u0627\u0644\u0627\u0648\u0644": 1,
  "\u0627\u0644\u0627\u0648\u0644\u064A": 1,
  "\u0627\u0648\u0644\u064A": 1,
  "\u062D\u0627\u062F\u064A": 1,
  "\u0627\u0644\u062D\u0627\u062F\u064A": 1,
  "\u0627\u0644\u062D\u0627\u062F\u064A\u0647": 1,
  "\u0627\u062B\u0646\u064A\u0646": 2,
  "\u0627\u062B\u0646\u0627\u0646": 2,
  "\u0627\u062B\u0646\u062A\u064A\u0646": 2,
  "\u062B\u0646\u062A\u064A\u0646": 2,
  "\u062B\u0646\u064A\u0646": 2,
  "\u0627\u062A\u0646\u064A\u0646": 2,
  "\u062B\u0627\u0646\u064A": 2,
  "\u0627\u0644\u062B\u0627\u0646\u064A": 2,
  "\u0627\u0644\u062B\u0627\u0646\u064A\u0647": 2,
  "\u0627\u062B\u0646\u064A": 2,
  "\u0627\u062B\u0646\u0627": 2,
  "\u062B\u0644\u0627\u062B": 3,
  "\u062B\u0644\u0627\u062B\u0647": 3,
  "\u062A\u0644\u0627\u062A": 3,
  "\u062A\u0644\u0627\u062A\u0647": 3,
  "\u062B\u0627\u0644\u062B": 3,
  "\u0627\u0644\u062B\u0627\u0644\u062B": 3,
  "\u0627\u0644\u062B\u0627\u0644\u062B\u0647": 3,
  "\u062B\u0627\u0644\u062B\u0647": 3,
  "\u0627\u0631\u0628\u0639": 4,
  "\u0627\u0631\u0628\u0639\u0647": 4,
  "\u0631\u0627\u0628\u0639": 4,
  "\u0627\u0644\u0631\u0627\u0628\u0639": 4,
  "\u0627\u0644\u0631\u0627\u0628\u0639\u0647": 4,
  "\u0631\u0627\u0628\u0639\u0647": 4,
  "\u062E\u0645\u0633": 5,
  "\u062E\u0645\u0633\u0647": 5,
  "\u062E\u0627\u0645\u0633": 5,
  "\u0627\u0644\u062E\u0627\u0645\u0633": 5,
  "\u0627\u0644\u062E\u0627\u0645\u0633\u0647": 5,
  "\u062E\u0627\u0645\u0633\u0647": 5,
  "\u0633\u062A": 6,
  "\u0633\u062A\u0647": 6,
  "\u0633\u0627\u062F\u0633": 6,
  "\u0627\u0644\u0633\u0627\u062F\u0633": 6,
  "\u0627\u0644\u0633\u0627\u062F\u0633\u0647": 6,
  "\u0633\u0627\u062F\u0633\u0647": 6,
  "\u0633\u0628\u0639": 7,
  "\u0633\u0628\u0639\u0647": 7,
  "\u0633\u0627\u0628\u0639": 7,
  "\u0627\u0644\u0633\u0627\u0628\u0639": 7,
  "\u0627\u0644\u0633\u0627\u0628\u0639\u0647": 7,
  "\u0633\u0627\u0628\u0639\u0647": 7,
  "\u062B\u0645\u0627\u0646": 8,
  "\u062B\u0645\u0627\u0646\u064A\u0647": 8,
  "\u062B\u0645\u0627\u0646\u064A": 8,
  "\u062A\u0645\u0646": 8,
  "\u062A\u0645\u0627\u0646\u064A\u0647": 8,
  "\u062B\u0627\u0645\u0646": 8,
  "\u0627\u0644\u062B\u0627\u0645\u0646": 8,
  "\u0627\u0644\u062B\u0627\u0645\u0646\u0647": 8,
  "\u062B\u0627\u0645\u0646\u0647": 8,
  "\u062A\u0633\u0639": 9,
  "\u062A\u0633\u0639\u0647": 9,
  "\u062A\u0627\u0633\u0639": 9,
  "\u0627\u0644\u062A\u0627\u0633\u0639": 9,
  "\u0627\u0644\u062A\u0627\u0633\u0639\u0647": 9,
  "\u062A\u0627\u0633\u0639\u0647": 9,
  "\u0639\u0634\u0631": 10,
  "\u0639\u0634\u0631\u0647": 10,
  "\u0639\u0627\u0634\u0631": 10,
  "\u0627\u0644\u0639\u0627\u0634\u0631": 10,
  "\u0627\u0644\u0639\u0627\u0634\u0631\u0647": 10,
  "\u0639\u0627\u0634\u0631\u0647": 10,
  "one": 1,
  "first": 1,
  "two": 2,
  "second": 2,
  "three": 3,
  "third": 3,
  "four": 4,
  "fourth": 4,
  "five": 5,
  "fifth": 5,
  "six": 6,
  "sixth": 6,
  "seven": 7,
  "seventh": 7,
  "eight": 8,
  "eighth": 8,
  "nine": 9,
  "ninth": 9,
  "ten": 10,
  "tenth": 10
}));
const TEEN_WORDS = new Map(Object.entries({
  "\u062D\u062F\u0639\u0634": 11,
  "\u0627\u062D\u062F\u0639\u0634": 11,
  "\u0627\u0637\u0646\u0639\u0634": 12,
  "\u0627\u062A\u0646\u0639\u0634": 12,
  "\u062B\u0644\u0637\u0639\u0634": 13,
  "\u062A\u0644\u0637\u0639\u0634": 13,
  "\u0627\u0631\u0628\u0639\u0637\u0639\u0634": 14,
  "\u062E\u0645\u0633\u0637\u0639\u0634": 15,
  "\u0633\u0637\u0639\u0634": 16,
  "\u0633\u0628\u0639\u0637\u0639\u0634": 17,
  "\u062B\u0645\u0646\u0637\u0639\u0634": 18,
  "\u062A\u0645\u0646\u0637\u0639\u0634": 18,
  "\u062A\u0633\u0639\u0637\u0639\u0634": 19
}));
const TEN_WORDS = new Map(Object.entries({
  "\u0639\u0634\u0631\u064A\u0646": 20,
  "\u0627\u0644\u0639\u0634\u0631\u064A\u0646": 20,
  "\u062B\u0644\u0627\u062B\u064A\u0646": 30,
  "\u062A\u0644\u0627\u062A\u064A\u0646": 30,
  "\u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0646": 30,
  "\u0627\u0631\u0628\u0639\u064A\u0646": 40,
  "\u0627\u0644\u0627\u0631\u0628\u0639\u064A\u0646": 40,
  "\u062E\u0645\u0633\u064A\u0646": 50,
  "\u0627\u0644\u062E\u0645\u0633\u064A\u0646": 50,
  "\u0633\u062A\u064A\u0646": 60,
  "\u0627\u0644\u0633\u062A\u064A\u0646": 60,
  "\u0633\u0628\u0639\u064A\u0646": 70,
  "\u0627\u0644\u0633\u0628\u0639\u064A\u0646": 70,
  "\u062B\u0645\u0627\u0646\u064A\u0646": 80,
  "\u062A\u0645\u0627\u0646\u064A\u0646": 80,
  "\u0627\u0644\u062B\u0645\u0627\u0646\u064A\u0646": 80,
  "\u062A\u0633\u0639\u064A\u0646": 90,
  "\u0627\u0644\u062A\u0633\u0639\u064A\u0646": 90,
  "twenty": 20,
  "thirty": 30,
  "forty": 40,
  "fifty": 50,
  "sixty": 60
}));
const HUNDRED_WORDS = new Map(Object.entries({ "\u0645\u064A\u0647": 100, "\u0645\u0627\u064A\u0647": 100, "\u0645\u064A\u064A\u0647": 100, "\u0645\u064A\u062A\u064A\u0646": 200, "hundred": 100 }));
export function numberAt(tokens, index) {
  const token = tokens[index];
  if (token === void 0) return null;
  if (/^\d{1,4}$/.test(token)) return { value: Number(token), length: 1 };
  if (TEEN_WORDS.has(token)) return { value: TEEN_WORDS.get(token), length: 1 };
  if (HUNDRED_WORDS.has(token)) return { value: HUNDRED_WORDS.get(token), length: 1 };
  if (TEN_WORDS.has(token)) return { value: TEN_WORDS.get(token), length: 1 };
  if (UNIT_WORDS.has(token)) {
    const unit = UNIT_WORDS.get(token);
    const next = tokens[index + 1] || "";
    if (unit < 10 && (next === "\u0639\u0634\u0631" || next === "\u0639\u0634\u0631\u0647")) return { value: 10 + unit, length: 2 };
    if (unit < 10 && next.startsWith("\u0648") && TEN_WORDS.has(next.slice(1))) return { value: unit + TEN_WORDS.get(next.slice(1)), length: 2 };
    return { value: unit, length: 1 };
  }
  return null;
}
const SECOND_UNITS = /* @__PURE__ */ new Set(["\u062B\u0627\u0646\u064A\u0647", "\u062B\u0648\u0627\u0646\u064A", "\u062B\u0648\u0627\u0646", "\u062B\u0627\u0646\u064A\u0627", "sec", "secs", "second", "seconds", "\u062B"]);
const MINUTE_UNITS = /* @__PURE__ */ new Set(["\u062F\u0642\u064A\u0642\u0647", "\u062F\u0642\u0627\u064A\u0642", "\u062F\u0642\u064A\u0642", "\u062F\u0642\u0627\u0626\u0642", "min", "mins", "minute", "minutes", "\u062F"]);
const HOUR_UNITS = /* @__PURE__ */ new Set(["\u0633\u0627\u0639\u0647", "\u0633\u0627\u0639\u0627\u062A", "hour", "hours"]);
const DUAL_UNITS = new Map(Object.entries({ "\u062B\u0627\u0646\u064A\u062A\u064A\u0646": 2, "\u062F\u0642\u064A\u0642\u062A\u064A\u0646": 120, "\u0633\u0627\u0639\u062A\u064A\u0646": 7200 }));
function unitSeconds(token) {
  if (!token) return 0;
  const bare = token.startsWith("\u0648") && token.length > 2 ? token.slice(1) : token;
  if (SECOND_UNITS.has(bare)) return 1;
  if (MINUTE_UNITS.has(bare)) return 60;
  if (HOUR_UNITS.has(bare)) return 3600;
  return 0;
}
export function durationIn(text) {
  const tokens = fold(text).split(" ").filter(Boolean);
  let total = 0;
  let found = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].startsWith("\u0648") && DUAL_UNITS.has(tokens[index].slice(1)) ? tokens[index].slice(1) : tokens[index];
    if (DUAL_UNITS.has(token)) {
      total += DUAL_UNITS.get(token);
      found = true;
      continue;
    }
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(token);
    if (clock) {
      total += clock[3] ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : Number(clock[1]) * 60 + Number(clock[2]);
      found = true;
      continue;
    }
    if (token === "\u0646\u0635" || token === "\u0646\u0635\u0641" || token === "\u0631\u0628\u0639" || token === "\u062B\u0644\u062B") {
      const unit = unitSeconds(tokens[index + 1]);
      if (unit) {
        total += unit * (token === "\u0631\u0628\u0639" ? 0.25 : token === "\u062B\u0644\u062B" ? 1 / 3 : 0.5);
        found = true;
        index += 1;
        continue;
      }
    }
    const unitHere = unitSeconds(token);
    if (unitHere) {
      const before = index > 0 ? numberAt(tokens, index - 1) : null;
      if (!before || !(tokens[index - 1] && /^\d|^[^\d]/.test(tokens[index - 1]))) {
      }
      let amount = 1;
      if (index > 0) {
        for (let back = 2; back >= 1; back -= 1) {
          const start = index - back;
          if (start < 0) continue;
          const number = numberAt(tokens, start);
          if (number && number.length === back) {
            amount = number.value;
            break;
          }
        }
      }
      const half = tokens[index + 1] === "\u0648\u0646\u0635" || tokens[index + 1] === "\u0648\u0646\u0635\u0641";
      const quarter = tokens[index + 1] === "\u0648\u0631\u0628\u0639";
      total += unitHere * (amount + (half ? 0.5 : quarter ? 0.25 : 0));
      found = true;
      if (half || quarter) index += 1;
      continue;
    }
  }
  if (found) return Math.round(total);
  for (let index = 0; index < tokens.length; index += 1) {
    const number = numberAt(tokens, index);
    if (number) return number.value;
  }
  return null;
}
export function momentIn(text) {
  const tokens = fold(text).split(" ").filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(token);
    if (clock) return clock[3] ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : Number(clock[1]) * 60 + Number(clock[2]);
    const bare = token.replace(/^(?:لل|ال|ل)/, "");
    const unit = unitSeconds(bare);
    if (!unit || bare === token) continue;
    const number = numberAt(tokens, index + 1);
    if (!number) continue;
    let total = unit * number.value;
    const rest = tokens.slice(index + 1 + number.length).join(" ");
    const more = rest ? durationIn(rest) : null;
    if (more && /دقيق|ثاني|ثوان|min|sec/.test(rest)) total += more;
    return total;
  }
  return null;
}
const VERBS = [
  ["play", ["\u0634\u063A\u0644", "\u0634\u063A\u0644\u064A", "\u0634\u063A\u0644\u0644\u064A", "\u0634\u063A\u0644\u0647\u0627", "\u0634\u063A\u0644\u0647", "\u0634\u063A\u0644\u0647\u0645", "\u062A\u0634\u063A\u0644", "\u062A\u0634\u063A\u0644\u064A", "\u062A\u0634\u063A\u064A\u0644", "\u0634\u063A\u0644\u0648", "\u062D\u0637", "\u062D\u0637\u0644\u064A", "\u062D\u0637\u0647\u0627", "\u062D\u0637\u0647", "\u062A\u062D\u0637", "\u0627\u0634\u0648\u0641", "\u0646\u0634\u0648\u0641", "\u0627\u062A\u0641\u0631\u062C", "\u0646\u062A\u0641\u0631\u062C", "\u062A\u0627\u0628\u0639", "\u0627\u062A\u0627\u0628\u0639", "\u0646\u062A\u0627\u0628\u0639", "\u0643\u0645\u0644", "\u0643\u0645\u0644\u064A", "\u062A\u0643\u0645\u0644", "\u0627\u0643\u0645\u0644", "play", "watch", "resume"]],
  ["open", ["\u0627\u0641\u062A\u062D", "\u0627\u0641\u062A\u062D\u0644\u064A", "\u0627\u0641\u062A\u062D\u0647\u0627", "\u0627\u0641\u062A\u062D\u0647", "\u062A\u0641\u062A\u062D", "\u0641\u062A\u062D", "\u0648\u0631\u064A\u0646\u064A", "\u0648\u0631\u0646\u064A", "\u0627\u0639\u0631\u0636", "\u0627\u0639\u0631\u0636\u0644\u064A", "open", "show"]],
  ["go", ["\u0648\u062F\u0646\u064A", "\u0648\u062F\u064A\u0646\u064A", "\u0648\u062F\u064A\u0646\u0627", "\u062E\u0630\u0646\u064A", "\u0631\u0648\u062D", "\u0631\u0648\u062D\u064A", "\u0631\u062D", "\u0627\u0646\u062A\u0642\u0644", "\u0627\u0642\u0641\u0632", "\u0646\u0637", "\u0627\u0630\u0647\u0628", "go", "goto", "jump"]],
  ["search", ["\u0627\u0628\u062D\u062B", "\u0627\u0628\u062D\u062B\u0644\u064A", "\u062F\u0648\u0631", "\u062F\u0648\u0631\u0644\u064A", "\u062F\u0648\u0631\u064A", "\u062A\u0628\u062D\u062B", "\u062A\u062F\u0648\u0631", "\u0628\u062D\u062B", "search", "find"]],
  // «عدّ / عدّي / سكّب» = skip (2026-09-24): the smaller model read «عدّ هالمشهد» as a REWIND — the direction of a
  // seek is never left to the model when a word says it.
  ["forward", ["\u0642\u062F\u0645", "\u0642\u062F\u0645\u0644\u064A", "\u0642\u062F\u0645\u0647", "\u0642\u062F\u0645\u0647\u0627", "\u062A\u0642\u062F\u0645", "\u062A\u0642\u062F\u064A\u0645", "\u0641\u0648\u062A", "\u0627\u0633\u0628\u0642", "\u0633\u0631\u0639", "\u0639\u062F", "\u0639\u062F\u064A", "\u0639\u062F\u0647", "\u0639\u062F\u0647\u0627", "\u0639\u062F\u0649", "\u062A\u0639\u062F\u0649", "\u0633\u0643\u0628", "\u0633\u0643\u064A\u0628", "\u0627\u0633\u0643\u0628", "forward", "skip", "ff"]],
  ["rewind", ["\u0631\u062C\u0639", "\u0631\u062C\u0639\u0644\u064A", "\u0631\u062C\u0639\u0647", "\u0631\u062C\u0639\u0647\u0627", "\u062A\u0631\u062C\u0639", "\u062A\u0631\u062C\u064A\u0639", "\u0627\u062E\u0631", "\u0627\u062E\u0631\u0644\u064A", "\u062A\u0627\u062E\u064A\u0631", "\u062A\u0627\u062E\u0631", "rewind"]],
  ["pause", ["\u0648\u0642\u0641", "\u0648\u0642\u0641\u0647", "\u0648\u0642\u0641\u0647\u0627", "\u0648\u0642\u0641\u0644\u064A", "\u062A\u0648\u0642\u0641", "\u0627\u0648\u0642\u0641", "\u0627\u064A\u0642\u0627\u0641", "\u0627\u0633\u062A\u0648\u0628", "pause", "stop"]],
  ["raise", ["\u0627\u0631\u0641\u0639", "\u0627\u0631\u0641\u0639\u0644\u064A", "\u0627\u0631\u0641\u0639\u0647", "\u0639\u0644\u064A", "\u0639\u0644\u0644\u064A", "\u0639\u0644\u0647", "\u0632\u0648\u062F", "\u0632\u0648\u062F\u0647", "\u0632\u064A\u062F", "\u0643\u0628\u0631", "\u0643\u0628\u0631\u0647", "\u062A\u0631\u0641\u0639", "\u0631\u0641\u0639"]],
  ["lower", ["\u0646\u0632\u0644", "\u0646\u0632\u0644\u0644\u064A", "\u0646\u0632\u0644\u0647", "\u062E\u0641\u0636", "\u062E\u0641\u0641", "\u062E\u0641\u0641\u0647", "\u0642\u0644\u0644", "\u0648\u0637\u064A", "\u0648\u0637\u0647", "\u0635\u063A\u0631", "\u062A\u0646\u0632\u0644", "\u0647\u062F\u064A"]],
  ["set", ["\u062E\u0644", "\u062E\u0644\u064A", "\u062E\u0644\u0647", "\u0627\u0636\u0628\u0637", "\u0638\u0628\u0637", "\u0639\u062F\u0644"]],
  ["mute", ["\u0627\u0643\u062A\u0645", "\u0643\u062A\u0645", "\u0627\u0633\u0643\u062A", "\u0627\u0633\u0643\u062A\u0647", "\u0627\u0633\u0643\u062A\u0647\u0627", "\u0633\u0643\u062A\u0647", "mute"]],
  ["off", ["\u0627\u0637\u0641\u064A", "\u0627\u0637\u0641\u0626", "\u0637\u0641\u064A", "\u0633\u0643\u0631", "\u0642\u0641\u0644", "\u0627\u0642\u0641\u0644", "\u0634\u064A\u0644", "\u0627\u062E\u0641\u064A", "\u0627\u0644\u063A\u064A", "\u0628\u0637\u0644"]],
  ["on", ["\u0634\u063A\u0644", "\u0637\u0644\u0639", "\u0627\u0638\u0647\u0631", "\u0638\u0647\u0631", "\u0641\u0639\u0644", "\u0631\u062C\u0639"]]
];
const VERB_OF = /* @__PURE__ */ new Map();
for (const [verb, shapes] of VERBS) for (const shape of shapes) if (!VERB_OF.has(shape)) VERB_OF.set(shape, verb);
const WANT_WORDS = /* @__PURE__ */ new Set(["\u0627\u0628\u064A", "\u0627\u0628\u063A\u064A", "\u0627\u0628\u063A\u0627", "\u0627\u0628\u063A\u0649", "\u0628\u063A\u064A\u062A", "\u0648\u062F\u064A", "\u0628\u062F\u064A", "\u0627\u0631\u064A\u062F", "\u0646\u0628\u064A", "\u0646\u0628\u063A\u064A", "\u0627\u0628\u064A\u0643", "\u0627\u0628\u063A\u0627\u0643", "\u0645\u0645\u0643\u0646", "\u062A\u0642\u062F\u0631", "want", "i"]);
const POLITE_WORDS = /* @__PURE__ */ new Set(["\u0644\u0648", "\u0633\u0645\u062D\u062A", "\u0633\u0645\u062D\u062A\u064A", "\u0627\u0644\u0644\u0647", "\u064A\u062E\u0644\u064A\u0643", "\u064A\u0639\u0627\u0641\u064A\u0643", "\u064A\u0639\u0637\u064A\u0643", "\u0627\u0644\u0639\u0627\u0641\u064A\u0647", "\u064A\u0627", "please", "hey", "ok", "\u0637\u064A\u0628", "\u0628\u0644\u064A\u0632", "\u0628\u0633\u0631\u0639\u0647", "\u0627\u0644\u062D\u064A\u0646", "\u0647\u0644\u0627", "\u0644\u064A", "\u0644\u0646\u0627", "\u0627\u0646\u062A", "\u0627\u0646\u062A\u0627"]);
const CONNECTORS = /* @__PURE__ */ new Set(["\u0645\u0646", "\u0641\u064A", "\u0641", "\u0639\u0644\u0649", "\u0639\u0644\u064A", "\u0639\u0646", "\u0644", "\u0627\u0644\u0649", "\u0627\u0644\u064A", "\u062D\u0642", "\u062A\u0628\u0639", "\u0645\u0627\u0644", "\u062D\u0642\u062A", "\u062D\u0642\u0647", "\u0627\u0644\u0644\u064A", "\u0627\u0644\u064A", "of", "from", "on", "in", "the"]);
const MEDIA_WORDS = new Map(Object.entries({
  "\u0641\u0644\u0645": "movie",
  "\u0641\u064A\u0644\u0645": "movie",
  "\u0627\u0644\u0641\u0644\u0645": "movie",
  "\u0627\u0644\u0641\u064A\u0644\u0645": "movie",
  "movie": "movie",
  "film": "movie",
  "\u0627\u0641\u0644\u0627\u0645": "movie",
  "\u0645\u0633\u0644\u0633\u0644": "tv",
  "\u0627\u0644\u0645\u0633\u0644\u0633\u0644": "tv",
  "series": "tv",
  "show": "tv",
  "\u0645\u0633\u0644\u0633\u0644\u0627\u062A": "tv",
  "\u0627\u0646\u0645\u064A": "tv",
  "\u0627\u0644\u0627\u0646\u0645\u064A": "tv",
  "\u0628\u0631\u0646\u0627\u0645\u062C": "tv",
  "\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062C": "tv"
}));
const APPS = [
  { key: "s", words: ["\u0641\u0644\u0643\u0633 \u0627\u0633", "\u0641\u0644\u0643\u0633 \u0633", "flix s", "\u0641\u0644\u064A\u0643\u0633 \u0627\u0633", "\u0641\u0644\u0643\u0633 \u0625\u0633"], id: "com.netflixfree.s.cloud", label: "\u0641\u0644\u0643\u0633 \u0627\u0633" },
  { key: "f", words: ["\u0641\u0644\u0643\u0633 \u0627\u0641", "\u0641\u0644\u0643\u0633 \u0641", "flix f", "\u0641\u0644\u064A\u0643\u0633 \u0627\u0641", "\u0641\u0627\u0635\u0644", "\u0641\u0627\u0635\u0644 \u0627\u0639\u0644\u0627\u0646\u064A"], id: "com.netflixfree.f.cloud", label: "\u0641\u0644\u0643\u0633 \u0627\u0641" },
  { key: "iptv", words: ["\u0627\u064A \u0628\u064A \u062A\u064A \u0641\u064A", "\u0627\u0644\u0642\u0646\u0648\u0627\u062A", "iptv", "\u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631", "\u0642\u0646\u0648\u0627\u062A"], id: "com.netflixfree.tv.cloud", label: "\u0641\u0644\u0643\u0633 \u0622\u064A \u0628\u064A \u062A\u064A \u0641\u064A" },
  { key: "netflix", words: ["\u0646\u062A\u0641\u0644\u0643\u0633", "\u0646\u062A\u0641\u0644\u064A\u0643\u0633", "netflix"], id: "netflix", label: "\u0646\u062A\u0641\u0644\u0643\u0633" },
  { key: "shahid", words: ["\u0634\u0627\u0647\u062F", "shahid"], id: "net.mbc.shahid-lgapp", label: "\u0634\u0627\u0647\u062F" },
  { key: "youtube", words: ["\u064A\u0648\u062A\u064A\u0648\u0628", "\u0627\u0644\u064A\u0648\u062A\u064A\u0648\u0628", "youtube"], id: "youtube.leanback.v4", label: "\u064A\u0648\u062A\u064A\u0648\u0628" }
];
const GENRES = [
  { words: ["\u0627\u0643\u0634\u0646", "\u0627\u0644\u0627\u0643\u0634\u0646", "action", "\u062D\u0631\u0643\u0647", "\u0627\u0643\u0634\u064A\u0646"], movie: 28, tv: 10759, label: "\u0623\u0643\u0634\u0646" },
  { words: ["\u0631\u0639\u0628", "\u0627\u0644\u0631\u0639\u0628", "horror", "\u0645\u0631\u0639\u0628", "\u0645\u062E\u064A\u0641"], movie: 27, tv: 9648, label: "\u0631\u0639\u0628" },
  { words: ["\u0643\u0648\u0645\u064A\u062F\u064A", "\u0643\u0648\u0645\u064A\u062F\u064A\u0627", "\u0627\u0644\u0643\u0648\u0645\u064A\u062F\u064A", "comedy", "\u0645\u0636\u062D\u0643", "\u0636\u062D\u0643"], movie: 35, tv: 35, label: "\u0643\u0648\u0645\u064A\u062F\u064A" },
  { words: ["\u062F\u0631\u0627\u0645\u0627", "\u0627\u0644\u062F\u0631\u0627\u0645\u0627", "drama", "\u062F\u0631\u0627\u0645\u064A"], movie: 18, tv: 18, label: "\u062F\u0631\u0627\u0645\u0627" },
  { words: ["\u062C\u0631\u064A\u0645\u0647", "\u0627\u0644\u062C\u0631\u064A\u0645\u0647", "crime", "\u0628\u0648\u0644\u064A\u0633\u064A"], movie: 80, tv: 80, label: "\u062C\u0631\u064A\u0645\u0629" },
  { words: ["\u062E\u064A\u0627\u0644 \u0639\u0644\u0645\u064A", "\u0627\u0644\u062E\u064A\u0627\u0644 \u0627\u0644\u0639\u0644\u0645\u064A", "sci fi", "scifi", "\u0639\u0644\u0645\u064A"], movie: 878, tv: 10765, label: "\u062E\u064A\u0627\u0644 \u0639\u0644\u0645\u064A" },
  { words: ["\u0631\u0648\u0645\u0627\u0646\u0633\u064A", "\u0631\u0648\u0645\u0627\u0646\u0633\u064A\u0647", "romance", "\u062D\u0628"], movie: 10749, tv: 18, label: "\u0631\u0648\u0645\u0627\u0646\u0633\u064A" },
  { words: ["\u0643\u0631\u062A\u0648\u0646", "\u0627\u0646\u064A\u0645\u064A\u0634\u0646", "\u0631\u0633\u0648\u0645 \u0645\u062A\u062D\u0631\u0643\u0647", "animation", "\u0627\u0646\u0645\u064A"], movie: 16, tv: 16, label: "\u0623\u0646\u064A\u0645\u064A\u0634\u0646" },
  { words: ["\u0648\u062B\u0627\u0626\u0642\u064A", "\u0648\u062B\u0627\u0642\u064A", "documentary", "\u0648\u062B\u0627\u064A\u0642\u064A"], movie: 99, tv: 99, label: "\u0648\u062B\u0627\u0626\u0642\u064A" },
  { words: ["\u0627\u062B\u0627\u0631\u0647", "\u062A\u0634\u0648\u064A\u0642", "thriller", "\u0627\u062B\u0627\u0631\u0629"], movie: 53, tv: 9648, label: "\u0625\u062B\u0627\u0631\u0629" },
  { words: ["\u0645\u063A\u0627\u0645\u0631\u0647", "\u0645\u063A\u0627\u0645\u0631\u0627\u062A", "adventure"], movie: 12, tv: 10759, label: "\u0645\u063A\u0627\u0645\u0631\u0629" },
  { words: ["\u0641\u0627\u0646\u062A\u0627\u0632\u064A\u0627", "\u062E\u064A\u0627\u0644", "fantasy"], movie: 14, tv: 10765, label: "\u0641\u0627\u0646\u062A\u0627\u0632\u064A\u0627" },
  { words: ["\u0639\u0627\u0626\u0644\u064A", "\u0639\u0627\u064A\u0644\u064A", "\u0644\u0644\u0639\u0627\u0626\u0644\u0647", "family", "\u0627\u0637\u0641\u0627\u0644", "\u0644\u0644\u0627\u0637\u0641\u0627\u0644"], movie: 10751, tv: 10751, label: "\u0639\u0627\u0626\u0644\u064A" },
  { words: ["\u062D\u0631\u0628", "\u062D\u0631\u0628\u064A", "war"], movie: 10752, tv: 10768, label: "\u062D\u0631\u0628" },
  { words: ["\u063A\u0645\u0648\u0636", "mystery", "\u063A\u0627\u0645\u0636"], movie: 9648, tv: 9648, label: "\u063A\u0645\u0648\u0636" },
  { words: ["\u062A\u0627\u0631\u064A\u062E\u064A", "\u062A\u0627\u0631\u064A\u062E", "history"], movie: 36, tv: 10768, label: "\u062A\u0627\u0631\u064A\u062E\u064A" }
];
const has = (text, ...phrases) => phrases.some((phrase) => ` ${text} `.includes(` ${fold(phrase)} `));
const hasPrefix = (text, ...stems) => text.split(" ").some((token) => stems.some((stem) => token.startsWith(stem)));
const SPLIT_VERBS = /* @__PURE__ */ new Set(["play", "open", "go", "search", "forward", "rewind", "pause", "raise", "lower", "mute", "set"]);
const isSplitVerb = (token) => SPLIT_VERBS.has(VERB_OF.get(token) || "") || ["\u0631\u062C\u0648\u0639", "\u0627\u0631\u062C\u0639", "\u0641\u0648\u0642", "\u062A\u062D\u062A", "\u064A\u0645\u064A\u0646", "\u064A\u0633\u0627\u0631", "home", "back"].includes(token);
export function splitOrders(text) {
  const tokens = fold(text).split(" ").filter(Boolean);
  const parts = [];
  let current = [];
  for (let index = 0; index < tokens.length; index += 1) {
    let token = tokens[index];
    const glued = token.length > 2 && token.startsWith("\u0648") && !VERB_OF.has(token) && isSplitVerb(token.slice(1));
    const joiner = (token === "\u0648" || token === "\u062B\u0645" || token === "\u0628\u0639\u062F\u064A\u0646" || token === "\u0628\u0639\u062F\u0647\u0627" || token === "\u0648\u0628\u0639\u062F\u0647\u0627" || token === "\u0648\u0628\u0639\u062F\u064A\u0646" || token === "then" || token === "and") && isSplitVerb(tokens[index + 1] || "");
    if (joiner && current.length) {
      parts.push(current.join(" "));
      current = [];
      continue;
    }
    if (glued && current.length) {
      parts.push(current.join(" "));
      current = [];
      token = token.slice(1);
    }
    current.push(token);
  }
  if (current.length) parts.push(current.join(" "));
  return parts;
}
function stripPoliteness(tokens) {
  const out = [...tokens];
  let changed = true;
  while (changed && out.length) {
    changed = false;
    if (POLITE_WORDS.has(out[0]) || WANT_WORDS.has(out[0])) {
      out.shift();
      changed = true;
      continue;
    }
    if (out[0] === "\u0641\u0644\u0643\u0633" && !["\u0627\u0633", "\u0633", "\u0627\u0641", "\u0641"].includes(out[1] || "")) {
      out.shift();
      changed = true;
      continue;
    }
    if (out[0] === "\u0627\u0646" || out[0] === "\u0627\u0646\u0643") {
      out.shift();
      changed = true;
    }
  }
  while (out.length && POLITE_WORDS.has(out[out.length - 1])) out.pop();
  return out;
}
export function seasonEpisodeIn(tokens) {
  let season = null;
  let episode = null;
  const rest = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const compact = /^s(\d{1,2})e(\d{1,3})$/.exec(token);
    if (compact) {
      season = Number(compact[1]);
      episode = Number(compact[2]);
      continue;
    }
    const isSeason = ["\u0627\u0644\u0645\u0648\u0633\u0645", "\u0645\u0648\u0633\u0645", "season", "\u0627\u0644\u062C\u0632\u0621", "\u062C\u0632\u0621", "\u0633\u064A\u0632\u0648\u0646", "\u0627\u0644\u0633\u064A\u0632\u0648\u0646", "\u0644\u0644\u0645\u0648\u0633\u0645", "\u0628\u0627\u0644\u0645\u0648\u0633\u0645", "\u0644\u0645\u0648\u0633\u0645"].includes(token);
    const isEpisode = ["\u0627\u0644\u062D\u0644\u0642\u0647", "\u062D\u0644\u0642\u0647", "episode", "\u062D", "ep", "\u0627\u0644\u062D\u0644\u0642\u0629", "\u0644\u0644\u062D\u0644\u0642\u0647", "\u0628\u0627\u0644\u062D\u0644\u0642\u0647", "\u0644\u062D\u0644\u0642\u0647"].includes(token);
    if (isSeason || isEpisode) {
      const number = numberAt(tokens, index + 1);
      if (number) {
        if (isSeason) season = number.value;
        else episode = number.value;
        index += number.length;
        continue;
      }
    }
    rest.push(token);
  }
  return { season, episode, rest };
}
function appIn(text) {
  const unglued = text.split(" ").map((token) => /^(لل|ل|ب)/.test(token) && token.length > 4 ? token.replace(/^(لل|ل|ب)/, "") : token).join(" ");
  for (const app of APPS) if (app.words.some((word) => has(text, fold(word)) || has(unglued, fold(word)))) return app;
  return null;
}
function withoutPhrases(tokens, phrases) {
  let text = ` ${tokens.join(" ")} `;
  for (const phrase of phrases) text = text.split(` ${fold(phrase)} `).join(" ");
  return text.trim().split(" ").filter(Boolean);
}
function cleanTitle(tokens) {
  const out = tokens.filter((token) => !POLITE_WORDS.has(token) && !WANT_WORDS.has(token));
  while (out.length && (CONNECTORS.has(out[0]) || MEDIA_WORDS.has(out[0]) || ["\u0635\u0641\u062D\u0647", "\u0635\u0641\u062D\u062A", "page"].includes(out[0]))) out.shift();
  while (out.length && (CONNECTORS.has(out[out.length - 1]) || MEDIA_WORDS.has(out[out.length - 1]) || ["\u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0627\u0644\u062A\u0644\u0641\u0627\u0632", "\u0627\u0644\u0634\u0627\u0634\u0647", "\u0627\u0644\u062D\u064A\u0646", "\u0644\u064A"].includes(out[out.length - 1]))) out.pop();
  return out.join(" ").trim();
}
function mediaIn(tokens) {
  for (const token of tokens) if (MEDIA_WORDS.has(token)) return MEDIA_WORDS.get(token);
  return null;
}
function genreIn(text) {
  for (const genre of GENRES) if (genre.words.some((word) => has(text, fold(word)))) return genre;
  return null;
}
const INPUT_NAMES = [["1", "\u0648\u0627\u062D\u062F"], ["2", "\u0627\u062B\u0646\u064A\u0646"], ["3", "\u062B\u0644\u0627\u062B\u0647"], ["4", "\u0627\u0631\u0628\u0639\u0647"]];
export function parseOrder(said) {
  const text = fold(said);
  if (!text) return null;
  const tokens = stripPoliteness(text.replace(/(^| )(جا|جاء|اجا|جاني) دور( |$)/g, "$1").split(" ").filter((token) => token && token !== "\u0627\u0644\u062D\u064A\u0646"));
  if (!tokens.length) return null;
  const body = tokens.join(" ");
  const verbs = tokens.map((token) => VERB_OF.get(token) || "");
  const firstVerb = verbs.find(Boolean) || "";
  const duration = durationIn(body);
  if ((hasPrefix(body, "\u0637\u0641", "\u0627\u0637\u0641", "\u0633\u0643\u0631", "\u0642\u0641\u0644") || has(body, "turn off")) && has(body, "\u0628\u0639\u062F", "after") && duration) {
    return { kind: "sleep", seconds: duration, label: `\u0625\u0637\u0641\u0627\u0621 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0628\u0639\u062F ${spokenDuration(duration)}` };
  }
  if (has(body, "\u0627\u0644\u063A\u064A \u0627\u0644\u0645\u0624\u0642\u062A", "\u0627\u0644\u063A \u0627\u0644\u0645\u0624\u0642\u062A", "\u0644\u0627 \u062A\u0637\u0641\u064A", "cancel timer", "\u0648\u0642\u0641 \u0627\u0644\u0645\u0624\u0642\u062A")) return { kind: "sleep", seconds: 0, label: "\u0625\u0644\u063A\u0627\u0621 \u0645\u0624\u0642\u062A \u0627\u0644\u0625\u0637\u0641\u0627\u0621" };
  if (has(body, "\u0627\u0637\u0641\u064A \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0637\u0641\u064A \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0633\u0643\u0631 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0627\u0642\u0641\u0644 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "turn off", "\u0627\u0637\u0641\u064A \u0627\u0644\u0634\u0627\u0634\u0647", "\u0637\u0641\u064A \u0627\u0644\u0634\u0627\u0634\u0647") || tokens.length === 1 && ["\u0627\u0637\u0641\u064A", "\u0637\u0641\u064A", "\u0627\u0637\u0641\u0626"].includes(tokens[0])) {
    return { kind: "power", on: false, label: "\u0625\u0637\u0641\u0627\u0621 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" };
  }
  if (has(body, "\u0634\u063A\u0644 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0627\u0641\u062A\u062D \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "turn on", "\u0635\u062D\u064A \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0634\u063A\u0644 \u0627\u0644\u0634\u0627\u0634\u0647")) return { kind: "power", on: true, label: "\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" };
  if (has(body, "\u0645\u0627 \u0627\u0633\u0645\u0639", "\u0645\u0627\u0646\u064A \u0633\u0627\u0645\u0639", "\u0645\u0648 \u0633\u0627\u0645\u0639", "\u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0637\u064A", "\u0635\u0648\u062A\u0647 \u0648\u0627\u0637\u064A", "\u0648\u0627\u0637\u064A \u0645\u0631\u0647", "\u0627\u0633\u0645\u0639 \u0627\u0643\u062B\u0631", "\u0627\u0628\u064A \u0627\u0633\u0645\u0639", "\u0645\u0648 \u0648\u0627\u0636\u062D \u0627\u0644\u0635\u0648\u062A") && !has(body, "\u0627\u0644\u062A\u0631\u062C\u0645\u0647")) return { kind: "volume", op: "up", amount: 5, label: "\u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u062A 5" };
  if (verbs.includes("mute") && has(body, "\u0634\u0648\u064A", "\u0634\u0648\u064A\u0647", "\u0634\u0648\u064A\u0629", "\u0628\u0633\u064A\u0637", "a bit")) return { kind: "volume", op: "down", amount: 3, label: "\u062E\u0641\u0636 \u0627\u0644\u0635\u0648\u062A 3" };
  if (has(body, "\u0627\u0644\u0635\u0648\u062A \u0639\u0627\u0644\u064A", "\u0639\u0627\u0644\u064A \u0645\u0631\u0647", "\u0645\u0632\u0639\u062C", "\u0627\u0632\u0639\u062C\u0646\u064A", "\u0627\u0632\u0639\u0627\u062C") && !has(body, "\u0627\u0644\u062A\u0631\u062C\u0645\u0647")) return { kind: "volume", op: "down", amount: 5, label: "\u062E\u0641\u0636 \u0627\u0644\u0635\u0648\u062A 5" };
  const aboutSound = has(body, "\u0627\u0644\u0635\u0648\u062A", "\u0635\u0648\u062A", "volume", "\u0627\u0644\u0635\u0648\u0637");
  if (has(body, "\u0641\u0643 \u0627\u0644\u0643\u062A\u0645", "\u0634\u064A\u0644 \u0627\u0644\u0643\u062A\u0645", "\u0627\u0644\u063A\u064A \u0627\u0644\u0643\u062A\u0645", "\u0631\u062C\u0639 \u0627\u0644\u0635\u0648\u062A", "unmute", "\u0631\u062C\u0639\u0644\u064A \u0627\u0644\u0635\u0648\u062A", "\u0637\u0644\u0639 \u0627\u0644\u0635\u0648\u062A")) return { kind: "volume", op: "unmute", label: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0643\u062A\u0645" };
  if (firstVerb === "mute" || aboutSound && has(body, "\u0627\u0643\u062A\u0645", "\u0643\u062A\u0645", "\u0627\u0633\u0643\u062A", "\u0628\u062F\u0648\u0646 \u0635\u0648\u062A", "\u0633\u0643\u0631 \u0627\u0644\u0635\u0648\u062A", "\u0627\u0637\u0641\u064A \u0627\u0644\u0635\u0648\u062A", "\u0637\u0641\u064A \u0627\u0644\u0635\u0648\u062A")) return { kind: "volume", op: "mute", label: "\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A" };
  if (aboutSound) {
    const level = (() => {
      for (let index = 0; index < tokens.length; index += 1) {
        const number = numberAt(tokens, index);
        if (number && !UNIT_WORDS.has(tokens[index]) || number && /^\d/.test(tokens[index])) return number.value;
        if (number && TEN_WORDS.has(tokens[index])) return number.value;
      }
      return null;
    })();
    const little = has(body, "\u0634\u0648\u064A", "\u0634\u0648\u064A\u0629", "\u0634\u0648\u064A\u0647", "\u0642\u0644\u064A\u0644", "\u0628\u0633\u064A\u0637", "a bit", "little");
    const lot = has(body, "\u0643\u062B\u064A\u0631", "\u0645\u0631\u0647", "\u0648\u0627\u062C\u062F", "\u062D\u064A\u0644", "a lot", "\u0628\u0642\u0648\u0647");
    const atLevel = level !== null && /(?:^| )(?:علي|الي) \d/.test(body);
    const setVerb = verbs.includes("set") || tokens.includes("\u062D\u0637") || atLevel;
    const raise = !setVerb && (verbs.some((verb, index) => verb === "raise" && (tokens[index] !== "\u0639\u0644\u064A" || index === 0)) || has(body, "\u0627\u0639\u0644\u064A", "\u0627\u0639\u0644\u0649", "\u0627\u0642\u0648\u064A", "up", "\u0632\u064A\u0627\u062F\u0647"));
    const lower = !setVerb && (verbs.includes("lower") || has(body, "\u0627\u0642\u0644", "\u0627\u0648\u0637\u064A", "down"));
    if (level !== null && setVerb && !raise && !lower) return { kind: "volume", op: "set", level: Math.min(100, level), label: `\u0627\u0644\u0635\u0648\u062A \u0639\u0644\u0649 ${level}` };
    if (raise) {
      const amount = level ?? (little ? 2 : lot ? 10 : 5);
      return { kind: "volume", op: "up", amount, label: `\u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u062A ${amount}` };
    }
    if (lower) {
      const amount = level ?? (little ? 2 : lot ? 10 : 5);
      return { kind: "volume", op: "down", amount, label: `\u062E\u0641\u0636 \u0627\u0644\u0635\u0648\u062A ${amount}` };
    }
    if (level !== null) return { kind: "volume", op: "set", level: Math.min(100, level), label: `\u0627\u0644\u0635\u0648\u062A \u0639\u0644\u0649 ${level}` };
  }
  if (has(body, "\u0627\u0644\u062A\u0631\u062C\u0645\u0647", "\u062A\u0631\u062C\u0645\u0647", "subtitle", "subtitles", "\u0627\u0644\u062A\u0631\u062C\u0645\u0627\u062A", "\u0627\u0644\u0633\u0628\u062A\u0627\u064A\u062A\u0644", "\u0633\u0628\u062A\u0627\u064A\u062A\u0644", "\u0627\u0644\u0643\u0644\u0627\u0645 \u0627\u0644\u0644\u064A \u062A\u062D\u062A", "\u0627\u0644\u0643\u062A\u0627\u0628\u0647 \u0627\u0644\u0644\u064A \u062A\u062D\u062A", "\u0627\u0644\u0643\u0644\u0627\u0645 \u0627\u0644\u0645\u0643\u062A\u0648\u0628", "\u0627\u0644\u0643\u062A\u0627\u0628\u0647")) {
    if (has(body, "\u0645\u062A\u0627\u062E\u0631\u0647", "\u0645\u062A\u0623\u062E\u0631\u0647", "\u0628\u0637\u064A\u0626\u0647", "\u062A\u062A\u0627\u062E\u0631", "late", "\u0628\u0639\u062F \u0627\u0644\u0643\u0644\u0627\u0645", "\u062A\u062C\u064A \u0628\u0639\u062F") || verbs.includes("forward") && !has(body, "\u0627\u0644\u0641\u0644\u0645", "\u0627\u0644\u0641\u064A\u0644\u0645")) {
      const ms = duration ? Math.min(60, duration) * 1e3 : 500;
      return { kind: "player", op: "subtitle-delay", deltaMs: ms, label: `\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u062A\u0631\u062C\u0645\u0629 ${ms / 1e3} \u062B` };
    }
    if (has(body, "\u0645\u0633\u062A\u0639\u062C\u0644\u0647", "\u0645\u062A\u0642\u062F\u0645\u0647", "\u0633\u0627\u0628\u0642\u0647", "\u0642\u0628\u0644 \u0627\u0644\u0643\u0644\u0627\u0645", "early", "\u062A\u0633\u0628\u0642", "\u062A\u0633\u0628\u0642 \u0627\u0644\u0643\u0644\u0627\u0645", "\u062A\u062C\u064A \u0642\u0628\u0644") || verbs.includes("rewind") && !has(body, "\u0631\u062C\u0639 \u0627\u0644\u062A\u0631\u062C\u0645\u0647")) {
      const ms = duration ? Math.min(60, duration) * 1e3 : 500;
      return { kind: "player", op: "subtitle-delay", deltaMs: -ms, label: `\u062A\u0623\u062E\u064A\u0631 \u0627\u0644\u062A\u0631\u062C\u0645\u0629 ${ms / 1e3} \u062B` };
    }
    if (has(body, "\u0627\u0636\u0628\u0637 \u0627\u0644\u062A\u0631\u062C\u0645\u0647", "\u0635\u0641\u0631 \u0627\u0644\u062A\u0631\u062C\u0645\u0647", "\u0631\u062C\u0639 \u062A\u0648\u0642\u064A\u062A \u0627\u0644\u062A\u0631\u062C\u0645\u0647", "reset")) return { kind: "player", op: "subtitle-reset", label: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0648\u0642\u064A\u062A \u0627\u0644\u062A\u0631\u062C\u0645\u0629" };
    if (verbs.includes("off") && !has(body, "\u0631\u062C\u0639 \u0627\u0644\u062A\u0631\u062C\u0645\u0647")) return { kind: "player", op: "subtitles", enabled: false, label: "\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u062A\u0631\u062C\u0645\u0629" };
    if (has(body, "\u0644\u063A\u0647", "\u0627\u0644\u0644\u063A\u0647", "\u0643\u0628\u064A\u0631\u0647", "\u0635\u063A\u064A\u0631\u0647", "\u0635\u063A\u0631\u0647\u0627", "\u0643\u0628\u0631\u0647\u0627", "\u0627\u0644\u062E\u0637", "\u062D\u062C\u0645", "\u0644\u0648\u0646")) return null;
    if (verbs.includes("on") || verbs.includes("play") || tokens.length <= 2) return { kind: "player", op: "subtitles", enabled: true, label: "\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u062A\u0631\u062C\u0645\u0629" };
    return null;
  }
  if (has(body, "\u0645\u0646 \u0627\u0644\u0628\u062F\u0627\u064A\u0647", "\u0645\u0646 \u0627\u0644\u0627\u0648\u0644", "\u0645\u0646 \u0627\u0648\u0644\u0647", "\u0645\u0646 \u0627\u0648\u0644\u0647\u0627", "\u0645\u0646 \u0627\u0644\u0628\u062F\u0627\u064A\u0647", "restart", "\u0645\u0646 \u062C\u062F\u064A\u062F", "\u0639\u064A\u062F \u0627\u0644\u0641\u0644\u0645", "\u0639\u064A\u062F \u0627\u0644\u062D\u0644\u0642\u0647", "\u0627\u0639\u062F \u0627\u0644\u0641\u0644\u0645", "\u0627\u0639\u062F \u0627\u0644\u062D\u0644\u0642\u0647")) {
    return { kind: "player", op: "restart", label: "\u0645\u0646 \u0627\u0644\u0628\u062F\u0627\u064A\u0629" };
  }
  if (has(body, "\u0627\u0644\u0645\u0642\u062F\u0645\u0647", "\u0627\u0644\u0645\u0642\u062F\u0645\u0629", "\u0627\u0644\u0627\u0646\u062A\u0631\u0648", "\u0627\u0646\u062A\u0631\u0648", "intro", "\u0627\u0644\u0634\u0627\u0631\u0647", "\u0627\u0644\u062A\u062A\u0631")) {
    return { kind: "player", op: "seek-by", seconds: 85, label: "\u062A\u062E\u0637\u0651\u064A \u0627\u0644\u0645\u0642\u062F\u0645\u0629" };
  }
  const moment = momentIn(body);
  const aimsAtMoment = moment !== null && !has(body, "\u0643\u0645 \u0627\u0644\u0633\u0627\u0639\u0647", "\u0643\u0645 \u0628\u0627\u0642\u064A") && (firstVerb === "go" || firstVerb === "play" || firstVerb === "open" || has(body, "\u0639\u0646\u062F", "\u0639\u0644\u0649", "\u0639\u0644\u064A") || tokens.length <= 3);
  if (aimsAtMoment && !verbs.includes("forward") && !verbs.includes("rewind")) {
    return { kind: "player", op: "seek-to", seconds: moment, label: `\u0627\u0644\u0627\u0646\u062A\u0642\u0627\u0644 \u0625\u0644\u0649 ${clockText(moment)}` };
  }
  const forward = verbs.includes("forward");
  const backward = verbs.includes("rewind") || tokens[0] === "\u0627\u0631\u062C\u0639" && duration !== null;
  const repeated = has(body, "\u0645\u0631\u0627\u062A", "\u0645\u0631\u0647", "\u0645\u0631\u062A\u064A\u0646", "times", "twice");
  if ((forward || verbs.includes("rewind")) && repeated) {
    const presses = has(body, "\u0645\u0631\u062A\u064A\u0646", "twice") ? 2 : Math.min(20, (tokens.map((token, index) => numberAt(tokens, index)).find(Boolean) || { value: 1 }).value);
    const seconds = presses * 10 * (forward && !verbs.includes("rewind") ? 1 : -1);
    return { kind: "player", op: "seek-by", seconds, label: `${seconds > 0 ? "\u062A\u0642\u062F\u064A\u0645" : "\u062A\u0631\u062C\u064A\u0639"} ${spokenDuration(seconds)}` };
  }
  if ((forward || backward) && !repeated && !has(body, "\u0644\u0644\u0631\u064A\u064A\u0633\u064A\u0647", "\u0627\u0644\u0631\u064A\u064A\u0633\u064A\u0647", "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0647", "\u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0647", "\u0644\u0644\u0635\u0641\u062D\u0647", "home")) {
    if (duration !== null || tokens.length <= 2) {
      const seconds = duration ?? 10;
      if (!has(body, "\u0627\u0644\u062D\u0644\u0642\u0647", "\u062D\u0644\u0642\u0647") || duration !== null) {
        return { kind: "player", op: "seek-by", seconds: forward && !backward ? seconds : -seconds, label: `${forward && !backward ? "\u062A\u0642\u062F\u064A\u0645" : "\u062A\u0631\u062C\u064A\u0639"} ${spokenDuration(seconds)}` };
      }
    }
  }
  const aboutEpisode = has(body, "\u0627\u0644\u062D\u0644\u0642\u0647", "\u062D\u0644\u0642\u0647", "episode", "\u0627\u0644\u0645\u0648\u0633\u0645", "\u0645\u0648\u0633\u0645", "season", "\u0627\u0644\u062D\u0644\u0642\u0629", "\u0644\u0644\u062D\u0644\u0642\u0647", "\u0628\u0627\u0644\u062D\u0644\u0642\u0647", "\u0644\u0644\u0645\u0648\u0633\u0645", "\u0628\u0627\u0644\u0645\u0648\u0633\u0645");
  if (aboutEpisode || has(body, "\u0627\u0644\u062A\u0627\u0644\u064A", "\u0627\u0644\u062A\u0627\u0644\u064A\u0647", "\u0627\u0644\u0644\u064A \u0628\u0639\u062F\u0647\u0627", "next", "\u0627\u0644\u0633\u0627\u0628\u0642\u0647", "\u0627\u0644\u0633\u0627\u0628\u0642", "\u0627\u0644\u0644\u064A \u0642\u0628\u0644\u0647\u0627", "previous")) {
    const nextWords = has(body, "\u0627\u0644\u062C\u0627\u064A\u0647", "\u0627\u0644\u062C\u0627\u064A", "\u0627\u0644\u062A\u0627\u0644\u064A\u0647", "\u0627\u0644\u062A\u0627\u0644\u064A", "\u0627\u0644\u0644\u064A \u0628\u0639\u062F\u0647\u0627", "\u0627\u0644\u064A \u0628\u0639\u062F\u0647\u0627", "\u0628\u0639\u062F\u0647\u0627", "next", "\u0627\u0644\u062C\u062F\u064A\u062F\u0647");
    const previousWords = has(body, "\u0627\u0644\u0633\u0627\u0628\u0642\u0647", "\u0627\u0644\u0633\u0627\u0628\u0642", "\u0627\u0644\u0644\u064A \u0642\u0628\u0644\u0647\u0627", "\u0627\u0644\u064A \u0642\u0628\u0644\u0647\u0627", "\u0642\u0628\u0644\u0647\u0627", "previous", "\u0627\u0644\u0645\u0627\u0636\u064A\u0647", "\u0627\u0644\u0644\u064A \u0641\u0627\u062A\u062A");
    const { season, episode, rest } = seasonEpisodeIn(tokens);
    const residue = cleanTitle(rest.filter((token) => !VERB_OF.has(token) && !["\u0627\u0644\u062C\u0627\u064A\u0647", "\u0627\u0644\u062C\u0627\u064A", "\u0627\u0644\u062A\u0627\u0644\u064A\u0647", "\u0627\u0644\u062A\u0627\u0644\u064A", "\u0627\u0644\u0633\u0627\u0628\u0642\u0647", "\u0627\u0644\u0633\u0627\u0628\u0642", "\u0627\u0644\u0644\u064A", "\u0627\u0644\u064A", "\u0628\u0639\u062F\u0647\u0627", "\u0642\u0628\u0644\u0647\u0627", "\u0628\u0639\u062F", "\u0642\u0628\u0644", "next", "previous", "\u0627\u0644\u0645\u0627\u0636\u064A\u0647", "\u0641\u0627\u062A\u062A", "\u0627\u0644\u062D\u0644\u0642\u0647", "\u062D\u0644\u0642\u0647", "\u0627\u0644\u0645\u0648\u0633\u0645", "\u0645\u0648\u0633\u0645", "episode", "season", "\u0627\u0644\u062C\u062F\u064A\u062F\u0647", "\u0627\u0644\u062C\u062F\u064A\u062F", "\u0647\u0630\u064A", "\u0647\u0630\u0627", "\u0644\u0644\u062D\u0644\u0642\u0647", "\u0628\u0627\u0644\u062D\u0644\u0642\u0647", "\u0644\u0644\u0645\u0648\u0633\u0645", "\u0628\u0627\u0644\u0645\u0648\u0633\u0645"].includes(token)));
    if (!residue) {
      if (has(body, "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062C\u0627\u064A", "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062A\u0627\u0644\u064A", "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062C\u062F\u064A\u062F", "next season")) return { kind: "episode", op: "next-season", label: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062A\u0627\u0644\u064A" };
      if (has(body, "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0633\u0627\u0628\u0642", "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0644\u064A \u0642\u0628\u0644", "previous season")) return { kind: "episode", op: "previous-season", label: "\u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u0633\u0627\u0628\u0642" };
      if (nextWords && episode === null) return { kind: "episode", op: "next", label: "\u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u062A\u0627\u0644\u064A\u0629" };
      if (previousWords && episode === null) return { kind: "episode", op: "previous", label: "\u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629" };
      if (episode !== null || season !== null) {
        return { kind: "episode", op: "goto", season, episode, label: `${season !== null ? `\u0627\u0644\u0645\u0648\u0633\u0645 ${season} ` : ""}${episode !== null ? `\u0627\u0644\u062D\u0644\u0642\u0629 ${episode}` : "\u0623\u0648\u0644 \u062D\u0644\u0642\u0629"}`.trim() };
      }
      if (has(body, "\u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0642\u0627\u064A\u0645\u0647 \u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0642\u0627\u0626\u0645\u0647 \u0627\u0644\u062D\u0644\u0642\u0627\u062A", "episodes")) return { kind: "player", op: "episodes", label: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062D\u0644\u0642\u0627\u062A" };
    }
  }
  if (has(body, "\u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0642\u0627\u064A\u0645\u0647 \u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0642\u0627\u0626\u0645\u0647 \u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0627\u0644\u0645\u0648\u0627\u0633\u0645", "\u0643\u0644 \u0627\u0644\u062D\u0644\u0642\u0627\u062A") && tokens.filter((token) => !VERB_OF.has(token) && !["\u0627\u0644\u062D\u0644\u0642\u0627\u062A", "\u0642\u0627\u064A\u0645\u0647", "\u0642\u0627\u0626\u0645\u0647", "\u0627\u0644\u0645\u0648\u0627\u0633\u0645", "\u0643\u0644", "\u0644\u064A"].includes(token)).length === 0) {
    return { kind: "player", op: "episodes", label: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062D\u0644\u0642\u0627\u062A" };
  }
  if (has(body, "\u0643\u0645 \u0628\u0627\u0642\u064A", "\u0643\u0645 \u0628\u0642\u064A", "\u0643\u0645 \u064A\u0628\u0642\u0649", "\u0645\u062A\u0649 \u064A\u062E\u0644\u0635", "\u0645\u062A\u0649 \u062A\u062E\u0644\u0635", "time left")) return { kind: "info", what: "left", label: "\u0643\u0645 \u0628\u0627\u0642\u064A" };
  if (has(body, "\u0648\u0634 \u0627\u0644\u0644\u064A \u0634\u063A\u0627\u0644", "\u0627\u064A\u0634 \u0627\u0644\u0644\u064A \u0634\u063A\u0627\u0644", "\u0648\u0634 \u0627\u0644\u0634\u063A\u0627\u0644", "\u0627\u064A\u0634 \u0627\u0644\u0634\u063A\u0627\u0644", "\u0648\u0634 \u0627\u0633\u0645", "\u0627\u064A\u0634 \u0627\u0633\u0645", "\u0634\u0646\u0648 \u0627\u0633\u0645", "\u0648\u0634 \u0647\u0630\u0627", "\u0627\u064A\u0634 \u0647\u0630\u0627", "what is playing", "what's playing", "\u0648\u0634 \u0646\u0634\u0648\u0641", "\u0627\u064A\u0634 \u0646\u0634\u0648\u0641")) return { kind: "info", what: "playing", label: "\u0645\u0627 \u0627\u0644\u0630\u064A \u064A\u064F\u0639\u0631\u0636" };
  if (has(body, "\u0643\u0645 \u0627\u0644\u0633\u0627\u0639\u0647", "\u0643\u0645 \u0627\u0644\u0648\u0642\u062A", "what time")) return { kind: "info", what: "clock", label: "\u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u0622\u0646" };
  if (has(body, "\u0647\u0648\u0645 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0631\u064A\u064A\u0633\u064A\u0647 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0631\u0626\u064A\u0633\u064A\u0647 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0634\u0627\u0634\u0647 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646", "\u0642\u0627\u064A\u0645\u0647 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646")) return { kind: "button", name: "HOME", label: "\u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" };
  if (has(body, "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0647", "\u0627\u0644\u0631\u064A\u064A\u0633\u064A\u0647", "\u0631\u0626\u064A\u0633\u064A\u0647", "\u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0647", "\u0644\u0644\u0631\u064A\u064A\u0633\u064A\u0647", "\u0627\u0644\u0647\u0648\u0645", "\u0627\u0644\u0635\u0641\u062D\u0647 \u0627\u0644\u0627\u0648\u0644\u064A", "home", "\u0627\u0644\u0628\u062F\u0627\u064A\u0647") && !has(body, "\u0645\u0646 \u0627\u0644\u0628\u062F\u0627\u064A\u0647")) {
    const app2 = appIn(body);
    return { kind: "page", page: "home", app: app2 && (app2.key === "s" || app2.key === "f") ? app2.key : null, label: "\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629" };
  }
  if (has(body, "\u0635\u0641\u062D\u0647 \u0627\u0644\u0641\u0644\u0645", "\u0635\u0641\u062D\u0647 \u0627\u0644\u0641\u064A\u0644\u0645", "\u0635\u0641\u062D\u0647 \u0627\u0644\u0645\u0633\u0644\u0633\u0644", "\u0635\u0641\u062D\u062A\u0647", "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", "\u062A\u0641\u0627\u0635\u064A\u0644", "\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0641\u0644\u0645", "\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0633\u0644\u0633\u0644", "details") && tokens.length <= 4) {
    return { kind: "page", page: "detail", label: "\u0635\u0641\u062D\u0629 \u0627\u0644\u0639\u0646\u0648\u0627\u0646" };
  }
  if (has(body, "\u0627\u0644\u0628\u062D\u062B", "\u0635\u0641\u062D\u0647 \u0627\u0644\u0628\u062D\u062B", "search") && tokens.length <= 3 && !cleanTitle(tokens.filter((token) => !VERB_OF.has(token) && token !== "\u0627\u0644\u0628\u062D\u062B" && token !== "\u0635\u0641\u062D\u0647"))) {
    return { kind: "search", query: "", label: "\u0641\u062A\u062D \u0627\u0644\u0628\u062D\u062B" };
  }
  if (has(body, "\u0627\u0644\u0627\u0648\u0641\u0631\u0644\u0627\u064A", "\u0627\u0644\u0642\u0627\u064A\u0645\u0647", "\u0627\u0644\u0642\u0627\u0626\u0645\u0647", "\u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A", "overlay", "menu") && tokens.length <= 3) return { kind: "player", op: "overlay", label: "\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0641\u0648\u0642 \u0627\u0644\u0641\u064A\u062F\u064A\u0648" };
  if (has(body, "\u0627\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0635\u0648\u0631\u0647", "\u0627\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0635\u0648\u0631\u0629")) return { kind: "settings", page: "picture", label: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0635\u0648\u0631\u0629" };
  if (has(body, "\u0627\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0635\u0648\u062A")) return { kind: "settings", page: "sound", label: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0635\u0648\u062A" };
  if (has(body, "\u0627\u0644\u0634\u0628\u0643\u0647", "\u0627\u0644\u0648\u0627\u064A \u0641\u0627\u064A", "wifi", "network", "\u0627\u0644\u0627\u0646\u062A\u0631\u0646\u062A")) return { kind: "settings", page: "network", label: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0628\u0643\u0629" };
  if (has(body, "\u0627\u0644\u0627\u0639\u062F\u0627\u062F\u0627\u062A", "\u0627\u0639\u062F\u0627\u062F\u0627\u062A", "settings")) return { kind: "settings", page: "all", label: "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A" };
  for (const [digit, word] of INPUT_NAMES) {
    if (has(body, `hdmi ${digit}`, `hdmi${digit}`, `\u0627\u062A\u0634 \u062F\u064A \u0627\u0645 \u0627\u064A ${digit}`, `\u0627\u062A\u0634 \u062F\u064A ${digit}`, `\u0627\u062A\u0634 \u062F\u064A \u0627\u0645 \u0627\u064A ${word}`, `hdmi ${word}`)) {
      return { kind: "input", id: `HDMI_${digit}`, label: `HDMI ${digit}` };
    }
  }
  const app = appIn(body);
  const seTokens = seasonEpisodeIn(tokens);
  const titleTokens = withoutPhrases(seTokens.rest.filter((token) => !VERB_OF.has(token) || !["play", "open", "go", "search"].includes(VERB_OF.get(token))), app ? app.words : []);
  const titleText = cleanTitle(titleTokens);
  const appOnly = app && titleText && app.words.map(fold).includes(titleText.replace(/^(لل|ل|ب)/, ""));
  if (app && (!titleText || appOnly)) return { kind: "launch", app: app.key, id: app.id, label: app.label };
  const genre = genreIn(body);
  const media = mediaIn(tokens);
  if (genre || has(body, "\u0627\u0642\u062A\u0631\u062D", "\u0627\u0642\u062A\u0631\u0627\u062D", "\u0631\u0634\u062D", "suggest", "recommend", "\u0634\u064A \u062D\u0644\u0648", "\u0634\u064A \u0632\u064A\u0646", "\u0627\u064A \u0634\u064A")) {
    const genreWords = genre ? genre.words.map(fold) : [];
    const leftover = cleanTitle(titleTokens.filter((token) => !genreWords.some((word) => word.split(" ").includes(token)) && !["\u0627\u0642\u062A\u0631\u062D", "\u0627\u0642\u062A\u0631\u0627\u062D", "\u0631\u0634\u062D", "\u0634\u064A", "\u062D\u0644\u0648", "\u0632\u064A\u0646", "\u0627\u064A", "\u062C\u062F\u064A\u062F", "\u062D\u0627\u062C\u0647", "\u0627\u0644\u0644\u064A\u0644\u0647", "\u0627\u0644\u064A\u0648\u0645", "\u0628\u0643\u0631\u0647", "suggest", "recommend", "something", "good", "tonight"].includes(token)));
    if (!leftover) {
      return { kind: "recommend", mediaType: media || "movie", genre: genre ? genre[media === "tv" ? "tv" : "movie"] : null, play: firstVerb === "play", label: `\u0627\u0642\u062A\u0631\u0627\u062D ${media === "tv" ? "\u0645\u0633\u0644\u0633\u0644" : "\u0641\u0644\u0645"}${genre ? ` ${genre.label}` : ""}` };
    }
  }
  if (firstVerb === "search") {
    const query = cleanTitle(titleTokens.filter((token) => VERB_OF.get(token) !== "search"));
    if (query) return { kind: "search", query, app: app ? app.key : null, mediaType: media, label: `\u0628\u062D\u062B: ${query}` };
    return { kind: "search", query: "", label: "\u0641\u062A\u062D \u0627\u0644\u0628\u062D\u062B" };
  }
  if (firstVerb === "play" && has(body, "\u0648\u064A\u0646 \u0648\u0642\u0641\u0646\u0627", "\u0648\u064A\u0646 \u0648\u0642\u0641\u062A", "\u0645\u0646 \u0645\u0643\u0627\u0646\u064A", "\u0645\u0646 \u062D\u064A\u062B \u0648\u0642\u0641\u062A", "\u0645\u0646 \u062D\u064A\u062B \u062A\u0648\u0642\u0641\u062A", "\u0645\u0646 \u0648\u064A\u0646 \u0648\u0642\u0641\u0646\u0627")) return { kind: "player", op: "play", label: "\u062A\u0643\u0645\u0644\u0629" };
  if (firstVerb === "pause" && tokens.length <= 3) return { kind: "player", op: "pause", label: "\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A" };
  if (firstVerb === "play" && (!titleText || ["\u0627\u0644\u0641\u064A\u062F\u064A\u0648", "\u0627\u0644\u0641\u0644\u0645", "\u0627\u0644\u0641\u064A\u0644\u0645", "\u0627\u0644\u062D\u0644\u0642\u0647", "video"].includes(titleText))) {
    return { kind: "player", op: "play", label: "\u062A\u0634\u063A\u064A\u0644" };
  }
  const dpad = dpadIn(tokens, body);
  if (dpad && (!firstVerb || tokens.length <= 3)) return dpad;
  if (titleText && (firstVerb === "play" || firstVerb === "open" || firstVerb === "go" || !firstVerb)) {
    const play = firstVerb === "play" || seTokens.episode !== null;
    const yearToken = titleTokens.find((token) => /^(19|20)\d{2}$/.test(token));
    return {
      kind: "title",
      query: titleText,
      play,
      season: seTokens.season,
      episode: seTokens.episode,
      app: app && (app.key === "s" || app.key === "f") ? app.key : null,
      mediaType: media,
      year: yearToken ? Number(yearToken) : null,
      // No verb at all: most likely a name said on its own («بريكنق باد») — but a model, if there is one,
      // gets the first look, because «الصوت عالي مره ازعجني» is not a film.
      bare: !firstVerb,
      label: `${play ? "\u062A\u0634\u063A\u064A\u0644" : "\u0641\u062A\u062D"}: ${titleText}${seTokens.season ? ` \u0645${seTokens.season}` : ""}${seTokens.episode ? ` \u062D${seTokens.episode}` : ""}`
    };
  }
  if (dpad) return dpad;
  if (firstVerb === "pause") return { kind: "player", op: "pause", label: "\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A" };
  return null;
}
const DPAD_KEYS = [
  [["\u0645\u0648\u0627\u0641\u0642", "\u0627\u0648\u0643\u064A", "\u0627\u062E\u062A\u0631", "\u0627\u062E\u062A\u0627\u0631", "ok", "select", "enter", "\u0627\u062F\u062E\u0644", "\u0627\u0636\u063A\u0637"], "ENTER", "\u0645\u0648\u0627\u0641\u0642"],
  [["\u0641\u0648\u0642", "up", "\u0644\u0641\u0648\u0642"], "UP", "\u0641\u0648\u0642"],
  [["\u062A\u062D\u062A", "down", "\u0644\u062A\u062D\u062A", "\u0627\u0633\u0641\u0644"], "DOWN", "\u062A\u062D\u062A"],
  [["\u064A\u0645\u064A\u0646", "right", "\u0644\u0644\u064A\u0645\u064A\u0646"], "RIGHT", "\u064A\u0645\u064A\u0646"],
  [["\u064A\u0633\u0627\u0631", "\u0634\u0645\u0627\u0644", "left", "\u0644\u0644\u064A\u0633\u0627\u0631", "\u0644\u0644\u0634\u0645\u0627\u0644"], "LEFT", "\u064A\u0633\u0627\u0631"],
  [["\u0627\u0631\u062C\u0639", "\u0631\u062C\u0648\u0639", "back", "\u0648\u0631\u0627", "\u0644\u0648\u0631\u0627"], "BACK", "\u0631\u062C\u0648\u0639"]
];
const DPAD_FILLER = /* @__PURE__ */ new Set(["\u0645\u0631\u0647", "\u0645\u0631\u0627\u062A", "\u0645\u0631\u062A\u064A\u0646", "times", "twice", "\u0631\u0648\u062D", "\u0631\u062D", "\u0627\u0646\u0632\u0644", "\u0627\u0637\u0644\u0639", "\u0643\u0645\u0627\u0646", "\u0632\u064A\u062F", "\u0648\u0627\u062D\u062F", "\u0627\u0644\u0632\u0631"]);
function dpadIn(tokens, body) {
  const key = DPAD_KEYS.find(([words]) => words.some((word) => has(body, word)));
  if (!key) return null;
  const known = new Set(key[0].map(fold));
  const leftover = tokens.filter((token) => !known.has(token) && !DPAD_FILLER.has(token) && !numberAt([token], 0));
  if (leftover.length > 1) return null;
  const times = has(body, "\u0645\u0631\u062A\u064A\u0646", "twice") ? 2 : (() => {
    const index = tokens.findIndex((token) => token === "\u0645\u0631\u0627\u062A" || token === "\u0645\u0631\u0647" || token === "times");
    if (index > 0) {
      const number = numberAt(tokens, index - 1);
      if (number) return Math.min(20, number.value);
    }
    const lone = tokens.map((token, index2) => numberAt(tokens, index2)).find(Boolean);
    return lone ? Math.min(20, lone.value) : 1;
  })();
  const [, name, label] = key;
  return { kind: "button", name, times, label: times > 1 ? `${label} \xD7${times}` : label };
}
export function parseUtterance(said) {
  const orders = [];
  for (const part of splitOrders(said)) {
    const intent = parseOrder(part);
    if (intent) orders.push(intent);
  }
  for (let index = 1; index < orders.length; index += 1) {
    const previous = orders[index - 1];
    const current = orders[index];
    if (previous.kind === "search" && previous.query && current.kind === "player" && current.op === "play") {
      orders.splice(index - 1, 2, { kind: "title", query: previous.query, play: true, season: null, episode: null, app: previous.app || null, mediaType: previous.mediaType || null, year: null, label: `\u062A\u0634\u063A\u064A\u0644: ${previous.query}` });
      index -= 1;
    } else if (previous.kind === "launch" && (previous.app === "s" || previous.app === "f") && (current.kind === "title" || current.kind === "search") && !current.app) {
      orders.splice(index - 1, 2, { ...current, app: previous.app });
      index -= 1;
    }
  }
  return orders;
}
export function spokenDuration(seconds) {
  const total = Math.abs(Math.round(seconds));
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.round(total % 3600 / 60);
    return `${hours === 1 ? "\u0633\u0627\u0639\u0629" : hours === 2 ? "\u0633\u0627\u0639\u062A\u064A\u0646" : `${hours} \u0633\u0627\u0639\u0627\u062A`}${minutes ? ` \u0648${minutes} \u062F\u0642\u064A\u0642\u0629` : ""}`;
  }
  if (total >= 60) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes === 1 ? "\u062F\u0642\u064A\u0642\u0629" : minutes === 2 ? "\u062F\u0642\u064A\u0642\u062A\u064A\u0646" : `${minutes} \u062F\u0642\u0627\u0626\u0642`}${rest ? ` \u0648${rest} \u062B\u0627\u0646\u064A\u0629` : ""}`;
  }
  return `${total} \u062B\u0627\u0646\u064A\u0629`;
}
export function clockText(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const rest = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
export function prepareTitle(entry) {
  const ft = fold(entry.title);
  const fo = fold(entry.original);
  return { ...entry, ft, fo, st: skeleton(entry.title), so: skeleton(entry.original), ct: arabicConsonants(ft) };
}
function arabicConsonants(folded) {
  return ARABIC.test(folded) ? folded.split(" ").map((word) => word.startsWith("\u0627\u0644") && word.length > 3 ? word.slice(2) : word).join("").replace(/[اوي]/g, "") : "";
}
function wordsContain(haystack, needle) {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}
function letterScore(query, field) {
  if (!field) return 0;
  if (field === query) return 1;
  if (field.startsWith(`${query} `) || wordsContain(field, query)) return 0.86 * Math.min(1, (query.length / field.length) ** 0.25);
  if (query.length >= 4 && field.includes(query)) return 0.7 * Math.min(1, (query.length / field.length) ** 0.3);
  const q = new Set(query.split(" ").filter((word) => word.length > 1 || /\d/.test(word)));
  const f = new Set(field.split(" ").filter((word) => word.length > 1 || /\d/.test(word)));
  if (!q.size || !f.size) return 0;
  let shared = 0;
  for (const word of q) if (f.has(word)) shared += 1;
  return shared ? 0.72 * (2 * shared / (q.size + f.size)) : 0;
}
function soundScore(query, field) {
  if (!query || !field || query.length < 3) return 0;
  if (query === field) return 0.9;
  const distance = levenshtein(query, field);
  const similarity = 1 - distance / Math.max(query.length, field.length);
  let score = similarity >= 0.72 ? 0.84 * similarity : 0;
  if (field.startsWith(query) && query.length >= 5) score = Math.max(score, 0.78 * Math.min(1, (query.length / field.length) ** 0.35));
  return score;
}
export function matchTitles(pool, said, { mediaType = null, year = null, limit = 5 } = {}) {
  const query = fold(said);
  if (!query) return [];
  const latinQuery = !ARABIC.test(query);
  const bareQuery = query.split(" ").map((word) => word.startsWith("\u0627\u0644") && word.length > 4 ? word.slice(2) : word).join(" ");
  const sound = skeleton(said);
  const numbers = query.split(" ").filter((word) => /^\d+$/.test(word));
  const results = [];
  const queryConsonants = arabicConsonants(query);
  for (const entry of pool) {
    let score = Math.max(letterScore(query, entry.ft), letterScore(query, entry.fo));
    if (score < 0.9 && queryConsonants.length >= 3 && entry.ct && Math.abs(entry.ct.length - queryConsonants.length) <= 2) {
      const similarity = 1 - levenshtein(queryConsonants, entry.ct) / Math.max(queryConsonants.length, entry.ct.length);
      if (similarity >= 0.8) score = Math.max(score, 0.9 * similarity);
    }
    if (bareQuery !== query) score = Math.max(score, 0.95 * Math.max(letterScore(bareQuery, entry.ft), letterScore(bareQuery, entry.fo)));
    if (score < 0.9 && sound.length >= 2) {
      const fields = [];
      if (entry.fo && (latinQuery ? !ARABIC.test(entry.fo) : !ARABIC.test(entry.fo))) fields.push(entry.so);
      if (entry.ft && !ARABIC.test(entry.ft) && entry.ft !== entry.fo) fields.push(entry.st);
      for (const field of fields) {
        if (!field) continue;
        if (sound.length < 3) {
          if (field === sound && query.includes(" ")) score = Math.max(score, 0.86);
          continue;
        }
        if (Math.abs(field.length - sound.length) > Math.max(4, sound.length * 0.6) && !field.startsWith(sound)) continue;
        score = Math.max(score, soundScore(sound, field));
      }
    }
    if (score < 0.5) continue;
    const popularity = Math.min(1, Math.log10((entry.votes || 0) + 1) / 4.5);
    let final = score + 0.1 * popularity;
    if (mediaType && entry.media && entry.media !== mediaType) final -= 0.25;
    if (mediaType && entry.media === mediaType) final += 0.03;
    if (year && entry.year === year) final += 0.12;
    if (numbers.length) {
      const fieldNumbers = `${entry.ft} ${entry.fo}`.split(" ").filter((word) => /^\d+$/.test(word));
      if (numbers.some((number) => fieldNumbers.includes(number))) final += 0.12;
      else if (fieldNumbers.length) final -= 0.05;
      else final -= 0.08;
    }
    results.push({ entry, score: final, letters: score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
export const INTENT_KINDS = ["power", "sleep", "volume", "player", "episode", "info", "page", "search", "settings", "input", "launch", "recommend", "title", "button"];
const PLAYER_OPS = /* @__PURE__ */ new Set(["seek-by", "seek-to", "play", "pause", "toggle", "restart", "next", "previous", "subtitles", "subtitle-delay", "subtitle-reset", "overlay", "episodes"]);
const BUTTONS = /* @__PURE__ */ new Set(["UP", "DOWN", "LEFT", "RIGHT", "ENTER", "BACK", "HOME", "PLAY", "PAUSE", "VOLUMEUP", "VOLUMEDOWN", "MUTE", "CHANNELUP", "CHANNELDOWN"]);
export function seekDirectionIn(said) {
  const verbs = fold(said).split(" ").map((token) => VERB_OF.get(token) || "");
  const forward = verbs.includes("forward");
  const back = verbs.includes("rewind");
  return forward === back ? 0 : forward ? 1 : -1;
}
export function alignSeekDirection(order, said) {
  if (!order || order.kind !== "player" || order.op !== "seek-by" || !order.seconds) return order;
  const direction = seekDirectionIn(said);
  if (!direction || Math.sign(order.seconds) === direction) return order;
  const seconds = Math.abs(order.seconds) * direction;
  return { ...order, seconds, label: `${direction > 0 ? "\u062A\u0642\u062F\u064A\u0645" : "\u062A\u0631\u062C\u064A\u0639"} ${spokenDuration(Math.abs(seconds))}` };
}
export function validIntent(value) {
  if (!value || typeof value !== "object" || !INTENT_KINDS.includes(value.kind)) return null;
  const int = (input, min, max) => Number.isFinite(Number(input)) && Number(input) >= min && Number(input) <= max ? Math.round(Number(input)) : null;
  const text = (input, max = 120) => typeof input === "string" ? input.replace(/\s+/g, " ").trim().slice(0, max) : "";
  const label = text(value.label, 80);
  switch (value.kind) {
    case "power":
      return typeof value.on === "boolean" ? { kind: "power", on: value.on, label: label || (value.on ? "\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646" : "\u0625\u0637\u0641\u0627\u0621 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646") } : null;
    case "sleep": {
      const seconds = int(value.seconds, 0, 6 * 3600);
      return seconds === null ? null : { kind: "sleep", seconds, label: label || "\u0645\u0624\u0642\u062A \u0627\u0644\u0625\u0637\u0641\u0627\u0621" };
    }
    case "volume": {
      const op = ["up", "down", "set", "mute", "unmute"].includes(value.op) ? value.op : null;
      if (!op) return null;
      if (op === "set") {
        const level = int(value.level, 0, 100);
        return level === null ? null : { kind: "volume", op, level, label: label || `\u0627\u0644\u0635\u0648\u062A \u0639\u0644\u0649 ${level}` };
      }
      if (op === "up" || op === "down") return { kind: "volume", op, amount: int(value.amount, 1, 50) ?? 5, label: label || (op === "up" ? "\u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u062A" : "\u062E\u0641\u0636 \u0627\u0644\u0635\u0648\u062A") };
      return { kind: "volume", op, label: label || (op === "mute" ? "\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A" : "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0643\u062A\u0645") };
    }
    case "player": {
      if (!PLAYER_OPS.has(value.op)) return null;
      const out = { kind: "player", op: value.op, label: label || value.op };
      if (value.op === "seek-by") {
        const seconds = int(value.seconds, -86400, 86400);
        if (seconds === null) return null;
        out.seconds = seconds;
      }
      if (value.op === "seek-to") {
        const seconds = int(value.seconds, 0, 86400);
        if (seconds === null) return null;
        out.seconds = seconds;
      }
      if (value.op === "subtitles") {
        if (typeof value.enabled !== "boolean") return null;
        out.enabled = value.enabled;
      }
      if (value.op === "subtitle-delay") {
        const ms = int(value.deltaMs, -6e4, 6e4);
        if (ms === null) return null;
        out.deltaMs = ms;
      }
      return out;
    }
    case "episode": {
      const op = ["next", "previous", "goto", "next-season", "previous-season"].includes(value.op) ? value.op : null;
      if (!op) return null;
      return { kind: "episode", op, season: int(value.season, 0, 99), episode: int(value.episode, 0, 9999), label: label || "\u0627\u0644\u062D\u0644\u0642\u0629" };
    }
    case "info":
      return ["left", "playing", "clock"].includes(value.what) ? { kind: "info", what: value.what, label: label || "\u0645\u0639\u0644\u0648\u0645\u0629" } : null;
    case "page":
      return ["home", "detail"].includes(value.page) ? { kind: "page", page: value.page, app: value.app === "s" || value.app === "f" ? value.app : null, label: label || "\u0635\u0641\u062D\u0629" } : null;
    case "search":
      return { kind: "search", query: text(value.query), app: value.app === "s" || value.app === "f" ? value.app : null, mediaType: value.mediaType === "movie" || value.mediaType === "tv" ? value.mediaType : null, label: label || "\u0628\u062D\u062B" };
    case "settings":
      return ["picture", "sound", "network", "all"].includes(value.page) ? { kind: "settings", page: value.page, label: label || "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A" } : null;
    case "input":
      return /^HDMI_[1-4]$/.test(String(value.id || "")) ? { kind: "input", id: value.id, label: label || value.id } : null;
    case "launch": {
      const app = APPS.find((entry) => entry.key === value.app);
      return app ? { kind: "launch", app: app.key, id: app.id, label: label || app.label } : null;
    }
    case "recommend":
      return { kind: "recommend", mediaType: value.mediaType === "tv" ? "tv" : "movie", genre: int(value.genre, 1, 2e4), play: value.play === true, label: label || "\u0627\u0642\u062A\u0631\u0627\u062D" };
    case "title": {
      const query = text(value.query);
      if (!query) return null;
      return {
        kind: "title",
        query,
        english: text(value.english),
        play: value.play === true,
        season: int(value.season, 0, 99),
        episode: int(value.episode, 0, 9999),
        app: value.app === "s" || value.app === "f" ? value.app : null,
        mediaType: value.mediaType === "movie" || value.mediaType === "tv" ? value.mediaType : null,
        year: int(value.year, 1900, 2100),
        label: label || `\u0639\u0646\u0648\u0627\u0646: ${query}`
      };
    }
    case "button":
      return BUTTONS.has(value.name) ? { kind: "button", name: value.name, times: int(value.times, 1, 20) ?? 1, label: label || value.name } : null;
    default:
      return null;
  }
}
export const MODEL_INSTRUCTIONS = `You turn what a viewer says to his television (Saudi/Gulf Arabic, sometimes English) into JSON commands for the FLIX TV apps.
Answer ONLY with {"orders":[...]}, one object per command, in the order spoken.
RULES:
- Only these kinds exist. If the request is something else (brightness, weather, calls, anything not listed), answer {"orders":[]}. Never substitute a different action.
- For a film or series, "query" is what he said and "english" is its official English title (e.g. \u062A\u0627\u064A\u062A\u0646\u0643 \u2192 "Titanic", \u0641\u0631\u064A\u0646\u062F\u0632 \u2192 "Friends", \u0635\u0631\u0627\u0639 \u0627\u0644\u0639\u0631\u0648\u0634 \u2192 "Game of Thrones"). If he describes a film instead of naming it, put the real title in both.
- \xAB\u0634\u063A\u0644/\u062D\u0637/\u0627\u0628\u064A \u0627\u0634\u0648\u0641/\u0627\u0628\u064A \u0627\u062A\u0627\u0628\u0639/\u0643\u0645\u0644\xBB = play:true. \xAB\u0627\u0641\u062A\u062D/\u0648\u0631\u064A\u0646\u064A/\u0648\u0634 \u0647\u0648\xBB = play:false.
- A season without an episode means episode 1.
KINDS:
{"kind":"title","query":"\u2026","english":"\u2026","play":true|false,"season":n|null,"episode":n|null,"mediaType":"movie"|"tv"|null,"year":n|null}
{"kind":"search","query":"\u2026"}
{"kind":"player","op":"seek-by","seconds":\xB1n} (+ forward, \u2212 back) \xB7 {"kind":"player","op":"seek-to","seconds":n} \xB7 {"kind":"player","op":"play"|"pause"|"restart"|"overlay"|"episodes"} \xB7 {"kind":"player","op":"subtitles","enabled":bool} \xB7 {"kind":"player","op":"subtitle-delay","deltaMs":\xB1n}
{"kind":"episode","op":"next"|"previous"|"goto"|"next-season"|"previous-season","season":n|null,"episode":n|null}
{"kind":"volume","op":"up"|"down","amount":n} \xB7 {"kind":"volume","op":"set","level":0-100} \xB7 {"kind":"volume","op":"mute"|"unmute"}
{"kind":"page","page":"home"|"detail"} \xB7 {"kind":"recommend","mediaType":"movie"|"tv","genre":TMDB genre id|null,"play":bool}
{"kind":"info","what":"playing"|"left"|"clock"} \xB7 {"kind":"sleep","seconds":n} \xB7 {"kind":"power","on":bool}
{"kind":"launch","app":"s"|"f"|"iptv"|"netflix"|"shahid"|"youtube"} \xB7 {"kind":"settings","page":"picture"|"sound"|"network"|"all"} \xB7 {"kind":"button","name":"UP"|"DOWN"|"LEFT"|"RIGHT"|"ENTER"|"BACK"|"HOME","times":n}
Genres: action 28, comedy 35, horror 27, drama 18, romance 10749, animation 16, documentary 99, crime 80, sci-fi 878, family 10751, thriller 53.
EXAMPLES:
\xAB\u0627\u0644\u0635\u0648\u062A \u0639\u0627\u0644\u064A \u0645\u0631\u0647 \u0627\u0632\u0639\u062C\u0646\u064A\xBB \u2192 {"orders":[{"kind":"volume","op":"down","amount":10}]}
\xAB\u0645\u0627 \u0633\u0645\u0639\u062A \u0648\u0634 \u0642\u0627\u0644 \u0631\u062C\u0639\u0647 \u0634\u0648\u064A\xBB \u2192 {"orders":[{"kind":"player","op":"seek-by","seconds":-10}]}
\xAB\u0641\u0648\u062A \u0647\u0627\u0644\u0645\u0634\u0647\u062F\xBB \u2192 {"orders":[{"kind":"player","op":"seek-by","seconds":30}]}
\xAB\u0637\u0648\u0644 \u0627\u0644\u0645\u0642\u062F\u0645\u0629 \u0630\u064A \u0639\u062F\u0647\u0627\xBB \u2192 {"orders":[{"kind":"player","op":"seek-by","seconds":85}]}
\xAB\u0627\u0628\u064A \u0634\u064A \u064A\u0636\u062D\u0643 \u0627\u0644\u0644\u064A\u0644\u0629\xBB \u2192 {"orders":[{"kind":"recommend","mediaType":"movie","genre":35,"play":false}]}
\xAB\u0639\u0637\u0646\u064A \u0645\u0633\u0644\u0633\u0644 \u0631\u0639\u0628\xBB \u2192 {"orders":[{"kind":"recommend","mediaType":"tv","genre":27,"play":false}]}
\xAB\u0627\u0644\u062D\u064A\u0646 \u062C\u0627 \u062F\u0648\u0631 \u0641\u0631\u064A\u0646\u062F\u0632 \u0627\u0644\u0645\u0648\u0633\u0645 \u0627\u0644\u062B\u0627\u0644\u062B\xBB \u2192 {"orders":[{"kind":"title","query":"\u0641\u0631\u064A\u0646\u062F\u0632","english":"Friends","play":true,"season":3,"episode":1,"mediaType":"tv"}]}
\xAB\u0634\u063A\u0644 \u0644\u064A \u0627\u0644\u0641\u0644\u0645 \u0627\u0644\u0644\u064A \u0641\u064A\u0647 \u0644\u064A\u0648\u0646\u0627\u0631\u062F\u0648 \u062F\u064A \u0643\u0627\u0628\u0631\u064A\u0648 \u0648\u0627\u0644\u0633\u0641\u064A\u0646\u0629 \u0627\u0644\u0644\u064A \u063A\u0631\u0642\u062A\xBB \u2192 {"orders":[{"kind":"title","query":"\u062A\u0627\u064A\u062A\u0646\u0643","english":"Titanic","play":true,"mediaType":"movie","year":1997}]}
\xAB\u0627\u0628\u064A \u0627\u0634\u0648\u0641 \u0642\u064A\u0645 \u0627\u0648\u0641 \u062B\u0631\u0648\u0646\u0632 \u0645\u0646 \u0627\u0648\u0644\xBB \u2192 {"orders":[{"kind":"title","query":"\u0635\u0631\u0627\u0639 \u0627\u0644\u0639\u0631\u0648\u0634","english":"Game of Thrones","play":true,"season":1,"episode":1,"mediaType":"tv"}]}
\xAB\u062E\u0644\u0646\u064A \u0627\u0643\u0645\u0644 \u0627\u0644\u0645\u0633\u0644\u0633\u0644 \u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u0644\u064A \u0628\u0639\u062F\u0647\u0627\xBB \u2192 {"orders":[{"kind":"episode","op":"next"}]}
\xAB\u0648\u0634 \u0627\u0633\u0645 \u0627\u0644\u0645\u0645\u062B\u0644 \u0630\u0627\xBB \u2192 {"orders":[{"kind":"info","what":"playing"}]}
\xAB\u062E\u0641\u0641 \u0627\u0644\u0627\u0636\u0627\u0621\u0629\xBB \u2192 {"orders":[]}
\xAB\u0648\u0634 \u0627\u0644\u062C\u0648 \u0628\u0643\u0631\u0629\xBB \u2192 {"orders":[]}
\xAB\u063A\u064A\u0631 \u0644\u063A\u0629 \u0627\u0644\u062A\u0631\u062C\u0645\u0629\xBB \u2192 {"orders":[]}
\xAB\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0643\u0628\u064A\u0631\u0629 \u0635\u063A\u0631\u0647\u0627\xBB \u2192 {"orders":[]}
\xAB\u0631\u062D \u0644\u0644\u0642\u0627\u0626\u0645\u0629 \u0648\u0637\u0641\u064A \u0627\u0644\u062A\u0631\u062C\u0645\u0629\xBB \u2192 {"orders":[{"kind":"page","page":"home"},{"kind":"player","op":"subtitles","enabled":false}]}
Every object may carry "label": a short Arabic description.`;
