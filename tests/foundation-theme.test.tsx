import {
  ActionIcon,
  Alert,
  Anchor,
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
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminUiProvider } from "@/components/admin-ui-provider";
import { adminCssVariablesResolver, adminTheme, adminTokens } from "@/lib/admin-theme";
import classes from "@/lib/admin-theme.module.css";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  document.querySelector("style[data-foundation-test]")?.remove();
});

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

function renderWithInputStyles(children: React.ReactNode) {
  // Load the same CSS sources as the admin layout. jsdom can check matched rules and
  // their declarations. It does not render the colors, outlines, or border widths.
  const require = createRequire(import.meta.url);
  const mantineCss = readFileSync(require.resolve("@mantine/core/styles.css"), "utf8");
  const foundationCss = readFileSync("lib/admin-theme.module.css", "utf8").replace(
    /\.([a-zA-Z]\w*)/g,
    (_, name: string) => `.${classes[name]}`,
  );
  const style = document.createElement("style");
  style.setAttribute("data-foundation-test", "");
  style.textContent = `${mantineCss}\n${foundationCss}`;
  document.head.append(style);

  return render(
    <AdminI18nProvider initialLocale="en">
      <AdminUiProvider>{children}</AdminUiProvider>
    </AdminI18nProvider>,
  );
}

