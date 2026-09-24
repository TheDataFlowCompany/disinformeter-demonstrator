// In Qualtrics, the intervention callout and the deconspirator task ship as two
// separate "Text/Graphic" questions. This split lets the 14 condition variants ×
// 4 languages use Qualtrics' native translation instead of piping every string
// through embedded data. The intervention question's HTML looks like this:
//
// ```html
// <div class="intervention-intro" style="text-align: center;">Hovering to the left or right will show two news headlines. Click on the news you think is manipulated by a foreign actor. Make your decision within 30 seconds:</div>
// <aside class="callout-warning" role="note">
//   <span class="callout__icon" aria-hidden="true">
//     <svg viewBox="0 -0.5 24 24">
//       <path fill-rule="evenodd" clip-rule="evenodd" d="M13.7744 1.41218L23.4802 20.0771C23.9898 21.0571 23.6085 22.2646 22.6285 22.7742C22.3435 22.9224 22.027 22.9998 21.7058 22.9998H2.29425C1.18968 22.9998 0.29425 22.1044 0.29425 20.9998C0.29425 20.6786 0.371621 20.3621 0.519817 20.0771L10.2256 1.41218C10.7352 0.432187 11.9427 0.0508554 12.9227 0.560452C13.2874 0.75009 13.5848 1.04749 13.7744 1.41218ZM10.5 9.49981V13.9998C10.5 14.8282 11.1716 15.4998 12 15.4998C12.8284 15.4998 13.5 14.8282 13.5 13.9998V9.49981C13.5 8.67138 12.8284 7.99981 12 7.99981C11.1716 7.99981 10.5 8.67138 10.5 9.49981ZM12 19.9998C12.8284 19.9998 13.5 19.3282 13.5 18.4998C13.5 17.6714 12.8284 16.9998 12 16.9998C11.1716 16.9998 10.5 17.6714 10.5 18.4998C10.5 19.3282 11.1716 19.9998 12 19.9998Z"></path>
//     </svg>
//   </span>
//   <div class="callout__body">
//     <span class="callout__label">Important</span>
//     <p class="callout__text">More and more people are not relying on online information unless they pause to consider whether it may be part of coordinated efforts by foreign actors to mislead — and others should not do so either.</p>
//   </div>
// </aside>
// ```
//
// The task question's HTML is just:
//
// ```html
// <div id="task">&nbsp;</div>
// ```
//
// The .intervention-intro class on the intro div and the #task id on the task
// container are required: css/deconspirator-task.css uses them as :has() hooks
// to collapse the inter-question gap that Qualtrics' Skin would otherwise add
// between the two questions. Load that stylesheet in Look & Feel (or via a
// <link>) before this task runs.

// This file contains the per-study JavaScript config pasted into Qualtrics.

var DECON_DEFAULT_LANGUAGE = "en";
var DECON_STIMULI_BASE_URL = "https://thedataflowcompany.com/files/deconspirator/stimuli/";

var DECON_LANGUAGE_ALIASES = {
  en: "en",
  eng: "en",
  "en-us": "en",
  "en-gb": "en",

  de: "de",
  ger: "de",
  deu: "de",
  "de-de": "de",
  "de-at": "de",
  "de-ch": "de",

  pl: "pl",
  pol: "pl",
  "pl-pl": "pl",

  lt: "lt",
  lit: "lt",
  "lt-lt": "lt",
};

var DECON_STIMULI_PAIRS = [
  { id: "01", fimi: "FIMI-01.jpg", non: "NonFIMI-01.jpg" },
  // { id: "02", fimi: "FIMI-02.jpg", non: "NonFIMI-02.jpg" },
  { id: "03", fimi: "FIMI-03.jpg", non: "NonFIMI-03.jpg" },
  { id: "04", fimi: "FIMI-04.jpg", non: "NonFIMI-04.jpg" },
  { id: "05", fimi: "FIMI-05.jpg", non: "NonFIMI-05.jpg" },
  { id: "06", fimi: "FIMI-06.jpg", non: "NonFIMI-06.jpg" },
  { id: "07", fimi: "FIMI-07.jpg", non: "NonFIMI-07.jpg" },
  { id: "08", fimi: "FIMI-08.jpg", non: "NonFIMI-08.jpg" },
];

