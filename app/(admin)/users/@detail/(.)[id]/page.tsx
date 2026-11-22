import { UserDetail } from "@/components/user-detail";

export default async function InterceptedUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserDetail userId={id} intercepted />;
}
