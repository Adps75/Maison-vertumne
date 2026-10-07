import type { Metadata } from "next";
import { exigerAdmin } from "@/lib/auth/admin";
import { Page3DClient } from "@/modules/conception/scene3d/composants/Page3DClient";

export const metadata: Metadata = {
  title: "Vue 3D — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default async function Page3D() {
  await exigerAdmin("page");
  return <Page3DClient />;
}
