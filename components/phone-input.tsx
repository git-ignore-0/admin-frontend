"use client";

import { TextInput } from "@mantine/core";
import { useRef, useState, type Ref } from "react";

import { useOptionalAdminI18n } from "@/components/admin-i18n-provider";
import { adminDictionaries } from "@/lib/admin-i18n";
import {
  isEditablePhoneValid,
  MAX_EDITABLE_PHONE_DIGITS,
  sanitizeEditablePhoneDigits,
  type EditablePhone,
} from "@/lib/phone-number";

type Selection = { start: number; end: number };

function selection(input: HTMLInputElement): Selection {
  return {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length,
  };
}

function setDisplay(input: HTMLInputElement, value: string, { start, end }: Selection) {
  if (input.value !== value) input.value = value;
  input.setSelectionRange(start, end);
}

export function PhoneInput({
  state,
  onChange,
  required,
  disabled,
  name,
  autoComplete = "tel-national",
  error,
  onEnter,
  ref,
  id,
}: {
  state: EditablePhone;
  onChange: (next: EditablePhone) => void;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  autoComplete?: string;
  error?: string;
  onEnter?: () => void;
  ref?: Ref<HTMLInputElement>;
  id?: string;
}) {
  const copy = useOptionalAdminI18n()?.t.phoneInput ?? adminDictionaries.en.phoneInput;
  const [showRequired, setShowRequired] = useState(false);
  const composition = useRef<{ selection: Selection; previous: EditablePhone } | null>(null);
  const formatInvalid =
    state.entry === "rejected" ||
    (state.entry === "ready" && !state.untouched && !!state.value && !isEditablePhoneValid(state));
  const feedback = formatInvalid
    ? copy.invalid
    : (error ?? (required && showRequired && !state.value ? copy.required : undefined));

  function emit(value: string, entry: EditablePhone["entry"]) {
    if (value !== state.value || entry !== state.entry) onChange({ value, entry });
  }

  function applyReplacement(input: HTMLInputElement, text: string, range: Selection) {
    const digits = sanitizeEditablePhoneDigits(text);
    const prefix = sanitizeEditablePhoneDigits(state.value.slice(0, range.start));
    const suffix = sanitizeEditablePhoneDigits(state.value.slice(range.end));
    const candidate = prefix + digits + suffix;
    if (!digits || candidate.length > MAX_EDITABLE_PHONE_DIGITS) {
      setDisplay(input, state.value, range);
      emit(state.value, "rejected");
      return;
    }
    const caret = prefix.length + digits.length;
    setDisplay(input, candidate, { start: caret, end: caret });
    setShowRequired(false);
    emit(candidate, "ready");
  }

  return (
    <TextInput
      id={id}
      ref={ref}
      name={name}
      label={copy.label}
      placeholder={copy.placeholder}
      required={required}
      disabled={disabled}
      type="tel"
      inputMode="numeric"
      autoComplete={autoComplete}
      miw={0}
      value={state.value}
      error={feedback}
      onBlur={() => {
        if (state.entry === "composing") {
          composition.current = null;
          emit(state.value, "rejected");
        }
        setShowRequired(!state.value);
      }}
      onChange={(event) => {
        const input = event.currentTarget;
        if (state.entry === "composing" && composition.current) {
          setDisplay(input, state.value, composition.current.selection);
          return;
        }
        const raw = input.value;
        const candidate = sanitizeEditablePhoneDigits(raw);
        const { start, end } = selection(input);
        const inserted = event.nativeEvent instanceof InputEvent ? event.nativeEvent.data : null;
        if (candidate.length > MAX_EDITABLE_PHONE_DIGITS || (raw && !candidate)) {
          const caret = Math.max(0, start - (inserted?.length ?? 0));
          setDisplay(input, state.value, { start: caret, end: caret });
          emit(state.value, "rejected");
          return;
        }
        if (raw !== candidate) {
          setDisplay(input, candidate, {
            start: sanitizeEditablePhoneDigits(raw.slice(0, start)).length,
            end: sanitizeEditablePhoneDigits(raw.slice(0, end)).length,
          });
        }
        // Ignoring a stray character is not an explicit replacement of a rejected number.
        if (
          state.entry === "rejected" &&
          raw !== candidate &&
          candidate === state.value &&
          (!inserted || !sanitizeEditablePhoneDigits(inserted))
        )
          return;
        if (candidate) setShowRequired(false);
        emit(candidate, "ready");
      }}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        if (text && state.entry !== "composing")
          applyReplacement(event.currentTarget, text, selection(event.currentTarget));
      }}
      onCompositionStart={(event) => {
        if (state.entry === "composing") return;
        composition.current = { selection: selection(event.currentTarget), previous: state };
        onChange({ ...state, entry: "composing" });
      }}
      onCompositionEnd={(event) => {
        const edit = composition.current;
        composition.current = null;
        if (!edit || state.entry !== "composing") return;
        if (event.data) applyReplacement(event.currentTarget, event.data, edit.selection);
        else {
          setDisplay(event.currentTarget, state.value, edit.selection);
          onChange(edit.previous);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        if (event.nativeEvent.isComposing || event.keyCode === 229 || state.entry === "composing") {
          event.preventDefault();
          return;
        }
        if (onEnter) {
          event.preventDefault();
          if (isEditablePhoneValid(state, required)) onEnter();
          else setShowRequired(!state.value);
        }
      }}
    />
  );
}
