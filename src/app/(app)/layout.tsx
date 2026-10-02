import { exigerAdmin } from "@/lib/auth/admin";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerAdmin("page");

  return <>{children}</>;
}
