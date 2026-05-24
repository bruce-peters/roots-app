#!/usr/bin/env python3
"""
Roots — mock recording device (live CLI)

- PortAudio callback continuously captures mic into a lock-free buffer
  (so audio is NEVER paused while we transcribe).
- A worker thread drains the buffer, runs faster-whisper, POSTs the growing
  transcript to /process-transcript.
- A poller thread alternates POST /suggest-next-questions (to generate fresh
  follow-ups) and GET /get-interview-questions (to read them).
- rich.Live renders a split pane: transcript left, suggested questions right.

Usage:
  python recorder.py            # real mic recording
  python recorder.py --mock     # stream canned transcript chunks (no mic)

Dependencies:
  pip install faster-whisper sounddevice numpy requests rich opencv-python
"""

import argparse
import os
import shutil
import subprocess
import tempfile
import threading
import time
import wave
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import requests
from rich.align import Align
from rich.console import Console, Group
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

SUPABASE_URL = "https://hmggakolwdysrcitibry.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZ2dha29sd2R5c3JjaXRpYnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTYwMDYsImV4cCI6MjA5NTEzMjAwNn0"
    ".ipgkpOau3GgBm2zq0YzCVEJMURaTrdpC6N6VZWZvw40"
)
PROCESS_URL = f"{SUPABASE_URL}/functions/v1/process-transcript"
GET_QUESTIONS_URL = f"{SUPABASE_URL}/functions/v1/get-interview-questions"
UPLOAD_VIDEO_URL = f"{SUPABASE_URL}/functions/v1/upload-video"

HEADERS = {
    "Authorization": f"Bearer {ANON_KEY}",
    "apikey": ANON_KEY,
    "Content-Type": "application/json",
}

SAMPLE_RATE = 16000

MOCK_CHUNKS = [
    "My name is Rose Bellini.",
    "I was born in Salerno, in the south of Italy, in 1931.",
    "We came to America when I was seven years old.",
    "My father had a cousin already in Hoboken, New Jersey.",
    "I remember the smell of the boat — salt and engine oil.",
    "When we arrived, the Statue of Liberty was the first thing I saw.",
    "I thought she was a queen. My mother laughed and said, no, she is freedom.",
    "We lived in two rooms above a bakery on Washington Street.",
    "Every morning I woke up to the smell of bread.",
    "I have never forgotten that smell.",
]


@dataclass
class Chunk:
    text: str
    heard_at: datetime
    sent_at: Optional[datetime] = None
    status: str = "pending"  # pending | ok | err
    detail: str = ""


@dataclass
class State:
    chunks: list[Chunk] = field(default_factory=list)
    deeper_q: str = "(waiting…)"
    shift_q: str = "(waiting…)"
    last_poll: Optional[datetime] = None
    poll_error: str = ""
    status: str = "starting"
    audio_secs: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def add_chunk(self, text: str) -> Chunk:
        with self.lock:
            c = Chunk(text=text, heard_at=datetime.now())
            self.chunks.append(c)
            return c

    def full_transcript(self) -> str:
        with self.lock:
            return " ".join(c.text for c in self.chunks).strip()


console = Console()
state = State()
stop_event = threading.Event()
capture_ready = threading.Event()


# ─── HTTP ────────────────────────────────────────────────────────────────────

def post_transcript(chunk: Chunk, full: str) -> None:
    try:
        resp = requests.post(PROCESS_URL, json={"transcript": full}, headers=HEADERS, timeout=15)
        with state.lock:
            chunk.sent_at = datetime.now()
            chunk.status = "ok" if resp.ok else "err"
            chunk.detail = f"{resp.status_code}"
    except requests.RequestException as exc:
        with state.lock:
            chunk.sent_at = datetime.now()
            chunk.status = "err"
            chunk.detail = str(exc)[:40]


def questions_loop(poll_every: float = 3.0) -> None:
    """Poll GET /get-interview-questions. The server triggers suggest itself."""
    while not stop_event.is_set():
        try:
            r = requests.get(GET_QUESTIONS_URL, headers=HEADERS, timeout=10)
            if r.ok:
                data = r.json()
                with state.lock:
                    state.deeper_q = data.get("deeper_question") or "(none)"
                    state.shift_q = data.get("shift_question") or "(none)"
                    state.last_poll = datetime.now()
                    state.poll_error = ""
            else:
                with state.lock:
                    state.poll_error = f"get {r.status_code}: {r.text[:80]}"
        except requests.RequestException as exc:
            with state.lock:
                state.poll_error = f"get err: {str(exc)[:80]}"

        stop_event.wait(poll_every)


