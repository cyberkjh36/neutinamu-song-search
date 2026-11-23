const controls = [
  ['pitch', '음정'], ['tempo', '템포'], ['melody', '멜로디'],
  ['echo', '에코'], ['mic', '마이크 볼륨'], ['music', '반주 음악 볼륨']
];

export function mountSoundControls(send) {
  const shortcuts = document.getElementById('favoriteShortcuts');
  const panel = document.getElementById('soundPanel');
  const rows = document.getElementById('soundRows');
  const status = document.getElementById('soundStatus');
  const open = document.createElement('button');
  open.type = 'button';
  open.id = 'soundShortcut';
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-controls', panel.id);
  open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg><strong>음향 조절</strong>';
  shortcuts.append(open);
  let ready = false, supported = false, busy = false, pending = false, session = '', feedback = '';

  function paint() {
    for (const button of rows.querySelectorAll('button')) button.disabled = !ready || !supported || busy || pending;
    status.textContent = !ready ? '이 방의 P2에 연결하면 조절할 수 있습니다.'
      : !supported ? '방 PC에 음향 조절 업데이트를 설치해 주세요.'
      : feedback || (busy ? '이전 요청을 처리하고 있습니다.' : '버튼을 누르면 한 단계씩 조절됩니다.');
  }

  for (const [key, label] of controls) {
    const row = document.createElement('div');
    const name = document.createElement('strong');
    row.className = 'sound-row';
    name.textContent = label;
    row.append(name);
    for (const [suffix, symbol, direction] of [['Down', '−', '내리기'], ['Up', '+', '올리기']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = symbol;
      button.setAttribute('aria-label', label + ' ' + direction);
      button.onclick = async () => {
        if (button.disabled || pending) return;
        const target = session;
        pending = true;
        feedback = label + ' ' + direction + ' 전송 중…';
        paint();
        try {
          const result = await send(key + suffix);
          if (target === session) feedback = ['confirmed','sent'].includes(result?.status)
            ? label + ' ' + direction + ' 버튼을 전송했습니다.' : result?.message || '전송 결과를 확인하지 못했습니다.';
        } catch {
          if (target === session) feedback = '전송 결과를 확인하지 못했습니다. 반주기 화면을 확인해 주세요.';
        } finally { pending = false; paint(); }
      };
      row.append(button);
    }
    rows.append(row);
  }
  open.onclick = () => { if (!pending) feedback = ''; paint(); panel.showModal(); };
  document.getElementById('closeSound').onclick = () => panel.close();
  panel.addEventListener('close', () => open.focus({preventScroll: true}));
  paint();
  return function update(connected, capability, working, identity) {
    if (identity !== session) feedback = '';
    ready = connected; supported = capability; busy = working; session = identity;
    paint();
  };
}
