import type { Metadata } from "next";
import { ParcoursEstimation } from "@/components/estimation/ParcoursEstimation";

export const metadata: Metadata = {
  title: "Estimation en ligne — Atelier des Prés",
  description:
    "Estimez gratuitement votre projet d'aménagement extérieur en quelques minutes.",
};

export default function PageEstimation() {
  return <ParcoursEstimation />;
}
