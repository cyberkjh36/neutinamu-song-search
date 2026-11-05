"""Outbound HTTPS bridge. No hardware success is inferred from relay acceptance."""
import hashlib
import json
import os
import re
import secrets
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

from p2_core import KEYS, ToolError, reservation_keys

ENDPOINT = "https://world-karaoke-connect.almondjoy11.chatgpt.site/api/p2"
PHONE_URL = "https://cyberkjh36.github.io/neutinamu-song-search/?p2="
REQUIRED = {f"digit_{n}" for n in range(10)} | {"reserve"}


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix="p2-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def fingerprint(profile):
    digest = hashlib.sha256()
    for key, packet in sorted(profile.codes.items()):
        digest.update(key.encode() + b"\0" + packet)
    return digest.hexdigest()


class Settings:
    def __init__(self, path):
        self.path = Path(path)
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))
            if not re.fullmatch("[a-f0-9]{64}", self.data.get("host", "")):
                raise ToolError("P2 연결 설정 파일을 확인해 주세요. 자동으로 초기화하지 않았습니다.")
        else:
            self.data = {"host": secrets.token_hex(32), "name": "느티나무 P2", "room": "", "verified": ""}
            self.save()

    def save(self):
        atomic_json(self.path, self.data)

    def verify(self, profile):
        if not REQUIRED.issubset(profile.codes):
            raise ToolError("숫자 0~9와 예약 버튼을 모두 학습한 뒤 P2에서 시험해 주세요.")
        self.data["verified"] = fingerprint(profile)
        self.save()


class RelayAPI:
    def __init__(self, settings):
        self.settings = settings

    def call(self, op, **extra):
        data = {"op": op, "key": self.settings.data["host"], "room": self.settings.data.get("room", ""), **extra}
        req = urllib.request.Request(ENDPOINT, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=7) as response:
            result = json.loads(response.read(16384))
        if not result.get("ok"):
            raise ToolError("중계 연결 오류: " + str(result.get("code", "unknown")))
        return result


class Bridge:
    def __init__(self, bench, settings, journal_path, api=None, notify=lambda msg: None, clock=time.time):
        self.bench, self.settings, self.api = bench, settings, api or RelayAPI(settings)
        self.notify, self.clock = notify, clock
        self.stop_event = threading.Event()
        self.resume_requested = threading.Event()
        self.running = False
        self.halted = False
        self.journal_path = Path(journal_path)
        self.receipts = json.loads(self.journal_path.read_text(encoding="utf-8")) if self.journal_path.exists() else {}
        if not isinstance(self.receipts, dict):
            raise ToolError("전송 기록 파일을 확인해 주세요.")
        # A crash during a transmission cannot be interpreted as a clean completion.
        if any(r.get("status") == "unknown" and not r.get("reviewed") for r in self.receipts.values()):
            self.halted = True

    def capabilities(self):
        if self.halted or self.stop_event.is_set() or self.bench.lock.locked():
            return []
        profile = self.bench.profile
        if not REQUIRED.issubset(profile.codes) or self.settings.data.get("verified") != fingerprint(profile):
            return []
        return sorted(profile.codes)

    def save_receipts(self):
        # Never discard an uncertain/unacknowledged transmission automatically.
        cutoff = self.clock() - 86400
        self.receipts = {k: v for k, v in self.receipts.items() if not v.get("acked") or v.get("status") == "unknown" or v.get("time", 0) > cutoff}
        atomic_json(self.journal_path, self.receipts)

    def ack(self, ident):
        receipt = self.receipts[ident]
        self.api.call("ack", id=ident, status=receipt["status"])
        receipt["acked"] = True
        self.save_receipts()

    def execute(self, job):
        ident = job.get("id", "")
        if not re.fullmatch("[a-f0-9]{32}", ident):
            raise ToolError("잘못된 명령 번호입니다.")
        if ident in self.receipts:
            self.ack(ident)
            return  # Never replay a previously attempted physical action.
        command = job.get("command", {})
        try:
            if command.get("action") == "reserve":
                number = command.get("number")
                if not isinstance(number, str) or not re.fullmatch(r"[1-9][0-9]{0,4}", number):
                    raise ToolError("잘못된 곡번호입니다.")
                keys = reservation_keys(number)
            elif command.get("action") == "key" and command.get("key") in {"start", "cancel", "pause", "key_up", "key_down"}:
                keys = [command["key"]]
            else:
                raise ToolError("지원하지 않는 명령입니다.")
            if job.get("expires", 0) <= self.clock() * 1000 or not set(keys).issubset(self.capabilities()):
                raise ToolError("연결 시간이 지났거나 신호 전송 준비가 되지 않았습니다.")
            self.bench.profile.packets(keys)
        except (ToolError, TypeError):
            self.receipts[ident] = {"status": "failed", "time": self.clock(), "acked": False}
            self.save_receipts()
            self.ack(ident)
            return
        # Write-ahead record: crash or lost ACK must never cause a second send.
        self.receipts[ident] = {"status": "unknown", "time": self.clock(), "acked": False}
        self.save_receipts()
        try:
            self.bench.send(keys)
        except Exception:
            self.halted = True
            self.notify("전송 중 문제가 생겨 휴대폰 조작을 중단했습니다. P2 숫자 입력칸과 예약 목록을 확인한 뒤 ‘확인 후 재개’를 누르세요.")
        else:
            self.receipts[ident]["status"] = "sent"
            self.notify("송신 장치가 응답했습니다. P2 화면에서 실제 동작을 확인하세요.")
        self.save_receipts()
        self.ack(ident)

    def resume(self):
        # Caller must obtain operator confirmation after checking physical P2 state.
        self.halted = False
        for receipt in self.receipts.values():
            if receipt["status"] == "unknown":
                receipt["reviewed"] = True
        self.save_receipts()

    def tick(self):
        if self.resume_requested.is_set():
            self.resume_requested.clear()
            self.resume()
        for ident, receipt in list(self.receipts.items()):
            if not receipt.get("acked"):
                self.ack(ident)
        response = self.api.call("poll", capabilities=self.capabilities())
        self.notify({"phones": response.get("phones", 0), "halted": self.halted, "ready": bool(self.capabilities())})
        if response.get("job"):
            self.execute(response["job"])

    def run(self):
        self.running = True
        try:
            result = self.api.call("create", name=self.settings.data.get("name", "느티나무 P2"))
            self.settings.data["room"] = result["room"]
            self.settings.save()
            self.notify({"room": result["room"]})
            while not self.stop_event.is_set():
                try:
                    self.tick()
                except Exception:
                    self.notify("인터넷 연결을 확인 중입니다. 전송했던 신호는 다시 보내지 않습니다.")
                self.stop_event.wait(2)
        except Exception:
            self.notify("휴대폰 중계 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시작하세요.")
        finally:
            try:
                if self.settings.data.get("room"):
                    self.api.call("close")
            except Exception:
                pass
            self.running = False
            self.notify({"stopped": True})

    def stop(self):
        self.stop_event.set()
