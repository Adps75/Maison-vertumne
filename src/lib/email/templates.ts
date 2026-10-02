const VERT = "#1B2E24";
const LAITON = "#9C7C3C";
const PAPER = "#F2F0E9";
const STONE = "#857C6E";

function layout(contenu: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:system-ui,sans-serif;color:${VERT}">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 24px">
<tr><td>
  <p style="font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:${LAITON};margin:0 0 24px">Atelier des Prés · Paysagiste</p>
  ${contenu}
  <p style="font-size:11px;color:${STONE};margin:32px 0 0;padding-top:16px;border-top:1px solid rgba(156,124,60,0.3)">
    Atelier des Prés · Le Plessis-Robinson et sud parisien<br>
    Ce message est confidentiel.
  </p>
</td></tr>
</table>
</body></html>`;
}

function bouton(texte: string, url: string): string {
  return `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 28px;background:${LAITON};color:${PAPER};text-decoration:none;border-radius:3px;font-weight:500;font-size:14px">${texte}</a></p>`;
}

export function emailClient(prenom: string, lienDiagnostic: string): { objet: string; html: string } {
  return {
    objet: "Votre pré-diagnostic — Atelier des Prés",
    html: layout(`
      <p style="font-size:22px;font-weight:500;margin:0 0 16px">${prenom}, votre pré-diagnostic est prêt.</p>
      <p style="font-size:15px;line-height:1.7;color:${VERT}">
        Vous trouverez en pièce jointe notre première analyse de votre extérieur :
        ce que nous observons, nos premières pistes d'aménagement et une estimation
        indicative de votre projet.
      </p>
      <p style="font-size:15px;line-height:1.7;color:${VERT}">
        Pour affiner cette première approche, nous vous proposons un diagnostic
        sur place : visite, analyse du sol et de l'exposition, esquisse et devis.
        190&nbsp;€, dont 50&nbsp;€ d'acompte à la réservation, déduit si vous poursuivez.
      </p>
      ${bouton("Réserver mon diagnostic", lienDiagnostic)}
      <p style="font-size:13px;color:${STONE}">À bientôt dans votre jardin.</p>
    `),
  };
}

export function emailRepli(prenom: string, min: number, max: number, lienDiagnostic: string): { objet: string; html: string } {
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  return {
    objet: "Votre estimation — Atelier des Prés",
    html: layout(`
      <p style="font-size:22px;font-weight:500;margin:0 0 16px">${prenom}, votre estimation est prête.</p>
      <p style="font-size:15px;line-height:1.7;color:${VERT}">
        D'après vos réponses, votre projet se situe dans une fourchette indicative
        de <strong>${fmt(min)}&nbsp;€ à ${fmt(max)}&nbsp;€ TTC</strong>.
      </p>
      <p style="font-size:15px;line-height:1.7;color:${VERT}">
        Pour affiner cette estimation, nous vous proposons un diagnostic sur place.
        190&nbsp;€, dont 50&nbsp;€ d'acompte, déduit si vous poursuivez.
      </p>
      ${bouton("Réserver mon diagnostic", lienDiagnostic)}
    `),
  };
}

interface AdminData {
  prenom: string;
  commune: string;
  fourchette: string;
  categorie: string;
  scoreTotal: number;
  scoreDetail: Record<string, number>;
  synthese: string;
  pointsVigilance: string[];
  questionsAppel: string[];
  email: string;
  telephone: string;
  lienFiche: string;
}

export function emailAdmin(data: AdminData): { objet: string; html: string } {
  const detailHtml = Object.entries(data.scoreDetail)
    .map(([k, v]) => `<li>${k} : ${v}</li>`)
    .join("");

  const vigilanceHtml = data.pointsVigilance.length > 0
    ? `<p style="font-weight:500;margin:12px 0 4px">Points de vigilance :</p><ul>${data.pointsVigilance.map((p) => `<li>${p}</li>`).join("")}</ul>`
    : "";

  const questionsHtml = data.questionsAppel.length > 0
    ? `<p style="font-weight:500;margin:12px 0 4px">Questions pour l'appel :</p><ol>${data.questionsAppel.map((q) => `<li>${q}</li>`).join("")}</ol>`
    : "";

  return {
    objet: `[${data.categorie}] Nouveau lead — ${data.prenom} — ${data.commune} — ${data.fourchette}`,
    html: layout(`
      <p style="font-size:18px;font-weight:500;margin:0 0 12px">[${data.categorie}] ${data.prenom} — ${data.commune}</p>
      <p>Score total : <strong>${data.scoreTotal}/100</strong></p>
      <ul style="font-size:13px">${detailHtml}</ul>
      <p style="font-weight:500;margin:12px 0 4px">Synthèse :</p>
      <p style="font-size:14px">${data.synthese}</p>
      ${vigilanceHtml}
      ${questionsHtml}
      <p style="margin:16px 0">
        <a href="tel:${data.telephone}" style="color:${LAITON}">${data.telephone}</a> ·
        <a href="mailto:${data.email}" style="color:${LAITON}">${data.email}</a>
      </p>
      <p><a href="${data.lienFiche}" style="color:${LAITON}">Voir la fiche complète</a></p>
    `),
  };
}

export function emailRappel(data: {
  prenom: string;
  commune: string;
  categorie: string;
  creneau: string;
  telephone: string;
  email: string;
  lienFiche: string;
}): { objet: string; html: string } {
  return {
    objet: `[${data.categorie}] Rappel demandé — ${data.prenom} — ${data.commune}`,
    html: layout(`
      <p style="font-size:18px;font-weight:500;margin:0 0 12px">[${data.categorie}] Rappel demandé — ${data.prenom}</p>
      <p>Créneau souhaité : <strong>${data.creneau}</strong></p>
      <p>
        <a href="tel:${data.telephone}" style="color:${LAITON}">${data.telephone}</a> ·
        <a href="mailto:${data.email}" style="color:${LAITON}">${data.email}</a>
      </p>
      <p><a href="${data.lienFiche}" style="color:${LAITON}">Voir la fiche complète</a></p>
    `),
  };
}
