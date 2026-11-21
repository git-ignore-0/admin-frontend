import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { adminSessionBinding, readSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const { name, email, login_phone_number } = session.user;
  const sessionBinding = adminSessionBinding(session);
  return (
    <AdminShell
      key={sessionBinding}
      sessionBinding={sessionBinding}
      user={{ name, email, login_phone_number }}
    >
      {children}
    </AdminShell>
  );
}
