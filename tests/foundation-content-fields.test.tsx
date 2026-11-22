import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import {
  BilingualContentFields,
  emptyBilingualContent,
} from "@/components/bilingual-content-fields";

afterEach(cleanup);
function Fields({ busy = false }: { busy?: boolean }) {
  const [value, setValue] = useState(emptyBilingualContent);
  return (
    <BilingualContentFields
      busy={busy}
      completionLabels={{ complete: "Complete", incomplete: "Incomplete" }}
      defaultLocale="vi"
      descriptionLabel="Description"
      languageLabels={{ vi: "Tiếng Việt", en: "English" }}
      nameLabel="Name"
      onChange={setValue}
      title="Bilingual content"
      value={value}
      renderAfterName={(locale) => <span>After name {locale}</span>}
      renderAfterDescription={(locale) => <span>After description {locale}</span>}
    />
  );
}
it("supports Home and End keyboard navigation while retaining each locale draft and slot", () => {
  render(<Fields />);
  fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Vườn" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Mô tả" } });
  const vietnamese = screen.getByRole("tab", { name: /Tiếng Việt/ });
  vietnamese.focus();
  fireEvent.keyDown(vietnamese, { key: "End" });
  const english = screen.getByRole("tab", { name: /English/ });
  expect(english).toHaveFocus();
  fireEvent.click(english);
  expect(english).toHaveAttribute("aria-selected", "true");
  const panel = screen.getByRole("tabpanel");
  expect(within(panel).getByText("After name en")).toBeVisible();
  expect(within(panel).getByText("After description en")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Garden" } });
  fireEvent.keyDown(english, { key: "Home" });
  expect(vietnamese).toHaveFocus();
  fireEvent.click(vietnamese);
  expect(vietnamese).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Name *")).toHaveValue("Vườn");
  expect(screen.getByLabelText("Description")).toHaveValue("Mô tả");
  expect(screen.getByLabelText("Name *")).toBeRequired();
  expect(screen.getByLabelText("Name *")).toHaveAttribute("maxlength", "200");
});
it("locks locale switching and field changes during a save", () => {
  render(<Fields busy />);
  for (const tab of screen.getAllByRole("tab")) expect(tab).toBeDisabled();
  expect(screen.getByLabelText("Name *")).toBeDisabled();
  expect(screen.getByLabelText("Description")).toBeDisabled();
});
