// Gagana: a Gagana Sāmoa practice app. Everything runs in the page; progress stays in this browser (localStorage).
// The ideas borrowed from the big language apps (never their names, art or words): a path of short lessons, cards that
// come back just before you'd forget them (SM-2 style spaced repetition), typing the answer rather than only picking it,
// a daily streak and points. Made for Samoan: macrons and the ʻokina change meaning, so a missing one counts as "almost"
// and shows the right spelling; ā ē ī ō ū ʻ keys sit under every answer box.
(function () {
  var FILES = ['lessons', 'course', 'journey', 'dictionary', 'sentences'];
  Promise.all(FILES.map(function (f) { return fetch('data/' + f + '.json').then(function (r) { if (!r.ok) throw new Error(f + '.json: ' + r.status); return r.json(); }); }))
    .then(function (all) { var D = {}; FILES.forEach(function (f, i) { D[f] = all[i]; }); app(D); })
    .catch(function (e) {
      var v = document.getElementById('ts-view');
      v.textContent = 'The lessons didn’t load (' + e.message + '). Open this folder through a web server, for example: python3 -m http.server';
    });
})();

function app(DATA) {
  // the lessons: the Peace Corps handbook's (n "pc-NN", public domain) and the ones written for this project (n "g-...")
  var LESSONS = DATA.lessons || [];
  var DICT = (DATA.dictionary || []).map(function (w) { return { sm: w.sm, en: w.en, kind: w.kind, src: 'Wiktionary' }; });
  var SENT = DATA.sentences || [];
  // the journey (Malaga): each stop is also a little lesson (n "j-<id>") so its words join the cards
  var J = DATA.journey || {}, STOPS = (J && J.stops) || [];
  var JL = STOPS.map(function (s) { return { n: 'j-' + s.id, title: s.title, words: s.words, stop: s, journey: true }; });
  var short = function (L) { return L.node && !L.journey ? 'Lesona ' + L.node.num + ' · ' + L.node.src : L.journey ? 'Malaga' : L.title; };
  var view = document.getElementById('ts-view');

  // ---------- helpers ----------
  function h(tag, attrs) {
    var e = document.createElement(tag); attrs = attrs || {};
    for (var k in attrs) { var v = attrs[k]; if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else if (k === 'on') { for (var ev in v) e.addEventListener(ev, v[ev]); } else e.setAttribute(k, v === true ? '' : v); }
    // lists inside lists too: a lesson's examples are pairs of lines, which used to print as "[object HTMLParagraphElement]"
    (function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.append(c.nodeType ? c : document.createTextNode(String(c))); })([].slice.call(arguments, 2));
    return e;
  }
  // replaceChildren prints a null as the word "null" (a lesson without a culture note showed it): drop empties first
  function fill(el) { var kids = []; (function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); kids.push(c); })([].slice.call(arguments, 1)); el.replaceChildren.apply(el, kids); }
  // Enter or Space on something drawn as a button (role=button) presses it, as on a real button
  function pressKey(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); } }
  var okina = function (s) { return String(s || '').replace(/['‘’`ʼ]/g, 'ʻ'); };
  var key = function (sm) { return okina(sm).normalize('NFC').toLowerCase().replace(/[.,!?;:"“”()]/g, '').replace(/\s+/g, ' ').trim(); };
  var bare = function (s) { return key(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ʻ/g, ''); };   // no macrons, no ʻokina
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var DAY = 864e5;

  // ---------- progress (in this browser only) ----------
  var STORE = 'gagana-samoa-v1';
  var P = load();
  function load() { try { var v = JSON.parse(localStorage.getItem(STORE) || 'null'); if (v && v.cards) return v; } catch (e) {} return { cards: {}, days: [], xp: {}, seen: {}, at: 0 }; }
  function save() {
    P.at = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) {}
  }
  function streak() { var d = new Date(), n = 0; if (P.days.indexOf(today()) < 0) d.setDate(d.getDate() - 1); for (;;) { var s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (P.days.indexOf(s) < 0) break; n++; d.setDate(d.getDate() - 1); } return n; }
  function drawStats() { document.getElementById('ts-streak').textContent = '🔥 ' + streak(); document.getElementById('ts-xp').textContent = '⭐ ' + (P.xp[today()] || 0); document.getElementById('ts-fl').textContent = '🌺 ' + ((P.j && P.j.fl) || 0);
    // today's bubbles, as a ring that fills
    var gl = document.getElementById('ts-goal'); if (gl && P.g !== undefined && typeof G0 === 'function') { var goal = G0().goal || 2, n = Math.min(goal, todayN()), C = 2 * Math.PI * 7; gl.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="#5b4532" stroke-width="3"/><circle cx="9" cy="9" r="7" fill="none" stroke="#f2c14e" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + (C * n / goal).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>'; gl.append(n + '/' + goal + ' today'); } }
  // Spaced repetition, SM-2 style: a right answer stretches the gap (1 day, 3 days, then × ease); a miss brings it back in
  // ten minutes and lowers the ease; "almost" (a macron or ʻokina off) keeps the gap and the ease.
  function card(k) { return P.cards[k] || (P.cards[k] = { ease: 2.5, ivl: 0, due: 0, reps: 0, miss: 0 }); }
  function grade(k, g) {
    var c = card(k), now = Date.now();
    if (g === 'right') { c.reps++; c.ivl = c.ivl < 1 ? 1 : c.ivl < 3 ? 3 : Math.round(c.ivl * c.ease); c.ease = Math.round(Math.min(3, c.ease + .05) * 100) / 100; }
    else if (g === 'almost') { c.ivl = Math.max(c.ivl, 1); }
    else { c.miss++; c.ease = Math.round(Math.max(1.3, c.ease - .2) * 100) / 100; c.ivl = 0; }
    c.due = g === 'wrong' ? now + 10 * 6e4 : now + c.ivl * DAY;
    if (P.days.indexOf(today()) < 0) P.days.push(today());
    if (g !== 'wrong') P.xp[today()] = (P.xp[today()] || 0) + (g === 'right' ? 10 : 5);
    save();
  }
  var learned = function (k) { var c = P.cards[k]; return !!(c && c.reps >= 2 && c.ivl >= 3); };
  // a card seen but never asked (due 0: a journey stop's words the check didn't reach) is due now; it used to never come up
  var isDue = function (c, now) { return !!c && (c.due || 0) <= now; };
  var dueNow = function () { var now = Date.now(); return Object.keys(P.cards).filter(function (k) { return isDue(P.cards[k], now); }); };

  // the cards: every word and phrase, by its Samoan
  var ITEMS = {};
  function index() {
    ITEMS = {};
    LESSONS.concat(JL).forEach(function (L) {
      (L.words || []).concat(L.phrases || []).forEach(function (w) { var k = key(w.sm); if (!k || ITEMS[k]) return; ITEMS[k] = { k: k, sm: w.sm, en: w.en, lesson: L.n, note: w.note || '' }; });
    });
    // words added from the dictionary and the sentences, once they're in review
    DICT.concat(SENT.map(function (x) { return { sm: x.sm, en: x.en, src: 'Tatoeba', sentence: true }; })).forEach(function (w) { var k = key(w.sm); if (k && !ITEMS[k] && P.cards[k]) ITEMS[k] = { k: k, sm: w.sm, en: w.en, lesson: w.sentence ? 'sent' : 'dict', note: '' }; });
  }
  var itemsOf = function (L) { var seen = {}; return (L.words || []).concat(L.phrases || []).map(function (w) { return ITEMS[key(w.sm)]; }).filter(function (x) { if (!x || seen[x.k]) return false; seen[x.k] = 1; return true; }); };

  // ---------- sound ----------
  // This version ships no recordings, so nothing plays and no play buttons are drawn. play() and playBtn() stay as the
  // one place to add sound later.
  function play() { return false; }
  function playBtn() { return null; }

  // ---------- home ----------
  var again = null;   // the view currently drawn as a tab (null inside a lesson or a stop)
  function tab(t) { again = null; tab2(t); }
  function tab2(t) { view.classList.remove('is-map'); [].forEach.call(document.querySelectorAll('#ts-tabs [data-tab]'), function (b) { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
  document.getElementById('ts-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; ({ play: qpHome, map: function () { gameMap(); }, cards: fcView, list: listView, dict: dictView, sent: sentView, you: youView, more: moreView })[b.dataset.tab](); });
  var plainMatch = function (s) { return bare(s).replace(/[^a-z0-9 ]/g, ''); };
  // ---------- the dictionary: every lesson word and Wiktionary entry ----------
  function dictView(q) {
    tab('dict'); drawStats(); window.scrollTo(0, 0);
    var all = [], seen = {};
    LESSONS.concat(JL).forEach(function (L) { (L.words || []).concat(L.phrases || []).forEach(function (w) { var k = key(w.sm) + '|' + String(w.en).toLowerCase(); if (seen[k]) return; seen[k] = 1; all.push({ sm: w.sm, en: w.en, tag: short(L), L: L }); }); });
    DICT.forEach(function (w) { var k = key(w.sm) + '|' + String(w.en).toLowerCase(); if (seen[k]) return; seen[k] = 1; all.push({ sm: w.sm, en: w.en, tag: 'Wiktionary' }); });
    var inp = h('input', { class: 'ts-search', type: 'search', placeholder: 'Search Samoan or English', lang: 'sm', autocomplete: 'off', 'aria-label': 'Search the dictionary' });
    var list = h('ul', { class: 'ts-words ts-res' }), count = h('p', { class: 'ts-lede' });
    function draw() {
      var t = plainMatch(inp.value).trim(), hits = !t ? [] : all.filter(function (w) { return plainMatch(w.sm).indexOf(t) >= 0 || String(w.en).toLowerCase().indexOf(inp.value.trim().toLowerCase()) >= 0; });
      hits.sort(function (a, b) { var ea = plainMatch(a.sm) === t ? 0 : plainMatch(a.sm).indexOf(t) === 0 ? 1 : 2, eb = plainMatch(b.sm) === t ? 0 : plainMatch(b.sm).indexOf(t) === 0 ? 1 : 2; return ea - eb || a.sm.length - b.sm.length; });
      count.textContent = t ? hits.length + (hits.length === 1 ? ' word' : ' words') : all.length + ' words and phrases: the lessons and Wiktionary.';
      fill(list, hits.slice(0, 80).map(function (w) {
        var k = key(w.sm), inRev = !!P.cards[k];
        var add = h('button', { type: 'button', class: 'ts-link', on: { click: function () { if (!ITEMS[k]) ITEMS[k] = { k: k, sm: w.sm, en: w.en, lesson: 'dict', note: '' }; card(k).due = Date.now(); save(); add.replaceWith(h('span', { class: 'ts-tag', text: 'In review' })); } } }, 'Review it');
        return h('li', null, playBtn(w.sm), h('span', { class: 'ts-mid' }, h('span', { class: 'ts-sm', lang: 'sm', text: w.sm }), h('small', { text: w.en })),
          h('span', { style: 'display:grid;gap:.3rem;justify-items:end' }, w.L ? h('button', { type: 'button', class: 'ts-tag', style: 'border:0;cursor:pointer', on: { click: function () { w.L.journey ? stopView(w.L.stop) : lesson(w.L); } } }, w.tag) : h('span', { class: 'ts-tag', text: w.tag }), inRev ? h('span', { class: 'ts-tag', text: 'In review' }) : add));
      }));
    }
    inp.addEventListener('input', draw);
    fill(view, inp, keys(function () { return inp; }), count, list,
      h('p', { class: 'ts-credit', text: 'Wiktionary entries: Wiktionary contributors (CC BY-SA 4.0), through kaikki.org. Their spelling is as entered there.' }));
    if (q) inp.value = q; draw(); inp.focus();
  }
  // ---------- sentences (Tatoeba) ----------
  function sentView() {
    tab('sent'); drawStats(); window.scrollTo(0, 0);
    var list = h('ul', { class: 'ts-sents' }, SENT.map(function (x) { var li = h('li', { on: { click: function () { li.classList.toggle('is-open'); play(x.sm); } } }, playBtn(x.sm), h('span', null, h('span', { lang: 'sm', text: x.sm }), h('span', { class: 'ts-en', text: x.en }))); return li; }));
    fill(view, h('p', { class: 'ts-lede', text: 'Everyday sentences people have added to Tatoeba, with their English. Tap one to see what it means.' }),
      h('div', { class: 'ts-stats', style: 'margin:0 0 1rem' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { session('sent'); } } }, 'Practice sentences')),
      list, h('p', { class: 'ts-credit', text: 'Sentences from Tatoeba (tatoeba.org), CC BY 2.0 FR. Some are written without macrons or the ʻokina, as their writers entered them.' }));
  }
  // ---------- more to explore ----------
  function moreView() {
    tab('more'); drawStats(); window.scrollTo(0, 0);
    var R = [
      ['Victoria University of Wellington: Sāmoan', 'https://www.wgtn.ac.nz/slc/language-learning-resources/practise-online/samoan', 'Audiobooks in Sāmoan and dual-language children’s books.'],
      ['Gagana Samoa mo Pisikoa (Peace Corps, 1991)', 'https://archive.org/details/ERIC_ED402740', 'The Peace Corps handbook behind this app’s Peace Corps lessons: 48 lessons of everyday village Samoan. Free, public domain.'],
      ['Peace Corps Samoan Language (J. F. Mayer)', 'https://www.livelingua.com/course/peace-corps/Samoan_Language_Lessons', 'The 1970s Peace Corps course, with grammar and glossaries. Free, public domain.'],
      ['Pratt’s Grammar and Dictionary (1893)', 'https://archive.org/details/agrammaranddict00pratgoog', 'Over 12,000 words with old examples and sayings, from the 1800s. Old spelling: no macrons or ʻokina.'],
      ['Wiktionary: Samoan', 'https://en.wiktionary.org/wiki/Category:Samoan_lemmas', 'The dictionary behind the Wiktionary words here. Anyone can add to it.'],
      ['Tatoeba: Samoan sentences', 'https://tatoeba.org/en/sentences/show_all_in/smo/none', 'Where the sentences here come from. You can add your own Samoan sentences and translations.'],
      ['Digital Dialects: Samoan', 'https://www.digitaldialects.com/Samoan.htm', 'Short games for numbers, colors, phrases and more, some with sound.'],
      ['Asalei', 'https://www.asalei.app/learn-samoan', 'A learning app for Pacific languages with native-speaker audio; the beginner course is free.'],
      ['Gagana Faʻaaloalo Sāmoa (Pasefika)', 'https://pasefika.com/Language/Article/29/sa/S%C4%81moan-respectful-language', 'The respect words: what to say to a chief, an orator, a minister, and why.'],
      ['Samoan Language Resources: Speaking Respectfully', 'https://samoan.ws/07-respect', 'A plain guide to respect speech, with a long vocabulary list behind it.'],
      ['Te Papa: Sāmoan Language Week', 'https://www.tepapa.govt.nz/learn/for-educators/teaching-resources/samoan-language-week-resource', 'From New Zealand’s national museum and the Ministry for Pacific Peoples: stories, word games and activities for Vaiaso o le Gagana Sāmoa.'],
      ['Te Ara: Samoans in New Zealand', 'https://teara.govt.nz/en/samoans/page-3', 'Faʻasāmoa explained: the ʻāiga, the matai, the church, and how they carried over to Aotearoa.'],
      ['Pacific Learners', 'https://pacificlearners.co.nz/portfolio-item/learn-samoan/', 'Free short videos of Samoan words and phrases.'],
      ['Gagana-Samoa.com', 'https://gagana-samoa.com/', 'A Samoan-English dictionary and lessons, some with audio.'],
    ];
    fill(view, h('p', { class: 'ts-lede', text: 'Free places to keep going.' }),
      h('ul', { class: 'ts-more' }, R.map(function (r) { return h('li', null, h('a', { href: r[1], target: '_blank', rel: 'noopener', text: r[0] }), h('small', { text: r[2] })); })), credit());
  }
  function home() { listView(); }
  function credit() {
    return h('p', { class: 'ts-credit' }, 'The Peace Corps lessons come from the Peace Corps’s free handbooks (', h('em', { text: 'Gagana Samoa mo Pisikoa' }), ', 1991, and J. F. Mayer’s course, 1975), works of the United States government in the public domain. The other lessons, the dialogues, the practice and the journey’s stories were written for this project. The dictionary adds Wiktionary’s Samoan words (CC BY-SA 4.0) and the sentences come from Tatoeba (CC BY 2.0 FR).');
  }
  // ā ē ī ō ū ʻ, put in at the cursor
  function keys(target) {
    return h('div', { class: 'ts-keys', 'aria-label': 'Samoan letters' }, ['ā', 'ē', 'ī', 'ō', 'ū', 'ʻ'].map(function (ch) {
      return h('button', { type: 'button', 'aria-label': ch === 'ʻ' ? 'ʻokina' : ch, on: { mousedown: function (e) { e.preventDefault(); }, click: function () {
        var i = target(); if (!i) return; var a = i.selectionStart == null ? i.value.length : i.selectionStart, b = i.selectionEnd == null ? a : i.selectionEnd;
        i.value = i.value.slice(0, a) + ch + i.value.slice(b); i.focus(); i.setSelectionRange(a + 1, a + 1); i.dispatchEvent(new Event('input'));
      } } }, ch);
    }));
  }

  // ---------- a lesson ----------
  function lesson(L) {
    again = null; tab2(L.node ? 'list' : 'list'); window.scrollTo(0, 0);
    var it = itemsOf(L);
    var dlg = null;
    if (L.dialogue && L.dialogue.lines && L.dialogue.lines.length) {
      var dlgs = [L.dialogue].concat(L.more || []);
      dlg = dlgs.map(function (D) {
        var box = h('div', { class: 'ts-dlg hide-en' }, (D.lines || []).map(function (ln) {
          var b = h('div', { class: 'ts-bubble', role: 'button', tabindex: '0', title: 'Show the English', on: { click: function () { b.classList.toggle('is-open'); play(ln.sm); }, keydown: pressKey } }, h('span', { lang: 'sm', text: ln.sm }), h('span', { class: 'ts-en', text: ln.en }));
          return h('div', { class: 'ts-line' }, h('span', { class: 'ts-who', text: ln.who }), b);
        }));
        var tg = h('button', { type: 'button', class: 'ts-link', on: { click: function () { var on = box.classList.toggle('hide-en'); tg.textContent = on ? 'Show the English' : 'Hide the English'; } } }, 'Show the English');
        return h('div', { class: 'ts-sec' }, h('h2', { text: D.title || 'Talanoaga' }), box, h('p', null, tg));
      });
    }
    fill(view, 
      h('p', { class: 'ts-back' }, h('button', { type: 'button', class: 'ts-link', on: { click: function () { L.node ? gameMap() : listView(); } } }, L.node ? '← The map' : '← Lesonas')),
      h('p', { class: 'ts-kicker', text: short(L) }),
      h('h2', { text: L.title, style: 'font-size:2rem;margin:.2rem 0 .6rem' }),
      h('p', { class: 'ts-lede', text: L.summary || '' }),
      it.length ? h('div', { class: 'ts-sec' }, h('h2', { text: 'Words and phrases' }), h('ul', { class: 'ts-words' }, it.map(function (x) {
        return h('li', null, playBtn(x.sm), h('span', null, h('span', { class: 'ts-sm', lang: 'sm', text: x.sm }), h('small', { text: x.en + (x.note ? ' · ' + x.note : '') })));
      }))) : null,
      (L.notes || []).length ? h('div', { class: 'ts-sec' }, h('h2', { text: 'How it works' }), L.notes.map(function (n) {
        return h('div', { class: 'ts-note' }, h('p', { style: 'margin:0', text: n.point }), (n.examples || []).length ? h('div', { class: 'ts-ex' }, n.examples.map(function (x) { return [h('p', { lang: 'sm', text: x.sm }), h('p', { class: 'ts-en', text: x.en })]; })) : null);
      })) : null,
      dlg ? h('div', null, dlg) : null,
      L.culture ? h('div', { class: 'ts-sec' }, h('h2', { text: 'Faʻa-Samoa' }), h('p', { class: 'ts-lede', text: L.culture })) : null,
      (it.length || (L.practice || []).length) ? h('div', { class: 'ts-sticky' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { session(L); } } }, 'Practice this lesson')) : null);
  }

  // ---------- practice ----------
  // A session: up to 5 new words (shown first, then asked), cards due from this lesson, then the lesson's own items;
  // a review session: what's due everywhere, up to 20.
  function session(L) {
    var qs = [], now = Date.now();
    if (L === 'sent') { shuffle(SENT).slice(0, 10).forEach(function (x) { var k = key(x.sm); if (!ITEMS[k]) ITEMS[k] = { k: k, sm: x.sm, en: x.en, lesson: 'sent', note: '' }; qs.push(x.sm.split(/\s+/).length <= 9 ? { kind: 'build', x: ITEMS[k] } : { kind: 'pick', x: ITEMS[k] }); }); }
    else if (L === 'review') dueNow().map(function (k) { return ITEMS[k]; }).filter(Boolean).slice(0, 20).forEach(function (x) { qs.push(ask(x)); });
    else {
      var it = itemsOf(L), fresh = it.filter(function (x) { return !P.cards[x.k]; }).slice(0, 5), due = it.filter(function (x) { var c = P.cards[x.k]; return c && c.due <= now; }).slice(0, 6);
      fresh.forEach(function (x) { qs.push({ kind: 'new', x: x }); qs.push({ kind: 'pick', x: x }); });
      due.forEach(function (x) { qs.push(ask(x)); });
      fresh.forEach(function (x) { qs.push({ kind: 'type', x: x }); });
      shuffle(L.practice || []).slice(0, 5).forEach(function (p) { qs.push({ kind: 'item', p: p }); });
      if (qs.length < 6) it.filter(function (x) { return P.cards[x.k]; }).slice(0, 6 - qs.length).forEach(function (x) { qs.push(ask(x)); });
    }
    if (!qs.length) { gameMap(); return; }
    run(qs, L, L && L.node && !L.journey ? function (r, t) { clearView(L, r, t); } : null);
  }
  function ask(x) { var r = Math.random(), c = P.cards[x.k]; return (c && c.reps >= 1 && r < .65) ? { kind: 'type', x: x } : { kind: 'pick', x: x }; }
  function distractors(x, field, n) {
    var pool = Object.values(ITEMS).filter(function (y) { return y.k !== x.k && y[field] !== x[field]; });
    var same = pool.filter(function (y) { return y.lesson === x.lesson; });
    return shuffle(same).concat(shuffle(pool)).filter(function (y, i, a) { return a.findIndex(function (z) { return z[field] === y[field]; }) === i; }).slice(0, n);
  }
  function run(qs, L, onEnd) {
    again = null; view.classList.remove('is-map');
    var i = 0, right = 0, total = 0;
    var bar = h('div', { class: 'ts-bar' }, h('i', { style: 'width:0%' })), box = h('div', { class: 'ts-q', 'aria-live': 'polite' });
    fill(view, h('p', { class: 'ts-back' }, h('button', { type: 'button', class: 'ts-link', on: { click: function () { keyChoose = null; L === 'sent' ? sentView() : L === 'review' ? fcView() : L.journey || L.node || L.world ? gameMap() : lesson(L); } } }, '← Stop')), bar, box);
    function next() {
      bar.firstChild.style.width = (100 * i / qs.length) + '%';
      if (i >= qs.length) return finish();
      var q = qs[i++]; window.scrollTo(0, 0);
      if (q.kind === 'new') showNew(q); else if (q.kind === 'build') build(q); else if (q.kind === 'pick') pick(q); else if (q.kind === 'type') type(q); else item(q);
    }
    function feedback(g, answer, extra) {
      total++; if (g !== 'wrong') right++;
      var fb = h('div', { class: 'ts-fb is-' + g }, h('strong', { text: g === 'right' ? 'Right!' : g === 'almost' ? 'Almost. Watch the spelling:' : 'Not quite. It’s:' }), g !== 'right' || extra ? h('span', { lang: 'sm', text: answer }) : null, extra ? h('span', { class: 'ts-en', text: extra }) : null);
      var go = h('button', { type: 'button', class: 'ts-btn', on: { click: next } }, 'Continue');
      box.append(fb, h('div', null, go)); go.focus();
    }
    function showNew(q) {
      var x = q.x; play(x.sm);
      fill(box, h('p', { class: 'ts-kicker', text: 'New' }), h('div', { class: 'ts-new' }, playBtn(x.sm), h('p', { class: 'ts-prompt', lang: 'sm', text: x.sm }), h('p', { class: 'ts-lede', text: x.en }), x.note ? h('small', { text: x.note }) : null),
        h('div', null, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { card(x.k); save(); next(); } } }, 'Got it')));
      box.querySelector('.ts-btn').focus();
    }
    function choices(prompt, isEn, kicker, opts, correct, onDone) {
      var done = false;
      var list = h('div', { class: 'ts-opts' }, opts.map(function (o, j) {
        return h('button', { type: 'button', class: 'ts-opt', lang: isEn ? 'sm' : null, on: { click: function () {
          if (done) return; done = true;
          var ok = j === correct; this.classList.add(ok ? 'is-right' : 'is-wrong'); if (!ok) list.children[correct].classList.add('is-right');
          onDone(ok);
        } } }, h('kbd', { text: j + 1 }), o);
      }));
      fill(box, h('p', { class: 'ts-kicker', text: kicker }), prompt, list);
      keyChoose = function (n) { if (!done && list.isConnected && list.children[n]) list.children[n].click(); };   // never a question no longer on screen
    }
    function pick(q) {
      var x = q.x, toEn = Math.random() < .6 || !P.cards[x.k] || !P.cards[x.k].reps;
      var others = distractors(x, toEn ? 'en' : 'sm', 3), opts = shuffle([x].concat(others)), c = opts.indexOf(x);
      choices(toEn ? h('p', { class: 'ts-prompt', lang: 'sm', text: x.sm }) : h('p', { class: 'ts-prompt is-en', text: x.en }), !toEn, toEn ? 'What does it mean?' : 'Which is it in Samoan?',
        opts.map(function (o) { return toEn ? o.en : o.sm; }), c, function (ok) { if (toEn) play(x.sm); grade(x.k, ok ? 'right' : 'wrong'); feedback(ok ? 'right' : 'wrong', x.sm, x.en); });
    }
    function check(given, want) { var a = key(given), b = key(want); if (a === b) return 'right'; if (bare(a) === bare(b)) return 'almost'; return 'wrong'; }
    function typeBox(kicker, prompt, want, onDone, extra) {
      var inp = h('input', { type: 'text', lang: 'sm', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer' });
      var done = false;
      var f = h('form', { class: 'ts-type', on: { submit: function (e) { e.preventDefault(); if (done || !inp.value.trim()) return; done = true; inp.value = okina(inp.value); inp.disabled = true; var g = check(inp.value, want); onDone(g); feedback(g, want, extra); } } },
        inp, keys(function () { return inp; }), h('p', null, h('button', { type: 'submit', class: 'ts-btn' }, 'Check'), ' ', h('button', { type: 'button', class: 'ts-link', on: { click: function () { if (done) return; done = true; inp.disabled = true; onDone('wrong'); feedback('wrong', want, extra); } } }, 'I don’t know')));
      fill(box, h('p', { class: 'ts-kicker', text: kicker }), prompt, f); inp.focus();
      keyChoose = null;
    }
    // Build the sentence from word tiles (its own words, shuffled, plus two from other sentences)
    function build(q) {
      var x = q.x, words = x.sm.split(/\s+/), extra = shuffle(SENT.filter(function (y) { return y.sm !== x.sm; }).map(function (y) { return y.sm.split(/\s+/); }).reduce(function (a, b) { return a.concat(b); }, [])).filter(function (w) { return words.indexOf(w) < 0; }).slice(0, 2);
      var tiles = shuffle(words.concat(extra)), picked = [], done = false;
      var line = h('div', { class: 'ts-tiles', 'aria-label': 'Your sentence' }), bank = h('div', { class: 'ts-keys' });
      function redraw() { fill(line, picked.map(function (t, j) { return h('button', { type: 'button', class: 'ts-tile', lang: 'sm', on: { click: function () { if (done) return; picked.splice(j, 1); bank.children[t.i].classList.remove('is-used'); redraw(); } } }, t.w); })); }
      tiles.forEach(function (w, i) { bank.append(h('button', { type: 'button', class: 'ts-tile', lang: 'sm', on: { click: function () { if (done || this.classList.contains('is-used')) return; this.classList.add('is-used'); picked.push({ w: w, i: i }); redraw(); } } }, w)); });
      var go = h('button', { type: 'button', class: 'ts-btn', on: { click: function () { if (done || !picked.length) return; done = true; var g = check(picked.map(function (t) { return t.w; }).join(' '), x.sm); grade(x.k, g); play(x.sm); feedback(g, x.sm, x.en); } } }, 'Check');
      fill(box, h('p', { class: 'ts-kicker', text: 'Build it in Samoan' }), h('p', { class: 'ts-prompt is-en', text: x.en }), line, bank, h('div', null, go));
      keyChoose = null;
    }
    function type(q) { var x = q.x; typeBox('Write it in Samoan', h('p', { class: 'ts-prompt is-en', text: x.en }), x.sm, function (g) { play(x.sm); grade(x.k, g); }, x.en); }
    function item(q) {
      var p = q.p;
      if (p.type === 'choose' && Array.isArray(p.options)) { choices(h('p', { class: 'ts-prompt is-en', text: p.q }), true, 'Choose', p.options, +p.answer || 0, function (ok) { feedback(ok ? 'right' : 'wrong', p.options[+p.answer || 0]); if (ok) { P.xp[today()] = (P.xp[today()] || 0) + 10; if (P.days.indexOf(today()) < 0) P.days.push(today()); save(); } }); return; }
      if (p.type === 'fill') { typeBox('Fill in the gap', h('div', null, h('p', { class: 'ts-prompt', lang: 'sm', text: p.sm }), h('p', { class: 'ts-lede', text: p.en || '' })), p.answer, function (g) { if (g !== 'wrong') { P.xp[today()] = (P.xp[today()] || 0) + 10; if (P.days.indexOf(today()) < 0) P.days.push(today()); save(); } }, p.sm.replace('___', p.answer)); return; }
      typeBox('Say it in Samoan', h('p', { class: 'ts-prompt is-en', text: p.en }), p.sm, function (g) { if (g !== 'wrong') { P.xp[today()] = (P.xp[today()] || 0) + 10; if (P.days.indexOf(today()) < 0) P.days.push(today()); save(); } });
    }
    function finish() {
      if (onEnd) { keyChoose = null; return onEnd(right, total); }
      drawStats(); bar.firstChild.style.width = '100%'; keyChoose = null;
      fill(box, h('div', { class: 'ts-done' }, h('b', { text: total ? Math.round(100 * right / total) + '%' : '✓' }), h('p', { class: 'ts-lede', text: right + ' of ' + total + ' right. ⭐ ' + (P.xp[today()] || 0) + ' today, 🔥 ' + streak() + (streak() === 1 ? ' day' : ' days') + ' in a row.' }),
        h('div', { class: 'ts-stats' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { L === 'review' ? session('review') : session(L); } } }, 'Keep going'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { L === 'sent' ? sentView() : L === 'review' ? fcView() : gameMap(); } } }, L === 'sent' ? 'Sentences' : L === 'review' ? 'Flashcards' : 'The map'))));
    }
    next();
  }
  var keyChoose = null;
  document.addEventListener('keydown', function (e) { if (keyChoose && /^[1-4]$/.test(e.key) && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) keyChoose(+e.key - 1); });

  // ---------- Malaga: the journey ----------
  // P.j = { name, done: { id: { day, fl, of } }, fl (flowers in all), newDay (the day a new stop was last finished), hideEn }
  function J0() { if (!P.j) P.j = { name: '', done: {}, fl: 0, newDay: '' }; return P.j; }
  var me = function () { return (J0().name || 'Pele'); };
  var fillMe = function (t) { return String(t || '').replace(/\{me\}/g, me()); };
  var FACES = { 'Nana Losa': '👵🏽', 'Sina': '🧑🏽', 'Mere': '👩🏽', 'The faletua': '👩🏽' };
  STOPS.forEach(function (s) { if (!FACES[s.host.name]) FACES[s.host.name] = s.host.face; });
  var host = function (s) { return s.host.name.replace(/^The /, 'the '); };   // "with the orator", mid-sentence
  var nextIdx = function () { var d = J0().done, i = STOPS.findIndex(function (s) { return !d[s.id]; }); return i < 0 ? STOPS.length : i; };

  // keepsake pictures: an emoji, or one of a few drawings
  var KEEP_SVG = {
    mat: '<svg viewBox="0 0 40 40"><rect x="4" y="9" width="32" height="22" rx="2" fill="#d9b779"/><path d="M4 14h32M4 19h32M4 24h32M9 9v22M15 9v22M21 9v22M27 9v22M33 9v22" stroke="#b08d4f" stroke-width="1"/><path d="M4 31l-1 4M8 31l-1 4M12 31l-1 4M16 31l-1 4M20 31l-1 4M24 31l-1 4M28 31l-1 4M32 31l-1 4M36 31l-1 4" stroke="#c9a462" stroke-width="1.4"/><path d="M8 13h6M24 27h7" stroke="#d24f4f" stroke-width="2"/></svg>',
    ula: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="none" stroke="#3f8b4e" stroke-width="2"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var a = i / 10 * 2 * Math.PI, x = (20 + 12 * Math.cos(a)).toFixed(1), y = (20 + 12 * Math.sin(a)).toFixed(1); return '<circle cx="' + x + '" cy="' + y + '" r="3.6" fill="' + (i % 2 ? '#f3c93b' : '#e8604f') + '"/><circle cx="' + x + '" cy="' + y + '" r="1.2" fill="#fff6d0"/>'; }).join('') + '</svg>',
    siapo: '<svg viewBox="0 0 40 40"><rect x="5" y="5" width="30" height="30" rx="2" fill="#c9905a"/><path d="M5 15h30M5 25h30M15 5v30M25 5v30" stroke="#5a2f18" stroke-width="1.6"/><path d="M10 7l3 3-3 3-3-3zM30 27l3 3-3 3-3-3zM20 17l3 3-3 3-3-3z" fill="#5a2f18"/></svg>',
    ipu: '<svg viewBox="0 0 40 40"><path d="M6 17h28c0 9-6 15-14 15S6 26 6 17z" fill="#6b4226"/><path d="M6 17h28" stroke="#3d2513" stroke-width="2"/><ellipse cx="20" cy="17" rx="12" ry="2.2" fill="#c8b48a"/></svg>',
  };
  var keepIcon = function (k) { var e = h('span', { class: 'tj-ico', 'aria-hidden': 'true' }); if (KEEP_SVG[k.icon]) e.innerHTML = KEEP_SVG[k.icon]; else e.textContent = k.icon; return e; };

  // ---------- the drawn scenes ----------
  // art(spec, seed): an 800 x 360 picture from a few parts: sky, the far land, the near ground, things. Only ever built
  // from journey.json, never from anything typed.
  function art(a, seed) {
    var W = 800, H = 360, HZ = 214, out = [], n = 0;
    var rnd = (function (s) { return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })(seed || 7);
    var id = function (p) { return 'tj' + (seed || 0) + p + (n++); };
    var SKY = { day: ['#6fbfee', '#d8f1ff'], morning: ['#f1b07c', '#a9d8f1'], dusk: ['#2b3768', '#ee9460'], night: ['#08122a', '#243a63'], rain: ['#66788c', '#aebbc7'] }[a.sky] || ['#6fbfee', '#d8f1ff'];
    var sky = id('s'); out.push('<defs><linearGradient id="' + sky + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + SKY[0] + '"/><stop offset="1" stop-color="' + SKY[1] + '"/></linearGradient></defs><rect width="800" height="360" fill="url(#' + sky + ')"/>');
    var night = a.sky === 'night', dusk = a.sky === 'dusk';
    if (night || (a.things || []).indexOf('stars') >= 0) for (var i = 0; i < 70; i++) out.push('<circle cx="' + (rnd() * W).toFixed(0) + '" cy="' + (rnd() * HZ * .8).toFixed(0) + '" r="' + (rnd() * 1.3 + .3).toFixed(1) + '" fill="#fff" opacity="' + (rnd() * .6 + .3).toFixed(2) + '"/>');
    if (night) out.push('<circle cx="650" cy="62" r="22" fill="#f4efd8"/><circle cx="660" cy="56" r="20" fill="' + SKY[0] + '"/>');
    else if (a.sky === 'day') out.push('<circle cx="660" cy="64" r="30" fill="#fff4b8"/><circle cx="660" cy="64" r="44" fill="#fff4b8" opacity=".25"/>');
    else if (a.sky === 'morning') out.push('<circle cx="140" cy="150" r="34" fill="#ffe2a6"/><circle cx="140" cy="150" r="54" fill="#ffe2a6" opacity=".3"/>');
    else if (dusk) out.push('<circle cx="560" cy="' + (HZ - 6) + '" r="40" fill="#ffc07a"/>');
    var cloud = function (x, y, s, c) { return '<g fill="' + c + '" opacity=".9"><ellipse cx="' + x + '" cy="' + y + '" rx="' + 46 * s + '" ry="' + 15 * s + '"/><ellipse cx="' + (x - 22 * s) + '" cy="' + (y - 9 * s) + '" rx="' + 22 * s + '" ry="' + 15 * s + '"/><ellipse cx="' + (x + 16 * s) + '" cy="' + (y - 13 * s) + '" rx="' + 26 * s + '" ry="' + 18 * s + '"/></g>'; };
    if (a.sky === 'rain') { out.push(cloud(150, 70, 2.2, '#8796a6'), cloud(470, 55, 2.6, '#7d8c9d'), cloud(720, 80, 1.8, '#8796a6')); }
    else if (!night) out.push(cloud(220, 70, 1, dusk ? '#f6b98e' : '#ffffff'), cloud(480, 100, .7, dusk ? '#f6b98e' : '#ffffff'));
    // the far land
    var far = a.far, g = night ? .45 : dusk ? .7 : a.sky === 'rain' ? .8 : 1;
    var shade = function (hex) { var c = parseInt(hex.slice(1), 16), r = (c >> 16) * g, gg = (c >> 8 & 255) * g, b = (c & 255) * g; return 'rgb(' + [r, gg, b].map(function (v) { return Math.round(v); }).join(',') + ')'; };
    var ridge = function (pts, fill) { return '<path d="M0 ' + H + ' L' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L') + ' L' + W + ' ' + H + 'Z" fill="' + shade(fill) + '"/>'; };
    var wave = function (base, amp, k, ph) { var p = []; for (var x = 0; x <= W; x += 20) p.push([x, (base - amp * (Math.sin(x / k + ph) * .6 + Math.sin(x / (k * .43) + ph * 2) * .4)).toFixed(1)]); return p; };
    if (far === 'hills-gold') { out.push(ridge(wave(HZ - 30, 26, 90, 1), '#c99c55'), ridge(wave(HZ - 10, 16, 60, 3), '#d9b36c')); }
    if (far === 'hills-green') { out.push(ridge(wave(HZ - 40, 30, 80, 2), '#3f8a52'), ridge(wave(HZ - 14, 14, 55, 4), '#57a564')); }
    if (far === 'upolu') { out.push(ridge(wave(HZ - 56, 30, 120, 1), '#2f7a4a'), ridge(wave(HZ - 22, 12, 70, 2), '#3f9257')); }
    if (far === 'savaii') { out.push(ridge([[0, HZ - 10], [160, HZ - 40], [400, HZ - 78], [620, HZ - 44], [800, HZ - 14]], '#3b7d4f'), ridge(wave(HZ - 8, 8, 50, 1), '#4c9a5c')); }
    if (far === 'peaks-snow' || far === 'rainier' || far === 'hood') {
      if (far === 'peaks-snow') {
        var pk = [[0, HZ - 40], [70, HZ - 90], [120, HZ - 60], [190, HZ - 130], [260, HZ - 70], [330, HZ - 120], [400, HZ - 80], [470, HZ - 140], [560, HZ - 75], [640, HZ - 115], [720, HZ - 60], [800, HZ - 95]];
        out.push(ridge(pk, '#6c7f97'));
        pk.forEach(function (p, i) { if (i && i < pk.length - 1 && p[1] < HZ - 100) out.push('<path d="M' + (p[0] - 22) + ' ' + (p[1] + 24) + ' L' + p[0] + ' ' + p[1] + ' L' + (p[0] + 22) + ' ' + (p[1] + 24) + ' L' + (p[0] + 8) + ' ' + (p[1] + 18) + ' L' + (p[0] - 6) + ' ' + (p[1] + 26) + 'Z" fill="#f3f6fb"/>'); });
        out.push(ridge(wave(HZ - 12, 10, 70, 2), '#7c8c5c'));
      } else {
        var cx = far === 'hood' ? 560 : 420, ht = far === 'hood' ? 120 : 150, wd = far === 'hood' ? 150 : 260;
        out.push('<path d="M' + (cx - wd) + ' ' + HZ + ' L' + (cx - 18) + ' ' + (HZ - ht) + ' L' + (cx + 18) + ' ' + (HZ - ht) + ' L' + (cx + wd) + ' ' + HZ + 'Z" fill="' + shade('#8193aa') + '" opacity="' + (far === 'rainier' ? .55 : 1) + '"/>');
        out.push('<path d="M' + (cx - wd * .38) + ' ' + (HZ - ht * .62) + ' L' + (cx - 18) + ' ' + (HZ - ht) + ' L' + (cx + 18) + ' ' + (HZ - ht) + ' L' + (cx + wd * .38) + ' ' + (HZ - ht * .62) + ' L' + (cx + 10) + ' ' + (HZ - ht * .7) + ' L' + (cx - 12) + ' ' + (HZ - ht * .6) + 'Z" fill="#f4f7fb" opacity="' + (far === 'rainier' ? .6 : 1) + '"/>');
        if (far === 'rainier') out.push(cloud(380, HZ - 120, 2.2, '#8a99a9'));
        out.push(ridge(wave(HZ - 16, 12, 60, 1), far === 'hood' ? '#3e6b45' : '#355a45'));
      }
    }
    if (far === 'koolau') { var kp = []; for (var x = 0; x <= W; x += 16) kp.push([x, HZ - 70 - 50 * Math.abs(Math.sin(x / 58)) - (x > 300 && x < 560 ? 25 : 0)]); out.push(ridge(kp, '#2e7b45')); for (x = 10; x < W; x += 22 + rnd() * 26) { var tp = HZ - 70 - 50 * Math.abs(Math.sin(x / 58)) - (x > 300 && x < 560 ? 25 : 0) + 14; out.push('<path d="M' + x.toFixed(0) + ' ' + tp.toFixed(0) + ' Q' + (x + 8).toFixed(0) + ' ' + ((tp + HZ) / 2).toFixed(0) + ' ' + (x + 3).toFixed(0) + ' ' + HZ + '" stroke="' + shade('#1f5c32') + '" stroke-width="' + (3 + rnd() * 4).toFixed(1) + '" fill="none" opacity=".45" stroke-linecap="round"/>'); } }
    if (far === 'rainmaker') { out.push(ridge([[0, HZ - 30], [180, HZ - 60], [300, HZ - 150], [330, HZ - 172], [360, HZ - 150], [470, HZ - 70], [620, HZ - 90], [800, HZ - 40]], '#2c6e44'), cloud(330, HZ - 178, 1.3, dusk ? '#d7a490' : '#ffffff'), ridge(wave(HZ - 18, 10, 60, 2), '#3b8a54')); }
    if (far === 'skyline') {
      var x2 = 0; while (x2 < W) { var bw = 30 + rnd() * 50, bh = 50 + rnd() * 140; out.push('<rect x="' + x2.toFixed(0) + '" y="' + (HZ - bh).toFixed(0) + '" width="' + bw.toFixed(0) + '" height="' + (bh + 4).toFixed(0) + '" fill="' + (night ? '#121c33' : '#5d6f88') + '"/>');
        for (var wy = HZ - bh + 8; wy < HZ - 6; wy += 12) for (var wx = x2 + 5; wx < x2 + bw - 6; wx += 9) if (rnd() < (night ? .45 : .2)) out.push('<rect x="' + wx.toFixed(0) + '" y="' + wy.toFixed(0) + '" width="4" height="6" fill="' + (night ? '#f6d68b' : '#a9bdd3') + '"/>');
        x2 += bw + 2; }
      out.push('<path d="M560 ' + (HZ - 230) + ' l6 26 h-12z M548 ' + (HZ - 204) + ' h24 v204 h-24z" fill="' + (night ? '#1a2745' : '#6a7d97') + '"/>');
    }
    if (far === 'auckland') {
      out.push('<path d="M120 ' + HZ + ' Q300 ' + (HZ - 64) + ' 480 ' + HZ + 'Z" fill="' + shade('#4a7a5c') + '"/>');
      out.push('<path d="M640 ' + (HZ - 190) + ' v170 M636 ' + (HZ - 20) + ' h8" stroke="' + shade('#d7dde5') + '" stroke-width="5"/><ellipse cx="640" cy="' + (HZ - 140) + '" rx="13" ry="7" fill="' + shade('#d7dde5') + '"/>');
      out.push(ridge(wave(HZ - 6, 6, 40, 1), '#5b8a64'));
    }
    // the near ground
    var near = a.near;
    if (near === 'sea' || near === 'lagoon') {
      out.push('<rect y="' + HZ + '" width="800" height="' + (H - HZ) + '" fill="' + shade(near === 'lagoon' ? '#1f6f9a' : '#215f8a') + '"/>');
      if (near === 'lagoon') out.push('<rect y="' + (HZ + 26) + '" width="800" height="' + (H - HZ - 26) + '" fill="' + shade('#35b6c2') + '"/><path d="M0 ' + (HZ + 26) + ' Q200 ' + (HZ + 20) + ' 400 ' + (HZ + 27) + ' T800 ' + (HZ + 24) + '" stroke="#f2fbff" stroke-width="3" fill="none" opacity=".8"/>');
      for (var wv = 0; wv < 14; wv++) { var yy = HZ + 10 + rnd() * 70, xx = rnd() * W; out.push('<path d="M' + xx.toFixed(0) + ' ' + yy.toFixed(0) + ' q8 -4 16 0" stroke="#ffffff" stroke-width="1.5" fill="none" opacity=".45"/>'); }
      out.push('<path d="M0 ' + (H - 70) + ' Q220 ' + (H - 92) + ' 420 ' + (H - 76) + ' T800 ' + (H - 84) + ' V360 H0Z" fill="' + shade('#ead8a8') + '"/>');
    } else if (near === 'street') {
      out.push('<rect y="' + HZ + '" width="800" height="' + (H - HZ) + '" fill="' + shade(night ? '#2b3644' : '#7fa860') + '"/><rect y="' + (H - 64) + '" width="800" height="64" fill="' + shade('#5a6068') + '"/><rect y="' + (H - 72) + '" width="800" height="8" fill="' + shade('#b9bcbf') + '"/>');
      for (var d = 20; d < W; d += 90) out.push('<rect x="' + d + '" y="' + (H - 34) + '" width="44" height="4" fill="#e8d679" opacity=".8"/>');
    } else {
      out.push('<rect y="' + HZ + '" width="800" height="' + (H - HZ) + '" fill="' + shade(near === 'park' ? '#5fa257' : '#6f9e55') + '"/>');
    }
    var GY = H - 70;   // where things stand
    var palm = function (x, s, lean) { var top = GY - 150 * s, tx = x + lean * s; var o = '<path d="M' + x + ' ' + GY + ' Q' + (x + lean * .2 * s) + ' ' + (GY - 80 * s) + ' ' + tx + ' ' + top + '" stroke="' + shade('#7a5a3a') + '" stroke-width="' + (7 * s) + '" fill="none" stroke-linecap="round"/>';
      [-150, -115, -70, -30, 10, 45].forEach(function (ang) { var r = ang * Math.PI / 180, ex = tx + Math.cos(r) * 62 * s, ey = top + Math.sin(r) * 34 * s + 22 * s; o += '<path d="M' + tx + ' ' + top + ' Q' + ((tx + ex) / 2) + ' ' + (top - 18 * s) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1) + '" stroke="' + shade('#2f8a3e') + '" stroke-width="' + (7 * s) + '" fill="none" stroke-linecap="round"/>'; });
      return o + '<circle cx="' + tx + '" cy="' + (top + 6 * s) + '" r="' + (6 * s) + '" fill="' + shade('#6b4a26') + '"/>'; };
    var T = {
      palm1: function () { return palm(90, 1.05, 30); },
      palm3: function () { return palm(40, .9, 26) + palm(150, 1.15, -18) + palm(720, 1, -30); },
      house: function () { return '<g transform="translate(150 ' + (GY - 110) + ')"><rect x="0" y="40" width="200" height="72" fill="' + shade('#e9dcc4') + '"/><path d="M-12 44 L100 0 L212 44Z" fill="' + shade('#8a4c3a') + '"/><rect x="86" y="66" width="30" height="46" fill="' + shade('#5a3a2a') + '"/><rect x="20" y="58" width="44" height="30" fill="' + (night ? '#f6d68b' : shade('#a9d1e8')) + '"/><rect x="136" y="58" width="44" height="30" fill="' + (night ? '#f6d68b' : shade('#a9d1e8')) + '"/></g>'; },
      car: function () { return '<g transform="translate(470 ' + (GY + 18) + ')"><rect x="0" y="14" width="120" height="26" rx="8" fill="' + shade('#c0473b') + '"/><path d="M20 14 L36 0 H84 L100 14Z" fill="' + shade('#c0473b') + '"/><path d="M40 4 H80 L92 14 H28Z" fill="' + shade('#bfe0f2') + '"/><circle cx="28" cy="40" r="10" fill="#222"/><circle cx="92" cy="40" r="10" fill="#222"/></g>'; },
      pines: function () { var o = ''; [30, 80, 600, 650, 720, 770].forEach(function (x, i) { var s = .8 + (i % 3) * .2; o += '<path d="M' + x + ' ' + (GY - 120 * s) + ' L' + (x + 28 * s) + ' ' + GY + ' L' + (x - 28 * s) + ' ' + GY + 'Z" fill="' + shade('#235c3e') + '"/><rect x="' + (x - 3) + '" y="' + GY + '" width="6" height="10" fill="' + shade('#5b3d27') + '"/>'; }); return o; },
      trees: function () { var o = ''; [60, 700, 760].forEach(function (x, i) { o += '<rect x="' + (x - 4) + '" y="' + (GY - 50) + '" width="8" height="52" fill="' + shade('#6b4a2c') + '"/><circle cx="' + x + '" cy="' + (GY - 70) + '" r="' + (34 + i * 4) + '" fill="' + shade('#3f8a46') + '"/>'; }); return o; },
      church: function () { return '<g transform="translate(470 ' + (GY - 150) + ')"><rect x="0" y="60" width="150" height="92" fill="' + shade('#f2f2ee') + '"/><path d="M-8 64 L75 26 L158 64Z" fill="' + shade('#c9473c') + '"/><rect x="58" y="-10" width="34" height="80" fill="' + shade('#f7f7f3') + '"/><path d="M54 -8 L75 -40 L96 -8Z" fill="' + shade('#c9473c') + '"/><path d="M75 -64 V-42 M67 -56 H83" stroke="' + shade('#f7f7f3') + '" stroke-width="4"/><path d="M62 152 V112 Q75 98 88 112 V152Z" fill="' + shade('#6b4a2c') + '"/>' + (night ? '<rect x="18" y="86" width="22" height="30" fill="#f6d68b"/><rect x="110" y="86" width="22" height="30" fill="#f6d68b"/>' : '<rect x="18" y="86" width="22" height="30" fill="' + shade('#9cc5df') + '"/><rect x="110" y="86" width="22" height="30" fill="' + shade('#9cc5df') + '"/>') + '</g>'; },
      fale: function () { var o = '<g transform="translate(250 ' + (GY - 120) + ')">'; o += '<ellipse cx="130" cy="122" rx="140" ry="12" fill="' + shade('#a9895c') + '"/>'; for (var i = 0; i < 7; i++) o += '<rect x="' + (14 + i * 38) + '" y="44" width="7" height="78" fill="' + shade('#7a5434') + '"/>';
        o += '<path d="M-6 50 Q130 -46 266 50 Z" fill="' + shade('#9b7a46') + '"/><path d="M6 46 Q130 -30 254 46" stroke="' + shade('#7d5f33') + '" stroke-width="3" fill="none"/>' + (night ? '<ellipse cx="130" cy="96" rx="40" ry="16" fill="#f6c46b" opacity=".55"/>' : '') + '</g>'; return o; },
      tents: function () { var o = ''; [[140, '#e4573f'], [330, '#f2b33d'], [520, '#2f9e8f']].forEach(function (t) { var x = t[0]; o += '<path d="M' + x + ' ' + (GY - 90) + ' L' + (x + 70) + ' ' + (GY - 120) + ' L' + (x + 140) + ' ' + (GY - 90) + 'Z" fill="' + shade(t[1]) + '"/><rect x="' + x + '" y="' + (GY - 90) + '" width="140" height="12" fill="' + shade('#ffffff') + '"/><path d="M' + (x + 4) + ' ' + (GY - 80) + ' V' + GY + ' M' + (x + 136) + ' ' + (GY - 80) + ' V' + GY + '" stroke="' + shade('#888') + '" stroke-width="3"/><rect x="' + (x + 14) + '" y="' + (GY - 34) + '" width="112" height="30" fill="' + shade('#f4ead8') + '"/>'; });
        o += '<path d="M40 ' + (GY - 150) + ' Q400 ' + (GY - 100) + ' 760 ' + (GY - 150) + '" stroke="' + shade('#555') + '" stroke-width="1.5" fill="none"/>'; for (var i = 0; i < 18; i++) { var tx = 60 + i * 39, ty = GY - 150 + 50 * Math.sin(Math.PI * (tx - 40) / 720) - 2; o += '<path d="M' + tx + ' ' + ty + ' l8 14 l8 -14z" fill="' + ['#e4573f', '#f2b33d', '#2f9e8f', '#3a6fd1'][i % 4] + '"/>'; } return o; },
      stalls: function () { var o = '<rect x="120" y="' + (GY - 130) + '" width="560" height="14" fill="' + shade('#d9dde0') + '"/>'; for (var i = 0; i < 5; i++) { var x = 130 + i * 110; o += '<rect x="' + (x + 4) + '" y="' + (GY - 116) + '" width="6" height="116" fill="' + shade('#888e94') + '"/><rect x="' + x + '" y="' + (GY - 40) + '" width="96" height="40" fill="' + shade('#8a5a32') + '"/>';
        for (var j = 0; j < 7; j++) o += '<circle cx="' + (x + 10 + j * 12) + '" cy="' + (GY - 44 - (j % 2) * 6) + '" r="7" fill="' + shade(['#6b3f86', '#f0c63c', '#5a9a3a', '#7a4a2a'][(i + j) % 4]) + '"/>'; } return o; },
      campus: function () { return '<g transform="translate(330 ' + (GY - 100) + ')"><rect x="0" y="20" width="300" height="80" fill="' + shade('#e7e3da') + '"/><rect x="-10" y="10" width="320" height="12" fill="' + shade('#3b6f9e') + '"/>' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<rect x="' + (16 + i * 48) + '" y="38" width="30" height="24" fill="' + shade('#9cc5df') + '"/>'; }).join('') + '<rect x="132" y="70" width="36" height="30" fill="' + shade('#3b6f9e') + '"/></g>'; },
      tanoa: function () { return '<g transform="translate(560 ' + (GY + 8) + ')"><path d="M0 0 H120 Q116 34 60 38 Q4 34 0 0Z" fill="' + shade('#7a4a26') + '"/><ellipse cx="60" cy="0" rx="60" ry="9" fill="' + shade('#d9c79a') + '"/>' + [12, 36, 60, 84, 108].map(function (x) { return '<rect x="' + (x - 3) + '" y="30" width="6" height="18" fill="' + shade('#6a3d1e') + '"/>'; }).join('') + '</g>'; },
      umu: function () { var o = '<g transform="translate(540 ' + (GY + 4) + ')"><ellipse cx="80" cy="18" rx="92" ry="20" fill="' + shade('#6a6a64') + '"/>'; for (var i = 0; i < 9; i++) o += '<ellipse cx="' + (14 + i * 17) + '" cy="' + (8 + (i % 2) * 6) + '" rx="12" ry="8" fill="' + shade(['#5a5752', '#77736a', '#4b4945'][i % 3]) + '"/>';
        o += '<path d="M10 4 Q80 -26 150 4" fill="' + shade('#4f8c3c') + '"/>'; [40, 80, 120].forEach(function (x, i) { o += '<path d="M' + x + ' -14 q-14 -26 4 -48 q16 -22 -2 -46" stroke="#e8e8e8" stroke-width="5" fill="none" opacity="' + (.35 - i * .06) + '" stroke-linecap="round"/>'; }); return o + '</g>'; },
      lights: function () { var o = '<path d="M0 60 Q200 110 400 70 T800 64" stroke="#3a3a3a" stroke-width="1.2" fill="none"/>'; for (var i = 0; i < 26; i++) { var t = i / 25, x = t * 800, y = 60 + 40 * Math.sin(Math.PI * t * 2) * (t < .5 ? 1 : .2) + (t < .5 ? 0 : 6); o += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="4" fill="#ffd27a"/><circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="10" fill="#ffd27a" opacity=".18"/>'; } return o; },
      rain: function () { var o = ''; for (var i = 0; i < 90; i++) { var x = rnd() * 840, y = rnd() * H; o += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' l-6 16" stroke="#dfe8f1" stroke-width="1.4" opacity=".55"/>'; } return o; },
      stars: function () { return ''; },
    };
    (a.things || []).forEach(function (t) { if (T[t]) out.push(T[t]()); });
    return '<svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">' + out.join('') + '</svg>';
  }
  var seedOf = function (s) { var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 233280; return n || 7; };
  function scene(stop, small, who) {
    var e = h('div', { class: 'tj-scene' + (small ? ' is-small' : '') });
    e.innerHTML = art(stop.art, seedOf(stop.id));
    e.append(h('span', { class: 'tj-tag', text: stop.place + ', ' + stop.region }), h('span', { class: 'tj-host', 'aria-hidden': 'true', text: who || stop.host.face }));
    return e;
  }

  // ---------- the map ----------
  // An equirectangular map of the Pacific, longitudes 0..360 east. Sāmoa's stops sit so close together that they get
  // their own little map (the inset) out in the empty ocean to the southeast.
  var MAPV = { lon0: 143, lon1: 291, lat0: -47, lat1: 55 };
  var INSET = { lon0: 186.8, lon1: 190.9, lat0: -15.1, lat1: -12.7, box: [219, 271, -15, -44] };   // the box: lon0, lon1, lat top, lat bottom on the big map
  var SAMOA = [188.2, -13.9];
  var NUDGE = { wa: [-3.6, 1.8], or: [3.2, -.4], epa: [-1.2, -.6] };   // Federal Way and Portland would sit on top of each other
  // inside the inset, spread a little so the pins don't touch (Apia and the Upolu village are 30 km apart)
  var IN_POS = { savaii: [187.3, -13.62], home: [187.95, -13.38], apia: [188.3, -13.72], upolu: [188.85, -14.12], tutuila: [189.6, -14.35] };
  var east = function (lon) { return lon < 0 ? lon + 360 : lon; };
  var inInset = function (s) { var x = east(s.lon); return x > INSET.lon0 && x < INSET.lon1 && s.lat > INSET.lat0 && s.lat < INSET.lat1; };
  function mapXY(lon, lat, W, H) { return [(lon - MAPV.lon0) / (MAPV.lon1 - MAPV.lon0) * W, (MAPV.lat1 - lat) / (MAPV.lat1 - MAPV.lat0) * H]; }
  function insetXY(lon, lat, W, H) {
    var b = INSET.box, tl = mapXY(b[0], b[2], W, H), br = mapXY(b[1], b[3], W, H);
    return [tl[0] + (lon - INSET.lon0) / (INSET.lon1 - INSET.lon0) * (br[0] - tl[0]), tl[1] + (INSET.lat1 - lat) / (INSET.lat1 - INSET.lat0) * (br[1] - tl[1])];
  }
  function pinXY(s, W, H) { if (inInset(s)) { var ip = IN_POS[s.id] || [east(s.lon), s.lat]; return insetXY(ip[0], ip[1], W, H); } var n = NUDGE[s.id] || [0, 0]; return mapXY(east(s.lon) + n[0], s.lat + n[1], W, H); }
  var PIN_NAME = { upolu: 'Upolu', home: 'Nana’s village', laie: 'Lāʻie', akl: 'Auckland' };
  var LAND = null;
  function loadLand() {
    if (LAND) return Promise.resolve(LAND);
    return fetch('data/pacific.json').then(function (r) { return r.json(); }).then(function (d) {
      LAND = d.land.map(function (a) { var out = [], x = 0, y = 0; for (var i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([d.lon0 + x * d.q, d.lat0 + y * d.q]); } return out; });
      return LAND;
    });
  }
  function pacificMap() {
    var wrap = h('div', { class: 'tj-map', role: 'group', 'aria-label': 'The journey on a map' }), cv = h('canvas', { 'aria-hidden': 'true' });
    wrap.append(cv);
    var done = J0().done, ni = nextIdx(), rest = false, pins = [];
    var inset = h('div', { class: 'tj-inset' }, h('b', { text: 'Sāmoa' }));
    wrap.append(inset);
    STOPS.forEach(function (s, i) {
      var st = done[s.id] ? 'is-done' : i === ni && !rest ? 'is-next' : 'is-locked';
      var b = h('button', { type: 'button', class: 'tj-pin ' + st, 'aria-label': (i + 1) + '. ' + s.place + ', ' + s.region + (done[s.id] ? ', visited' : st === 'is-next' ? ', next' : ''), disabled: st === 'is-locked' ? true : null,
        on: { click: function () { stopView(s); } } }, done[s.id] ? '✓' : st === 'is-next' ? String(i + 1) : '', st === 'is-locked' && inInset(s) ? null : h('span', { text: st === 'is-locked' ? s.region : PIN_NAME[s.id] || s.place }));
      pins.push([b, s]); wrap.append(b);
    });
    function draw() {
      var W = wrap.clientWidth, H = wrap.clientHeight; if (!W) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr;
      var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d2742'); g.addColorStop(1, '#0a1d33'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
      for (var lo = 150; lo <= 290; lo += 15) { var p = mapXY(lo, 0, W, H); c.beginPath(); c.moveTo(p[0], 0); c.lineTo(p[0], H); c.stroke(); }
      for (var la = -45; la <= 50; la += 15) { var q = mapXY(150, la, W, H); c.beginPath(); c.moveTo(0, q[1]); c.lineTo(W, q[1]); c.stroke(); }
      var eq = mapXY(150, 0, W, H); c.strokeStyle = 'rgba(242,193,78,.12)'; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(0, eq[1]); c.lineTo(W, eq[1]); c.stroke(); c.setLineDash([]);
      function land(proj, clip) {
        if (!LAND) return;
        c.save(); if (clip) { c.beginPath(); c.rect(clip[0], clip[1], clip[2], clip[3]); c.clip(); }
        c.fillStyle = '#24465f'; c.strokeStyle = 'rgba(242,193,78,.28)'; c.lineWidth = .7;
        LAND.forEach(function (r) { c.beginPath(); r.forEach(function (pt, i) { var xy = proj(pt[0], pt[1]); if (i) c.lineTo(xy[0], xy[1]); else c.moveTo(xy[0], xy[1]); }); c.closePath(); c.fill(); c.stroke(); });
        c.restore();
      }
      land(function (lo, la) { return mapXY(lo, la, W, H); });
      // the inset: Sāmoa up close
      var b = INSET.box, tl = mapXY(b[0], b[2], W, H), br = mapXY(b[1], b[3], W, H);
      c.fillStyle = '#0b2136'; c.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      land(function (lo, la) { return insetXY(lo, la, W, H); }, [tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]]);
      var sm = mapXY(SAMOA[0], SAMOA[1], W, H);
      c.strokeStyle = 'rgba(242,193,78,.3)'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(sm[0], sm[1]); c.lineTo(tl[0], tl[1]); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(sm[0], sm[1], 3.5, 0, 7); c.fillStyle = 'rgba(242,193,78,.8)'; c.fill();
      Object.assign(inset.style, { left: tl[0] + 'px', top: tl[1] + 'px', width: (br[0] - tl[0]) + 'px', height: (br[1] - tl[1]) + 'px' });
      // the route: Sāmoa's stops join the big map at Sāmoa's dot, and run inside the inset
      var POS = layout(W, H), at = function (s) { return POS[s.id] || pinXY(s, W, H); };
      var pt = function (s) { return inInset(s) ? sm : at(s); };
      // a pin moved off its place gets a faint dot and a line back to where it really is
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.fillStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1;
      STOPS.forEach(function (s) { var o = pinXY(s, W, H), q = at(s); if (Math.hypot(q[0] - o[0], q[1] - o[1]) < 6) return; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(q[0], q[1]); c.stroke(); c.beginPath(); c.arc(o[0], o[1], 1.8, 0, 7); c.fill(); });
      for (var i = 1; i < STOPS.length; i++) {
        var A = STOPS[i - 1], B = STOPS[i], both = inInset(A) && inInset(B), pa = both ? at(A) : pt(A), pb = both ? at(B) : pt(B);
        if (pa[0] === pb[0] && pa[1] === pb[1]) continue;
        var walked = !!done[B.id], mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, dx = pb[0] - pa[0], dy = pb[1] - pa[1], bend = both ? .12 : .18;
        c.strokeStyle = walked ? 'rgba(242,193,78,.85)' : 'rgba(255,255,255,.25)'; c.lineWidth = walked ? 2 : 1.3; c.setLineDash(walked ? [] : [4, 5]);
        c.beginPath(); c.moveTo(pa[0], pa[1]); c.quadraticCurveTo(mx - dy * bend, my + dx * bend, pb[0], pb[1]); c.stroke();
      }
      c.setLineDash([]);
      pins.forEach(function (p) { var xy = at(p[1]); p[0].style.left = xy[0] + 'px'; p[0].style.top = xy[1] + 'px'; });
    }
    // on a phone some pins sat 4 px apart (a tap opened the one underneath) and names ran off the edge.
    // Each pin with its name below is a box; boxes that overlap are pushed apart along their smaller overlap, and every
    // box is kept inside the map (Sāmoa's inside the inset, under its title). Still stuck after 40 rounds (the inset is
    // short): push along the other way instead.
    function layout(W, H) {
      var b = INSET.box, tl = mapXY(b[0], b[2], W, H), br = mapXY(b[1], b[3], W, H), PAD = 3;
      var bx = pins.map(function (p) {
        var el = p[0], lab = el.querySelector('span'), d = el.offsetWidth || 20, lw = lab ? lab.offsetWidth : 0, lh = lab ? lab.offsetHeight + 3 : 0, xy = pinXY(p[1], W, H);
        return { id: p[1].id, x: xy[0], y: xy[1], hw: Math.max(d, lw) / 2 + 2, up: d / 2 + 2, dn: d / 2 + lh + 2, lim: inInset(p[1]) ? [tl[0], tl[1] + 16, br[0], br[1]] : [0, 0, W, H] };
      });
      var keepIn = function (q) {
        var l = q.lim, x0 = l[0] + q.hw + PAD, x1 = l[2] - q.hw - PAD, y0 = l[1] + q.up + PAD, y1 = l[3] - q.dn - PAD;
        q.x = x0 > x1 ? (l[0] + l[2]) / 2 : Math.min(x1, Math.max(x0, q.x));
        q.y = y0 > y1 ? (l[1] + l[3]) / 2 : Math.min(y1, Math.max(y0, q.y));
      };
      bx.forEach(keepIn);
      for (var n = 0; n < 80; n++) {
        var moved = false;
        for (var i = 0; i < bx.length; i++) for (var k = i + 1; k < bx.length; k++) {
          var p = bx[i], q = bx[k];
          var ox = Math.min(p.x + p.hw, q.x + q.hw) - Math.max(p.x - p.hw, q.x - q.hw), oy = Math.min(p.y + p.dn, q.y + q.dn) - Math.max(p.y - p.up, q.y - q.up);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if ((ox < oy) !== (n >= 40)) { var sx = (q.x > p.x || (q.x === p.x && k > i)) ? 1 : -1; p.x -= sx * (ox / 2 + .5); q.x += sx * (ox / 2 + .5); }
          else { var sy = (q.y > p.y || (q.y === p.y && k > i)) ? 1 : -1; p.y -= sy * (oy / 2 + .5); q.y += sy * (oy / 2 + .5); }
        }
        bx.forEach(keepIn);
        if (!moved) break;
      }
      var out = {}; bx.forEach(function (q) { out[q.id] = [q.x, q.y]; }); return out;
    }
    var outer = h('div', { class: 'tj-mapwrap' }, wrap), centred = false;
    // on a phone the map is wider than the screen: start it on the next stop (or the last one visited)
    function centre() { if (centred || !wrap.clientWidth || outer.scrollWidth <= outer.clientWidth + 2) return; centred = true; var at = STOPS[Math.min(ni, STOPS.length - 1)], xy = pinXY(at, wrap.clientWidth, wrap.clientHeight); outer.scrollLeft = Math.max(0, xy[0] - outer.clientWidth / 2); }
    loadLand().then(draw, draw);
    requestAnimationFrame(function () { draw(); centre(); });
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); centre(); }).observe(wrap);
    return outer;
  }

  // the journey's own home page became the course map; its real-world map lives on You
  function trip() { gameMap(); }

  // ---------- a stop: arrive, words, talk, check, keepsake ----------
  function stopView(s) {
    again = null; tab2('map');
    var JLs = JL.find(function (L) { return L.stop === s; });
    var steps = h('div', { class: 'tj-steps', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4].map(function () { return h('i'); }));
    var body = h('div');
    var mark = function (k) { [].forEach.call(steps.children, function (e, i) { e.classList.toggle('on', i <= k); }); window.scrollTo(0, 0); };
    fill(view, h('p', { class: 'ts-back' }, h('button', { type: 'button', class: 'ts-link', on: { click: trip } }, '← The map')), steps, body);
    arrive();
    function arrive() {
      mark(0);
      fill(body, scene(s), h('p', { class: 'ts-kicker', style: 'margin-top:1rem', text: s.region }), h('h2', { text: s.title, style: 'font-size:1.9rem;margin:.2rem 0 .4rem' }),
        h('div', { class: 'tj-intro' }, s.intro.map(function (t) { return h('p', { text: fillMe(t) }); })),
        h('div', { class: 'ts-sticky' }, h('button', { type: 'button', class: 'ts-btn', on: { click: words } }, 'Learn the words first')));
      body.querySelector('.ts-btn').focus({ preventScroll: true });
    }
    function words() {
      mark(1); var i = 0, list = s.words;
      (function one() {
        var w = list[i], k = key(w.sm); play(w.sm); card(k);
        fill(body, h('p', { class: 'ts-kicker', text: 'Word ' + (i + 1) + ' of ' + list.length }),
          h('div', { class: 'tj-card' }, playBtn(w.sm), h('p', { class: 'ts-prompt', lang: 'sm', text: w.sm }), h('p', { class: 'ts-lede', style: 'margin:0', text: w.en }), w.note ? h('small', { text: w.note }) : null),
          h('div', { class: 'ts-sticky' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { i++; if (i < list.length) one(); else { save(); talk(); } } } }, i < list.length - 1 ? 'Next word' : 'Talk with ' + host(s))));
        body.querySelector('.ts-sticky .ts-btn').focus({ preventScroll: true });
      })();
    }
    function talk() {
      mark(2);
      var j = J0(), chat = h('div', { class: 'tj-chat' + (j.hideEn ? ' hide-en' : ''), 'aria-live': 'polite' }), foot = h('div', { class: 'tj-foot' });
      var tg = h('button', { type: 'button', class: 'ts-link', on: { click: function () { j.hideEn = chat.classList.toggle('hide-en'); tg.textContent = j.hideEn ? 'Show the English' : 'Hide the English'; save(); } } }, j.hideEn ? 'Show the English' : 'Hide the English');
      fill(body, scene(s, true), h('p', { style: 'text-align:right;margin:.5rem 0 0' }, tg), chat, foot);
      var i = 0, fl = 0, of = 0, T = s.talk;
      var bubble = function (who, sm, en, mine) {
        var b = h('div', { class: 'tj-b', role: 'button', tabindex: '0', on: { click: function () { b.classList.toggle('is-open'); play(sm); }, keydown: pressKey } }, mine ? null : h('b', { text: who }), h('span', { lang: 'sm', text: fillMe(sm) }), en ? h('span', { class: 'ts-en', text: fillMe(en) }) : null);
        var m = h('div', { class: 'tj-msg' + (mine ? ' is-me' : '') }, h('span', { class: 'tj-av', 'aria-hidden': 'true', text: mine ? '🙂' : FACES[who] || '🧑🏽' }), b);
        chat.append(m); play(sm); return m;
      };
      var cont = function () { var b = h('button', { type: 'button', class: 'ts-btn', on: { click: next } }, '▸ Continue'); fill(foot, b); b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); };
      function next() {
        if (i >= T.length) { s.bless ? bubble(s.bless.who, s.bless.sm, s.bless.en) : null; var b = h('button', { type: 'button', class: 'ts-btn', on: { click: function () { check(fl, of); } } }, 'Next'); fill(foot, b); b.focus({ preventScroll: true }); return; }
        var t = T[i++];
        if (t.narr) { chat.append(h('p', { class: 'tj-narr', text: fillMe(t.narr) })); return cont(); }
        if (t.who) { bubble(t.who, t.sm, t.en); return cont(); }
        if (t.choose) {
          of++; var tries = 0, why = h('div');
          var opts = shuffle(t.choose).map(function (o) {
            var b = h('button', { type: 'button', class: 'tj-opt' + (o.act ? ' is-act' : ''), lang: o.act ? null : 'sm', on: { click: function () {
              if (!o.ok) { tries++; b.disabled = true; fill(why, h('div', { class: 'tj-why', role: 'status' }, '💬 ', fillMe(o.why))); return; }
              if (o.act) chat.append(h('p', { class: 'tj-narr', text: 'You: ' + fillMe(o.act) })); else bubble(me(), o.sm, o.en, true);
              if (!tries) { fl++; chat.append(h('p', { class: 'tj-narr', style: 'font-style:normal' }, h('span', { class: 'tj-flower', text: '🌺' }), ' Faʻaaloalo.')); }
              cont();
            } } }, o.act ? h('span', { text: fillMe(o.act) }) : [h('span', { text: fillMe(o.sm) }), j.hideEn ? null : h('small', { lang: 'en', text: fillMe(o.en) })]);
            return b;
          });
          fill(foot, h('p', { class: 'tj-ask', text: fillMe(t.prompt) }), why, opts);
          foot.scrollIntoView({ block: 'nearest' });
        }
      }
      next();
    }
    function check(fl, of) {
      mark(3);
      var it = itemsOf(JLs), qs = [];
      shuffle(it).slice(0, 4).forEach(function (x) { qs.push({ kind: 'pick', x: x }); });
      var short1 = it.filter(function (x) { return x.sm.split(' ').length <= 2; })[0]; if (short1) qs.push({ kind: 'type', x: short1 });
      var holder = h('div'); fill(body, holder);
      // run() draws into the whole view; give it the stop's own frame back afterwards
      run(qs, JLs, function () { fill(view, h('p', { class: 'ts-back' }, h('button', { type: 'button', class: 'ts-link', on: { click: trip } }, '← The map')), steps, body); keep(fl, of); });
    }
    function keep(fl, of) {
      mark(4);
      var j = J0(), first = !j.done[s.id], prev = j.done[s.id] || { fl: 0 };
      if (first) { j.newDay = today(); if (P.days.indexOf(today()) < 0) P.days.push(today()); P.xp[today()] = (P.xp[today()] || 0) + 20; }
      if (JLs.node) { var g = G0(); g.reach = Math.max(g.reach || 0, JLs.node.i); g.at = JLs.node.i; if (first) bump(); }
      j.fl = (j.fl || 0) + Math.max(0, fl - (prev.fl || 0));
      j.done[s.id] = { day: (prev.day || today()), fl: Math.max(fl, prev.fl || 0), of: of };
      save(); drawStats();
      var last = STOPS.indexOf(s) === STOPS.length - 1;
      fill(body, h('div', { class: 'tj-keep' }, keepIcon(s.keep), h('h2', { lang: 'sm', text: s.keep.sm }), h('p', { class: 'ts-lede', style: 'margin:0', text: (first ? 'For your ʻato: ' : 'In your ʻato: ') + s.keep.en + '.' }),
          h('p', { class: 'ts-lede', style: 'margin:0', text: '🌺 ' + fl + ' of ' + of + ' at this stop.' }),
          h('div', { class: 'tj-fs' }, h('b', { text: 'Faʻa-Samoa' }), fillMe(s.culture)),
          last ? h('p', { class: 'ts-lede', text: 'Mālō, ' + me() + '! That’s the whole malaga.' }) : null,
          h('div', { class: 'ts-stats', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { var nd = JLs.node, nx = nd && NODES[nd.i + 1]; gameMap(nx ? function () { setTimeout(function () { walkTo(nx.i, function () { openSheet(nx); }); }, 350); } : null); } } }, last ? 'Back to the map' : 'On to the next one'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { session(JLs); } } }, 'Practice these words'))));
    }
  }

  // ---------- the course map ----------
  // data/course.json: worlds (each one place), each a row of nodes: a lesona from the Peace Corps handbook (pc:<n>), one
  // written for this project (g:<id>), or a talk with an elder (j:<id>), in the order of the levels A1, A2, B1. The lesonas
  // are numbered 1, 2, 3 across the whole map. P.g = { done: { node: stars }, reach (furthest node opened by jumping
  // ahead), at (where you stand), goal (a day), day, n (done today), color (your lavalava) }.
  var COURSE = DATA.course || {}, WORLDS = COURSE.worlds || [], LEVELS = COURSE.levels || {};
  var NODES = [];
  WORLDS.forEach(function (w, wi) {
    w.i = wi; w.list = [];
    (w.nodes || []).forEach(function (ref) {
      var m = /^(pc|g|j):(.+)$/.exec(ref); if (!m) return;
      var L = null, nd = { id: ref, w: w };
      if (m[1] === 'pc') { L = LESSONS.find(function (x) { return /^pc-/.test(x.n) && +String(x.n).slice(3) === +m[2]; }); nd.src = 'Peace Corps handbook, lesson ' + (+m[2]); }
      else if (m[1] === 'g') { L = LESSONS.find(function (x) { return x.n === 'g-' + m[2]; }); nd.src = 'Written for Gagana'; }
      else { L = JL.find(function (x) { return x.stop.id === m[2]; }); nd.talk = true; if (L) nd.stop = L.stop; }
      if (!L) return;
      nd.L = L; L.node = nd; nd.i = NODES.length; NODES.push(nd); w.list.push(nd);
    });
  });
  (function () { var n = 0; NODES.forEach(function (nd) { if (!nd.talk) nd.num = ++n; }); })();
  function G0() { if (!P.g) P.g = { done: {}, reach: 0, at: 0, goal: 2, day: '', n: 0, color: 0 }; return P.g; }
  var isDone = function (nd) { return nd.talk ? !!J0().done[nd.stop.id] : !!G0().done[nd.id]; };
  var starsOf = function (nd) { if (!nd.talk) return G0().done[nd.id] || 0; var d = J0().done[nd.stop.id]; return d ? Math.max(1, Math.min(3, Math.round(3 * (d.fl || 0) / Math.max(1, d.of || 1)))) : 0; };
  var isOpen = function (i) { return i <= 0 || isDone(NODES[i]) || isDone(NODES[i - 1]) || i <= (G0().reach || 0); };
  var frontier = function () { var i = 0; while (i < NODES.length - 1 && isDone(NODES[i])) i++; return i; };
  var todayN = function () { var g = G0(); return g.day === today() ? g.n : 0; };
  function bump() { var g = G0(); if (g.day !== today()) { g.day = today(); g.n = 0; } g.n++; save(); drawStats(); }
  function markNode(nd, ratio) {
    var g = G0(), st = ratio >= .9 ? 3 : ratio >= .7 ? 2 : 1, had = g.done[nd.id] || 0;
    g.done[nd.id] = Math.max(had, st); g.reach = Math.max(g.reach || 0, nd.i); if (!had) bump(); save();
    return { stars: st, first: !had };
  }
  // progress from before the map: a lesson whose words are mostly learned counts as done
  function migrate() { NODES.forEach(function (nd) { if (nd.talk || G0().done[nd.id]) return; var it = itemsOf(nd.L); if (it.length >= 4 && it.filter(function (x) { return learned(x.k); }).length / it.length >= .6) G0().done[nd.id] = 2; }); }
  var levelOf = function (w) { return LEVELS[w.level] || { name: w.level, actfl: '', can: '' }; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // your character: a lavalava in a colour your flowers have earned, and a flower behind the ear from 10
  var LAVA = [['Teal', '#2a9d8f', 0], ['Red', '#c8463d', 0], ['Blue', '#3a6fd1', 5], ['Gold', '#e2a72e', 15], ['Purple', '#7b4fb3', 30], ['Siapo', '#8f3f1f', 45]];
  var flowers = function () { return (P.j && P.j.fl) || 0; };
  function sprite() {
    var c = (LAVA[G0().color] || LAVA[0]);
    if (flowers() < c[2]) c = LAVA[0];
    return '<g class="gm-bob"><ellipse cx="0" cy="1" rx="13" ry="4" fill="rgba(40,20,8,.35)"/>' +
      '<path d="M-10 -1 L10 -1 L8 -19 L-8 -19Z" fill="' + c[1] + '"/><path d="M-9 -8 H9" stroke="#fff7ea" stroke-width="1.5" opacity=".7"/>' +
      '<path d="M-5 -1 v5 M5 -1 v5" stroke="#8a5530" stroke-width="3.5" stroke-linecap="round"/>' +
      '<rect x="-8" y="-31" width="16" height="13" rx="4" fill="#fff7ea"/><path d="M-8 -27 l-5 9 M8 -27 l5 9" stroke="#a5683f" stroke-width="3.5" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-40" r="9" fill="#a5683f"/><path d="M-9 -42 a9 9 0 0 1 18 0 q-9 -5 -18 0z" fill="#2b1a10"/><circle cx="-3" cy="-40" r="1.2" fill="#2b1a10"/><circle cx="3" cy="-40" r="1.2" fill="#2b1a10"/><path d="M-2.5 -36 q2.5 2 5 0" stroke="#2b1a10" stroke-width="1" fill="none"/>' +
      (flowers() >= 10 ? '<g transform="translate(8 -45)"><circle r="2.2" fill="#ffd34d"/>' + [0, 72, 144, 216, 288].map(function (a) { return '<ellipse rx="2.4" ry="4" fill="#fff" transform="rotate(' + a + ') translate(0 -4)"/>'; }).join('') + '<circle r="1.6" fill="#ffd34d"/></g>' : '') + '</g>';
  }

  // ---- drawing: everything in tapa browns on bark cloth ----
  var D = '#4a2614', R = '#8f3f1f', T = '#b5773f', CR = '#f6e8cc';
  var TINT = { bay: '#e2a640', la: '#f08a3c', utah: '#d9846f', nw: '#6f9a7d', ny: '#7a87a6', hi: '#3fa5a0', as: '#4f9a5b', fiji: '#38a8c4', nz: '#5f9a4a', apia: '#c98d3a', upolu: '#6aa84f', savaii: '#c8553d' };
  var ICON = {
    island: '<ellipse cx="0" cy="9" rx="17" ry="4" fill="#5aa9b5"/><path d="M-12 8 Q0 -2 12 8Z" fill="' + T + '"/><path d="M2 6 Q3 -6 -1 -12" stroke="' + D + '" stroke-width="2.4" fill="none"/><path d="M-1 -12 q-9 -2 -12 4 M-1 -12 q8 -4 12 2 M-1 -12 q-2 -7 -8 -9 M-1 -12 q5 -7 10 -6" stroke="#2f7a3e" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    town: '<path d="M-15 10 V-1 L-8 -8 L-1 -1 V10Z" fill="' + R + '"/><rect x="-10" y="2" width="4" height="8" fill="' + CR + '"/><path d="M0 10 V-4 L8 -12 L16 -4 V10Z" fill="' + D + '"/><rect x="5" y="-2" width="5" height="5" fill="#f2c14e"/>',
    city: '<rect x="-15" y="-6" width="9" height="17" fill="' + R + '"/><rect x="-5" y="-15" width="10" height="26" fill="' + D + '"/><rect x="6" y="-9" width="9" height="20" fill="' + T + '"/>' + [[-3, -12], [0, -12], [-3, -7], [0, -7], [-3, -2], [0, -2], [8, -6], [11, -6], [8, -1], [11, -1]].map(function (p) { return '<rect x="' + p[0] + '" y="' + p[1] + '" width="2" height="3" fill="#f2c14e"/>'; }).join(''),
    palm: '<path d="M1 12 Q4 0 -1 -10" stroke="' + D + '" stroke-width="3" fill="none"/><path d="M-1 -10 q-10 -2 -14 5 M-1 -10 q9 -5 14 2 M-1 -10 q-3 -8 -10 -10 M-1 -10 q6 -8 12 -6" stroke="#2f7a3e" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="0" cy="-8" r="2.4" fill="' + R + '"/>',
    wave: '<path d="M-16 6 q4 -8 8 0 t8 0 t8 0 t8 0" stroke="#3a8fa3" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M-12 -4 q6 -14 16 -8 q-6 0 -6 7" stroke="' + D + '" stroke-width="3" fill="none" stroke-linecap="round"/>',
    peak: '<path d="M-17 11 L-5 -11 L2 0 L7 -6 L17 11Z" fill="' + D + '"/><path d="M-9 -4 L-5 -11 L-1 -4 L-3 -5 L-5 -2Z" fill="' + CR + '"/>',
    pine: '<path d="M-6 12 L-6 9 M0 -14 L-11 6 H11Z" fill="#2f6a42"/><path d="M0 -4 L-13 12 H13Z" fill="#2f6a42"/><rect x="-1.5" y="10" width="3" height="4" fill="' + D + '"/>',
    arch: '<path d="M-16 12 V-2 Q-16 -12 0 -12 Q16 -12 16 -2 V12 H8 V0 Q8 -5 0 -5 Q-8 -5 -8 0 V12Z" fill="' + R + '"/>',
    tower: '<path d="M0 -16 V10 M-5 10 H5" stroke="' + D + '" stroke-width="2.6"/><ellipse cx="0" cy="-8" rx="9" ry="3.4" fill="' + R + '"/><path d="M-6 10 L0 -6 L6 10" stroke="' + D + '" stroke-width="1.5" fill="none"/>',
    fale: '<path d="M-16 0 Q0 -18 16 0Z" fill="' + T + '"/><path d="M-12 0 V10 M-4 0 V10 M4 0 V10 M12 0 V10" stroke="' + D + '" stroke-width="2.4"/><path d="M-17 11 H17" stroke="' + R + '" stroke-width="2"/>',
    church: '<rect x="-12" y="-2" width="24" height="13" fill="' + CR + '" stroke="' + D + '" stroke-width="1.5"/><path d="M-14 -1 L0 -9 L14 -1" fill="' + R + '"/><rect x="-3" y="-15" width="6" height="12" fill="' + CR + '" stroke="' + D + '" stroke-width="1.5"/><path d="M0 -21 V-15 M-2.5 -18.5 H2.5" stroke="' + D + '" stroke-width="1.6"/><rect x="-2" y="4" width="4" height="7" fill="' + D + '"/>',
    canoe: '<path d="M-17 4 Q0 12 17 4 L14 1 H-14Z" fill="' + D + '"/><path d="M-8 -1 V-8 M8 -1 V-8 M-10 -9 H10" stroke="' + R + '" stroke-width="2"/><path d="M0 1 V-16 L10 -4 H0" fill="' + CR + '" stroke="' + D + '" stroke-width="1.2"/>',
    volcano: '<path d="M-17 11 L-5 -8 H5 L17 11Z" fill="' + D + '"/><path d="M-5 -8 Q-4 -1 -7 5 M3 -8 Q5 0 2 6" stroke="#e8623c" stroke-width="2.4" fill="none"/><path d="M-2 -10 q-4 -6 1 -10 q5 -3 3 -7" stroke="#a89a8a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
  };
  var tufts = function (x0, x1, rnd) { var o = ''; for (var i = 0; i < 9; i++) { var x = x0 + 60 + rnd() * (x1 - x0 - 120), y = 120 + rnd() * 420; o += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' l3 -9 l3 9 l3 -7 l3 7" stroke="' + R + '" stroke-width="1.6" fill="none" opacity=".45"/>'; } return o; };
  // each world's landmark, drawn like a siapo stencil: x0 = the world's left edge, w = its width
  function landmark(wd, x0, w) {
    var X = function (f) { return (x0 + f * w).toFixed(0); }, o = '';
    var hills = function (y, amp, c, op) { var p = 'M' + x0 + ' 576'; for (var x = 0; x <= w; x += 30) p += ' L' + (x0 + x) + ' ' + (y - amp * Math.abs(Math.sin(x / 160 + y))).toFixed(0); return '<path d="' + p + ' L' + (x0 + w) + ' 576Z" fill="' + c + '" opacity="' + (op || .35) + '"/>'; };
    var sun = function (fx, y, r) { var s = '<circle cx="' + X(fx) + '" cy="' + y + '" r="' + r + '" fill="' + R + '" opacity=".5"/>'; for (var a = 0; a < 12; a++) { var t = a * Math.PI / 6; s += '<path d="M' + (+X(fx) + Math.cos(t) * (r + 6)).toFixed(0) + ' ' + (y + Math.sin(t) * (r + 6)).toFixed(0) + ' L' + (+X(fx) + Math.cos(t) * (r + 16)).toFixed(0) + ' ' + (y + Math.sin(t) * (r + 16)).toFixed(0) + '" stroke="' + R + '" stroke-width="4" opacity=".5"/>'; } return s; };
    var needle = function (fx) { var x = +X(fx); return '<g opacity=".5" fill="' + D + '"><path d="M' + (x - 26) + ' 576 L' + (x - 6) + ' 330 L' + (x + 6) + ' 330 L' + (x + 26) + ' 576 L' + (x + 16) + ' 576 L' + (x + 3) + ' 380 L' + (x - 3) + ' 380 L' + (x - 16) + ' 576Z"/><path d="M' + (x - 52) + ' 318 Q' + x + ' 300 ' + (x + 52) + ' 318 L' + (x + 34) + ' 334 H' + (x - 34) + 'Z"/><path d="M' + (x - 30) + ' 312 Q' + x + ' 290 ' + (x + 30) + ' 312Z" fill="' + R + '"/><path d="M' + x + ' 298 V250" stroke="' + D + '" stroke-width="4"/><path d="M' + (x - 30) + ' 450 H' + (x + 30) + '" stroke="' + D + '" stroke-width="3"/></g>'; };
    var skytower = function (fx) { var x = +X(fx); return '<g opacity=".5" fill="' + D + '"><path d="M' + (x - 9) + ' 576 L' + (x - 5) + ' 330 H' + (x + 5) + ' L' + (x + 9) + ' 576Z"/><path d="M' + (x - 18) + ' 576 L' + (x - 4) + ' 520 M' + (x + 18) + ' 576 L' + (x + 4) + ' 520" stroke="' + D + '" stroke-width="4"/><rect x="' + (x - 22) + '" y="300" width="44" height="34" rx="10"/><rect x="' + (x - 16) + '" y="308" width="32" height="7" fill="' + CR + '"/><path d="M' + x + ' 300 V196" stroke="' + D + '" stroke-width="5"/><path d="M' + x + ' 196 V160" stroke="' + D + '" stroke-width="2.5"/></g>'; };
    var falls = function (fx) { var x = +X(fx); return '<g opacity=".45"><path d="M' + (x - 90) + ' 576 V360 Q' + (x - 60) + ' 330 ' + (x - 24) + ' 340 V576Z M' + (x + 24) + ' 576 V350 Q' + (x + 60) + ' 320 ' + (x + 96) + ' 352 V576Z" fill="#2f6a42"/><rect x="' + (x - 24) + '" y="344" width="48" height="190" fill="#9cc9dd"/>' + [-14, -2, 10].map(function (d) { return '<path d="M' + (x + d) + ' 350 V530" stroke="#f6e8cc" stroke-width="2.5" stroke-dasharray="18 10"/>'; }).join('') + '<ellipse cx="' + x + '" cy="540" rx="60" ry="14" fill="#9cc9dd"/><path d="M' + (x - 40) + ' 534 q10 -10 20 0 M' + (x + 14) + ' 536 q10 -10 20 0" stroke="#f6e8cc" stroke-width="2.5" fill="none"/></g>'; };
    var big = function (kind, fx, y, s) { return '<g transform="translate(' + X(fx) + ' ' + y + ') scale(' + s + ')" opacity=".5">' + ICON[kind] + '</g>'; };
    var sea = function (y) { var s = '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="' + (576 - y) + '" fill="#3a8fa3" opacity=".22"/>'; for (var x = 20; x < w; x += 46) s += '<path d="M' + (x0 + x) + ' ' + (y + 22 + (x % 3) * 10) + ' q8 -8 16 0 t16 0" stroke="' + D + '" stroke-width="2" fill="none" opacity=".35"/>'; return s; };
    if (wd === 'bay') o = hills(470, 60, T) + sea(520) + '<path d="M' + X(.15) + ' 520 H' + X(.85) + '" stroke="' + D + '" stroke-width="5" opacity=".45"/>' + [.2, .3, .4, .5, .6, .7, .8].map(function (f) { return '<path d="M' + X(f) + ' 520 v14" stroke="' + D + '" stroke-width="4" opacity=".45"/>'; }).join('') + big('palm', .9, 470, 3) + big('town', .1, 500, 2.4);
    if (wd === 'la') o = sun(.8, 120, 34) + hills(500, 40, T) + sea(530) + [.55, .62, .69, .76].map(function (f, i) { return big('palm', f, 480 - i * 4, 3.6); }).join('') + big('city', .12, 492, 3);
    if (wd === 'utah') o = '<path d="M' + x0 + ' 576 L' + X(.08) + ' 360 L' + X(.18) + ' 430 L' + X(.3) + ' 300 L' + X(.42) + ' 420 L' + X(.55) + ' 330 L' + X(.68) + ' 440 L' + X(.8) + ' 310 L' + X(.92) + ' 420 L' + (x0 + w) + ' 380 L' + (x0 + w) + ' 576Z" fill="' + D + '" opacity=".28"/>' + [[.3, 300], [.55, 330], [.8, 310]].map(function (p) { return '<path d="M' + (+X(p[0]) - 22) + ' ' + (p[1] + 34) + ' L' + X(p[0]) + ' ' + p[1] + ' L' + (+X(p[0]) + 22) + ' ' + (p[1] + 34) + ' L' + X(p[0]) + ' ' + (p[1] + 24) + 'Z" fill="' + CR + '" opacity=".8"/>'; }).join('') + big('arch', .14, 520, 3) + big('pine', .62, 530, 2.4) + big('pine', .7, 536, 2);
    if (wd === 'nw') o = '<path d="M' + X(.45) + ' 576 L' + X(.62) + ' 300 L' + X(.79) + ' 576Z" fill="' + D + '" opacity=".25"/><path d="M' + X(.58) + ' 370 L' + X(.62) + ' 300 L' + X(.66) + ' 370 L' + X(.62) + ' 350Z" fill="' + CR + '" opacity=".8"/>' + needle(.2) + [.06, .12, .86, .92, .97].map(function (f) { return big('pine', f, 530, 2.6); }).join('') + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return '<path d="M' + X(.3 + i * .045) + ' 130 l-6 16" stroke="#3a6f8f" stroke-width="2" opacity=".35"/>'; }).join('');
    if (wd === 'ny') { for (var i = 0; i < 16; i++) { var bh = 60 + (i * 37 % 140); o += '<rect x="' + X(.32 + i * .035) + '" y="' + (576 - bh) + '" width="' + (w * .03).toFixed(0) + '" height="' + bh + '" fill="' + (i % 3 ? D : R) + '" opacity=".3"/>'; }
      o += '<g transform="translate(' + X(.12) + ' 576)" opacity=".4"><path d="M-14 0 L-10 -40 L10 -40 L14 0Z M-8 -40 L-6 -100 L6 -100 L8 -40Z" fill="#4f8f7f"/><circle cx="0" cy="-110" r="10" fill="#4f8f7f"/><path d="M6 -112 L16 -150 M12 -150 h8 l-4 -10z" stroke="#4f8f7f" stroke-width="5" fill="#e2a72e"/><path d="M-10 -116 l-4 -10 M-4 -119 l-2 -11 M4 -119 l2 -11 M10 -116 l4 -10" stroke="#4f8f7f" stroke-width="3"/></g>'; }
    if (wd === 'hi') o = sea(500) + '<path d="M' + X(.55) + ' 500 Q' + X(.62) + ' 380 ' + X(.72) + ' 400 Q' + X(.8) + ' 420 ' + X(.86) + ' 500Z" fill="' + D + '" opacity=".3"/>' + big('fale', .2, 470, 3) + big('palm', .1, 470, 3.4) + big('palm', .92, 480, 3) + big('wave', .4, 540, 2.4);
    if (wd === 'as') o = sea(510) + '<path d="M' + X(.5) + ' 510 Q' + X(.6) + ' 420 ' + X(.64) + ' 300 Q' + X(.68) + ' 420 ' + X(.82) + ' 510Z" fill="#2f6a42" opacity=".35"/>' + '<ellipse cx="' + X(.64) + '" cy="292" rx="44" ry="14" fill="' + CR + '" opacity=".85"/>' + big('fale', .16, 480, 3) + big('canoe', .38, 545, 2.2) + big('church', .9, 480, 2.4);
    if (wd === 'fiji') o = sun(.2, 120, 28) + sea(450) + [[.3, 470, 2.2], [.55, 490, 3], [.8, 460, 2]].map(function (p) { return big('island', p[0], p[1], p[2]); }).join('') + big('canoe', .68, 540, 2.6);
    if (wd === 'nz') o = sea(500) + '<path d="M' + X(.08) + ' 500 Q' + X(.25) + ' 420 ' + X(.42) + ' 500Z" fill="' + D + '" opacity=".3"/>' + skytower(.78) + '<g transform="translate(' + X(.55) + ' 560)" opacity=".45"><path d="M0 0 Q-6 -60 20 -90" stroke="#2f6a42" stroke-width="4" fill="none"/><path d="M20 -90 a9 9 0 1 1 -10 -2" stroke="#2f6a42" stroke-width="4" fill="none"/>' + [-70, -55, -40, -25].map(function (y) { return '<path d="M' + (y > -50 ? -2 : 4) + ' ' + y + ' q-18 -4 -26 6 M' + (y > -50 ? 0 : 6) + ' ' + y + ' q16 -10 26 -4" stroke="#2f6a42" stroke-width="3" fill="none"/>'; }).join('') + '</g>';
    if (wd === 'apia') o = sea(520) + '<g opacity=".42"><rect x="' + X(.18) + '" y="410" width="30" height="110" fill="' + D + '"/><circle cx="' + (+X(.18) + 15) + '" cy="436" r="10" fill="' + CR + '"/><path d="M' + (+X(.18) + 15) + ' 436 v-6 M' + (+X(.18) + 15) + ' 436 h5" stroke="' + D + '" stroke-width="2"/><path d="M' + (+X(.18) - 4) + ' 410 L' + (+X(.18) + 15) + ' 386 L' + (+X(.18) + 34) + ' 410Z" fill="' + R + '"/></g>' + big('church', .72, 470, 4) + big('canoe', .45, 550, 2);
    if (wd === 'upolu') o = sea(500) + falls(.64) + '<g opacity=".42"><ellipse cx="' + X(.25) + '" cy="535" rx="56" ry="22" fill="#2a7f95"/><path d="M' + (+X(.25) + 30) + ' 505 v40 M' + (+X(.25) + 40) + ' 505 v40 M' + (+X(.25) + 30) + ' 515 h10 M' + (+X(.25) + 30) + ' 527 h10 M' + (+X(.25) + 30) + ' 539 h10" stroke="' + D + '" stroke-width="2.5"/></g>' + big('fale', .88, 480, 3) + big('palm', .48, 470, 3);
    if (wd === 'savaii') o = '<path d="M' + X(.3) + ' 576 L' + X(.5) + ' 290 H' + X(.58) + ' L' + X(.8) + ' 576Z" fill="' + D + '" opacity=".3"/><path d="M' + X(.52) + ' 292 Q' + X(.5) + ' 420 ' + X(.42) + ' 576 M' + X(.56) + ' 292 Q' + X(.6) + ' 430 ' + X(.66) + ' 576" stroke="#e8623c" stroke-width="7" opacity=".45" fill="none"/>' + sea(540) + '<g opacity=".45"><path d="M' + X(.12) + ' 540 q-8 -50 -20 -80 M' + X(.12) + ' 540 q0 -60 0 -96 M' + X(.12) + ' 540 q8 -50 20 -80" stroke="#6aa6c4" stroke-width="5" fill="none" stroke-linecap="round"/></g>' + big('fale', .92, 480, 3) + '<path d="M' + X(.84) + ' 430 Q' + X(.92) + ' 450 ' + X(.99) + ' 430" stroke="' + R + '" stroke-width="1.5" fill="none" opacity=".6"/>' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<circle cx="' + X(.85 + i * .024) + '" cy="' + (436 + (i > 2 ? 5 - i : i) * 4) + '" r="3" fill="#e2a72e" opacity=".8"/>'; }).join('');
    return o;
  }

  var MH = 620, SEG = 126, GAP = 54, LAY = null;
  function layout() {
    if (LAY) return LAY;
    var x = GAP;   // a band of tapa before the first world and after the last
    WORLDS.forEach(function (w, wi) {
      var n = w.list.length, talks = w.list.filter(function (nd) { return nd.talk; }).length, ww = 170 + n * SEG + 40 * talks, extra = 0; w.x0 = x; w.x1 = x + ww;
      // an elder's house gets a little more room on each side (its flag and its name are wider)
      w.list.forEach(function (nd, j) { if (nd.talk) extra += 20; var t = j * 1.05 + wi * 2.2, y = 340 + 120 * Math.sin(t); nd.p = [x + 110 + j * SEG + extra, Math.round(Math.max(190, Math.min(468, y)))]; if (nd.talk) extra += 20; });
      var a = w.list[Math.min(1, n - 1)].p, b = w.list[Math.min(2, n - 1)].p, my = (a[1] + b[1]) / 2;
      w.bonus = [(a[0] + b[0]) / 2, my > 330 ? my - 128 : my + 128];
      x += ww + GAP;
    });
    LAY = { W: x };
    return LAY;
  }
  // a smooth path through the nodes (Catmull-Rom as Bézier curves), one piece between each pair
  function seg(i) {
    var p0 = (NODES[i - 1] || NODES[i]).p, p1 = NODES[i].p, p2 = NODES[i + 1].p, p3 = (NODES[i + 2] || NODES[i + 1]).p;
    var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return 'M' + p1[0] + ' ' + p1[1] + ' C' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ' ' + c2[1].toFixed(1) + ' ' + p2[0] + ' ' + p2[1];
  }
  function mapSVG() {
    var Lw = layout().W, o = [], rnd = (function (s) { return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })(11);
    o.push('<defs><pattern id="gm-nifo" width="26" height="22" patternUnits="userSpaceOnUse"><rect width="26" height="22" fill="' + D + '"/><path d="M0 22 L13 3 L26 22Z" fill="' + T + '"/><path d="M7 22 L13 12 L19 22Z" fill="' + D + '"/></pattern>' +
      '<pattern id="gm-diam" width="27" height="27" patternUnits="userSpaceOnUse"><rect width="27" height="27" fill="' + D + '"/><path d="M13.5 2 L25 13.5 L13.5 25 L2 13.5Z" fill="' + T + '"/><path d="M13.5 8 L19 13.5 L13.5 19 L8 13.5Z" fill="' + D + '"/><circle cx="13.5" cy="13.5" r="2" fill="' + CR + '"/></pattern>' +
      '<pattern id="gm-fiber" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 2 H9 M0 6.5 H9" stroke="#c9a46e" stroke-width=".7" opacity=".55"/><path d="M3 0 V9" stroke="#efdcb4" stroke-width=".5" opacity=".5"/></pattern></defs>');
    o.push('<rect width="' + Lw + '" height="' + MH + '" fill="#e6cc9a"/><rect width="' + Lw + '" height="' + MH + '" fill="url(#gm-fiber)"/>');
    WORLDS.forEach(function (w, wi) {
      var ww = w.x1 - w.x0, lv = levelOf(w);
      o.push('<rect x="' + w.x0 + '" y="44" width="' + ww + '" height="532" fill="' + (TINT[w.art] || T) + '" opacity=".16"/>');
      o.push(landmark(w.art, w.x0, ww), tufts(w.x0, w.x1, rnd));
      o.push('<path d="M' + w.x0 + ' 54 H' + w.x1 + ' M' + w.x0 + ' 566 H' + w.x1 + '" stroke="' + R + '" stroke-width="2" stroke-dasharray="10 5"/>');
      // the world's sign
      var name = esc('World ' + (wi + 1) + ': ' + w.name), wd = Math.max(220, name.length * 10.5 + 70);
      o.push('<g transform="translate(' + (w.x0 + (wi && WORLDS[wi - 1].level !== w.level ? 56 : 26)) + ' 70)"><rect width="' + wd + '" height="' + (w.sm && w.sm !== w.name ? 70 : 54) + '" rx="8" fill="' + CR + '" stroke="' + D + '" stroke-width="3"/><rect x="5" y="5" width="' + (wd - 10) + '" height="' + (w.sm && w.sm !== w.name ? 60 : 44) + '" rx="5" fill="none" stroke="' + R + '" stroke-width="1.2" stroke-dasharray="4 3"/>' +
        '<text x="16" y="34" font-family="Times New Roman, serif" font-size="22" fill="' + D + '">' + name + '</text>' +
        (w.sm && w.sm !== w.name ? '<text x="16" y="56" font-family="Times New Roman, serif" font-style="italic" font-size="15" fill="' + R + '">' + esc(w.sm) + '</text>' : '') +
        '<g transform="translate(' + (wd - 46) + ' 14)"><rect width="36" height="24" rx="12" fill="' + D + '"/><text x="18" y="17" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="' + CR + '">' + esc(lv.name) + '</text></g></g>');
      if (!wi) o.push('<rect x="0" y="0" width="' + GAP + '" height="' + MH + '" fill="url(#gm-diam)"/>');
      o.push('<rect x="' + w.x1 + '" y="0" width="' + GAP + '" height="' + MH + '" fill="url(#gm-diam)"/>');
      if (wi < WORLDS.length - 1) {
        var nxt = WORLDS[wi + 1];
        if (nxt.level !== w.level) { var lx = w.x1 + GAP / 2; o.push('<g transform="translate(' + lx + ' 110)"><circle r="40" fill="' + CR + '" stroke="' + D + '" stroke-width="4"/><circle r="33" fill="none" stroke="' + R + '" stroke-width="1.5" stroke-dasharray="3 3"/><text y="7" text-anchor="middle" font-family="Times New Roman, serif" font-size="26" fill="' + D + '">' + esc(nxt.level) + '</text><text y="26" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="' + R + '">BEGINS</text></g>'); }
      }
    });
    o.push('<rect width="' + Lw + '" height="44" fill="url(#gm-nifo)"/><rect y="576" width="' + Lw + '" height="44" fill="url(#gm-nifo)" transform="rotate(180 ' + (Lw / 2) + ' 598)"/>');
    o.push('<path d="M0 44 H' + Lw + ' M0 576 H' + Lw + '" stroke="' + CR + '" stroke-width="2"/>');
    // the path: a cream road with a dark edge and stitches, faded past where you can go
    var far = Math.max(frontier(), G0().reach || 0), segs = [], outl = [], body = [], stitch = [];
    for (var i = 0; i < NODES.length - 1; i++) { var d = seg(i), lock = i + 1 > far; outl.push('<path d="' + d + '" stroke="' + D + '" stroke-width="24" fill="none" stroke-linecap="round" opacity="' + (lock ? .3 : .85) + '"/>'); body.push('<path d="' + d + '" stroke="' + CR + '" stroke-width="17" fill="none" stroke-linecap="round" opacity="' + (lock ? .45 : 1) + '"/>'); stitch.push('<path id="gm-s' + i + '" d="' + d + '" stroke="' + R + '" stroke-width="3" fill="none" stroke-dasharray="3 9" stroke-linecap="round" opacity="' + (lock ? .3 : .9) + '"/>'); }
    o.push(outl.join(''), body.join(''), stitch.join(''));
    // a review hut per world (a basket), up a little side path
    WORLDS.forEach(function (w) {
      var a = w.list[Math.min(1, w.list.length - 1)].p, b = w.bonus, open = w.list.some(isDone);
      o.push('<path d="M' + a[0] + ' ' + a[1] + ' Q' + a[0] + ' ' + b[1] + ' ' + b[0] + ' ' + b[1] + '" stroke="' + R + '" stroke-width="3" fill="none" stroke-dasharray="2 7" opacity="' + (open ? .8 : .3) + '"/>');
      o.push('<g class="gm-node gm-bonus' + (open ? '' : ' is-locked') + '" data-bonus="' + w.i + '" transform="translate(' + b[0] + ' ' + b[1] + ')" tabindex="-1"><circle r="24" fill="' + (open ? '#f2c14e' : '#cbb48a') + '" stroke="' + D + '" stroke-width="3"/><text y="8" text-anchor="middle" font-size="22">🧺</text></g>');
    });
    NODES.forEach(function (nd) {
      var x = nd.p[0], y = nd.p[1], done = isDone(nd), open = isOpen(nd.i), st = starsOf(nd), r = nd.talk ? 40 : 32;
      var cls = 'gm-node' + (done ? ' is-done' : '') + (open ? '' : ' is-locked') + (nd.talk ? ' is-talk' : '') + (nd.i === far && !done ? ' is-next' : '');
      var g = '<g class="' + cls + '" data-i="' + nd.i + '" transform="translate(' + x + ' ' + y + ')"><g class="gm-pop">';
      if (nd.talk) g += '<path d="M' + (r - 6) + ' ' + (-r + 4) + ' V' + (-r - 34) + '" stroke="' + D + '" stroke-width="3"/><path d="M' + (r - 6) + ' ' + (-r - 34) + ' l22 7 l-22 7z" fill="' + (done ? '#f2c14e' : R) + '"/>';
      g += '<circle r="' + (r + 5) + '" fill="' + D + '"/><circle r="' + r + '" fill="' + (done ? '#f2c14e' : open ? CR : '#cbb48a') + '"/><circle r="' + (r - 5) + '" fill="none" stroke="' + R + '" stroke-width="1.4" stroke-dasharray="3 3" opacity=".7"/>';
      if (nd.talk) g += '<text y="13" text-anchor="middle" font-size="36"' + (open ? '' : ' opacity=".45"') + '>' + esc(nd.stop.host.face) + '</text>';
      else g += '<g' + (open ? '' : ' opacity=".35"') + ' transform="scale(1.2)">' + (ICON[w0(nd)] || ICON.town) + '</g>';
      g += '</g>';
      if (!open) g += '<g transform="translate(' + (r - 8) + ' ' + (r - 10) + ')"><rect x="-9" y="-4" width="18" height="14" rx="3" fill="' + D + '"/><path d="M-5 -4 v-4 a5 5 0 0 1 10 0 v4" stroke="' + D + '" stroke-width="3" fill="none"/></g>';
      var lab = nd.talk ? esc(TALK_NAME[nd.stop.id] || nd.stop.place) : String(nd.num), lw = nd.talk ? Math.max(56, lab.length * 7.4 + 18) : 34;
      g += '<g transform="translate(0 ' + (r + 18) + ')"><rect x="' + (-lw / 2) + '" y="-12" width="' + lw + '" height="22" rx="11" fill="' + D + '"/><text y="4" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="' + (nd.talk ? 11.5 : 13) + '" fill="' + CR + '">' + lab + '</text></g>';
      if (st) g += '<g transform="translate(0 ' + (-r - 14) + ')">' + [0, 1, 2].map(function (k) { return '<path transform="translate(' + ((k - 1) * 17) + ' ' + (k === 1 ? -4 : 0) + ') scale(.8)" d="M0 -9 L2.6 -3 L9 -2.8 L4 1.4 L5.6 8 L0 4.4 L-5.6 8 L-4 1.4 L-9 -2.8 L-2.6 -3Z" fill="' + (k < st ? '#f2c14e' : CR) + '" stroke="' + D + '" stroke-width="1.6"/>'; }).join('') + '</g>';
      o.push(g + '</g>');
    });
    var me = NODES[Math.min(G0().at || 0, NODES.length - 1)].p;
    o.push('<g id="gm-me" transform="translate(' + me[0] + ' ' + (me[1] - 30) + ')">' + sprite() + '</g>');
    return '<svg class="gm-svg" viewBox="0 0 ' + Lw + ' ' + MH + '" role="img" aria-label="The map of lesonas, from the Bay to Savaiʻi">' + o.join('') + '</svg>';
  }
  var TALK_NAME = { home: 'Nana’s 80th', upolu: 'Upolu village', laie: 'Lāʻie', akl: 'South Auckland', utah: 'Salt Lake' };
  var w0 = function (nd) { var w = nd.w, j = w.list.indexOf(nd); return w.icons[j % w.icons.length]; };

  // ---- the map view ----
  var MAP = null;   // { scroll, svg, sheet, walking }
  function gameMap(after) {
    tab('map'); view.classList.add('is-map'); drawStats();
    var scroll = h('div', { class: 'gm-scroll', tabindex: '0', 'aria-label': 'The map. Use the arrow keys to walk, Enter to open.' });
    scroll.innerHTML = mapSVG();
    var chip = h('div', { class: 'gm-where', 'aria-live': 'polite' }), sheet = h('div', { class: 'gm-sheet', hidden: true, role: 'dialog', 'aria-label': 'Lesona' });
    var prev = h('button', { type: 'button', class: 'gm-arrow is-l', 'aria-label': 'The world before' }, '‹'), nextB = h('button', { type: 'button', class: 'gm-arrow is-r', 'aria-label': 'The next world' }, '›');
    var goal = G0().goal || 2, n = todayN();
    var banner = n >= goal ? h('div', { class: 'gm-goal' }, '🌙 ', h('b', { text: 'Mālō! That’s today’s ' + goal + '.' }), ' Keep going if you like, or come back tomorrow.') : null;
    var wrap = h('div', { class: 'gm-wrap' }, scroll, chip, prev, nextB, sheet, banner);
    var nx = NODES[frontier()], due = dueNow().length;
    var below = h('div', { class: 'gm-below' },
      nx ? h('button', { type: 'button', class: 'gm-next', on: { click: function () { walkTo(nx.i, function () { openSheet(nx); }); } } }, h('span', { class: 'gm-num', 'aria-hidden': 'true', text: nx.talk ? nx.stop.host.face : nx.num }), h('span', null, h('small', { text: 'Next' }), h('b', { text: nx.talk ? nx.stop.title : nx.L.title }))) : null,
      due ? h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { session('review'); } } }, 'Review ' + Math.min(20, due)) : null);
    fill(view, wrap, below);
    MAP = { scroll: scroll, svg: scroll.firstChild, sheet: sheet, chip: chip };
    function size() {
      var top = wrap.getBoundingClientRect().top + window.scrollY, H = Math.max(380, Math.min(860, window.innerHeight - Math.max(0, top - window.scrollY) - 6)), s;
      if (window.innerWidth < 640) H = Math.min(H, Math.round(MH * .82));   // a phone held upright sees more of the path, with the next bubble under it
      s = H / MH;
      MAP.s = s; MAP.svg.setAttribute('height', H); MAP.svg.setAttribute('width', Math.round(layout().W * s)); wrap.style.height = H + 'px';
    }
    size();
    var centreOn = function (p, smooth) { scroll.scrollTo({ left: Math.max(0, p[0] * MAP.s - scroll.clientWidth / 2), behavior: smooth ? 'smooth' : 'auto' }); };
    var cur = NODES[Math.min(G0().at || 0, NODES.length - 1)];
    centreOn(cur.p);
    function where() { var mid = (scroll.scrollLeft + scroll.clientWidth / 2) / MAP.s, w = WORLDS.find(function (x) { return mid < x.x1 + GAP; }) || WORLDS[WORLDS.length - 1], lv = levelOf(w); chip.textContent = w.name + ' · ' + lv.name + (lv.actfl ? ' (ACTFL ' + lv.actfl + ')' : ''); MAP.w = w; }
    where(); scroll.addEventListener('scroll', where, { passive: true });
    // a mouse wheel scrolls the map sideways
    scroll.addEventListener('wheel', function (e) { if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; e.preventDefault(); scroll.scrollLeft += e.deltaY; }, { passive: false });
    prev.addEventListener('click', function () { var w = WORLDS[Math.max(0, MAP.w.i - 1)]; scroll.scrollTo({ left: w.x0 * MAP.s, behavior: 'smooth' }); });
    nextB.addEventListener('click', function () { var w = WORLDS[Math.min(WORLDS.length - 1, MAP.w.i + 1)]; scroll.scrollTo({ left: w.x0 * MAP.s, behavior: 'smooth' }); });
    window.addEventListener('resize', function rs() { if (!MAP || MAP.scroll !== scroll || !scroll.isConnected) return window.removeEventListener('resize', rs); size(); where(); });
    scroll.addEventListener('click', function (e) {
      var g = e.target.closest('.gm-node'); if (!g) return;
      if (g.dataset.bonus != null) { var w = WORLDS[+g.dataset.bonus]; return w.list.some(isDone) ? worldReview(w) : openSheet(null, w); }
      var i = +g.dataset.i; walkTo(i, function () { openSheet(NODES[i]); });
    });
    scroll.addEventListener('keydown', function (e) {
      var at = G0().at || 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); var to = at + (e.key === 'ArrowRight' ? 1 : -1); if (to >= 0 && to < NODES.length && isOpen(to)) walkTo(to); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(NODES[at]); }
    });
    if (after) after();
    else if (!G0().seen) { G0().seen = 1; save(); openSheet(null, null, true); }
  }
  function placeMe(p, face) { var me = MAP && MAP.svg.querySelector('#gm-me'); if (!me) return; me.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + (p[1] - 30).toFixed(1) + ')' + (face < 0 ? ' scale(-1 1)' : '')); }
  // walk along the path from where you stand to node i (far jumps go in one hop)
  function walkTo(i, then) {
    var g = G0(), from = Math.min(g.at || 0, NODES.length - 1);
    if (!MAP || i === from || !isOpen(i)) { if (isOpen(i)) { g.at = i; save(); } return then && then(); }
    closeSheet();
    var dir = i > from ? 1 : -1, list = [], reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (var k = from; k !== i; k += dir) list.push(dir > 0 ? k : k - 1);
    g.at = i; save();
    if (reduce || list.length > 5) { placeMe(NODES[i].p, dir); MAP.scroll.scrollTo({ left: Math.max(0, NODES[i].p[0] * MAP.s - MAP.scroll.clientWidth / 2), behavior: 'smooth' }); return then && setTimeout(then, reduce ? 0 : 250); }
    var paths = list.map(function (s) { return MAP.svg.querySelector('#gm-s' + s); }), lens = paths.map(function (p) { return p.getTotalLength(); }), total = lens.reduce(function (a, b) { return a + b; }, 0);
    var dur = Math.min(1600, total / .34), t0 = performance.now();
    (function step(now) {
      var d = Math.min(1, (now - t0) / dur) * total, k = 0;
      while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
      var p = paths[k].getPointAtLength(dir > 0 ? Math.min(d, lens[k]) : Math.max(0, lens[k] - d));
      placeMe([p.x, p.y], dir);
      var sx = p.x * MAP.s - MAP.scroll.clientWidth / 2; if (Math.abs(MAP.scroll.scrollLeft - sx) > MAP.scroll.clientWidth * .3) MAP.scroll.scrollLeft += (sx - MAP.scroll.scrollLeft) * .12;
      if (now - t0 < dur) requestAnimationFrame(step); else { placeMe(NODES[i].p, dir); if (then) then(); }
    })(t0);
  }
  function closeSheet() { if (MAP && MAP.sheet) { MAP.sheet.hidden = true; fill(MAP.sheet); } }
  // the little card that opens over the map: a lesona to play, a talk to go to, a world's basket, or the welcome
  function openSheet(nd, w, welcome) {
    if (!MAP) return; var sh = MAP.sheet; sh.hidden = false;
    var x = h('button', { type: 'button', class: 'gm-x', 'aria-label': 'Close', on: { click: closeSheet } }, '✕');
    if (welcome) {
      fill(sh, x, h('p', { class: 'ts-kicker', text: 'Tālofa lava' }), h('h2', { text: 'The map of lesonas' }),
        h('p', { text: 'Every lesona, from the Peace Corps handbook and written for this app, in one path from A1 to B1, across twelve worlds from the Bay to Savaiʻi. Each world ends at an elder’s house: talk with them in Samoan, and earn a 🌺 for every respectful answer.' }),
        h('p', { text: 'Tap a bubble to walk there. Each one is a few minutes.' }),
        J.story && J.story.lede ? h('p', { class: 'ts-credit', text: J.story.lede }) : null,
        h('form', { class: 'tj-name', on: { submit: function (e) { e.preventDefault(); var v = e.target.querySelector('input').value.trim().slice(0, 30); if (v) J0().name = v; save(); closeSheet(); openSheet(NODES[G0().at || 0]); } } },
          h('input', { type: 'text', maxlength: '30', placeholder: 'What should the family call you?', 'aria-label': 'Your name', autocomplete: 'given-name', value: J0().name || '' }),
          h('button', { type: 'submit', class: 'ts-btn' }, 'Start here')));
      return;
    }
    if (!nd) {
      fill(sh, x, h('p', { class: 'ts-kicker', text: w.name }), h('h2', { text: 'The basket of words' }), h('p', { text: 'Finish a lesona in this world and its words go in the basket. Then come back here to review the whole world at once.' }));
      return;
    }
    var lv = levelOf(nd.w), open = isOpen(nd.i), st = starsOf(nd), L = nd.L;
    var stars = h('p', { class: 'gm-stars', 'aria-label': st + ' of 3 stars' }, [0, 1, 2].map(function (k) { return h('span', { class: k < st ? 'on' : '', text: '★' }); }));
    var meta = h('p', { class: 'ts-kicker', text: nd.w.name + ' · ' + lv.name + (nd.talk ? ' · A talk' : ' · ' + nd.src) });
    if (!open) {
      fill(sh, x, meta, h('h2', { text: nd.talk ? nd.stop.title : 'Lesona ' + nd.num + ': ' + L.title }), h('p', { text: 'Finish the one before to open the path, or jump ahead if you already know this part.' }),
        h('div', { class: 'ts-stats' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { G0().reach = Math.max(G0().reach || 0, nd.i); save(); gameMap(function () { walkTo(nd.i, function () { openSheet(nd); }); }); } } }, 'Jump ahead to here')));
      return;
    }
    if (nd.talk) {
      var s = nd.stop;
      fill(sh, x, meta, h('div', { class: 'gm-who' }, h('span', { class: 'tj-face', 'aria-hidden': 'true', text: s.host.face }), h('div', null, h('h2', { text: s.title }), h('p', { style: 'margin:0', text: s.place + ', ' + s.region + ', with ' + host(s) + '.' }))),
        st ? stars : null,
        // the world's last house has the elder's challenge first; a talk already visited stays open
        (function () {
          var isBoss = nd === nd.w.list[nd.w.list.length - 1], b = isBoss && bossOf(nd.w);
          if (!isBoss) return h('div', { class: 'ts-stats' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { stopView(s); } } }, isDone(nd) ? 'Visit again' : 'Go in'));
          var heartsTxt = b ? '❤️'.repeat(b.hearts) + '🤍'.repeat(3 - b.hearts) : '';
          return [h('p', { class: 'bs-line' }, b ? [h('b', { text: 'Challenge cleared ' }), h('span', { 'aria-label': b.hearts + ' hearts', text: heartsTxt })] : [h('b', { text: s.host.name + '’s challenge: ' }), 'a fast quiz on all of ' + nd.w.name + ', three hearts.']),
            h('div', { class: 'ts-stats' },
              b || isDone(nd) ? h('button', { type: 'button', class: 'ts-btn', on: { click: function () { stopView(s); } } }, isDone(nd) ? 'Visit again' : 'Go in') : null,
              h('button', { type: 'button', class: b || isDone(nd) ? 'ts-btn ghost' : 'ts-btn', on: { click: function () { bossFight(nd.w); } } }, b ? (b.hearts < 3 ? 'Try for all three hearts' : 'Take it again') : '⚔️ Take the challenge'))];
        })());
      return;
    }
    var it = itemsOf(L), got = it.filter(function (y) { return learned(y.k); }).length;
    fill(sh, x, meta, h('h2', { text: 'Lesona ' + nd.num + ': ' + L.title }), L.summary ? h('p', { class: 'gm-sum', text: L.summary }) : null,
      h('p', { class: 'ts-credit', style: 'margin:.2rem 0 .6rem', text: it.length + ' words and phrases' + (got ? ', ' + got + ' learned' : '') + '.' }),
      st ? stars : null,
      h('div', { class: 'ts-stats' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { session(L); } } }, st ? 'Play again' : 'Play'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { lesson(L); } } }, 'Read the lesona')));
    var b = sh.querySelector('.ts-btn'); if (b) b.focus({ preventScroll: true });
  }
  // a whole world's review: its words, due ones first
  function worldReview(w) {
    var it = []; w.list.forEach(function (nd) { if (isDone(nd)) it = it.concat(itemsOf(nd.L)); });
    var now = Date.now(), due = it.filter(function (x) { return isDue(P.cards[x.k], now); }), rest = shuffle(it.filter(function (x) { return due.indexOf(x) < 0; }));
    var qs = due.concat(rest).slice(0, 12).map(function (x) { return P.cards[x.k] ? ask(x) : { kind: 'pick', x: x }; });
    if (!qs.length) return gameMap();
    run(qs, { node: null, world: w, title: w.name }, function (right, total) { bump(); clearView(null, right, total, w); });
  }
  // the level-clear screen after a lesona (stars, then back to the map, where the next bubble opens)
  function clearView(L, right, total, w) {
    again = null; view.classList.remove('is-map'); window.scrollTo(0, 0);
    var ratio = total ? right / total : 1, res = L ? markNode(L.node, ratio) : { stars: ratio >= .9 ? 3 : ratio >= .7 ? 2 : 1 }, nd = L && L.node;
    var nxt = nd && NODES[nd.i + 1], goal = G0().goal || 2;
    fill(view, h('div', { class: 'gm-clear' },
      h('p', { class: 'ts-kicker', text: nd ? 'Lesona ' + nd.num + ' · ' + nd.w.name : w.name + ' · the basket' }),
      h('div', { class: 'gm-bigstars', 'aria-label': res.stars + ' of 3 stars' }, [0, 1, 2].map(function (k) { return h('span', { class: k < res.stars ? 'on' : '', style: 'animation-delay:' + (k * .18) + 's', text: '★' }); })),
      h('h2', { text: ratio >= .9 ? 'Mālō lava!' : ratio >= .7 ? 'Mālō!' : 'Mālō le taumafai!' }),
      h('p', { class: 'ts-lede', text: right + ' of ' + total + ' right. ' + (ratio < .7 ? 'Mālō le taumafai means “well done for trying.” Play it again any time for more stars.' : '') }),
      todayN() === goal && res.first ? h('p', { class: 'gm-goal-done', text: '🌙 That’s today’s ' + goal + '. Mālō!' }) : null,
      h('div', { class: 'ts-stats', style: 'justify-content:center' },
        h('button', { type: 'button', class: 'ts-btn', on: { click: function () { gameMap(function () { if (nxt && isOpen(nxt.i)) setTimeout(function () { walkTo(nxt.i, function () { openSheet(nxt); }); }, 350); }); } } }, nxt ? 'On to the next one' : 'Back to the map'),
        L ? h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { session(L); } } }, 'Play again') : null)));
    drawStats(); view.querySelector('.ts-btn').focus();
  }

  // ---------- Lesonas: the whole list, by level and world ----------
  function listView() {
    tab('list'); again = listView; drawStats(); window.scrollTo(0, 0);
    var out = [], lastLv = '';
    WORLDS.forEach(function (w) {
      if (w.level !== lastLv) { lastLv = w.level; var lv = levelOf(w); out.push(h('div', { class: 'gm-lvl' }, h('h2', { text: lv.name + (lv.actfl ? ' · ACTFL ' + lv.actfl : '') }), h('p', { text: lv.can }))); }
      out.push(h('h3', { class: 'gm-wname', text: 'World ' + (w.i + 1) + ': ' + w.name }), h('p', { class: 'ts-credit', style: 'margin:.1rem 0 .5rem', text: w.line }),
        h('ol', { class: 'tj-list' }, w.list.map(function (nd) {
          var open = isOpen(nd.i), st = starsOf(nd);
          return h('li', null, h('button', { type: 'button', on: { click: function () { if (!open) { G0().reach = Math.max(G0().reach || 0, nd.i); save(); } G0().at = nd.i; save(); nd.talk ? stopView(nd.stop) : lesson(nd.L); } } },
            h('span', { class: 'gm-num', text: nd.talk ? nd.stop.host.face : nd.num }),
            h('span', null, h('strong', { style: 'display:block;color:var(--text-bright)', text: nd.talk ? nd.stop.title : nd.L.title }), h('small', { text: nd.talk ? 'A talk in ' + nd.stop.place : nd.src })),
            h('small', { class: 'gm-st', text: st ? '★★★'.slice(0, st) + '☆☆☆'.slice(0, 3 - st) : open ? '' : '🔒' })));
        })));
    });
    fill(view, h('p', { class: 'ts-lede', text: 'Every lesona on one path, A1 to B1. The levels follow the CEFR, the international scale, with the ACTFL scale (the one the AAPPL reports) beside it.' }), out, credit());
  }

  // ---------- Flashcards ----------
  var DIRS = [['mix', 'Mixed'], ['sm', 'Samoan → English'], ['en', 'English → Samoan'], ['type', 'Type it']];
  var dirOf = function () { return (P.fc && P.fc.dir) || 'mix'; };
  function fcView() {
    tab('cards'); again = fcView; drawStats(); window.scrollTo(0, 0);
    var due = dueNow().filter(function (k) { return ITEMS[k]; }), seen = Object.keys(P.cards).filter(function (k) { return ITEMS[k]; });
    var fresh = []; NODES.forEach(function (nd) { if (fresh.length < 8 && isOpen(nd.i)) itemsOf(nd.L).forEach(function (x) { if (fresh.length < 8 && !P.cards[x.k]) fresh.push(x); }); });
    var dirs = h('div', { class: 'ts-tabs', role: 'group', 'aria-label': 'Which way' }, DIRS.map(function (d) { return h('button', { type: 'button', 'aria-pressed': dirOf() === d[0] ? 'true' : 'false', 'aria-current': dirOf() === d[0] ? 'page' : null, on: { click: function () { P.fc = P.fc || {}; P.fc.dir = d[0]; save(); fcView(); } } }, d[1]); }));
    var lvls = ['A1', 'A2', 'B1'].map(function (lv) {
      var it = []; WORLDS.forEach(function (w) { if (w.level === lv) w.list.forEach(function (nd) { it = it.concat(itemsOf(nd.L)); }); });
      var u = {}; it = it.filter(function (x) { if (u[x.k]) return false; u[x.k] = 1; return true; });
      var got = it.filter(function (x) { return learned(x.k); }).length;
      return h('li', null, h('b', { text: lv }), h('span', { class: 'gm-meter' }, h('i', { style: 'width:' + (it.length ? 100 * got / it.length : 0).toFixed(1) + '%' })), h('small', { text: got + ' of ' + it.length }));
    });
    fill(view,
      h('div', { class: 'gm-fc' },
        h('div', null, h('p', { class: 'ts-kicker', text: 'Due now' }), h('b', { class: 'gm-big', text: due.length }), h('p', { class: 'ts-credit', style: 'margin:0', text: 'Words come back just before you’d forget them.' })),
        h('div', { class: 'ts-stats' },
          h('button', { type: 'button', class: 'ts-btn', disabled: !due.length, on: { click: function () { session('review'); } } }, due.length ? 'Review ' + Math.min(20, due.length) : 'Nothing due'),
          h('button', { type: 'button', class: 'ts-btn ghost', disabled: !seen.length, on: { click: function () { flipView((due.length ? due : shuffle(seen)).slice(0, 20).map(function (k) { return ITEMS[k]; })); } } }, 'Flip cards'),
          fresh.length ? h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { var qs = []; fresh.slice(0, 5).forEach(function (x) { qs.push({ kind: 'new', x: x }); }); fresh.slice(0, 5).forEach(function (x) { qs.push({ kind: 'pick', x: x }); }); run(qs, 'review'); } } }, 'Learn 5 new') : null)),
      h('h2', { class: 'gm-h', text: 'Which way' }), dirs,
      h('h2', { class: 'gm-h', text: 'Learned, by level' }), h('ul', { class: 'gm-levels' }, lvls),
      h('h2', { class: 'gm-h', text: 'By world' }),
      h('ol', { class: 'tj-list' }, WORLDS.map(function (w) {
        var it = []; w.list.forEach(function (nd) { it = it.concat(itemsOf(nd.L)); }); var have = it.filter(function (x) { return P.cards[x.k]; });
        return h('li', null, h('button', { type: 'button', disabled: !have.length, on: { click: function () { flipView(shuffle(have).slice(0, 20)); } } }, h('span', { class: 'gm-num', text: w.level }), h('span', null, h('strong', { style: 'display:block;color:var(--text-bright)', text: w.name }), h('small', { text: have.length + ' of ' + it.length + ' seen' })), h('small', { text: have.length ? 'Flip' : '' })));
      })));
  }
  // flip cards: the front, tap to turn it over, then say how it went (Again, Hard, Good, Easy: keys 1 to 4)
  function flipView(list) {
    again = null; tab2('cards'); window.scrollTo(0, 0);
    list = list.filter(Boolean); var i = 0, got = 0, d = dirOf();
    var bar = h('div', { class: 'ts-bar' }, h('i', { style: 'width:0%' })), box = h('div');
    fill(view, h('p', { class: 'ts-back' }, h('button', { type: 'button', class: 'ts-link', on: { click: function () { keyFlip = null; fcView(); } } }, '← Flashcards')), bar, box);
    function one() {
      bar.firstChild.style.width = (100 * i / list.length) + '%';
      if (i >= list.length) { keyFlip = null; fill(box, h('div', { class: 'ts-done' }, h('b', { text: got + ' / ' + list.length }), h('p', { class: 'ts-lede', text: 'Mālō! Those cards will come back when it’s time.' }), h('div', { class: 'ts-stats' }, h('button', { type: 'button', class: 'ts-btn', on: { click: fcView } }, 'Flashcards'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { gameMap(); } } }, 'The map')))); bump(); return; }
      var x = list[i], smFront = d === 'sm' || (d !== 'en' && Math.random() < .5), turned = false;
      var front = smFront ? h('p', { class: 'ts-prompt', lang: 'sm', text: x.sm }) : h('p', { class: 'ts-prompt is-en', text: x.en });
      var back = h('div', { class: 'gm-back', hidden: true }, smFront ? h('p', { class: 'ts-lede', text: x.en }) : h('p', { class: 'ts-prompt', lang: 'sm', text: x.sm }), x.note ? h('small', { text: x.note }) : null);
      var grades = h('div', { class: 'gm-grades', hidden: true }, [['Again', 'wrong'], ['Hard', 'almost'], ['Good', 'right'], ['Easy', 'easy']].map(function (g, n) {
        return h('button', { type: 'button', class: 'ts-btn' + (n ? ' ghost' : ''), on: { click: function () { grade(x.k, g[1] === 'easy' ? 'right' : g[1]); if (g[1] === 'easy') { var c = P.cards[x.k]; c.ivl = Math.max(4, Math.round(c.ivl * 1.4)); c.due = Date.now() + c.ivl * DAY; save(); } if (g[1] !== 'wrong') got++; i++; one(); } } }, h('kbd', { text: n + 1 }), ' ' + g[0]);
      }));
      var cardEl = h('div', { class: 'gm-card', role: 'button', tabindex: '0', 'aria-label': 'Turn the card over', on: { click: turn, keydown: pressKey } }, playBtn(x.sm), front, back);
      function turn() { if (turned) return; turned = true; cardEl.classList.add('is-turned'); back.hidden = false; grades.hidden = false; play(x.sm); grades.children[2].focus(); }
      fill(box, h('p', { class: 'ts-kicker', text: 'Card ' + (i + 1) + ' of ' + list.length }), cardEl, h('p', { class: 'ts-credit', style: 'text-align:center', text: 'Tap the card, or press Space, to turn it.' }), grades);
      keyFlip = function (k) { if (!turned) { if (k === ' ') turn(); return; } if (/^[1-4]$/.test(k)) grades.children[+k - 1].click(); };
      cardEl.focus({ preventScroll: true });
    }
    one();
  }
  var keyFlip = null;
  document.addEventListener('keydown', function (e) { if (keyFlip && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '') && (e.key === ' ' || /^[1-4]$/.test(e.key))) { if (e.key === ' ') e.preventDefault(); keyFlip(e.key); } });

  // ---------- You: your character, your numbers, your ʻato, and the real map of the journey ----------
  function youView() {
    tab('you'); again = youView; drawStats(); window.scrollTo(0, 0);
    var j = J0(), g = G0(), fl = flowers();
    var av = h('span', { class: 'gm-av' }); av.innerHTML = '<svg viewBox="-30 -64 60 72" width="96" height="116" aria-hidden="true">' + sprite() + '</svg>';
    var name = h('input', { type: 'text', maxlength: '30', value: j.name || '', placeholder: 'Your name', 'aria-label': 'Your name', on: { change: function () { J0().name = name.value.trim().slice(0, 30); save(); } } });
    var colors = h('div', { class: 'gm-colors', role: 'group', 'aria-label': 'Your lavalava' }, LAVA.map(function (c, k) {
      var lock = fl < c[2];
      return h('button', { type: 'button', class: 'gm-color' + ((g.color || 0) === k ? ' is-on' : ''), disabled: lock, title: lock ? c[0] + ': ' + c[2] + ' 🌺' : c[0], 'aria-label': c[0] + (lock ? ', at ' + c[2] + ' flowers' : ''), style: '--c:' + c[1], on: { click: function () { G0().color = k; save(); youView(); } } }, lock ? '🔒' : '');
    }));
    var goals = h('div', { class: 'ts-tabs', role: 'group', 'aria-label': 'A day' }, [1, 2, 3, 5].map(function (n) { return h('button', { type: 'button', 'aria-current': (g.goal || 2) === n ? 'page' : null, on: { click: function () { G0().goal = n; save(); youView(); } } }, n + (n === 1 ? ' a day' : ' a day')); }));
    var done = NODES.filter(isDone).length, got = STOPS.filter(function (x) { return j.done[x.id]; });
    var words = Object.keys(P.cards).filter(function (k) { return learned(k); }).length, xp = Object.keys(P.xp).reduce(function (a, k) { return a + P.xp[k]; }, 0);
    fill(view,
      h('div', { class: 'gm-you' }, av, h('div', null, h('label', { class: 'ts-kicker', text: 'What the family calls you' }), name, h('p', { class: 'ts-credit', style: 'margin:.3rem 0 0', text: fl >= 10 ? 'A flower behind your ear for your first ten 🌺.' : 'At ten 🌺 you get a flower behind your ear.' }))),
      h('h2', { class: 'gm-h', text: 'Your lavalava' }), colors,
      h('ul', { class: 'gm-nums' }, [['🔥', streak(), streak() === 1 ? 'day in a row' : 'days in a row'], ['⭐', xp, 'points in all'], ['🌺', fl, 'for respect'], ['🗺️', done, 'of ' + NODES.length + ' on the map'], ['🧠', words, 'words learned'], ['🧺', got.length, 'keepsakes']].map(function (r) { return h('li', null, h('span', { 'aria-hidden': 'true', text: r[0] }), h('b', { text: r[1] }), h('small', { text: r[2] })); })),
      h('h2', { class: 'gm-h', text: 'A day' }), h('p', { class: 'ts-credit', style: 'margin:0 0 .5rem', text: 'How many bubbles make a day. The map says when you’ve done them.' }), goals,
      got.length ? [h('h2', { class: 'gm-h', text: 'Your ʻato' }), h('ul', { class: 'tj-basket' }, got.map(function (x) { return h('li', { title: x.keep.en }, keepIcon(x.keep), h('span', null, h('span', { lang: 'sm', text: x.keep.sm }), ' ', h('small', { style: 'color:var(--text-muted)', text: x.keep.en }))); }))] : null,
      STOPS.length ? [h('h2', { class: 'gm-h', text: 'Your malaga on the real map' }), pacificMap()] : null,
      h('p', { class: 'ts-credit', text: 'The stories and their people are made up; the places and customs are real. Map: Natural Earth (public domain). Your progress stays in this browser.' }));
  }

  // ---------- Quick game ----------
  // A game = 10 taps, about a minute: a word to its picture, a picture to its word, match four pairs, count the
  // coconuts. Every word comes from the lessons, the Peace Corps handbook or the dictionary, with an emoji for its
  // picture; a new word is shown once before it's asked. Right answers in a row build a combo (×2 at 3, ×3 at 6), a
  // quick answer adds a little, the first game of the day counts double. Each word answered right becomes a sticker in
  // the sticker book (gold once it's learned for good); a full set earns its badge. Answers feed the same flashcards.
  // P.qp = { best, xp, games, day (the last day played), mute }. #play opens straight into it.
  var QP_SETS = [
    ['Animals', '🐾', 'maile🐕 pusi🐈 puaʻa🐖 moa🐓 iʻa🐟 manu🐦 solofanua🐎 povi🐄 ʻoti🐐 paʻa🦀 laumei🐢 feʻe🐙'],
    ['Food', '🍽️', 'faʻi🍌 niu🥥 falaoa🍞 alaisa🍚 fuāmoa🥚 susu🥛 kofe☕ vai💧 lautī🍵 māsima🧂'],
    ['Numbers', '🔢', 'tasi1️⃣ lua2️⃣ tolu3️⃣ fā4️⃣ lima5️⃣ ono6️⃣ fitu7️⃣ valu8️⃣ iva9️⃣ sefulu🔟'],
    ['Family', '👪', 'tinā👩 tamā👨 pepe👶 teine👧 tama👦'],
    ['Body', '✋', 'mata👁️ taliga👂 isu👃 gutu👄 lima✋ vae🦶 laulu💇 nifo🦷'],
    ['Colours', '🎨', 'mūmū🟥 lanumoana🟦 lanumeamata🟩 samasama🟨 paʻepaʻe⬜ uliuli⬛'],
    ['Sky and sea', '🌊', 'lā☀️ māsina🌙 fetū⭐ timu🌧️ sami🌊 mauga⛰️ lāʻau🌳 fuga🌺'],
    ['Things', '🏠', 'fale🏠 taʻavale🚗 pasi🚌 vaʻa🛶 vaʻalele✈️ tusi📖 seʻevae👟 polo⚽ tupe💵 uati⌚ nofoa🪑 moega🛏️ faitotoʻa🚪 faʻamalama🪟 faʻamalu☂️ pūlou👒 falesā⛪ falemaʻi🏥'],
    ['Doing', '🏃', 'ʻai🍽️ inu🥤 moe😴 tamoʻe🏃 siva💃 pese🎤 tagi😭 ʻata😂 kuka🧑‍🍳'],
    ['Feelings', '😄', 'fiafia😄 faʻanoanoa😢 ita😠 maʻi🤒 vāivai😩'],
  ].map(function (s, si) {
    var words = s[2].split(' ').map(function (t) { var m = /^(.*?[a-zāēīōūʻ])([^a-zāēīōūʻ].*)$/i.exec(t); return { sm: m[1], pic: m[2], set: si }; });
    return { name: s[0], icon: s[1], words: words };
  });
  var QP_ALL = []; QP_SETS.forEach(function (s) { QP_ALL = QP_ALL.concat(s.words); });
  // the English for each sticker: the first gloss found in the lessons, the handbook or the dictionary
  function qpItem(w) {
    var k = key(w.sm), it = ITEMS[k];
    if (!it) { var d = DICT.find(function (x) { return key(x.sm) === k; }); it = ITEMS[k] = { k: k, sm: w.sm, en: d ? d.en : '', lesson: 'qp', note: '' }; }
    return it;
  }
  var NUMS = { tasi: 1, lua: 2, tolu: 3, 'fā': 4, lima: 5, ono: 6, fitu: 7, valu: 8, iva: 9, sefulu: 10 };
  function QP0() { if (!P.qp) P.qp = { best: 0, xp: 0, games: 0, day: '', mute: false }; return P.qp; }
  var qpHas = function (w) { var c = P.cards[key(w.sm)]; return !!(c && c.reps >= 1); };
  var qpGold = function (w) { return learned(key(w.sm)); };
  var qpLevel = function (xp) { var lv = 1, need = 100; while (xp >= need) { xp -= need; lv++; need = Math.round(need * 1.25); } return { lv: lv, into: xp, need: need }; };
  // the sets open one after another: the next one once half of the one before is in the book
  function qpOpenSets() { var n = 1; for (var i = 0; i < QP_SETS.length - 1; i++) { var s = QP_SETS[i], got = s.words.filter(qpHas).length; if (got * 2 >= s.words.length) n = i + 2; else break; } return Math.min(n, QP_SETS.length); }

  // sounds, made in the page (no files): a ding that climbs with the combo, a soft thud, a fanfare
  var AC = null;
  function beep(freqs, dur, type, vol) {
    if (QP0().mute) return;
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var t = AC.currentTime; freqs.forEach(function (f, i) { var o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t + i * dur); g.gain.linearRampToValueAtTime(vol || .12, t + i * dur + .01); g.gain.exponentialRampToValueAtTime(.001, t + (i + 1) * dur + .12); o.connect(g); g.connect(AC.destination); o.start(t + i * dur); o.stop(t + (i + 1) * dur + .15); }); } catch (e) {}
  }
  var dingFor = function (combo) { var b = 523 * Math.pow(2, Math.min(combo, 8) / 12); beep([b, b * 1.5], .07, 'triangle'); };
  var thud = function () { beep([160, 110], .08, 'sine', .14); };
  var fanfare = function () { beep([523, 659, 784, 1047], .11, 'triangle', .13); };
  function burst(el, emoji) {
    var r = el.getBoundingClientRect(), host = document.body;
    for (var i = 0; i < 10; i++) { var s = document.createElement('span'); s.className = 'qp-spark'; s.textContent = emoji || ['✨', '⭐', '🌺'][i % 3]; s.style.left = (r.left + r.width / 2) + 'px'; s.style.top = (r.top + r.height / 2) + 'px'; s.style.setProperty('--dx', (Math.cos(i / 10 * 6.28) * (60 + Math.random() * 50)).toFixed(0) + 'px'); s.style.setProperty('--dy', (Math.sin(i / 10 * 6.28) * (60 + Math.random() * 50) - 30).toFixed(0) + 'px'); host.appendChild(s); setTimeout(function (n) { return function () { n.remove(); }; }(s), 900); }
  }

  // ---- the start screen: one big button ----
  function qpHome() {
    tab('play'); again = qpHome; drawStats(); window.scrollTo(0, 0);
    var q = QP0(), lv = qpLevel(q.xp), open = qpOpenSets(), got = QP_ALL.filter(qpHas).length, bonus = q.day !== today();
    var mute = h('button', { type: 'button', class: 'qp-mute', 'aria-pressed': q.mute ? 'true' : 'false', 'aria-label': q.mute ? 'Sound off' : 'Sound on', on: { click: function () { q.mute = !q.mute; save(); qpHome(); } } }, q.mute ? '🔇' : '🔊');
    fill(view, h('div', { class: 'qp-home' },
      mute,
      h('div', { class: 'qp-lv' }, h('b', { text: 'Level ' + lv.lv }), h('span', { class: 'gm-meter' }, h('i', { style: 'width:' + (100 * lv.into / lv.need).toFixed(1) + '%' })), h('small', { text: lv.into + ' / ' + lv.need })),
      h('button', { type: 'button', class: 'qp-go', on: { click: qpGame } }, h('span', { class: 'qp-go-ic', 'aria-hidden': 'true', text: '▶' }), h('span', null, h('b', { text: q.games ? 'Play' : 'Start playing' }), h('small', { text: bonus ? 'First game today: double points' : 'About a minute' }))),
      h('button', { type: 'button', class: 'qp-go qp-who', on: { click: whoGame } }, h('span', { class: 'qp-go-ic', 'aria-hidden': 'true', text: '🙏🏽' }), h('span', null, h('b', { text: 'Who’s it for?' }), h('small', { text: 'Afio, maliu, susū or sau: the respect words' }))),
      h('ul', { class: 'gm-nums qp-nums' }, [['🔥', streak(), streak() === 1 ? 'day in a row' : 'days in a row'], ['🏆', q.best, 'best score'], ['🃏', got + '/' + QP_ALL.length, 'stickers']].map(function (r) { return h('li', null, h('span', { 'aria-hidden': 'true', text: r[0] }), h('b', { text: r[1] }), h('small', { text: r[2] })); })),
      h('h2', { class: 'gm-h', text: 'Sticker book' }),
      h('div', { class: 'qp-book' }, QP_SETS.map(function (s, i) {
        var n = s.words.filter(qpHas).length, full = n === s.words.length, locked = i >= open;
        return h('details', { class: 'qp-set' + (full ? ' is-full' : '') + (locked ? ' is-locked' : '') },
          h('summary', null, h('span', { class: 'qp-set-ic', 'aria-hidden': 'true', text: locked ? '🔒' : s.icon }), h('b', { text: s.name }), h('small', { text: locked ? 'Opens soon' : full ? 'Complete! 🏅' : n + ' of ' + s.words.length })),
          locked ? null : h('div', { class: 'qp-stickers' }, s.words.map(function (w) {
            var has = qpHas(w), gold = has && qpGold(w), it = qpItem(w);
            return h('button', { type: 'button', class: 'qp-st' + (has ? '' : ' is-empty') + (gold ? ' is-gold' : ''), disabled: !has, title: has ? w.sm + ': ' + it.en : '', 'aria-label': has ? w.sm + ', ' + it.en : 'Not found yet', on: { click: function () { play(w.sm); } } }, h('span', { class: 'qp-pic', 'aria-hidden': 'true', text: has ? w.pic : '?' }), h('small', { lang: 'sm', text: has ? w.sm : '' }));
          })));
      })),
      h('p', { class: 'ts-credit', text: 'Gold stickers are words you’ve learned for good. They also come back in Flashcards.' })));
  }

  // ---- a game ----
  function qpGame() {
    again = null; tab2('play'); window.scrollTo(0, 0);
    var q = QP0(), open = qpOpenSets(), pool = [];
    QP_SETS.slice(0, open).forEach(function (s) { pool = pool.concat(s.words); });
    var now = Date.now(), seen = pool.filter(qpHas), due = shuffle(seen.filter(function (w) { return isDue(P.cards[key(w.sm)], now); })), fresh = pool.filter(function (w) { return !P.cards[key(w.sm)]; });
    // up to 3 new words a game (4 in the very first), then due ones, then any seen
    var newW = fresh.slice(0, q.games ? 3 : 4), use = newW.concat(due, shuffle(seen.filter(function (w) { return due.indexOf(w) < 0; }))).slice(0, 7);
    while (use.length < 4) { var extra = pool.find(function (w) { return use.indexOf(w) < 0; }); if (!extra) break; use.push(extra); if (newW.indexOf(extra) < 0 && !P.cards[key(extra.sm)]) newW.push(extra); }
    var steps = [];
    newW.forEach(function (w) { steps.push({ t: 'new', w: w }, { t: Math.random() < .5 ? 'pic' : 'word', w: w }); });
    use.filter(function (w) { return newW.indexOf(w) < 0; }).forEach(function (w) { steps.push({ t: Math.random() < .55 ? 'pic' : 'word', w: w }); });
    // a game is about ten taps: the new words come round a second time the other way (that's how they stick)
    var askN = function () { return steps.reduce(function (a, s) { return a + (s.t === 'new' ? 0 : s.t === 'match' ? 4 : 1); }, 0); };
    shuffle(newW).forEach(function (w) { if (askN() < 7) steps.push({ t: 'pic', w: w, again: true }); });
    steps.forEach(function (s) { if (s.again) s.t = Math.random() < .5 ? 'pic' : 'word'; });
    // match up comes after every new word has been met
    if (use.length >= 4) steps.splice(Math.min(steps.length, newW.length * 2 + Math.floor(Math.random() * 2)), 0, { t: 'match', ws: shuffle(use).slice(0, 4) });
    if (open >= 3 && Math.random() < .7) steps.push({ t: 'count' });
    while (askN() > 12 && steps.length > 1 && steps[steps.length - 1].t !== 'new') steps.pop();
    var asks = askN(), done = 0, score = 0, combo = 0, best = 0, right = 0, mult = q.day !== today() ? 2 : 1, newStickers = [];
    var top = h('div', { class: 'qp-top' }, h('button', { type: 'button', class: 'ts-link', on: { click: function () { keyQp = null; qpHome(); } } }, '✕'), h('div', { class: 'ts-bar' }, h('i', { style: 'width:0%' })), h('b', { class: 'qp-score', text: '0' }));
    var comboEl = h('div', { class: 'qp-combo', 'aria-live': 'polite' }), box = h('div', { class: 'qp-box' });
    fill(view, h('div', { class: 'qp-play' }, top, comboEl, box));
    var bar = top.querySelector('.ts-bar i'), scoreEl = top.querySelector('.qp-score');
    var i = 0, t0 = 0;
    function show() { bar.style.width = (100 * done / Math.max(1, asks)) + '%'; comboEl.textContent = combo >= 3 ? '🔥 ' + combo + ' in a row · ×' + (combo >= 6 ? 3 : 2) : ''; comboEl.classList.toggle('is-hot', combo >= 3); }
    function addPoints(el, fast) {
      var pts = 10 * (combo >= 6 ? 3 : combo >= 3 ? 2 : 1) * mult + (fast ? 5 : 0); score += pts; scoreEl.textContent = score;
      var p = h('span', { class: 'qp-plus', text: '+' + pts }); el.appendChild(p); setTimeout(function () { p.remove(); }, 800);
      scoreEl.classList.remove('is-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('is-pop');
    }
    function answered(w, ok, el) {
      var k = key(w.sm), had = qpHas(w);
      qpItem(w); grade(k, ok ? 'right' : 'wrong'); done++;
      if (ok) { right++; combo++; best = Math.max(best, combo); dingFor(combo); addPoints(el, performance.now() - t0 < 3000); if (!had) { newStickers.push(w); burst(el); } else if (combo % 3 === 0) burst(el, '🔥'); }
      else { combo = 0; thud(); }
      show();
    }
    function next() {
      keyQp = null;
      if (i >= steps.length) return end();
      var s = steps[i++]; t0 = performance.now();
      ({ new: intro, pic: toPic, word: toWord, match: match, count: count })[s.t](s);
    }
    function after(ms) { setTimeout(next, ms); }
    function intro(s) {
      var w = s.w, it = qpItem(w); card(it.k); play(w.sm);
      fill(box, h('p', { class: 'qp-kick', text: '✨ New word' }), h('div', { class: 'qp-new' }, h('span', { class: 'qp-big', 'aria-hidden': 'true', text: w.pic }), h('p', { class: 'qp-word', lang: 'sm', text: w.sm }), h('p', { class: 'qp-en', text: it.en }), playBtn(w.sm)),
        h('button', { type: 'button', class: 'ts-btn qp-ok', on: { click: next } }, 'Got it'));
      keyQp = function (k) { if (k === 'Enter' || k === ' ') next(); };
      box.querySelector('.qp-ok').focus({ preventScroll: true });
    }
    function others(w, n, field) { var same = QP_ALL.filter(function (x) { return x.set === w.set && x.sm !== w.sm && x.pic !== w.pic; }), rest = QP_ALL.filter(function (x) { return x.set !== w.set && x.sm !== w.sm; }); return shuffle(same).concat(shuffle(rest)).filter(function (x, j, a) { return a.findIndex(function (y) { return y[field] === x[field]; }) === j; }).slice(0, n); }
    function tiles(opts, label, correct, w, big) {
      var locked = false, grid = h('div', { class: 'qp-grid' + (big ? ' is-pics' : '') });
      opts.forEach(function (o, j) {
        var b = h('button', { type: 'button', class: 'qp-tile', lang: big ? null : 'sm', 'aria-label': big ? (qpItem(o).en || 'a picture') : o.sm, on: { click: function () {
          if (locked) return; locked = true; var ok = o === correct;
          b.classList.add(ok ? 'is-right' : 'is-wrong'); if (!ok) grid.children[opts.indexOf(correct)].classList.add('is-right');
          answered(w, ok, b); if (!ok) play(w.sm);
          after(ok ? 650 : 1400);
        } } }, h('span', { text: big ? o.pic : o.sm }), h('kbd', { text: j + 1 }));
        grid.appendChild(b);
      });
      keyQp = function (k) { if (/^[1-4]$/.test(k) && grid.children[+k - 1]) grid.children[+k - 1].click(); };
      return grid;
    }
    function toPic(s) {
      var w = s.w, opts = shuffle([w].concat(others(w, 3, 'pic'))); play(w.sm);
      fill(box, h('p', { class: 'qp-kick', text: 'Which one is it?' }), h('div', { class: 'qp-ask' }, h('p', { class: 'qp-word', lang: 'sm', text: w.sm }), playBtn(w.sm)), tiles(opts, 'pic', w, w, true));
    }
    function toWord(s) {
      var w = s.w, opts = shuffle([w].concat(others(w, 3, 'sm')));
      fill(box, h('p', { class: 'qp-kick', text: 'What’s this in Samoan?' }), h('div', { class: 'qp-ask' }, h('span', { class: 'qp-big', 'aria-hidden': 'true', text: w.pic }), h('span', { class: 'ts-sr', text: qpItem(w).en })), tiles(opts, 'sm', w, w, false));
    }
    // match four words to their four pictures: tap one, then its partner
    function match(s) {
      var ws = s.ws, left = shuffle(ws), right2 = shuffle(ws), pick = null, pairs = 0, misses = {};
      var colL = h('div', { class: 'qp-col' }), colR = h('div', { class: 'qp-col' });
      function tap(b, w, side) {
        if (b.classList.contains('is-done')) return;
        if (!pick || pick.side === side) { if (pick) pick.b.classList.remove('is-pick'); pick = { b: b, w: w, side: side }; b.classList.add('is-pick'); if (side === 'w') play(w.sm); return; }
        var a = pick; pick = null; a.b.classList.remove('is-pick');
        if (a.w === w) { a.b.classList.add('is-done'); b.classList.add('is-done'); pairs++; answered(w, !misses[w.sm], b); if (pairs === ws.length) after(500); }
        else { misses[a.w.sm] = misses[w.sm] = 1; combo = 0; thud(); show(); [a.b, b].forEach(function (x) { x.classList.add('is-wrong'); setTimeout(function () { x.classList.remove('is-wrong'); }, 450); }); }
      }
      left.forEach(function (w) { var b = h('button', { type: 'button', class: 'qp-tile is-small', lang: 'sm', on: { click: function () { tap(b, w, 'w'); } } }, w.sm); colL.appendChild(b); });
      right2.forEach(function (w) { var b = h('button', { type: 'button', class: 'qp-tile is-small is-pic', 'aria-label': qpItem(w).en || 'a picture', on: { click: function () { tap(b, w, 'p'); } } }, w.pic); colR.appendChild(b); });
      fill(box, h('p', { class: 'qp-kick', text: 'Match them up' }), h('div', { class: 'qp-match' }, colL, colR));
    }
    // count the coconuts
    function count() {
      var nums = QP_SETS[2].words, n = 1 + Math.floor(Math.random() * 7), w = nums[n - 1], opts = shuffle([w].concat(shuffle(nums.filter(function (x) { return x !== w; })).slice(0, 3)));
      var fruit = ['🥥', '🍌', '🐟', '🌺'][Math.floor(Math.random() * 4)];
      fill(box, h('p', { class: 'qp-kick', lang: 'sm', text: 'E fia?' }), h('p', { class: 'qp-en', text: 'How many?' }), h('div', { class: 'qp-count', 'aria-label': n + ' of them' }, Array.from({ length: n }, function () { return h('span', { text: fruit }); })), tiles(opts, 'sm', w, w, false));
    }
    function end() {
      keyQp = null; bar.style.width = '100%'; var first = q.day !== today(); q.games++; q.xp += score; q.day = today();
      var newBest = score > (q.best || 0); if (newBest) q.best = score;
      if (P.days.indexOf(today()) < 0) P.days.push(today());
      var before = qpLevel(q.xp - score).lv, after2 = qpLevel(q.xp).lv;
      bump(); save(); drawStats(); fanfare();
      var stars = right >= asks ? 3 : right >= asks * .7 ? 2 : 1;
      var done2 = QP_SETS.filter(function (s) { return s.words.every(qpHas) && s.words.some(function (w) { return newStickers.indexOf(w) >= 0; }); });
      fill(view, h('div', { class: 'gm-clear qp-end' },
        h('div', { class: 'gm-bigstars', 'aria-label': stars + ' of 3 stars' }, [0, 1, 2].map(function (k) { return h('span', { class: k < stars ? 'on' : '', style: 'animation-delay:' + (k * .18) + 's', text: '★' }); })),
        h('h2', { text: stars === 3 ? 'Mālō lava!' : 'Mālō!' }),
        h('p', { class: 'qp-final' }, h('b', { text: score }), ' points', newBest ? h('span', { class: 'qp-badge', text: 'New best!' }) : null),
        h('p', { class: 'ts-lede', text: right + ' of ' + asks + ' right' + (best >= 3 ? ', ' + best + ' in a row at best' : '') + (first ? '. Double points for the first game today.' : '.') }),
        after2 > before ? h('p', { class: 'gm-goal-done', text: '⬆️ Level ' + after2 + '!' }) : null,
        done2.length ? h('p', { class: 'gm-goal-done', text: '🏅 ' + done2.map(function (s) { return s.name; }).join(' and ') + ' complete!' }) : null,
        newStickers.length ? h('div', null, h('p', { class: 'qp-kick', text: 'New stickers' }), h('div', { class: 'qp-stickers is-new' }, newStickers.map(function (w) { return h('span', { class: 'qp-st' }, h('span', { class: 'qp-pic', 'aria-hidden': 'true', text: w.pic }), h('small', { lang: 'sm', text: w.sm })); }))) : null,
        h('div', { class: 'ts-stats', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ts-btn qp-again', on: { click: qpGame } }, 'Play again'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: qpHome } }, 'Sticker book'))));
      view.querySelector('.qp-again').focus();
      keyQp = function (k) { if (k === 'Enter') qpGame(); };
    }
    show(); next();
  }
  var keyQp = null;
  document.addEventListener('keydown', function (e) { if (keyQp && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '') && (/^[1-4]$/.test(e.key) || e.key === 'Enter' || e.key === ' ')) { if (e.key === ' ') e.preventDefault(); var f = keyQp; f(e.key); } });

  // ---------- The elder's challenge : before each world's talk, the elder quizzes you
  // on the whole world, fast: 12 questions, 8 seconds each, three hearts. Lose them all and just try again; clear it
  // and the talk opens; clear it without losing a heart and you earn a 🌺 (once a world). P.g.boss = { world: { day,
  // hearts } }. A talk already visited stays open. ----------
  var bossOf = function (w) { return (G0().boss || {})[w.id]; };
  function bossFight(w) {
    again = null; tab2('map'); window.scrollTo(0, 0);
    var talk = w.list[w.list.length - 1], host = talk.stop.host, it = [], seen = {};
    w.list.forEach(function (nd) { itemsOf(nd.L).forEach(function (x) { if (!seen[x.k]) { seen[x.k] = 1; it.push(x); } }); });
    var known = shuffle(it.filter(function (x) { return P.cards[x.k]; })), rest = shuffle(it.filter(function (x) { return !P.cards[x.k]; }));
    var qs = known.slice(0, 9).concat(rest).slice(0, 12), hearts = 3, i = 0, right = 0, timer = 0, SECS = 8;
    var heartEl = h('span', { class: 'bs-hearts', 'aria-live': 'polite' }), bar = h('div', { class: 'bs-time' }, h('i')), box = h('div', { class: 'qp-box' });
    var prog = h('div', { class: 'ts-bar' }, h('i', { style: 'width:0%' }));
    fill(view, h('div', { class: 'qp-play bs-play' },
      h('div', { class: 'qp-top' }, h('button', { type: 'button', class: 'ts-link', 'aria-label': 'Stop', on: { click: function () { stop(); gameMap(); } } }, '✕'), prog, heartEl),
      h('div', { class: 'bs-boss' }, h('span', { class: 'bs-face', 'aria-hidden': 'true', text: host.face }), h('div', null, h('b', { text: host.name + '’s challenge' }), h('small', { text: w.name + ' · ' + qs.length + ' questions, three hearts' }))),
      bar, box));
    function drawHearts() { heartEl.textContent = '❤️'.repeat(hearts) + '🤍'.repeat(3 - hearts); heartEl.setAttribute('aria-label', hearts + ' hearts left'); }
    function stop() { clearTimeout(timer); keyQp = null; }
    function next() {
      stop(); prog.firstChild.style.width = (100 * i / qs.length) + '%';
      if (hearts <= 0) return lost();
      if (i >= qs.length) return won();
      var x = qs[i++], toEn = Math.random() < .5, field = toEn ? 'en' : 'sm';
      var opts = shuffle([x].concat(distractors(x, field, 3))), locked = false;
      var grid = h('div', { class: 'qp-grid' }, opts.map(function (o, j) {
        return h('button', { type: 'button', class: 'qp-tile is-small', lang: toEn ? null : 'sm', on: { click: function () { pickIt(o, this); } } }, h('span', { text: o[field] }), h('kbd', { text: j + 1 }));
      }));
      function pickIt(o, el) {
        if (locked) return; locked = true; clearTimeout(timer); bar.firstChild.style.transition = 'none';
        var ok = o === x; grade(x.k, ok ? 'right' : 'wrong');
        if (ok) { right++; el.classList.add('is-right'); dingFor(right); }
        else { hearts--; drawHearts(); thud(); if (el) el.classList.add('is-wrong'); grid.children[opts.indexOf(x)].classList.add('is-right'); heartEl.classList.remove('is-hit'); void heartEl.offsetWidth; heartEl.classList.add('is-hit'); }
        play(x.sm); setTimeout(next, ok ? 550 : 1300);
      }
      fill(box, h('p', { class: 'qp-kick', text: toEn ? 'What does it mean?' : 'Say it in Samoan' }), h('p', { class: 'qp-word bs-q', lang: toEn ? 'sm' : null, text: toEn ? x.sm : x.en }), grid);
      // the clock: 8 seconds, then it counts as a miss
      var b = bar.firstChild; b.style.transition = 'none'; b.style.width = '100%'; void b.offsetWidth; b.style.transition = 'width ' + SECS + 's linear'; b.style.width = '0%';
      timer = setTimeout(function () { pickIt(null, null); }, SECS * 1000);
      keyQp = function (k) { if (/^[1-4]$/.test(k) && grid.children[+k - 1]) grid.children[+k - 1].click(); };
    }
    function lost() {
      fill(view, h('div', { class: 'gm-clear' }, h('span', { class: 'bs-face is-big', 'aria-hidden': 'true', text: host.face }), h('h2', { text: 'Toe taumafai!' }), h('p', { class: 'ts-lede', text: host.name + ' says try again. You got ' + right + ' right before the hearts ran out.' }),
        h('div', { class: 'ts-stats', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { bossFight(w); } } }, 'Try again'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { gameMap(); } } }, 'Back to the map'))));
      view.querySelector('.ts-btn').focus();
    }
    function won() {
      var g = G0(); g.boss = g.boss || {}; var had = g.boss[w.id], clean = hearts === 3, flower = clean && !(had && had.hearts === 3);
      g.boss[w.id] = { day: today(), hearts: Math.max(hearts, had ? had.hearts : 0) };
      if (flower) { J0().fl = (J0().fl || 0) + 1; }
      if (!had) bump(); save(); drawStats(); fanfare();
      fill(view, h('div', { class: 'gm-clear' }, h('span', { class: 'bs-face is-big', 'aria-hidden': 'true', text: host.face }), h('div', { class: 'bs-hearts is-big', text: '❤️'.repeat(hearts) + '🤍'.repeat(3 - hearts) }),
        h('h2', { text: clean ? 'Mālō lava!' : 'Mālō!' }),
        h('p', { class: 'ts-lede', text: right + ' of ' + qs.length + ' right. ' + host.name + ' is waiting inside.' }),
        flower ? h('p', { class: 'gm-goal-done' }, h('span', { class: 'tj-flower', text: '🌺' }), ' Not a heart lost.') : null,
        h('div', { class: 'ts-stats', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ts-btn', on: { click: function () { stopView(talk.stop); } } }, 'Go in'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: function () { gameMap(); } } }, 'Back to the map'))));
      view.querySelector('.ts-btn').focus();
    }
    drawHearts(); next();
  }

  // ---------- Who's it for? : the respect words, sorted. A person and what you want to say,
  // tap the words; or the words, tap who they're for. Only words already in the lessons (the greetings lessons and the Peace Corps handbook's lesson 16). ----------
  var WHO = [
    { id: 'chief', face: '👴🏽', name: 'A high chief', sm: 'aliʻi' },
    { id: 'orator', face: '🧓🏽', name: 'An orator', sm: 'tulāfale' },
    { id: 'minister', face: '👨🏽‍🦳', name: 'The minister', sm: 'faifeʻau' },
    { id: 'friend', face: '🧑🏽', name: 'Your cousin', sm: '' },
  ];
  var SAYS = [
    { what: 'Welcome them in', by: { chief: 'Afio mai', orator: 'Maliu mai', minister: 'Susū mai', friend: 'Sau i totonu' } },
    { what: 'Say “you” to them', by: { chief: 'lau afioga', orator: 'lau fetalaiga', minister: 'lau susuga', friend: 'ʻoe' } },
    { what: 'Ask them to eat', by: { chief: 'taumafa', friend: 'ʻai' } },
  ];
  function whoGame() {
    again = null; tab2('play'); window.scrollTo(0, 0);
    var q = QP0(), qs = [];
    for (var n = 0; n < 10; n++) { var s = SAYS[n % 3 === 2 && Math.random() < .5 ? 2 : Math.floor(Math.random() * 2)], ids = Object.keys(s.by), who = WHO.filter(function (p) { return ids.indexOf(p.id) >= 0; }), p = who[Math.floor(Math.random() * who.length)]; qs.push({ s: s, p: p, who: who, rev: Math.random() < .45 }); }
    var i = 0, right = 0, combo = 0, score = 0;
    var prog = h('div', { class: 'ts-bar' }, h('i', { style: 'width:0%' })), scoreEl = h('b', { class: 'qp-score', text: '0' }), comboEl = h('div', { class: 'qp-combo' }), box = h('div', { class: 'qp-box' });
    fill(view, h('div', { class: 'qp-play' }, h('div', { class: 'qp-top' }, h('button', { type: 'button', class: 'ts-link', 'aria-label': 'Stop', on: { click: function () { keyQp = null; qpHome(); } } }, '✕'), prog, scoreEl), comboEl, box));
    function next() {
      keyQp = null; prog.firstChild.style.width = (100 * i / qs.length) + '%';
      if (i >= qs.length) return end();
      var t = qs[i++], locked = false, opts, label, correct;
      if (t.rev) { opts = shuffle(t.who); correct = t.p; label = function (o) { return [h('span', { class: 'wh-face', 'aria-hidden': 'true', text: o.face }), h('span', { text: o.name })]; }; }
      else { opts = shuffle(t.who.map(function (p) { return t.s.by[p.id]; })); correct = t.s.by[t.p.id]; label = function (o) { return h('span', { lang: 'sm', text: o }); }; }
      var grid = h('div', { class: 'qp-grid' }, opts.map(function (o, j) {
        return h('button', { type: 'button', class: 'qp-tile is-small' + (t.rev ? ' wh-who' : ''), on: { click: function () {
          if (locked) return; locked = true; var ok = o === correct, b = this;
          b.classList.add(ok ? 'is-right' : 'is-wrong'); if (!ok) grid.children[opts.indexOf(correct)].classList.add('is-right');
          if (ok) { right++; combo++; var pts = 10 * (combo >= 6 ? 3 : combo >= 3 ? 2 : 1); score += pts; scoreEl.textContent = score; dingFor(combo); if (combo % 3 === 0) burst(b, '🌺'); } else { combo = 0; thud(); }
          comboEl.textContent = combo >= 3 ? '🔥 ' + combo + ' in a row' : ''; comboEl.classList.toggle('is-hot', combo >= 3);
          var word = t.s.by[t.p.id];
          fill(note, h('p', { class: 'wh-note' }, h('b', { lang: 'sm', text: word }), ' is for ' + t.p.name.toLowerCase() + (t.p.sm ? ' (' + t.p.sm + ')' : '') + '.'));
          setTimeout(next, ok ? 900 : 1800);
        } } }, label(o), h('kbd', { text: j + 1 }));
      })), note = h('div', { 'aria-live': 'polite' });
      var ask = t.rev ? h('div', { class: 'qp-ask' }, h('p', { class: 'qp-kick', text: 'Who do you say it to?' }), h('p', { class: 'qp-word', lang: 'sm', text: t.s.by[t.p.id] }))
        : h('div', { class: 'qp-ask' }, h('p', { class: 'qp-kick', text: t.s.what }), h('span', { class: 'qp-big wh-big', 'aria-hidden': 'true', text: t.p.face }), h('p', { class: 'qp-word wh-name', text: t.p.name }));
      fill(box, ask, grid, note);
      keyQp = function (k) { if (/^[1-4]$/.test(k) && grid.children[+k - 1]) grid.children[+k - 1].click(); };
    }
    function end() {
      var perfect = right === qs.length, first = perfect && !q.whoPerfect;
      if (first) { q.whoPerfect = today(); J0().fl = (J0().fl || 0) + 1; }
      q.whoBest = Math.max(q.whoBest || 0, score); q.xp += score; bump(); save(); drawStats(); fanfare();
      fill(view, h('div', { class: 'gm-clear qp-end' }, h('div', { class: 'wh-row', 'aria-hidden': 'true', text: WHO.map(function (p) { return p.face; }).join(' ') }),
        h('h2', { text: perfect ? 'Mālō lava!' : 'Mālō!' }), h('p', { class: 'qp-final' }, h('b', { text: score }), ' points'),
        h('p', { class: 'ts-lede', text: right + ' of ' + qs.length + ' right.' }),
        first ? h('p', { class: 'gm-goal-done' }, h('span', { class: 'tj-flower', text: '🌺' }), ' All ten.') : null,
        h('div', { class: 'ts-stats', style: 'justify-content:center' }, h('button', { type: 'button', class: 'ts-btn qp-again', on: { click: whoGame } }, 'Play again'), h('button', { type: 'button', class: 'ts-btn ghost', on: { click: qpHome } }, 'Back'))));
      view.querySelector('.qp-again').focus(); keyQp = function (k) { if (k === 'Enter') whoGame(); };
    }
    next();
  }

  // ---------- start ----------
  index(); migrate();
  // #play opens straight on the Quick game (a link to send someone)
  function route() { if (/^#play\b/.test(location.hash)) return qpHome(); if (NODES.length) gameMap(); else listView(); }
  route();
  window.addEventListener('hashchange', function () { if (/^#play\b/.test(location.hash)) qpHome(); });
}