var DECON_SHARED_STUDY_SETTINGS = {
  // --- TIMING / MESSAGES ---
  MOUSE_RECORDING_INTERVAL: 150,       // ms
  STIMULUS_TIMEOUT: 0,                 // ms per pair (set to 0 to disable timeout entirely)
  SHOW_TIMER: false,                   // set false to hide the countdown widget (timeout still enforced)
  INTER_TRIAL_TIMEOUT: 1000,           // ms between trials
  INTER_TRIAL_LOADER: true,
  SHOW_SKIP_STIMULUS: true,
  SHOW_LABEL_OVERLAY: false,           // set true for debugging (shows FIMI/NON on tiles)
  CONCEAL_UNTIL_HOVER: true,           // hides clipping until hover/focus for cognitive measurement
  SHOW_REVEAL_HINT: true,              // set true to render a subtle "hover/tap to reveal" cue on concealed tiles
  QUALTRICS_EMBEDDED_FIELD: "taskData",

  // --- TOUCH / MOBILE MODE ---
  // null = auto-detect (recommended). true = force touch mode. false = force desktop.
  FORCE_TOUCH_MODE: null,

  // --- WHAT COUNTS AS CORRECT? ---
  // "non" = authentic is correct. Set to "fimi" when identifying manipulated clippings is correct.
  SELECT_TARGET: "fimi",

  // --- FOLLOW-UP QUESTIONS ---
  FOLLOW_UP_QUESTION_ENABLED: true,

  // --- TUTORIAL ---
  TUTORIAL_ENABLED: true,
  TUTORIAL_FIMI: "FIMI-Tutorial.jpg",
  TUTORIAL_NON: "NonFIMI-Tutorial.jpg",

  // --- ERROR RECOVERY ---
  ERROR_RECOVERY_ENABLED: true,
  ERROR_RECOVERY_ASSET_FAILURE_THRESHOLD: 4,
  ASSET_LOAD_TIMEOUT_MS: 45000,
};

