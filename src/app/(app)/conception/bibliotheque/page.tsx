import type { Metadata } from "next";
import { BibliothequeClient } from "./BibliothequeClient";

export const metadata: Metadata = {
  title: "Bibliothèque végétale — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default function PageBibliotheque() {
  return <BibliothequeClient />;
}
