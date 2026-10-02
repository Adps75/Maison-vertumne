import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormulaireConnexion } from "./FormulaireConnexion";

export const metadata: Metadata = {
  title: "Connexion — Atelier des Prés",
  robots: { index: false, follow: false },
};

export default async function PageConnexion() {
  // Rediriger si déjà connecté et admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (admin) redirect("/conception");
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-paper px-6 py-24">
      <div className="w-full max-w-sm">
        <h1 className="font-serif font-medium text-2xl text-green-950 text-center mb-8">
          Connexion
        </h1>
        <FormulaireConnexion />
      </div>
    </main>
  );
}