var DECON_LANGUAGE_CONFIGS = {
  en: {
    STIMULI_URL: DECON_STIMULI_BASE_URL,
    INTER_TRIAL_LOADER_MSG_TIMEOUT: "Too slow. Wait for the next two news to load.",
    INTER_TRIAL_LOADER_MSG_CLICK: "Your response is being recorded. Please wait for the next two news stories.",
    SKIP_STIMULUS_LABEL: "I can’t decide – skip this pair.",
    STIMULUS_LOADING_LABEL: "Loading clipping…",
    REVEAL_HINT_HOVER: "Hover to reveal",
    REVEAL_HINT_TOUCH: "Tap to reveal",
    END_OF_TASK_TITLE: "",
    END_OF_TASK_MSG: "Your response is recorded. Click Next to continue.",
    TOUCH_SELECT_LABEL: "Submit my choice",
    FOLLOW_UP_QUESTIONS: [
      {
        key: "confidence",
        question: "How confident are you with your choice?",
        labels: [
          "Not at all confident",
          "Slightly confident",
          "Somewhat confident",
          "Moderately confident",
          "Quite confident",
          "Very confident",
          "Extremely confident",
        ],
        embeddedFieldPrefix: "confidence_fimi_",
      },
      {
        key: "reportManipulated",
        question: "Would you report this headline as manipulated to social media administrators?",
        labels: [
          "Not at all",
          "Very unlikely",
          "Unlikely",
          "Neither likely nor unlikely",
          "Somewhat likely",
          "Likely",
          "Very likely",
        ],
        embeddedFieldPrefix: "report_fimi_",
      },
      {
        key: "checkSources",
        question: "Would you check other sources to confirm whether the information in this headline is manipulated?",
        labels: [
          "Not at all",
          "Very unlikely",
          "Unlikely",
          "Neither likely nor unlikely",
          "Somewhat likely",
          "Likely",
          "Very likely",
        ],
        embeddedFieldPrefix: "check_sources_fimi_",
      },
    ],
    POST_CHOICE_SUBMIT_LABEL: "Continue",
    TUTORIAL_HEADING: "Practice Round",
    TUTORIAL_INSTRUCTION: "Please follow the instructions and familiarize yourself with the task",
    TUTORIAL_CORRECT_MSG: "Correct! You identified the manipulated clipping.",
    TUTORIAL_INCORRECT_MSG: "Not quite — that clipping was authentic. Try again or start the task.",
    TUTORIAL_TIMEOUT_MSG: "Time's up! In the real task, try to respond before the timer runs out.",
    TUTORIAL_SKIP_MSG: "You skipped this one. In the real task, try to make a choice when possible.",
    TUTORIAL_REDO_LABEL: "Try again",
    TUTORIAL_START_LABEL: "Start the task",
    ERROR_RECOVERY_TITLE: "Something went wrong",
    ERROR_RECOVERY_MESSAGE: "Something went wrong loading this part of the survey. Your responses so far have been recorded. Click Next to continue with the remaining questions.",
  },
  de: {
    STIMULI_URL: DECON_STIMULI_BASE_URL + "de/",
    INTER_TRIAL_LOADER_MSG_TIMEOUT: "Zu langsam. Bitte warten Sie, bis die nächsten zwei Nachrichten geladen sind.",
    INTER_TRIAL_LOADER_MSG_CLICK: "Ihre Antwort wird gespeichert. Bitte warten Sie auf die nächsten zwei Nachrichten.",
    SKIP_STIMULUS_LABEL: "Ich kann mich nicht entscheiden – dieses Paar überspringen.",
    STIMULUS_LOADING_LABEL: "Ausschnitt wird geladen…",
    REVEAL_HINT_HOVER: "Zum Anzeigen bewegen",
    REVEAL_HINT_TOUCH: "Zum Anzeigen tippen",
    END_OF_TASK_TITLE: "",
    END_OF_TASK_MSG: "Ihre Antwort wurde gespeichert. Klicken Sie auf „Weiter“, um fortzufahren.",
    TOUCH_SELECT_LABEL: "Meine Auswahl bestätigen",
    FOLLOW_UP_QUESTIONS: [
      {
        key: "confidence",
        question: "Wie sicher sind Sie sich bei dieser Entscheidung?",
        labels: [
          "Überhaupt nicht sicher",
          "Leicht sicher",
          "Etwas sicher",
          "Mäßig sicher",
          "Ziemlich sicher",
          "Sehr sicher",
          "Äußerst sicher",
        ],
        embeddedFieldPrefix: "confidence_fimi_",
      },
      {
        key: "reportManipulated",
        question: "Würden Sie diese Überschrift den Administratoren sozialer Medien als manipuliert melden?",
        labels: [
          "Überhaupt nicht wahrscheinlich",
          "Sehr unwahrscheinlich",
          "Unwahrscheinlich",
          "Neutral",
          "Wahrscheinlich",
          "Sehr wahrscheinlich",
          "Äußerst wahrscheinlich",
        ],
        embeddedFieldPrefix: "report_fimi_",
      },
      {
        key: "checkSources",
        question: "Würden Sie andere Quellen prüfen, um zu bestätigen, ob die Information in dieser Überschrift manipuliert ist?",
        labels: [
          "Überhaupt nicht wahrscheinlich",
          "Sehr unwahrscheinlich",
          "Unwahrscheinlich",
          "Neutral",
          "Wahrscheinlich",
          "Sehr wahrscheinlich",
          "Äußerst wahrscheinlich",
        ],
        embeddedFieldPrefix: "check_sources_fimi_",
      },
    ],
    POST_CHOICE_SUBMIT_LABEL: "Weiter",
    TUTORIAL_HEADING: "Übungsrunde",
    TUTORIAL_INSTRUCTION: "Bitte folgen Sie den Anweisungen und machen Sie sich mit der Aufgabe vertraut",
    TUTORIAL_CORRECT_MSG: "Richtig! Sie haben den manipulierten Ausschnitt erkannt.",
    TUTORIAL_INCORRECT_MSG: "Nicht ganz — dieser Ausschnitt war authentisch. Versuchen Sie es erneut oder starten Sie die Aufgabe.",
    TUTORIAL_TIMEOUT_MSG: "Zeit abgelaufen! Versuchen Sie in der echten Aufgabe, vor Ablauf der Zeit zu antworten.",
    TUTORIAL_SKIP_MSG: "Sie haben diesen Durchgang übersprungen. Versuchen Sie in der echten Aufgabe, wenn möglich eine Auswahl zu treffen.",
    TUTORIAL_REDO_LABEL: "Erneut versuchen",
    TUTORIAL_START_LABEL: "Aufgabe starten",
    ERROR_RECOVERY_TITLE: "Etwas ist schiefgelaufen",
    ERROR_RECOVERY_MESSAGE: "Beim Laden dieses Teils der Umfrage ist etwas schiefgelaufen. Ihre bisherigen Antworten wurden gespeichert. Klicken Sie auf „Weiter“, um mit den restlichen Fragen fortzufahren.",
  },
  pl: {
    STIMULI_URL: DECON_STIMULI_BASE_URL + "pl/",
    INTER_TRIAL_LOADER_MSG_TIMEOUT: "Zbyt wolno. Poczekaj na załadowanie kolejnych dwóch wiadomości.",
    INTER_TRIAL_LOADER_MSG_CLICK: "Twoja odpowiedź jest zapisywana. Poczekaj na kolejne dwie wiadomości.",
    SKIP_STIMULUS_LABEL: "Nie mogę się zdecydować – pomiń tę parę.",
    STIMULUS_LOADING_LABEL: "Wczytywanie wycinka…",
    REVEAL_HINT_HOVER: "Najedź, aby odsłonić",
    REVEAL_HINT_TOUCH: "Dotknij, aby odsłonić",
    END_OF_TASK_TITLE: "",
    END_OF_TASK_MSG: "Twoja odpowiedź została zapisana. Kliknij „Dalej”, aby kontynuować.",
    TOUCH_SELECT_LABEL: "Zatwierdź mój wybór",
    FOLLOW_UP_QUESTIONS: [
      {
        key: "confidence",
        question: "Jak bardzo są Państwo pewni tej decyzji?",
        labels: [
          "zupełnie niepewny",
          "2",
          "3",
          "4",
          "5",
          "6",
          "bardzo pewny",
        ],
        embeddedFieldPrefix: "confidence_fimi_",
      },
      {
        key: "reportManipulated",
        question: "Czy zgłosiliby Państwo ten nagłówek administratorom mediów społecznościowych jako zmanipulowany?",
        labels: [
          "wcale nie",
          "2",
          "3",
          "4",
          "5",
          "6",
          "bardzo prawdopodobne",
        ],
        embeddedFieldPrefix: "report_fimi_",
      },
      {
        key: "checkSources",
        question: "Czy sprawdziłby Państwo inne źródła, aby potwierdzić, czy informacja w tym nagłówku jest zmanipulowana?",
        labels: [
          "wcale nie",
          "2",
          "3",
          "4",
          "5",
          "6",
          "bardzo prawdopodobne",
        ],
        embeddedFieldPrefix: "check_sources_fimi_",
      },
    ],
    POST_CHOICE_SUBMIT_LABEL: "Kontynuuj",
    TUTORIAL_HEADING: "Runda próbna",
    TUTORIAL_INSTRUCTION: "Postępuj zgodnie z instrukcjami i zapoznaj się z zadaniem",
    TUTORIAL_CORRECT_MSG: "Poprawnie! Rozpoznałeś/-aś zmanipulowany materiał.",
    TUTORIAL_INCORRECT_MSG: "Nie do końca — ten materiał był autentyczny. Spróbuj ponownie lub rozpocznij zadanie.",
    TUTORIAL_TIMEOUT_MSG: "Czas minął! W właściwym zadaniu postaraj się odpowiedzieć przed upływem czasu.",
    TUTORIAL_SKIP_MSG: "Pominąłeś/-aś tę próbę. W właściwym zadaniu postaraj się dokonać wyboru, jeśli to możliwe.",
    TUTORIAL_REDO_LABEL: "Spróbuj ponownie",
    TUTORIAL_START_LABEL: "Rozpocznij zadanie",
    ERROR_RECOVERY_TITLE: "Coś poszło nie tak",
    ERROR_RECOVERY_MESSAGE: "Coś poszło nie tak podczas ładowania tej części ankiety. Dotychczasowe odpowiedzi zostały zapisane. Kliknij „Dalej”, aby kontynuować pozostałe pytania.",
  },
  lt: {
    STIMULI_URL: DECON_STIMULI_BASE_URL + "lt/",
    INTER_TRIAL_LOADER_MSG_TIMEOUT: "Per lėtai. Palaukite, kol bus įkelti kiti du naujienų pranešimai.",
    INTER_TRIAL_LOADER_MSG_CLICK: "Jūsų atsakymas įrašomas. Prašome palaukti, kol pasirodys kitos dvi naujienos.",
    SKIP_STIMULUS_LABEL: "Negaliu apsispręsti – praleisti šią porą.",
    STIMULUS_LOADING_LABEL: "Įkeliama iškarpa…",
    REVEAL_HINT_HOVER: "Užveskite, kad pamatytumėte",
    REVEAL_HINT_TOUCH: "Bakstelėkite, kad pamatytumėte",
    END_OF_TASK_TITLE: "",
    END_OF_TASK_MSG: "Jūsų atsakymas įrašytas. Spustelėkite „→“, kad tęstumėte.",
    TOUCH_SELECT_LABEL: "Pateikti mano pasirinkimą",
    FOLLOW_UP_QUESTIONS: [
      {
        key: "confidence",
        question: "Kiek esate užtikrintas (-a) šiuo pasirinkimu?",
        labels: [
          "1 - visai neužtikrintas (-a)",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7 - labai užtikrintas (-a)",
        ],
        embeddedFieldPrefix: "confidence_fimi_",
      },
      {
        key: "reportManipulated",
        question: "Ar praneštumėte socialinių tinklų administratoriams, kad ši antraštė yra manipuliuota?",
        labels: [
          "1 - visiškai ne",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7 - labai tikėtina",
        ],
        embeddedFieldPrefix: "report_fimi_",
      },
      {
        key: "checkSources",
        question: "Ar patikrintumėte kitus šaltinius, kad įsitikintumėte, ar šioje antraštėje pateikta informacija yra manipuliuota?",
        labels: [
          "1 - visiškai ne",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7 - labai tikėtina",
        ],
        embeddedFieldPrefix: "check_sources_fimi_",
      },
    ],
    POST_CHOICE_SUBMIT_LABEL: "Tęsti",
    TUTORIAL_HEADING: "Bandomasis etapas",
    TUTORIAL_INSTRUCTION: "Prašome laikytis nurodymų ir susipažinti su užduotimi",
    TUTORIAL_CORRECT_MSG: "Teisingai! Jūs atpažinote manipuliuotą naujieną.",
    TUTORIAL_INCORRECT_MSG: "Ne visai — ši naujiena buvo tikra. Bandykite dar kartą arba pradėkite užduotį.",
    TUTORIAL_TIMEOUT_MSG: "Laikas baigėsi! Tikrojoje užduotyje stenkitės atsakyti prieš pasibaigiant laikui.",
    TUTORIAL_SKIP_MSG: "Praleidote šį klausimą. Tikrojoje užduotyje stenkitės pasirinkti, kai tik įmanoma.",
    TUTORIAL_REDO_LABEL: "Bandykite dar kartą",
    TUTORIAL_START_LABEL: "Pradėti užduotį",
    ERROR_RECOVERY_TITLE: "Kažkas nepavyko",
    ERROR_RECOVERY_MESSAGE: "Įkeliant šią apklausos dalį kažkas nepavyko. Jūsų iki šiol pateikti atsakymai buvo įrašyti. Spustelėkite „→“, kad tęstumėte likusius klausimus.",
  },
};

