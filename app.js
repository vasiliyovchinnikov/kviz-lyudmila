/* ============================================================
   КВИЗ «Насколько ты знаешь Людмилу Цой?»
   Логика: старт → 42 вопроса (3 уровня) → результат → имя → рекорды
   ============================================================ */

const app = document.getElementById('app');

const LV_ORDER = ['L1', 'L2', 'L3'];
const LV_META = {
  L1: { lv: 1, pts: 1, emoji: '🌸' },
  L2: { lv: 2, pts: 2, emoji: '🕹' },
  L3: { lv: 3, pts: 3, emoji: '🏆' },
};

const RANKS = [
  { min: 96, t: 'Вторая Люда 💗', e: ['👑', '💗', '🎤'] },
  { min: 86, t: 'Личный архив Люды', e: ['📚', '🔍', '💗'] },
  { min: 71, t: 'Свой человек', e: ['🫶', '🎧', '🌸'] },
  { min: 56, t: 'Хорошо знаком', e: ['🎧', '🌸', '💗'] },
  { min: 41, t: 'Знакомый знакомых', e: ['🤨', '🌸', '🎧'] },
  { min: 21, t: 'Только здоровается', e: ['🫠', '🎧', '🌸'] },
  { min: 0, t: 'Удалён из семейного чата', e: ['💀', '🫠', '🩷'] },
];

const BOARD_KEY = 'kviz_ludmila_board_v1';
const SAVE_KEY = 'kviz_ludmila_save_v1';
const DEL_KEY = 'kviz_ludmila_del_v1';
const PENDING_KEY = 'kviz_ludmila_pending_v1';
const API_URL = '/board.php'; // свой API на хостинге, same-origin

let BOARD = [];
const CLOUD_TOMBSTONES = new Set(); // локально скрытые (удалённые) записи
let PENDING = []; // записи, ожидающие отправки на сервер
let CLOUD_OK = null; // null = синхронизация, true/false после обмена

let DATA = null;
let MAX = 0;
let TOTAL_Q = 0;
let S = null; // состояние прохождения

