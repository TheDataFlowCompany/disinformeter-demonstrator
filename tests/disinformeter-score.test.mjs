import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean,
  scoreShortModule,
  rankFeedbackDomains,
  RECEPTIVITY_DOMAINS,
  FIMI_SETS,
  ALL_SHORT_CODES,
} from '../src/lib/disinformeter-score.mjs';

// A response set with a distinct constant per domain so means and ranks are exact.
const responses = () => {
  const r = {};
  for (const c of RECEPTIVITY_DOMAINS.threat) r[c] = 6;
  for (const c of RECEPTIVITY_DOMAINS.aband) r[c] = 2;
  for (const c of RECEPTIVITY_DOMAINS.fear) r[c] = 5;
  for (const c of RECEPTIVITY_DOMAINS.super) r[c] = 1;
  for (const c of RECEPTIVITY_DOMAINS.general) r[c] = 4;
  // FIMI: news2/5/7/8 (short set) high, the rest low — so full/russian/chinese/short differ.
  for (const c of FIMI_SETS.full) r[c] = 3;
  for (const c of FIMI_SETS.short) r[c] = 7;
  return r;
};

test('mean averages present items and ignores missing', () => {
  assert.equal(mean(['a', 'b', 'c'], { a: 1, b: 7 }), 4); // c missing → mean of 1,7
  assert.equal(mean(['x'], {}), null);
});

test('scores each receptivity domain as its item mean', () => {
  const { domains } = scoreShortModule(responses());
  assert.equal(domains.threat, 6);
  assert.equal(domains.aband, 2);
  assert.equal(domains.fear, 5);
  assert.equal(domains.super, 1);
  assert.equal(domains.general, 4);
});

test('scores the four FIMI sets distinctly', () => {
  const { fimi } = scoreShortModule(responses());
  // short = news2,5,7,8 all 7
  assert.equal(fimi.short, 7);
  // full = 8 items: news2,5,7,8 = 7, others (news1,3,4,6) = 3 → (4*7 + 4*3)/8 = 5
  assert.equal(fimi.full, 5);
  // russian = news1,2,3,4,5 → 1,3 set to 3, 4 to 3, 2&5 to 7 → (3+7+3+3+7)/5 = 4.6
  assert.equal(fimi.russian, 4.6);
  // chinese = news6,7,8 → 3,7,7 → 17/3
  assert.ok(Math.abs(fimi.chinese - 17 / 3) < 1e-9);
});

test('feedback ranking marks the two lowest low and two highest high', () => {
  // threat=6, aband=2, fear=5, super=1 → ascending super(1),aband(2),fear(5),threat(6)
  const { ranking } = scoreShortModule(responses());
  assert.equal(ranking.super, 'low');
  assert.equal(ranking.aband, 'low');
  assert.equal(ranking.fear, 'high');
  assert.equal(ranking.threat, 'high');
});

test('ranking excludes the General Anchor (4 domains only)', () => {
  const level = rankFeedbackDomains({ threat: 6, aband: 2, fear: 5, super: 1, general: 9 });
  assert.deepEqual(Object.keys(level).sort(), ['aband', 'fear', 'super', 'threat']);
});

test('ranking returns null when a feedback domain is missing (ranking_valid = 0)', () => {
  assert.equal(rankFeedbackDomains({ threat: 6, aband: 2, fear: 5 }), null);
});

test('tie groups resolve deterministically with an injected RNG', () => {
  // all equal → one tie group; a fixed RNG keeps the test stable, and either way
  // exactly two are 'low' and two 'high'.
  const level = rankFeedbackDomains({ threat: 4, aband: 4, fear: 4, super: 4 }, () => 0);
  const lows = Object.values(level).filter((v) => v === 'low').length;
  assert.equal(lows, 2);
});

test('ALL_SHORT_CODES covers the full 27-item module', () => {
  assert.equal(ALL_SHORT_CODES.length, 27);
  assert.equal(new Set(ALL_SHORT_CODES).size, 27);
});
