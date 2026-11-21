"use client";

import {
  Alert,
  Badge,
  Button as MantineButton,
  Checkbox,
  Group,
  Input,
  Loader,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  type SelectProps,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconCalendar,
  IconCategory,
  IconCreditCard,
  IconFileText,
  IconGift,
  IconLeaf,
  IconPackage,
  IconReceipt,
  IconSettings,
  IconStack2,
  IconTruck,
  IconClipboardList,
  IconBuildingWarehouse,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEdit,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLanguage,
  IconLogout,
  IconMenu2,
  IconPlant2,
  IconPlus,
  IconRosetteDiscount,
  IconShoppingBag,
  IconTrash,
  IconTrophy,
  IconUsers,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { useOptionalAdminI18n } from "@/components/admin-i18n-provider";

import {
  Children,
  cloneElement,
  isValidElement,
  createContext,
  useContext,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

// Temporary compatibility adapters for existing business screens. New UI imports
// Mantine directly; remove these contracts as each module completes migration.
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "plain" | "danger";
  small?: boolean;
  loading?: boolean;
};

function actionStyle(variant: ButtonProps["variant"]) {
  return {
    variant: variant === "outline" ? "default" : variant === "plain" ? "subtle" : "filled",
    color: variant === "danger" ? "red" : undefined,
  } as const;
}

export function Button({
  variant = "primary",
  small = false,
  loading = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <MantineButton
      type="button"
      {...props}
      {...actionStyle(variant)}
      size={small ? "xs" : undefined}
      loading={loading}
      aria-busy={loading}
      disabled={loading || props.disabled}
    >
      {children}
    </MantineButton>
  );
}

type ActionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonProps["variant"];
  small?: boolean;
};
export function ActionLink({ variant = "primary", small = false, ...props }: ActionLinkProps) {
  return (
    <MantineButton
      component="a"
      {...props}
      {...actionStyle(variant)}
      size={small ? "xs" : undefined}
    />
  );
}

type FieldContextValue = { id: string; error?: string; hint?: string };
const FieldContext = createContext<FieldContextValue | null>(null);
function useFieldProps(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
}) {
  const field = useContext(FieldContext);
  return {
    id: props.id ?? field?.id,
    error:
      field?.error || Boolean(props["aria-invalid"] === true || props["aria-invalid"] === "true"),
    description: !field?.error ? field?.hint : undefined,
  };
}

export function FormInput({
  className,
  size: _size,
  type,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  void _size;
  const field = useFieldProps(props);
  const i18n = useOptionalAdminI18n();
  if (type === "password")
    return (
      <PasswordInput
        {...props}
        {...field}
        classNames={{ innerInput: className }}
        visibilityToggleButtonProps={{
          "aria-label": i18n?.t.common.passwordVisibility ?? "Show/hide password",
        }}
      />
    );
  return (
    <TextInput
      {...props}
      {...field}
      type={type}
      classNames={{ input: className }}
      attributes={
        props["aria-describedby"]
          ? { input: { "aria-describedby": props["aria-describedby"] } }
          : undefined
      }
    />
  );
}

/** Mantine Select uses string values and serializes named fields in its hidden input. */
export function FormSelect(props: SelectProps) {
  const field = useFieldProps(props);
  return (
    <Select
      role="combobox"
      allowDeselect={false}
      {...props}
      {...field}
      attributes={{
        ...props.attributes,
        input: {
          ...props.attributes?.input,
          ...(props["aria-describedby"] ? { "aria-describedby": props["aria-describedby"] } : {}),
        },
      }}
    />
  );
}

export function FormTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldProps(props);
  return (
    <Textarea
      {...props}
      {...field}
      classNames={{ input: className }}
      attributes={
        props["aria-describedby"]
          ? { input: { "aria-describedby": props["aria-describedby"] } }
          : undefined
      }
    />
  );
}

type FormFieldProps = {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
};
export function FormField({ label, children, error, hint, className }: FormFieldProps) {
  const generatedId = useId();
  const elements = Children.toArray(children);
  const control = elements.find(
    (child) =>
      isValidElement<{ id?: string }>(child) &&
      [FormInput, FormSelect, FormTextarea, "input", "select", "textarea"].some(
        (type) => child.type === type,
      ),
  );
  const id = isValidElement<{ id?: string }>(control)
    ? (control.props.id ?? generatedId)
    : generatedId;
  const content = elements.map((child) =>
    child === control && isValidElement<{ id?: string }>(child) && typeof child.type === "string"
      ? cloneElement(child, { id })
      : child,
  );
  return (
    <FieldContext.Provider value={{ id, error, hint }}>
      <Input.Wrapper id={id} label={label} className={className}>
        {content}
      </Input.Wrapper>
    </FieldContext.Provider>
  );
}

export function FormCheckbox({
  label,
  className,
  size: _size,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode }) {
  void _size;
  return <Checkbox {...props} label={label} className={className} />;
}

const icons = {
  plus: IconPlus,
  back: IconArrowLeft,
  edit: IconEdit,
  up: IconChevronUp,
  down: IconChevronDown,
  trash: IconTrash,
  copy: IconCopy,
  check: IconCheck,
  dashboard: IconLayoutDashboard,
  orders: IconShoppingBag,
  product: IconPackage,
  categories: IconCategory,
  calendar: IconCalendar,
  purchase: IconReceipt,
  quota: IconStack2,
  terms: IconFileText,
  tracker: IconLeaf,
  reward: IconGift,
  redemption: IconClipboardList,
  workshop: IconCalendar,
  shipping: IconTruck,
  payments: IconCreditCard,
  settings: IconSettings,
  users: IconUsers,
  points: IconTrophy,
  csa: IconPlant2,
  store: IconShoppingBag,
  farms: IconBuildingWarehouse,
  website: IconWorld,
  voucher: IconRosetteDiscount,
  menu: IconMenu2,
  panelLeft: IconLayoutSidebarLeftCollapse,
  language: IconLanguage,
  logout: IconLogout,
  close: IconX,
} as const;
export type IconName = keyof typeof icons;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" size={size} stroke={1.7} style={{ flexShrink: 0 }} />;
}

