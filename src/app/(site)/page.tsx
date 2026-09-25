import type { Metadata } from "next";
import { accueil } from "@/content/pages/accueil";
import { SectionAccueil } from "@/components/vente/SectionAccueil";
import { SectionPourQui } from "@/components/vente/SectionPourQui";
import { SectionServices } from "@/components/vente/SectionServices";
import { SectionProcessus } from "@/components/vente/SectionProcessus";
import { SectionEngagements } from "@/components/vente/SectionEngagements";
import { SectionRealisations } from "@/components/vente/SectionRealisations";
import { SectionFondateur } from "@/components/vente/SectionFondateur";
import { SectionAvis } from "@/components/vente/SectionAvis";
import { SectionFaq } from "@/components/vente/SectionFaq";
import { SectionAppelFinal } from "@/components/vente/SectionAppelFinal";

export const metadata: Metadata = {
  title: accueil.seo.titre,
  description: accueil.seo.description,
  openGraph: {
    title: accueil.seo.titre,
    description: accueil.seo.description,
    locale: "fr_FR",
    type: "website",
  },
};

export default function PageAccueil() {
  return (
    <main>
      <SectionAccueil {...accueil.hero} />
      <SectionPourQui {...accueil.pourQui} />
      <SectionServices {...accueil.services} />
      <SectionProcessus {...accueil.processus} />
      <SectionEngagements {...accueil.engagements} />
      <SectionRealisations {...accueil.realisations} />
      <SectionFondateur {...accueil.fondateur} />
      <SectionAvis {...accueil.avis} />
      <SectionFaq {...accueil.faq} />
      <SectionAppelFinal {...accueil.appelFinal} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LandscapingBusiness",
            name: "Atelier des Prés",
            description: accueil.seo.description,
            areaServed: [
              {
                "@type": "City",
                name: "Le Plessis-Robinson",
              },
              {
                "@type": "AdministrativeArea",
                name: "Hauts-de-Seine",
              },
              {
                "@type": "AdministrativeArea",
                name: "Essonne",
              },
            ],
            knowsLanguage: "fr",
          }),
        }}
      />
    </main>
  );
}
