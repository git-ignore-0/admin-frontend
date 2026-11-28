import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { PhoneInput } from "@/components/phone-input";
import { isEditablePhoneValid, type EditablePhone } from "@/lib/phone-number";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

function setup({
  locale = "en",
  value = "",
  required = false,
  disabled = false,
  untouched = false,
  error,
}: {
  locale?: "vi" | "en";
  value?: string;
  required?: boolean;
  disabled?: boolean;
  untouched?: boolean;
  error?: string;
} = {}) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  const onEnter = vi.fn();
  function Host() {
    const [state, setState] = useState<EditablePhone>({
      value,
      entry: "ready",
      ...(untouched ? { untouched: true } : {}),
    });
    const { setLocale } = useAdminI18n();
    return (
      <form
        aria-label="Phone form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (isEditablePhoneValid(state, required)) onSubmit(state.value);
        }}
      >
        <PhoneInput
          name="phone"
          autoComplete="shipping tel-national"
          state={state}
          required={required}
          disabled={disabled}
          error={error}
          onChange={(next) => {
            onChange(next);
            setState(next);
          }}
          onEnter={onEnter}
        />
        <button type="button" onClick={() => setState({ value: "", entry: "ready" })}>
          Reset
        </button>
        <button type="button" onClick={() => setLocale("vi")}>
          Vietnamese
        </button>
      </form>
    );
  }
  const view = render(
    <AdminI18nProvider initialLocale={locale}>
      <Host />
    </AdminI18nProvider>,
  );
  return {
    input: screen.getByRole<HTMLInputElement>("textbox", {
      name: locale === "vi" ? "Số điện thoại" : "Phone number",
    }),
    submit: () => fireEvent.submit(screen.getByRole("form", { name: "Phone form" })),
    onChange,
    onSubmit,
    onEnter,
    ...view,
  };
}

function paste(input: HTMLInputElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

it.each([
  ["en", "Invalid phone number", "Enter a phone number"],
  ["vi", "Số điện thoại không hợp lệ", "Nhập số điện thoại"],
] as const)("uses the approved native field and feedback in %s", (locale, invalid, missing) => {
  const { input, onSubmit, submit } = setup({ locale, required: true });
  expect(input).toHaveAttribute("type", "tel");
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveAttribute("autocomplete", "shipping tel-national");
  expect(input).toHaveAttribute("name", "phone");
  expect(input).toHaveAttribute("placeholder", "0912345678");
  expect(input).toBeRequired();
  expect(input).toHaveValue("");
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(input).not.toHaveAccessibleDescription();
  submit();
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(input).toHaveAccessibleDescription(missing);
  fireEvent.change(input, { target: { value: "0612345678" } });
  expect(input).toHaveAccessibleDescription(invalid);
  fireEvent.change(input, { target: { value: "0912345678" } });
  expect(input).not.toBeInvalid();
  submit();
  expect(onSubmit).toHaveBeenCalledWith("0912345678");
});

it("sanitizes actual input, preserves the caret, rejects overflow, and allows deletion and clear", () => {
  const { input, onChange, submit, onSubmit } = setup();
  fireEvent.change(input, { target: { value: "0" } });
  expect(input).toHaveValue("0");
  fireEvent.input(input, {
    target: { value: "0912abc345678", selectionStart: 7, selectionEnd: 7 },
    data: "abc",
  });
  expect(input).toHaveValue("0912345678");
  expect(input.selectionStart).toBe(4);
  expect(onChange).toHaveBeenLastCalledWith({ value: "0912345678", entry: "ready" });
  fireEvent.input(input, {
    target: { value: "09129345678", selectionStart: 5, selectionEnd: 5 },
    data: "9",
    inputType: "insertText",
  });
  expect(input).toHaveValue("0912345678");
  expect(input.selectionStart).toBe(4);
  expect(input).toBeInvalid();
  submit();
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.input(input, {
    target: { value: "091234567", selectionStart: 9, selectionEnd: 9 },
    inputType: "deleteContentBackward",
  });
  expect(input).toHaveValue("091234567");
  expect(input).toBeInvalid();
  fireEvent.input(input, { target: { value: "" }, inputType: "deleteContentForward" });
  expect(input).toHaveValue("");
  expect(input).not.toBeInvalid();
  submit();
  expect(onSubmit).toHaveBeenCalledWith("");
});

it.each(["0912 345 678", "0912-345-678", "(0912) 345 678", "abc0912345678", "0912345678\n"])(
  "pastes formatted domestic digits %j without native truncation",
  (text) => {
    const { input, onChange } = setup();
    paste(input, text);
    expect(input).toHaveValue("0912345678");
    expect(input.selectionStart).toBe(10);
    expect(onChange).toHaveBeenLastCalledWith({ value: "0912345678", entry: "ready" });
  },
);

it("applies paste at the current selection and preserves valid-looking digits only as a blocked draft on unsafe replacement", () => {
  const { input, onChange, submit, onSubmit } = setup({ value: "0912345678", required: true });
  input.setSelectionRange(4, 6);
  paste(input, " 9-8 ");
  expect(input).toHaveValue("0912985678");
  expect(input.selectionStart).toBe(6);
  input.setSelectionRange(4, 4);
  paste(input, "0");
  expect(input).toHaveValue("0912985678");
  expect(input.selectionStart).toBe(4);
  for (const invalid of ["+84912985678", "84912985678", "letters only", "１２٣"]) {
    input.select();
    paste(input, invalid);
    expect(input).toHaveValue("0912985678");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(10);
    expect(onChange).toHaveBeenLastCalledWith({ value: "0912985678", entry: "rejected" });
    expect(input).toHaveAccessibleDescription("Invalid phone number");
    submit();
  }
  expect(onSubmit).not.toHaveBeenCalled();
  paste(input, "0912985678");
  expect(input).not.toBeInvalid();
  submit();
  expect(onSubmit).toHaveBeenCalledWith("0912985678");
});

it("blocks submission and Enter during composition and commits the sanitized replacement", () => {
  const { input, onChange, onEnter, submit, onSubmit } = setup({
    value: "0912345678",
    required: true,
  });
  input.setSelectionRange(2, 5);
  fireEvent.compositionStart(input);
  expect(onChange).toHaveBeenLastCalledWith({ value: "0912345678", entry: "composing" });
  fireEvent.input(input, {
    target: { value: "09Tiế 09845678" },
    data: "Tiế 098",
    isComposing: true,
  });
  expect(input).toHaveValue("0912345678");
  expect(fireEvent.keyDown(input, { key: "Enter", code: "Enter", isComposing: true })).toBe(false);
  expect(onEnter).not.toHaveBeenCalled();
  submit();
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: "Tiếng 098" });
  expect(input).toHaveValue("0909845678");
  expect(onChange).toHaveBeenLastCalledWith({ value: "0909845678", entry: "ready" });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  expect(onEnter).toHaveBeenCalledOnce();
});

