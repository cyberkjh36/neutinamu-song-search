import json
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from p2_core import Bench, Profile, SingleInstance, ToolError, check_packet, reservation_keys
from p2_broadlink import BroadlinkTransport

# Synthetic frames exist ONLY in this test file. They are never shipped as a
# profile or passed by the GUI to physical hardware.
def frame(n):
    return bytes([0x26, 0, 2, 0, n + 1, 20])


class Fake:
    def __init__(self):
        self.sent, self.fail_at = [], None
        self.captured = frame(2)

    def send(self, packet):
        self.sent.append(packet)
        if len(self.sent) == self.fail_at:
            raise TimeoutError("uncertain acknowledgement")

    def learn(self):
        return self.captured


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "signals.json"
        self.profile, self.device = Profile(self.path), Fake()
        self.bench = Bench(self.profile, self.device, sleep=lambda _: None)

    def tearDown(self):
        self.tmp.cleanup()

    def load_keys(self):
        for n in range(10):
            self.profile.save(f"digit_{n}", frame(n))
        self.profile.save("reserve", frame(11))

    def test_empty_profile_never_sends(self):
        with self.assertRaises(ToolError):
            self.bench.reserve("123")
        self.assertEqual(self.device.sent, [])

    def test_missing_final_reserve_does_not_send_any_digits(self):
        self.profile.save("digit_1", frame(1))
        with self.assertRaises(ToolError):
            self.bench.reserve("11")
        self.assertEqual(self.device.sent, [])

    def test_reservation_order(self):
        self.load_keys()
        result = self.bench.reserve(" 103 ")
        self.assertEqual(self.device.sent, [frame(1), frame(0), frame(3), frame(11)])
        self.assertIn("화면에서 확인", result)

    def test_repeated_digits_preserved(self):
        self.load_keys()
        self.bench.reserve("777")
        self.assertEqual(self.device.sent, [frame(7)] * 3 + [frame(11)])

    def test_number_validation(self):
        for value in [None, 1, "", "0", "012", "123456", "1.5", "-3", "１２", "1 2", "12\n3"]:
            with self.subTest(value=value), self.assertRaises(ToolError):
                reservation_keys(value)

    def test_no_retry_or_following_keys_after_timeout(self):
        self.load_keys()
        self.device.fail_at = 2
        with self.assertRaisesRegex(ToolError, "1/4"):
            self.bench.reserve("123")
        self.assertEqual(self.device.sent, [frame(1), frame(2)])

    def test_concurrent_reservation_is_rejected(self):
        self.load_keys()
        started, release = threading.Event(), threading.Event()
        errors = []
        def delayed(_):
            started.set()
            release.wait(2)
        self.bench.sleep = delayed
        def worker():
            try:
                self.bench.reserve("12")
            except Exception as exc:
                errors.append(exc)
        thread = threading.Thread(target=worker)
        thread.start()
        self.assertTrue(started.wait(1))
        try:
            with self.assertRaisesRegex(ToolError, "다른 작업"):
                self.bench.reserve("34")
        finally:
            release.set()
            thread.join(3)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(self.device.sent, [frame(1), frame(2), frame(11)])

    def test_saved_profile_round_trip(self):
        self.bench.learn("start")
        self.assertEqual(Profile(self.path).codes["start"], self.device.captured)
        self.assertFalse(json.loads(self.path.read_text())["p2_hardware_verified"])

    def test_bad_capture_preserves_existing_profile(self):
        self.bench.learn("start")
        before = self.path.read_bytes()
        self.device.captured = b"invalid"
        with self.assertRaises(ToolError):
            self.bench.learn("start")
        self.assertEqual(self.path.read_bytes(), before)

    def test_corrupt_profile_not_silently_replaced(self):
        self.path.write_text("bad json")
        with self.assertRaises(ToolError):
            Profile(self.path)
        self.assertEqual(self.path.read_text(), "bad json")

    def test_late_corrupt_packet_preflight(self):
        self.load_keys()
        self.profile.codes["reserve"] = b"invalid"
        with self.assertRaises(ToolError):
            self.bench.reserve("123")
        self.assertEqual(self.device.sent, [])

    def test_rf_and_truncated_packets_rejected(self):
        for packet in [b"", b"\xb2\x00\x02\x00\x01\x01", b"\x26\x00\xff\x00\x01\x01", b"\x26\x00\x02\x00\x01\x00"]:
            with self.subTest(packet=packet), self.assertRaises(ToolError):
                check_packet(packet)

    def test_two_processes_cannot_control_same_profile(self):
        guard = SingleInstance(Path(self.tmp.name) / "bench.lock").acquire()
        command = [sys.executable, "-c", "from p2_core import SingleInstance; import sys; SingleInstance(sys.argv[1]).acquire()", str(guard.path)]
        try:
            other = subprocess.run(command, cwd=Path(__file__).parent, capture_output=True)
            self.assertNotEqual(other.returncode, 0)
        finally:
            guard.close()
        other = subprocess.run(command, cwd=Path(__file__).parent, capture_output=True)
        self.assertEqual(other.returncode, 0, other.stderr)


class AdapterTests(unittest.TestCase):
    def sdk(self, locked=False):
        dev = types.SimpleNamespace(is_locked=locked, timeout=10,
                                    auth=lambda: True, enter_learning=lambda: None,
                                    check_data=lambda: frame(4), send_data=lambda _: None)
        sdk = types.SimpleNamespace(hello=lambda *a, **k: dev,
                                    const=types.SimpleNamespace(DEFAULT_RETRY_INTVL=1),
                                    exceptions=types.SimpleNamespace(ReadError=LookupError))
        return dev, sdk

    def test_non_lan_address_rejected_before_discovery(self):
        for ip in ["8.8.8.8", "127.0.0.1", "169.254.1.2", "localhost", "192.168.1.999"]:
            with self.subTest(ip=ip), self.assertRaises(ToolError):
                BroadlinkTransport(ip, sdk=types.SimpleNamespace())

    def test_device_lock_reported(self):
        _, sdk = self.sdk(locked=True)
        with self.assertRaisesRegex(ToolError, "Lock device"):
            BroadlinkTransport("192.168.1.20", sdk=sdk)

    def test_adapter_learns_exact_capture(self):
        _, sdk = self.sdk()
        self.assertEqual(BroadlinkTransport("192.168.1.20", sdk=sdk).learn(), frame(4))

    def test_adapter_restores_timeout_after_send_failure(self):
        device, sdk = self.sdk()
        attempted = []
        def fail(packet):
            attempted.append((device.timeout, packet))
            raise TimeoutError()
        device.send_data = fail
        transport = BroadlinkTransport("192.168.1.20", sdk=sdk)
        with self.assertRaises(TimeoutError):
            transport.send(frame(4))
        self.assertEqual(attempted, [(0.5, frame(4))])
        self.assertEqual(device.timeout, 10)

    def test_read_error_only_is_polled(self):
        device, sdk = self.sdk()
        responses = iter([LookupError(), frame(5)])
        def read():
            result = next(responses)
            if isinstance(result, Exception):
                raise result
            return result
        device.check_data = read
        with patch("p2_broadlink.time.sleep"):
            self.assertEqual(BroadlinkTransport("192.168.1.20", sdk=sdk).learn(), frame(5))

    def test_authentication_failure_is_not_polled(self):
        device, sdk = self.sdk()
        def fail():
            raise PermissionError("expired authentication")
        device.check_data = fail
        with self.assertRaises(PermissionError):
            BroadlinkTransport("192.168.1.20", sdk=sdk).learn()


if __name__ == "__main__":
    unittest.main(verbosity=2)