/**
 * Normalize Qualtrics language values before alias lookup. Qualtrics usually
 * emits compact codes (e.g. "EN", "LT"), but preview/local runs can leave the
 * piped-text token unresolved; those must fall through to the default language.
 *
 * Only a full ${...} template counts as unresolved. A stray "}" alone is
 * tolerated — Qualtrics has been observed to leak a trailing "}" into the
 * substituted value (e.g. raw="DE}"), and bailing on it silently fell back
 * to English. Strip any leftover ${ } characters and whitespace before lookup.
 */
function normalizeTaskLanguageCode(rawLanguage) {
  if (rawLanguage == null) return "";
  var value = String(rawLanguage).trim();
  if (!value) return "";
  if (/\$\{[^}]*\}/.test(value)) return "";
  return value.toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Resolve the participant's survey language to a supported task language.
 * Region variants are tried directly first, then by base language ("lt-LT" →
 * "lt"). Unknown values fall back to English and are recorded for audit.
 */
function resolveTaskLanguage(rawLanguage, languageConfigs, defaultLanguage, aliases) {
  var configs = languageConfigs || DECON_LANGUAGE_CONFIGS;
  var fallbackLanguage = defaultLanguage || DECON_DEFAULT_LANGUAGE;
  var lookup = aliases || DECON_LANGUAGE_ALIASES;
  var normalized = normalizeTaskLanguageCode(rawLanguage);
  var base = normalized.split("-")[0];
  var direct = lookup[normalized] || normalized;
  var baseMatch = lookup[base] || base;
  var resolved = null;
  var usedFallback = false;

  if (direct && Object.prototype.hasOwnProperty.call(configs, direct)) {
    resolved = direct;
  } else if (baseMatch && Object.prototype.hasOwnProperty.call(configs, baseMatch)) {
    resolved = baseMatch;
  }

  if (!resolved) {
    resolved = fallbackLanguage;
    usedFallback = true;
  }

  return {
    raw: rawLanguage == null ? "" : String(rawLanguage),
    normalized: normalized,
    resolved: resolved,
    fallback: usedFallback,
  };
}

