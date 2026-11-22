import type { MouseEvent } from "react";

export function openRecordFromRow(event: MouseEvent<HTMLTableRowElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !(event.target instanceof Element)
  )
    return;
  if (
    event.target.closest(
      "a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [contenteditable]",
    ) ||
    window.getSelection()?.type === "Range"
  )
    return;
  event.currentTarget.querySelector<HTMLAnchorElement>("[data-record-link]")?.click();
}