/* ---------- утилиты ---------- */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function rankFor(score) {
  const pct = MAX ? (score / MAX) * 100 : 0;
  return RANKS.find(r => pct >= r.min) || RANKS[RANKS.length - 1];
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- загрузка данных ---------- */
async function load() {
  try {
    const r = await fetch('data/quiz.json');
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
    MAX = LV_ORDER.reduce((s, l) => s + DATA[l].questions.length * DATA[l].points, 0);
    TOTAL_Q = LV_ORDER.reduce((s, l) => s + DATA[l].questions.length, 0);
    // локальный кэш таблицы + синхронизация с сервером
    try {
      BOARD = JSON.parse(localStorage.getItem(BOARD_KEY)) || [];
      const dl = JSON.parse(localStorage.getItem(DEL_KEY));
      (dl || []).forEach(t => CLOUD_TOMBSTONES.add(t));
      PENDING = JSON.parse(localStorage.getItem(PENDING_KEY)) || [];
      BOARD = normalizeRecs(BOARD);
    } catch {}
    cloudPull();
    flushPending();
    showStart();
  } catch (e) {
    app.replaceChildren(el(`
      <section class="screen">
        <div class="score-hero">
          <div class="emoji-row">💔</div>
          <h1 class="h1">База вопросов не загрузилась</h1>
          <p class="lead">Проверь интернет и обнови страницу.</p>
          <button class="btn btn-pink" id="retry">Ещё раз</button>
        </div>
      </section>`));
    document.getElementById('retry').onclick = load;
  }
}

/* ============================================================
   СТАРТ
   ============================================================ */
function showStart(opts = {}) {
  const cat = rankFor(0);
  app.replaceChildren(el(`
    <section class="screen">
      <header class="brand">
        <span class="kicker">Хэппи бёздей · 24.09.2026 ·42</span>
        <h1 class="h1">Насколько ты<br>знаешь <span class="grad">Людмилу Цой?</span></h1>
        <p class="lead">42 вопроса из настоящих архивов: Instagram <a class="src-link" href="https://instagram.com/ludatsoy" target="_blank" rel="noopener">@ludatsoy</a> и Telegram <a class="src-link" href="https://t.me/pishetsoy" target="_blank" rel="noopener">@pishetsoy</a>. Ничего не придумано — всё по постам.</p>
      </header>

      <div class="collage-card">
        <span class="sticker s1">K-pop style</span>
        <span class="sticker s2">проверь себя</span>
        <div class="collage-placeholder">
          <img class="collage-main" src="assets/photos/hero.jpg" alt="Людмила">
          <img class="collage-thumb" src="assets/photos/pink.jpg" alt="Людмила">
          <img class="collage-thumb" src="assets/photos/crown.jpg" alt="Людмила">
        </div>
        <span class="sticker s3">всё из архива @ludatsoy</span>
      </div>

      <div class="info-grid">
        <div class="info"><span class="info-k">Вопросов</span><span class="info-v">${LV_ORDER.reduce((s, l) => s + DATA[l].questions.length, 0)}</span></div>
        <div class="info"><span class="info-k">Максимум</span><span class="info-v">${MAX}</span></div>
        <div class="info"><span class="info-k">Уровней</span><span class="info-v">3</span></div>
        <div class="info"><span class="info-k">Формат</span><span class="info-v">⏱ марафон</span></div>
      </div>

      <div class="levels-preview">${levelRows()}</div>

      <button class="btn btn-pink" id="start">Играть 🚀</button>
      <button class="btn btn-ghost" id="resume" hidden>Продолжить с сохранения ▶</button>
      <button class="btn btn-ghost" id="new-run" hidden>Начать заново 🔁</button>
      <button class="btn btn-ghost" id="board-link">Таблица рекордов 🏆</button>
      <p class="footer-note" id="start-note"></p>
    </section>`));

  document.getElementById('start').onclick = startGame;
  document.getElementById('board-link').onclick = () => showBoard({ fromStart: true });
  // режим паузы: есть недоигранная игра → «Продолжить» главный, «Играть» уходит в «Начать заново»
  const prog = loadProgress();
  const resume = document.getElementById('resume');
  const newRun = document.getElementById('new-run');
  if (prog) {
    const done = COUNT_POS[LV_ORDER[prog.level]] + prog.q;
    const pct = Math.round((done / TOTAL_Q) * 100);
    const startBtn = document.getElementById('start');
    const note = document.getElementById('start-note');
    if (opts.paused) {
      startBtn.hidden = true;
      resume.hidden = false; newRun.hidden = false;
      resume.classList.remove('btn-ghost'); resume.classList.add('btn-pink');
      newRun.onclick = () => { clearProgress(); startGame(); };
      resume.onclick = () => {
        S = {
          level: prog.level, q: prog.q, score: prog.score,
          perLevel: prog.perLevel || {},
          answered: false,
          justSaved: prog.saved || false,
        };
        showQuestion();
      };
      note.textContent = `Пауза: пройдено ${done} из ${TOTAL_Q}, ${prog.score} ⭐ · можно закрыть и вернуться в любой момент`;
    } else {
      note.textContent = `Твой прошлый заход: ${done} из ${TOTAL_Q}, ${prog.score} ⭐ — можно продолжить или начать заново`;
      resume.classList.remove('btn-ghost'); resume.classList.add('btn-pink');
      startBtn.classList.remove('btn-pink'); startBtn.classList.add('btn-ghost');
      resume.hidden = false; newRun.hidden = true;
      newRun.hidden = false;
      newRun.onclick = () => { clearProgress(); startGame(); };
      resume.onclick = () => {
        S = {
          level: prog.level, q: prog.q, score: prog.score,
          perLevel: prog.perLevel || {},
          answered: false,
          justSaved: prog.saved || false,
        };
        showQuestion();
      };
    }
  }
}

function levelRows() {
  return LV_ORDER.map(l => {
    const m = LV_META[l];
    const d = DATA[l];
    return el(`
      <div class="level-row">
        <span class="level-num">${m.lv}</span>
        <span class="level-info">
          <span class="level-lv">Уровень ${m.lv} · ${m.emoji}</span>
          <div class="level-name">${esc(d.title)}</div>
          <div class="level-meta">${d.questions.length} вопросов · ${d.questions.length * m.pts} возможных</div>
        </span>
      </div>`).outerHTML;
  }).join('');
}

/* ============================================================
   ИГРА
   ============================================================ */
function startGame() {
  S = {
    level: 0, q: 0, score: 0,
    perLevel: {},
    answered: false,
    justSaved: false,
  };
  saveProgress();
  showQuestion();
}

/* ---------- автосейв / восстановление ---------- */
function saveProgress() {
  if (!S) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      level: S.level, q: S.q, score: S.score,
      perLevel: S.perLevel,
      saved: !!S.justSaved,
    }));
  } catch {}
}
function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d || typeof d.level !== 'number') return null;
    if (!DATA || !DATA[LV_ORDER[d.level]]) return null;
    const D = DATA[LV_ORDER[d.level]];
    if (d.q < 0 || d.q >= D.questions.length) return null;
    return d;
  } catch { return null; }
}
function clearProgress() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

