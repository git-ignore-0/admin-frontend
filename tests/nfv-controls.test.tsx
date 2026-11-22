import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  FormCheckbox,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  Status,
  Tabs,
} from "@/components/nfv-controls";

afterEach(cleanup);
function renderControl(children: React.ReactNode) {
  return render(
    <MantineProvider env="test" forceColorScheme="light">
      {children}
    </MantineProvider>,
  );
}

describe("Mantine control compatibility", () => {
  it.each([
    ["user", "active", "green"],
    ["membership", "frozen", "orange"],
    ["user", "suspended", "red"],
    ["user", "pending_activation", "orange"],
    ["csa-purchase", "payment_confirmed", "yellow"],
    ["installment", "reported", "yellow"],
    ["csa-customer", "scheduled", "blue"],
    ["membership", "unknown-status", "gray"],
    ["membership", "constructor", "gray"],
  ] as const)("represents %s %s with its semantic tone", (domain, status, color) => {
    renderControl(<Status domain={domain} status={status} label={status} />);
    expect(screen.getByText(status).closest(".mantine-Badge-root")).toHaveStyle({
      "--badge-color": `var(--mantine-color-${color}-light-color)`,
    });
  });
  it("preserves named value and FormData while selecting by the visible label", () => {
    function Form() {
      const [value, setValue] = useState("store");
      return (
        <form aria-label="Filter">
          <FormField label="Scope">
            <FormSelect
              name="scope"
              value={value}
              onChange={(next) => setValue(next ?? "")}
              data={[
                { value: "store", label: "Store" },
                { value: "both", label: "Both channels" },
              ]}
            />
          </FormField>
        </form>
      );
    }
    renderControl(<Form />);
    const select = screen.getByRole("combobox", { name: "Scope" });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "Both channels" }));
    expect(select).toHaveValue("Both channels");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("scope")).toBe("both");
  });
  it("associates validation with the actual password input without trimming its value", () => {
    renderControl(
      <form aria-label="Account">
        <FormField label="New password" error="Invalid password">
          <FormInput name="password1" type="password" defaultValue="  secret  " required />
        </FormField>
      </form>,
    );
    const input = screen.getByLabelText("New password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAccessibleDescription("Invalid password");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("password1")).toBe(
      "  secret  ",
    );
  });
  it("keeps explicit Select feedback and merges existing descriptions outside FormField", () => {
    renderControl(
      <>
        <p id="scope-note">Extra note</p>
        <FormSelect
          id="scope"
          label="Scope"
          defaultValue="store"
          data={["store"]}
          error="Invalid scope"
          description="Choose a sales channel"
          aria-describedby="scope-note"
          disabled
        />
      </>,
    );
    const select = screen.getByRole("combobox", { name: "Scope" });
    expect(select).toHaveAttribute("id", "scope");
    expect(select).toHaveAccessibleDescription("Extra note Invalid scope Choose a sales channel");
    expect(select).toHaveValue("store");
    expect(select).toBeDisabled();
  });
  it("uses explicit child feedback over FormField values without duplicating labels", () => {
    renderControl(
      <FormField label="Fallback scope" error="Fallback error" hint="Fallback description">
        <FormSelect
          label="Scope"
          data={["store"]}
          error="Invalid scope"
          description="Choose a sales channel"
        />
      </FormField>,
    );
    expect(screen.queryByText("Fallback scope")).toBeNull();
    expect(screen.queryByText("Fallback error")).toBeNull();
    expect(screen.queryByText("Fallback description")).toBeNull();
    expect(screen.getAllByText("Invalid scope")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Scope" })).toHaveAccessibleDescription(
      "Invalid scope Choose a sales channel",
    );
  });
  it("renders and associates field feedback for a native control with an existing description", () => {
    renderControl(
      <form aria-label="Profile">
        <FormField label="Name" error="Required name" hint="Your full name">
          <p id="name-note">Visible to members</p>
          <input
            id="profile-name"
            name="name"
            required
            defaultValue="Anh"
            aria-describedby="name-note"
          />
        </FormField>
      </form>,
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toHaveAttribute("id", "profile-name");
    expect(input).toBeRequired();
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Visible to members Required name Your full name");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("name")).toBe("Anh");
  });
  it("associates a generated ID and inherited feedback for a nested textarea", () => {
    renderControl(
      <FormField label="Notes" error="Too long" hint="Plain text">
        <div>
          <FormTextarea name="notes" defaultValue="Seed notes" />
        </div>
      </FormField>,
    );
    const field = screen.getByRole("textbox", { name: "Notes" });
    expect(field).toHaveAccessibleDescription("Too long Plain text");
    expect(field).toBeInvalid();
    expect(field).toHaveValue("Seed notes");
  });
  it("keeps an explicit ARIA state and merges password feedback with an external note", () => {
    renderControl(
      <FormField label="Password" error="Weak password" hint="At least 12 characters">
        <p id="policy-note">Policy</p>
        <FormInput type="password" aria-invalid="grammar" aria-describedby="policy-note" />
      </FormField>,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "grammar");
    expect(input).toHaveAccessibleDescription("Policy Weak password At least 12 characters");
  });
  it("uses the checkbox label and preserves native serialization with contextual feedback", () => {
    renderControl(
      <form aria-label="Agreement">
        <FormField label="Fallback agreement" error="Accept the terms" hint="Required for signup">
          <FormCheckbox name="terms" label="Terms" defaultChecked value="yes" />
        </FormField>
      </form>,
    );
    const input = screen.getByRole("checkbox", { name: "Terms" });
    expect(screen.queryByText("Fallback agreement")).toBeNull();
    expect(input).toHaveAccessibleDescription("Accept the terms Required for signup");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("terms")).toBe("yes");
  });
  it("uses exclusive selection semantics for operational filter chips", () => {
    const onChange = vi.fn();
    renderControl(
      <Tabs
        items={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
        ]}
        value="all"
        onChange={onChange}
        label="Account state"
      />,
    );
    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Active" }));
    expect(onChange).toHaveBeenCalledWith("active");
  });
});