# ─── Rendering ───────────────────────────────────────────────────────────────

def render() -> Layout:
    layout = Layout()
    layout.split_row(
        Layout(name="left", ratio=2),
        Layout(name="right", ratio=1, minimum_size=36),
    )

    table = Table.grid(expand=True, padding=(0, 1))
    table.add_column(ratio=4, overflow="fold")
    table.add_column(justify="right", no_wrap=True, width=22)

    with state.lock:
        chunks = list(state.chunks)
        deeper = state.deeper_q
        shift = state.shift_q
        last_poll = state.last_poll
        poll_err = state.poll_error
        status = state.status
        audio_secs = state.audio_secs

    if not chunks:
        table.add_row(Text("(listening…)", style="dim italic"), "")
    else:
        for c in chunks:
            if c.status == "ok":
                marker = Text(f"SENT {c.sent_at:%H:%M:%S}", style="green")
            elif c.status == "err":
                marker = Text(f"ERR {c.detail}", style="red")
            else:
                marker = Text("…sending", style="yellow")
            table.add_row(Text(c.text, style="white"), marker)

    subtitle = f"[dim]{status}  ·  buffer {audio_secs:.1f}s[/]"
    layout["left"].update(
        Panel(table, title="[bold]Transcript[/]", border_style="cyan", subtitle=subtitle)
    )

    poll_str = f"polled {last_poll:%H:%M:%S}" if last_poll else "not yet polled"
    pieces = [
        Text("Deeper", style="bold magenta"),
        Text(deeper, style="italic white"),
        Text(""),
        Text("Shift", style="bold magenta"),
        Text(shift, style="italic white"),
        Text(""),
        Align.right(Text(poll_str, style="dim")),
    ]
    if poll_err:
        pieces.append(Text(poll_err, style="red"))
    layout["right"].update(
        Panel(Group(*pieces), title="[bold]Suggested Questions[/]", border_style="magenta")
    )
    return layout


# ─── Mock mode ───────────────────────────────────────────────────────────────

def mock_loop(delay: float):
    state.status = "mock streaming"
    for text in MOCK_CHUNKS:
        if stop_event.is_set():
            return
        chunk = state.add_chunk(text)
        post_transcript(chunk, state.full_transcript())
        if stop_event.wait(delay):
            return
    state.status = "mock done"


# ─── Mic mode ────────────────────────────────────────────────────────────────