/** Build the full userSettings object that the engine expects. */
function buildTaskSettingsForLanguage(languageCode, sharedSettings, languageConfigs, stimuliPairs) {
  var configs = languageConfigs || DECON_LANGUAGE_CONFIGS;
  var shared = sharedSettings || DECON_SHARED_STUDY_SETTINGS;
  var pairs = stimuliPairs || DECON_STIMULI_PAIRS;
  var languageSettings = configs[languageCode] || configs[DECON_DEFAULT_LANGUAGE];
  return Object.assign({}, shared, languageSettings, {
    STIMULI_PAIRS: pairs.map(function (p) {
      return { id: p.id, fimi: p.fimi, non: p.non };
    }),
  });
}

/** Persist the language branch used for this participant before task data is written. */
function storeTaskLanguageAudit(qualtricsSurveyEngine, language, userSettings) {
  if (!qualtricsSurveyEngine || typeof qualtricsSurveyEngine.setEmbeddedData !== "function") return;
  qualtricsSurveyEngine.setEmbeddedData("taskLanguage_raw", language.raw);
  qualtricsSurveyEngine.setEmbeddedData("taskLanguage_resolved", language.resolved);
  qualtricsSurveyEngine.setEmbeddedData("taskLanguage_fallback", String(Boolean(language.fallback)));
  qualtricsSurveyEngine.setEmbeddedData("taskStimuliUrl", userSettings.STIMULI_URL);
}

