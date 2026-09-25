import type { Completeness, TravelBrief } from "../../shared/brief";
import type { Contact } from "../../shared/contact";
import { buildCarnet, type Carnet, nomFichierCarnet } from "./carnet";

/**
 * Rend le carnet en PDF, dans les couleurs du projet. La bibliothèque n'est chargée qu'au clic
 * (`import()` dynamique) : personne ne télécharge un moteur PDF pour discuter de son voyage.
 */
const VERT: [number, number, number] = [0, 53, 38];
const VERT_CLAIR: [number, number, number] = [31, 92, 74];
const CREME: [number, number, number] = [246, 242, 233];
const GRIS: [number, number, number] = [92, 92, 92];
const ENCRE: [number, number, number] = [26, 26, 26];
const SABLE: [number, number, number] = [227, 218, 203];
const TERRACOTTA: [number, number, number] = [199, 91, 57];

const PAGE_L = 210;
const PAGE_H = 297;
const MARGE = 20;
const LARGEUR = PAGE_L - MARGE * 2;
/** Le carnet se lit en deux colonnes : l'intitulé à gauche, la valeur et la phrase à droite. */
const COLONNE = 46;
const BANDEAU_H = 54;
const BAS = PAGE_H - 22;

/**
 * Les polices intégrées au PDF ne connaissent pas les espaces insécables du français. L'espace
 * fine de « 1 500 € » sortait en « 1/500 € », et le reste de la ligne se disloquait faute de
 * vraie espace où couper. On les ramène à une espace ordinaire, juste avant de dessiner.
 *
 * Le signe euro pose un second problème : la police intégrée ne porte pas son dessin, et le
 * lecteur va le chercher ailleurs. L'espace qui suit disparaît alors à l'écran, et « 4 000 € au
 * total » se lit « 4 000 €au total ». On en redonne une, mesurée sur la page rendue.
 */
export function pourPdf(texte: string): string {
  return texte.replace(/[\u00a0\u202f\u2009\u2007]/g, " ").replace(/€ (?=\S)/g, "€  ");
}