def mic_loop(chunk_seconds: float, model_size: str, wav_path: Optional[str] = None):
    """
    Audio capture runs on PortAudio's own callback thread and dumps samples
    into `buffer`. This worker thread drains the buffer when it has enough
    audio, transcribes it, and posts. Capture is never blocked.
    """
    try:
        import numpy as np
        import sounddevice as sd
        from faster_whisper import WhisperModel
    except ImportError as exc:
        state.status = f"missing dep: {exc}"
        return

    chunk_frames = int(SAMPLE_RATE * chunk_seconds)

    buffer: list[np.ndarray] = []
    full_audio: list[np.ndarray] = []
    buf_lock = threading.Lock()
    buf_frames = 0

    def callback(indata, frames, time_info, status_flag):
        nonlocal buf_frames
        # NEVER block here — just copy and return.
        sample = indata[:, 0].copy()
        with buf_lock:
            buffer.append(sample)
            if wav_path is not None:
                full_audio.append(sample)
            buf_frames += frames
            state.audio_secs = buf_frames / SAMPLE_RATE
        if not capture_ready.is_set():
            capture_ready.set()

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        callback=callback,
        blocksize=0,  # let PortAudio choose
    ):
        # Audio is already flowing into `buffer` and `full_audio`. Load the
        # model now — any backlog will get drained on the first transcribe
        # pass below, keeping audio and video aligned in time.
        state.status = f"loading whisper {model_size}…"
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        state.status = "listening"

        while not stop_event.is_set():
            # Wait until we have enough audio
            with buf_lock:
                ready = buf_frames >= chunk_frames
            if not ready:
                time.sleep(0.05)
                continue

            # Drain the buffer (take everything we have, not just one chunk —
            # keeps us caught up if transcription falls behind)
            with buf_lock:
                audio = np.concatenate(buffer) if buffer else np.zeros(0, dtype="float32")
                buffer.clear()
                buf_frames = 0
                state.audio_secs = 0.0

            segments, _ = model.transcribe(
                audio, language="en", vad_filter=True, beam_size=1
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
            if not text:
                continue

            chunk = state.add_chunk(text)
            post_transcript(chunk, state.full_transcript())

    if wav_path is not None and full_audio:
        try:
            audio_all = np.concatenate(full_audio)
            pcm = (np.clip(audio_all, -1.0, 1.0) * 32767.0).astype(np.int16)
            with wave.open(wav_path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(SAMPLE_RATE)
                w.writeframes(pcm.tobytes())
        except Exception as exc:
            with state.lock:
                state.status = f"wav write err: {str(exc)[:80]}"


# ─── Webcam video ────────────────────────────────────────────────────────────

def upload_video(path: str) -> None:
    try:
        with open(path, "rb") as fh:
            files = {"file": (os.path.basename(path), fh, "video/mp4")}
            headers = {"Authorization": f"Bearer {ANON_KEY}", "apikey": ANON_KEY}
            r = requests.post(UPLOAD_VIDEO_URL, headers=headers, files=files, timeout=300)
        with state.lock:
            state.status = f"video uploaded ({r.status_code})" if r.ok else f"upload err {r.status_code}: {r.text[:80]}"
    except (requests.RequestException, OSError) as exc:
        with state.lock:
            state.status = f"upload err: {str(exc)[:80]}"


def video_loop(out_path: str, cam_index: int) -> None:
    """Open webcam, show a preview window, write frames to out_path."""
    try:
        import cv2
    except ImportError as exc:
        with state.lock:
            state.status = f"missing dep (cv2): {exc}"
        return

    cap = cv2.VideoCapture(cam_index, cv2.CAP_DSHOW)
    if not cap.isOpened():
        with state.lock:
            state.status = "webcam unavailable"
        return

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps != fps or fps <= 1:  # NaN / bogus
        fps = 20.0

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
    if not writer.isOpened():
        cap.release()
        with state.lock:
            state.status = "video writer failed"
        return

    win = "Roots — Interview (press Q to stop)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)

    # Show a preview while we wait for audio capture to be ready, so the
    # webcam is already warm when recording actually starts. Bail after
    # 30s as a safety so we don't hang forever if no audio source ever fires.
    wait_deadline = time.monotonic() + 30.0
    while (not capture_ready.is_set() and not stop_event.is_set()
           and time.monotonic() < wait_deadline):
        ok, frame = cap.read()
        if ok:
            warm = frame.copy()
            cv2.putText(warm, "warming up…", (16, 32), cv2.FONT_HERSHEY_SIMPLEX,
                        0.7, (200, 200, 200), 2, cv2.LINE_AA)
            cv2.imshow(win, warm)
        if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
            stop_event.set()
            break

    frame_period = 1.0 / fps
    next_frame_at = time.monotonic()

    try:
        while not stop_event.is_set():
            ok, frame = cap.read()
            if not ok:
                time.sleep(0.05)
                continue
            writer.write(frame)

            overlay = frame.copy()
            cv2.circle(overlay, (24, 24), 10, (0, 0, 220), -1)
            cv2.putText(overlay, "REC", (42, 32), cv2.FONT_HERSHEY_SIMPLEX,
                        0.7, (0, 0, 220), 2, cv2.LINE_AA)
            cv2.imshow(win, overlay)

            if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
                stop_event.set()
                break

            next_frame_at += frame_period
            sleep_for = next_frame_at - time.monotonic()
            if sleep_for > 0:
                time.sleep(sleep_for)
            else:
                next_frame_at = time.monotonic()
    finally:
        cap.release()
        writer.release()
        cv2.destroyAllWindows()


# ─── Audio recording + mux ───────────────────────────────────────────────────

def audio_record_loop(wav_path: str) -> None:
    """Capture the mic to a 16 kHz mono WAV until stop_event fires."""
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError as exc:
        with state.lock:
            state.status = f"missing dep (audio): {exc}"
        return

    frames: list = []
    lock = threading.Lock()

    def cb(indata, n, t, s):
        with lock:
            frames.append(indata[:, 0].copy())
        if not capture_ready.is_set():
            capture_ready.set()

    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                            dtype="float32", callback=cb, blocksize=0):
            while not stop_event.is_set():
                time.sleep(0.1)
    except Exception as exc:
        with state.lock:
            state.status = f"audio rec err: {str(exc)[:80]}"
        return

    with lock:
        if not frames:
            return
        audio = np.concatenate(frames)

    pcm = np.clip(audio, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype(np.int16)
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())


def mux_av(video_path: str, audio_path: Optional[str], out_path: str) -> bool:
    """Re-encode to H.264 + AAC MP4 via ffmpeg. audio_path may be None for silent video.

    Uses libx264 (not -c:v copy) so the output is browser-playable regardless
    of what codec OpenCV used internally (mp4v / MPEG-4 Part 2 is not supported
    by any major browser inside an MP4 container).
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    cmd = [ffmpeg, "-y", "-i", video_path]
    if audio_path:
        cmd += ["-i", audio_path]
    cmd += [
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",   # ensures broadest browser compatibility
    ]
    if audio_path:
        cmd += ["-c:a", "aac", "-shortest"]
    else:
        cmd += ["-an"]
    cmd.append(out_path)
    try:
        subprocess.run(
            cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return True
    except (subprocess.CalledProcessError, OSError):
        return False


# ─── Entry point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Roots — live recording CLI")
    parser.add_argument("--mock", action="store_true",
                        help="Stream canned transcript chunks instead of using the mic")
    parser.add_argument("--delay", type=float, default=2.5,
                        help="Seconds between mock chunks (default 2.5)")
    parser.add_argument("--chunk", type=float, default=5.0,
                        help="Min seconds of audio per transcription pass (default 5)")
    parser.add_argument("--model", default="base.en",
                        help="faster-whisper model (tiny.en, base.en, small.en, medium.en, large-v3)")
    parser.add_argument("--no-video", action="store_true",
                        help="Skip webcam recording / upload")
    parser.add_argument("--camera", type=int, default=0,
                        help="Webcam device index (default 0)")
    args = parser.parse_args()

    video_path: Optional[str] = None
    wav_path: Optional[str] = None
    video_thread: Optional[threading.Thread] = None
    audio_thread: Optional[threading.Thread] = None

    if not args.no_video:
        fd_v, video_path = tempfile.mkstemp(prefix="roots-interview-", suffix=".mp4")
        os.close(fd_v)
        fd_a, wav_path = tempfile.mkstemp(prefix="roots-interview-", suffix=".wav")
        os.close(fd_a)
        video_thread = threading.Thread(
            target=video_loop, args=(video_path, args.camera), daemon=True
        )
        video_thread.start()

    if args.mock:
        worker_target = lambda: mock_loop(args.delay)
        # mic_loop isn't running in mock mode, so capture audio for the video here
        if wav_path is not None:
            audio_thread = threading.Thread(
                target=audio_record_loop, args=(wav_path,), daemon=True
            )
            audio_thread.start()
    else:
        worker_target = lambda: mic_loop(args.chunk, args.model, wav_path)

    worker = threading.Thread(target=worker_target, daemon=True)
    poller = threading.Thread(target=questions_loop, daemon=True)
    worker.start()
    poller.start()

    try:
        with Live(render(), console=console, refresh_per_second=8, screen=True) as live:
            while not stop_event.is_set():
                live.update(render())
                time.sleep(0.15)
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()

    if video_thread is not None:
        video_thread.join(timeout=10)
    if audio_thread is not None:
        audio_thread.join(timeout=10)
    # mic_loop writes the wav on exit; give it a moment to flush
    worker.join(timeout=10)

    console.print("\n[bold green]Stopped.[/] Final transcript:\n")
    console.print(state.full_transcript() or "(nothing recorded)")

    upload_path: Optional[str] = None
    muxed_path: Optional[str] = None
    if video_path and os.path.exists(video_path) and os.path.getsize(video_path) > 0:
        fd_m, muxed_path = tempfile.mkstemp(prefix="roots-interview-final-", suffix=".mp4")
        os.close(fd_m)
        wav = (
            wav_path
            if wav_path and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0
            else None
        )
        console.print("\n[dim]Re-encoding to H.264 MP4 via ffmpeg…[/]")
        if mux_av(video_path, wav, muxed_path):
            upload_path = muxed_path
        else:
            console.print("[yellow]ffmpeg not available; uploading raw video (may not play in browser).[/]")
            upload_path = video_path

    if upload_path:
        console.print(f"[dim]Uploading ({os.path.getsize(upload_path)/1_000_000:.1f} MB)…[/]")
        upload_video(upload_path)
        console.print(f"[dim]{state.status}[/]")

    for p in (video_path, wav_path, muxed_path):
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass


if __name__ == "__main__":
    main()
