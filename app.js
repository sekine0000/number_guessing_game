/*
 * 数字推理ゲーム参考実装。SPECIFICATION.md を仕様の正とする。
 * 0〜9ボタンのみで入力。物理キーボード数字入力のイベントは登録しない。
 */
(() => {
  'use strict';

  const element = document.getElementById('game');
  if (!element) return;

  const STORAGE_KEY = 'number-guessing-game-v2';
  // 以前の試作品で保存された進行状況を引き継ぐための旧キー。画面の名称とは無関係。
  const LEGACY_STORAGE_KEY = 'numeron-handover-game-v2';
  const MAX_ATTEMPTS = 8;
  const MARK_NAMES = ['未設定', '候補', '除外予想'];
  const app = {
    data: null,
    menu: 'none', // none, options, answer
    helpOpen: false,
    storageUsable: false
  };

  const digits = '0123456789';

  function makeAnswer(length) {
    const choices = [...digits];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices.slice(0, length).join('');
  }

  function newRound(length) {
    return {
      answer: makeAnswer(length),
      slots: Array(length).fill(''),
      selected: 0,
      sequential: true,
      memos: Array(10).fill(0),
      history: [],
      status: 'playing',
      message: '数字を入力してください'
    };
  }

  function defaultData() {
    return { version: 2, mode: 3, games: { 3: newRound(3), 4: newRound(4) } };
  }

  function isValidRound(round, length) {
    if (!round || typeof round !== 'object') return false;
    if (typeof round.answer !== 'string' || !new RegExp(`^[0-9]{${length}}$`).test(round.answer)) return false;
    if (new Set(round.answer).size !== length) return false;
    if (!Array.isArray(round.slots) || round.slots.length !== length) return false;
    if (!round.slots.every(v => v === '' || (typeof v === 'string' && /^[0-9]$/.test(v)))) return false;
    const entered = round.slots.filter(Boolean);
    if (new Set(entered).size !== entered.length) return false;
    if (!Number.isInteger(round.selected) || round.selected < 0 || round.selected >= length) return false;
    if (typeof round.sequential !== 'boolean') return false;
    if (!Array.isArray(round.memos) || round.memos.length !== 10 || !round.memos.every(v => [0, 1, 2].includes(v))) return false;
    if (!Array.isArray(round.history) || round.history.length > MAX_ATTEMPTS) return false;
    if (!round.history.every(h => h && typeof h.guess === 'string' && new RegExp(`^[0-9]{${length}}$`).test(h.guess) && new Set(h.guess).size === length && Number.isInteger(h.eat) && Number.isInteger(h.bite) && h.eat >= 0 && h.bite >= 0 && h.eat + h.bite <= length)) return false;
    if (new Set(round.history.map(h => h.guess)).size !== round.history.length) return false;
    if (!['playing', 'won', 'lost', 'revealed'].includes(round.status)) return false;
    return true;
  }

  function load() {
    const freshState = defaultData();
    try {
      window.localStorage.setItem(STORAGE_KEY + '-test', '1');
      window.localStorage.removeItem(STORAGE_KEY + '-test');
      app.storageUsable = true;
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const legacy = saved ? null : window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const raw = saved || legacy;
      if (!raw) return freshState;
      const old = JSON.parse(raw);
      if (old && old.version === 2 && [3, 4].includes(old.mode) && old.games &&
          isValidRound(old.games[3], 3) && isValidRound(old.games[4], 4)) {
        if (legacy) window.localStorage.setItem(STORAGE_KEY, raw);
        return old;
      }
    } catch (_) {
      app.storageUsable = false;
    }
    return freshState;
  }

  function save() {
    if (!app.storageUsable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
    } catch (_) {
      app.storageUsable = false;
    }
  }

  function round() {
    return app.data.games[app.data.mode];
  }

  function safe(text) {
    return String(text).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function helpMarkup() {
    if (!app.helpOpen) return '';
    return `<section class="help-content" id="help-content">
      <p>0〜9から重複しない${app.data.mode}桁の数字を当てます。先頭が0の場合もあります。</p>
      <p><strong>EAT：</strong>数字と位置が一致。<strong>BITE：</strong>数字は含まれるが位置が違う。</p>
      <p>8回以内に全桁正解すればクリアです。8回目に不正解だとゲームオーバーです。</p>
      <p>タップで入力先の桁を選び、画面内の0〜9ボタンで数字を入力します。同じ数字は重複しません。</p>
      <p>数字メモは灰色 → 緑色（候補） → 赤色（除外予想） → 灰色。赤色の数字も入力できます。</p>
    </section>`;
  }

  function menuMarkup(current) {
    if (app.menu === 'options') {
      return `<section class="dialog" role="dialog" aria-label="やり直しの選択">
        <strong class="dialog-title">ゲームをやり直しますか？</strong>
        <p>新しいゲームでは履歴・数字メモ・入力を初期化します。</p>
        <button type="button" class="dialog-button primary" data-action="show-answer">正解を確認して新しいゲームを始める</button>
        <button type="button" class="dialog-button" data-action="new-without">正解を見ずに新しいゲームを始める</button>
        <button type="button" class="dialog-cancel" data-action="cancel">キャンセル</button>
      </section>`;
    }
    if (app.menu === 'answer') {
      return `<section class="dialog" role="dialog" aria-label="今回の正解">
        <strong class="dialog-title">今回の正解</strong>
        <div class="revealed-answer">${current.answer}</div>
        <p>正解を確認したら、新しいゲームを始めてください。</p>
        <button type="button" class="dialog-button primary" data-action="new-after">新しいゲームを始める</button>
      </section>`;
    }
    return '';
  }

  function resultMarkup(current) {
    if (current.status === 'playing' || app.menu === 'answer') return '';
    const win = current.status === 'won';
    const lost = current.status === 'lost';
    const type = win ? 'win' : lost ? 'lost' : 'revealed';
    const title = win ? 'ゲームクリア！' : lost ? 'ゲームオーバー' : 'ゲーム終了';
    const description = win ? `${current.history.length}回で正解しました` :
      lost ? '8回以内に正解できませんでした' : '正解を確認して終了しました';
    return `<section id="result-banner" class="result-banner ${type}" role="status" aria-live="polite">
      <div class="result-symbol">${win ? '✓' : lost ? '✕' : '!'}</div>
      <h2 class="result-title">${title}</h2>
      <div class="result-answer">正解：${current.answer}</div>
      <div class="result-details">${description}</div>
      <button type="button" class="replay-button" data-action="replay">もう一度遊ぶ</button>
    </section>`;
  }

  function render() {
    const current = round();
    const playing = current.status === 'playing' && app.menu === 'none';
    const complete = current.slots.every(v => v !== '');
    const guess = current.slots.join('');
    const repeated = complete && current.history.some(h => h.guess === guess);
    const remaining = MAX_ATTEMPTS - current.history.length;

    element.innerHTML = `<header class="game-header">
      <strong class="game-title">数字推理ゲーム</strong>
      <div class="header-controls">
        <div class="mode-switch" aria-label="桁数を切り替える" role="group">
          <button type="button" data-action="mode" data-mode="3" aria-pressed="${app.data.mode === 3}" ${app.menu !== 'none' ? 'disabled' : ''}>3桁</button>
          <button type="button" data-action="mode" data-mode="4" aria-pressed="${app.data.mode === 4}" ${app.menu !== 'none' ? 'disabled' : ''}>4桁</button>
        </div>
        ${playing ? '<button type="button" class="restart-mini" data-action="restart">↻ やり直す</button>' : ''}
      </div>
    </header>
    <button type="button" class="help-toggle" data-action="help" aria-expanded="${app.helpOpen}" aria-controls="help-content" ${app.menu !== 'none' ? 'disabled' : ''}>
      <span>ⓘ 遊び方</span><span aria-hidden="true">${app.helpOpen ? '▲' : '▼'}</span>
    </button>
    ${helpMarkup()}
    ${menuMarkup(current)}
    ${resultMarkup(current)}
    <div class="workspace">
      <section class="panel history-panel" aria-label="推理履歴">
        <div class="panel-title">推理履歴</div>
        <div class="history">
          ${current.history.length ? current.history.map((h, i) =>
            `<div class="history-row ${i === current.history.length - 1 ? 'latest' : ''}" aria-label="予想${h.guess}、${h.eat} EAT、${h.bite} BITE">
              <span class="history-guess">${h.guess}</span>
              <span class="history-score">${h.eat} EAT / ${h.bite} BITE</span>
            </div>`).join('') : '<p class="history-empty">判定結果がここに表示されます。</p>'}
        </div>
      </section>
      <section class="board" aria-label="数字入力と判定">
        <div class="board-header">
          <strong>数字入力</strong>
          <span class="remaining ${remaining <= 2 ? 'low' : ''}">${current.status === 'playing' ? `残り ${remaining} 回` : current.status === 'won' ? 'CLEAR' : current.status === 'lost' ? 'GAME OVER' : '終了'}</span>
        </div>
        <div class="slots" role="group" aria-label="予想する数字">
          ${current.slots.map((v, i) => `<button type="button" class="slot-button" data-action="slot" data-index="${i}" aria-pressed="${playing && current.selected === i}" aria-label="${i + 1}桁目：${v || '空欄'}" ${playing ? '' : 'disabled'}>${v || '–'}</button>`).join('')}
          <button type="button" class="delete-button" data-action="erase" aria-label="数字を削除" ${playing ? '' : 'disabled'}><svg class="delete-icon" viewBox="0 0 32 24" aria-hidden="true" focusable="false"><path d="M11 3h18v18H11L2 12Z"/><path d="M16 8l8 8m0-8-8 8"/></svg></button>
        </div>
        <button type="button" class="judge-button" data-action="judge" ${playing && complete && !repeated ? '' : 'disabled'}>判定する</button>
        <div class="keypad" role="group" aria-label="入力用の数字ボタン">
          ${current.memos.map((m, n) => `<button type="button" class="digit-button" data-action="digit" data-digit="${n}" data-mark="${m}" aria-label="数字${n}" ${playing ? '' : 'disabled'}>${n}</button>`).join('')}
        </div>
        <div class="game-message" role="status">${playing ? `${current.selected + 1}桁目を選択中。` : ''}${safe(current.message || '')}${playing && repeated ? '（判定済みの組み合わせです）' : ''}</div>
      </section>
      <section class="panel memo-panel" aria-label="数字メモ">
        <div class="panel-title">数字メモ</div>
        <div class="memo-grid">
          ${current.memos.map((mark, n) => `<button type="button" class="memo-button" data-action="memo" data-digit="${n}" data-mark="${mark}" aria-label="数字${n}：${MARK_NAMES[mark]}" ${app.menu === 'none' ? '' : 'disabled'}>${n}</button>`).join('')}
        </div>
        <div class="memo-legend">
          <span><i class="legend-color" style="background:#eef1f5"></i>未設定</span>
          <span><i class="legend-color" style="background:#cef1da"></i>候補</span>
          <span><i class="legend-color" style="background:#f7cccc"></i>除外</span>
        </div>
      </section>
    </div>
    <p class="footer-note">${app.storageUsable ? '進行状況は自動保存されます。' : 'このブラウザでは自動保存できません。'} 新しいゲームでは履歴と数字メモも初期化します。</p>`;
  }

  function enterDigit(digit) {
    const g = round();
    if (g.status !== 'playing' || app.menu !== 'none') return;
    const target = g.selected;
    if (g.slots[target] === digit) {
      g.message = 'その桁には同じ数字が入っています';
      render();
      return;
    }
    const source = g.slots.findIndex((v, i) => v === digit && i !== target);
    if (g.slots[target] !== '' || source !== -1) g.sequential = false;
    if (source !== -1) g.slots[source] = '';
    g.slots[target] = digit;

    let next = target;
    for (let step = 1; step <= app.data.mode; step++) {
      const i = (target + step) % app.data.mode;
      if (g.slots[i] === '') {
        next = i;
        break;
      }
    }
    g.selected = next;
    g.message = source !== -1 ? '数字を移動しました' : next !== target ? '次の空欄に移動しました' : '入力しました';
    save();
    render();
  }

  function eraseDigit() {
    const g = round();
    if (g.status !== 'playing' || app.menu !== 'none') return;
    const at = g.selected;
    if (g.slots[at] !== '') {
      g.slots[at] = '';
      g.selected = Math.max(0, at - 1);
      g.message = '削除して前の桁に移動しました';
    } else if (g.sequential && at > 0 && g.slots[at - 1] !== '') {
      g.slots[at - 1] = '';
      g.selected = at - 1;
      g.message = '前の桁を削除しました';
    } else {
      g.message = '選択中の桁は空欄です';
    }
    save();
    render();
  }

  function judge() {
    const g = round();
    if (g.status !== 'playing' || app.menu !== 'none' || g.slots.includes('')) return;
    const guess = g.slots.join('');
    if (g.history.some(h => h.guess === guess)) return;

    const eat = [...guess].filter((v, i) => v === g.answer[i]).length;
    const bite = [...guess].filter((v, i) => v !== g.answer[i] && g.answer.includes(v)).length;
    g.history.push({ guess, eat, bite });
    let finished = false;

    if (eat === app.data.mode) {
      g.status = 'won';
      g.message = '正解しました';
      finished = true;
    } else if (g.history.length >= MAX_ATTEMPTS) {
      g.status = 'lost';
      g.message = '制限回数に達しました';
      finished = true;
    } else {
      g.slots = Array(app.data.mode).fill('');
      g.selected = 0;
      g.sequential = true;
      g.message = '次の予想を入力してください';
    }

    save();
    render();
    if (finished) {
      const banner = element.querySelector('#result-banner');
      if (banner) banner.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function startNew() {
    app.data.games[app.data.mode] = newRound(app.data.mode); // メモもゼロから作り直す
    app.menu = 'none';
    save();
    render();
  }

  element.addEventListener('click', e => {
    const button = e.target.closest('button[data-action]');
    if (!button || !element.contains(button) || button.disabled) return;
    const action = button.dataset.action;

    if (app.menu === 'options' && !['show-answer', 'new-without', 'cancel'].includes(action)) return;
    if (app.menu === 'answer' && action !== 'new-after') return;

    if (action === 'help') {
      app.helpOpen = !app.helpOpen;
      render();
    } else if (action === 'mode') {
      app.data.mode = Number(button.dataset.mode);
      save();
      render();
    } else if (action === 'restart') {
      app.menu = 'options';
      render();
    } else if (action === 'show-answer') {
      round().status = 'revealed';
      app.menu = 'answer';
      save();
      render();
    } else if (action === 'new-without' || action === 'new-after' || action === 'replay') {
      startNew();
    } else if (action === 'cancel') {
      app.menu = 'none';
      render();
    } else if (action === 'memo') {
      const g = round();
      const number = Number(button.dataset.digit);
      g.memos[number] = (g.memos[number] + 1) % 3;
      save();
      render();
    } else if (action === 'slot') {
      const g = round();
      if (g.status !== 'playing') return;
      const target = Number(button.dataset.index);
      if (target !== g.selected && g.slots.some(v => v !== '')) g.sequential = false;
      g.selected = target;
      g.message = '桁を選択しました';
      save();
      render();
    } else if (action === 'digit') {
      enterDigit(button.dataset.digit);
    } else if (action === 'erase') {
      eraseDigit();
    } else if (action === 'judge') {
      judge();
    }
  });

  app.data = load();
  // 正解の確認中に再読み込みしても、確認画面を維持する。
  if (round().status === 'revealed') app.menu = 'answer';
  render();
})();
