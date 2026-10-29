import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

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
