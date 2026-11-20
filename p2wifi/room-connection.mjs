// Keep a single poll or recovery attempt in flight, including across page suspension.
export class RoomConnection {
 constructor(client, changed, available) {
  this.client = client;
  this.changed = changed;
  this.available = available;
  this.target = null;
  this.timer = null;
  this.generation = 0;
  this.failures = 0;
  this.running = false;
  this.pending = false;
  this.suspended = false;
  this.message = '';
 }
 get ready() { return !!(this.client.data?.online && this.client.data.state?.connected); }
 start(target) {
  this.generation++;
  this.target = target;
  this.failures = 0;
  this.message = '';
  this.client.invalidate();
  this.wake();
 }
 stop() {
  this.generation++;
  this.target = null;
  this.pending = false;
  this.message = '';
  clearTimeout(this.timer);
  this.client.invalidate();
 }
 suspend() {
  if (this.suspended) return;
  this.generation++;
  this.suspended = true;
  clearTimeout(this.timer);
  this.pending = false;
  this.message = '휴대폰 연결이 돌아오면 자동으로 다시 연결합니다.';
  this.client.invalidate();
 }
 wake() {
  if (!this.available()) { this.suspend(); return; }
  this.suspended = false;
  if (!this.target) return;
  if (this.running) { this.pending = true; return; }
  this.schedule(0);
 }
 schedule(ms) {
  clearTimeout(this.timer);
  if (this.target && !this.suspended && this.available())
   this.timer = setTimeout(() => this.check(), ms);
 }
 async check() {
  if (!this.available()) { this.suspend(); return; }
  if (this.running || !this.target || this.suspended) return;
  this.running = true;
  const generation = this.generation, target = this.target, client = this.client;
  let delay = 3000;
  try {
   if (client.busy && !client.sending) return;
   let room = target.room || client.room;
   if (!target.room && (!client.data || !client.data.online)) {
    room = await client.resolvePrinted(target.label, target.ticket);
    if (generation !== this.generation) return;
   }
   if (room !== client.room || !client.data) {
    if (client.sending) return;
    await client.join(room);
   } else {
    await client.refresh();
   }
   if (generation !== this.generation) return;
   this.failures = 0;
   this.message = this.ready ? '' : client.data?.online
    ? '방 PC에 연결됐습니다. P2 반주기가 돌아오면 자동으로 연결합니다.'
    : '방 PC가 다시 연결되기를 기다리고 있습니다.';
  } catch (error) {
   if (generation !== this.generation) return;
   this.message = error.code ? error.message : '인터넷 연결을 확인하고 있습니다. 자동으로 다시 시도합니다.';
   if (['bad_ticket','unknown_label'].includes(error.code) || (error.code === 'pairing' && target.room)) {
    this.target = null;
   } else {
    const backoff = Math.min(15000, 2000 * 2 ** Math.min(this.failures++, 3));
    delay = (error.code === 'slow' ? 60000 : error.code === 'full' ? 15000 : backoff) + Math.random() * 1000;
   }
  } finally {
   this.running = false;
   this.changed();
   this.schedule(this.pending ? 0 : delay);
   this.pending = false;
  }
 }
}
