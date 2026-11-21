import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { AdminDateInput } from "@/components/admin-date-input";
import { FormField } from "@/components/nfv-controls";

afterEach(cleanup);
function DateField({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("29/11/2099");
  return (
    <>
      <label htmlFor="date-field">Start date</label>
      <AdminDateInput
        id="date-field"
        pickerLabel="Choose start date"
        pickerMin="2099-11-28"
        value={value}
        onValueChange={setValue}
        disabled={disabled}
      />
      <output>{value}</output>
    </>
  );
}
it("preserves invalid and partial date drafts while providing an official calendar", () => {
  render(<DateField />);
  const input = screen.getByLabelText("Start date");
  fireEvent.change(input, { target: { value: "30112099" } });
  expect(input).toHaveValue("30/11/2099");
  fireEvent.change(input, { target: { value: "31022099" } });
  expect(input).toHaveValue("31/02/2099");
  fireEvent.blur(input);
  expect(input).toHaveValue("31/02/2099");
  fireEvent.change(input, { target: { value: "2" } });
  expect(input).toHaveValue("2");
  fireEvent.change(input, { target: { value: "29112099" } });
  fireEvent.click(screen.getByRole("button", { name: "Choose start date" }));
  expect(screen.getByRole("button", { name: "30 November 2099" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "27 November 2099" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "30 November 2099" }));
  expect(input).toHaveValue("30/11/2099");
});
it("does not open or mutate a disabled date field", () => {
  const changed = vi.fn();
  render(
    <AdminDateInput
      id="date-field"
      pickerLabel="Choose start date"
      value="29/11/2099"
      onValueChange={changed}
      disabled
    />,
  );
  expect(screen.getByRole("button", { name: "Choose start date" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Choose start date" }));
  expect(screen.queryByRole("button", { name: "30 November 2099" })).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it("leaves the calendar closed after the field is disabled and enabled again", () => {
  const view = render(<DateField />);
  fireEvent.click(screen.getByRole("button", { name: "Choose start date" }));
  expect(screen.getByRole("button", { name: "30 November 2099" })).toBeVisible();
  view.rerender(<DateField disabled />);
  expect(screen.queryByRole("button", { name: "30 November 2099" })).toBeNull();
  view.rerender(<DateField />);
  expect(screen.queryByRole("button", { name: "30 November 2099" })).toBeNull();
});

it("associates FormField feedback with a specialized control's explicit ID", () => {
  render(
    <FormField label="Start date" error="Choose a valid date" hint="Day/month/year">
      <AdminDateInput
        id="start-date"
        pickerLabel="Choose start date"
        value="31/02/2099"
        onValueChange={vi.fn()}
      />
    </FormField>,
  );
  const input = screen.getByRole("textbox", { name: "Start date" });
  expect(input).toHaveAttribute("id", "start-date");
  expect(input).toBeInvalid();
  expect(input).toHaveAccessibleDescription("Choose a valid date Day/month/year");
});

it("keeps the consuming workflow's validation message associated with its date input", () => {
  render(
    <>
      <AdminDateInput
        id="date-field"
        pickerLabel="Choose start date"
        value="31/02/2099"
        onValueChange={() => {}}
        aria-invalid
        aria-describedby="date-error"
      />
      <p id="date-error">Choose a valid calendar date</p>
    </>,
  );
  expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Choose a valid calendar date");
});
