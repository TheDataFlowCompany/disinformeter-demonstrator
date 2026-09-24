// Pure scoring of a completed short-module DisInforMeter run, plus the S5
// personalized-feedback ranking. DOM- and dependency-free so the demonstrator
// survey page and `node --test` share one source of truth for "what score did
// this respondent get, and which domains does the feedback target".
//
// Scale direction (see resources/scoring/scoring_guide.md):
//   - Receptivity domains: 1–7, higher = more receptivity-relevant endorsement.
//   - FIMI detection:      1–7, higher = better detection.
// The two sides run in OPPOSITE directions and must never be averaged together.
//
// The short module carries no reverse-coded items (verified against the item
// bank), so every domain score is a plain item mean on the 1–7 scale.

// Receptivity domains → their short-module item codes.
export const RECEPTIVITY_DOMAINS = {
  threat: ['th6', 'th9'],
  aband: ['ab2', 'ab4', 'ab7'],
  fear: ['pa1', 'pa2', 'pa4'],
  super: ['fch1', 'fch2', 'fch3', 'fru1', 'fru2', 'fru3'],
  general: ['gen1', 'gen2', 'gen3', 'gen5', 'gen7'],
};

// FIMI detection criterion sets (always report Full alongside the source variants).
export const FIMI_SETS = {
  full: ['news1', 'news2', 'news3', 'news4', 'news5', 'news6', 'news7', 'news8'],
  russian: ['news1', 'news2', 'news3', 'news4', 'news5'],
  chinese: ['news6', 'news7', 'news8'],
  short: ['news2', 'news5', 'news7', 'news8'],
};

// The four domains the S5 feedback intervention ranks. The General Anchor is a
// monitoring signal (the "ultra-brief" index) and is NOT used for feedback.
export const FEEDBACK_DOMAINS = ['threat', 'aband', 'fear', 'super'];

const EPS = 1e-9;

/** Mean of the responses for `codes`, ignoring missing/non-numeric. null if none. */
export function mean(codes, responses) {
  const vals = codes
    .map((c) => responses && responses[c])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Mirror the deployed Qualtrics ranking JS (resources/feedback/feedback_logic.json
 * → ranking_js): sort the four domain scores ascending, group ties (eps = 1e-9)
 * and shuffle within a tie group, then label the two lowest 'low' (messages
 * resonate less) and the two highest 'high' (resonate more).
 *
 * @param {Record<string, number|null>} scores  domain → mean score
 * @param {() => number} [rnd]                   injectable RNG (defaults Math.random)
 * @returns {Record<string,'low'|'high'>|null}   null mirrors ranking_valid = 0
 */
export function rankFeedbackDomains(scores, rnd = Math.random) {
  const keys = FEEDBACK_DOMAINS.filter(
    (k) => typeof scores[k] === 'number' && Number.isFinite(scores[k]),
  );
  if (keys.length < FEEDBACK_DOMAINS.length) return null;

  const sorted = [...keys].sort((a, b) => scores[a] - scores[b]);
  const groups = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(scores[sorted[i]] - scores[sorted[i - 1]]) <= EPS) cur.push(sorted[i]);
    else {
      groups.push(shuffle(cur, rnd));
      cur = [sorted[i]];
    }
  }
  groups.push(shuffle(cur, rnd));

  const order = groups.flat();
  const level = {};
  order.forEach((k, i) => (level[k] = i < 2 ? 'low' : 'high'));
  return level;
}

/**
 * Score a completed run.
 * @param {Record<string, number>} responses  item code → 1–7 rating
 * @param {() => number} [rnd]
 * @returns {{ domains:Record<string,number|null>, fimi:Record<string,number|null>,
 *             ranking:Record<string,'low'|'high'>|null }}
 */
export function scoreShortModule(responses, rnd = Math.random) {
  const domains = {};
  for (const [k, codes] of Object.entries(RECEPTIVITY_DOMAINS)) domains[k] = mean(codes, responses);
  const fimi = {};
  for (const [k, codes] of Object.entries(FIMI_SETS)) fimi[k] = mean(codes, responses);
  const ranking = rankFeedbackDomains(domains, rnd);
  return { domains, fimi, ranking };
}

/** Every item code the short module collects, in scoring order. */
export const ALL_SHORT_CODES = [
  ...Object.values(RECEPTIVITY_DOMAINS).flat(),
  ...FIMI_SETS.full,
];