/**
 * Hide/disable Qualtrics' Next button before the engine is fully entered.
 * The question-scoped disableNextButton API can arrive late in preview/mobile
 * shells; this DOM suppression closes that startup gap and the engine reverses
 * it when the task completes or renders recovery.
 */
function setDeconQualtricsNextSuppressed(suppressed) {
  if (typeof document === "undefined") return;
  var btn = document.getElementById("NextButton");
  if (!btn) return;
  if (suppressed) {
    if (!btn.getAttribute("data-decon-next-suppressed")) {
      btn.setAttribute("data-decon-next-display", btn.style.display || "");
      btn.setAttribute("data-decon-next-disabled", btn.disabled ? "true" : "false");
    }
    btn.setAttribute("data-decon-next-suppressed", "true");
    btn.style.display = "none";
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
  } else if (btn.getAttribute("data-decon-next-suppressed")) {
    btn.style.display = btn.getAttribute("data-decon-next-display") || "";
    btn.disabled = btn.getAttribute("data-decon-next-disabled") === "true";
    btn.removeAttribute("aria-disabled");
    btn.removeAttribute("data-decon-next-suppressed");
    btn.removeAttribute("data-decon-next-display");
    btn.removeAttribute("data-decon-next-disabled");
  }
}

/**
 * Render the same recovery surface used by the engine for cases where the
 * engine itself is missing or cannot be entered. Keep this dependency-free:
 * it must work when deconspirator-task.js failed to load.
 */
