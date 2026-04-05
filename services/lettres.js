// services/lettres.js — Générateur Word (bibliothèque docx, sans template)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, HeadingLevel, UnderlineType,
  convertInchesToTwip, ShadingType, Header, Footer, PageNumber
} = require('docx');

// ── Formateur MGA ─────────────────────────────────────────────────────────────
function fmt(n) {
  const v = parseFloat(n) || 0;
  return new Intl.NumberFormat('fr-FR').format(Math.round(v)) + ' MGA';
}

// ── Bloc adresse destinataire ─────────────────────────────────────────────────
function blocDest(dest, civilite) {
  return [
    new Paragraph({ spacing: { before: 200, after: 0 } }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dest.nom || '—', bold: true, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dest.titre || '', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dest.org || '', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dest.adresse || '', size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: dest.cp || '', size: 22 })],
    }),
    new Paragraph({ spacing: { before: 200, after: 200 } }),
  ];
}

// ── En-tête de page avec ville & date ─────────────────────────────────────────
function ligneVilleDate(ville, dateLettre) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 300 },
    children: [new TextRun({ text: `${ville || 'Antananarivo'}, le ${dateLettre}`, size: 22 })],
  });
}

// ── Ligne de référence ────────────────────────────────────────────────────────
function ligneRef(ref) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({ text: 'Réf : ', bold: true, size: 22 }),
      new TextRun({ text: ref || '', size: 22 }),
    ],
  });
}

// ── Objet ─────────────────────────────────────────────────────────────────────
function ligneObjet(objet) {
  return new Paragraph({
    spacing: { after: 300 },
    children: [
      new TextRun({ text: 'Objet : ', bold: true, underline: { type: UnderlineType.SINGLE }, size: 22 }),
      new TextRun({ text: objet, bold: true, underline: { type: UnderlineType.SINGLE }, size: 22 }),
    ],
  });
}

// ── Cellule tableau ───────────────────────────────────────────────────────────
function cellule(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { type: ShadingType.SOLID, color: '1a4a8a', fill: '1a4a8a' } : undefined,
    children: [new Paragraph({
      alignment: opts.right ? AlignmentType.RIGHT : (opts.center ? AlignmentType.CENTER : AlignmentType.LEFT),
      children: [new TextRun({
        text: String(text || ''),
        bold: opts.bold || opts.header,
        color: opts.header ? 'FFFFFF' : undefined,
        size: 20,
      })],
    })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  });
}

// ── Signature ─────────────────────────────────────────────────────────────────
function blocSignature(signataire, titre, right = true) {
  return [
    new Paragraph({ spacing: { before: 400, after: 0 } }),
    new Paragraph({
      alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: signataire || 'Le Directeur', bold: true, size: 22 })],
    }),
    new Paragraph({
      alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: titre || '', italics: true, size: 20 })],
    }),
    new Paragraph({ spacing: { before: 600, after: 0 } }),
  ];
}

