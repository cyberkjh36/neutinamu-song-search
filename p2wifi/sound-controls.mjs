const volume = [
  {key: 'mic', label: '마이크 볼륨', icon: 'mic'},
  {key: 'music', label: '반주 음악 볼륨', icon: 'speaker'}
];
const effects = [
  {key: 'pitch', label: '음정', icon: 'tuning', down: '낮게', up: '높게'},
  {key: 'tempo', label: '템포', icon: 'metronome', down: '느리게', up: '빠르게'},
  {key: 'melody', label: '멜로디', icon: 'note', down: '약하게', up: '강하게'},
  {key: 'echo', label: '에코', icon: 'echo', down: '약하게', up: '강하게'}
];
const paths = {
  mixer: '<path d="M5 3v4m0 5v9m7-18v9m0 5v4m7-18v2m0 5v11"/><rect x="2.5" y="7" width="5" height="5" rx="1.5"/><rect x="9.5" y="12" width="5" height="5" rx="1.5"/><rect x="16.5" y="5" width="5" height="5" rx="1.5"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3m-3 0h6"/>',
  speaker: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a5.6 5.6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  tuning: '<path d="M7 3v7a5 5 0 0 0 10 0V3m-5 12v6"/>',
  metronome: '<path d="m6 20 4-16h3.5l4.5 16zm5-4 8-10m-4 4 2 1.5"/>',
  note: '<path d="M9 16V6l11-2v10M9 9l11-2"/><ellipse cx="6" cy="17" rx="3" ry="2.5"/><ellipse cx="17" cy="15" rx="3" ry="2.5"/>',
  echo: '<path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-9v6"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>'
};
function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
}

export function mountSoundControls(send, warm = () => {}) {
  const panel = document.getElementById('soundPanel');
  const rows = document.getElementById('soundRows');
  const status = document.getElementById('soundStatus');
  const connection = document.getElementById('soundConnection');
  const buttons = [];
  const open = document.createElement('button');
  open.type = 'button';
  open.id = 'soundShortcut';
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-controls', panel.id);
  open.innerHTML = '<span class="sound-shortcut-mark">'+icon('mixer')+'</span><strong>음향 조절</strong>'+icon('chevron');
  document.getElementById('favoriteShortcuts').append(open);

  let ready = false, supported = false, busy = false, pending = false, session = '', feedback = '';
  function paint() {
    for (const button of buttons) button.disabled = !ready || !supported || busy || pending;
    if (connection) {
      connection.dataset.online = String(ready);
      connection.textContent = ready ? 'P2 연결됨' : 'P2 연결 대기';
    }
    const message = !ready ? '이 방의 P2에 연결하면 조절할 수 있습니다.'
      : !supported ? '방 PC에 음향 조절 업데이트를 설치해 주세요.'
      : feedback || (busy ? '이전 요청을 처리하고 있습니다.' : '한 번 누를 때마다 한 단계씩 조절됩니다.');
    if (status.textContent !== message) status.textContent = message;
  }
  function directionButton(control, increase) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound-step';
    const word = increase ? control.up : control.down;
    const sign = icon(increase ? 'plus' : 'minus');
    button.innerHTML = !word ? sign : increase ? word+sign : sign+word;
    const direction = increase ? '올리기' : '내리기';
    button.setAttribute('aria-label', control.label+' '+direction+(word ? ' ('+word+')' : ''));
    button.onclick = async () => {
      if (button.disabled || pending) return;
      const target = session;
      pending = true;
      feedback = control.label+' '+direction+' 전송 중…';
      paint();
      try {
        const result = await send(control.key+(increase ? 'Up' : 'Down'));
        if (target === session) feedback = ['confirmed','sent'].includes(result?.status)
          ? control.label+' '+direction+' 버튼을 전송했습니다.' : result?.message || '전송 결과를 확인하지 못했습니다.';
      } catch {
        if (target === session) feedback = '전송 결과를 확인하지 못했습니다. 반주기 화면을 확인해 주세요.';
      } finally { pending = false; paint(); }
    };
    buttons.push(button);
    return button;
  }
  function group(id, title, controls) {
    const section = document.createElement('section');
    section.className = 'sound-group sound-'+id;
    section.setAttribute('aria-labelledby','sound-'+id+'-title');
    const heading = document.createElement('h3');
    heading.id = 'sound-'+id+'-title';
    heading.textContent = title;
    const list = document.createElement('div');
    list.className = 'sound-list';
    for (const control of controls) {
      const row = document.createElement('div');
      row.className = 'sound-control';
      row.innerHTML = '<div class="sound-name"><span class="sound-symbol">'+icon(control.icon)+'</span><strong>'+control.label+'</strong></div>';
      const pair = document.createElement('div');
      pair.className = 'sound-pair';
      pair.append(directionButton(control,false),directionButton(control,true));
      row.append(pair);
      list.append(row);
    }
    section.append(heading,list);
    return section;
  }
  rows.replaceChildren(group('volume','볼륨',volume),group('effects','음정 · 효과',effects));
  open.onclick = () => {
    if (!pending) feedback = '';
    paint(); panel.showModal();
    if (ready && supported) warm();
  };
  document.getElementById('closeSound').onclick = () => panel.close();
  panel.addEventListener('close', () => open.focus({preventScroll: true}));
  paint();
  return function update(connected, capability, working, identity) {
    if (identity !== session) feedback = '';
    ready = connected; supported = capability; busy = working; session = identity;
    paint();
  };
}
