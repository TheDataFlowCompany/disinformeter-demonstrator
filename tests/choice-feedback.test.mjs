import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTaskData } from '../src/lib/choice-feedback.mjs';

// A faithful click-correct trial as produced by buildTrial().
const trial = (over = {}) => ({
  pairId: '01',
  event: 'CLICK',
  chosenId: '01-FIMI',
  chosenType: 'fimi',
  isCorrect: true,
  rt: 1200,
  assignment: [
    { id: '01-FIMI', type: 'fimi', side: 'left', filename: 'FIMI-01.jpg' },
    { id: '01-NON', type: 'non', side: 'right', filename: 'NonFIMI-01.jpg' },
  ],
  ...over,
});

test('counts correct, answered, skipped and timed-out trials', () => {
  const s = summarizeTaskData([
    trial(),
    trial({ pairId: '03', chosenId: '03-NON', chosenType: 'non', isCorrect: false }),
    trial({ pairId: '04', event: 'SKIP', chosenId: null, chosenType: null, isCorrect: false }),
    trial({ pairId: '05', event: 'TIMEOUT', chosenId: null, chosenType: null, isCorrect: false }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.correct, 1);
  assert.equal(s.answered, 2);
  assert.equal(s.skipped, 1);
  assert.equal(s.timedOut, 1);
  assert.equal(s.accuracy, 0.25);
});

test('exposes fimi/non clippings for the inspection gallery', () => {
  const { pairs } = summarizeTaskData([trial()]);
  assert.equal(pairs[0].fimi.filename, 'FIMI-01.jpg');
  assert.equal(pairs[0].non.filename, 'NonFIMI-01.jpg');
  assert.equal(pairs[0].fimi.side, 'left');
});

test('derives correctness when the engine omits isCorrect', () => {
  const { pairs } = summarizeTaskData([
    trial({ isCorrect: undefined }),
    trial({ isCorrect: undefined, chosenType: 'non', event: 'CLICK' }),
  ]);
  assert.equal(pairs[0].isCorrect, true);
  assert.equal(pairs[1].isCorrect, false);
});

test('is robust to empty and malformed input', () => {
  assert.equal(summarizeTaskData(undefined).total, 0);
  assert.equal(summarizeTaskData(null).accuracy, null);
  const { pairs } = summarizeTaskData([{}, { assignment: 'nope' }]);
  assert.equal(pairs[0].fimi, null);
  assert.equal(pairs[1].non, null);
  assert.equal(pairs[0].isCorrect, false);
});
