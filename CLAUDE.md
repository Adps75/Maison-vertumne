# Projet : Maison Vertumne, plateforme d'une entreprise de paysage (Île-de-France)

## Activité
Aménagement de jardins, terrasses et espaces extérieurs de A à Z, pour des maisons
individuelles. Promesse : des jardins à l'esthétique soignée, faits pour durer,
adaptés à leur sol et leur climat, livrés à la date promise.

## Parcours client
Page de vente → estimation en ligne (adresse, parcelle cadastrale, photos positionnées,
description, qualification) → fourchette budgétaire automatique + pré-diagnostic IA
en PDF → tri des leads (A/B/C/D) → rappel ou diagnostic payant (190 €)
→ conception (900 à 2 500 €, déductible) → réalisation sur devis.

## Architecture
Une seule application Next.js, une seule base Supabase, en route groups :
- (site) : site général et SEO local
- (vente) : pages de vente générées depuis la table landing_pages
- (estimation) : outil d'estimation
- (admin) : pilotage, protégé par Supabase Auth

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
- RGPD : consentement explicite, données minimales, durée de conservation définie.
- Chaque lead garde sa source (utm_source, utm_medium, utm_campaign, utm_content,
  page d'arrivée).
- Facturation : jamais codée en interne, synchronisée avec un logiciel conforme via API.
- Publicité : gérée dans Google Ads et Meta ; l'application remonte uniquement
  les conversions réelles.

## Méthode de travail
- Toujours proposer un plan avant de coder, et attendre ma validation.
- Une phase = une branche git + un commit final.
- Ordre de construction : acquisition → mesure → site → pages de vente → devis
  → planning → agents IA.
- L'utilisateur travaille sur un Mac Intel, uniquement dans le terminal : donner des
  commandes simples, une à la fois, et expliquer ce qu'elles font.
