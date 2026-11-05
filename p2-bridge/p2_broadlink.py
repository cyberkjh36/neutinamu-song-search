"""Adapter for python-broadlink 0.19.0. No hardware protocol is fabricated."""
import ipaddress
import time

from p2_core import ToolError, check_packet


class BroadlinkTransport:
    def __init__(self, address, sdk=None):
        try:
            addr = ipaddress.IPv4Address(address.strip())
        except (ValueError, AttributeError) as exc:
            raise ToolError("RM4 mini의 IPv4 주소를 입력하세요. 예: 192.168.0.25") from exc
        local_ranges = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
        if not any(addr in ipaddress.IPv4Network(net) for net in local_ranges):
            raise ToolError("매장 내부망에 있는 장치의 IP 주소만 사용할 수 있습니다.")
        if sdk is None:
            try:
                import broadlink as sdk
            except ImportError as exc:
                raise ToolError("필수 패키지가 없습니다. 먼저 1_install_dependencies.cmd를 실행하세요.") from exc
        self.sdk = sdk
        self.device = sdk.hello(str(addr), timeout=3)
        if not all(callable(getattr(self.device, m, None)) for m in ("auth", "enter_learning", "check_data", "send_data")):
            raise ToolError("적외선 학습 기능이 있는 BroadLink 장치가 아닙니다.")
        if self.device.is_locked:
            raise ToolError("BroadLink 앱에서 해당 장치의 ‘Lock device’를 해제한 뒤 다시 연결하세요.")
        if not self.device.auth():
            raise ToolError("송신 장치 인증에 실패했습니다.")

    def learn(self, timeout=15):
        self.device.enter_learning()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                packet = self.device.check_data()
            except self.sdk.exceptions.ReadError:
                time.sleep(0.3)
                continue
            if packet:
                return check_packet(packet)
            time.sleep(0.3)
        raise ToolError("15초 동안 신호를 받지 못했습니다. 리모컨을 송신 장치 가까이 향하게 하고 다시 학습하세요.")

    def send(self, packet):
        check_packet(packet)
        old_timeout = self.device.timeout
        # In the pinned SDK this is below its retry interval, so an unanswered
        # send times out before the normal automatic UDP retransmission.
        retry_interval = self.sdk.const.DEFAULT_RETRY_INTVL
        self.device.timeout = min(0.5, retry_interval / 2)
        try:
            self.device.send_data(packet)
        finally:
            self.device.timeout = old_timeout
