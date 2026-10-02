import { Font } from "@react-pdf/renderer";
import path from "path";

const fontsDir = path.join(process.cwd(), "src/lib/pdf/fonts");

export function enregistrerPolices() {
  Font.register({
    family: "Cormorant",
    fonts: [
      { src: path.join(fontsDir, "CormorantGaramond-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "CormorantGaramond-Medium.ttf"), fontWeight: 500 },
      { src: path.join(fontsDir, "CormorantGaramond-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
    ],
  });

  Font.register({
    family: "Archivo",
    fonts: [
      { src: path.join(fontsDir, "Archivo-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "Archivo-Medium.ttf"), fontWeight: 500 },
    ],
  });
}
