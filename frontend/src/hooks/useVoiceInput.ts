import { useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputResult {
  supported: boolean;
  recording: boolean;
  toggle: () => void;
}

interface Options {
  onTranscript: (text: string, startOffset: number) => void;
  getCurrentLength: () => number;
  onError?: (error: string) => void;
}

export function useVoiceInput({
  onTranscript,
  getCurrentLength,
  onError,
}: Options): UseVoiceInputResult {
  const Ctor = getSpeechRecognition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startOffsetRef = useRef(0);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "zh-TW";
    recognition.onstart = () => {
      startOffsetRef.current = getCurrentLength();
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onTranscript(transcript, startOffsetRef.current);
    };
    recognition.onend = () => {
      setRecording(false);
    };
    recognition.onerror = (e) => {
      setRecording(false);
      if (e.error !== "no-speech" && onError) onError(e.error);
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const r = recognitionRef.current;
    if (!r) return;
    if (recording) {
      r.stop();
      setRecording(false);
    } else {
      r.start();
      setRecording(true);
    }
  }

  return { supported: !!Ctor, recording, toggle };
}
