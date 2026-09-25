import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AnalyseIA } from "@/lib/validation/analyse";

type R = Record<string, unknown>;

function val(obj: R, key: string): string {
  const v = obj[key];
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

export default async function PageDevLead({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { id } = await params;
  const supabase = await createClient();

  const { data: leadRaw } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (!leadRaw) notFound();
  const lead = leadRaw as R;

  type PhotoRow = {
    id: string; path: string; ordre: number;
    lat: number | null; lon: number | null;
    orientation_degres: number | null; legende: string | null;
  };

  const { data: photos } = await supabase
    .from("photos")
    .select("id, path, ordre, lat, lon, orientation_degres, legende")
    .eq("lead_id", id)
    .order("ordre");

  const photosList = (photos ?? []) as PhotoRow[];
  const photosAvecUrls = await Promise.all(
    photosList.map(async (p) => {
      const { data } = await supabase.storage
        .from("photos-jardins")
        .createSignedUrl(p.path, 3600);
      return { ...p, url: data?.signedUrl };
    }),
  );

  const { data: aerienneUrl } = await supabase.storage
    .from("documents-leads")
    .createSignedUrl(`leads/${id}/aerienne-annotee.jpg`, 3600);

  const analyse = lead.analyse_ia as AnalyseIA | null;
  const scoreDetail = (lead.analyse_ia as R | null)?.score_detail as R | undefined;

  const infos: [string, string][] = [
    ["Type", val(lead, "type_lieu")],
    ["Adresse", val(lead, "adresse_label")],
    ["Email", val(lead, "email")],
    ["Téléphone", val(lead, "telephone")],
    ["Budget", val(lead, "budget_declare")],
    ["Urgence", val(lead, "urgence")],
    ["Propriétaire", val(lead, "proprietaire")],
    ["Fourchette", `${val(lead, "fourchette_min")} – ${val(lead, "fourchette_max")} €`],
    ["Étape", val(lead, "etape_atteinte")],
    ["Statut analyse", val(lead, "analyse_statut")],
    ["Score total", val(lead, "score_total")],
    ["Fiabilité (score_chaleur)", val(lead, "score_chaleur")],
    ["Intérêt (score_valeur)", val(lead, "score_valeur")],
    ["Catégorie", val(lead, "categorie")],
  ];

  return (
    <div className="max-w-4xl mx-auto p-8 font-sans text-sm">
      <h1 className="text-2xl font-bold mb-6">
        Lead {id.slice(0, 8)}… — {val(lead, "prenom")} — {val(lead, "categorie")}
      </h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Informations</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {infos.map(([label, v]) => (
            <div key={label} className="contents">
              <dt className="text-gray-500">{label}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {lead.description ? (
          <div className="mt-3">
            <p className="text-gray-500">Description :</p>
            <p className="whitespace-pre-wrap">{String(lead.description)}</p>
          </div>
        ) : null}
        {lead.analyse_erreur ? (
          <p className="mt-2 text-red-600">Erreur : {String(lead.analyse_erreur)}</p>
        ) : null}
      </section>

      {aerienneUrl?.signedUrl && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Image aérienne annotée</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aerienneUrl.signedUrl} alt="Aérienne annotée" className="rounded max-w-full" />
        </section>
      )}

      {photosAvecUrls.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Photos ({photosAvecUrls.length})</h2>
          <div className="grid grid-cols-2 gap-3">
            {photosAvecUrls.map((p) => (
              <div key={p.id}>
                {p.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt={`Photo ${p.ordre}`} className="rounded" />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  #{p.ordre}
                  {p.legende ? ` — ${p.legende}` : ""}
                  {p.lat != null && p.lon != null ? ` — ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ""}
                  {p.orientation_degres != null ? ` — ${p.orientation_degres}°` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {analyse ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Observations (client)</h2>
          <p><strong>Synthèse :</strong> {analyse.observations.synthese_demande}</p>
          <p className="mt-2"><strong>État végétation :</strong> {analyse.observations.etat_vegetation}</p>
          <p><strong>Orientation :</strong> {analyse.observations.orientation_jardin}</p>
          <p><strong>Confiance :</strong> {analyse.observations.niveau_confiance}</p>
          <div className="mt-2">
            <strong>Existant :</strong>
            <ul className="list-disc ml-5">{analyse.observations.existant.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
          <div className="mt-2">
            <strong>Contraintes :</strong>
            <ul className="list-disc ml-5">{analyse.observations.contraintes_visibles.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
          <div className="mt-2">
            <strong>Pistes :</strong>
            {analyse.observations.pistes_amenagement.map((p, i) => (
              <div key={i} className="ml-4 mt-1"><em>{p.titre}</em> — {p.description}</div>
            ))}
          </div>
        </section>
      ) : null}

      {analyse ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Fiche interne (paysagiste)</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-gray-500">Périmètre réel</dt>
            <dd>{analyse.fiche_interne.perimetre_reel.valeur} ({analyse.fiche_interne.perimetre_reel.confiance})</dd>
            <dt className="text-gray-500">Cohérence estimation</dt>
            <dd>{analyse.fiche_interne.coherence_estimation.valeur} — {analyse.fiche_interne.coherence_estimation.explication}</dd>
            <dt className="text-gray-500">Accès</dt>
            <dd>{analyse.fiche_interne.acces.valeur} ({analyse.fiche_interne.acces.confiance}) — {analyse.fiche_interne.acces.indices}</dd>
            <dt className="text-gray-500">Gamme</dt>
            <dd>{analyse.fiche_interne.niveau_gamme_apparent}</dd>
          </dl>
          <div className="mt-2">
            <strong>Signaux d'intérêt :</strong>
            <ul className="list-disc ml-5">{analyse.fiche_interne.signaux_interet.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="mt-2">
            <strong>Points de vigilance :</strong>
            <ul className="list-disc ml-5">{analyse.fiche_interne.points_vigilance.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
          <div className="mt-2">
            <strong>Questions pour l'appel :</strong>
            <ol className="list-decimal ml-5">{analyse.fiche_interne.questions_appel.map((q, i) => <li key={i}>{q}</li>)}</ol>
          </div>
        </section>
      ) : null}

      {scoreDetail ? (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Détail du score</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(scoreDetail).map(([critere, points]) => (
              <div key={critere} className="contents">
                <dt className="text-gray-500">{critere}</dt>
                <dd className="font-mono">{String(points)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
