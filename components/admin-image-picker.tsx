"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type ImagePickerItem = {
  id: string;
  src: string;
  alt: string;
};

type Labels = {
  choose: string;
  replace: string;
  empty: string;
  cover?: string;
  setCover?: string;
  moveEarlier?: string;
  moveLater?: string;
  remove: string;
  uploading?: string;
  select?: string;
};

type Props = {
  items: ImagePickerItem[];
  maxItems: number;
  labels: Labels;
  help?: string;
  fileName?: string;
  error?: string;
  busy?: boolean;
  onChooseFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onSetCover?: (index: number) => void;
};

function PickerIcon({ kind }: { kind: "plus" | "left" | "right" | "trash" }) {
  const path = {
    plus: <path d="M12 5v14M5 12h14" />,
    left: <path d="m14 6-6 6 6 6M9 12h11" />,
    right: <path d="m10 6 6 6-6 6M15 12H4" />,
    trash: <path d="M4 7h16M10 3h4m-8 4 .7 13h10.6L18 7M10 11v5m4-5v5" />,
  }[kind];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

export function AdminImagePicker({
  items,
  maxItems,
  labels,
  help,
  fileName,
  error,
  busy = false,
  onChooseFiles,
  onRemove,
  onMove,
  onSetCover,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gallery = maxItems > 1;
  const selectedIndex = gallery
    ? items.findIndex((item) => item.id === selectedId)
    : items.length > 0
      ? 0
      : -1;
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  useEffect(() => {
    if (!gallery || !selectedId) return;

    function closeOnOutside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setSelectedId(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("focusin", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("focusin", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [gallery, selectedId]);

  function choose() {
    inputRef.current?.click();
  }

  return (
    <div
      ref={rootRef}
      className={`admin-image-picker ${gallery ? "admin-image-picker-gallery" : "admin-image-picker-single"}`}
    >
      <input
        ref={inputRef}
        aria-label={labels.choose}
        className="admin-image-picker-input"
        type="file"
        tabIndex={-1}
        accept="image/jpeg,image/png,image/webp"
        multiple={gallery}
        disabled={busy || (gallery && items.length >= maxItems)}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) onChooseFiles(files);
        }}
      />
      <div
        className="admin-image-picker-strip"
        role="group"
        aria-label={labels.select || labels.choose}
      >
        {items.map((item, index) => {
          const contents = (
            <>
              <Image src={item.src} alt={item.alt} width={80} height={80} unoptimized />
              {gallery && index === 0 && labels.cover && (
                <span className="admin-image-picker-cover" aria-label={labels.cover}>
                  ★
                </span>
              )}
            </>
          );
          return gallery ? (
            <button
              key={item.id}
              type="button"
              className="admin-image-picker-tile"
              aria-label={`${labels.select || labels.choose} ${index + 1}`}
              aria-pressed={selectedId === item.id}
              disabled={busy}
              onClick={() => setSelectedId((current) => (current === item.id ? null : item.id))}
            >
              {contents}
            </button>
          ) : (
            <div key={item.id} className="admin-image-picker-tile">
              {contents}
            </div>
          );
        })}
        {items.length < maxItems && (
          <button
            className="admin-image-picker-add"
            type="button"
            disabled={busy}
            onClick={choose}
            aria-label={`${labels.choose}…`}
          >
            <PickerIcon kind="plus" />
            {items.length === 0 && <small>{labels.choose}</small>}
          </button>
        )}
      </div>
      {items.length === 0 && <span className="admin-image-picker-note">{labels.empty}</span>}
      {fileName && <span className="admin-image-picker-note">{fileName}</span>}
      {help && <p className="admin-image-picker-help">{help}</p>}
      {busy && labels.uploading && (
        <p className="admin-image-picker-help" role="status">
          {labels.uploading}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <div className="admin-image-picker-actions">
          {gallery && (
            <span className="admin-image-picker-position">
              {selectedIndex + 1}/{items.length}
            </span>
          )}
          {gallery && onMove && (
            <>
              <button
                className="admin-image-picker-action"
                type="button"
                disabled={busy || selectedIndex === 0}
                aria-label={`${labels.moveEarlier} ${selectedIndex + 1}`}
                title={labels.moveEarlier}
                onClick={() => onMove(selectedIndex, -1)}
              >
                <PickerIcon kind="left" />
              </button>
              <button
                className="admin-image-picker-action"
                type="button"
                disabled={busy || selectedIndex === items.length - 1}
                aria-label={`${labels.moveLater} ${selectedIndex + 1}`}
                title={labels.moveLater}
                onClick={() => onMove(selectedIndex, 1)}
              >
                <PickerIcon kind="right" />
              </button>
            </>
          )}
          {gallery && onSetCover && selectedIndex > 0 && (
            <button
              className="admin-image-picker-action admin-image-picker-text-action"
              type="button"
              disabled={busy}
              title={labels.setCover}
              onClick={() => onSetCover(selectedIndex)}
            >
              {labels.setCover}
            </button>
          )}
          {!gallery && (
            <button
              className="admin-image-picker-action admin-image-picker-text-action"
              type="button"
              disabled={busy}
              onClick={choose}
            >
              {labels.replace}
            </button>
          )}
          <button
            className="admin-image-picker-action admin-image-picker-remove"
            type="button"
            disabled={busy}
            aria-label={labels.remove}
            title={labels.remove}
            onClick={() => {
              onRemove(selected.id);
              setSelectedId(null);
            }}
          >
            <PickerIcon kind="trash" />
          </button>
        </div>
      )}
    </div>
  );
}
