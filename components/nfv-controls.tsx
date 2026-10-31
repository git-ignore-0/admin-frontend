import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "plain" | "danger";
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
    variant === "outline"
      ? "btn-outline"
      : variant === "plain"
        ? "btn-plain"
        : variant === "danger"
          ? "btn-danger"
          : "",
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
  dashboard: (
    <>
      <rect height="7" rx="1" width="7" x="3" y="3" />
      <rect height="7" rx="1" width="7" x="14" y="3" />
      <rect height="7" rx="1" width="7" x="3" y="14" />
      <rect height="7" rx="1" width="7" x="14" y="14" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  points: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 12 7 21l5-3 5 3-1.5-9" />
    </>
  ),
  csa: (
    <>
      <path d="M12 21V8" />
      <path d="M12 13C7 13 4 10 4 5c5 0 8 3 8 8ZM12 10c4 0 7-2 8-6-4 0-7 2-8 6Z" />
    </>
  ),
  store: (
    <>
      <path d="m3 9 1-5h16l1 5" />
      <path d="M5 13v8h14v-8M9 21v-6h6v6" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </>
  ),
  farms: (
    <>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M7 21v-8h10v8M7 17h10" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panelLeft: (
    <>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M9 3v18M15 9l-3 3 3 3" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  logout: <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" className="ico" fill="none" viewBox="0 0 24 24">
      {iconPaths[name]}
    </svg>
  );
}

export function Status({ status, label }: { status: string; label: string }) {
  const tone =
    status === "draft" || status === "upcoming"
      ? "p2"
      : status === "archived" ||
          status === "expired" ||
          status === "cancelled" ||
          status === "inactive"
        ? "neutral"
        : "";
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
