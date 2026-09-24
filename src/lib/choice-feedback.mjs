// Pure derivation of post-task performance feedback from the choice-task engine's
// `taskData` array — the JSON the engine writes to the "taskData" embedded field
// (see public/choice-dv/js/deconspirator-task.js → buildTrial()).
//
// Kept dependency- and DOM-free so the choice-embed page and `node --test` share
// one source of truth for "how many did the participant get right".

const EVENT_CLICK = 'CLICK';
const EVENT_SKIP = 'SKIP';
const EVENT_TIMEOUT = 'TIMEOUT';

/**
 * @param {Array<object>} trials  Parsed taskData: one trial object per stimulus pair.
 * @returns {{
 *   total:number, answered:number, correct:number, skipped:number, timedOut:number,
 *   accuracy:number|null,
 *   pairs: Array<{ pairId:string|null, event:string|null, chosenId:string|null,
 *                  chosenType:string|null, isCorrect:boolean, rt:number|null,
 *                  fimi:object|null, non:object|null }>
 * }}
 */
export function summarizeTaskData(trials) {
  const pairs = (Array.isArray(trials) ? trials : []).map((t) => {
    const assignment = Array.isArray(t && t.assignment) ? t.assignment : [];
    return {
      pairId: t && t.pairId != null ? t.pairId : null,
      event: t && t.event != null ? t.event : null,
      chosenId: t && t.chosenId != null ? t.chosenId : null,
      chosenType: t && t.chosenType != null ? t.chosenType : null,
      // Trust the engine's verdict (it accounts for SELECT_TARGET); fall back to
      // the FIMI-is-correct rule the demonstrator always runs under.
      isCorrect: typeof (t && t.isCorrect) === 'boolean'
        ? t.isCorrect
        : (t && t.event === EVENT_CLICK && t.chosenType === 'fimi'),
      rt: typeof (t && t.rt) === 'number' ? t.rt : null,
      fimi: assignment.find((a) => a && a.type === 'fimi') || null,
      non: assignment.find((a) => a && a.type === 'non') || null,
    };
  });

  const correct = pairs.filter((p) => p.isCorrect).length;
  const answered = pairs.filter((p) => p.event === EVENT_CLICK).length;
  return {
    total: pairs.length,
    answered,
    correct,
    skipped: pairs.filter((p) => p.event === EVENT_SKIP).length,
    timedOut: pairs.filter((p) => p.event === EVENT_TIMEOUT).length,
    accuracy: pairs.length ? correct / pairs.length : null,
    pairs,
  };
}
