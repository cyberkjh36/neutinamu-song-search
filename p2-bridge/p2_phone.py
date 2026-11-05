"""Tk phone pairing window. Hiding the QR never rotates its saved code."""
import queue
import threading
import tkinter as tk
from tkinter import messagebox, ttk

from p2_bridge import Bridge, PHONE_URL, Settings


class PhonePanel:
    def __init__(self, app, directory):
        self.app, self.directory = app, directory
        self.settings = Settings(directory / "bridge_config.json")
        self.events = queue.Queue()
        self.bridge = None
        self.window = None
        self.stopping = False
        app.root.after(100, self.poll)

    def active(self):
        return bool(self.bridge and self.bridge.running)

    def toggle(self):
        if self.window and self.window.winfo_exists():
            if self.window.state() == 'withdrawn':
                self.window.deiconify()
                self.window.lift()
            else:
                self.window.withdraw()
            return
        w = self.window = tk.Toplevel(self.app.root)
        w.title("P2 휴대폰 연결")
        w.geometry("580x760")
        w.minsize(540, 720)
        w.protocol("WM_DELETE_WINDOW", w.withdraw)
        frame = ttk.Frame(w, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="휴대폰으로 P2 예약", font=("Malgun Gothic", 22, "bold")).pack(pady=(0, 12))
        ttk.Label(frame, text="창을 닫아도 연결은 유지됩니다. 휴대폰은 최대 5대까지 연결됩니다.", wraplength=510).pack()
        self.code = tk.StringVar(value=self.settings.data.get("room") or "연결 시작 후 표시")
        ttk.Label(frame, textvariable=self.code, font=("Arial", 30, "bold")).pack(pady=10)
        self.qr = ttk.Label(frame, text="PC에서 신호 시험을 마친 뒤 연결을 시작하세요.")
        self.qr.pack(pady=8)
        self.link = tk.StringVar()
        ttk.Entry(frame, textvariable=self.link, state="readonly").pack(fill="x", pady=8)
        self.status = tk.StringVar(value="송신 장치 연결 → 숫자 0~9·예약 신호 학습 → P2 시험 → 아래 버튼")
        ttk.Label(frame, textvariable=self.status, wraplength=510).pack(pady=10)
        self.verify_button = ttk.Button(frame, text="P2에서 시험 완료 · 휴대폰 연결 시작", command=self.start)
        self.verify_button.pack(fill="x", pady=5)
        self.resume_button = ttk.Button(frame, text="P2 화면 확인 후 재개", command=self.resume)
        self.resume_button.pack(fill="x", pady=5)
        self.stop_button = ttk.Button(frame, text="휴대폰 연결 중지", command=self.stop)
        self.stop_button.pack(fill="x", pady=5)
        ttk.Label(frame, text="신호 전송 응답은 P2의 예약 성공 확인이 아닙니다.\n앱과 기존 리모컨으로 동시에 숫자를 입력하지 마세요.", wraplength=510).pack(pady=8)
        self.render_room()

    def render_room(self):
        room = self.settings.data.get("room")
        if not room or not self.window:
            return
        self.code.set(room)
        self.link.set(PHONE_URL + room)
        try:
            import qrcode
            qr = qrcode.QRCode(border=4, error_correction=qrcode.constants.ERROR_CORRECT_M)
            qr.add_data(PHONE_URL + room)
            qr.make(fit=True)
            matrix = qr.get_matrix()
            scale = max(3, 240 // len(matrix))
            img = tk.PhotoImage(width=len(matrix)*scale, height=len(matrix)*scale)
            for y, row in enumerate(matrix):
                for x, black in enumerate(row):
                    img.put("#000000" if black else "#ffffff", to=(x*scale, y*scale, (x+1)*scale, (y+1)*scale))
            self.qr.configure(image=img, text="")
            self.qr_image = img
        except ImportError:
            self.qr.configure(text="QR 표시 모듈이 없습니다. 휴대폰에서 위 연결번호를 입력하세요.")

    def start(self):
        if self.active() or self.app.busy:
            return
        if not self.app.bench:
            messagebox.showinfo("장치 연결 필요", "먼저 메인 창에서 송신 장치를 연결하세요.", parent=self.window)
            return
        if not messagebox.askyesno("P2 실물 시험 확인", "학습한 숫자 0~9·예약 및 추가 버튼을 실제 P2에서 시험했나요?\n\nP2 숫자 입력칸을 비우고 확인한 경우에만 ‘예’를 누르세요.\n휴대폰에서 누르는 버튼은 실제 반주기를 조작합니다.", parent=self.window):
            return
        try:
            self.settings.verify(self.app.profile)
            self.bridge = Bridge(self.app.bench, self.settings, self.directory / "phone_receipts.json", notify=self.events.put)
            if self.bridge.halted:
                self.bridge.resume()  # Explicit P2-state confirmation immediately above.
            self.bridge.running = True
            threading.Thread(target=self.bridge.run, daemon=True).start()
            self.status.set("중계 서버에 연결 중입니다…")
            self.app.refresh()
        except Exception as exc:
            messagebox.showerror("확인 필요", str(exc), parent=self.window)

    def resume(self):
        if not self.active() or not self.bridge.halted:
            return
        if messagebox.askyesno("P2 확인", "예약 목록과 숫자 입력칸을 확인하고 입력 중인 숫자를 지웠나요?\n이미 들어간 예약은 자동으로 다시 보내지 않습니다.", parent=self.window):
            # Worker consumes resume event, avoiding concurrent journal writes.
            self.bridge.resume_requested.set()

    def stop(self):
        if self.bridge:
            self.bridge.stop()
            self.status.set("현재 전송을 마친 뒤 연결을 중지합니다…")

    def poll(self):
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            if isinstance(event, dict):
                if "room" in event:
                    self.render_room()
                if "phones" in event and self.window:
                    status = "P2 확인 후 재개 필요" if event["halted"] else "연결 준비 완료" if event["ready"] else "신호 전송 준비 필요"
                    self.status.set(f"{status} · 휴대폰 {event['phones']}/5대")
                if event.get("stopped"):
                    if self.window:
                        self.status.set("연결을 중지했습니다. 다음에 시작해도 같은 연결번호를 사용합니다.")
                    self.app.refresh()
            elif self.window:
                self.status.set(str(event))
        if self.window:
            self.verify_button.configure(state="disabled" if self.active() or self.app.busy else "normal")
            self.resume_button.configure(state="normal" if self.active() and self.bridge.halted else "disabled")
        self.app.root.after(100, self.poll)
