import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Input,
  MantineProvider,
  Modal,
  MultiSelect,
  Notification,
  NumberInput,
  Pagination,
  PasswordInput,
  Radio,
  Select,
  Switch,
  Table,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateInput, DatePicker, DatePickerInput, DateTimePicker, TimeInput } from "@mantine/dates";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { adminCssVariablesResolver, adminTheme, adminTokens } from "@/lib/admin-theme";
import classes from "@/lib/admin-theme.module.css";

afterEach(cleanup);

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    expect(hex).toMatch(/^#[\da-f]{6}$/i);
    const [red, green, blue] = hex
      .slice(1)
      .match(/../g)!
      .map((channel) => {
        const sRgb = Number.parseInt(channel, 16) / 255;
        return sRgb <= 0.04045 ? sRgb / 12.92 : ((sRgb + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [darker, lighter] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (lighter + 0.05) / (darker + 0.05);
}

function readColor(variable: string) {
  const style = getComputedStyle(document.documentElement);
  let value = style.getPropertyValue(variable).trim();
  while (value.startsWith("var(")) value = style.getPropertyValue(value.slice(4, -1)).trim();
  return value;
}

const statuses = [
  ["success", "green", "#1f6b3b", "#eaf5ed"],
  ["pending", "yellow", "#785600", "#fff9db"],
  ["warning", "orange", "#8a4b08", "#fdf3e3"],
  ["danger", "red", "#b3261e", "#fce8e6"],
  ["info", "blue", "#195a9b", "#e7f5ff"],
  ["neutral", "gray", "#526173", "#edf0f2"],
] as const;

function renderTheme(children: React.ReactNode) {
  return render(
    <MantineProvider
      theme={adminTheme}
      cssVariablesResolver={adminCssVariablesResolver}
      forceColorScheme="light"
    >
      {children}
    </MantineProvider>,
  );
}

describe("admin color foundation", () => {
  it("keeps the approved brand palettes, primary shade, and shared Light scheme", () => {
    renderTheme(<TextInput label="Example" />);
    expect(document.documentElement).toHaveAttribute("data-mantine-color-scheme", "light");
    expect(adminTheme.primaryColor).toBe("forest");
    expect(adminTheme.primaryShade).toBe(7);
    expect(adminTheme.colors?.forest).toEqual([
      "#f0faf3",
      "#e1f5e8",
      "#bfe7cc",
      "#90d5a8",
      "#62c184",
      "#3aa868",
      "#248d53",
      "#1f7c4d",
      "#17633d",
      "#144a2f",
    ]);
    expect(adminTheme.colors?.gray).toEqual([
      "#f7f8fa",
      "#edf0f2",
      "#e5e9ed",
      "#d8dfe5",
      "#b9c3cc",
      "#919eaa",
      "#6d7b8b",
      "#526173",
      "#334151",
      "#202c38",
    ]);
    expect(readColor("--mantine-color-body")).toBe(readColor("--background"));
    expect(readColor("--mantine-color-error")).toBe(readColor("--danger"));
    expect(readColor("--mantine-color-placeholder")).toBe(readColor("--text-subtle"));
    expect(readColor("--mantine-color-disabled")).toBe(readColor("--surface-disabled"));
    expect(readColor("--mantine-color-disabled-color")).toBe(readColor("--text-disabled"));
    expect(readColor("--nfv-heading-color")).toBe(readColor("--heading"));
    expect(readColor("--nfv-subtle-color")).toBe(readColor("--text-subtle"));
    expect(readColor("--mantine-primary-color-filled")).toBe(readColor("--primary"));
    expect(readColor("--mantine-primary-color-filled-hover")).toBe(readColor("--primary-hover"));
    expect(adminTokens).toEqual({
      background: "#f7f8fa",
      surface: "#ffffff",
      "surface-subtle": "#f4f6f8",
      text: "#202938",
      heading: "#17212e",
      "text-muted": "#5a6676",
      "text-subtle": "#687483",
      "text-inverse": "#ffffff",
      border: "#e2e6eb",
      "border-strong": "#ced4da",
      "control-border": "#ced4da",
      "control-border-hover": "#b9c3cc",
      primary: "#1f7c4d",
      "primary-hover": "#17633d",
      "primary-soft": "#eaf6ef",
      "surface-hover": "#f4f6f8",
      "surface-selected": "#eaf6ef",
      "surface-disabled": "#edf0f2",
      "text-disabled": "#687483",
      focus: "#1f7c4d",
      overlay: "rgba(32, 41, 56, 0.25)",
    });
    for (const [name, value] of Object.entries(adminTokens)) {
      expect(readColor(`--${name}`)).toBe(value);
    }
  });

  it.each(statuses)(
    "uses the approved %s pair and preserves the %s alias",
    (role, alias, foreground, background) => {
      renderTheme(
        <>
          <Badge color={role} data-testid="badge">
            Status
          </Badge>
          <Alert color={alias} title="Alert" icon={<svg aria-hidden />} data-testid="alert">
            Message
          </Alert>
          <Notification
            color={role}
            title="Notification"
            icon={<svg aria-hidden />}
            closeButtonProps={{ "aria-label": "Dismiss notification" }}
            data-testid="notification"
          >
            Notice
          </Notification>
        </>,
      );
      expect(readColor(`--mantine-color-${role}-light-color`)).toBe(foreground);
      expect(readColor(`--mantine-color-${role}-light`)).toBe(background);
      expect(readColor(`--mantine-color-${alias}-light-color`)).toBe(foreground);
      expect(readColor(`--mantine-color-${alias}-light`)).toBe(background);
      expect(screen.getByTestId("badge")).toHaveStyle({
        "--badge-color": `var(--mantine-color-${role}-light-color)`,
        "--badge-bg": `var(--mantine-color-${role}-light)`,
      });
      expect(screen.getByTestId("alert")).toHaveStyle({
        "--alert-color": `var(--mantine-color-${alias}-light-color)`,
        "--alert-bg": `var(--mantine-color-${alias}-light)`,
      });
      expect(screen.getByText("Message")).toHaveStyle({ color: "var(--alert-color)" });
      expect(screen.getByTestId("notification")).toHaveStyle({
        "--notification-color": `var(--mantine-color-${role}-filled)`,
        backgroundColor: `var(--${role}-soft)`,
      });
      const semanticText = { color: `var(--${role})` };
      expect(screen.getByText("Notification")).toHaveStyle(semanticText);
      expect(screen.getByText("Notice")).toHaveStyle(semanticText);
      expect(screen.getByRole("button", { name: "Dismiss notification" })).toHaveStyle(
        semanticText,
      );
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(readColor("--text-inverse"), foreground)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("shares the control border only on default Button and ActionIcon variants", () => {
    const variants = ["default", "filled", "light", "subtle", "transparent", "outline"] as const;
    renderTheme(
      <>
        {variants.map((variant) => (
          <div key={variant}>
            <Button variant={variant}>{variant} button</Button>
            <ActionIcon variant={variant} aria-label={`${variant} icon`} />
          </div>
        ))}
        <ActionIcon aria-label="Implicit icon" />
      </>,
    );
    for (const variant of variants) {
      const button = screen.getByRole("button", { name: `${variant} button` });
      const icon = screen.getByRole("button", { name: `${variant} icon` });
      if (variant === "default") {
        expect(button).toHaveClass(classes.defaultControl);
        expect(icon).toHaveClass(classes.defaultControl);
        expect(button).toHaveStyle({
          "--button-bd":
            "calc(0.0625rem * var(--mantine-scale)) solid var(--mantine-color-default-border)",
        });
        expect(icon).toHaveStyle({
          "--ai-bd":
            "calc(0.0625rem * var(--mantine-scale)) solid var(--mantine-color-default-border)",
        });
        continue;
      }
      expect(button).not.toHaveClass(classes.defaultControl);
      expect(icon).not.toHaveClass(classes.defaultControl);
    }
    const implicitIcon = screen.getByRole("button", { name: "Implicit icon" });
    expect(implicitIcon).toHaveAttribute("data-variant", "subtle");
    expect(implicitIcon).toHaveStyle({ "--ai-size": "calc(2.25rem * var(--mantine-scale))" });
    expect(implicitIcon).not.toHaveClass(classes.defaultControl);
  });

  it("meets normal text contrast for active actions, inputs, and overlay content", () => {
    renderTheme(<Button color="red">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveStyle({
      "--button-bg": "var(--mantine-color-red-filled)",
      "--button-hover": "var(--mantine-color-red-filled-hover)",
    });
    expect(readColor("--mantine-color-red-filled-hover")).toBe("#8c1d18");
    const normalTextPairs = [
      ["--text", "--background"],
      ["--text", "--surface-hover"],
      ["--heading", "--surface"],
      ["--text-muted", "--background"],
      ["--text-muted", "--surface-disabled"],
      ["--text-muted", "--surface-selected"],
      ["--text-subtle", "--surface"],
      ["--primary", "--background"],
      ["--primary-hover", "--surface-selected"],
      ["--text-inverse", "--primary"],
      ["--text-inverse", "--primary-hover"],
      ["--text-inverse", "--danger"],
      ["--text-inverse", "--danger-hover"],
      ["--text-inverse", "--heading"],
      ["--danger", "--surface"],
    ];
    for (const [foreground, background] of normalTextPairs) {
      expect(
        contrast(readColor(foreground), readColor(background)),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps Forest focus visible and records the contrast limits of the approved light borders", () => {
    renderTheme(<TextInput label="Disabled" disabled />);
    const surface = readColor("--surface");
    expect(contrast(readColor("--control-border"), surface)).toBeCloseTo(1.49, 2);
    expect(contrast(readColor("--control-border-hover"), surface)).toBeCloseTo(1.79, 2);
    for (const background of [
      "--surface",
      "--background",
      "--surface-hover",
      "--surface-selected",
    ]) {
      expect(contrast(readColor("--focus"), readColor(background))).toBeGreaterThanOrEqual(3);
    }
    const disabledContrast = contrast(
      readColor("--text-disabled"),
      readColor("--surface-disabled"),
    );
    expect(disabledContrast).toBeCloseTo(4.16, 2);
  });

  it("uses one input styling contract across native fields and date triggers", () => {
    renderTheme(
      <>
        <Input.Wrapper label="Base field" id="base-field">
          <Input id="base-field" />
        </Input.Wrapper>
        <TextInput label="Text" defaultValue="Entered" />
        <Textarea label="Notes" />
        <NumberInput label="Amount" />
        <DateInput label="Date" />
        <DatePickerInput label="Date trigger" placeholder="Choose a date" />
        <DateTimePicker label="Date and time" placeholder="Choose a date and time" />
        <TimeInput label="Time" />
        <PasswordInput label="Password" />
        <MultiSelect label="Multiple" data={["Kale"]} searchable />
      </>,
    );
    for (const label of [
      "Base field",
      "Text",
      "Notes",
      "Amount",
      "Date",
      "Date trigger",
      "Date and time",
      "Time",
    ]) {
      expect(screen.getByLabelText(label)).toHaveClass(classes.input);
      expect(screen.getByLabelText(label).closest(`.${classes.inputWrapper}`)).toHaveAttribute(
        "data-variant",
        "default",
      );
    }
    for (const label of ["Password", "Multiple"]) {
      expect(
        screen.getByLabelText(label, { selector: "input" }).closest(`.${classes.input}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Text")).toHaveValue("Entered");
  });

  it("preserves native read-only, disabled and error behavior with the theme slots", () => {
    renderTheme(
      <>
        <TextInput label="Failure" error="Required value" />
        <PasswordInput label="Disabled password" disabled />
        <TextInput label="Read-only text" readOnly value="NFV-001" />
        <Select label="Read-only selection" readOnly data={["Kale"]} value="Kale" />
        <Select label="Editable selection" data={["Kale"]} />
        <MultiSelect label="Read-only choices" readOnly data={["Kale"]} value={["Kale"]} />
        <Checkbox label="Checkbox" disabled />
        <Radio label="Radio" error="Pick a valid option" />
        <Switch label="Switch" defaultChecked />
      </>,
    );
    const error = screen.getByRole("textbox", { name: "Failure" });
    expect(error).toHaveAttribute("aria-invalid", "true");
    expect(error).toHaveAccessibleDescription("Required value");
    expect(error.closest(`.${classes.inputWrapper}`)).toHaveAttribute("data-error");
    const password = screen.getByLabelText("Disabled password");
    expect(password).toBeDisabled();
    expect(password.closest(`.${classes.input}`)).toHaveAttribute("data-disabled");
    expect(screen.getByLabelText("Read-only text")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Read-only selection", { selector: "input" })).toHaveClass(
      classes.readOnlyInput,
    );
    expect(screen.getByLabelText("Editable selection", { selector: "input" })).not.toHaveClass(
      classes.readOnlyInput,
    );
    expect(
      screen
        .getByLabelText("Read-only choices", { selector: "input" })
        .closest(`.${classes.input}`),
    ).toHaveClass(classes.readOnlyInput);
    expect(screen.getByRole("checkbox", { name: "Checkbox" })).toHaveClass(classes.choice);
    expect(screen.getByRole("checkbox", { name: "Checkbox" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Radio" })).toHaveClass(classes.choice);
    const toggle = screen.getByRole("switch", { name: "Switch" });
    expect(toggle).toBeChecked();
    expect(toggle.nextElementSibling).toHaveClass(classes.switchTrack);
  });

  it("styles selected and keyboard-current options inside the portalled dropdown", () => {
    const { container } = renderTheme(
      <Select label="Crop" data={["Kale", "Yam"]} defaultValue="Kale" withScrollArea={false} />,
    );
    const target = screen.getByLabelText("Crop", { selector: "input" });
    expect(target).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(target, { key: "ArrowDown", code: "ArrowDown" });
    expect(target).toHaveAttribute("data-expanded");
    const kale = screen.getByRole("option", { name: "Kale" });
    expect(container).not.toContainElement(kale);
    expect(kale).toHaveAttribute("data-checked");
    expect(kale).toHaveClass(classes.comboboxOption);
    fireEvent.keyDown(target, { key: "ArrowDown", code: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Yam" })).toHaveAttribute("data-combobox-selected");
  });

  it("uses native focus and selection for calendar and pagination controls", () => {
    renderTheme(
      <>
        <DatePicker defaultValue="2026-11-22" defaultDate="2026-11-22" />
        <Pagination total={3} />
      </>,
    );
    const day = screen.getByRole("button", { name: /22 November 2026/ });
    expect(day).toHaveAttribute("data-selected");
    expect(day).toHaveClass(classes.calendarDay, classes.focusRing);
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("data-active");
    expect(screen.getByRole("button", { name: "2" })).toHaveClass(
      classes.paginationControl,
      classes.focusRing,
    );
  });

  it("applies the shared typography, spacing and row states through native Table slots", () => {
    renderTheme(
      <Table aria-label="Records">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Record</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr data-selected="true">
            <Table.Td>Selected</Table.Td>
          </Table.Tr>
          <Table.Tr>
            <Table.Td>Ordinary</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>,
    );
    expect(screen.getByRole("table", { name: "Records" })).toHaveStyle({
      fontSize: "var(--mantine-font-size-md)",
      "--table-horizontal-spacing": "var(--mantine-spacing-md)",
      "--table-vertical-spacing": "var(--mantine-spacing-sm)",
      "--table-border-color": "var(--border)",
      "--table-highlight-on-hover-color": "var(--surface-hover)",
    });
    expect(screen.getByRole("columnheader", { name: "Record" })).toHaveStyle({
      backgroundColor: "var(--background)",
      color: "var(--neutral)",
      fontSize: "var(--mantine-font-size-sm)",
      fontWeight: "600",
    });
    expect(screen.getByRole("row", { name: "Selected" })).toHaveClass(classes.tableRow);
    expect(screen.getByRole("row", { name: "Ordinary" })).toHaveAttribute("data-hover");
  });

  it("uses the foundation surfaces and overlay for portalled dialogs and compound drawers", () => {
    const nativeDrawer = renderTheme(
      <Drawer opened onClose={() => {}} title="Navigation" transitionProps={{ duration: 0 }} />,
    );
    expect(screen.getByRole("dialog", { name: "Navigation" })).toHaveStyle({
      backgroundColor: "var(--background)",
      color: "var(--text)",
    });
    expect(nativeDrawer.container).not.toContainElement(screen.getByRole("dialog"));
    expect(document.querySelector(".mantine-Drawer-overlay")).toHaveClass(classes.dialogOverlay);
    nativeDrawer.unmount();

    const { container, unmount } = renderTheme(
      <Drawer.Root opened onClose={() => {}} transitionProps={{ duration: 0 }}>
        <Drawer.Overlay data-testid="drawer-overlay" />
        <Drawer.Content>
          <Drawer.Header data-testid="drawer-header">
            <Drawer.Title>Details</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body>Drawer content</Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>,
    );
    const drawer = screen.getByRole("dialog", { name: "Details" });
    expect(container).not.toContainElement(drawer);
    expect(drawer).toHaveStyle({ backgroundColor: "var(--background)", color: "var(--text)" });
    expect(screen.getByTestId("drawer-header")).toHaveStyle({
      backgroundColor: "var(--surface)",
      padding: "var(--mb-padding, var(--mantine-spacing-md))",
    });
    expect(screen.getByTestId("drawer-overlay").className).toContain("dialogOverlay");
    unmount();

    renderTheme(
      <Modal opened onClose={() => {}} title="Edit" transitionProps={{ duration: 0 }}>
        Modal content
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Edit" })).toHaveStyle({
      backgroundColor: "var(--surface)",
      color: "var(--text)",
    });
  });
});
