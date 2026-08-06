/* ------------------------------------------------------------------ *
 * 漢読 — 大人のための漢字四択ドリル
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'kandoku.stats.v1';

/* ---------------------------- 記録の保存 ---------------------------- */

/** { "相殺": { seen: 3, wrong: 1 }, ... } */
function loadStats() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(stats));
  } catch {
    /* プライベートモードなどで保存できない場合は記録なしで続行 */
  }
}

function record(word, ok) {
  const stats = loadStats();
  const s = stats[word] || { seen: 0, wrong: 0 };
  s.seen += 1;
  if (!ok) s.wrong += 1;
  stats[word] = s;
  saveStats(stats);
}

/* ------------------------------ 状態 ------------------------------ */

const state = {
  level: 'mix',
  count: 10,
  weakFirst: true,
  queue: [],
  index: 0,
  correct: 0,
  wrong: [],
  locked: false,
};

/* ------------------------------ 出題 ------------------------------ */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pool() {
  if (state.level === 'mix') return QUESTIONS;
  if (state.level === 'fish') return QUESTIONS.filter((q) => q.cat === 'fish');
  return QUESTIONS.filter((q) => q.lv === Number(state.level));
}

/**
 * 出題順を決める。「苦手優先」がオンのときは、間違えた回数の多い語ほど
 * 前に来るように重みづけしたうえで、同じ重みの中はランダムに並べる。
 */
function buildQueue() {
  const stats = loadStats();
  let list = shuffle(pool());

  if (state.weakFirst) {
    const weight = (q) => {
      const s = stats[q.w];
      if (!s) return 1;                        // 未出題は中くらいの優先度
      if (s.wrong > 0) return 2 + s.wrong;     // 間違えた語を最優先
      return s.seen >= 2 ? -1 : 0;             // 何度も正解している語は後ろへ
    };
    list.sort((a, b) => weight(b) - weight(a));
  }

  return list.slice(0, Math.min(state.count, list.length));
}

function startQuiz(queue) {
  state.queue = queue;
  state.index = 0;
  state.correct = 0;
  state.wrong = [];
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = state.queue[state.index];
  state.locked = false;

  $('progress-bar').style.width = `${(state.index / state.queue.length) * 100}%`;
  $('q-index').textContent = `${state.index + 1} / ${state.queue.length}`;
  $('q-level').textContent = state.level === 'fish' ? '魚偏' : LEVELS[q.lv].name;
  $('q-score').textContent = `正解 ${state.correct}`;

  const word = $('q-word');
  word.textContent = q.w;
  word.classList.toggle('long', q.w.length >= 4);

  const box = $('choices');
  box.textContent = '';
  shuffle([q.r, ...q.d]).forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.reading = text;

    const key = document.createElement('span');
    key.className = 'choice-key';
    key.textContent = String(i + 1);
    btn.append(key, document.createTextNode(text));

    btn.addEventListener('click', () => answer(text));
    box.append(btn);
  });

  $('verdict').hidden = true;
}

function answer(picked) {
  if (state.locked) return;
  state.locked = true;

  const q = state.queue[state.index];
  const ok = picked === q.r;

  if (ok) state.correct += 1;
  else state.wrong.push(q);
  record(q.w, ok);

  for (const btn of $('choices').children) {
    btn.disabled = true;
    const text = btn.dataset.reading;
    if (text === q.r) btn.classList.add('correct');
    else if (text === picked) btn.classList.add('wrong');
    else btn.classList.add('dim');
  }

  $('q-score').textContent = `正解 ${state.correct}`;

  const verdict = $('verdict');
  verdict.classList.toggle('is-ok', ok);
  verdict.classList.toggle('is-ng', !ok);
  $('verdict-head').textContent = ok ? '正解' : `不正解 — ${q.w}（${q.r}）`;
  $('verdict-body').textContent = q.m;
  verdict.hidden = false;
  $('btn-next').textContent = state.index === state.queue.length - 1 ? '結果を見る' : '次へ';
  $('btn-next').focus();
}

function next() {
  state.index += 1;
  if (state.index >= state.queue.length) showResult();
  else renderQuestion();
}

/* ------------------------------ 結果 ------------------------------ */

function comment(pct) {
  if (pct === 100) return '全問正解。文句なしです。';
  if (pct >= 80) return 'かなりの読み手です。';
  if (pct >= 60) return 'あと一歩。取りこぼしを見直しましょう。';
  if (pct >= 40) return '伸びしろは十分あります。';
  return 'まずは初級から積み上げていきましょう。';
}