export async function renderCarnetPdf(carnet: Carnet): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const fond = () => {
    doc.setFillColor(...CREME).rect(0, 0, PAGE_L, PAGE_H, "F");
  };
  /**
   * La découpe en lignes dépend de la police ACTIVE : la régler après avoir mesuré donnait des
   * lignes calculées trop courtes, qui sortaient de la page une fois écrites plus grandes.
   * On règle donc la police ici, juste avant de mesurer, et on écrit avec la même.
   */
  const couper = (
    texte: string,
    largeur: number,
    style: "normal" | "italic" | "bold",
    taille: number,
  ): string[] => {
    doc.setFont("helvetica", style).setFontSize(taille);
    return doc.splitTextToSize(pourPdf(texte), largeur) as string[];
  };
  const ecrire = (texte: string | string[], x: number, y: number, options?: object) => {
    const valeur = Array.isArray(texte) ? texte.map(pourPdf) : pourPdf(texte);
    doc.text(valeur, x, y, options);
  };

  fond();

  // Bandeau de couverture, avec le motif de courbes de l'interface. Les cercles sont plus grands
  // que le bandeau : on repeint le crème par-dessus ce qui déborde, faute de découpe simple.
  doc.setFillColor(...VERT).rect(0, 0, PAGE_L, BANDEAU_H, "F");
  doc.setDrawColor(...VERT_CLAIR).setLineWidth(0.4);
  for (let i = 1; i <= 6; i += 1) {
    doc.ellipse(PAGE_L - 4, BANDEAU_H / 2, 10 * i, 6.5 * i, "S");
  }
  doc.setFillColor(...CREME).rect(0, BANDEAU_H, PAGE_L, PAGE_H - BANDEAU_H, "F");
  doc.setLineWidth(0.2);

  doc
    .setTextColor(...SABLE)
    .setFont("helvetica", "bold")
    .setFontSize(8);
  ecrire("CARNET DE VOYAGE", MARGE, 20, { charSpace: 1.2 });
  doc
    .setTextColor(...CREME)
    .setFont("times", "normal")
    .setFontSize(26);
  ecrire(carnet.titre, MARGE, 34);
  doc.setDrawColor(...TERRACOTTA).line(MARGE, 39, MARGE + 22, 39);
  doc
    .setTextColor(...SABLE)
    .setFont("helvetica", "normal")
    .setFontSize(9.5);
  ecrire([carnet.date, carnet.contact].filter(Boolean).join(" "), MARGE, 46);

  let y = BANDEAU_H + 18;

  const pied = () => {
    doc.setDrawColor(...SABLE).line(MARGE, BAS, MARGE + LARGEUR, BAS);
    doc
      .setTextColor(...GRIS)
      .setFont("helvetica", "normal")
      .setFontSize(8);
    ecrire(carnet.pied, MARGE, BAS + 6);
    ecrire(`${doc.getNumberOfPages()}`, MARGE + LARGEUR, BAS + 6, { align: "right" });
  };

  const saut = (hauteur: number) => {
    if (y + hauteur <= BAS - 8) return;
    pied();
    doc.addPage();
    fond();
    y = 26;
  };

  const titreSection = (titre: string, note?: string) => {
    saut(22);
    doc
      .setTextColor(...VERT)
      .setFont("helvetica", "bold")
      .setFontSize(9.5);
    ecrire(titre.toUpperCase(), MARGE, y, { charSpace: 0.8 });
    y += 3.5;
    doc.setDrawColor(...SABLE).line(MARGE, y, MARGE + LARGEUR, y);
    y += 6;
    if (note) {
      const lignes = couper(note, LARGEUR, "italic", 8.5);
      doc.setTextColor(...GRIS);
      ecrire(lignes, MARGE, y);
      y += lignes.length * 4.2;
    }
    y += 4;
  };

  for (const section of carnet.sections) {
    titreSection(section.titre, section.note);

    for (const l of section.lignes) {
      const valeur = couper(l.valeur, LARGEUR - COLONNE, "normal", 11);
      const citation = l.citation
        ? couper(`vous avez dit : « ${l.citation} »`, LARGEUR - COLONNE, "italic", 8.5)
        : [];
      const label = couper(l.label, COLONNE - 6, "normal", 9);
      const hauteur = Math.max(valeur.length * 5.2, label.length * 4.6 + (l.mention ? 6 : 0));
      saut(hauteur + citation.length * 4.2 + 8);

      doc
        .setTextColor(...GRIS)
        .setFont("helvetica", "normal")
        .setFontSize(9);
      ecrire(label, MARGE, y);

      if (l.mention) {
        // La même pastille que dans l'interface : une information incertaine se voit.
        const largeurTexte = doc.getTextWidth(pourPdf(l.mention)) + 5;
        doc.setFillColor(...SABLE).roundedRect(MARGE, y + 2, largeurTexte, 5.4, 2.7, 2.7, "F");
        doc.setTextColor(...ENCRE).setFontSize(7.5);
        ecrire(l.mention, MARGE + 2.5, y + 5.8);
      }

      doc
        .setTextColor(...ENCRE)
        .setFont("helvetica", "normal")
        .setFontSize(11);
      ecrire(valeur, MARGE + COLONNE, y);
      let bas = y + valeur.length * 5.2;

      if (citation.length > 0) {
        doc
          .setTextColor(...GRIS)
          .setFont("helvetica", "italic")
          .setFontSize(8.5);
        ecrire(citation, MARGE + COLONNE, bas + 1);
        bas += 1 + citation.length * 4.2;
      }

      y = Math.max(bas, y + hauteur) + 6;
    }
    y += 4;
  }

  if (carnet.mots.length > 0) {
    titreSection("Vos mots");
    for (const mot of carnet.mots) {
      const lignes = couper(`« ${mot} »`, LARGEUR - 6, "italic", 10);
      saut(lignes.length * 5 + 4);
      doc.setFillColor(...TERRACOTTA).rect(MARGE, y - 3.5, 1, lignes.length * 5, "F");
      doc
        .setTextColor(...ENCRE)
        .setFont("helvetica", "italic")
        .setFontSize(10);
      ecrire(lignes, MARGE + 6, y);
      y += lignes.length * 5 + 4;
    }
  }

  pied();
  return doc.output("blob");
}

/** Déclenche le téléchargement du PDF depuis le navigateur. */
export async function downloadCarnet(
  brief: TravelBrief,
  completeness: Completeness,
  contact?: Contact | null,
  faitLe = new Date(),
): Promise<void> {
  const blob = await renderCarnetPdf(buildCarnet(brief, completeness, faitLe, contact));
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichierCarnet(brief, faitLe);
  lien.click();
  URL.revokeObjectURL(url);
}
