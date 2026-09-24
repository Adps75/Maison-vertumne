const PARAMS_UTM = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

export interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  page_arrivee: string;
}

export function extraireUtm(url: URL): UtmData | null {
  const params: Partial<Record<(typeof PARAMS_UTM)[number], string>> = {};
  let auMoinsUn = false;

  for (const clef of PARAMS_UTM) {
    const valeur = url.searchParams.get(clef);
    if (valeur) {
      params[clef] = valeur;
      auMoinsUn = true;
    }
  }

  if (!auMoinsUn) return null;

  return {
    ...params,
    page_arrivee: url.pathname,
  };
}
