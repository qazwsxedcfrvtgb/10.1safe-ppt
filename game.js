/* ==========================================================================
   互动游戏《安全的一天》
   —— 7 名同学轮流上台，每人抽取号码（不重复），随机经历 5 个安全事件
   —— 星数与题数相同：答对几题就得几颗星（满分 5 星）
   数据来源：events.js（window.SAFETY_EVENTS）

   交互设计（这是本版重点重写的部分）：
     · 点对话框任意位置 = 下一题（不必去点小按钮）
     · 文字还在逐字显示时点一下 = 立刻显示完整
     · 三把锁防止连点/双击把流程搞乱：
         st.busy      正在处理一次点击，期间忽略所有点击（同步锁）
         st.waiting   正在等待玩家推进（只有一次推进机会，用完即清空）
         st.awaiting  正在等待玩家做选择（此时点对白框不做任何事）
     · 每段文字用独立 token，过期的打字计时器绝不会改写新界面
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     常量与状态
     ------------------------------------------------------------------ */
  var TOTAL_TURNS = 7;                 // 7 名同学轮流
  var STARS_MAX = 5;                   // 每天最多几颗星（与题数相同）
  var EVENTS_PER_DAY = STARS_MAX;       // 每天 5 个随机事件
  var EXCLUDED = [14, 28, 31];         // 不存在的学号
  var POOL = [];
  for (var n = 1; n <= 49; n++) { if (EXCLUDED.indexOf(n) === -1) POOL.push(n); }

  var st = {
    turn: 0,            // 已完成的同学数
    stuNo: null,        // 当天抽到的学号
    dayEvents: [],
    idx: 0,             // 当前第几题
    rightCount: 0,
    typing: null,       // 打字计时器
    typeToken: 0,       // 打字代次（防过期计时器改界面）
    onDone: null,       // 打字结束后的回调（跳过打字时也要执行）
    full: '',
    phase: 'draw',      // draw | play | result | end
    rolling: false,     // 抽号中
    drawTimer: null,
    busy: false,        // 同步锁
    waiting: null,      // 等待推进时保存的下一步动作
    awaiting: false,    // 等待做选择
    usedNos: [],
    records: [],
    mistakes: []        // 错题清单：[{no, scene, time, tag, text, wrong, right, why}]
  };

  /* ------------------------------------------------------------------
     DOM
     ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    root: $('game'), sky: $('sky'), avatar: $('avatar'), avatarArt: $('avatarArt'),
    name: $('avatarName'), who: $('who'), whoSub: $('whoSub'), say: $('say'),
    choices: $('choices'), dlog: $('dlog'), over: $('over'),
    hudChapter: $('hudChapter'), hudScore: $('hudScore'),
    hudProg: $('hudProg'), plateK: $('plateKicker'), plateT: $('plateTitle'),
    ovTitle: $('ovTitle'), ovStars: $('ovStars'), ovScore: $('ovScore'),
    ovText: $('ovText'), ovKicker: $('ovKicker')
  };
  var extra = {
    turn: $('hudTurn'), stu: $('hudStu'), life: $('hudLifeLabel'),
    draw: $('drawPanel'), drawBtn: $('drawBtn'), drawHint: $('drawHint'),
    ovNext: $('ovNext'), ovAgain: $('ovAgain'),
    board: $('board'), boardBody: $('boardBody'), boardTitle: $('boardTitle'),
    boardHint: $('boardHint'), boardBtn: $('boardBtn'),
    mist: $('mistakes'), mistBody: $('mistBody'), mistSub: $('mistSub'), mistBtn: $('mistBtn')
  };

  /* ------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------ */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pickEvents() {
    var pool = (window.SAFETY_EVENTS || []).slice();
    var picked = [], usedTimes = [];
    var times = ['早上', '上午', '中午', '下午', '傍晚', '晚上'];
    while (picked.length < EVENTS_PER_DAY && pool.length) {
      var i = Math.floor(Math.random() * pool.length);
      var ev = pool.splice(i, 1)[0];
      // 尽量让一天分布在不同的时间点，且同一个时间段只用一次
      if (usedTimes.indexOf(ev.time) !== -1) continue;
      usedTimes.push(ev.time);
      picked.push(ev);
    }
    picked.sort(function (a, b) { return times.indexOf(a.time) - times.indexOf(b.time); });
    return picked;
  }

  function pickStudentNo() {
    var avail = POOL.filter(function (x) { return st.usedNos.indexOf(x) === -1; });
    if (!avail.length) return POOL[Math.floor(Math.random() * POOL.length)];
    return avail[Math.floor(Math.random() * avail.length)];
  }

  /* 答对几题 = 几颗星（与题数相同） */
  function starsFor(right) { return Math.max(0, Math.min(STARS_MAX, right)); }

  function starRow(n) {
    var s = '';
    for (var i = 0; i < STARS_MAX; i++) {
      s += (i < n ? '<span>★</span>' : '<span class="off">★</span>');
    }
    return s;
  }

  function faceHTML() { return '<img src="assets/game.png" alt="" draggable="false">'; }

  function syncHud() {
    if (extra.turn) extra.turn.textContent = Math.min(st.turn + 1, TOTAL_TURNS) + ' / ' + TOTAL_TURNS;
    if (extra.stu) extra.stu.textContent = st.stuNo ? (st.stuNo + ' 号') : '待抽号';
    if (el.hudScore) el.hudScore.innerHTML = starRow(starsFor(st.rightCount));
    if (extra.life) extra.life.textContent = st.rightCount + ' / ' + EVENTS_PER_DAY;
    var pct = Math.round((st.idx / EVENTS_PER_DAY) * 100);
    if (el.hudProg) el.hudProg.style.width = Math.max(4, pct) + '%';
  }

  function setAvatar(name) {
    var id = 'hero';
    if (el.avatarArt.getAttribute('data-id') !== id) {
      el.avatarArt.innerHTML = faceHTML();
      el.avatarArt.setAttribute('data-id', id);
      if (el.avatar) {
        el.avatar.classList.remove('pop');
        void el.avatar.offsetWidth;
        el.avatar.classList.add('pop');
        setTimeout(function () { el.avatar.classList.remove('pop'); }, 420);
      }
    }
    if (el.name) el.name.textContent = name || '小 安';
    if (el.dlog) el.dlog.setAttribute('data-who', (name === '小安' || !name) ? 'player' : 'other');
  }

  /* ------------------------------------------------------------------
     文字显示
     ------------------------------------------------------------------ */
  function isTyping() { return st.typing !== null; }

  function typeText(html, done) {
    if (st.typing) { clearInterval(st.typing); st.typing = null; }
    st.full = html;
    st.onDone = done || null;               // 记住回调：跳过打字时也要执行
    var token = ++st.typeToken;             // 本段的代次
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var plain = tmp.textContent, i = 0;
    var caret = '<span class="caret"></span>';
    el.say.innerHTML = caret;
    st.typing = setInterval(function () {
      if (token !== st.typeToken) { clearInterval(st.typing); return; }  // 过期，直接退出
      i += 2;
      if (i >= plain.length) {
        clearInterval(st.typing); st.typing = null;
        el.say.innerHTML = html + caret;
        st.onDone = null;
        if (done) done();
        return;
      }
      el.say.innerHTML = plain.slice(0, i) + caret;
    }, 16);
  }

  /* 补全文字。关键：不仅要把字显示完，还要执行打字结束后的回调，
     否则"继续"按钮和选项永远不会出现，流程就卡住了。 */
  function skipType() {
    if (!st.typing) return false;
    st.typeToken++;
    clearInterval(st.typing); st.typing = null;
    el.say.innerHTML = st.full + '<span class="caret"></span>';
    var cb = st.onDone;
    st.onDone = null;
    if (cb) cb();
    return true;
  }

  /* ------------------------------------------------------------------
     交互锁与推进入口
     ------------------------------------------------------------------ */
  function busy() { return st.busy; }
  function lock() { st.busy = true; }
  function unlock() { st.busy = false; }
  function clearWait() { st.waiting = null; st.awaiting = false; }

  /* 只创建一个"继续"按钮，重复调用只更新文字，避免堆出多个 */
  function renderNextBtn(label, enabled) {
    var b = el.choices.querySelector('#nextBtn');
    if (!b) {
      el.choices.innerHTML = '';
      b = document.createElement('button');
      b.id = 'nextBtn';
      b.className = 'next';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        advance();
      });
      el.choices.appendChild(b);
    }
    b.textContent = label;
    b.disabled = !enabled;
  }

  function setWaiting(fn, label) {
    st.waiting = fn;
    st.awaiting = false;
    renderNextBtn(label || '继续 ▸', true);
  }

  /* 唯一推进入口：点对话框、点"继续"、按空格都走这里 */
  function advance() {
    if (busy()) return;                      // 上一次点击还没处理完
    if (isTyping()) { skipType(); return; }  // 文字没显示完 -> 先补全
    if (!st.waiting) return;                 // 正在等选择 或 无事可做
    lock();
    var fn = st.waiting;
    st.waiting = null;                       // 立刻清空，杜绝二次推进
    var b = el.choices.querySelector('#nextBtn');
    if (b) { b.disabled = true; b.textContent = '…'; }
    try { fn(); } finally { unlock(); }
  }

  /* ------------------------------------------------------------------
     抽号
     ------------------------------------------------------------------ */
  function showDraw() {
    st.phase = 'draw';
    st.stuNo = null;
    st.idx = 0;
    st.rightCount = 0;
    st.dayEvents = [];
    clearInterval(st.drawTimer); st.drawTimer = null;
    st.rolling = false;
    st.busy = false;
    st.typeToken++;
    clearWait();
    if (el.dlog) el.dlog.style.display = 'none';
    if (extra.draw) extra.draw.style.display = 'flex';
    if (el.over) el.over.classList.remove('show');
    if (extra.board) extra.board.classList.remove('show');
    if (el.hudChapter) el.hudChapter.textContent = '第 ' + (st.turn + 1) + ' 位同学 · 抽取学号';
    if (extra.drawBtn) {
      extra.drawBtn.textContent = '抽取第 ' + (st.turn + 1) + ' 位同学的号码';
      extra.drawBtn.disabled = false;
    }
    if (extra.drawHint) extra.drawHint.textContent = '全班 49 人，除 14、28、31 号。上台过的号不会重复';
    if (el.plateK) el.plateK.textContent = 'DAY ' + (st.turn + 1);
    if (el.plateT) el.plateT.textContent = '等待抽号…';
    syncHud();
  }

  function doDraw() {
    if (st.phase !== 'draw' || st.rolling) return;
    st.rolling = true;
    if (extra.drawBtn) extra.drawBtn.disabled = true;
    var startedTurn = st.turn;
    var count = 0;
    clearInterval(st.drawTimer);
    st.drawTimer = setInterval(function () {
      if (count >= 15 || st.turn !== startedTurn) {
        clearInterval(st.drawTimer); st.drawTimer = null; return;
      }
      if (extra.drawBtn) extra.drawBtn.textContent = POOL[Math.floor(Math.random() * POOL.length)] + ' 号';
      count++;
      if (count > 14) {
        clearInterval(st.drawTimer); st.drawTimer = null;
        st.stuNo = pickStudentNo();
        st.usedNos.push(st.stuNo);
        if (extra.drawBtn) extra.drawBtn.textContent = st.stuNo + ' 号同学，请上台！';
        if (extra.drawHint) extra.drawHint.textContent = '抽到了 ' + st.stuNo + ' 号同学，准备开始这一天';
        if (el.plateT) el.plateT.textContent = st.stuNo + ' 号同学 · 安全的一天';
        if (el.hudChapter) el.hudChapter.textContent = '第 ' + (st.turn + 1) + ' / ' + TOTAL_TURNS + ' 位 · ' + st.stuNo + ' 号同学';
        syncHud();
        setTimeout(function () { st.rolling = false; startDay(); }, 900);
      }
    }, 70);
  }

  /* ------------------------------------------------------------------
     一天的事件流程
     ------------------------------------------------------------------ */
  function startDay() {
    st.phase = 'play';
    st.dayEvents = pickEvents();
    st.idx = 0;
    st.rightCount = 0;
    st.busy = false;
    clearWait();
    clearInterval(st.drawTimer); st.drawTimer = null;
    if (extra.draw) extra.draw.style.display = 'none';
    if (el.dlog) el.dlog.style.display = 'flex';
    setAvatar('小安');
    if (el.who) el.who.firstChild.nodeValue = '小安';
    if (el.whoSub) el.whoSub.textContent = '上台的同学';
    syncHud();
    typeText('我是小安！今天由 <b>' + st.stuNo + ' 号同学</b> 替我拿主意。<br>' +
             '这一天有 <b>' + st.dayEvents.length + ' 道题</b>，<b>答对几道就得几颗星</b>。准备好了吗？',
      function () { setWaiting(nextEvent, '开始这一天 ▸'); });
  }

  function nextEvent() {
    clearWait();
    if (st.idx >= st.dayEvents.length) { finishDay(); return; }
    var ev = st.dayEvents[st.idx];
    setAvatar('小安');
    if (el.who) el.who.firstChild.nodeValue = '小安';
    if (el.plateK) el.plateK.textContent = '第 ' + (st.idx + 1) + ' / ' + st.dayEvents.length + ' 题';
    if (el.plateT) el.plateT.textContent = ev.time + ' · ' + ev.scene;
    if (el.hudChapter) el.hudChapter.textContent = ev.time + ' · ' + ev.tag;

    el.choices.innerHTML = '';
    typeText('【' + ev.time + ' · ' + ev.tag + '】' + ev.text, function () {
      skipType();
      showChoices(shuffle(ev.choices.map(function (c) {
        return { t: c.t, s: c.s, data: c, ev: ev };
      })));
    });
  }

  function showChoices(list) {
    el.choices.innerHTML = '';
    st.waiting = null;
    st.awaiting = true;
    list.forEach(function (c, k) {
      var b = document.createElement('button');
      b.className = 'c';
      b.innerHTML = '<span class="k">' + ['A', 'B', 'C', 'D'][k] + '</span><span class="tx">' + c.t +
                    '<span class="sb">' + c.s + '</span></span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        if (busy() || !st.awaiting) return;
        lock();
        b.disabled = true;
        skipType();
        answer(c.ev, c.data);
        unlock();
      });
      el.choices.appendChild(b);
    });
  }

  function answer(ev, choice) {
    clearWait();
    el.choices.innerHTML = '';
    st.idx++;
    if (choice.ok) {
      st.rightCount++;
      setAvatar('小安');
      var b = document.createElement('div');
      b.className = 'verdict ok';
      b.innerHTML = '<b>这一步选对了</b>';
      el.choices.appendChild(b);
    } else {
      setAvatar('小安');
      var b2 = document.createElement('div');
      b2.className = 'verdict ng';
      b2.innerHTML = '<b>这一步有风险</b>';
      el.choices.appendChild(b2);
      // 记入错题清单：记下"他选了什么"和"正确做法是什么"
      var rightOne = null;
      for (var i = 0; i < ev.choices.length; i++) {
        if (ev.choices[i].ok) { rightOne = ev.choices[i]; break; }
      }
      st.mistakes.push({
        no: st.stuNo,
        time: ev.time,
        tag: ev.tag,
        scene: ev.scene,
        text: ev.text,
        wrong: choice.t,
        right: rightOne ? rightOne.t : '',
        why: rightOne ? rightOne.good : ''
      });
    }
    syncHud();
    typeText(choice.good, function () {
      if (st.idx >= st.dayEvents.length) setWaiting(finishDay, '这一天结束了 ▸');
      else setWaiting(nextEvent, '继续 ▸');
    });
  }

  /* ------------------------------------------------------------------
     单日结算
     ------------------------------------------------------------------ */
  function finishDay() {
    if (st.phase === 'result' || st.phase === 'end') return;
    st.phase = 'result';
    clearWait();
    var right = st.rightCount, all = EVENTS_PER_DAY;
    var stars = starsFor(right);
    var title, txt;
    if (right === all) {
      title = '安全小达人';
      txt = '这一天 <b>' + all + ' 道题全部答对</b>，<b>' + st.stuNo + ' 号同学</b>很棒！<br>把这份判断力带回假期，家里人都放心。';
    } else if (right >= Math.ceil(all * 0.6)) {
      title = '安全小卫士';
      txt = '<b>' + st.stuNo + ' 号同学</b>答对了 <b>' + right + ' / ' + all + '</b> 道题。<br>刚才选错的地方，就是假期里要特别小心的地方。';
    } else {
      title = '还要多注意';
      txt = '<b>' + st.stuNo + ' 号同学</b>答对了 <b>' + right + ' / ' + all + '</b> 道题。<br>记住一句话：<b>拿不准的时候，先停下来问家长。</b>';
    }

    st.records.push({ no: st.stuNo, right: right, stars: stars });

    if (el.ovKicker) el.ovKicker.textContent = '第 ' + (st.turn + 1) + ' / ' + TOTAL_TURNS + ' 位 · ' + st.stuNo + ' 号同学';
    if (el.ovTitle) el.ovTitle.textContent = title;
    if (el.ovStars) el.ovStars.innerHTML = starRow(stars);
    if (el.ovScore) el.ovScore.textContent = '答对 ' + right + ' / ' + all + ' 道题';
    if (el.ovText) el.ovText.innerHTML = txt;
    if (el.over) el.over.classList.add('show');
    st.turn++;

    if (extra.ovNext) {
      extra.ovNext.textContent = st.turn >= TOTAL_TURNS ? '查看班级成绩单 ›' : '请下一位同学上台 ›';
    }
    if (extra.ovAgain) extra.ovAgain.style.display = 'none';
  }

  /* ------------------------------------------------------------------
     班级成绩单
     ------------------------------------------------------------------ */
  function showBoard() {
    st.phase = 'end';
    if (el.over) el.over.classList.remove('show');
    if (el.dlog) el.dlog.style.display = 'none';
    if (extra.draw) extra.draw.style.display = 'none';

    var rows = st.records.slice().sort(function (a, b) { return b.stars - a.stars; });
    var html = '';
    rows.forEach(function (r, i) {
      var medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : (i + 1)));
      html += '<tr><td class="rk">' + medal + '</td><td class="no">' + r.no + ' 号</td>' +
              '<td class="st3">' + starRow(r.stars) + '</td></tr>';
    });
    if (extra.boardBody) extra.boardBody.innerHTML = html;
    if (extra.boardTitle) {
      var full = rows.filter(function (r) { return r.stars === STARS_MAX; }).length;
      extra.boardTitle.textContent = '本班共 ' + full + ' 位同学拿到 ' + STARS_MAX + ' 星';
    }
    if (extra.boardBtn) extra.boardBtn.textContent = '查看错题清单 ›';
    if (extra.board) extra.board.classList.add('show');
  }

  /* ------------------------------------------------------------------
     错题清单汇总：把 7 位同学选错的题集中呈现在一页上
     ------------------------------------------------------------------ */
  function showMistakes() {
    st.phase = 'end';
    if (extra.board) extra.board.classList.remove('show');
    if (el.over) el.over.classList.remove('show');
    if (el.dlog) el.dlog.style.display = 'none';
    if (extra.draw) extra.draw.style.display = 'none';

    var list = st.mistakes;
    var box = extra.mistBody;
    if (!box) return;

    if (!list.length) {
      box.innerHTML =
        '<div class="mwall">' +
        '<div class="mi">' + starRow(STARS_MAX) + '</div>' +
        '<b>全班都答对了！</b>' +
        '<span>7 位同学没有出现任何错题。<br>说明这堂课的重点大家都记住了。</span>' +
        '</div>';
    } else {
      // 按题目归并；同一题里"不同的错误选项"要分别列出，不能只留第一条
      var groups = [], byKey = {};
      list.forEach(function (m) {
        var key = m.time + '|' + m.text;
        if (!byKey[key]) { byKey[key] = { m: m, picks: [], pickIdx: {} }; groups.push(byKey[key]); }
        var g = byKey[key];
        var k2 = m.wrong;
        if (!(k2 in g.pickIdx)) { g.pickIdx[k2] = g.picks.length; g.picks.push({ t: m.wrong, nos: [] }); }
        g.picks[g.pickIdx[k2]].nos.push(m.no);
      });
      // 错得人多的题排前面
      groups.sort(function (a, b) {
        var ca = 0, cb = 0;
        a.picks.forEach(function (p) { ca += p.nos.length; });
        b.picks.forEach(function (p) { cb += p.nos.length; });
        return cb - ca;
      });

      var html = '';
      groups.forEach(function (g) {
        var m = g.m;
        var picksHtml = '';
        g.picks.forEach(function (p) {
          picksHtml +=
            '<div class="mline bad">' +
              '<b>他们选的</b>' +
              '<span class="msel"><i class="mnos">' + p.nos.join('、') + ' 号</i>' + p.t + '</span>' +
            '</div>';
        });
        html +=
          '<div class="mrow">' +
            '<div class="mhead">' +
              '<span class="mtag">' + m.tag + '</span>' +
              '<span class="mwho">' + m.time + ' · ' + m.scene + '</span>' +
            '</div>' +
            '<div class="mq">' + m.text + '</div>' +
            picksHtml +
            '<div class="mline good"><b>正确做法</b><span>' + m.right + '</span></div>' +
            '<div class="mwhy">' + m.why + '</div>' +
          '</div>';
      });
      box.innerHTML = html;
    }

    if (extra.mistSub) {
      var totalWrong = 0;
      list.forEach(function (x) { totalWrong++; });
      extra.mistSub.textContent = totalWrong
        ? ('共 ' + totalWrong + ' 处错误，涉及 ' + box.querySelectorAll('.mrow').length + ' 道题 · 一起过一遍')
        : '没有错题';
    }
    if (extra.mist) extra.mist.classList.add('show');
  }

  /* ------------------------------------------------------------------
     交互绑定
     ------------------------------------------------------------------ */
  if (extra.drawBtn) extra.drawBtn.addEventListener('click', doDraw);

  /* 点对白框任意位置都能推进：
       · 文字还在逐字显示 -> 先补全文字（补全后会自动出按钮/选项）
       · 文字已完整且在等待推进 -> 等同于点"继续"
       · 正在等做选择 -> 什么也不做（避免误触发）
       · 正在处理上一次点击 -> 忽略 */
  if (el.dlog) el.dlog.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    if (busy()) return;
    if (isTyping()) { skipType(); return; }
    advance();
  });

  /* 点判定结果条也可以推进 */
  if (el.choices) el.choices.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.verdict')) {
      if (busy() || isTyping()) return;
      advance();
    }
  });

  if (extra.ovNext) extra.ovNext.addEventListener('click', function () {
    if (el.over) el.over.classList.remove('show');
    if (st.turn >= TOTAL_TURNS) showBoard(); else showDraw();
  });
  if (extra.boardBtn) extra.boardBtn.addEventListener('click', function () {
    showMistakes();
  });
  if (extra.mistBtn) extra.mistBtn.addEventListener('click', function () {
    if (window.Deck) window.Deck.next();
  });

  /* ------------------------------------------------------------------
     对外接口
     ------------------------------------------------------------------ */
  window.Game = {
    start: function () {
      if (st.phase === 'end' || st.records.length === 0) {
        st.turn = 0; st.usedNos = []; st.records = []; st.mistakes = [];
        if (extra.mist) extra.mist.classList.remove('show');
        showDraw();
      }
    },
    isPlaying: function () { return st.phase === 'play' || st.phase === 'draw'; },
    advance: advance,          // 供放映框架的空格键调用
    reset: function () {
      st.turn = 0; st.usedNos = []; st.records = []; st.mistakes = [];
      if (extra.mist) extra.mist.classList.remove('show');
      if (extra.board) extra.board.classList.remove('show');
      showDraw();
    }
  };
})();
