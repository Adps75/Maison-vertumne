# Module « Conception » — Atelier des Prés

## Objectif
Outil de conception paysagère intégré à la plateforme Atelier des Prés, inspiré de SketchUp mais spécialisé paysage. Il permet de passer de la vue aérienne au plan, puis à la 3D, puis à des rendus de présentation client en plusieurs vues cohérentes. Principe clé : Adrien conçoit librement ; l'IA ne sert qu'à générer les végétaux et à finaliser les rendus. La 3D n'a pas besoin d'être belle, seulement juste (volumes, positions, hauteurs), car le rendu final est fait par l'IA.

## Process utilisateur — 6 étapes
1. **Adresse, vue aérienne** : adresse → parcelle cadastrale, orthophoto IGN, bâtiments BD TOPO à l'échelle. *(fait)*
2. **Zones de travail** : une ou plusieurs zones nommées par projet. Chaque zone délimite une partie du jardin (terrasse, massif, allée…). Un bouton « Tout le jardin » crée une zone sur l'emprise de la parcelle. Les zones servent de cadrage pour la 3D et les rendus. *(fait)*
3. **Calques, sous-calques et matériaux** : chaque matériau a une texture plan, une texture 3D, une description pour l'IA, et une épaisseur/hauteur pour la 3D.
4. **Végétaux** : bibliothèque végétale IA (génération vue de face + de dessus) et placement à l'échelle sur le plan. *(fait)*
5. **Photos, calage, visuel 3D** : chaque photo est rattachée à une zone ; calage par 4 points ; génération de la 3D automatique.
6. **Rendus** : vues photo améliorées par l'IA (styles configurables), et rendu du plan.

Navigation libre entre les étapes construites ; les étapes non construites sont visibles mais désactivées. Une coche indique les étapes qui contiennent déjà des données.

## Modules et solutions techniques
- Parcelle : orthophoto IGN (Géoplateforme), contour via l'API Carto Cadastre, bâtiments + hauteurs via la BD TOPO (WFS). Données IGN en licence ouverte. Coordonnées en Lambert 93 (EPSG:2154, proj4) pour travailler en mètres.
- Détection auto : maison via BD TOPO ; arbres existants via segmentation IA sur l'orthophoto, validés à la main.
- Éditeur de plan 2D : Konva.js + fonctions géométriques planes (plan.ts) + polygon-clipping pour les opérations booléennes ; quantités automatiques vers le devis. Pas de Turf.js (coordonnées en mètres sur un plan, pas en lon/lat).
- Bibliothèque végétale IA : génération sur fond blanc (vue de face + vue de dessus), détourage auto, fiche plante (nom latin, hauteur à 3 ans, largeur, prix). Style graphique fixe pour une signature cohérente.
- 3D : Three.js / React Three Fiber ; extrusion des surfaces ; plantes en billboards à leur hauteur réelle.
- Calage photo (partie la plus difficile) : l'utilisateur clique 4 points au sol sur la photo et les mêmes 4 sur le plan ; OpenCV.js solvePnP calcule la position de la caméra (focale lue dans l'EXIF).
- Rendu IA : export de la vue + carte de profondeur + contours → modèle avec ControlNet (géométrie verrouillée) via l'API fal ; styles enregistrés en presets (prompt + image de référence) pour la cohérence entre les vues.

## Modèle de données
- conception_projets { lead_id/client_id, parcelle_geojson, ortho_url, échelle }
- conception_elements { type (sol|minéral|végétal|bâti|limite|cote|annotation|**zone**), géométrie, materiau_id|plante_id, hauteur, statut, calque, propriétés }
  - Les **zones** sont des éléments de type `zone` sur le calque système `zones` (non supprimable, exclu des rendus). Propriétés : `nom`, `ordre`. Bénéficient de l'historique, de la sauvegarde différentielle, des poignées et de l'accrochage.
- plantes { nom_latin, hauteur_3ans, largeur, png_face, png_dessus, prix }
- conception_points_de_vue { photo_url, zone_id, points_calage[4], pose_camera }
- conception_rendus { point_de_vue_id, style, image_url }

## Intégration dans la plateforme existante
- Même projet, module isolé : modules/conception + app/(app)/conception, séparé du site public (site).
- Librairies lourdes (Konva, Three.js, OpenCV.js) en import dynamique, uniquement dans le module, pour ne pas ralentir les pages publiques (SEO et coût par clic).
- Base de données partagée : tables préfixées conception_, reliées aux leads et clients existants.
- Un lead de l'estimateur s'ouvre en un clic dans le module, avec son adresse et ses photos.
- Module détachable : aucune dépendance au site marketing, pour pouvoir le vendre plus tard en SaaS à d'autres paysagistes.

## Relief et topographie
- **Grille d'altitudes IGN** : à la création du projet, les altitudes du terrain sont récupérées via le service d'altimétrie de la Géoplateforme (`ign_lidar_hd_mnt_mono_wld`, 50 cm, repli `ign_rge_alti_wld` si nécessaire). Grille au pas de 1 m, stockée dans le bucket `conception` en JSON. Interpolation bilinéaire.
- **Altitude de référence (0,00)** : colonne `altitude_reference_ngf` sur `conception_projets`. Par défaut : altitude au point le plus proche du bâtiment principal. Modifiable via la commande REF (étape 3). Toutes les altitudes affichées sont relatives à cette référence.
- **Points cotés** : éléments de type `point_cote`, calque système `topographie`, visibles à toutes les étapes, modifiables uniquement à l'étape 3. Commande PC : clic + saisie altitude relative au clavier. Propriété `altitude_relative_m`.
- **Modèle de terrain** (`src/modules/conception/terrain/`) : fusionne la grille IGN et les écarts des points cotés par triangulation de Delaunay (librairie `delaunator`). Fondu linéaire hors enveloppe sur 5 m. Fonctions pures testées.
- **Courbes de niveau** : calculées par l'algorithme des carrés marchants (`d3-contour`), intervalle 25 cm, affichées en 2D aux étapes 3-4.
- **3D** : sol en maillage relief avec orthophoto drapée, végétaux et bâtiments posés à la bonne altitude, surfaces dessinées à hauteur moyenne + 2 cm.

## Points de vigilance
- Ne pas bloquer les premières ventes en attendant l'outil : présenter les premiers projets avec SketchUp ou des collages si besoin, et tester le module sur de vrais projets.
- Visuels marqués « visuel d'ambiance non contractuel, végétaux à 2-3 ans ».

## Décisions
- Stack : la plateforme est en Next.js. Le module est intégré au même projet et à la même base Supabase (src/modules/conception et src/app/(app)/conception).
- Pas de MapLibre : l'orthophoto est demandée en WMS directement en Lambert 93 (EPSG:2154), calée sur son emprise en mètres. Konva sert à la fois de fond de plan et d'éditeur, dans un seul repère en mètres (1 unité = 1 m).
- Le module est un outil interne : accès réservé aux administrateurs connectés (Supabase Auth).
- Les zones sont stockées comme des éléments ordinaires (type `zone`, calque `zones`), pas dans une table séparée. Elles bénéficient ainsi de l'historique (Cmd+Z), de la sauvegarde différentielle, des poignées et de l'accrochage, sans code supplémentaire.
