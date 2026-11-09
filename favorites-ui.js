(function () {
  'use strict';
  if (!window.NeutiP2 || !window.NeutiFavorites) return;
  document.addEventListener('DOMContentLoaded', function () {
    var data = window.NeutiFavorites, active = null, trigger = null;
    var paths = {
      age3040: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
      age5060: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M5 11a7 7 0 0 1 6-6m2 14a7 7 0 0 0 6-6"/>',
      trot: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8M8 6h5M8 9h5"/>'
    };
    function icon(id) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[id] + '</svg>'; }
    var home = document.createElement('div');
    home.id = 'favoriteShortcuts';
    home.setAttribute('aria-label', '추천 애창곡 바로 찾기');
    var voice = document.getElementById('voiceBtn');
    voice.before(home);
    var panel = document.createElement('section');
    panel.id = 'favoritesPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'favoritesTitle');
    panel.innerHTML = '<div class="favorites-sheet"><div class="favorites-heading"><div><span class="favorites-eyebrow">쉽게 고르는 추천곡</span><h2 id="favoritesTitle"></h2></div><button id="favoritesClose" type="button">닫기</button></div><div id="favoritesTabs" aria-label="애창곡 종류"></div><p id="favoritesDescription"></p><p class="favorites-instruction">곡을 누른 뒤 <strong>실행</strong> 또는 <strong>예약</strong>을 선택하세요.</p><label class="favorites-filter-label" for="favoritesFilter">이 목록에서 찾기</label><div class="favorites-filter-row"><input id="favoritesFilter" type="search" placeholder="제목 · 가수 · 초성 · 곡번호" autocomplete="off" enterkeyhint="search"><button id="favoritesClear" type="button" aria-label="목록 검색어 지우기">지우기</button></div><p id="favoritesCount" role="status" aria-live="polite"></p><ul id="favoritesList"></ul><p id="favoritesEmpty" hidden>찾는 곡이 없습니다. 검색어를 바꾸거나 다른 목록을 눌러 주세요.</p><details class="favorites-source"><summary>선곡 기준 · 자료 출처</summary><p></p></details></div>';
    document.body.append(panel);
    var $ = id => document.getElementById(id), list = $('favoritesList'), filter = $('favoritesFilter');
    panel.querySelector('.favorites-source p').textContent = data.note + ' 출처: TJ미디어 TOP100 (www.tjmedia.com/chart/top100). 확인일: ' + data.updated + '. 목록은 앱에 저장되어 있어 인터넷 없이 볼 수 있습니다.';
    function mark() {
      home.querySelectorAll('button').forEach(b => b.setAttribute('aria-expanded', String(!panel.hidden && b.dataset.category === active.id)));
      $('favoritesTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.category === active.id)));
    }
    function close(restoreFocus) {
      panel.hidden = true; document.body.classList.remove('favorites-open');
      document.querySelector('main').inert = false;
      var nav = document.querySelector('.native-nav'); if (nav) nav.inert = false;
      if (active) mark();
      if (restoreFocus !== false && trigger) trigger.focus({preventScroll:true});
    }
    function render() {
      list.replaceChildren();
      var query = filter.value.trim();
      // Use the same literal-title, artist, number and Hangul-initial matching as song search.
      var matches = query ? findSongs(active.songs.map(s => Object.assign({}, s, {
        titleN: normalize(s.title), artistN: normalize(s.artist), hay: normalize(s.title + ' ' + s.artist)
      })), query).map(item => item.s) : active.songs;
      $('favoritesCount').textContent = query ? matches.length + '곡 찾음 · 전체 ' + active.songs.length + '곡' : '추천 ' + active.songs.length + '곡';
      $('favoritesEmpty').hidden = matches.length > 0;
      matches.forEach(function (song) {
        var row = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.className = 'favorite-song'; button.dataset.code = song.code;
        button.innerHTML = '<span class="favorite-song-title"></span><span class="favorite-song-artist"></span><span class="favorite-song-bottom"><span class="favorite-song-code"></span><span class="favorite-song-select">곡 선택 <span aria-hidden="true">›</span></span></span>';
        button.querySelector('.favorite-song-title').textContent = song.title;
        button.querySelector('.favorite-song-artist').textContent = song.artist;
        button.querySelector('.favorite-song-code').textContent = song.code;
        button.setAttribute('aria-label', song.title + ', ' + song.artist + ', 곡번호 ' + song.code + ', 선택');
        button.onclick = async function () {
          if ($('searchBtn').disabled) { $('favoritesCount').textContent = '곡 목록을 준비하고 있습니다. 잠시 후 다시 눌러 주세요.'; return; }
          close(false); $('query').value = song.code;
          try { await search(); $('heroTitle').setAttribute('tabindex', '-1'); $('heroTitle').focus({preventScroll:true}); }
          catch (e) { setMessage('곡 목록을 준비하지 못했습니다. 앱을 다시 열어 주세요.', true); }
        };
        row.append(button); list.append(row);
      });
    }
    function open(group, button) {
      active = group; if (button) trigger = button;
      filter.value = ''; $('favoritesTitle').textContent = group.label;
      $('favoritesDescription').textContent = group.description;
      panel.hidden = false; document.body.classList.add('favorites-open');
      document.querySelector('main').inert = true;
      var nav = document.querySelector('.native-nav'); if (nav) nav.inert = true;
      panel.querySelector('.favorites-sheet').scrollTop = 0;
      render(); mark(); if (button) $('favoritesClose').focus({preventScroll:true});
    }
    data.groups.forEach(function (group) {
      var button = document.createElement('button'); button.type = 'button'; button.dataset.category = group.id;
      button.setAttribute('aria-label', group.label + ' 50곡 열기'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'favoritesPanel');
      button.innerHTML = icon(group.id) + '<strong></strong><span></span>';
      button.querySelector('strong').textContent = group.id === 'trot' ? '트로트' : group.id === 'age3040' ? '30~40대' : '50~60대';
      button.querySelector('span').textContent = group.id === 'trot' ? '베스트' : '애창곡';
      button.onclick = () => open(group, button); home.append(button);
      var tab = document.createElement('button'); tab.type = 'button'; tab.dataset.category = group.id;
      tab.textContent = group.id === 'trot' ? '트로트' : group.id === 'age3040' ? '30~40대' : '50~60대';
      tab.setAttribute('aria-pressed', 'false'); tab.onclick = () => open(group); $('favoritesTabs').append(tab);
    });
    $('favoritesClose').onclick = () => close();
    filter.addEventListener('input', render);
    filter.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); filter.blur(); } });
    $('favoritesClear').onclick = () => { filter.value = ''; render(); filter.focus(); };
    panel.onclick = e => { if (e.target === panel) close(); };
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        var items = [...panel.querySelectorAll('button:not(:disabled),input,summary')], first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  });
})();