// Callers keep their domain label and may explicitly supply a semantic tone.
// Unknown states remain neutral instead of being presented as successful.
type StatusDomain =
  | "order"
  | "refund"
  | "csa-round"
  | "csa-selection"
  | "csa-terms"
  | "farm-stock"
  | "voucher"
  | "user"
  | "membership"
  | "membership-usage"
  | "csa-customer"
  | "csa-purchase"
  | "installment"
  | "availability"
  | "publication"
  | "redemption"
  | "testimonial"
  | "completion"
  | "workshop"
  | "visibility"
  | "account-link"
  | "companion-delivery";
const statusColors: Record<StatusDomain, Record<string, string>> = {
  user: { active: "green", pending_activation: "orange", suspended: "red", anonymized: "gray" },
  membership: {
    scheduled: "yellow",
    active: "green",
    frozen: "orange",
    ended: "gray",
    revoked: "red",
  },
  "membership-usage": { applied: "green", reversed: "gray", rejected: "red" },
  "csa-customer": { active: "green", scheduled: "blue", history_only: "gray", new: "yellow" },
  "csa-purchase": {
    pending: "yellow",
    payment_confirmed: "yellow",
    approved: "green",
    rejected: "red",
    expired: "gray",
  },
  installment: {
    pending: "yellow",
    reported: "yellow",
    confirmed: "green",
    rejected: "red",
    overdue: "red",
  },
  availability: { active: "green", inactive: "gray" },
  publication: { published: "green", draft: "gray" },
  redemption: { pending: "yellow", contacted: "blue", completed: "green", rejected: "red" },
  testimonial: { draft: "gray", published: "green", hidden: "gray" },
  completion: {
    complete: "green",
    incomplete: "yellow",
    partial: "yellow",
    empty: "gray",
    ready: "green",
  },
  workshop: { upcoming: "blue", ongoing: "green", completed: "gray" },
  visibility: { visible: "green", hidden: "gray" },
  "account-link": { linked: "green", unlinked: "yellow" },
  order: {
    pending_review: "yellow",
    payment_pending: "yellow",
    payment_review: "blue",
    pending_delivery: "blue",
    delivered: "green",
    cancelled: "gray",
  },
  refund: { pending: "yellow", refund_required: "orange", refunded: "green" },
  "csa-round": {
    draft: "gray",
    scheduled: "blue",
    open: "green",
    closed: "gray",
    delivery: "blue",
    cancelled: "gray",
  },
  "csa-selection": {
    selecting: "blue",
    reselecting: "orange",
    locked: "yellow",
    confirmed: "green",
    delivered: "green",
    cancelled: "gray",
  },
  "csa-terms": { draft: "gray", published: "green", archived: "gray" },
  "farm-stock": {
    active: "green",
    upcoming: "blue",
    inactive: "gray",
    expired: "gray",
    cancelled: "gray",
  },
  voucher: {
    active: "green",
    scheduled: "blue",
    upcoming: "blue",
    inactive: "gray",
    expired: "gray",
    exhausted: "orange",
  },
  "companion-delivery": {
    accepting: "green",
    scheduled: "blue",
    expired: "orange",
    disabled: "gray",
    closed: "gray",
    cancelled: "gray",
  },
};
export function Status({
  status,
  label,
  className,
  color,
  domain,
}: {
  status: string;
  label: string;
  className?: string;
  color?: string;
  domain?: StatusDomain;
}) {
  return (
    <Badge
      color={color ?? (domain ? statusColors[domain][status] : undefined) ?? "gray"}
      variant="light"
      radius="sm"
      className={className}
      tt="none"
      fw={600}
    >
      {label}
    </Badge>
  );
}

type TabsProps = {
  items: readonly { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
};
/** Legacy name: all existing consumers are exclusive filters, presets or language selection. */
export function Tabs({ items, value, onChange, label, disabled = false }: TabsProps) {
  return (
    <SegmentedControl
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      data={items.map((item) => ({
        value: item.value,
        label: (
          <Group gap={6} wrap="nowrap">
            <span>{item.label}</span>
            {item.count !== undefined && (
              <Badge size="xs" variant="light" color="gray">
                {item.count}
              </Badge>
            )}
          </Group>
        ),
      }))}
      styles={{ root: { maxWidth: "100%", flexWrap: "wrap", gap: 4 } }}
    />
  );
}

type DataStateProps = {
  kind: "loading" | "empty" | "error";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
};
export function DataState({ kind, title, description, action, compact = false }: DataStateProps) {
  return (
    <Alert
      color={kind === "error" ? "red" : "gray"}
      variant={kind === "error" ? "light" : "transparent"}
      role={kind === "error" ? "alert" : "status"}
      py={compact ? "xs" : "md"}
      icon={kind === "loading" ? <Loader size="sm" /> : undefined}
    >
      <Stack gap="xs">
        <Text fw={600} size="sm">
          {title}
        </Text>
        {description && <Text size="sm">{description}</Text>}
        {action && (
          <Button onClick={action.onClick} small variant="outline">
            {action.label}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <Paper component="section" withBorder p="md" className={className}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Stack gap={4}>
            <Title order={2} size="h4">
              {title}
            </Title>
            {description && (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            )}
          </Stack>
          {actions && <Group gap="xs">{actions}</Group>}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}
