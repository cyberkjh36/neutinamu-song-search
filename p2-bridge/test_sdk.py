"""Pinned SDK checks. All sockets/discovery are mocked; no LAN traffic."""
import socket
import types
import unittest
from unittest.mock import patch

from p2_broadlink import BroadlinkTransport

try:
    import broadlink
except ImportError:
    broadlink = None


@unittest.skipIf(broadlink is None, "Install requirements.txt to check the pinned SDK")
class PinnedSDKTests(unittest.TestCase):
    def device(self):
        dev = broadlink.rm4mini(("192.168.1.20", 80), b"\x01\x02\x03\x04\x05\x06", 0x51DA)
        dev.auth = lambda: True
        return dev

    def test_adapter_calls_supported_sdk_methods(self):
        dev = self.device()
        captured = broadlink.remote.pulses_to_data([500, 500, 1000, 500])
        with patch.object(broadlink, "hello", return_value=dev) as hello, \
             patch.object(dev, "enter_learning") as enter, \
             patch.object(dev, "check_data", return_value=captured):
            transport = BroadlinkTransport("192.168.1.20", sdk=broadlink)
            self.assertEqual(transport.learn(), captured)
            hello.assert_called_once_with("192.168.1.20", timeout=3)
            enter.assert_called_once_with()

    def test_actual_sdk_sends_only_once_before_timeout(self):
        dev = self.device()
        packets = []
        class SocketStub:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def settimeout(self, value):
                self.timeout = value
            def sendto(self, packet, host):
                packets.append((packet, host, self.timeout))
            def recvfrom(self, size):
                raise socket.timeout()
        with patch.object(broadlink, "hello", return_value=dev):
            transport = BroadlinkTransport("192.168.1.20", sdk=broadlink)
        with patch("broadlink.device.socket.socket", return_value=SocketStub()), \
             patch("broadlink.device.time.time", side_effect=[0, 0, 1]):
            with self.assertRaises(broadlink.exceptions.NetworkTimeoutError):
                transport.send(broadlink.remote.pulses_to_data([500, 500, 1000, 500]))
        self.assertEqual(len(packets), 1)
        self.assertEqual(packets[0][1], ("192.168.1.20", 80))
        self.assertEqual(packets[0][2], 0.5)
        self.assertEqual(dev.timeout, 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