/* карточка игрока (компактная статистика в шапке вопроса) */
function playerCard() {
  const pct = Math.round((S.score / MAX) * 100);
  const done = COUNT_POS[LV_ORDER[S.level]] + S.q + (S.answered ? 1 : 0);
  return `
    <div class="player-card">
      <div class="pc-row">
        <span class="pc-score">⭐ ${S.score}</span>
        <span class="pc-pct">${pct}% от ${MAX}</span>
      </div>
      <div class="pc-bar"><i style="width:${pct}%"></i></div>
      <div class="pc-sub">пройдено ${done} из ${TOTAL_Q}</div>
    </div>`;
}

function topbar(elCls, liveTxt, scoreTxt, pctTxt) {
  return `
    <div class="topbar">
      <span class="chip">${elCls}</span>
      <span class="chip chip-live" id="score-chip">${liveTxt}</span>
      <span class="chip">${scoreTxt}</span>
    </div>
    <div class="progress-wrap">
      <div class="progress"><div class="progress-bar" style="width:${pctTxt}%"></div></div>
      <span class="progress-label" id="pct-label">${pctTxt}%</span>
    </div>`;
}

function showQuestion() {
  const lvl = LV_ORDER[S.level];
  const D = DATA[lvl];
  const m = LV_META[lvl];
  const q = D.questions[S.q];

  // Шаффим варианты: правильный в исходнике всегда под индексом 0, так что в шаффл
  // отдаём индексы, а правильный ищем по тексту — после перетасовки.
  const pool = q.options.map((text, idx) => ({ text, idx }));
  const opts = shuffle(pool);
  const correctPos = opts.findIndex(p => p.idx === q.correct);
  const TOTAL = TOTAL_Q;
  const doneCount = COUNT_POS[lvl] + S.q + (S.answered ? 1 : 0);
  const pct = Math.round((doneCount / TOTAL_Q) * 100);

  const boardCol = S.level > 0 || S.q >= 15 ? boardHTML('quiz-side') : '';

  app.replaceChildren(el(`
    <section class="screen screen-wide">
      ${topbar(`Уровень ${m.lv} · ${m.emoji}`, `⭐ ${S.score}`, `вопрос ${QUEST_ID(lvl, S.q)}/${TOTAL_Q}`, pct)}
      <div class="quiz-split">
        <div class="quiz-main">
      <div class="q-card">
        <span class="q-lvline">${esc(D.title)} · +${m.pts} за верный</span>
        <h2 class="q-text"><span class="q-num">${QUEST_ID(lvl, S.q)}.</span> ${esc(q.q)}</h2>
        <div class="options">
          ${opts.map((o, i) => el(`
            <button class="opt" data-i="${i}">
              <span class="key">${'ABCD'[i]}</span>
              <span>${esc(o.text)}</span>
            </button>`).outerHTML).join('')}
        </div>
      </div>

      ${playerCard()}
      <button class="btn btn-ghost btn-pause" id="pause">⏸ Пауза — сохранить и выйти</button>

      <div class="spacer"></div>
      <p class="footer-note">Из архивов <a class="src-link" href="https://instagram.com/ludatsoy" target="_blank" rel="noopener">@ludatsoy</a> и <a class="src-link" href="https://t.me/pishetsoy" target="_blank" rel="noopener">@pishetsoy</a> · 24.09.2026</p>
        </div>
        ${boardCol}
      </div>
    </section>`));

  // listens
  document.querySelectorAll('.opt').forEach(btn => {
    btn.onclick = () => answer(btn, correctPos, q, m.pts);
  });
  document.getElementById('pause').onclick = () => {
    saveProgress();
    showStart({ paused: true });
  };
}

