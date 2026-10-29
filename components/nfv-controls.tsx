import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "plain";
  small?: boolean;
  loading?: boolean;
};

function buttonClasses(
  variant: NonNullable<ButtonProps["variant"]>,
  small: boolean,
  loading: boolean,
  className: string,
) {
  return [
    "btn",
    "nfv-button",
    variant === "outline" ? "btn-outline" : variant === "plain" ? "btn-plain" : "",
    small ? "btn-small" : "",
    loading ? "is-loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  small = false,
  loading = false,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={loading}
      className={buttonClasses(variant, small, loading, className)}
      disabled={loading || props.disabled}
    >
      <span className="nfv-button-content">{children}</span>
      {loading && <span aria-hidden="true" className="nfv-button-spinner" />}
    </button>
  );
}

export function FormInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`nfv-control ${className}`.trim()} />;
}

type ActionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonProps["variant"];
  small?: boolean;
};

export function ActionLink({
  variant = "primary",
  small = false,
  children,
  className = "",
  ...props
}: ActionLinkProps) {
  return (
    <a {...props} className={buttonClasses(variant, small, false, className)}>
      <span className="nfv-button-content">{children}</span>
    </a>
  );
}

export function FormSelect({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`nfv-control ${className}`.trim()} />;
}

export function FormTextarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`nfv-control nfv-textarea ${className}`.trim()} />;
}

type FormFieldProps = {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
};

export function FormField({ label, children, error, hint, className = "" }: FormFieldProps) {
  return (
    <label className={`nfv-field ${className}`.trim()}>
      <span className="nfv-field-label">{label}</span>
      {children}
      {error ? <span className="nfv-field-error">{error}</span> : null}
      {!error && hint ? <span className="nfv-field-hint">{hint}</span> : null}
    </label>
  );
}

const iconPaths = {
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  edit: <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  trash: <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v5M14 11v5" />,
  copy: <path d="M8 8h11v11H8zM5 16H4V5h11v1" />,
  check: <path d="m5 12 4 4L19 6" />,
} as const;

export function Icon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg aria-hidden="true" className="ico" fill="none" viewBox="0 0 24 24">
      {iconPaths[name]}
    </svg>
  );
}

export function Status({ status, label }: { status: string; label: string }) {
  const tone = status === "draft" ? "p2" : status === "archived" ? "neutral" : "";
  return <span className={`status ${tone}`.trim()}>{label}</span>;
}

type TabsProps = {
  items: readonly { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
};

export function Tabs({ items, value, onChange, label, disabled = false }: TabsProps) {
  return (
    <div aria-label={label} className="selection-chips" role="group">
      {items.map((item) => (
        <button
          aria-pressed={item.value === value}
          className={`selection-chip ${item.value === value ? "active" : ""}`.trim()}
          disabled={disabled}
          key={item.value}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="selection-chip-count">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
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
    <div
      className={`nfv-data-state nfv-data-state-${kind} ${compact ? "is-compact" : ""}`.trim()}
      role={kind === "error" ? "alert" : "status"}
    >
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? (
        <Button onClick={action.onClick} small variant="outline">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, description, actions, children, className = "" }: SectionProps) {
  return (
    <section className={`acc-section ${className}`.trim()}>
      <div className="acc-heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="acc-heading-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
