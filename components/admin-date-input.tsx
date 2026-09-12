import { useRef } from "react";
import type { InputHTMLAttributes } from "react";

import {
  adminDateInputToIso,
  formatAdminDateInputValue,
  isoDateToAdminInput,
} from "@/lib/admin-date";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "inputMode" | "maxLength" | "onChange" | "placeholder" | "type" | "value"
> & {
  id: string;
  onValueChange: (value: string) => void;
  pickerLabel: string;
  pickerMin?: string;
  value: string;
};

export function AdminDateInput({
  disabled,
  id,
  onValueChange,
  pickerLabel,
  pickerMin,
  value,
  ...props
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const picker = pickerRef.current;
    if (!picker || disabled) return;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // Fall through for browsers that expose showPicker but reject programmatic opening.
      }
    }
    picker.click();
  }

  return (
    <div className="admin-date-input">
      <input
        {...props}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        maxLength={10}
        onChange={(event) => onValueChange(formatAdminDateInputValue(event.target.value))}
        placeholder="dd/mm/yyyy"
        type="text"
        value={value}
      />
      <button
        aria-controls={id}
        aria-label={pickerLabel}
        className="button secondary admin-date-picker-button"
        disabled={disabled}
        onClick={openPicker}
        title={pickerLabel}
        type="button"
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path
            d="M7 3v3m10-3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </button>
      <input
        aria-hidden="true"
        className="admin-date-picker-native"
        disabled={disabled}
        min={pickerMin}
        onChange={(event) => onValueChange(isoDateToAdminInput(event.target.value))}
        ref={pickerRef}
        tabIndex={-1}
        type="date"
        value={adminDateInputToIso(value) ?? ""}
      />
    </div>
  );
}
