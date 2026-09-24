import { Header } from "@/components/vente/Header";
import { Footer } from "@/components/vente/Footer";

export default function VenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
