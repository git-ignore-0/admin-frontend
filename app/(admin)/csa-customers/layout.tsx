import type { ReactNode } from "react";

export default function CSACustomersLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      {children}
      {detail}
    </>
  );
}