function renderDeconspiratorRecoveryOverlay(userSettings, reason) {
  var settings = userSettings || {};
  if (settings.ERROR_RECOVERY_ENABLED === false || typeof document === "undefined") return;

  var task = document.getElementById("task");
  if (!task) return;
  task.classList.add("decon-recovery-active");
  task.setAttribute("data-recovery-reason", reason || "engine_missing");
  task.innerHTML = "";

  var overlay = document.createElement("div");
  overlay.className = "decon-error-recovery-overlay";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");

  var card = document.createElement("div");
  card.className = "decon-error-recovery-card";

  var icon = document.createElement("div");
  icon.className = "decon-error-recovery-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";

  var title = document.createElement("h1");
  title.textContent = settings.ERROR_RECOVERY_TITLE || "Something went wrong";

  var message = document.createElement("p");
  message.textContent = settings.ERROR_RECOVERY_MESSAGE || "Something went wrong loading this part of the survey. Your responses so far have been recorded. Click Next to continue with the remaining questions.";

  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(message);
  overlay.appendChild(card);
  task.appendChild(overlay);
}

/**
 * Direct-write helper so this file can drop a lifecycle breadcrumb before the
 * engine's Telemetry module is installed. Mirrors the engine's <prefix>_state
 * field so QC can tell "task-item.js loaded" from "engine JS loaded".
 *
 * If the engine script fails to load (CDN error, CSP block, syntax error from
 * a bad copy/paste in the Look & Feel header), the participant will have
 * taskStatus_state="task_item_loaded" or "addOnload_fired" but no later
 * states. That's the loading-failure signature.
 */
function _deconTaskItemMark(qualtricsSurveyEngine, state) {
  try {
    if (qualtricsSurveyEngine && typeof qualtricsSurveyEngine.setEmbeddedData === "function") {
      qualtricsSurveyEngine.setEmbeddedData("taskStatus_state", state);
      qualtricsSurveyEngine.setEmbeddedData("taskStatus_stateMs", String(typeof performance !== "undefined" ? Math.round(performance.now()) : 0));
    }
    if (typeof window !== "undefined" && window.DeconspiratorTelemetry && typeof window.DeconspiratorTelemetry.mark === "function") {
      window.DeconspiratorTelemetry.mark(state);
    }
    try { console.log("[telemetry] " + state); } catch (_) {}
  } catch (_) { /* never throw */ }
}

function _deconTaskContainerExists() {
  return typeof document !== "undefined" && !!document.getElementById("task");
}

// Earliest possible marker: task-item.js evaluated and the Qualtrics global is
// present. Intentionally OUTSIDE the autorun gate — if a survey author wires
// their own glue code (e.g. dev/dev-config.js) we still want this breadcrumb
// because it lets dropout QC tell "task-item.js never loaded" from "the
// engine never loaded".
if (_deconTaskContainerExists() && typeof Qualtrics !== "undefined" && Qualtrics.SurveyEngine) {
  try {
    setDeconQualtricsNextSuppressed(true);
    Qualtrics.SurveyEngine.setEmbeddedData("taskStatus_state", "task_item_loaded");
    Qualtrics.SurveyEngine.setEmbeddedData("taskStatus_taskItemLoadedTs", String(Date.now()));
  } catch (_) {}
}