/* компактный лидерборд для сайдбара */
function boardHTML(cls) {
  const list = loadBoard()
    .sort((a, b) => (b.score / b.max) - (a.score / a.max) || b.score - a.score)
    .slice(0, 15);
  const rows = list.map((e, i) => `
    <div class="board-row ${i === 0 ? 'top1' : i < 3 ? `top${i + 1}` : ''} ${S.lastName === e.name ? 'me' : ''}">
      <span class="board-place">${i + 1}</span>
      <span class="board-name">${esc(String(e.name).slice(0, 40))}</span>
      <span class="board-score">${e.score}</span>
    </div>`).join('');
  return `
    <aside class="board quiz-side-board ${cls}">
      <div class="board-title">🏆 Топ-15</div>
      <div class="board-list side-list">${rows || '<div class="board-empty">Пока пусто</div>'}</div>
      <div class="side-note">Сохраняйся после блока — попадёшь в таблицу</div>
    </aside>`;
}

const COUNT_POS = { L1: 0, L2: 16, L3: 31 };
function QUESTIONS_BEFORE(lvl) { return DATA[lvl].questions.length; }
function QUEST_ID(lvl, qIdx) { return COUNT_POS[lvl] + qIdx + 1; }

function answer(btn, correctPos, q, pts) {
  if (S.answered) return;
  S.answered = true;
  const i = +btn.dataset.i;
  const good = i === correctPos;
  if (good) { S.score += pts; }

  const lvl = LV_ORDER[S.level];
  const st = (S.perLevel[lvl] ??= { ok: 0, total: 0, pts: 0 });
  st.total += 1; st.pts += good ? pts : 0; if (good) st.ok += 1;

  document.querySelectorAll('.opt').forEach(el2 => {
    el2.disabled = true;
    const el_i = +el2.dataset.i;
    if (el_i === correctPos) el2.classList.add('correct');
    else if (el_i === i) el2.classList.add('wrong');
    else el2.classList.add('dim');
  });

  document.getElementById('score-chip').textContent = `⭐ ${S.score}`;
  saveProgress();

  const fb = el(`
    <div class="feedback ${good ? 'good' : 'bad'}">
      <div class="fb-head ${good ? 'fb-good' : 'fb-bad'}">
        ${good ? `В точку! +${pts} ⭐` : `Мимо! Правильный ответ: ${esc(q.options[q.correct])}`}
      </div>
      <div class="fb-src">📦 Источник: ${esc(q.source)}</div>
    </div>`);
  btn.closest('.q-card').after(fb);

  const nav = el(`
    <div class="q-nav">
      <button class="btn btn-pink" id="next">Далее →</button>
    </div>`);
  fb.after(nav);
  nav.querySelector('#next').onclick = () => {
    fb.remove(); nav.remove();
    S.answered = false;
    nextQ();
  };
}

function nextQ() {
  const lvl = LV_ORDER[S.level];
  const D = DATA[lvl];
  if (S.q + 1 < D.questions.length) {
    S.q += 1;
    showQuestion();
  } else {
    S.perLevel[lvl].pts = S.perLevel[lvl].ok * LV_META[lvl].pts;
    if (S.level + 1 < LV_ORDER.length) {
      showInterstitial();
    } else {
      showFinal();
    }
  }
}

/* ============================================================
   МЕЖДУ УРОВНЯМИ
   ============================================================ */
function showInterstitial() {
  const doneLv = LV_ORDER[S.level];
  const st = S.perLevel[doneLv];
  const m = LV_META[doneLv];
  const pct = Math.round((S.score / MAX) * 100);
  const afterL1 = S.level === 0;
  const checkpoint = afterL1;
  if (checkpoint) S.justSaved = false; // форсировать новое сохранение на этом чекпоинте
  saveProgress();

  const nextLv = LV_META[LV_ORDER[S.level + 1]];
  const nextD = DATA[LV_ORDER[S.level + 1]];
  app.replaceChildren(el(`
    <section class="screen">
      <div class="score-hero">
        <span class="score-label">Уровень ${m.lv} завершён</span>
        <div class="emoji-row">${m.emoji}${m.emoji}${m.emoji}</div>
        <h2 class="h2">${esc(DATA[doneLv].title)}</h2>
        <div class="score-value">${st.ok}<span style="font-size:.5em">/${st.total}</span></div>
        <p class="score-sub">+${st.pts} ⭐ · всего ${S.score} из ${MAX}</p>
        <div class="rank"><span class="rank-k">Прогресс марафона</span><span class="bar"><i style="width:${pct}%"></i></span></div>
      </div>

      ${afterL1 ? `
      <form class="name-form" id="name-form">
        <label class="info-k" for="name-input">Предпросмотр: впиши имя — попадёшь в топ после этого блока</label>
        <input class="name-input" id="name-input" placeholder="Например: Вася" maxlength="40" autocomplete="off">
        <button class="btn btn-pink" type="submit">Сохранить результат блока 💾</button>
        <div id="saved-note" hidden></div>
      </form>` : ''}

      <button class="btn btn-pink" id="go-next">
        Играть дальше → Уровень ${nextLv.lv} ${nextLv.emoji}
      </button>
      <p class="footer-note">Уровень ${nextLv.lv} — «${esc(nextD.title)}» · +${nextLv.pts} ⭐ за верный · прогресс сохраняется автоматически</p>
    </section>`));

  const f = document.getElementById('name-form');
  if (f) f.onsubmit = e => { e.preventDefault(); saveName(); };
  document.getElementById('go-next').onclick = () => {
    S.level += 1; S.q = 0;
    saveProgress();
    showQuestion();
  };
}

