// routes/encours.js — Endpoints encours crédits + historique
// CORRECTION : /sorties retourne les crédits dont l'encours_final = 0 dans le dernier EMG
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const { query } = require('../db');

const upload = multer({ storage: multer.memoryStorage() });

const MOIS_MAP = {
  1:'janvier',2:'février',3:'mars',4:'avril',5:'mai',6:'juin',
  7:'juillet',8:'août',9:'septembre',10:'octobre',11:'novembre',12:'décembre'
};

// ── GET /api/encours ──────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const annee  = req.query.annee || null;
    const mois   = req.query.mois  || null;
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;

    let where = [], params = [], i = 1;
    if (annee)  { where.push(`annee = $${i++}`); params.push(annee); }
    if (mois)   { where.push(`LOWER(mois) = LOWER($${i++})`); params.push(mois); }
    if (search) { where.push(`LOWER(id_credit) LIKE $${i++}`); params.push(search); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const count = await query(`SELECT COUNT(*) FROM gpp_exhaustives.encours_historique ${whereSQL}`, params);
    const data  = await query(`
      SELECT id_credit, id_gpp, annee, mois,
             encours_initial, encours_final,
             nb_jours_retard, impayes_capital, impayes_interets,
             date_emg, date_received
      FROM gpp_exhaustives.encours_historique
      ${whereSQL}
      ORDER BY annee DESC,
        CASE mois
          WHEN 'janvier' THEN 1 WHEN 'février' THEN 2 WHEN 'mars' THEN 3
          WHEN 'avril' THEN 4 WHEN 'mai' THEN 5 WHEN 'juin' THEN 6
          WHEN 'juillet' THEN 7 WHEN 'août' THEN 8 WHEN 'septembre' THEN 9
          WHEN 'octobre' THEN 10 WHEN 'novembre' THEN 11 WHEN 'décembre' THEN 12
        END DESC, id_credit
      LIMIT $${i} OFFSET $${i+1}
    `, [...params, limit, offset]);

    res.json({
      total: parseInt(count.rows[0].count),
      page, limit,
      pages: Math.ceil(parseInt(count.rows[0].count) / limit),
      data: data.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/encours/sorties ──────────────────────────────
// CORRIGÉ : crédits dont l'encours_final = 0 dans le dernier EMG enregistré
// (dans encours_credits, snapshot du dernier import mensuel)
router.get('/sorties', async (req, res) => {
  try {
    const r = await query(`
      SELECT
        ec.id_credit,
        f2.nom_client,
        f2.nature_credit,
        f2.montant_credit,
        f2.date_ouverture,
        f2.date_echeance,
        ec.encours_final,
        ec.date_emg
      FROM gpp_exhaustives.encours_credits ec
      INNER JOIN gpp_exhaustives.f2_credits f2 ON f2.id_credit = ec.id_credit
      WHERE (ec.encours_final IS NULL OR ec.encours_final = 0)
      ORDER BY f2.montant_credit DESC
    `);
    res.json({ total: r.rowCount, data: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/encours/import ──────────────────────────────
// Import mensuel — NON écrasant : ON CONFLICT DO NOTHING sur (id_credit, annee, mois)
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  const results = { inseres: 0, doublons: 0, rejetes: 0, erreurs: [] };

  try {
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    for (const row of rows) {
      const r = {};
      for (const k of Object.keys(row)) {
        r[k.toLowerCase().trim().replace(/\s+/g, '_')] = row[k];
      }

      const id_credit = (r.id_credit || '').toString().trim();
      if (!id_credit) { results.rejetes++; continue; }

      let annee = r.annee || null;
      let mois  = r.mois  || null;
      const dateEmg = r.date_emg || null;

      if (dateEmg && (!annee || !mois)) {
        const d = new Date(dateEmg);
        if (!isNaN(d)) {
          annee = annee || d.getFullYear();
          mois  = mois  || MOIS_MAP[d.getMonth() + 1];
        }
      }

      if (!annee || !mois) {
        results.rejetes++;
        results.erreurs.push({ id_credit, motif: 'date_emg manquante — impossible de déterminer annee/mois' });
        continue;
      }

      const nbJours = parseInt(r.nb_jours_retard || 0) || 0;
      const impCap  = parseFloat(r.impayes_capital  || r.impayes || 0) || 0;

      try {
        const res1 = await query(`
          INSERT INTO gpp_exhaustives.encours_historique
            (id_credit, id_gpp, annee, mois,
             encours_initial, encours_final,
             nb_jours_retard, impayes_capital, impayes_interets,
             date_emg, date_received)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (id_credit, annee, mois) DO NOTHING
        `, [
          id_credit,
          (r.id_gpp || process.env.IFP_ID_GPP || '').toString().trim(),
          parseInt(annee),
          mois.toString().toLowerCase().trim(),
          parseFloat(r.encours_initial || r.encours_capital_initial || 0) || null,
          parseFloat(r.encours_final   || r.encours_capital_final   || 0) || null,
          nbJours, impCap,
          parseFloat(r.impayes_interets || 0) || null,
          dateEmg || null,
          r.date_received || null
        ]);

        if (res1.rowCount > 0) {
          results.inseres++;
          await query(`
            INSERT INTO gpp_exhaustives.encours_credits
              (id_credit, id_gpp, date_emg, encours_initial, encours_final,
               nb_jours_retard, impayes_capital, impayes_interets, date_received)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (id_credit, id_gpp) DO UPDATE SET
              date_emg        = EXCLUDED.date_emg,
              encours_initial = EXCLUDED.encours_initial,
              encours_final   = EXCLUDED.encours_final,
              nb_jours_retard = EXCLUDED.nb_jours_retard,
              impayes_capital = EXCLUDED.impayes_capital,
              impayes_interets= EXCLUDED.impayes_interets,
              date_received   = EXCLUDED.date_received
          `, [
            id_credit,
            (r.id_gpp || process.env.IFP_ID_GPP || '').toString().trim(),
            dateEmg,
            parseFloat(r.encours_initial || 0) || null,
            parseFloat(r.encours_final   || 0) || null,
            nbJours, impCap,
            parseFloat(r.impayes_interets || 0) || null,
            r.date_received || null
          ]);
        } else {
          results.doublons++;
        }
      } catch (e) {
        results.rejetes++;
        results.erreurs.push({ id_credit, motif: e.message.substring(0, 150) });
        try {
          await query(`
            INSERT INTO gpp_exhaustives.encours_rejets
              (id_credit, id_gpp, date_emg, encours_initial, encours_final,
               nb_jours_retard, impayes_capital, impayes_interets, motif_rejet)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `, [
            id_credit, (r.id_gpp || '').toString().trim(),
            dateEmg,
            parseFloat(r.encours_initial || 0) || null,
            parseFloat(r.encours_final   || 0) || null,
            nbJours, impCap,
            parseFloat(r.impayes_interets || 0) || null,
            e.message.substring(0, 500)
          ]);
        } catch (_) {}
      }
    }

    res.json({ success: true, fichier: req.file.originalname, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/encours/export/xlsx ─────────────────────────
router.get('/export/xlsx', async (req, res) => {
  try {
    const annee = req.query.annee || null;
    const mois  = req.query.mois  || null;
    let where = [], params = [], i = 1;
    if (annee) { where.push(`annee = $${i++}`); params.push(annee); }
    if (mois)  { where.push(`LOWER(mois) = LOWER($${i++})`); params.push(mois); }
    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const r = await query(`
      SELECT * FROM gpp_exhaustives.encours_historique ${whereSQL}
      ORDER BY annee, mois, id_credit
    `, params);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(r.rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Encours_Historique');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="Encours_${annee||'tous'}_${mois||'tous'}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/encours/:id_credit ───────────────────────────
router.put('/:id_credit', async (req, res) => {
  try {
    const id_credit = req.params.id_credit;
    const f = req.body;

    if (!f.annee || !f.mois) {
      return res.status(400).json({ error: 'Les champs annee et mois sont requis pour identifier la ligne.' });
    }

    const annee = parseInt(f.annee);
    const mois  = (f.mois || '').toLowerCase().trim();

    const encours_initial = parseFloat(f.encours_initial)  || null;
    const encours_final   = parseFloat(f.encours_final)    || null;
    const impayes_capital = parseFloat(f.impayes_capital)  || null;
    const impayes_interets= parseFloat(f.impayes_interets) || null;
    const nb_jours_retard = parseInt(f.nb_jours_retard)    || 0;
    const date_emg        = f.date_emg || null;

    // ── Validation contre la convention — BLOQUANTE ───────
    const conv = await query(`
      SELECT montant_min, montant_max, plafond_encours
      FROM gpp_conventions.conventions
      WHERE nom_ifp = $1 AND id_gpp = $2
      LIMIT 1
    `, [process.env.IFP_NOM, process.env.IFP_ID_GPP]);

    if (conv.rows.length) {
      const c = conv.rows[0];
      const montant = encours_initial || 0;

      if (c.montant_min && montant > 0 && montant < parseFloat(c.montant_min)) {
        return res.status(422).json({
          error: `⛔ Convention : encours initial ${new Intl.NumberFormat('fr-FR').format(montant)} MGA inférieur au minimum autorisé (${new Intl.NumberFormat('fr-FR').format(parseFloat(c.montant_min))} MGA). Modification refusée.`
        });
      }
      if (c.montant_max && montant > parseFloat(c.montant_max)) {
        return res.status(422).json({
          error: `⛔ Convention : encours initial ${new Intl.NumberFormat('fr-FR').format(montant)} MGA supérieur au maximum autorisé (${new Intl.NumberFormat('fr-FR').format(parseFloat(c.montant_max))} MGA). Modification refusée.`
        });
      }
      if (c.plafond_encours && encours_final !== null && encours_final > parseFloat(c.plafond_encours)) {
        return res.status(422).json({
          error: `⛔ Convention : encours final ${new Intl.NumberFormat('fr-FR').format(encours_final)} MGA dépasse le plafond du portefeuille (${new Intl.NumberFormat('fr-FR').format(parseFloat(c.plafond_encours))} MGA). Modification refusée.`
        });
      }
    }
    // ── Fin validation ────────────────────────────────────

    const r = await query(`
      UPDATE gpp_exhaustives.encours_historique SET
        encours_initial  = $1,
        encours_final    = $2,
        impayes_capital  = $3,
        impayes_interets = $4,
        nb_jours_retard  = $5,
        date_emg         = COALESCE($6, date_emg)
      WHERE id_credit = $7 AND annee = $8 AND LOWER(mois) = $9
      RETURNING *
    `, [encours_initial, encours_final, impayes_capital, impayes_interets,
        nb_jours_retard, date_emg, id_credit, annee, mois]);

    if (!r.rows.length) {
      return res.status(404).json({ error: `Aucune ligne trouvée pour ${id_credit} — ${mois} ${annee}` });
    }

    await query(`
      UPDATE gpp_exhaustives.encours_credits SET
        encours_initial  = $1,
        encours_final    = $2,
        impayes_capital  = $3,
        impayes_interets = $4,
        nb_jours_retard  = $5,
        date_emg         = COALESCE($6, date_emg)
      WHERE id_credit = $7
        AND date_emg = (
          SELECT MAX(date_emg) FROM gpp_exhaustives.encours_historique WHERE id_credit = $7
        )
    `, [encours_initial, encours_final, impayes_capital, impayes_interets,
        nb_jours_retard, date_emg, id_credit]);

    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/encours/:id_credit ───────────────────────
// Supprime toutes les lignes d'historique + snapshot pour ce crédit
router.delete('/:id_credit', async (req, res) => {
  try {
    const id = req.params.id_credit;
    const annee = req.query.annee || null;
    const mois  = req.query.mois  || null;

    if (annee && mois) {
      // Supprimer une ligne précise (annee + mois)
      const r = await query(`
        DELETE FROM gpp_exhaustives.encours_historique
        WHERE id_credit = $1 AND annee = $2 AND LOWER(mois) = LOWER($3)
        RETURNING *
      `, [id, parseInt(annee), mois]);
      if (!r.rows.length) return res.status(404).json({ error: `Ligne introuvable pour ${id} — ${mois} ${annee}` });
    } else {
      // Supprimer toutes les lignes historique + snapshot
      await query(`DELETE FROM gpp_exhaustives.encours_historique WHERE id_credit = $1`, [id]);
      await query(`DELETE FROM gpp_exhaustives.encours_credits    WHERE id_credit = $1`, [id]);
    }

    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
