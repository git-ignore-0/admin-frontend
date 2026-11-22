"use client";

import {
  Alert,
  Badge,
  Button as MantineButton,
  Checkbox,
  Group,
  Input,
  type InputWrapperProps,
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
import { useOptionalAdminI18n } from "@/components/admin-i18n-provider";

import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  createContext,
  useCallback,
  useContext,
  useId,
  type AnchorHTMLAttributes,
  type AriaAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

export { Icon, type IconName } from "@/components/admin-icon";

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

type FieldAria = Pick<AriaAttributes, "aria-describedby" | "aria-invalid">;
type FieldFeedback = {
  error?: ReactNode;
  description?: ReactNode;
};
type FieldControl = FieldAria &
  FieldFeedback & {
    id?: string;
    label?: ReactNode;
    children?: ReactNode;
    type?: string;
  };
type FieldContextValue = {
  id: string;
  error?: string;
  hint?: string;
  feedbackInWrapper: boolean;
};
const FieldContext = createContext<FieldContextValue | null>(null);

function describedBy(...sources: (string | undefined)[]) {
  return (
    [
      ...new Set(sources.flatMap((source) => source?.trim().split(/\s+/) ?? []).filter(Boolean)),
    ].join(" ") || undefined
  );
}

function feedbackIds(id: string, error: ReactNode, description: ReactNode) {
  return describedBy(
    error && typeof error !== "boolean" ? `${id}-error` : undefined,
    description ? `${id}-description` : undefined,
  );
}

function useFieldProps(props: FieldControl & Pick<SelectProps, "errorProps" | "descriptionProps">) {
  const field = useContext(FieldContext);
  const generatedId = useId();
  const id = props.id ?? field?.id ?? generatedId;
  const invalid = props["aria-invalid"];
  const contextError = field?.feedbackInWrapper ? Boolean(field.error) : field?.error;
  const error =
    props.error !== undefined
      ? props.error
      : contextError || (invalid === true || invalid === "true" ? true : undefined);
  const description =
    props.description !== undefined
      ? props.description
      : field?.feedbackInWrapper
        ? undefined
        : field?.hint;
  const wrapperIds = field?.feedbackInWrapper
    ? feedbackIds(field.id, field.error, field.hint)
    : undefined;
  return {
    id,
    error,
    description,
    aria: {
      "aria-invalid": invalid ?? (Boolean(error) || undefined),
      "aria-describedby": describedBy(
        props["aria-describedby"],
        wrapperIds,
        error && typeof error !== "boolean" ? props.errorProps?.id || `${id}-error` : undefined,
        description ? props.descriptionProps?.id || `${id}-description` : undefined,
      ),
    },
  };
}

type FormInputProps = InputHTMLAttributes<HTMLInputElement> &
  FieldFeedback &
  Pick<InputWrapperProps, "inputWrapperOrder">;
export function FormInput({ className, size: _size, type, ...props }: FormInputProps) {
  void _size;
  const { aria, ...field } = useFieldProps(props);
  const i18n = useOptionalAdminI18n();
  const passwordDescription = aria["aria-describedby"];
  // Mantine 8.3 PasswordInput sets aria-describedby on its inner input after spreading props.
  const describePassword = useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) return;
      if (passwordDescription) input.setAttribute("aria-describedby", passwordDescription);
      else input.removeAttribute("aria-describedby");
    },
    [passwordDescription],
  );
  if (type === "password")
    return (
      <PasswordInput
        {...props}
        {...field}
        aria-invalid={aria["aria-invalid"]}
        ref={describePassword}
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
      attributes={{ input: aria }}
    />
  );
}

/** Mantine Select uses string values and serializes named fields in its hidden input. */
export function FormSelect(props: SelectProps) {
  const inputAttributes = props.attributes?.input;
  const { aria, ...field } = useFieldProps({
    ...props,
    "aria-invalid": props["aria-invalid"] ?? inputAttributes?.["aria-invalid"],
    "aria-describedby": describedBy(
      props["aria-describedby"],
      inputAttributes?.["aria-describedby"],
    ),
  });
  return (
    <Select
      role="combobox"
      allowDeselect={false}
      {...props}
      {...field}
      attributes={{ ...props.attributes, input: { ...inputAttributes, ...aria } }}
    />
  );
}

type FormTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldFeedback;
export function FormTextarea({ className, ...props }: FormTextareaProps) {
  const { aria, ...field } = useFieldProps(props);
  return (
    <Textarea
      {...props}
      {...field}
      classNames={{ input: className }}
      attributes={{ input: aria }}
    />
  );
}

function hasOwnFeedback(type: ReactElement["type"]) {
  return type === FormInput || type === FormSelect || type === FormTextarea;
}

function isNativeControl(type: ReactElement["type"]) {
  return type === "input" || type === "select" || type === "textarea";
}

function canInspectChildren(type: ReactElement["type"]) {
  return type === Fragment || typeof type === "string";
}

function findFieldControl(children: ReactNode): ReactElement<FieldControl> | undefined {
  let control: ReactElement<FieldControl> | undefined;
  Children.forEach(children, (child) => {
    if (control || !isValidElement<FieldControl>(child)) return;
    if (child.type === "input" && child.props.type === "hidden") return;
    if (hasOwnFeedback(child.type) || isNativeControl(child.type) || child.type === FormCheckbox) {
      control = child;
    } else if (canInspectChildren(child.type)) {
      control = findFieldControl(child.props.children);
    } else if (child.props.id) {
      // Specialized controls with an explicit ID own their input but can forward standard ARIA.
      control = child;
    }
  });
  return control;
}

function describeFieldControl(
  children: ReactNode,
  control: ReactElement<FieldControl>,
  props: FieldControl,
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<FieldControl>(child)) return child;
    if (child === control) return cloneElement(child, props);
    if (!canInspectChildren(child.type) || child.props.children == null) return child;
    return cloneElement(child, {}, describeFieldControl(child.props.children, control, props));
  });
}

type FormFieldProps = {
  id?: string;
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
};
export function FormField({
  id: providedId,
  label,
  children,
  error,
  hint,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const control = findFieldControl(children);
  const id = control?.props.id ?? providedId ?? generatedId;
  const feedbackInWrapper = !control || !hasOwnFeedback(control.type);
  const content =
    control && feedbackInWrapper && control.type !== FormCheckbox
      ? describeFieldControl(children, control, {
          id,
          "aria-invalid": control.props["aria-invalid"] ?? (error ? true : undefined),
          "aria-describedby": describedBy(
            control.props["aria-describedby"],
            feedbackIds(id, error, hint),
          ),
        })
      : children;
  return (
    <FieldContext.Provider value={{ id, error, hint, feedbackInWrapper }}>
      <Input.Wrapper
        id={id}
        label={control?.props.label ? undefined : label}
        className={className}
        error={feedbackInWrapper ? error : undefined}
        description={feedbackInWrapper ? hint : undefined}
      >
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
  const { aria, id, error } = useFieldProps(props);
  return (
    <Checkbox
      {...props}
      {...aria}
      id={id}
      error={Boolean(error)}
      label={label}
      className={className}
    />
  );
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
type LegacyStatusColor = "green" | "yellow" | "orange" | "red" | "blue" | "gray";
const statusColors: Record<StatusDomain, Record<string, LegacyStatusColor>> = {
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
  const colors = domain ? statusColors[domain] : undefined;
  const domainColor = colors && Object.hasOwn(colors, status) ? colors[status] : undefined;
  return (
    <Badge
      color={color ?? domainColor ?? "gray"}
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
