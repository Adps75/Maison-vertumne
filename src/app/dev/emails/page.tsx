import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PageDevEmails() {
  if (process.env.NODE_ENV !== "development") notFound();

  const supabase = await createClient();
  const { data: emails } = await supabase
    .from("emails_envoyes")
    .select("id, lead_id, type, destinataire, objet, html, statut, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans text-sm">
      <h1 className="text-2xl font-bold mb-6">Emails ({(emails ?? []).length})</h1>
      <div className="space-y-4">
        {(emails ?? []).map((e) => (
          <details key={String(e.id)} className="border border-gray-200 rounded p-4">
            <summary className="cursor-pointer">
              <span className="font-medium">{String(e.objet)}</span>
              <span className="text-gray-500 ml-2">→ {String(e.destinataire)}</span>
              <span className="text-gray-400 ml-2">{String(e.statut)}</span>
              <span className="text-gray-400 ml-2 text-xs">{String(e.created_at)}</span>
            </summary>
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-gray-500 mb-2">Lead : {String(e.lead_id)} · Type : {String(e.type)}</p>
              <iframe
                srcDoc={String(e.html ?? "")}
                className="w-full h-[500px] border rounded"
                title={String(e.objet)}
              />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
