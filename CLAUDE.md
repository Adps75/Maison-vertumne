# Projet : Atelier des Prés, plateforme d'une entreprise de paysage (Île-de-France)

## Activité
Aménagement de jardins, terrasses et espaces extérieurs de A à Z, pour des maisons
individuelles. Promesse : des jardins à l'esthétique soignée, faits pour durer,
adaptés à leur sol et leur climat, livrés à la date promise.
Le nom est toujours associé au métier : Atelier des Prés · Paysagiste.

## Parcours client
Deux parcours d'estimation qui se rejoignent à partir des coordonnées :
- Parcours maison : adresse → parcelle cadastrale → photos positionnées sur le plan
  → description → qualification → fourchette budgétaire + pré-diagnostic IA en PDF.
- Parcours appartement : adresse (sans parcelle ni photos positionnées) → photos
  avec légende → description (type d'espace, surface, étage, accès, orientation,
  accord copro) → qualification → fourchette budgétaire (avec coefficient
  logistique : étage, accès) + pré-diagnostic IA en PDF.
Ensuite : tri des leads (A/B/C/D) → rappel ou diagnostic payant (190 €)
→ conception (900 à 2 500 €, déductible) → réalisation sur devis.

## Architecture
Une seule application Next.js, une seule base Supabase, en route groups :
- (site) : site général et SEO local
- (vente) : pages de vente générées depuis la table landing_pages
- (estimation) : outil d'estimation
- (admin) : pilotage, protégé par Supabase Auth

Page d'accueil (/) = référencement naturel, indexable, localisée.
Pages de vente (/p/[slug]) = une page par campagne publicitaire, noindex,
sans navigation, un seul appel à l'action, assemblées à partir des composants
de src/components/vente/. À construire au bloc 4.

## Stack
Next.js App Router, TypeScript strict, Tailwind, Supabase (Postgres, Storage, Auth),
Leaflet + Géoplateforme IGN, API Anthropic (vision), @react-pdf/renderer, Brevo,
Stripe, Cal.com, Vitest. Déploiement Vercel.

## Règles
- Interface 100 % en français, mobile d'abord.
- Aucun secret dans le code : tout passe par .env.local, documenté dans .env.example.
- Le modèle Anthropic est lu depuis la variable ANTHROPIC_MODEL.
- Logique métier (prix, score) dans des fonctions pures, testées avec Vitest.
- Réponses de l'IA validées avec Zod avant enregistrement.
- L'IA observe et signale ; le score et la catégorie sont calculés par des règles
  fixes, jamais par l'IA.
- RGPD : consentement explicite, données minimales, durée de conservation définie.
- Chaque lead garde sa source (utm_source, utm_medium, utm_campaign, utm_content,
  page d'arrivée).
- Facturation : jamais codée en interne, synchronisée avec un logiciel conforme via API.
- Publicité : gérée dans Google Ads et Meta ; l'application remonte uniquement
  les conversions réelles.
- Ne jamais lire, afficher ni modifier .env.local. Pour vérifier une configuration,
  demander à l'utilisateur.

## Pistes cartographiques
- Image aérienne envoyée à l'IA : utiliser la couche la plus récente disponible
  (vérifier la date de ORTHOIMAGERY.ORTHOPHOTOS sur la zone vs Ortho-Express 2024).
- Envoyer aussi l'image infrarouge (ORTHOIMAGERY.ORTHOPHOTOS.IRC) à l'IA pour
  évaluer l'état de la végétation.
- THR.ORTHOIMAGERY.ORTHOPHOTOS (5 cm, zoom 21) couvre Paris intra-muros : à
  utiliser plus tard pour les projets d'appartement à Paris, avec repli sur la
  couche standard.

## Module conception
Outil interne de conception paysagère. Cadrage complet : docs/module-conception.md.
- Code dans src/modules/conception et routes dans src/app/(app)/conception.
- Tables préfixées conception_ dans la base Supabase partagée.
- Librairies lourdes (Konva, Three.js, OpenCV.js) en import dynamique uniquement
  dans le module ; aucune dépendance au site public, pour pouvoir le détacher.
- Toutes les coordonnées de travail en Lambert 93 (EPSG:2154), en mètres.
- Chaque projet a une origine locale (coin sud-ouest de l'emprise, arrondi au mètre).
  Toutes les géométries du module sont stockées en mètres relatifs à cette origine.
  Les coordonnées Lambert 93 absolues ne servent qu'aux échanges avec l'IGN.
- Accès réservé aux administrateurs connectés (Supabase Auth + table admins).
- Chaque route API et server action du module appelle exigerAdmin()
  (src/lib/auth/admin.ts) en première ligne.
- Feuille de route en 6 étapes :
  1. Adresse, vue aérienne (fait)
  2. Zones de travail (fait)
  3. Calques, sous-calques et matériaux
  4. Végétaux — bibliothèque IA et placement (fait)
  5. Photos, calage, visuel 3D
  6. Rendus IA et rendu du plan
- Les zones sont des éléments ordinaires (type "zone", calque système "zones"),
  pas une table séparée. Elles bénéficient de l'historique, la sauvegarde
  différentielle, les poignées et l'accrochage sans code supplémentaire.
- Le calque "zones" est non supprimable et exclu des rendus.

## Méthode de travail
- Toujours proposer un plan avant de coder, et attendre ma validation.
- Une phase = une branche git + un commit final.
- Ordre de construction : acquisition → mesure → site → pages de vente → devis
  → planning → agents IA.
- L'utilisateur travaille sur un Mac Intel, uniquement dans le terminal : donner des
  commandes simples, une à la fois, et expliquer ce qu'elles font.
- Avant chaque proposition de commit : lancer npm test (Vitest) et npm run test:e2e
  (Playwright). Ne pas commiter si un test échoue.