it("rejects an overlong autofill-like replacement and maintains the blocking state when the language changes", () => {
  const { input, onChange, submit, onSubmit } = setup({ value: "0912345678" });
  fireEvent.change(input, { target: { value: "+84 912-345-678" } });
  expect(input).toHaveValue("0912345678");
  expect(onChange).toHaveBeenLastCalledWith({ value: "0912345678", entry: "rejected" });
  fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
  expect(input).toHaveAccessibleDescription("Số điện thoại không hợp lệ");
  submit();
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(input).toHaveValue("");
  expect(input).not.toBeInvalid();
});

it("preserves legacy input until an edit and uses native association for domain errors", () => {
  const { input, onChange, unmount } = setup({ value: "02412345678", untouched: true });
  expect(input).toHaveValue("02412345678");
  expect(input).not.toBeInvalid();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.compositionStart(input);
  fireEvent.compositionEnd(input, { data: "" });
  expect(onChange).toHaveBeenLastCalledWith({
    value: "02412345678",
    entry: "ready",
    untouched: true,
  });
  expect(input).not.toBeInvalid();
  input.select();
  paste(input, "0612345678");
  expect(input).toHaveAccessibleDescription("Invalid phone number");
  unmount();
  const disabled = setup({ value: "0912345678", disabled: true, error: "Phone already exists." });
  expect(disabled.input).toBeDisabled();
  expect(disabled.input).toHaveAccessibleDescription("Phone already exists.");
});

it("sanitizes a dropped replacement and accepts DOM changes from native edit history", () => {
  const { input, onChange } = setup({ value: "0912345678" });
  fireEvent.input(input, {
    target: { value: "082-345-6789" },
    inputType: "insertFromDrop",
    data: "082-345-6789",
  });
  expect(input).toHaveValue("0823456789");
  expect(fireEvent.keyDown(input, { key: "z", ctrlKey: true })).toBe(true);
  fireEvent.input(input, { target: { value: "0912345678" }, inputType: "historyUndo" });
  expect(onChange).toHaveBeenLastCalledWith({ value: "0912345678", entry: "ready" });
  expect(fireEvent.keyDown(input, { key: "z", metaKey: true, shiftKey: true })).toBe(true);
  fireEvent.input(input, { target: { value: "0823456789" }, inputType: "historyRedo" });
  expect(onChange).toHaveBeenLastCalledWith({ value: "0823456789", entry: "ready" });
});
