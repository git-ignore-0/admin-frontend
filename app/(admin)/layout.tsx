import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { adminSessionBinding, readSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const { name, email, login_phone_number } = session.user;
  const sessionBinding = adminSessionBinding(session);
  const orderRecoveryScope = createHash("sha256")
    .update("nfv-admin-store-order-recovery:v1:")
    .update(session.user.id)
    .digest("hex");
  return (
    <AdminShell
      key={sessionBinding}
      sessionBinding={sessionBinding}
      orderRecoveryScope={orderRecoveryScope}
      user={{ name, email, login_phone_number }}
    >
      {children}
    </AdminShell>
  );
}
