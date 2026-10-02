import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifierLienDiagnostic } from "@/lib/lien-signe";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Réserver un diagnostic — Atelier des Prés",
};

export default async function PageDiagnostic({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { l, e, s } = params;

  if (!l || !e || !s) notFound();

  const leadId = verifierLienDiagnostic(l, e, s);
  if (!leadId) notFound();

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("prenom")
    .eq("id", leadId)
    .single();

  const prenom = (lead?.prenom as string) ?? "";

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
      <h1 className="font-serif font-medium text-[clamp(2rem,5vw,3rem)] text-green-950">
        {prenom ? `${prenom}, réservez` : "Réservez"} votre diagnostic
      </h1>
      <p className="mt-4 text-[1.05rem] text-stone max-w-[40ch]">
        Réservation bientôt disponible. Nous vous préviendrons par email dès
        que le paiement en ligne sera activé.
      </p>
    </main>
  );
}