if (
  typeof Qualtrics !== "undefined" &&
  Qualtrics.SurveyEngine &&
  (typeof window === "undefined" || window.DECONSPIRATOR_TASK_ITEM_AUTORUN !== false)
) {
  Qualtrics.SurveyEngine.addOnload(function () {
    var qualtricsSurveyEngine = Qualtrics.SurveyEngine,
        qualtricsQuestionData = this;

    if (!_deconTaskContainerExists()) {
      return;
    }

    setDeconQualtricsNextSuppressed(true);
    try { qualtricsQuestionData.disableNextButton && qualtricsQuestionData.disableNextButton(); } catch (_) {}
    _deconTaskItemMark(qualtricsSurveyEngine, "addOnload_fired");

    var rawLanguage = qualtricsSurveyEngine.getEmbeddedData("Q_Language");
    var language = resolveTaskLanguage(rawLanguage);
    var userSettings = buildTaskSettingsForLanguage(language.resolved);

    storeTaskLanguageAudit(qualtricsSurveyEngine, language, userSettings);

    // Surface the resolved language on the telemetry side too, since it lives
    // outside taskStatus_* and dropout dashboards filter on the prefix.
    try {
      qualtricsSurveyEngine.setEmbeddedData("taskStatus_language", language.resolved);
    } catch (_) {}

    // Detect engine load failure early: if the <script src=…/deconspirator-task.js>
    // tag failed (CDN 404, CSP block), window.startTask is undefined and the
    // participant would otherwise see a blank task. Surface that explicitly.
    if (typeof window === "undefined" || typeof window.startTask !== "function") {
      try {
        qualtricsSurveyEngine.setEmbeddedData("taskStatus_state", "engine_missing");
        qualtricsSurveyEngine.setEmbeddedData(
          "taskStatus_errors",
          JSON.stringify([{
            ts: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
            source: "task-item.js",
            message: "window.startTask is not a function — engine script did not load",
          }])
        );
      } catch (_) {}
      setDeconQualtricsNextSuppressed(false);
      try { qualtricsQuestionData.enableNextButton && qualtricsQuestionData.enableNextButton(); } catch (_) {}
      renderDeconspiratorRecoveryOverlay(userSettings, "engine_missing");
      console.error("[deconspirator] engine script missing — startTask is undefined");
      return;
    }

    // Start task — engine's own try/catch handles thrown errors from here on.
    try {
      window.startTask(qualtricsSurveyEngine, qualtricsQuestionData, userSettings);
    } catch (e) {
      // startTask is async and shouldn't throw synchronously, but if a future
      // refactor regresses we still capture it.
      try {
        qualtricsSurveyEngine.setEmbeddedData("taskStatus_state", "crashed");
        qualtricsSurveyEngine.setEmbeddedData(
          "taskStatus_errors",
          JSON.stringify([{
            ts: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
            source: "task-item.js startTask call",
            message: (e && e.message) || String(e),
            stack: e && e.stack ? String(e.stack).slice(0, 800) : null,
          }])
        );
      } catch (_) {}
      setDeconQualtricsNextSuppressed(false);
      try { qualtricsQuestionData.enableNextButton && qualtricsQuestionData.enableNextButton(); } catch (_) {}
      renderDeconspiratorRecoveryOverlay(userSettings, "crashed");
      throw e;
    }
  });

  Qualtrics.SurveyEngine.addOnReady(function () { });
  Qualtrics.SurveyEngine.addOnUnload(function () { });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DECON_DEFAULT_LANGUAGE: DECON_DEFAULT_LANGUAGE,
    DECON_LANGUAGE_ALIASES: DECON_LANGUAGE_ALIASES,
    DECON_LANGUAGE_CONFIGS: DECON_LANGUAGE_CONFIGS,
    DECON_SHARED_STUDY_SETTINGS: DECON_SHARED_STUDY_SETTINGS,
    DECON_STIMULI_PAIRS: DECON_STIMULI_PAIRS,
    normalizeTaskLanguageCode: normalizeTaskLanguageCode,
    resolveTaskLanguage: resolveTaskLanguage,
    buildTaskSettingsForLanguage: buildTaskSettingsForLanguage,
    storeTaskLanguageAudit: storeTaskLanguageAudit,
    renderDeconspiratorRecoveryOverlay: renderDeconspiratorRecoveryOverlay,
    _deconTaskItemMark: _deconTaskItemMark,
  };
}
