import type { Metadata } from "next";
import { ParcoursEstimation } from "@/components/estimation/ParcoursEstimation";

export const metadata: Metadata = {
  title: "Estimation en ligne — Maison Vertumne",
  description:
    "Estimez gratuitement votre projet d'aménagement extérieur en quelques minutes.",
};

export default function PageEstimation() {
  return <ParcoursEstimation />;
}
