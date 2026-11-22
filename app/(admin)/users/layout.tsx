import type { ReactNode } from "react";

export default function UsersLayout({
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
