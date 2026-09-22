/* ==========================================================================
   放映框架：翻页 / 键盘 / 触屏滑动 / 缩略图总览 / 全屏 / 进度
   —— 与内容解耦，任何 16:9 幻灯片数组都能套用
   ========================================================================== */
(function () {
  'use strict';

  var DESIGN_W = 1280, DESIGN_H = 720;
  var viewport = document.getElementById('viewport');
  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var total = slides.length;
  var cur = 0;

  var bar = document.getElementById('bar');
  var prog = document.getElementById('prog');
  var pNow = document.getElementById('pNow');
  var barTitle = document.getElementById('barTitle');
  var ovWrap = document.getElementById('overview');
  var ovGrid = document.getElementById('ovGrid');
  var hint = document.getElementById('hint');
  var animating = false;

  document.getElementById('pAll').textContent = total;

  /* ---------------- 缩放适配 ---------------- */
  function fit() {
    var padY = 52;
    var w = window.innerWidth;
    var h = window.innerHeight - padY;
    var s = Math.min(w / DESIGN_W, h / DESIGN_H);
    viewport.style.transform = 'scale(' + Math.max(0.3, Math.min(s, 1.6)) + ')';
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  fit();

  /* ---------------- 分步显示（PPT 的"动画/分步呈现"） ----------------
     页内任何 .step 元素默认隐藏；每按一次空格/→ 显示一批，显示完再翻页。
     同一 .groupId 的元素算一步，一起出现。 */
  function stepEls(sl) {
    return Array.prototype.slice.call(sl.querySelectorAll('.step'));
  }
  function stepIndex(sl) {
    var v = sl.getAttribute('data-step');
    return v === null ? -1 : parseInt(v, 10);
  }
  function resetSteps(sl) {
    sl.setAttribute('data-step', '-1');
    stepEls(sl).forEach(function (el) { el.classList.remove('on'); });
  }
  function revealNext() {
    var sl = slides[cur];
    var els = stepEls(sl);
    if (!els.length) return false;
    var groups = [];
    els.forEach(function (el) {
      var g = el.getAttribute('data-group');
      var key = g === null ? ('__' + groups.length) : g;
      var bucket = null;
      for (var i = 0; i < groups.length; i++) { if (groups[i].key === key) { bucket = groups[i]; break; } }
      if (!bucket) { bucket = { key: key, els: [] }; groups.push(bucket); }
      bucket.els.push(el);
    });
    var idx = stepIndex(sl);
    if (idx >= groups.length - 1) return false;   // 已全部显示
    idx++;
    sl.setAttribute('data-step', String(idx));
    groups[idx].els.forEach(function (el) { el.classList.add('on'); });
    syncStepHint();
    return true;
  }
  function revealAll(sl) {
    var els = stepEls(sl);
    els.forEach(function (el) { el.classList.add('on'); });
    sl.setAttribute('data-step', '999');
    syncStepHint();
  }
  function stepHintEl() { return document.getElementById('stepHint'); }
  function syncStepHint() {
    var h = stepHintEl();
    if (!h) return;
    var sl = slides[cur];
    var els = stepEls(sl);
    if (!els.length) { h.classList.remove('show'); return; }
    var groups = {}, order = [];
    els.forEach(function (el) {
      var g = el.getAttribute('data-group');
      var key = g === null ? ('__' + order.length) : g;
      if (!(key in groups)) { groups[key] = 1; order.push(key); }
    });
    var idx = stepIndex(sl);
    var left = order.length - 1 - idx;
    h.textContent = left > 0 ? ('按空格继续（本页还有 ' + left + ' 步）') : '本页已讲完，按空格翻页';
    h.classList.add('show');
    clearTimeout(h._t);
    h._t = setTimeout(function () { h.classList.remove('show'); }, 2600);
  }

  /* ---------------- 翻页（新旧页并行过渡，避免硬切） ---------------- */
  var exitTimer = null;
  function show(i, dir) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === cur && slides[cur].classList.contains('active')) return;
    dir = dir || (i > cur ? 1 : -1);
    var old = slides[cur], nx = slides[i];

    // 旧页：先卸下 active，但保留显示以便播放退场动画
    old.classList.remove('active', 'enter-fwd', 'enter-back', 'exit-fwd', 'exit-back');
    void old.offsetWidth;
    old.classList.add(dir > 0 ? 'exit-fwd' : 'exit-back');
    clearTimeout(exitTimer);
    var leaving = old;
    exitTimer = setTimeout(function () {
      leaving.classList.remove('exit-fwd', 'exit-back');
    }, 460);

    // 新页：同时推入
    nx.classList.remove('enter-fwd', 'enter-back', 'exit-fwd', 'exit-back');
    void nx.offsetWidth;
    nx.classList.add('active', dir > 0 ? 'enter-fwd' : 'enter-back');
    cur = i;
    // 后退进入某页时，直接把该页全部内容显示出来，避免来回翻页要重讲
    if (dir < 0) revealAll(nx); else resetSteps(nx);
    afterChange();
  }
  /* 下一步：优先推进页内分步；没有分步可推进时才翻页 */
  function advance() {
    var sl = slides[cur];
    if (sl.getAttribute('data-kicker') === 'GAME' && window.Game && window.Game.isPlaying()) return;
    if (revealNext()) return;
    if (cur < total - 1) show(cur + 1, 1);
  }
  function back() {
    if (cur > 0) show(cur - 1, -1);
  }
  function next() { advance(); }
  function prev() { back(); }

  function afterChange() {
    pNow.textContent = cur + 1;
    prog.style.width = (cur / (total - 1) * 100) + '%';
    var t = slides[cur].dataset.title || '';
    barTitle.textContent = t ? t + ' · 国庆假期安全教育' : '国庆假期安全教育';
    if (slides[cur].dataset.kicker) barTitle.textContent = '国庆假期安全教育 / ' + slides[cur].dataset.kicker;
    // 同步缩略图高亮
    Array.prototype.forEach.call(ovGrid.children, function (c, k) {
      c.classList.toggle('on', k === cur);
    });
    // 通知游戏层
    if (slides[cur].getAttribute('data-kicker') === 'GAME' && window.Game) window.Game.start();
  }

  /* ---------------- 控制条按钮 ---------------- */
  document.getElementById('bPrev').addEventListener('click', prev);
  document.getElementById('bNext').addEventListener('click', next);

  document.getElementById('bFs').addEventListener('click', function () {
    var d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      var e = d.documentElement;
      (e.requestFullscreen || e.webkitRequestFullscreen || function () {}).call(e);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
    }
    setTimeout(fit, 260);
  });

  /* ---------------- 目录页 / 任意 data-go 跳转 ---------------- */
  stage.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-go]') : null;
    if (!t) return;
    var k = parseInt(t.getAttribute('data-go'), 10) - 1;
    if (!isNaN(k)) show(k, k > cur ? 1 : -1);
  });

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    var inGame = slides[cur].getAttribute('data-kicker') === 'GAME';
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); advance(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); back(); }
    else if (k === ' ' || k === 'Enter') {
      // 游戏页：空格交给游戏自己推进（点对话框/继续按钮等价）
      if (inGame) {
        e.preventDefault();
        if (window.Game && window.Game.advance) window.Game.advance();
        return;
      }
      e.preventDefault(); advance();
    }
    else if (k === 'a' || k === 'A') { e.preventDefault(); revealAll(slides[cur]); }
    else if (k === 'Home') { e.preventDefault(); show(0, -1); }
    else if (k === 'End') { e.preventDefault(); show(total - 1, 1); }
    else if (k === 'o' || k === 'O') { e.preventDefault(); toggleOv(); }
    else if (k === 'Escape') { ovWrap.classList.remove('show'); }
    else if (k === 'f' || k === 'F') {
      e.preventDefault();
      document.getElementById('bFs').click();
    }
    else if (k === 'h' || k === 'H') { bar.classList.toggle('hide'); }
  });

  /* ---------------- 触屏滑动 ---------------- */
  var sx = 0, sy = 0, st0 = 0, track = false;
  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    if (slides[cur].getAttribute('data-kicker') === 'GAME' && window.Game && window.Game.isPlaying()) return;
    track = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st0 = Date.now();
  }, { passive: true });
  viewport.addEventListener('touchend', function (e) {
    if (!track) return; track = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st0;
    if (dt > 800) return;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) advance(); else back();
    }
  }, { passive: true });

  /* ---------------- 缩略图总览 ---------------- */
  slides.forEach(function (s, i) {
    var d = document.createElement('div');
    d.className = 'ov' + (s.getAttribute('data-kicker') === 'GAME' ? ' game' : '');
    var h2 = s.querySelector('h1,h2');
    var lead = s.querySelector('.lead') || s.querySelector('.sub') || s.querySelector('.band p');
    d.innerHTML =
      '<div class="p">' +
        '<div class="k">' + (s.getAttribute('data-kicker') || '') + '</div>' +
        '<div class="t">' + (s.dataset.title || '') + '</div>' +
        '<div class="l">' + (h2 ? h2.textContent.trim().slice(0, 26) : (lead ? lead.textContent.trim().slice(0, 30) : '')) + '</div>' +
      '</div>' +
      '<div class="mark">' + (i + 1) + '</div>' +
      '<div class="foot">' + (i + 1) + ' / ' + total + '</div>';
    d.addEventListener('click', function () {
      show(i, i > cur ? 1 : -1);
      ovWrap.classList.remove('show');
    });
    ovGrid.appendChild(d);
  });

  function toggleOv() {
    ovWrap.classList.toggle('show');
    afterChange();
  }
  document.getElementById('bOv').addEventListener('click', toggleOv);
  ovWrap.addEventListener('click', function (e) { if (e.target === ovWrap) ovWrap.classList.remove('show'); });

  /* ---------------- 提示 ---------------- */
  var hintTimer;
  function toast(msg) {
    hint.textContent = msg;
    hint.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.remove('show'); }, 1500);
  }

  /* ---------------- 对外接口 ---------------- */
  window.Deck = {
    go: show,
    next: advance,          // 优先推进页内分步，再翻页
    prev: back,
    jump: show,             // 强制翻页（忽略分步）
    revealAll: function () { revealAll(slides[cur]); },
    index: function () { return cur; },
    total: total,
    toast: toast
  };

  /* ---------------- 启动 ---------------- */
  afterChange();
  resetSteps(slides[0]);

  // 支持用 #9 / ?p=9 直接打开第 9 页（便于存档、投影、截图）
  var m = /(?:#|\?p=)(\d+)/.exec(location.search + location.hash);
  if (m) {
    var k = parseInt(m[1], 10) - 1;
    if (!isNaN(k) && k > 0 && k < total) show(k, 1);
  }

  toast('空格 = 下一步（先出内容，再翻页） · ← → 翻页 · O 总览 · F 全屏');
})();
