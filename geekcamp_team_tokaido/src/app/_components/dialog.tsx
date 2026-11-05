"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, titleId, children, className = "" }: {
  open: boolean; onClose: () => void; titleId: string; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
      origin?.focus({ preventScroll: true });
    };
  }, [open]);
  return <dialog ref={ref} className={`sheet ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    } }}>
    {open && children}
  </dialog>;
}

export function Intro() {
  const ref = useRef<HTMLDialogElement>(null);
  const playedHere = useRef(false);
  useEffect(() => {
    if (!playedHere.current) {
      try { if (sessionStorage.getItem("kokomeshi-intro")) return; } catch { /* Optional storage. */ }
    }
    playedHere.current = true;
    const dialog = ref.current;
    dialog?.showModal();
    try { sessionStorage.setItem("kokomeshi-intro", "seen"); } catch { /* Still allow skipping. */ }
    const timer = setTimeout(() => dialog?.close(), 1350);
    return () => { clearTimeout(timer); dialog?.close(); };
  }, []);
  return <dialog ref={ref} className="intro" aria-label="ここメシへようこそ"
    onKeyDown={(event) => { if (["Enter", " ", "Escape"].includes(event.key)) { event.preventDefault(); ref.current?.close(); } }}>
    <button className="intro-skip" onClick={() => ref.current?.close()} aria-label="導入をスキップしてホームへ">
      <svg className="intro-pin" viewBox="0 0 80 100" fill="none" aria-hidden="true">
        <path d="M40 96S7 58 7 36a33 33 0 1 1 66 0c0 22-33 60-33 60Z" fill="currentColor" />
        <path d="M21 36h38c-2 15-10 21-19 21S23 51 21 36ZM25 33c0-8 7-13 15-13s15 5 15 13Z" fill="#fff8e9" />
      </svg>
      <span className="intro-name">ここメシ</span><span className="intro-hint">タップ・Enterでスキップ</span>
    </button>
  </dialog>;
}
