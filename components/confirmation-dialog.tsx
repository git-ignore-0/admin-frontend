"use client";

import { ReactNode, RefObject, useEffect, useId, useRef } from "react";

type Props = {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  danger?: boolean;
  confirmDisabled?: boolean;
  alternateLabel?: string;
  onAlternate?: () => void;
  error?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

const focusableSelector =
  "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]";

export function ConfirmationDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy,
  danger = false,
  confirmDisabled = false,
  alternateLabel,
  onAlternate,
  error,
  fallbackFocusRef,
  returnFocusRef,
  onCancel,
  onConfirm,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const fallbackFocus = fallbackFocusRef?.current;
    const returnFocus = returnFocusRef?.current;
    const dialog = dialogRef.current;
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusables()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busyRef.current) cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (returnFocus?.isConnected) returnFocus.focus();
      else if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else fallbackFocus?.focus();
    };
  }, [fallbackFocusRef, returnFocusRef]);

  return (
    <div
      className="confirmation-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      role="presentation"
    >
      <section
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirmation-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="confirmation-actions">
          <button className="button secondary" disabled={busy} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          {alternateLabel && onAlternate ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={onAlternate}
              type="button"
            >
              {alternateLabel}
            </button>
          ) : null}
          <button
            className={`button ${danger ? "danger" : ""}`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            type="button"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
