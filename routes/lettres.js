// routes/lettres.js — Endpoints génération lettres Word
const express = require('express');
const router  = express.Router();
const { query, formatDate } = require('../db');
const { genererF3, genererPTF, genererSortie } = require('../services/lettres');

// ── POST /api/lettres/f3 ──────────────────────────────────
// Génère la lettre F3 depuis les données de la base
// Body: { ref, dateLettre, destinataire:{nom,titre,org,adresse,cp}, 
//         guichet, periodeEntree, civilite, credits:[id_credit,...] }
router.post('/f3', async (req, res) => {
  try {
    const { ref, dateLettre, destinataire, guichet, periodeEntree, civilite, credits: creditIds } = req.body;

    // Récupérer les crédits depuis la base (ou ceux fournis)
    let creditsData = [];
    if (creditIds && creditIds.length > 0) {
      const r = await query(
        `SELECT id_credit, nom_client, montant_credit, date_ouverture
         FROM gpp_exhaustives.f2_credits
         WHERE id_credit = ANY($1::text[])
         ORDER BY NULLIF(TRIM(numero), '')::int NULLS LAST`,
        [creditIds]
      );
      creditsData = r.rows;
    } else {
      // Derniers crédits entrés (dernier batch = même date_received)
      const r = await query(`
        SELECT id_credit, nom_client, montant_credit, date_ouverture
        FROM gpp_exhaustives.f2_credits
        WHERE date_received = (SELECT MAX(date_received) FROM gpp_exhaustives.f2_credits)
        ORDER BY NULLIF(TRIM(numero), '')::int NULLS LAST
      `);
      creditsData = r.rows;
    }

    // Calculs portefeuille
    const kpi = await query(`
      SELECT
        COALESCE(SUM(encours_final), 0)  AS encours_cumul,
        c.plafond_encours
      FROM gpp_exhaustives.encours_credits ec
      CROSS JOIN gpp_conventions.conventions c
      WHERE c.nom_ifp = $1 AND c.id_gpp = $2
      GROUP BY c.plafond_encours
    `, [process.env.IFP_NOM, process.env.IFP_ID_GPP]);

    const montantTotal = creditsData.reduce((s, c) => s + parseFloat(c.montant_credit || 0), 0);
    const encoursCumul = kpi.rows[0]?.encours_cumul || 0;
    const plafond      = kpi.rows[0]?.plafond_encours || 0;

    const emgRef = await query(`SELECT MAX(date_emg) AS d FROM gpp_exhaustives.encours_credits`);
    const dernierEmg = emgRef.rows[0]?.d;

    const buf = await genererF3({
      dateLettre:  dateLettre || formatDate(new Date()),
      ref:         ref || `F2 N° du ${formatDate(new Date())}`,
      destinataire: destinataire || { nom: '—', titre: '—', org: '—' },
      guichet:     guichet || '',
      periodeEntree,
      civilite:    civilite || 'Monsieur',
      nbCredits:       creditsData.length,
      nbCreditsLettres: `${creditsData.length}`,
      montantTotal,
      emgRef:      dernierEmg ? `EMG ${formatDate(dernierEmg)}` : 'EMG précédente',
      encoursCumul: parseFloat(encoursCumul) + montantTotal,
      plafond:     parseFloat(plafond),
      credits:     creditsData,
      signataire:  process.env.SIGNATAIRE_NOM,
      signatairetitre: process.env.SIGNATAIRE_TITRE,
      ville:       process.env.ORG_VILLE || 'Antananarivo',
    });

    const fname = `F3_GPP_${(destinataire?.org||'IFP').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('Erreur génération F3:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lettres/ptf ─────────────────────────────────
// Génère la lettre niveau portefeuille / stop loss
router.post('/ptf', async (req, res) => {
  try {
    const { ref, dateLettre, dateFin, destinataire, ccDestinataire, guichet, civilite } = req.body;

    // Calculs depuis la base
    const conv = await query(
      `SELECT * FROM gpp_conventions.conventions WHERE nom_ifp=$1 AND id_gpp=$2`,
      [process.env.IFP_NOM, process.env.IFP_ID_GPP]
    );
    const convention = conv.rows[0] || {};

    const stats = await query(`
      SELECT
        COALESCE(SUM(encours_initial), 0) AS encours_initial_total,
        COALESCE(SUM(encours_final),   0) AS encours_final_total,
        COALESCE(SUM(impayes_capital), 0) AS impayes_total,
        COALESCE(SUM(CASE WHEN nb_jours_retard > 30 THEN encours_final ELSE 0 END), 0) AS par30
      FROM gpp_exhaustives.encours_credits
    `);
    const s = stats.rows[0];
    const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT || 30);
    const encoursFinal = parseFloat(s.encours_final_total);
    const impayes      = parseFloat(s.impayes_total);

    // Taux de dégradation réel = impayes / encours_initial
    const encoursInitial = parseFloat(s.encours_initial_total);
    const tauxReel = encoursInitial > 0 ? ((impayes / encoursInitial) * 100).toFixed(2) : '0.00';
    // Taux article 7 = PAR30 / encours_final
    const tauxArt7 = encoursFinal > 0 ? ((parseFloat(s.par30) / encoursFinal) * 100).toFixed(2) : '0.00';
    // Montant max paiements = encours_initial * stop_loss_pct / 100
    const montantMax = encoursInitial * stopLossPct / 100;

    const tableauDetails = [
      { libelle: 'Encours initial du portefeuille', montant: encoursInitial },
      { libelle: 'Encours final (dernier EMG)',      montant: encoursFinal },
      { libelle: 'Total impayés capital',            montant: impayes },
      { libelle: `PAR > 30 jours`,                  montant: parseFloat(s.par30) },
      { libelle: `Taux de dégradation réel`,         montant: `${tauxReel}%` },
      { libelle: `Taux de dégradation (article 7)`,  montant: `${tauxArt7}%` },
      { libelle: `Stop loss (${stopLossPct}%)`,       montant: stopLossPct + '%' },
      { libelle: 'Montant maximal des paiements GPP', montant: montantMax },
    ];

    const buf = await genererPTF({
      dateLettre:  dateLettre || formatDate(new Date()),
      dateFin:     dateFin    || formatDate(new Date()),
      ref:         ref || `/01-${new Date().getFullYear()}`,
      destinataire: destinataire || { nom: '—', titre: '—', org: '—' },
      ccDestinataire,
      guichet:     guichet || '',
      civilite:    civilite || 'Monsieur',
      tauxDegradationReel:    tauxReel,
      tauxDegradationArticle7: tauxArt7,
      stopLossPct,
      montantMaxPayements: montantMax,
      montantMaxLettres: '',
      tableauDetails,
      signataire:     process.env.SIGNATAIRE_NOM,
      signatairetitre: process.env.SIGNATAIRE_TITRE,
      sig2:            process.env.SIGNATAIRE2_NOM,
      sig2titre:       process.env.SIGNATAIRE2_TITRE,
      ville:           process.env.ORG_VILLE || 'Antananarivo',
    });

    const fname = `PTF_StopLoss_${(destinataire?.org||'IFP').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('Erreur génération PTF:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/lettres/sortie ──────────────────────────────
// Génère la lettre de sortie PTF
router.post('/sortie', async (req, res) => {
  try {
    const { ref, dateLettre, dateFin, destinataire, guichet, civilite, periodeEmg, moisSortie, dateEffet } = req.body;

    // Crédits sortis = dans f2_credits mais plus dans encours_credits
    const sortis = await query(`
      SELECT f2.id_credit, f2.nom_client, f2.montant_credit, f2.date_ouverture
      FROM gpp_exhaustives.f2_credits f2
      WHERE NOT EXISTS (
        SELECT 1 FROM gpp_exhaustives.encours_credits e WHERE e.id_credit = f2.id_credit
      )
      ORDER BY f2.montant_credit DESC
    `);

    const nbCredits    = sortis.rowCount;
    const montantTotal = sortis.rows.reduce((s, c) => s + parseFloat(c.montant_credit || 0), 0);

    const buf = await genererSortie({
      dateLettre:  dateLettre || formatDate(new Date()),
      dateFin:     dateFin    || formatDate(new Date()),
      ref:         ref || `/07-${new Date().getFullYear()}`,
      destinataire: destinataire || { nom: '—', titre: '—', org: '—' },
      guichet:     guichet || '',
      civilite:    civilite || 'Madame',
      periodeEmg:  periodeEmg || '',
      moisSortie:  moisSortie || '',
      dateEffet:   dateEffet  || '',
      nbCredits,
      nbCreditsLettres: `${nbCredits}`,
      montantTotal,
      montantTotalLettres: '',
      credits: sortis.rows,
      signataire:  process.env.SIGNATAIRE2_NOM  || process.env.SIGNATAIRE_NOM,
      signatairetitre: process.env.SIGNATAIRE2_TITRE || process.env.SIGNATAIRE_TITRE,
      ville:       process.env.ORG_VILLE || 'Antananarivo',
    });

    const fname = `Sortie_PTF_${(destinataire?.org||'IFP').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buf);
  } catch (err) {
    console.error('Erreur génération Sortie:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/lettres/preview/sorties ─────────────────────
// Prévisualise les crédits qui seraient dans la lettre de sortie
// CORRIGÉ pour retourner la structure attendue par le frontend
router.get('/preview/sorties', async (req, res) => {
  try {
    // Récupère les crédits dans f2_credits qui n'ont AUCUN encours
    // (aucune ligne dans encours_credits) → encours_final = 0
    const r = await query(`
      SELECT 
        f2.id_credit, 
        f2.nom_client, 
        f2.montant_credit,
        f2.date_ouverture,
        f2.nature_credit,
        0 AS encours_final,
        NULL AS date_emg
      FROM gpp_exhaustives.f2_credits f2
      WHERE NOT EXISTS (
        SELECT 1 FROM gpp_exhaustives.encours_credits e WHERE e.id_credit = f2.id_credit
      )
      ORDER BY f2.montant_credit DESC
    `);
    
    // Structure attendue par le frontend: { credits: [...] }
    res.json({ credits: r.rows });
  } catch (err) {
    console.error('Erreur preview sorties:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;