import type { Metadata } from "next";
import { PageConceptionClient } from "./PageConceptionClient";

export const metadata: Metadata = {
  title: "Projets — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default function PageConception() {
  return <PageConceptionClient />;
}