function showResult() {
  const total = state.queue.length;
  const pct = Math.round((state.correct / total) * 100);

  $('progress-bar').style.width = '100%';
  $('score-ring').style.setProperty('--pct', pct);
  $('score-pct').textContent = `${pct}%`;
  $('score-sub').textContent = `${state.correct} / ${total} 問正解`;
  $('result-comment').textContent = comment(pct);

  const list = $('review-list');
  list.textContent = '';
  state.wrong.forEach((q) => list.append(reviewItem(q)));
  $('review-wrap').hidden = state.wrong.length === 0;
  $('btn-retry-wrong').hidden = state.wrong.length === 0;

  show('result');
}

function reviewItem(q) {
  const li = document.createElement('li');
  const w = document.createElement('span');
  w.className = 'rw';
  w.textContent = q.w;
  const r = document.createElement('span');
  r.className = 'rr';
  r.textContent = q.r;
  const m = document.createElement('span');
  m.className = 'rm';
  m.textContent = q.m;
  li.append(w, r, m);
  return li;
}

/* ------------------------------ 成績 ------------------------------ */

function showStats() {
  const stats = loadStats();
  const entries = Object.entries(stats);

  const answered = entries.reduce((n, [, s]) => n + s.seen, 0);
  const missed = entries.reduce((n, [, s]) => n + s.wrong, 0);
  const mastered = entries.filter(([, s]) => s.seen >= 2 && s.wrong === 0).length;

  $('st-answered').textContent = answered;
  $('st-rate').textContent = answered ? `${Math.round(((answered - missed) / answered) * 100)}%` : '—';
  $('st-mastered').textContent = mastered;

  const weak = entries
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong || b[1].seen - a[1].seen)
    .slice(0, 12);

  const list = $('weak-list');
  list.textContent = '';
  weak.forEach(([word, s]) => {
    const q = QUESTIONS.find((x) => x.w === word);
    if (!q) return;
    const li = reviewItem(q);
    li.querySelector('.rm').textContent = `${s.seen}回中${s.wrong}回ミス`;
    list.append(li);
  });

  $('weak-empty').hidden = weak.length > 0;
  show('stats');
}

/* ------------------------------ 画面切替 ------------------------------ */

const SCREENS = ['start', 'quiz', 'result', 'stats'];

function show(name) {
  SCREENS.forEach((s) => { $(`screen-${s}`).hidden = s !== name; });
  window.scrollTo(0, 0);
}

function current() {
  return SCREENS.find((s) => !$(`screen-${s}`).hidden);
}

/* ------------------------------ 初期化 ------------------------------ */

function pickChip(group, attr, value, onPick) {
  for (const chip of $(group).children) {
    chip.classList.toggle('is-on', chip.dataset[attr] === String(value));
  }
  onPick();
}

function setup() {
  $('total-count').textContent = QUESTIONS.length;

  $('level-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.level = chip.dataset.level;
    pickChip('level-chips', 'level', state.level, () => {
      if (state.level === 'mix') {
        $('level-note').textContent = '初級から上級までを混ぜて出題します';
      } else if (state.level === 'fish') {
        $('level-note').textContent = `身近な魚偏の漢字を出題します（${pool().length}語）`;
      } else {
        $('level-note').textContent = `${LEVELS[state.level].note}（${pool().length}語）`;
      }
    });
  });

  $('count-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.count = Number(chip.dataset.count);
    pickChip('count-chips', 'count', state.count, () => {});
  });

  $('opt-weak').addEventListener('change', (e) => { state.weakFirst = e.target.checked; });

  $('btn-start').addEventListener('click', () => startQuiz(buildQueue()));
  $('btn-next').addEventListener('click', next);
  $('btn-again').addEventListener('click', () => startQuiz(buildQueue()));
  $('btn-retry-wrong').addEventListener('click', () => startQuiz(shuffle(state.wrong)));
  $('btn-home').addEventListener('click', () => show('start'));
  $('btn-quit').addEventListener('click', () => {
    if (state.index === 0 || confirm('この回を中断しますか？')) show('start');
  });

  $('btn-stats').addEventListener('click', () => {
    if (current() === 'stats') show('start');
    else showStats();
  });
  $('btn-stats-back').addEventListener('click', () => show('start'));
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('これまでの成績をすべて消去します。よろしいですか？')) return;
    saveStats({});
    showStats();
  });

  document.addEventListener('keydown', (e) => {
    if (current() !== 'quiz' || e.metaKey || e.ctrlKey || e.altKey) return;

    if (!state.locked && ['1', '2', '3', '4'].includes(e.key)) {
      const btn = $('choices').children[Number(e.key) - 1];
      if (btn) { e.preventDefault(); answer(btn.dataset.reading); }
      return;
    }
    if (state.locked && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });
}

setup();