function inputBorderRule(element: Element) {
  return getComputedStyle(element).getPropertyValue("--input-bd").trim();
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

  it("uses contrasting choice boundaries for enabled unchecked controls, including on hover", () => {
    renderWithInputStyles(
      <>
        <Checkbox label="Unchecked checkbox" />
        <Checkbox label="Checked checkbox" defaultChecked />
        <Checkbox label="Mixed checkbox" indeterminate />
        <Checkbox label="Disabled checkbox" disabled />
        <Checkbox label="Invalid checkbox" error="Confirm this choice" />
        <Radio label="Unchecked radio" />
        <Radio label="Checked radio" defaultChecked />
        <Radio label="Disabled radio" disabled />
        <Radio label="Invalid radio" error="Choose an option" />
      </>,
    );
    const style = document.querySelector<HTMLStyleElement>("style[data-foundation-test]")!;
    const rules = Array.from(style.sheet!.cssRules);
    const hoverRules = rules
      .filter(
        (rule): rule is CSSMediaRule =>
          "conditionText" in rule && rule.conditionText === "(hover: hover)",
      )
      .flatMap((rule) => Array.from(rule.cssRules));
    const choiceRule = (rules: CSSRule[], field: Element) =>
      rules.find(
        (rule): rule is CSSStyleRule =>
          "selectorText" in rule &&
          typeof rule.selectorText === "string" &&
          rule.selectorText.includes(`.${classes.choice}`) &&
          field.matches(rule.selectorText.replace(":hover", "")),
      );
    for (const [stateRules, token] of [
      [rules, "--mantine-color-gray-6"],
      [hoverRules, "--mantine-color-gray-7"],
    ] as const) {
      for (const control of ["Unchecked checkbox", "Unchecked radio"]) {
        const field = screen.getByLabelText(control);
        expect(choiceRule(stateRules, field)?.style.getPropertyValue("border-color")).toBe(
          `var(${token})`,
        );
      }
      for (const surface of [
        "--surface",
        "--background",
        "--surface-subtle",
        "--surface-selected",
      ]) {
        expect(contrast(readColor(token), readColor(surface))).toBeGreaterThanOrEqual(3);
      }
      for (const control of [
        "Checked checkbox",
        "Mixed checkbox",
        "Disabled checkbox",
        "Invalid checkbox",
        "Checked radio",
        "Disabled radio",
        "Invalid radio",
      ]) {
        expect(choiceRule(stateRules, screen.getByLabelText(control)), control).toBeUndefined();
      }
    }
  });

  it("keeps the unchecked switch thumb distinct when the track has an error", () => {
    renderWithInputStyles(
      <>
        <Switch label="Reminder" />
        <Switch label="Invalid reminder" error="Enable reminders" />
        <Switch label="Disabled reminder" disabled />
      </>,
    );
    const invalidTrack = screen.getByRole("switch", {
      name: /Invalid reminder/,
    }).nextElementSibling!;
    const reminder = screen.getByRole("switch", { name: "Reminder" });
    const normalTrack = reminder.nextElementSibling!;
    const disabled = screen.getByRole("switch", { name: "Disabled reminder" });
    const thumb = (track: Element) =>
      getComputedStyle(track).getPropertyValue("--switch-thumb-bg").trim();
    expect(thumb(invalidTrack)).toBe("var(--text-muted)");
    expect(getComputedStyle(invalidTrack).boxShadow).toBe("inset 0 0 0 1px var(--danger)");
    expect(
      contrast(readColor("--text-muted"), readColor("--mantine-color-gray-3")),
    ).toBeGreaterThanOrEqual(3);
    expect(thumb(normalTrack)).toBe("var(--text-muted)");
    expect(contrast(readColor("--text-muted"), readColor("--surface"))).toBeGreaterThanOrEqual(3);
    fireEvent.click(reminder);
    expect(reminder).toBeChecked();
    expect(thumb(normalTrack)).toBe("");
    expect(contrast(readColor("--surface"), readColor("--primary"))).toBeGreaterThanOrEqual(3);
    expect(disabled).toBeDisabled();
    expect(thumb(disabled.nextElementSibling!)).toBe("");
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

  it("uses the native border focus rule for an editable field without a pointer outline", () => {
    renderWithInputStyles(<TextInput label="Editable field" />);
    const field = screen.getByLabelText("Editable field");
    const wrapper = field.closest(`.${classes.inputWrapper}`)!;
    expect(inputBorderRule(wrapper)).toBe("var(--control-border)");
    expect(getComputedStyle(wrapper).getPropertyValue("--input-bd-focus").trim()).toBe(
      "var(--focus)",
    );

    fireEvent.pointerDown(field);
    act(() => field.focus());
    expect(field).toHaveFocus();
    expect(inputBorderRule(field)).toBe("var(--input-bd-focus)");
    expect(getComputedStyle(field).outline).toBe("none");

    act(() => field.blur());
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => field.focus());
    expect(inputBorderRule(field)).toBe("var(--input-bd-focus)");
    expect(getComputedStyle(field).getPropertyValue("--input-keyboard-outline")).toBe("");
  });

  it("keeps the Danger border on an invalid field and adds a cue only for keyboard focus", () => {
    renderWithInputStyles(<TextInput label="Invalid field" error="Enter a name" />);
    const field = screen.getByLabelText("Invalid field");
    fireEvent.pointerDown(field);
    act(() => field.focus());
    expect(field).toHaveAccessibleDescription("Enter a name");
    expect(inputBorderRule(field)).toBe("var(--mantine-color-error)");
    expect(getComputedStyle(field).outline).toBe("none");

    fireEvent.keyDown(field, { key: "Tab", ctrlKey: true });
    expect(getComputedStyle(field).outline).toBe("none");
    act(() => field.blur());
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => field.focus());
    expect(inputBorderRule(field)).toBe("var(--mantine-color-error)");
    expect(getComputedStyle(field).outline).toBe("var(--input-keyboard-outline, none)");
    expect(getComputedStyle(field).outlineOffset).toBe("-2px");
    expect(getComputedStyle(field).getPropertyValue("--input-keyboard-outline").trim()).toBe(
      "2px solid var(--danger)",
    );
  });

  it("applies the active border rule to an expanded date trigger and restores its idle state", () => {
    renderWithInputStyles(<DatePickerInput label="Choose date" />);
    const trigger = screen.getByRole("button", { name: "Choose date" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(inputBorderRule(trigger)).toBe("");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(inputBorderRule(trigger)).toBe("var(--input-bd-focus)");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(inputBorderRule(trigger)).toBe("");
  });

  it("targets the MultiSelect shell for expansion and keeps errors on that shell", () => {
    renderWithInputStyles(
      <>
        <MultiSelect label="Crops" data={["Kale"]} searchable />
        <MultiSelect label="Invalid crops" data={["Yam"]} error="Select a crop" searchable />
        <fieldset disabled>
          <MultiSelect label="Disabled crops" data={["Kale"]} dropdownOpened variant="filled" />
        </fieldset>
      </>,
    );
    const field = screen.getByLabelText("Crops", { selector: "input" });
    const shell = field.closest(`.${classes.input}`)!;
    expect(shell).not.toBe(field);
    expect(inputBorderRule(shell)).toBe("");
    fireEvent.keyDown(field, { key: "ArrowDown", code: "ArrowDown" });
    expect(shell).toHaveAttribute("data-expanded");
    expect(inputBorderRule(shell)).toBe("var(--input-bd-focus)");
    expect(inputBorderRule(field)).toBe("");
    fireEvent.keyDown(field, { key: "Escape", code: "Escape" });
    expect(shell).not.toHaveAttribute("data-expanded");
    expect(inputBorderRule(shell)).toBe("");

    const invalid = screen.getByLabelText("Invalid crops", { selector: "input" });
    const invalidShell = invalid.closest(`.${classes.input}`)!;
    expect(invalid).toHaveAccessibleDescription("Select a crop");
    fireEvent.keyDown(invalid, { key: "ArrowDown", code: "ArrowDown" });
    expect(invalidShell).toHaveAttribute("data-expanded");
    expect(inputBorderRule(invalidShell)).toBe("");
    expect(inputBorderRule(invalidShell.closest(`.${classes.inputWrapper}`)!)).toBe(
      "var(--mantine-color-error)",
    );

    const disabled = screen.getByLabelText("Disabled crops", { selector: "input" });
    const disabledShell = disabled.closest(`.${classes.input}`)!;
    expect(disabled).toBeDisabled();
    expect(disabledShell).toHaveAttribute("data-expanded");
    expect(inputBorderRule(disabledShell)).toBe("var(--input-bd-focus)");
    expect(getComputedStyle(disabledShell).getPropertyValue("--input-bd-focus").trim()).toBe(
      "var(--border)",
    );
  });

  it("keeps keyboard focus styling on buttons, links and native choice controls", () => {
    renderWithInputStyles(
      <>
        <Button>Save</Button>
        <ActionIcon aria-label="Add">+</ActionIcon>
        <Anchor href="#example">Open example</Anchor>
        <Checkbox label="Confirm" />
        <Radio label="Choose" />
        <Switch label="Enable" />
      </>,
    );
    for (const role of ["link", "checkbox", "radio"] as const) {
      expect(screen.getByRole(role)).toHaveClass(classes.focusRing);
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveClass(classes.focusRing);
    }
    const toggle = screen.getByRole("switch");
    act(() => toggle.focus());
    expect(getComputedStyle(toggle.nextElementSibling!).outline).toBe(
      "2px solid var(--mantine-primary-color-filled)",
    );
  });

  it("preserves native read-only, disabled and error behavior with the theme slots", () => {
    renderWithInputStyles(
      <>
        <TextInput label="Failure" error="Required value" />
        <PasswordInput label="Disabled password" disabled />
        <TextInput label="Read-only text" readOnly value="NFV-001" />
        <Select label="Read-only selection" readOnly data={["Kale"]} value="Kale" />
        <Select label="Editable selection" data={["Kale"]} />
        <MultiSelect label="Read-only choices" readOnly data={["Kale"]} value={["Kale"]} />
        <TextInput label="Filled variant" defaultValue="NFV-002" variant="filled" />
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
    expect(inputBorderRule(password.closest(`.${classes.input}`)!)).toBe("var(--border)");
    const readOnlyText = screen.getByLabelText("Read-only text");
    const readOnlySelection = screen.getByLabelText("Read-only selection", { selector: "input" });
    const editableSelection = screen.getByLabelText("Editable selection", { selector: "input" });
    const readOnlyChoices = screen.getByLabelText("Read-only choices", { selector: "input" });
    expect(readOnlyText).toHaveAttribute("readonly");
    expect(readOnlySelection).toHaveClass(classes.readOnlyInput);
    expect(readOnlyChoices.closest(`.${classes.input}`)).toHaveClass(classes.readOnlyInput);
    for (const field of [readOnlyText, readOnlySelection, readOnlyChoices]) {
      const shell = field.closest(`.${classes.input}`)!;
      expect(inputBorderRule(shell)).toBe("var(--border)");
      expect(getComputedStyle(shell).getPropertyValue("--input-bg").trim()).toBe(
        "var(--surface-subtle)",
      );
    }
    expect(editableSelection).toHaveAttribute("readonly");
    expect(editableSelection).not.toHaveClass(classes.readOnlyInput);
    expect(inputBorderRule(editableSelection)).toBe("");
    const filled = screen.getByLabelText("Filled variant").closest(`.${classes.inputWrapper}`)!;
    expect(inputBorderRule(filled)).toBe("transparent");
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
    expect(screen.getByRole("heading", { name: "Edit" })).toHaveStyle({
      fontSize: "var(--mantine-h2-font-size)",
      fontWeight: 700,
      color: "var(--heading)",
    });
  });
});
