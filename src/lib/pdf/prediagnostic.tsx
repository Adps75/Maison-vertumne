import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { enregistrerPolices } from "./fonts";
import type { Observations } from "@/lib/validation/analyse";

enregistrerPolices();

const VERT = "#1B2E24";
const LAITON = "#9C7C3C";
const PAPER = "#F2F0E9";
const STONE = "#857C6E";
const INK = "#1A271F";

const s = StyleSheet.create({
  page: { padding: 50, fontFamily: "Archivo", fontSize: 10, color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30, borderBottomWidth: 1, borderBottomColor: LAITON, paddingBottom: 14 },
  marque: { fontFamily: "Cormorant", fontSize: 16, fontWeight: 500, color: VERT },
  sousMarque: { fontSize: 7, letterSpacing: 3, textTransform: "uppercase", color: STONE, marginTop: 2 },
  client: { textAlign: "right", fontSize: 9, color: STONE },
  h2: { fontFamily: "Cormorant", fontSize: 18, fontWeight: 500, color: VERT, marginTop: 24, marginBottom: 8 },
  h3: { fontFamily: "Cormorant", fontStyle: "italic", fontSize: 13, color: LAITON, marginTop: 14, marginBottom: 4 },
  texte: { fontSize: 10, lineHeight: 1.6, color: INK, marginBottom: 6 },
  textePetit: { fontSize: 8, color: STONE, lineHeight: 1.5 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 10, fontSize: 10, color: LAITON },
  imageAerienne: { width: "100%", marginVertical: 10 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  photo: { width: "48%" },
  photoLabel: { fontSize: 7, color: STONE, marginTop: 2 },
  estimation: { backgroundColor: VERT, padding: 20, borderRadius: 3, marginVertical: 16 },
  estGrand: { fontFamily: "Cormorant", fontSize: 24, fontWeight: 500, color: PAPER },
  estFourchette: { fontSize: 11, color: "#BDC9B4", marginTop: 4 },
  estMention: { fontSize: 8, color: STONE, marginTop: 8 },
  prochaine: { backgroundColor: "#F8F7F3", padding: 16, borderRadius: 3, marginVertical: 12, borderWidth: 1, borderColor: "rgba(156,124,60,0.3)" },
  lien: { color: LAITON, textDecoration: "underline", fontSize: 10 },
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, borderTopWidth: 1, borderTopColor: "rgba(156,124,60,0.3)", paddingTop: 8, fontSize: 7, color: STONE, textAlign: "center" },
});

interface DonneesPdf {
  prenom: string;
  date: string;
  observations: Observations;
  fourchette_min: number;
  fourchette_max: number;
  aerienneUrl?: string;
  photosUrls: { ordre: number; url: string }[];
  lienDiagnostic: string;
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " €";
}

function Prediagnostic({ data }: { data: DonneesPdf }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.header}>
          <View>
            <Text style={s.marque}>Atelier des Prés</Text>
            <Text style={s.sousMarque}>Paysagiste</Text>
          </View>
          <View style={s.client}>
            <Text>Pré-diagnostic pour {data.prenom}</Text>
            <Text>{data.date}</Text>
          </View>
        </View>

        {/* Synthèse */}
        <Text style={s.h2}>Votre demande</Text>
        <Text style={s.texte}>{data.observations.synthese_demande}</Text>

        {/* Image aérienne */}
        {data.aerienneUrl && (
          <View>
            <Text style={s.h2}>Zone du projet</Text>
            <Image src={data.aerienneUrl} style={s.imageAerienne} />
          </View>
        )}

        {/* Photos */}
        {data.photosUrls.length > 0 && (
          <View>
            <Text style={s.h2}>Vos photos</Text>
            <View style={s.photoGrid}>
              {data.photosUrls.map((p) => (
                <View key={p.ordre} style={s.photo}>
                  <Image src={p.url} />
                  <Text style={s.photoLabel}>Photo n°{p.ordre}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Observations */}
        <Text style={s.h2}>Ce que nous observons</Text>

        <Text style={s.h3}>Existant</Text>
        {data.observations.existant.map((item, i) => (
          <View key={i} style={s.listItem}>
            <Text style={s.bullet}>•</Text>
            <Text style={s.texte}>{item}</Text>
          </View>
        ))}

        <Text style={s.h3}>État de la végétation</Text>
        <Text style={s.texte}>{data.observations.etat_vegetation}</Text>

        <Text style={s.h3}>Orientation</Text>
        <Text style={s.texte}>{data.observations.orientation_jardin}</Text>

        {data.observations.contraintes_visibles.length > 0 && (
          <View>
            <Text style={s.h3}>Points d'attention</Text>
            {data.observations.contraintes_visibles.map((item, i) => (
              <View key={i} style={s.listItem}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.texte}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pistes */}
        <Text style={s.h2}>Nos premières pistes</Text>
        {data.observations.pistes_amenagement.map((piste, i) => (
          <View key={i}>
            <Text style={s.h3}>{piste.titre}</Text>
            <Text style={s.texte}>{piste.description}</Text>
          </View>
        ))}

        {/* Estimation */}
        <View style={s.estimation}>
          <Text style={s.estGrand}>À partir de {fmt(data.fourchette_min)}</Text>
          <Text style={s.estFourchette}>
            Fourchette indicative : {fmt(data.fourchette_min)} à {fmt(data.fourchette_max)} TTC
          </Text>
          <Text style={s.estMention}>
            Estimation indicative établie à partir de vos réponses et des prix moyens constatés en Île-de-France. Elle sera affinée lors du diagnostic sur place.
          </Text>
        </View>

        {/* Prochaine étape */}
        <View style={s.prochaine}>
          <Text style={{ ...s.h3, marginTop: 0 }}>Prochaine étape : le diagnostic sur place</Text>
          <Text style={s.texte}>
            Visite, analyse du sol et de l'exposition, premières orientations, esquisse et devis. 190 €, acompte de 50 € à la réservation, déduit si vous poursuivez.
          </Text>
          <Text style={s.lien}>{data.lienDiagnostic}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>Atelier des Prés · Paysagiste · Le Plessis-Robinson et sud parisien</Text>
          <Text style={{ marginTop: 2 }}>Ce document est confidentiel et destiné uniquement à son destinataire.</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Génère le PDF du pré-diagnostic et renvoie le Buffer. */
export async function genererPdfPrediagnostic(
  data: DonneesPdf,
): Promise<Buffer> {
  const buffer = await renderToBuffer(<Prediagnostic data={data} />);
  return Buffer.from(buffer);
}

export type { DonneesPdf };