const PHOTO_TAPE = [
  ['satin',  'Стиль 🎀'],
  ['pink',   'Розовое 🌸'],
  ['crown',  'Корона 👑'],
  ['bomber', 'Сукадзян 🐉'],
  ['gym',    'Гребля 🚣‍♀️'],
  ['yoga',   'На коврике 🧘‍♀️'],
  ['garage', 'Гараж-перфи 😂'],
  ['pier',   'С Васей 🩷'],
  ['kiss',   'Походы 🌲'],
  ['mtn',    'Горы 🏔'],
  ['nerli',  'Нерль ⛪'],
];

/* ============================================================
   ФИНАЛ
   ============================================================ */
function showFinal() {
  const rk = rankFor(S.score);
  const names = savedNames();
  app.replaceChildren(el(`
    <section class="screen">
      <div class="score-hero">
        <span class="score-label">Твой результат</span>
        <div class="score-value">${S.score}</div>
        <p class="score-sub">из ${MAX} возможных</p>
        <h2 class="h2">${esc(rk.t)}</h2>
        <div class="emoji-row">${rk.e.join('')}</div>
      </div>

      <form class="name-form" id="name-form">
        <label class="info-k" for="name-input">Твоё имя — попадёшь в таблицу рекордов</label>
        <input class="name-input" id="name-input" placeholder="Например: Вася" maxlength="40" value="${esc(names.last || '')}" autocomplete="off">
        <button class="btn btn-pink" type="submit">Сохранить в таблицу рекордов 💾</button>
      </form>
      <div id="saved-note" hidden></div>

      <div id="board-wrap"></div>

      <section class="board">
        <div class="board-title">Foto-лента именинницы 🎀 листай →</div>
        <div class="photo-tape">
          ${PHOTO_TAPE.map(([n, cap]) => el(`
            <figure class="collage-frame ${Math.random() > 0.5 ? 'r' : ''}" data-cap="${esc(cap)}">
              <img src="assets/photos/${n}.jpg" alt="${esc(cap)}" loading="lazy">
            </figure>`).outerHTML).join('')}
        </div>
      </section>

      <div class="btn-row">
        <button class="btn btn-ghost" id="again">Заново 🔁</button>
        <button class="btn btn-ghost" id="share">Поделиться 📤</button>
      </div>
      <p class="footer-note">Квиз «Насколько ты знаешь Людмилу Цой?» · к дню рождения 24.09.2026</p>
    </section>`));

  document.getElementById('again').onclick = startGame;
  document.getElementById('share').onclick = async () => {
    const text = shareText();
    try {
      if (navigator.share) await navigator.share({ title: 'Насколько ты знаешь Людмилу Цой?', text });
      else { await navigator.clipboard.writeText(text); flashSaved('Результат скопирован 📋'); }
    } catch { /* пользователь отменил — ок */ }
  };
  document.getElementById('name-form').onsubmit = e => {
    e.preventDefault();
    saveName();
  };
  confetti();
}

function flashSaved(msg) {
  const note = document.getElementById('saved-note');
  if (!note) return;
  note.className = 'name-saved-note';
  note.textContent = msg;
  note.hidden = false;
}

/* ============================================================
   РЕКОРДЫ
   ============================================================ */
