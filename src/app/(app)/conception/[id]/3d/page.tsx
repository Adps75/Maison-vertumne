import { redirect } from "next/navigation";
import { exigerAdmin } from "@/lib/auth/admin";

export default async function Page3D({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAdmin("page");
  const { id } = await params;
  redirect(`/conception/${id}?etape=5`);
}
