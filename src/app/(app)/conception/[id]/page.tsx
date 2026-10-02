import type { Metadata } from "next";
import { PageProjetClient } from "./PageProjetClient";

export const metadata: Metadata = {
  title: "Conception — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default function PageProjet() {
  return <PageProjetClient />;
}
