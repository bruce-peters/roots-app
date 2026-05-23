#!/usr/bin/env python3
"""
Roots — mock recording device
Listens via microphone, transcribes speech in real-time (Google STT),
and POSTs the growing transcript to the process-transcript Edge Function.

Usage:
  python recorder.py            # real mic recording
  python recorder.py --mock     # send canned transcript chunks (no mic needed)

Dependencies:
  pip install SpeechRecognition pyaudio requests
  (Windows: pip install pipwin && pipwin install pyaudio  — if pyaudio wheels fail)
"""

import argparse
import time
import threading
import requests

SUPABASE_URL = "https://hmggakolwdysrcitibry.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtZ2dha29sd2R5c3JjaXRpYnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTYwMDYsImV4cCI6MjA5NTEzMjAwNn0"
    ".ipgkpOau3GgBm2zq0YzCVEJMURaTrdpC6N6VZWZvw40"
)
ENDPOINT = f"{SUPABASE_URL}/functions/v1/process-transcript"

HEADERS = {
    "Authorization": f"Bearer {ANON_KEY}",
    "apikey": ANON_KEY,
    "Content-Type": "application/json",
}

# Canned transcript for --mock mode (Rose Bellini "Coming to America" story)
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
    "I have never forgotten that smell. Even now, fresh bread makes me homesick for a place I left when I was seven.",
]


# ─── HTTP helper ─────────────────────────────────────────────────────────────

def post_transcript(text: str) -> None:
    """POST the current full transcript to process-transcript and print the result."""
    try:
        resp = requests.post(ENDPOINT, json={"transcript": text}, headers=HEADERS, timeout=10)
        data = resp.json()
        status = "\033[32mOK\033[0m" if resp.ok else "\033[31mERR\033[0m"
        print(f"  [{status}] {resp.status_code} — {data}")
    except requests.RequestException as exc:
        print(f"  [\033[31mFAIL\033[0m] {exc}")


# ─── Mock mode ────────────────────────────────────────────────────────────────

def run_mock(delay: float = 3.0) -> None:
    print("\033[33m[MOCK MODE]\033[0m Sending canned transcript chunks every "
          f"{delay}s  (Ctrl+C to stop)\n")
    full = ""
    for i, chunk in enumerate(MOCK_CHUNKS, 1):
        full = (full + " " + chunk).strip()
        print(f"\033[36m[{i}/{len(MOCK_CHUNKS)}]\033[0m {chunk}")
        post_transcript(full)
        if i < len(MOCK_CHUNKS):
            time.sleep(delay)
    print("\n\033[32mDone — all mock chunks sent.\033[0m")


# ─── Real microphone mode ─────────────────────────────────────────────────────

def run_mic(phrase_limit: float = 8.0) -> None:
    try:
        import speech_recognition as sr
    except ImportError:
        print("SpeechRecognition not installed.  Run:  pip install SpeechRecognition pyaudio")
        return

    recognizer = sr.Recognizer()
    mic = sr.Microphone()

    print("\033[33m[MIC MODE]\033[0m Calibrating for ambient noise …")
    with mic as source:
        recognizer.adjust_for_ambient_noise(source, duration=1.5)

    print("Ready — speak now.  Each pause sends a chunk to the server.  Ctrl+C to stop.\n")

    full_transcript = ""

    def listen_loop():
        nonlocal full_transcript
        with mic as source:
            while True:
                try:
                    audio = recognizer.listen(source, phrase_time_limit=phrase_limit)
                except KeyboardInterrupt:
                    return

                # Run recognition + POST off the main thread so we can keep listening
                threading.Thread(
                    target=process_audio,
                    args=(audio, recognizer),
                    daemon=True,
                ).start()

    def process_audio(audio, rec):
        nonlocal full_transcript
        try:
            chunk = rec.recognize_google(audio)
        except sr.UnknownValueError:
            return  # silence / unintelligible
        except sr.RequestError as exc:
            print(f"  [\033[31mSTT ERROR\033[0m] {exc}")
            return

        full_transcript = (full_transcript + " " + chunk).strip()
        print(f"\033[36m[HEARD]\033[0m {chunk}")
        post_transcript(full_transcript)

    try:
        listen_loop()
    except KeyboardInterrupt:
        pass

    print(f"\n\033[32mStopped.\033[0m Final transcript ({len(full_transcript)} chars):\n")
    print(full_transcript or "(nothing recorded)")


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Roots mock recording device — streams transcript to Supabase"
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Send canned transcript chunks instead of using the microphone",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=3.0,
        metavar="SECONDS",
        help="Seconds between chunks in mock mode (default 3)",
    )
    parser.add_argument(
        "--phrase-limit",
        type=float,
        default=8.0,
        metavar="SECONDS",
        help="Max seconds per microphone phrase (default 8)",
    )
    args = parser.parse_args()

    print("\033[1mRoots — mock recording device\033[0m")
    print(f"Endpoint: {ENDPOINT}\n")

    if args.mock:
        run_mock(delay=args.delay)
    else:
        run_mic(phrase_limit=args.phrase_limit)


if __name__ == "__main__":
    main()
