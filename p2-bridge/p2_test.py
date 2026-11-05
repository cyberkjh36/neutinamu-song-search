"""P2 signal learning and outbound phone bridge GUI."""
import os
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

from p2_broadlink import BroadlinkTransport
from p2_core import Bench, KEYS, Profile, SingleInstance, ToolError
from p2_phone import PhonePanel

DATA_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "NeutinamuP2Test"


class App:
    def __init__(self, root, profile):
        self.root, self.profile, self.bench = root, profile, None
        self.busy = False
        self.events = queue.Queue()
        root.title("느티나무 P2 휴대폰 연결 · v0.2")
        root.geometry("780x800")
        root.minsize(700, 760)
        root.configure(bg="#10243a")
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TButton", font=("Malgun Gothic", 12), padding=10)
        style.configure("TLabel", font=("Malgun Gothic", 12))
        outer = ttk.Frame(root, padding=22)
        outer.pack(fill="both", expand=True)
        ttk.Label(outer, text="P2 리모컨 · 휴대폰 연결", font=("Malgun Gothic", 22, "bold")).pack(anchor="w")
        ttk.Label(outer, text="실제 리모컨 신호를 학습하고 P2에서 시험한 뒤 연결하세요.", foreground="#9a4c00").pack(anchor="w", pady=(6, 16))
        row = ttk.Frame(outer)
        row.pack(fill="x")
        ttk.Label(row, text="송신 장치 IP").pack(side="left")
        self.ip = ttk.Entry(row, width=20, font=("Arial", 16))
        self.ip.pack(side="left", padx=10)
        self.connect_button = ttk.Button(row, text="장치 연결", command=self.connect)
        self.connect_button.pack(side="left")
        ttk.Label(outer, text="RM4 mini와 PC를 같은 공유기에 연결한 뒤, 장치의 IP 주소를 입력하세요.", wraplength=690).pack(anchor="w", pady=12)
        ttk.Separator(outer).pack(fill="x", pady=8)
        ttk.Label(outer, text="1. 학습할 버튼 선택").pack(anchor="w", pady=(8, 5))
        self.key = ttk.Combobox(outer, state="readonly", values=[f"{KEYS[k]} ({k})" for k in KEYS], font=("Malgun Gothic", 14))
        self.key.current(0)
        self.key.pack(fill="x")
        row = ttk.Frame(outer)
        row.pack(fill="x", pady=12)
        self.learn_button = ttk.Button(row, text="선택 버튼 학습", command=self.learn)
        self.learn_button.pack(side="left", expand=True, fill="x", padx=(0, 6))
        self.send_button = ttk.Button(row, text="선택 버튼 시험", command=self.send)
        self.send_button.pack(side="left", expand=True, fill="x", padx=(6, 0))
        self.saved = ttk.Label(outer, wraplength=690)
        self.saved.pack(anchor="w", pady=(0, 12))
        ttk.Separator(outer).pack(fill="x", pady=8)
        ttk.Label(outer, text="2. 곡번호 예약 시험").pack(anchor="w", pady=(8, 5))
        row = ttk.Frame(outer)
        row.pack(fill="x")
        self.number = ttk.Entry(row, width=12, font=("Arial", 22))
        self.number.pack(side="left", fill="x", expand=True, padx=(0, 12))
        self.reserve_button = ttk.Button(row, text="이 곡 예약 시험", command=self.reserve)
        self.reserve_button.pack(side="left")
        ttk.Label(outer, text="P2의 숫자 입력칸을 비운 뒤 시험하세요. 시험 중에는 기존 리모컨을 누르지 마세요.", wraplength=690).pack(anchor="w", pady=10)
        self.status = tk.StringVar(value="먼저 송신 장치를 연결하세요. 등록된 리모컨 신호는 처음에는 없습니다.")
        ttk.Label(outer, textvariable=self.status, wraplength=690, foreground="#125b64", font=("Malgun Gothic", 13, "bold")).pack(anchor="w", pady=10)
        ttk.Label(outer, text="신호를 보냈다는 응답은 P2의 예약·재생 성공을 의미하지 않습니다.\nP2 화면에서 직접 확인하세요. 휴대폰 연결 창을 닫아도 연결은 유지됩니다.", wraplength=690).pack(anchor="w", pady=8)
        self.phone = PhonePanel(self, DATA_DIR)
        ttk.Button(outer, text="📱 P2 휴대폰 연결 / QR", command=self.phone.toggle).pack(fill="x", pady=8)
        self.refresh()
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.after(100, self.poll)

    def selected(self):
        return list(KEYS)[self.key.current()]

    def refresh(self):
        locked = self.busy or (hasattr(self, "phone") and self.phone.active())
        self.saved.configure(text="학습된 버튼: " + (", ".join(KEYS[k] for k in KEYS if k in self.profile.codes) or "없음"))
        self.connect_button.configure(state="disabled" if locked else "normal")
        self.ip.configure(state="disabled" if locked else "normal")
        self.key.configure(state="disabled" if locked else "readonly")
        self.number.configure(state="disabled" if locked else "normal")
        state = "normal" if self.bench and not locked else "disabled"
        for button in (self.learn_button, self.send_button, self.reserve_button):
            button.configure(state=state)

    def run(self, action, message):
        if self.busy or self.phone.active():
            return
        self.busy = True
        self.status.set(message)
        self.refresh()
        def work():
            try:
                self.events.put((True, action()))
            except Exception as exc:
                self.events.put((False, str(exc)))
        threading.Thread(target=work, daemon=True).start()

    def poll(self):
        try:
            ok, result = self.events.get_nowait()
            self.busy = False
            if ok and isinstance(result, Bench):
                self.bench = result
                result = "송신 장치에 연결했습니다. P2와의 연결 확인은 아직 아닙니다."
            self.status.set(result if ok else "확인 필요: " + result)
            self.refresh()
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def connect(self):
        address = self.ip.get()
        self.bench = None
        self.run(lambda: Bench(self.profile, BroadlinkTransport(address)), "송신 장치 연결을 확인하는 중입니다…")

    def learn(self):
        key = self.selected()
        if key in self.profile.codes and not messagebox.askyesno("다시 학습", "이 버튼의 기존 신호를 새 신호로 바꿀까요?"):
            return
        self.run(lambda: self.bench.learn(key), f"학습 준비 중입니다. 장치의 학습 표시등이 켜지면 리모컨의 ‘{KEYS[key]}’ 버튼을 짧게 한 번 누르세요.")

    def send(self):
        key = self.selected()
        if not messagebox.askyesno("실제 신호 전송", f"P2에 ‘{KEYS[key]}’ 신호를 보냅니다. 시험할까요?"):
            return
        self.run(lambda: self.bench.send([key]), "선택한 버튼의 신호를 보내는 중입니다…")

    def reserve(self):
        number = self.number.get()
        if not messagebox.askyesno("예약 시험", "P2 숫자 입력칸이 비어 있나요?\n곡번호와 예약 신호를 순서대로 보냅니다."):
            return
        self.run(lambda: self.bench.reserve(number), "곡번호와 예약 신호를 순서대로 보내는 중입니다…")

    def close(self):
        if self.busy:
            messagebox.showinfo("작업 중", "현재 학습 또는 전송이 끝난 뒤 닫아 주세요.")
            return
        if self.phone.active():
            self.phone.stop()
            self.root.after(200, self.close)
            return
        self.root.destroy()


def main():
    root = tk.Tk()
    root.withdraw()
    guard = SingleInstance(DATA_DIR / "bench.lock")
    try:
        guard.acquire()
        profile = Profile(DATA_DIR / "signals.json")
        App(root, profile)
        root.deiconify()
        root.mainloop()
    except Exception as exc:
        messagebox.showerror("P2 시험 도구", str(exc))
        root.destroy()
    finally:
        guard.close()


if __name__ == "__main__":
    main()
