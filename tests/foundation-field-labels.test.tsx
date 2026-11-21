import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FormField, FormInput, FormTextarea, FormSelect } from "@/components/nfv-controls";
afterEach(cleanup);
it("preserves label association and inline errors for a consumer-supplied input id", () => {
  render(
    <FormField label="Login phone" error="Already used">
      <FormInput id="login-phone" />
    </FormField>,
  );
  const input = screen.getByRole("textbox", { name: "Login phone" });
  expect(input).toHaveAttribute("id", "login-phone");
  expect(input).toHaveAccessibleDescription("Already used");
});
it("labels textarea and Select with explicit ids while retaining named form serialization", () => {
  const { container } = render(
    <form>
      <FormField label="Note">
        <FormTextarea id="note-id" name="note" defaultValue="Keep" />
      </FormField>
      <FormField label="Choice">
        <FormSelect
          id="choice-id"
          name="choice"
          defaultValue="a"
          data={[{ value: "a", label: "First" }]}
        />
      </FormField>
    </form>,
  );
  expect(screen.getByRole("textbox", { name: "Note" })).toHaveAttribute("id", "note-id");
  expect(screen.getByRole("combobox", { name: "Choice" })).toHaveValue("First");
  expect(Object.fromEntries(new FormData(container.querySelector("form")!))).toEqual({
    note: "Keep",
    choice: "a",
  });
});
it("retains semantic labeling for a native form control passed through the compatibility field", () => {
  render(
    <FormField label="Legacy reference">
      <input name="reference" />
    </FormField>,
  );
  expect(screen.getByRole("textbox", { name: "Legacy reference" })).toHaveAttribute(
    "name",
    "reference",
  );
});