function loadBoard() {
  return BOARD;
}
function persistBoard() {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(BOARD));
    localStorage.setItem(DEL_KEY, JSON.stringify([...CLOUD_TOMBSTONES]));
    localStorage.setItem(PENDING_KEY, JSON.stringify(PENDING));
  } catch {}
}
function normalizeRecs(l) {
  return (l || []).filter(x => x && x.name && typeof x.score === 'number' && x.ts && !CLOUD_TOMBSTONES.has(x.ts));
}
function mergeBoards(a, b) {
  const seen = new Map();
  for (const r of [...(a || []), ...(b || [])]) if (r.ts && !seen.has(r.ts)) seen.set(r.ts, r);
  return [...seen.values()].sort((x, y) =>
    (y.score / (y.max || MAX)) - (x.score / (x.max || MAX)) || y.score - x.score);
}
let cloudTimer = null;
function scheduleCloudPush(delay = 600) {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(flushPending, delay);
}
/* GET таблицы с сервера → merge в локальную */
async function cloudPull() {
  try {
    const r = await fetch(API_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    BOARD = mergeBoards(normalizeRecs(BOARD), (j.records || []).filter(x => !CLOUD_TOMBSTONES.has(x.ts)));
    PENDING = PENDING.filter(p => !BOARD.some(x => x.ts === p.ts)); // уже на сервере
    persistBoard();
    CLOUD_OK = true;
  } catch { CLOUD_OK = false; }
  refreshBoardUIs();
}
/* отправка отложенных записей (новых и застрявших офлайн) */
async function flushPending() {
  if (!PENDING.length) { CLOUD_OK = true; refreshBoardUIs(); return; }
  const rec = PENDING[0];
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    });
    if (r.status === 429) { // rate-limit 10с/IP — тихо подождать и повторить
      setTimeout(flushPending, 10000);
      return;
    }
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    BOARD = mergeBoards(normalizeRecs(BOARD), (j.records || []).filter(x => !CLOUD_TOMBSTONES.has(x.ts)));
    PENDING = PENDING.filter(p => p.ts !== rec.ts);
    persistBoard();
    CLOUD_OK = true;
    refreshBoardUIs();
    if (PENDING.length) flushPending(); // следующая в очереди
  } catch {
    CLOUD_OK = false;
    refreshBoardUIs();
    setTimeout(flushPending, 30000); // Wi-Fi площадки: ретрай через 30 сек
  }
}
function refreshBoardUIs() {
  if (document.getElementById('board-wrap')) renderBoard();
  const side = document.querySelector('.quiz-side-board');
  if (side) side.outerHTML = boardHTML('quiz-side');
}
function saveBoardList(list) {
  BOARD = mergeBoards(normalizeRecs(list), BOARD);
  persistBoard();
  // найти записи, которых ещё нет на сервере, и поставить в очередь отправки
  const server = BOARD.filter(x => !PENDING.some(p => p.ts === x.ts));
  for (const r of server) {
    if (!PENDING.some(p => p.ts === r.ts) && !BOARD_SENT.has(r.ts)) PENDING.push(r);
  }
  persistBoard();
  scheduleCloudPush();
}
const BOARD_SENT = new Set(); // ts записей, уже принятых сервером в этой сессии
function deleteBoardRecord(ts) {
  CLOUD_TOMBSTONES.add(ts);
  BOARD = BOARD.filter(x => x.ts !== ts);
  PENDING = PENDING.filter(p => p.ts !== ts);
  persistBoard();
  renderBoard();
}

function saveName() {
  const input = document.getElementById('name-input');
  const name = (input?.value || '').trim();
  if (!name) {
    flashSaved('Сначала впиши имя ✏️');
    input?.focus();
    return;
  }
  const list = loadBoard();
  const prev = list[list.length - 1];
  if (prev && S.justSaved && prev.name === name && prev.score === S.score) {
    flashSaved(`Уже в таблице: ${name} — ${S.score} ⭐`);
    return;
  }
  list.push({ name, score: S.score, max: MAX, ts: new Date().toISOString() });
  saveBoardList(list);
  S.lastName = name;
  S.justSaved = true;
  localStorage.setItem('kviz_ludmila_last_name', name);
  flashSaved(`Сохранено: ${name} — ${S.score} ⭐`);
  renderBoard();
  flushPending(); // сразу отправить на сервер, не ждать таймер
}

function savedNames() {
  let last = '';
  try { last = localStorage.getItem('kviz_ludmila_last_name') || ''; } catch {}
  return { last };
}

