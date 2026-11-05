"""Neutinamu P2 IR bench tool. No P2 codes are included or assumed."""
from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path

KEYS = {**{f"digit_{n}": str(n) for n in range(10)},
        "reserve": "예약", "start": "시작", "cancel": "취소",
        "pause": "일시정지", "key_up": "음정 올림", "key_down": "음정 내림"}


class ToolError(Exception):
    pass


def check_packet(packet):
    """Accept captured Broadlink IR frames, never invented example frames."""
    if not isinstance(packet, (bytes, bytearray)) or not 6 <= len(packet) <= 8192:
        raise ToolError("학습 신호의 길이가 올바르지 않습니다.")
    packet = bytes(packet)
    if packet[0] != 0x26:
        raise ToolError("적외선(IR) 신호가 아닙니다. RF 신호는 사용할 수 없습니다.")
    end = 4 + int.from_bytes(packet[2:4], "little")
    if end <= 4 or end > len(packet):
        raise ToolError("학습 신호가 잘렸거나 손상되었습니다.")
    i = 4
    while i < end:
        if packet[i] == 0:
            if i + 2 >= end:
                raise ToolError("학습 신호의 펄스 정보가 손상되었습니다.")
            i += 3
        else:
            i += 1
    return packet


class Profile:
    def __init__(self, path):
        self.path = Path(path)
        self.codes = {}
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if data.get("schema") != 1 or data.get("purpose") != "p2-ir-bench":
                    raise ValueError("다른 형식의 파일")
                for key, encoded in data["codes"].items():
                    if key not in KEYS:
                        raise ValueError("알 수 없는 버튼")
                    self.codes[key] = check_packet(base64.b64decode(encoded, validate=True))
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                raise ToolError("저장된 신호 파일을 읽지 못했습니다. 파일을 덮어쓰지 않았습니다.") from exc

    def save(self, key, packet):
        if key not in KEYS:
            raise ToolError("지원하지 않는 버튼입니다.")
        packet = check_packet(packet)
        updated = dict(self.codes, **{key: packet})
        data = {"schema": 1, "purpose": "p2-ir-bench", "remote": "TIR-1090 (user captured)",
                "p2_hardware_verified": False,
                "codes": {k: base64.b64encode(v).decode("ascii") for k, v in updated.items()}}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix="signals-", suffix=".tmp", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        self.codes = updated

    def packets(self, keys):
        missing = [KEYS[k] for k in keys if k not in self.codes]
        if missing:
            raise ToolError("먼저 학습할 버튼: " + ", ".join(dict.fromkeys(missing)))
        # Validate every frame before sending even the first digit.
        return [check_packet(self.codes[k]) for k in keys]


def reservation_keys(number):
    if not isinstance(number, str) or not re.fullmatch(r"[1-9][0-9]{0,4}", number.strip()):
        raise ToolError("곡번호를 1~5자리 숫자로 입력하세요. 앞에 0을 붙이지 마세요.")
    return [f"digit_{n}" for n in number.strip()] + ["reserve"]


class Bench:
    def __init__(self, profile, transport, gap=0.35, sleep=time.sleep):
        if not 0.2 <= gap <= 2:
            raise ValueError("gap must be between 0.2 and 2 seconds")
        self.profile, self.transport, self.gap, self.sleep = profile, transport, gap, sleep
        self.lock = threading.Lock()

    def learn(self, key):
        if key not in KEYS:
            raise ToolError("지원하지 않는 버튼입니다.")
        if not self.lock.acquire(blocking=False):
            raise ToolError("다른 작업이 진행 중입니다.")
        try:
            packet = self.transport.learn()
            self.profile.save(key, packet)
            return "신호를 저장했습니다. P2 작동 여부는 ‘선택 버튼 시험’으로 확인하세요."
        finally:
            self.lock.release()

    def send(self, keys):
        if not keys or any(k not in KEYS for k in keys):
            raise ToolError("지원하지 않는 버튼입니다.")
        if not self.lock.acquire(blocking=False):
            raise ToolError("다른 작업이 진행 중입니다. 곡번호가 섞이지 않도록 잠시 기다려 주세요.")
        try:
            packets = self.profile.packets(keys)
            completed = 0
            for i, packet in enumerate(packets):
                try:
                    self.transport.send(packet)
                except Exception as exc:
                    raise ToolError(
                        f"전송 도중 중단했습니다. {completed}/{len(packets)}개 신호의 장치 응답을 받았습니다. "
                        "마지막 신호는 이미 전달되었을 수도 있습니다. 자동 재전송하지 않습니다. "
                        "P2 화면과 입력 중인 숫자를 확인한 뒤 다시 시험하세요."
                    ) from exc
                completed += 1
                if i + 1 < len(packets):
                    self.sleep(self.gap)
            return "송신 장치가 응답했습니다. P2 예약·재생 성공 여부는 반주기 화면에서 확인하세요."
        finally:
            self.lock.release()

    def reserve(self, number):
        return self.send(reservation_keys(number))


class SingleInstance:
    """One bench process per profile: prevents simultaneous macro transmission."""
    def __init__(self, path):
        self.path, self.file = Path(path), None

    def acquire(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = open(self.path, "a+b")
        self.file.seek(0, 2)
        if not self.file.tell():
            self.file.write(b"0")
            self.file.flush()
        self.file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.file.close()
            self.file = None
            raise ToolError("시험 도구가 이미 실행 중입니다. 먼저 열린 창을 사용하세요.") from exc
        return self

    def close(self):
        if self.file:
            self.file.close()
            self.file = None
