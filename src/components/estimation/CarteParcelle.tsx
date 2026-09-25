"use client";

import dynamic from "next/dynamic";
import type { ParcelleInfo, TypeLieu } from "@/lib/types/estimation";

interface Props {
  mode: TypeLieu;
  centre: { lat: number; lon: number };
  parcelle: ParcelleInfo | null;
  onClicCarte: (lat: number, lon: number) => void;
}

const CarteParcelleClient = dynamic(
  () => import("./CarteParcelleClient").then((m) => m.CarteParcelleClient),
  { ssr: false, loading: () => <div className="h-[400px] bg-paper-2 rounded animate-pulse" /> },
);

export function CarteParcelle(props: Props) {
  return <CarteParcelleClient {...props} />;
}
