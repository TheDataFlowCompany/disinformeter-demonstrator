// Assemble the Astro `public/` tree from the single-source-of-truth resources.
// Runs automatically on `npm run dev` / `npm run build` (predev/prebuild).
// Everything it writes is regenerated, so `public/` is git-ignored.
import { cpSync, mkdirSync, rmSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => join(ROOT, p);
const PUB = R('public');

function copy(src, dest) {
  if (!existsSync(R(src))) throw new Error(`sync: missing source ${src}`);
  mkdirSync(dirname(join(PUB, dest)), { recursive: true });
  cpSync(R(src), join(PUB, dest), { recursive: true });
}

// Fresh generated tree (preserve nothing — public/ is fully derived).
for (const d of ['data', 'choice-dv', 'downloads', 'figures', 'brand']) {
  rmSync(join(PUB, d), { recursive: true, force: true });
}
mkdirSync(PUB, { recursive: true });

// 0. Brand assets (the DE-CONSPIRATOR logo, used in the header + footer).
copy('docs/brand/deconspirator-logo-header.png', 'brand/logo-header.png');
copy('docs/brand/hero-cover.png', 'brand/logo-full.png');

// 1. Client-side data (fetched by the explorer / simulator / pages).
for (const f of [
  'item-bank/item_bank.json',
  'translations/short_module_translations.json',
  'translations/response_scales.json',
  'feedback/feedback_logic.json',
]) {
  copy(`resources/${f}`, `data/${f.split('/').pop()}`);
}

// 2. The FIMI choice-task bundle (engine + stimuli + dev harness), structure
//    preserved so the harness's relative ../css ../js ../stimuli paths resolve.
for (const d of ['js', 'css', 'stimuli', 'dev']) {
  copy(`docs/choice-dv/${d}`, `choice-dv/${d}`);
}
// Prune non-served cruft that lives alongside the stimuli (source .zip archives,
// macOS .DS_Store) so the static deploy ships only the images the task loads.
(function prune(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) prune(p);
    else if (extname(e.name).toLowerCase() === '.zip' || e.name === '.DS_Store') rmSync(p);
  }
})(join(PUB, 'choice-dv', 'stimuli'));

// 3. Downloadable artifacts (the downloads hub links to these).
const downloads = [
  ['docs/Multilingual_short_version.qsf', 'Multilingual_short_version.qsf'],
  ['docs/Personalized_Feedback_Qualtrics.qsf', 'Personalized_Feedback_Qualtrics.qsf'],
  ['resources/translations/short_module_translations.json', 'short_module_translations.json'],
  ['resources/translations/short_module_translations_long.csv', 'short_module_translations_long.csv'],
  ['resources/translations/short_disinformeter_languages_filled.csv', 'short_disinformeter_languages_filled.csv'],
  ['resources/translations/response_scales.json', 'response_scales.json'],
  ['resources/item-bank/item_bank.json', 'item_bank.json'],
  ['resources/item-bank/item_bank.csv', 'item_bank.csv'],
  ['resources/item-bank/item_mapping_overview.csv', 'item_mapping_overview.csv'],
  ['resources/item-bank/item_mapping.xlsx', 'item_mapping.xlsx'],
  ['resources/feedback/feedback_logic.json', 'feedback_logic.json'],
  ['resources/scoring/scoring_guide.md', 'scoring_guide.md'],
  ['resources/policy-report/d5-3_DisInforMeter_PolicyReport.pdf', 'd5-3_DisInforMeter_PolicyReport.pdf'],
  ['docs/DeConspirator_ChoiceTask_Debrief.pdf', 'DeConspirator_ChoiceTask_Debrief.pdf'],
];
for (const [src, name] of downloads) copy(src, `downloads/${name}`);

// 4. Policy-report figures (used on the home + evidence pages).
copy('resources/policy-report/figures', 'figures');

// 4b. Favicon — the gauge motif in DE-CONSPIRATOR brand colours (navy/azure/crimson).
writeFileSync(join(PUB, 'favicon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="6" fill="#162259"/>' +
  '<path d="M5 22a11 11 0 0 1 22 0" fill="none" stroke="#00A8EF" stroke-width="2.6" stroke-linecap="round"/>' +
  '<path d="M16 22 23 12" stroke="#E1202A" stroke-width="2.6" stroke-linecap="round"/>' +
  '<circle cx="16" cy="22" r="2.5" fill="#E1202A"/></svg>\n');

// 5. A small manifest of download sizes so the UI can show them without a server.
const sizes = {};
for (const [, name] of downloads) {
  sizes[name] = statSync(join(PUB, 'downloads', name)).size;
}
writeFileSync(join(PUB, 'data', 'download_sizes.json'), JSON.stringify(sizes, null, 2));

console.log('sync-public: public/ assembled (data, choice-dv, downloads, figures).');
