# Module « Conception » — Atelier des Prés

## Objectif
Outil de conception paysagère intégré à la plateforme Atelier des Prés, inspiré de SketchUp mais spécialisé paysage. Il permet de passer de la vue aérienne au plan, puis à la 3D, puis à des rendus de présentation client en plusieurs vues cohérentes. Principe clé : Adrien conçoit librement ; l'IA ne sert qu'à générer les végétaux et à finaliser les rendus. La 3D n'a pas besoin d'être belle, seulement juste (volumes, positions, hauteurs), car le rendu final est fait par l'IA.

## Process utilisateur
1. Import de la vue aérienne avec la limite cadastrale ; tracé du jardin et de la maison (manuel, ou automatique à valider).
2. Plan : marquage des végétaux existants conservés, ajout des végétaux et matériaux avec des outils de tracé type AutoCAD et une bibliothèque en vue plan.
3. Génération automatique de la 3D à partir du plan, puis calage des photos de points de vue prises au diagnostic.
4. Choix du style de rendu (réaliste, dessin, aquarelle…), généré pour chaque vue.

## Modules et solutions techniques
- Parcelle : orthophoto IGN (Géoplateforme), contour via l'API Carto Cadastre, bâtiments + hauteurs via la BD TOPO (WFS). Données IGN en licence ouverte. Coordonnées en Lambert 93 (EPSG:2154, proj4) pour travailler en mètres.
- Détection auto : maison via BD TOPO ; arbres existants via segmentation IA sur l'orthophoto, validés à la main.
- Éditeur de plan 2D : Konva.js + Turf.js (polygones, arcs, accrochage, cotes, surfaces) ; quantités automatiques vers le devis.
- Bibliothèque végétale IA : génération sur fond blanc (vue de face + vue de dessus), détourage auto, fiche plante (nom latin, hauteur à 3 ans, largeur, prix). Style graphique fixe pour une signature cohérente.
- 3D : Three.js / React Three Fiber ; extrusion des surfaces ; plantes en billboards à leur hauteur réelle.
- Calage photo (partie la plus difficile) : l'utilisateur clique 4 points au sol sur la photo et les mêmes 4 sur le plan ; OpenCV.js solvePnP calcule la position de la caméra (focale lue dans l'EXIF).
- Rendu IA : export de la vue + carte de profondeur + contours → modèle avec ControlNet (géométrie verrouillée) via l'API fal ; styles enregistrés en presets (prompt + image de référence) pour la cohérence entre les vues.

## Modèle de données
- conception_projets { lead_id/client_id, parcelle_geojson, ortho_url, échelle }
- conception_elements { type (sol|minéral|végétal|bâti), géométrie, materiau_id|plante_id, hauteur, statut (existant|conservé|nouveau) }
- plantes { nom_latin, hauteur_3ans, largeur, png_face, png_dessus, prix }
- conception_points_de_vue { photo_url, points_calage[4], pose_camera }
- conception_rendus { point_de_vue_id, style, image_url }

## Intégration dans la plateforme existante
- Même projet, module isolé : modules/conception + app/(app)/conception, séparé du site public (site).
- Librairies lourdes (Konva, Three.js, OpenCV.js) en import dynamique, uniquement dans le module, pour ne pas ralentir les pages publiques (SEO et coût par clic).
- Base de données partagée : tables préfixées conception_, reliées aux leads et clients existants.
- Un lead de l'estimateur s'ouvre en un clic dans le module, avec son adresse et ses photos.
- Module détachable : aucune dépendance au site marketing, pour pouvoir le vendre plus tard en SaaS à d'autres paysagistes.

## Feuille de route (avec validations)
1. Parcelle : adresse → orthophoto + cadastre + maison BD TOPO à l'échelle. Validation : une distance mesurée correspond à Géoportail.
2. Éditeur de plan + bibliothèque + quantités. Validation : un ancien projet redessiné plus vite que sur AutoCAD.
3. Génération de plantes IA. Validation : 10 plantes dans un style cohérent.
4. 3D automatique. Validation : hauteurs justes par rapport à la maison.
5. Calage photo par 4 points. Validation : le bloc maison se superpose à la photo.
6. Rendu IA multi-styles. Validation : 3 vues cohérentes d'un même projet.
Priorité si arbitrage : étapes 1 à 3, qui font gagner du temps sur chaque conception même sans la 3D.

## Points de vigilance
- Ne pas bloquer les premières ventes en attendant l'outil : présenter les premiers projets avec SketchUp ou des collages si besoin, et tester le module sur de vrais projets.
- Visuels marqués « visuel d'ambiance non contractuel, végétaux à 2-3 ans ».

## Décisions
- Stack : la plateforme est en Next.js. Le module est intégré au même projet et à la même base Supabase (src/modules/conception et src/app/(app)/conception).
- Pas de MapLibre : l'orthophoto est demandée en WMS directement en Lambert 93 (EPSG:2154), calée sur son emprise en mètres. Konva sert à la fois de fond de plan et d'éditeur, dans un seul repère en mètres (1 unité = 1 m).
- Le module est un outil interne : accès réservé aux administrateurs connectés (Supabase Auth).
