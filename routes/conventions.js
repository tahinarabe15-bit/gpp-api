// routes/conventions.js — corrigé avec POST complet (stop_loss_pct inclus)
const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const { query } = require('../db');

// GET /api/conventions
router.get('/', async (req, res) => {
  try {
    const r = await query(`
      SELECT *,
        to_char(date_signature, 'DD/MM/YYYY') AS date_signature_fmt
      FROM gpp_conventions.conventions
      ORDER BY id_convention
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conventions — créer ou mettre à jour (upsert)
router.post('/', async (req, res) => {
  const {
    nom_ifp, id_gpp, quotite_garantie, stop_loss_pct,
    objet_credit_eligible, montant_min, montant_max,
    duree_max_jours, conditions_credit,
    plafond_encours, date_signature
  } = req.body;

  if (!nom_ifp || !id_gpp) {
    return res.status(400).json({ error: 'nom_ifp et id_gpp sont obligatoires' });
  }

  try {
    await query(`
      INSERT INTO gpp_conventions.conventions
        (nom_ifp, id_gpp, quotite_garantie, stop_loss_pct,
         objet_credit_eligible, montant_min, montant_max,
         duree_max_jours, conditions_credit,
         plafond_encours, date_signature)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (nom_ifp, id_gpp) DO UPDATE SET
        quotite_garantie      = EXCLUDED.quotite_garantie,
        stop_loss_pct         = EXCLUDED.stop_loss_pct,
        objet_credit_eligible = EXCLUDED.objet_credit_eligible,
        montant_min           = EXCLUDED.montant_min,
        montant_max           = EXCLUDED.montant_max,
        duree_max_jours       = EXCLUDED.duree_max_jours,
        conditions_credit     = EXCLUDED.conditions_credit,
        plafond_encours       = EXCLUDED.plafond_encours,
        date_signature        = EXCLUDED.date_signature
    `, [
      nom_ifp.trim(),
      id_gpp.trim(),
      parseFloat(quotite_garantie) || 50,
      parseFloat(stop_loss_pct)    || 30,
      objet_credit_eligible        || '',
      parseFloat(montant_min)      || 200000,
      parseFloat(montant_max)      || 4000000,
      parseInt(duree_max_jours)    || 30,
      conditions_credit            || '',
      parseFloat(plafond_encours)  || 5000000000,
      date_signature               || null
    ]);

    res.json({ success: true, message: `Convention ${nom_ifp}/${id_gpp} enregistrée` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conventions/export/xlsx
router.get('/export/xlsx', async (req, res) => {
  try {
    const r = await query('SELECT * FROM gpp_conventions.conventions ORDER BY id_convention');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.rows), 'Conventions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Conventions_GPP.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conventions/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query(`
      DELETE FROM gpp_conventions.conventions WHERE id_convention = $1 RETURNING nom_ifp, id_gpp
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Convention introuvable' });
    res.json({ success: true, deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
