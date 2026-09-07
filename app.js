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

let DATA = null;
let MAX = 0;
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
function showStart() {
  const cat = rankFor(0);
  app.replaceChildren(el(`
    <section class="screen">
      <header class="brand">
        <span class="kicker">Хэппи бёздей · 24.09.2026 ·42</span>
        <h1 class="h1">Насколько ты<br>знаешь <span class="grad">Людмилу Цой?</span></h1>
        <p class="lead">42 вопроса из настоящих архивов: Instagram @ludatsoy и Telegram @pishetsoy. Ничего не придумано — всё по постам.</p>
      </header>

      <div class="collage-card">
        <span class="sticker s1">K-pop style</span>
        <span class="sticker s3">42 вопроса</span>
        <span class="sticker s2">Квиз-перфи</span>
        <div class="collage-placeholder" data-slot="collage"></div>
        <p class="collage-caption">Здесь будет коллаж из фото Людмилы 💗</p>
      </div>

      <div class="info-grid">
        <div class="info"><span class="info-k">Вопросов</span><span class="info-v">42</span></div>
        <div class="info"><span class="info-k">Максимум</span><span class="info-v">${MAX}</span></div>
        <div class="info"><span class="info-k">Уровней</span><span class="info-v">3</span></div>
        <div class="info"><span class="info-k">Формат</span><span class="info-v">⏱ марафон</span></div>
      </div>

      <div class="levels-preview">${levelRows()}</div>

      <button class="btn btn-pink" id="start">Играть 🚀</button>
      <button class="btn btn-ghost" id="board-link">Таблица рекордов 🏆</button>
      <p class="footer-note">Рекорды хранятся в этом браузере — играйте по кругу с одного экрана.</p>
    </section>`));

  document.getElementById('start').onclick = startGame;
  document.getElementById('board-link').onclick = () => showBoard({ fromStart: true });
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
  showQuestion();
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
  const answerTotal = 42;
  const doneCount = COUNT_POS[lvl] + S.q + (S.answered ? 1 : 0);
  const pct = Math.round((doneCount / answerTotal) * 100);

  app.replaceChildren(el(`
    <section class="screen">
      ${topbar(`Уровень ${m.lv} · ${m.emoji}`, `⭐ ${S.score}`, `вопрос ${QUEST_ID(lvl, S.q)}/42`, pct)}

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

      <div class="spacer"></div>
      <p class="footer-note">Из архивов @ludatsoy и @pishetsoy · 24.09.2026</p>
    </section>`));

  // listens
  document.querySelectorAll('.opt').forEach(btn => {
    btn.onclick = () => answer(btn, correctPos, q, m.pts);
  });
}

const COUNT_POS = { L1: 0, L2: 15, L3: 29 };
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

      <button class="btn btn-pink" id="go-next">
        Играть дальше → Уровень ${LV_META[LV_ORDER[S.level + 1]].lv} ${LV_META[LV_ORDER[S.level + 1]].emoji}
      </button>
      <p class="footer-note">Уровень ${LV_META[LV_ORDER[S.level + 1]].lv} — «${esc(DATA[LV_ORDER[S.level + 1]].title)}» · +${LV_META[LV_ORDER[S.level + 1]].pts} ⭐ за верный</p>
    </section>`));

  document.getElementById('go-next').onclick = () => {
    S.level += 1; S.q = 0;
    showQuestion();
  };
}

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
        <input class="name-input" id="name-input" placeholder="Например: Вася" maxlength="24" value="${esc(names.last || '')}" autocomplete="off">
        <button class="btn btn-pink" type="submit">Сохранить в таблицу рекордов 💾</button>
      </form>
      <div id="saved-note" hidden></div>

      <div id="board-wrap"></div>

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
  try { return JSON.parse(localStorage.getItem(BOARD_KEY)) || []; }
  catch { return []; }
}
function saveBoardList(list) {
  localStorage.setItem(BOARD_KEY, JSON.stringify(list.slice(0, 30)));
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
    .sort((a, b) => (b.score / b.max) - (a.score / a.max) || b.score - a.score)
    .slice(0, 10);

  const rows = list.map((e, i) => {
    const me = S && S.lastName && S.lastName === e.name;
    return el(`
      <div class="board-row ${i === 0 ? 'top1' : i < 3 ? `top${i + 1}` : ''} ${me ? 'me' : ''}">
        <span class="board-place">${i + 1}</span>
        <span class="board-name">${esc(e.name)}</span>
        <span class="board-score">${e.score}</span>
      </div>`).outerHTML;
  }).join('');

  wrap.replaceChildren(el(`
    <section class="board">
      <div class="board-title">🏆 Рекорды · макс ${MAX}</div>
      ${rows ? `<div class="board-list">${rows}</div>` : '<div class="board-empty">Пока пусто — стань первым перфи!</div>'}
      ${list.length ? '<button class="board-clear" id="clear-board">Очистить рекорды</button>' : ''}
    </section>`));

  const btn = document.getElementById('clear-board');
  if (btn) btn.onclick = () => {
    if (confirm('Точно очистить таблицу рекордов?')) {
      localStorage.removeItem(BOARD_KEY);
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
