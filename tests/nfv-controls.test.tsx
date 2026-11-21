import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FormField, FormInput, FormSelect, Status, Tabs } from "@/components/nfv-controls";

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
    ["membership", "frozen", "orange"],
    ["user", "suspended", "red"],
    ["user", "pending_activation", "orange"],
    ["csa-purchase", "payment_confirmed", "yellow"],
    ["installment", "reported", "yellow"],
    ["membership", "unknown-status", "gray"],
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