/* рендер таблицы (используется и в финале, и отдельно со старта) */
function renderBoard() {
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const list = loadBoard()
    .sort((a, b) => (b.score / b.max) - (a.score / a.max) || b.score - a.score);

  const rows = list.map((e, i) => {
    const me = S && S.lastName && S.lastName === e.name;
    const name = esc(String(e.name).slice(0, 40));
    return el(`
      <div class="board-row ${i === 0 ? 'top1' : i < 3 ? `top${i + 1}` : ''} ${me ? 'me' : ''}" data-ts="${esc(e.ts)}">
        <span class="board-place">${i + 1}</span>
        <span class="board-name">${name}</span>
        <span class="board-score">${e.score}</span>
        <button class="board-del" title="Удалить эту запись" aria-label="Удалить ${name}">×</button>
      </div>`).outerHTML;
  }).join('');

  const syncTxt = CLOUD_OK === null ? ' ⋆ синхронизация…' : CLOUD_OK ? ' · общий для всех браузеров' : ' · офлайн, только этот браузер';
  wrap.replaceChildren(el(`
    <section class="board">
      <div class="board-title">🏆 Рекорды · макс ${MAX}<span class="sync-state">${syncTxt}</span></div>
      ${rows ? `<div class="board-list">${rows}</div>` : '<div class="board-empty">Пока пусто — стань первым перфи!</div>'}
      ${list.length ? '<button class="board-clear" id="clear-board">Очистить рекорды</button>' : ''}
    </section>`));

  wrap.querySelectorAll('.board-del').forEach(btn => {
    btn.onclick = () => deleteBoardRecord(btn.closest('.board-row').dataset.ts);
  });

  const btn = document.getElementById('clear-board');
  if (btn) btn.onclick = () => {
    if (confirm('Точно очистить таблицу рекордов? Удаление уйдёт и другим игрокам.')) {
      CLOUD_TOMBSTONES.clear();
      loadBoard().forEach(x => CLOUD_TOMBSTONES.add(x.ts));
      BOARD = [];
      PENDING = [];
      persistBoard();
      renderBoard();
    }
  };
}

/* отдельный экран таблицы (со старта) */
function showBoard({ fromStart = false }) {
  app.replaceChildren(el(`
    <section class="screen">
      <header class="brand">
        <button class="back-link" id="back">← Назад</button>
        <h1 class="h1">Таблица <span class="grad">рекордов</span></h1>
        <p class="lead">Максимум — ${MAX} баллов. Рекорды хранятся в этом браузере.</p>
      </header>
      <div id="board-wrap"></div>
      ${fromStart ? '<button class="btn btn-pink" id="start2">Играть 🚀</button>' : ''}
      <div class="btn-row">
        <button class="btn btn-ghost" id="again2">Заново 🔁</button>
      </div>
    </section>`));

  document.getElementById('back').onclick = showStart;
  const s2 = document.getElementById('start2');
  if (s2) s2.onclick = startGame;
  document.getElementById('again2').onclick = startGame;
  renderBoard();
}

/* ============================================================
   ПОДЕЛИТЬСЯ
   ============================================================ */
function shareText() {
  const rk = rankFor(S.score);
  return `Насколько ты знаешь Людмилу Цой? Мой результат: ${S.score} из ${MAX} ⭐ — «${rk.t}»`;
}

/* ============================================================
   КОНФЕТТИ
   ============================================================ */
function confetti() {
  const host = el('<div style="position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:99"></div>');
  document.body.appendChild(host);
  const emojis = ['💗', '🌸', '✨', '🎀', '🩷'];
  for (let i = 0; i < 24; i++) {
    const el2 = el(`<span style="position:absolute;top:-2em;left:${Math.random() * 100}%;font-size:${0.8 + Math.random() * 0.8}em;opacity:${0.7 + Math.random() * 0.3};animation:fall ${2.4 + Math.random() * 2.6}s linear ${Math.random() * 0.8}s both;font-family:monospace">${emojis[i % emojis.length]}</span>`);
    host.appendChild(el2);
  }
  setTimeout(() => host.remove(), 6200);
}
const style = document.createElement('style');
style.textContent = '@keyframes fall{to{transform:translateY(110dvh) rotate(140deg)}}';
document.head.appendChild(style);

/* tabindex polish for name form */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement?.id === 'name-input') {
    document.getElementById('name-form')?.requestSubmit();
  }
});

load();
