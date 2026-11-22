"use client";

import {
  ComboboxTarget,
  createTheme,
  virtualColor,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineTheme,
  type TableScrollContainerProps,
} from "@mantine/core";
import classes from "./admin-theme.module.css";

export const adminPalettes = {
  gray: [
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
  ],
  forest: [
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
  ],
} as const satisfies Record<string, MantineColorsTuple>;

const white = "#ffffff";
const subtleText = "#687483";
const subtleSurface = "#f4f6f8";
const softPrimary = "#eaf6ef";
const lightBorder = "#ced4da";
const primary = adminPalettes.forest[7];

export const adminTokens = {
  background: adminPalettes.gray[0],
  surface: white,
  "surface-subtle": subtleSurface,
  text: "#202938",
  heading: "#17212e",
  "text-muted": "#5a6676",
  "text-subtle": subtleText,
  "text-inverse": white,
  border: "#e2e6eb",
  "border-strong": lightBorder,
  "control-border": lightBorder,
  "control-border-hover": adminPalettes.gray[4],
  primary,
  "primary-hover": adminPalettes.forest[8],
  "primary-soft": softPrimary,
  "surface-hover": subtleSurface,
  "surface-selected": softPrimary,
  "surface-disabled": adminPalettes.gray[1],
  "text-disabled": subtleText,
  focus: primary,
  overlay: "rgba(32, 41, 56, 0.25)",
} as const;

export const adminSemanticColors = {
  success: { foreground: "#1f6b3b", background: "#eaf5ed", alias: "green" },
  pending: { foreground: "#785600", background: "#fff9db", alias: "yellow" },
  warning: { foreground: "#8a4b08", background: "#fdf3e3", alias: "orange" },
  danger: { foreground: "#b3261e", background: "#fce8e6", alias: "red", hover: "#8c1d18" },
  info: { foreground: "#195a9b", background: "#e7f5ff", alias: "blue" },
  neutral: { foreground: adminPalettes.gray[7], background: adminPalettes.gray[1], alias: "gray" },
} as const;

const semanticColors = Object.entries(adminSemanticColors);
const semanticPalettes = Object.fromEntries(
  semanticColors.map(([role, { alias }]) => [
    role,
    virtualColor({ name: role, light: alias, dark: alias }),
  ]),
);

const foundationVariables = {
  ...Object.fromEntries(Object.entries(adminTokens).map(([token, value]) => [`--${token}`, value])),
  ...Object.fromEntries(
    semanticColors.flatMap(([role, { foreground, background }]) => [
      [`--${role}`, foreground],
      [`--${role}-soft`, background],
    ]),
  ),
  "--danger-hover": adminSemanticColors.danger.hover,
  "--radius": "var(--mantine-radius-lg)",
  "--nfv-heading-color": "var(--heading)",
  "--nfv-subtle-color": "var(--text-subtle)",
};

const semanticVariantVariables = Object.fromEntries(
  semanticColors.flatMap(([role, { alias }]) => {
    const foreground = `var(--${role})`;
    const background = `var(--${role}-soft)`;
    const filledHover =
      role === "danger"
        ? "var(--danger-hover)"
        : `color-mix(in srgb, ${foreground}, var(--heading) 12%)`;
    const lightHover = `color-mix(in srgb, ${background}, ${foreground} 5%)`;
    return [role, alias].flatMap((color) => [
      [`--mantine-color-${color}-filled`, foreground],
      [`--mantine-color-${color}-filled-hover`, filledHover],
      [`--mantine-color-${color}-light`, background],
      [`--mantine-color-${color}-light-hover`, lightHover],
      [`--mantine-color-${color}-light-color`, foreground],
      [`--mantine-color-${color}-outline`, foreground],
      [`--mantine-color-${color}-outline-hover`, background],
    ]);
  }),
);

const fontFamily =
  '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const sizeSm = { size: "sm" } as const;
const floatingSurface = {
  backgroundColor: "var(--surface)",
  color: "var(--text)",
  borderColor: "var(--border)",
};
const optionsClassNames = { option: classes.comboboxOption };
const optionsStyles = { dropdown: floatingSurface };
const readOnlyInputClassNames = (_theme: MantineTheme, { readOnly }: { readOnly?: boolean }) =>
  readOnly ? { input: classes.readOnlyInput } : {};