// ── Paragraphe texte simple ───────────────────────────────────────────────────
function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : (opts.right ? AlignmentType.RIGHT : AlignmentType.JUSTIFY),
    spacing: { after: opts.after !== undefined ? opts.after : 200 },
    children: [new TextRun({ text, size: opts.size || 22, bold: opts.bold, italics: opts.italic })],
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// F3 — Attestation de garantie
// ════════════════════════════════════════════════════════════════════════════════
async function genererF3(data) {
  const {
    dateLettre, ref, destinataire, guichet, periodeEntree, civilite,
    nbCredits, montantTotal, emgRef, encoursCumul, plafond, credits,
    signataire, signatairetitre, ville,
  } = data;

  // Tableau des crédits
  const headerRow = new TableRow({
    children: [
      cellule('N°', { header: true, center: true }),
      cellule('ID Crédit', { header: true }),
      cellule('Nom Client', { header: true }),
      cellule('Montant (MGA)', { header: true, right: true }),
      cellule('Date ouverture', { header: true, center: true }),
    ],
  });

  const dataRows = (credits || []).map((c, i) =>
    new TableRow({
      children: [
        cellule(i + 1, { center: true }),
        cellule(c.id_credit || '—'),
        cellule(c.nom_client || '—'),
        cellule(c.montant_credit ? new Intl.NumberFormat('fr-FR').format(c.montant_credit) : '—', { right: true }),
        cellule(c.date_ouverture ? new Date(c.date_ouverture).toLocaleDateString('fr-FR') : '—', { center: true }),
      ],
    })
  );

  const totalRow = new TableRow({
    children: [
      cellule('', {}),
      cellule('', {}),
      cellule('TOTAL', { bold: true, right: true }),
      cellule(new Intl.NumberFormat('fr-FR').format(Math.round(montantTotal || 0)), { bold: true, right: true }),
      cellule('', {}),
    ],
  });

  const tableCredits = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, totalRow],
  });

  const children = [
    // En-tête gauche (expéditeur)
    para('FONDS DE GARANTIE GPP', { bold: true, size: 24, after: 60 }),
    para(guichet || 'Direction des Garanties', { size: 20, after: 400 }),

    // Ligne ville + date
    ligneVilleDate(ville, dateLettre),

    // Destinataire à droite
    ...blocDest(destinataire, civilite),

    // Référence & objet
    ligneRef(ref),
    ligneObjet('Notification d\'entrée en portefeuille GPP'),

    // Corps
    para(`${civilite || 'Monsieur'},`, { after: 300 }),
    para(
      `Nous avons l'honneur de vous notifier que les crédits listés ci-dessous, accordés par votre institution dans le cadre de la convention de garantie GPP, ont été enregistrés dans le portefeuille garanti à compter du ${periodeEntree || dateLettre}.`,
      { after: 300 }
    ),
    para(
      `Ces ${nbCredits} crédit(s) représentent un montant total de ${fmt(montantTotal)} et viennent s'ajouter à l'encours cumulé du portefeuille garanti (${fmt(encoursCumul)}) dans la limite du plafond conventionnel de ${fmt(plafond)}.`,
      { after: 400 }
    ),

    // Tableau
    tableCredits,

    new Paragraph({ spacing: { before: 400, after: 200 } }),
    para(
      `La référence d'encours utilisée est celle du dernier relevé EMG reçu (${emgRef}). Tout écart devra faire l'objet d'une notification de votre part dans un délai de 10 jours ouvrables.`,
      { after: 300 }
    ),
    para('Veuillez agréer, ' + (civilite || 'Monsieur') + ', l\'expression de nos salutations distinguées.', { after: 400 }),

    // Signature
    ...blocSignature(signataire, signatairetitre, true),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

// ════════════════════════════════════════════════════════════════════════════════
// PTF — Lettre Niveau Portefeuille / Stop Loss
// ════════════════════════════════════════════════════════════════════════════════
async function genererPTF(data) {
  const {
    dateLettre, dateFin, ref, destinataire, ccDestinataire, guichet, civilite,
    tauxDegradationReel, tauxDegradationArticle7, stopLossPct,
    montantMaxPayements, tableauDetails,
    signataire, signatairetitre, sig2, sig2titre, ville,
  } = data;

  // Tableau récap
  const headerRow = new TableRow({
    children: [
      cellule('Indicateur', { header: true }),
      cellule('Valeur', { header: true, right: true }),
    ],
  });

  const detailRows = (tableauDetails || []).map(row =>
    new TableRow({
      children: [
        cellule(row.libelle || ''),
        cellule(
          typeof row.montant === 'string' && row.montant.includes('%')
            ? row.montant
            : (typeof row.montant === 'number' ? fmt(row.montant) : String(row.montant || '—')),
          { right: true }
        ),
      ],
    })
  );

  const tableRecap = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...detailRows],
  });

  const children = [
    para('FONDS DE GARANTIE GPP', { bold: true, size: 24, after: 60 }),
    para(guichet || 'Direction des Garanties', { size: 20, after: 400 }),

    ligneVilleDate(ville, dateLettre),
    ...blocDest(destinataire, civilite),

    ligneRef(ref),
    ligneObjet('Notification niveau portefeuille — Stop Loss Article 7'),

    para(`${civilite || 'Monsieur'},`, { after: 300 }),
    para(
      `Dans le cadre de la convention de garantie GPP, nous vous informons des indicateurs de qualité du portefeuille garanti à la date du ${dateFin || dateLettre}.`,
      { after: 300 }
    ),
    para(
      `Le taux de dégradation réel s'établit à ${tauxDegradationReel}%, soit un taux calculé selon l'article 7 de ${tauxDegradationArticle7}%. La clause Stop Loss est fixée à ${stopLossPct}% du portefeuille garanti initial, soit un montant maximum de paiements de ${fmt(montantMaxPayements)}.`,
      { after: 400 }
    ),

    tableRecap,

    new Paragraph({ spacing: { before: 400, after: 200 } }),
    para(
      'Nous vous prions de prendre bonne note de ces indicateurs et de nous contacter pour toute question relative à ce rapport.',
      { after: 300 }
    ),
    para(`Veuillez agréer, ${civilite || 'Monsieur'}, l'expression de nos salutations distinguées.`, { after: 400 }),

    ...blocSignature(signataire, signatairetitre, true),
  ];

  // CC si présent
  if (ccDestinataire) {
    children.push(
      para(`CC : ${ccDestinataire}`, { italic: true, size: 20, after: 100 })
    );
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

// ════════════════════════════════════════════════════════════════════════════════
// Sortie PTF — Lettre de sortie de portefeuille
// ════════════════════════════════════════════════════════════════════════════════
async function genererSortie(data) {
  const {
    dateLettre, dateFin, ref, destinataire, guichet, civilite,
    periodeEmg, moisSortie, dateEffet, nbCredits, montantTotal,
    credits, signataire, signatairetitre, ville,
  } = data;

  const headerRow = new TableRow({
    children: [
      cellule('N°', { header: true, center: true }),
      cellule('ID Crédit', { header: true }),
      cellule('Nom Client', { header: true }),
      cellule('Montant initial (MGA)', { header: true, right: true }),
      cellule('Date ouverture', { header: true, center: true }),
    ],
  });

  const dataRows = (credits || []).map((c, i) =>
    new TableRow({
      children: [
        cellule(i + 1, { center: true }),
        cellule(c.id_credit || '—'),
        cellule(c.nom_client || '—'),
        cellule(c.montant_credit ? new Intl.NumberFormat('fr-FR').format(c.montant_credit) : '—', { right: true }),
        cellule(c.date_ouverture ? new Date(c.date_ouverture).toLocaleDateString('fr-FR') : '—', { center: true }),
      ],
    })
  );

  const totalRow = new TableRow({
    children: [
      cellule('', {}), cellule('', {}),
      cellule('TOTAL', { bold: true, right: true }),
      cellule(new Intl.NumberFormat('fr-FR').format(Math.round(montantTotal || 0)), { bold: true, right: true }),
      cellule('', {}),
    ],
  });

  const tableCredits = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows, totalRow],
  });

  const children = [
    para('FONDS DE GARANTIE GPP', { bold: true, size: 24, after: 60 }),
    para(guichet || 'Direction des Garanties', { size: 20, after: 400 }),

    ligneVilleDate(ville, dateLettre),
    ...blocDest(destinataire, civilite),

    ligneRef(ref),
    ligneObjet('Notification de sortie du portefeuille GPP — Encours final nul'),

    para(`${civilite || 'Madame'},`, { after: 300 }),
    para(
      `Suite à l'analyse du relevé EMG du ${periodeEmg || dateFin}, nous vous informons que les ${nbCredits} crédit(s) listés ci-dessous présentent un encours final nul et sont donc retirés du portefeuille garanti GPP à compter du ${dateEffet || dateFin}.`,
      { after: 300 }
    ),
    para(
      `Le montant total de crédit initial concerné par cette sortie est de ${fmt(montantTotal)}.`,
      { after: 400 }
    ),

    tableCredits,

    new Paragraph({ spacing: { before: 400, after: 200 } }),
    para(
      'Ces crédits ne feront plus l\'objet de garantie GPP dès la date d\'effet indiquée. Veuillez ne plus les inclure dans vos déclarations EMG ultérieures.',
      { after: 300 }
    ),
    para(`Veuillez agréer, ${civilite || 'Madame'}, l'expression de nos salutations distinguées.`, { after: 400 }),

    ...blocSignature(signataire, signatairetitre, true),
  ];

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

module.exports = { genererF3, genererPTF, genererSortie };
