import json
import tempfile
import unittest
from pathlib import Path
from p2_bridge import Bridge, Settings, REQUIRED
from p2_core import Bench, Profile

PACKET = bytes([0x26, 0, 2, 0, 12, 18])  # Synthetic frame is only used by a fake transport in tests.

class API:
    def __init__(self):
        self.calls = []
        self.fail_ack = False
    def call(self, op, **args):
        self.calls.append((op, args))
        if op == 'ack' and self.fail_ack:
            raise TimeoutError()
        return {'ok': True, 'job': None, 'phones': 1}

class Transport:
    def __init__(self):
        self.sent = []
        self.fail_at = None
        self.before = lambda: None
    def send(self, packet):
        self.before()
        self.sent.append(packet)
        if len(self.sent) == self.fail_at:
            raise TimeoutError()

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.profile = Profile(root/'signals.json')
        for key in REQUIRED:
            self.profile.save(key, PACKET)
        self.settings = Settings(root/'settings.json')
        self.settings.verify(self.profile)
        self.api, self.transport = API(), Transport()
        self.bench = Bench(self.profile, self.transport, sleep=lambda _: None)
        self.journal = root/'receipts.json'
        self.bridge = Bridge(self.bench, self.settings, self.journal, api=self.api, clock=lambda: 1000)
        self.job = {'id': 'a'*32, 'command': {'action':'reserve','number':'11223'}, 'expires':1015000}

    def test_write_ahead_journal_exists_before_first_physical_action(self):
        self.transport.before = lambda: self.assertEqual(json.loads(self.journal.read_text())['a'*32]['status'], 'unknown')
        self.bridge.execute(self.job)
        self.assertEqual(len(self.transport.sent), 6)
        self.assertEqual(self.bridge.receipts['a'*32]['status'], 'sent')

    def test_ack_timeout_and_restart_never_retransmit(self):
        self.api.fail_ack = True
        with self.assertRaises(TimeoutError):
            self.bridge.execute(self.job)
        self.api.fail_ack = False
        restarted = Bridge(self.bench,self.settings,self.journal,api=self.api,clock=lambda:1000)
        restarted.execute(self.job)
        self.assertEqual(len(self.transport.sent), 6)
        self.assertTrue(restarted.receipts['a'*32]['acked'])

    def test_partial_send_stops_remaining_digits_and_halts_future_commands(self):
        self.transport.fail_at = 2
        self.bridge.execute(self.job)
        self.assertTrue(self.bridge.halted)
        self.assertEqual(len(self.transport.sent), 2)
        self.bridge.execute(dict(self.job,id='b'*32))
        self.assertEqual(len(self.transport.sent), 2)
        self.assertEqual(self.bridge.receipts['b'*32]['status'], 'failed')

    def test_unresolved_crash_requires_operator_review(self):
        self.journal.write_text(json.dumps({'a'*32:{'status':'unknown','time':1000,'acked':False}}))
        restarted=Bridge(self.bench,self.settings,self.journal,api=self.api,clock=lambda:1000)
        self.assertTrue(restarted.halted)
        restarted.resume()
        self.assertFalse(Bridge(self.bench,self.settings,self.journal,api=self.api,clock=lambda:1000).halted)

    def test_expired_or_malformed_jobs_send_nothing(self):
        self.bridge.execute(dict(self.job,expires=999000))
        self.bridge.execute(dict(self.job,id='b'*32,command={'action':'reserve','number':'１２３'}))
        self.assertEqual(self.transport.sent, [])

    def test_signal_change_revokes_previous_test_confirmation(self):
        self.profile.save('digit_1', bytes([0x26,0,2,0,13,18]))
        self.assertEqual(self.bridge.capabilities(), [])
        self.bridge.execute(self.job)
        self.assertEqual(self.transport.sent, [])

    def test_empty_profile_or_busy_bench_is_not_advertised(self):
        self.bench.lock.acquire()
        self.assertEqual(self.bridge.capabilities(), [])
        self.bench.lock.release()
        del self.profile.codes['reserve']
        self.assertEqual(self.bridge.capabilities(), [])

    def test_stable_host_identity_survives_reopen(self):
        again=Settings(self.settings.path)
        self.assertEqual(again.data['host'], self.settings.data['host'])
        self.assertEqual(again.data['verified'], self.settings.data['verified'])

if __name__ == '__main__':
    unittest.main()
