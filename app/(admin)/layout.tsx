import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { readSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