const dateControl = { defaultProps: sizeSm, classNames: { day: classes.calendarDay } };
const overlayPadding = "var(--mb-padding, var(--mantine-spacing-md))";
const overlayStyles = {
  header: {
    backgroundColor: "var(--surface)",
    borderBottom: "1px solid var(--border)",
    padding: overlayPadding,
    gap: "var(--mantine-spacing-xs)",
  },
  title: {
    color: "var(--heading)",
    fontSize: "var(--mantine-h2-font-size)",
    fontWeight: 700,
    lineHeight: 1.25,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  body: { paddingBlockStart: overlayPadding },
};
const modalDefaults = { centered: true, radius: "lg" } as const;
const defaultControlClassNames = (_theme: MantineTheme, { variant }: { variant?: string }) =>
  variant === "default" ? { root: classes.defaultControl } : {};

/** Foundation defaults; domain states choose their semantic color at the call site. */
export const adminTheme = createTheme({
  primaryColor: "forest",
  primaryShade: 7,
  colors: { ...adminPalettes, ...semanticPalettes },
  fontFamily,
  fontSizes: { xs: "0.6875rem", sm: "0.78125rem", md: "0.8125rem", lg: "1rem", xl: "1.125rem" },
  black: adminTokens.text,
  white: adminTokens.surface,
  lineHeights: { md: "1.48" },
  headings: {
    fontFamily,
    fontWeight: "700",
    sizes: { h1: { fontSize: "1.625rem" }, h2: { fontSize: "1.125rem" }, h3: { fontSize: "1rem" } },
  },
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  radius: { xs: "0.25rem", sm: "0.375rem", md: "0.5rem", lg: "0.625rem", xl: "1rem" },
  defaultRadius: "md",
  respectReducedMotion: true,
  focusClassName: classes.focusRing,
  shadows: { xs: "0 1px 2px rgb(22 40 30 / 4%)", sm: "0 4px 16px rgb(22 40 30 / 8%)" },
  components: {
    ComboboxTarget: ComboboxTarget.extend({ defaultProps: { withExpandedAttribute: true } }),
    // Normal controls: Mantine sm (36px); compact row/editor actions: xs (30px).
    Button: {
      defaultProps: { ...sizeSm, fw: 600 },
      classNames: defaultControlClassNames,
      styles: { label: { gap: 7 } },
    },
    ActionIcon: {
      defaultProps: { size: 36, variant: "subtle" },
      classNames: defaultControlClassNames,
    },
    Input: { classNames: { wrapper: classes.inputWrapper, input: classes.input } },
    InputPlaceholder: { classNames: { placeholder: classes.inputPlaceholder } },
    TextInput: { defaultProps: sizeSm },
    PasswordInput: { defaultProps: sizeSm },
    NumberInput: { defaultProps: sizeSm },
    Select: {
      defaultProps: {
        ...sizeSm,
        allowDeselect: false,
        checkIconPosition: "right",
        // Select also sets the native readonly attribute on editable non-searchable triggers.
        // Resolve the marker against the public props before Select configures its InputBase.
        classNames: readOnlyInputClassNames,
      },
      classNames: optionsClassNames,
      styles: optionsStyles,
    },
    MultiSelect: {
      defaultProps: { ...sizeSm, checkIconPosition: "right" },
      classNames: (theme: MantineTheme, props: { readOnly?: boolean }) => ({
        ...optionsClassNames,
        ...readOnlyInputClassNames(theme, props),
      }),
      styles: optionsStyles,
    },
    Combobox: { classNames: optionsClassNames, styles: optionsStyles },
    Textarea: { defaultProps: sizeSm },
    Badge: {
      defaultProps: { size: "md", radius: "sm", variant: "light", tt: "none", fw: 600 },
      styles: {
        root: {
          whiteSpace: "normal",
          height: "auto",
          minHeight: "var(--badge-height)",
          lineHeight: 1.4,
        },
      },
    },
    Checkbox: { defaultProps: sizeSm, classNames: { input: classes.choice } },
    Radio: { defaultProps: sizeSm, classNames: { radio: classes.choice } },
    Switch: {
      defaultProps: sizeSm,
      classNames: { input: classes.switchInput, track: classes.switchTrack },
    },
    Tabs: { defaultProps: { keepMounted: true } },
    SegmentedControl: {
      defaultProps: sizeSm,
      styles: (_theme: MantineTheme, { color }: { color?: string }) =>
        color
          ? {}
          : {
              root: {
                "--sc-color": "var(--surface-selected)",
                "--sc-label-color": "var(--primary-hover)",
              },
            },
    },
    Paper: {
      defaultProps: { withBorder: true, radius: "lg", shadow: "none" },
      styles: { root: { backgroundColor: "var(--surface)", borderColor: "var(--border)" } },
    },
    Card: { styles: { root: { backgroundColor: "var(--surface)", borderColor: "var(--border)" } } },
    Divider: { defaultProps: { color: "var(--border)" } },
    Drawer: {
      classNames: { overlay: classes.dialogOverlay },
      styles: {
        ...overlayStyles,
        content: { backgroundColor: "var(--background)", color: "var(--text)" },
      },
    },
    Modal: {
      defaultProps: modalDefaults,
      classNames: { overlay: classes.dialogOverlay },
      styles: {
        ...overlayStyles,
        content: { backgroundColor: "var(--surface)", color: "var(--text)" },
      },
    },
    ModalRoot: { defaultProps: modalDefaults },
    ModalOverlay: { defaultProps: { blur: 1 } },
    Popover: { styles: { dropdown: floatingSurface, arrow: { borderColor: "var(--border)" } } },
    Menu: {
      styles: { dropdown: floatingSurface, arrow: { borderColor: "var(--border)" } },
      classNames: { item: classes.menuItem },
    },
    Tooltip: {
      defaultProps: { events: { hover: true, focus: true, touch: false } },
      styles: (_theme: MantineTheme, { color }: { color?: string }) =>
        color
          ? {}
          : { tooltip: { backgroundColor: "var(--heading)", color: "var(--text-inverse)" } },
    },
    Alert: { styles: { message: { color: "var(--alert-color)" } } },
    Notification: {
      styles: (_theme: MantineTheme, { color }: { color?: string }) => {
        const semantic = semanticColors.find(
          ([role, { alias }]) => color === role || color === alias,
        );
        if (!semantic)
          return { root: floatingSurface, description: { color: "var(--text-muted)" } };

        const [role] = semantic;
        return {
          root: { ...floatingSurface, backgroundColor: `var(--${role}-soft)` },
          title: { color: `var(--${role})` },
          description: { color: `var(--${role})` },
          closeButton: { color: `var(--${role})` },
        };
      },
    },
    DateInput: dateControl,
    DatePicker: dateControl,
    DatePickerInput: dateControl,
    DateTimePicker: dateControl,
    TimeInput: { defaultProps: sizeSm },
    Pagination: { classNames: { control: classes.paginationControl } },
    Table: {
      defaultProps: {
        horizontalSpacing: "md",
        verticalSpacing: "sm",
        highlightOnHover: true,
        withTableBorder: false,
        borderColor: "var(--border)",
        highlightOnHoverColor: "var(--surface-hover)",
      },
      classNames: { tr: classes.tableRow },
      styles: {
        table: {
          backgroundColor: "var(--surface)",
          fontSize: "var(--mantine-font-size-md)",
          fontWeight: 400,
        },
        th: {
          backgroundColor: "var(--background)",
          color: "var(--neutral)",
          fontSize: "var(--mantine-font-size-sm)",
          fontWeight: 600,
        },
      },
    },
    TableScrollContainer: {
      styles: (_theme: MantineTheme, { type }: TableScrollContainerProps) =>
        type === "native"
          ? { scrollContainer: { overflowX: "var(--nfv-table-overflow-x, var(--table-overflow))" } }
          : {},
    },
    Title: { styles: { root: { color: "var(--nfv-heading-color)" } } },
    AppShell: {
      styles: {
        header: {
          background: "var(--mantine-color-white)",
          borderColor: "var(--mantine-color-default-border)",
        },
        navbar: { borderColor: "var(--mantine-color-default-border)" },
      },
    },
    NavLink: {
      defaultProps: { variant: "light" },
      styles: {
        root: { borderRadius: 7, minHeight: 35, padding: "8px 10px" },
        label: { fontSize: "var(--mantine-font-size-sm)" },
        section: { marginInlineEnd: 10 },
      },
    },
  },
});

/** Mantine and retained module CSS share the Foundation tokens. */
export const adminCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: foundationVariables,
  light: {
    ...semanticVariantVariables,
    "--mantine-color-body": adminTokens.background,
    "--mantine-color-text": adminTokens.text,
    "--mantine-color-dimmed": adminTokens["text-muted"],
    "--mantine-color-default": "var(--surface)",
    "--mantine-color-default-hover": "var(--surface-hover)",
    "--mantine-color-default-color": "var(--text)",
    "--mantine-color-default-border": "var(--border)",
    "--mantine-color-placeholder": "var(--text-subtle)",
    "--mantine-color-error": "var(--danger)",
    "--mantine-color-disabled": "var(--surface-disabled)",
    "--mantine-color-disabled-color": "var(--text-disabled)",
    "--mantine-color-disabled-border": "var(--border)",
    "--mantine-color-forest-filled": "var(--primary)",
    "--mantine-color-forest-filled-hover": "var(--primary-hover)",
    "--mantine-color-forest-light": "var(--primary-soft)",
    "--mantine-color-forest-light-hover": "var(--surface-selected)",
    "--mantine-color-forest-light-color": "var(--primary-hover)",
  },
  dark: {},
});
