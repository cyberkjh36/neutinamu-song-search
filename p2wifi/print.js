'use strict';
const form = document.querySelector('#settings');
const roomNumber = document.querySelector('#number');
const pairingCode = document.querySelector('#code');
const poster = document.querySelector('#poster');
const scanned = new URLSearchParams(location.hash.slice(1));
if (/^\d{8}$/.test(scanned.get('room'))) pairingCode.value = scanned.get('room');
if (/^[1-9]\d?$/.test(scanned.get('label'))) roomNumber.value = scanned.get('label');
function makePoster() {
  const url = new URL('index.html', location.href);
  url.hash = new URLSearchParams({room: pairingCode.value, label: roomNumber.value}).toString();
  const qr = qrcode(0, 'M');
  qr.addData(url.href, 'Byte');
  qr.make();
  document.querySelector('#qr').innerHTML = qr.createSvgTag({cellSize: 4, margin: 16, scalable: true});
  document.querySelector('#roomTitle').textContent = roomNumber.value + '번방';
  poster.hidden = false;
}
form.addEventListener('input', () => { poster.hidden = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (form.reportValidity()) makePoster();
});
document.querySelector('#print').addEventListener('click', () => { if (!poster.hidden) window.print(); });
if (roomNumber.value && pairingCode.value) makePoster();
