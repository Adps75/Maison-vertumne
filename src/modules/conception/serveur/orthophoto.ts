import "server-only";

const WMS_URL = "https://data.geopf.fr/wms-r";
const MAX_PX = 4096;
const RESOLUTION = 0.1; // mètres par pixel

/**
 * Récupère l'orthophoto en EPSG:2154 sur une emprise donnée.
 * Assemble plusieurs tuiles si l'emprise dépasse 4096 px.
 * Renvoie le buffer JPEG et l'emprise exacte en mètres relatifs.
 */
export async function recupererOrthophoto(
  empriseL93: { xMin: number; yMin: number; xMax: number; yMax: number },
  marge: number,
): Promise<{
  buffer: Buffer;
  emprise: { xMin: number; yMin: number; xMax: number; yMax: number };
  largeurPx: number;
  hauteurPx: number;
}> {
  const xMin = empriseL93.xMin - marge;
  const yMin = empriseL93.yMin - marge;
  const xMax = empriseL93.xMax + marge;
  const yMax = empriseL93.yMax + marge;

  const largeurM = xMax - xMin;
  const hauteurM = yMax - yMin;

  let largeurPx = Math.ceil(largeurM / RESOLUTION);
  let hauteurPx = Math.ceil(hauteurM / RESOLUTION);

  // Si ça tient en une seule requête
  if (largeurPx <= MAX_PX && hauteurPx <= MAX_PX) {
    const buffer = await requeteWms(xMin, yMin, xMax, yMax, largeurPx, hauteurPx);
    return {
      buffer,
      emprise: { xMin, yMin, xMax, yMax },
      largeurPx,
      hauteurPx,
    };
  }

  // Sinon, assembler avec sharp
  const { default: sharp } = await import("sharp");

  const nCols = Math.ceil(largeurPx / MAX_PX);
  const nRows = Math.ceil(hauteurPx / MAX_PX);

  // Recalculer les dimensions exactes
  largeurPx = nCols * MAX_PX;
  hauteurPx = nRows * MAX_PX;

  const tuileLargeurM = largeurM / nCols;
  const tuileHauteurM = hauteurM / nRows;

  const composite: { input: Buffer; left: number; top: number }[] = [];

  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      const tXMin = xMin + col * tuileLargeurM;
      const tYMax = yMax - row * tuileHauteurM; // WMS : y du haut vers le bas
      const tXMax = tXMin + tuileLargeurM;
      const tYMin = tYMax - tuileHauteurM;

      const buf = await requeteWms(tXMin, tYMin, tXMax, tYMax, MAX_PX, MAX_PX);
      composite.push({
        input: buf,
        left: col * MAX_PX,
        top: row * MAX_PX,
      });
    }
  }

  const assemblee = await sharp({
    create: {
      width: largeurPx,
      height: hauteurPx,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composite)
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    buffer: assemblee,
    emprise: { xMin, yMin, xMax, yMax },
    largeurPx,
    hauteurPx,
  };
}

async function requeteWms(
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: "ORTHOIMAGERY.ORTHOPHOTOS",
    STYLES: "",
    CRS: "EPSG:2154",
    BBOX: `${xMin},${yMin},${xMax},${yMax}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/jpeg",
  });

  const res = await fetch(`${WMS_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`WMS orthophoto erreur ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
