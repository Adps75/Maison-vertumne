"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Plante {
  id: string;
  nom_commun: string;
  nom_latin: string;
  categorie: string;
  forme: string | null;
  hauteur_adulte_m: number | null;
  largeur_adulte_m: number | null;
  face_url: string | null;
  dessus_url: string | null;
  statut: string;
  est_reference: boolean;
  cout_generation_total: number;
}

const CATEGORIES = [
  { code: "", label: "Toutes" },
  { code: "arbre", label: "Arbres" },
  { code: "arbuste", label: "Arbustes" },
  { code: "vivace", label: "Vivaces" },
  { code: "graminee", label: "Graminées" },
  { code: "couvre_sol", label: "Couvre-sol" },
  { code: "grimpante", label: "Grimpantes" },
];
const FORMES = ["boule", "colonne", "etalee", "retombante", "touffe", "tige"];

export function BibliothequeClient() {
  const [plantes, setPlantes] = useState<Plante[]>([]);
  const [categorie, setCategorie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState(true);

  const [modale, setModale] = useState(false);
  const [edition, setEdition] = useState<Plante | null>(null);
  const [form, setForm] = useState(formVide());
  const [enCours, setEnCours] = useState(false);
  const [generation, setGeneration] = useState<string | null>(null);
  const [doublon, setDoublon] = useState<{ id: string; nom_latin: string } | null>(null);
  const [iaEnCours, setIaEnCours] = useState(false);
  const [iaComplete, setIaComplete] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null);
  const [ficheOuverte, setFicheOuverte] = useState<Plante | null>(null);

  function formVide() {
    return {
      nom_commun: "", nom_latin: "", categorie: "arbuste", forme: "",
      feuillage: "", couleur_feuillage: "", couleur_floraison: "",
      periode_floraison: "", hauteur_adulte_m: "", largeur_adulte_m: "",
      notes: "", floraison_visible: false,
    };
  }

  const charger = useCallback(async () => {
    const params = new URLSearchParams();
    if (categorie) params.set("categorie", categorie);
    if (recherche) params.set("q", recherche);
    const res = await fetch(`/api/conception/plantes?${params}`);
    const data = await res.json();
    if (data.ok) setPlantes(data.plantes);
    setChargement(false);
  }, [categorie, recherche]);

  useEffect(() => { charger(); }, [charger]);

  const creer = async () => {
    setEnCours(true);
    setDoublon(null);
    const res = await fetch("/api/conception/plantes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hauteur_adulte_m: form.hauteur_adulte_m ? parseFloat(form.hauteur_adulte_m) : null,
        largeur_adulte_m: form.largeur_adulte_m ? parseFloat(form.largeur_adulte_m) : null,
      }),
    });
    const data = await res.json();
    setEnCours(false);
    if (data.doublon) { setDoublon(data.plante_existante); return; }
    if (data.ok) {
      setModale(false);
      setForm(formVide());
      charger();
      setGeneration(data.id);
      fetch(`/api/conception/plantes/${data.id}/generer`, { method: "POST" })
        .finally(() => { setGeneration(null); charger(); });
    }
  };

  const modifier = async () => {
    if (!edition) return;
    setEnCours(true);
    await fetch(`/api/conception/plantes/${edition.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hauteur_adulte_m: form.hauteur_adulte_m ? parseFloat(form.hauteur_adulte_m) : null,
        largeur_adulte_m: form.largeur_adulte_m ? parseFloat(form.largeur_adulte_m) : null,
      }),
    });
    setEnCours(false);
    setModale(false);
    setEdition(null);
    charger();
  };

  const supprimer = async (id: string) => {
    if (!confirm("Supprimer cette plante et ses images ?")) return;
    await fetch(`/api/conception/plantes/${id}`, { method: "DELETE" });
    charger();
  };

  const genererImages = async (id: string, type: string) => {
    if (type !== "symbole" && !confirm("Générer les images ? L'ancienne image sera remplacée.")) return;
    setGeneration(id);
    setMenuOuvert(null);
    await fetch(`/api/conception/plantes/${id}/${type}`, { method: "POST" });
    setGeneration(null);
    charger();
  };

  const toggleReference = async (id: string, actuel: boolean) => {
    await fetch(`/api/conception/plantes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ est_reference: !actuel }),
    });
    setMenuOuvert(null);
    charger();
  };

  const dupliquer = (p: Plante) => {
    setMenuOuvert(null);
    setEdition(null);
    setForm({
      ...formVide(),
      nom_latin: p.nom_latin + " ''",
      categorie: p.categorie,
      forme: p.forme ?? "",
      hauteur_adulte_m: p.hauteur_adulte_m?.toString() ?? "",
      largeur_adulte_m: p.largeur_adulte_m?.toString() ?? "",
    });
    setModale(true);
  };

  const ouvrir = (p: Plante) => {
    setEdition(p);
    setForm({
      nom_commun: p.nom_commun, nom_latin: p.nom_latin, categorie: p.categorie,
      forme: p.forme ?? "", feuillage: "", couleur_feuillage: "", couleur_floraison: "",
      periode_floraison: "", hauteur_adulte_m: p.hauteur_adulte_m?.toString() ?? "",
      largeur_adulte_m: p.largeur_adulte_m?.toString() ?? "", notes: "",
      floraison_visible: false,
    });
    setModale(true);
  };

  const completerIA = async () => {
    if (!form.nom_latin.trim()) return;
    setIaEnCours(true);
    try {
      const res = await fetch("/api/conception/plantes/fiche-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom_latin: form.nom_latin, forme: form.forme }),
      });
      const data = await res.json();
      if (data.ok && data.fiche) {
        setForm((f) => ({
          ...f,
          nom_commun: data.fiche.nom_commun ?? f.nom_commun,
          categorie: data.fiche.categorie ?? f.categorie,
          feuillage: data.fiche.feuillage ?? f.feuillage,
          couleur_feuillage: data.fiche.couleur_feuillage ?? f.couleur_feuillage,
          couleur_floraison: data.fiche.couleur_floraison ?? f.couleur_floraison,
          periode_floraison: data.fiche.periode_floraison ?? f.periode_floraison,
          hauteur_adulte_m: data.fiche.hauteur_adulte_m?.toString() ?? f.hauteur_adulte_m,
          largeur_adulte_m: data.fiche.largeur_adulte_m?.toString() ?? f.largeur_adulte_m,
          notes: data.fiche.notes ?? f.notes,
        }));
        setIaComplete(true);
      }
    } finally { setIaEnCours(false); }
  };

  const DAMIER = "repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 16px 16px";

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hair-light px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/conception" className="text-brass hover:text-brass-soft text-[0.82rem]">&larr;</Link>
          <h1 className="font-serif font-medium text-[1.3rem] text-green-950">Bibliothèque végétale</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setEdition(null); setForm(formVide()); setDoublon(null); setIaComplete(false); setModale(true); }}
            className="px-4 py-2 bg-brass text-paper text-[0.85rem] font-medium rounded hover:bg-brass-soft">
            Nouvelle plante
          </button>
          <form action="/api/auth/deconnexion" method="POST">
            <button type="submit" className="text-[0.78rem] text-stone hover:text-brass">Déconnexion</button>
          </form>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filtres */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((c) => (
            <button key={c.code} onClick={() => setCategorie(c.code)}
              className={`px-3 py-1.5 rounded-full text-[0.82rem] border ${categorie === c.code ? "bg-brass text-paper border-brass" : "bg-white text-ink border-hair-light hover:border-brass"}`}>
              {c.label}
            </button>
          ))}
          <input type="text" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…" className="px-3 py-1.5 border border-hair-light rounded text-[0.85rem] bg-white" />
        </div>

        {/* Grille */}
        {chargement ? <p className="text-stone">Chargement…</p> : plantes.length === 0 ? (
          <p className="text-stone text-center py-16">Aucune plante dans la bibliothèque.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {plantes.map((p) => (
              <div key={p.id} className="border border-hair-light rounded bg-white overflow-hidden cursor-pointer hover:border-brass transition-colors"
                onClick={() => setFicheOuverte(p)}>
                {/* Images face + dessus côte à côte */}
                <div className="flex h-[200px]" style={{ background: DAMIER }}>
                  <div className="flex-1 flex items-center justify-center p-2">
                    {p.face_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.face_url} alt="Face" className="max-h-full max-w-full object-contain" />
                    ) : generation === p.id ? (
                      <span className="text-stone text-[0.75rem]">⏳ Génération…</span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); genererImages(p.id, "generer-face"); }}
                        className="text-brass text-[0.75rem] hover:text-brass-soft">Générer face</button>
                    )}
                  </div>
                  <div className="w-px bg-hair-light" />
                  <div className="flex-1 flex items-center justify-center p-2">
                    {p.dessus_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.dessus_url} alt="Dessus" className="max-h-full max-w-full object-contain" />
                    ) : generation === p.id ? (
                      <span className="text-stone text-[0.75rem]">⏳ Génération…</span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); genererImages(p.id, "generer-dessus"); }}
                        className="text-brass text-[0.75rem] hover:text-brass-soft">Générer dessus</button>
                    )}
                  </div>
                </div>

                {/* Infos */}
                <div className="p-3">
                  <p className="font-medium text-[0.88rem] text-ink truncate">{p.nom_commun}</p>
                  <p className="text-[0.78rem] text-stone italic truncate">{p.nom_latin}</p>
                  <div className="flex items-center gap-3 mt-1 text-[0.72rem] text-stone">
                    {p.hauteur_adulte_m && <span>H {p.hauteur_adulte_m} m</span>}
                    {p.largeur_adulte_m && <span>L {p.largeur_adulte_m} m</span>}
                    {p.cout_generation_total > 0 && <span>{p.cout_generation_total.toFixed(3)} €</span>}
                    {p.est_reference && <span className="text-brass font-medium">★ Réf</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2 relative">
                    <button onClick={(e) => { e.stopPropagation(); ouvrir(p); }}
                      className="text-[0.75rem] text-brass hover:text-brass-soft">Modifier</button>
                    <button onClick={(e) => { e.stopPropagation(); setMenuOuvert(menuOuvert === p.id ? null : p.id); }}
                      className="text-[0.75rem] text-stone hover:text-brass ml-auto">⋯</button>

                    {menuOuvert === p.id && (
                      <div className="absolute right-0 top-6 z-20 bg-white border border-hair-light rounded shadow-lg py-1 w-40"
                        onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => genererImages(p.id, "generer")} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">Régénérer tout</button>
                        <button onClick={() => genererImages(p.id, "generer-face")} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">Régénérer face</button>
                        <button onClick={() => genererImages(p.id, "generer-dessus")} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">Régénérer dessus</button>
                        <button onClick={() => genererImages(p.id, "symbole")} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">Symbole simple</button>
                        <button onClick={() => toggleReference(p.id, p.est_reference)} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">
                          {p.est_reference ? "Retirer référence" : "Réf. de style"}
                        </button>
                        <button onClick={() => dupliquer(p)} className="block w-full text-left px-3 py-1.5 text-[0.78rem] hover:bg-paper-2">Créer variété</button>
                        <div className="border-t border-hair-light my-1" />
                        <button onClick={() => { setMenuOuvert(null); supprimer(p.id); }}
                          className="block w-full text-left px-3 py-1.5 text-[0.78rem] text-red-600 hover:bg-red-50">Supprimer</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fiche détaillée */}
      {ficheOuverte && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFicheOuverte(null)}>
          <div className="bg-paper rounded-lg p-6 w-full max-w-2xl shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-serif font-medium text-xl text-green-950">{ficheOuverte.nom_commun}</h2>
                <p className="text-stone italic">{ficheOuverte.nom_latin}</p>
              </div>
              <button onClick={() => setFicheOuverte(null)} className="text-stone hover:text-ink text-lg">×</button>
            </div>
            <div className="flex gap-4 h-[300px]" style={{ background: DAMIER }}>
              <div className="flex-1 flex items-center justify-center p-4">
                {ficheOuverte.face_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ficheOuverte.face_url} alt="Vue de face" className="max-h-full max-w-full object-contain" />
                ) : <span className="text-stone">Vue de face absente</span>}
              </div>
              <div className="flex-1 flex items-center justify-center p-4">
                {ficheOuverte.dessus_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ficheOuverte.dessus_url} alt="Vue de dessus" className="max-h-full max-w-full object-contain" />
                ) : <span className="text-stone">Vue de dessus absente</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-[0.85rem]">
              <div><span className="text-stone">Catégorie :</span> {ficheOuverte.categorie}</div>
              <div><span className="text-stone">Hauteur :</span> {ficheOuverte.hauteur_adulte_m ?? "—"} m</div>
              <div><span className="text-stone">Largeur :</span> {ficheOuverte.largeur_adulte_m ?? "—"} m</div>
              <div><span className="text-stone">Forme :</span> {ficheOuverte.forme ?? "—"}</div>
              <div><span className="text-stone">Coût :</span> {ficheOuverte.cout_generation_total.toFixed(3)} €</div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setFicheOuverte(null); ouvrir(ficheOuverte); }}
                className="px-4 py-2 text-[0.85rem] text-brass border border-brass rounded hover:bg-brass hover:text-paper transition-colors">
                Modifier
              </button>
              <button onClick={() => { setFicheOuverte(null); supprimer(ficheOuverte.id); }}
                className="px-4 py-2 text-[0.85rem] text-red-600 border border-red-200 rounded hover:bg-red-600 hover:text-white transition-colors">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale création/modification */}
      {modale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-paper rounded-lg p-6 w-full max-w-lg shadow-lg my-8">
            <h2 className="font-serif font-medium text-xl text-green-950 mb-4">
              {edition ? "Modifier la plante" : "Nouvelle plante"}
            </h2>

            {doublon && (
              <div className="mb-4 p-3 bg-paper-2 border border-brass rounded text-[0.88rem]">
                <p className="text-ink">Une plante avec ce nom latin existe déjà : <strong>{doublon.nom_latin}</strong></p>
                <button onClick={() => { setModale(false); setDoublon(null); }}
                  className="mt-2 text-brass text-[0.82rem] hover:text-brass-soft">Ouvrir la fiche existante</button>
              </div>
            )}

            <div className="space-y-3 text-[0.88rem]">
              {/* Nom latin + forme (saisis par l'utilisateur) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pl-nom-latin" className="block text-stone text-[0.78rem] mb-1">Nom latin *</label>
                  <input id="pl-nom-latin" value={form.nom_latin} onChange={(e) => { setForm({ ...form, nom_latin: e.target.value }); setIaComplete(false); }}
                    placeholder="Prunus serrulata 'Kanzan'" className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink italic" />
                </div>
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Forme</label>
                  <select value={form.forme} onChange={(e) => setForm({ ...form, forme: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink">
                    <option value="">—</option>
                    {FORMES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              {/* Compléter avec l'IA */}
              {!edition && (
                <button onClick={completerIA} disabled={!form.nom_latin.trim() || iaEnCours}
                  className="w-full px-4 py-2 border border-brass text-brass font-medium rounded hover:bg-brass hover:text-paper transition-colors disabled:opacity-40">
                  {iaEnCours ? "Recherche en cours…" : iaComplete ? "✓ Fiche complétée — vérifier et créer" : "Compléter avec l'IA"}
                </button>
              )}

              {/* Champs pré-remplis */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pl-nom-commun" className="block text-stone text-[0.78rem] mb-1">Nom commun</label>
                  <input id="pl-nom-commun" value={form.nom_commun} onChange={(e) => setForm({ ...form, nom_commun: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
                </div>
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Catégorie</label>
                  <select value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink">
                    {CATEGORIES.filter((c) => c.code).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Feuillage</label>
                  <select value={form.feuillage} onChange={(e) => setForm({ ...form, feuillage: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink">
                    <option value="">—</option>
                    <option value="persistant">Persistant</option>
                    <option value="caduc">Caduc</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-[0.82rem] text-ink cursor-pointer">
                    <input type="checkbox" checked={form.floraison_visible}
                      onChange={(e) => setForm({ ...form, floraison_visible: e.target.checked })} />
                    Floraison visible
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Hauteur adulte (m)</label>
                  <input type="number" step="0.1" value={form.hauteur_adulte_m}
                    onChange={(e) => setForm({ ...form, hauteur_adulte_m: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
                </div>
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Largeur adulte (m)</label>
                  <input type="number" step="0.1" value={form.largeur_adulte_m}
                    onChange={(e) => setForm({ ...form, largeur_adulte_m: e.target.value })}
                    className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Couleur feuillage</label>
                  <input value={form.couleur_feuillage} onChange={(e) => setForm({ ...form, couleur_feuillage: e.target.value })}
                    placeholder="vert foncé" className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
                </div>
                <div>
                  <label className="block text-stone text-[0.78rem] mb-1">Couleur floraison</label>
                  <input value={form.couleur_floraison} onChange={(e) => setForm({ ...form, couleur_floraison: e.target.value })}
                    placeholder="blanc" className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
                </div>
              </div>
              <div>
                <label className="block text-stone text-[0.78rem] mb-1">Période de floraison</label>
                <input value={form.periode_floraison} onChange={(e) => setForm({ ...form, periode_floraison: e.target.value })}
                  placeholder="mai-juin" className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink" />
              </div>
              <div>
                <label className="block text-stone text-[0.78rem] mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                  className="w-full px-2 py-1.5 border border-hair-light rounded bg-white text-ink resize-y" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setModale(false); setEdition(null); setDoublon(null); }}
                className="px-4 py-2 text-stone hover:text-ink">Annuler</button>
              <button onClick={edition ? modifier : creer} disabled={enCours || !form.nom_commun || !form.nom_latin}
                className="px-6 py-2 bg-brass text-paper font-medium rounded hover:bg-brass-soft disabled:opacity-40">
                {enCours ? "…" : edition ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fermer le menu au clic en dehors */}
      {menuOuvert && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOuvert(null)} />
      )}
    </div>
  );
}
