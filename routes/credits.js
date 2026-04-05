// routes/credits.js — version corrigée avec validation convention bloquante
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const { query } = require('../db');

const upload = multer({ storage: multer.memoryStorage() });

// Stockage mémoire des anomalies d'import
const anomaliesStore = [];

// ─────────────────────────────────────────────────────────
// TOUTES les routes spécifiques AVANT /:id
// ─────────────────────────────────────────────────────────

router.get('/anomalies', (req, res) => {
  res.json({ anomalies: anomaliesStore, total: anomaliesStore.length });
});

router.delete('/anomalies', (req, res) => {
  anomaliesStore.length = 0;
  res.json({ success: true });
});

router.get('/stats/kpi', async (req, res) => {
  try {
    const enc = await query(`
      SELECT COALESCE(SUM(encours_final),0) AS encours_total,
             COALESCE(SUM(impayes_capital),0) AS impayes_total,
             COALESCE(MAX(date_emg),NULL) AS dernier_emg,
             COALESCE(SUM(CASE WHEN nb_jours_retard>30 THEN encours_final ELSE 0 END),0) AS par30
      FROM gpp_exhaustives.encours_credits`);
    const nb  = await query(`SELECT COUNT(*) AS nb FROM gpp_exhaustives.f2_credits`);
    const nat = await query(`
      SELECT nature_credit, COUNT(*) AS nb, COALESCE(SUM(montant_credit),0) AS total
      FROM gpp_exhaustives.f2_credits WHERE nature_credit IS NOT NULL
      GROUP BY nature_credit ORDER BY total DESC`);
    const dern = await query(`
      SELECT id_credit, nom_client, montant_credit, date_ouverture
      FROM gpp_exhaustives.f2_credits
      WHERE date_received=(SELECT MAX(date_received) FROM gpp_exhaustives.f2_credits)
      ORDER BY NULLIF(TRIM(numero),'')::int NULLS LAST LIMIT 10`);

    // Récupérer le stop_loss de la convention active
    let stopLossPct = 30;
    try {
      const conv = await query(`SELECT stop_loss_pct, quotite_garantie FROM gpp_conventions.conventions LIMIT 1`);
      if (conv.rows.length) {
        stopLossPct = parseFloat(conv.rows[0].stop_loss_pct || conv.rows[0].quotite_garantie || 30);
      }
    } catch (_) {}

    const e = enc.rows[0];
    const par30pct = e.encours_total>0 ? ((e.par30/e.encours_total)*100).toFixed(2) : '0.00';
    res.json({
      encours_total: parseFloat(e.encours_total),
      impayes_total: parseFloat(e.impayes_total),
      nb_credits:    parseInt(nb.rows[0].nb),
      dernier_emg:   e.dernier_emg,
      par30_pct:     parseFloat(par30pct),
      par30_montant: parseFloat(e.par30),
      stop_loss_pct: stopLossPct,
      repartition_nature: nat.rows,
      derniers_credits:   dern.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/historique', async (req, res) => {
  try {
    let r;
    try {
      r = await query(`
        SELECT annee, mois,
          SUM(encours_initial) AS initial, SUM(encours_final) AS final,
          COUNT(id_credit) AS nb_credits, SUM(impayes_capital) AS impayes
        FROM gpp_exhaustives.encours_historique
        GROUP BY annee, mois
        ORDER BY annee,
          CASE mois WHEN 'janvier' THEN 1 WHEN 'février' THEN 2 WHEN 'mars' THEN 3
            WHEN 'avril' THEN 4 WHEN 'mai' THEN 5 WHEN 'juin' THEN 6
            WHEN 'juillet' THEN 7 WHEN 'août' THEN 8 WHEN 'septembre' THEN 9
            WHEN 'octobre' THEN 10 WHEN 'novembre' THEN 11 WHEN 'décembre' THEN 12 END`);
    } catch (_) {
      r = await query(`
        SELECT annee, mois,
          SUM(encours_initial) AS initial, SUM(encours_final) AS final,
          COUNT(id_credit) AS nb_credits, SUM(impayes_capital) AS impayes
        FROM gpp_exhaustives.encours_credits
        GROUP BY annee, mois
        ORDER BY annee,
          CASE mois WHEN 'janvier' THEN 1 WHEN 'février' THEN 2 WHEN 'mars' THEN 3
            WHEN 'avril' THEN 4 WHEN 'mai' THEN 5 WHEN 'juin' THEN 6
            WHEN 'juillet' THEN 7 WHEN 'août' THEN 8 WHEN 'septembre' THEN 9
            WHEN 'octobre' THEN 10 WHEN 'novembre' THEN 11 WHEN 'décembre' THEN 12 END`);
    }
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Exports — TOUS avant /:id
router.get('/export/xlsx', async (req, res) => {
  try {
    const r = await query(`
      SELECT f2.*, e.encours_final, e.nb_jours_retard, e.impayes_capital, e.date_emg
      FROM gpp_exhaustives.f2_credits f2
      LEFT JOIN gpp_exhaustives.encours_credits e ON e.id_credit=f2.id_credit
      ORDER BY NULLIF(TRIM(f2.numero),'')::int NULLS LAST`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.rows), 'F2_Credits');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="F2_Credits_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export/exhaustive', async (req, res) => {
  try {
    const r = await query(`
      SELECT f2.*, e.annee, e.mois, e.encours_initial, e.encours_final,
        e.impayes_capital, e.impayes_interets, e.nb_jours_retard, e.date_emg
      FROM gpp_exhaustives.f2_credits f2
      LEFT JOIN gpp_exhaustives.encours_credits e ON e.id_credit=f2.id_credit
      ORDER BY NULLIF(TRIM(f2.numero),'')::int NULLS LAST`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.rows), 'Exhaustive');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="Exhaustive_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export/hebdo', async (req, res) => {
  try {
    const r = await query(`
      SELECT f2.numero, f2.id_credit, f2.nom_ifp, f2.id_gpp,
        f2.genre, f2.numero_compte, f2.nom_client,
        f2.secteur_activite, f2.type_entreprise, f2.region,
        f2.nature_credit, f2.type_credit, f2.objet_credit,
        f2.montant_credit, f2.taux_interet,
        f2.date_ouverture, f2.date_echeance,
        e.annee, e.mois, e.encours_initial, e.encours_final,
        e.impayes_capital, e.nb_jours_retard, e.date_emg
      FROM gpp_exhaustives.f2_credits f2
      INNER JOIN gpp_exhaustives.encours_credits e ON e.id_credit=f2.id_credit
      WHERE e.encours_final > 0
      ORDER BY NULLIF(TRIM(f2.numero),'')::int NULLS LAST`);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.rows), 'GPP_Hebdomadaire');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="GPP_Hebdomadaire_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const results = { inseres:0, rejetes:0, doublons:0, erreurs:[] };
  try {
    const wb   = XLSX.read(req.file.buffer, { type:'buffer', cellDates:true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:null });
    for (const row of rows) {
      const r = {};
      for (const k of Object.keys(row)) r[k.toLowerCase().trim().replace(/\s+/g,'_')] = row[k];
      const id_credit = (r.id_credit||r['id_crédit']||r.identifiant_credit||'').toString().trim();
      const id_gpp    = (r.id_gpp||process.env.IFP_ID_GPP||'').toString().trim();
      if (!id_credit) {
        const a = {id_credit:'—',motif:'id_credit manquant',fichier:req.file.originalname,date:new Date().toISOString()};
        results.erreurs.push(a); anomaliesStore.unshift(a); results.rejetes++; continue;
      }
      try {
        await query(`
          INSERT INTO gpp_exhaustives.f2_credits
            (nom_ifp,id_gpp,numero,genre,id_credit,numero_compte,nom_client,
             secteur_activite,chiffre_affaires,type_entreprise,region,anciennete,
             nature_credit,type_credit,objet_credit,montant_credit,taux_interet,
             date_ouverture,date_echeance,date_received)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT(id_credit,id_gpp) DO UPDATE SET
            nom_ifp=EXCLUDED.nom_ifp,numero=EXCLUDED.numero,genre=EXCLUDED.genre,
            numero_compte=EXCLUDED.numero_compte,nom_client=EXCLUDED.nom_client,
            secteur_activite=EXCLUDED.secteur_activite,chiffre_affaires=EXCLUDED.chiffre_affaires,
            type_entreprise=EXCLUDED.type_entreprise,region=EXCLUDED.region,
            anciennete=EXCLUDED.anciennete,nature_credit=EXCLUDED.nature_credit,
            type_credit=EXCLUDED.type_credit,objet_credit=EXCLUDED.objet_credit,
            montant_credit=EXCLUDED.montant_credit,taux_interet=EXCLUDED.taux_interet,
            date_ouverture=EXCLUDED.date_ouverture,date_echeance=EXCLUDED.date_echeance,
            date_received=EXCLUDED.date_received
        `,[
          (r.nom_ifp||process.env.IFP_NOM||'').toString().trim(), id_gpp,
          (r.numero||'').toString().trim(), (r.genre||'').toString().trim(), id_credit,
          (r.numero_compte||r['numéro_de_compte']||'').toString().trim(),
          (r.nom_client||r['nom_du_client']||'').toString().trim(),
          (r.secteur_activite||r["secteur_d'activité"]||'').toString().trim(),
          parseFloat(r.chiffre_affaires||0)||null,
          (r.type_entreprise||'').toString().trim(), (r.region||'').toString().trim(),
          (r.anciennete||r['ancienneté']||'').toString().trim(),
          (r.nature_credit||r['nature_de_crédit']||'').toString().trim(),
          (r.type_credit||r['type_de_crédit']||'').toString().trim(),
          (r.objet_credit||r['objet_crédit']||'').toString().trim(),
          parseFloat(r.montant_credit||r['montant_de_crédit']||0)||null,
          parseFloat(r.taux_interet||r["taux_d'intérêts"]||0)||null,
          r.date_ouverture||r["date_d'ouv_deal"]||null,
          r.date_echeance||r["date_d'échéance"]||null,
          r.date_received||null,
        ]);
        results.inseres++;
      } catch(e) {
        if (e.code==='23505') { results.doublons++; }
        else {
          const a={id_credit,motif:e.message.substring(0,200),fichier:req.file.originalname,date:new Date().toISOString()};
          results.erreurs.push(a); anomaliesStore.unshift(a); results.rejetes++;
        }
      }
    }
    res.json({ success:true, fichier:req.file.originalname, ...results });
  } catch(err) { res.status(500).json({ error:err.message }); }
});

// ── GET /api/credits — liste paginée ─────────────────────
router.get('/', async (req, res) => {
  try {
    const page=Math.max(1,parseInt(req.query.page)||1);
    const limit=Math.min(200,parseInt(req.query.limit)||50);
    const offset=(page-1)*limit;
    const nature=req.query.nature||null;
    const search=req.query.search?`%${req.query.search.toLowerCase()}%`:null;
    let where=[],params=[],i=1;
    if(nature){where.push(`LOWER(TRIM(nature_credit))=LOWER(TRIM($${i++}))`);params.push(nature);}
    if(search){where.push(`(LOWER(id_credit) LIKE $${i} OR LOWER(nom_client) LIKE $${i} OR LOWER(numero_compte) LIKE $${i})`);params.push(search);i++;}
    const whereSQL=where.length?'WHERE '+where.join(' AND '):'';
    const total=parseInt((await query(`SELECT COUNT(*) FROM gpp_exhaustives.f2_credits ${whereSQL}`,params)).rows[0].count);
    const dataRes=await query(`
      SELECT numero,id_credit,nom_ifp,id_gpp,genre,numero_compte,nom_client,
        secteur_activite,chiffre_affaires,type_entreprise,region,anciennete,
        nature_credit,type_credit,objet_credit,montant_credit,taux_interet,
        date_ouverture,date_echeance,date_received
      FROM gpp_exhaustives.f2_credits ${whereSQL}
      ORDER BY NULLIF(TRIM(numero),'')::int DESC NULLS LAST
      LIMIT $${i} OFFSET $${i+1}
    `,[...params,limit,offset]);
    res.json({total,page,limit,pages:Math.ceil(total/limit),data:dataRes.rows});
  } catch(err){res.status(500).json({error:err.message});}
});

// ── GET /api/credits/:id — DOIT être le dernier GET ──────
router.get('/:id', async (req, res) => {
  try {
    const r=await query(`
      SELECT f2.*,
        e.encours_initial,e.encours_final,e.nb_jours_retard,
        e.impayes_capital,e.impayes_interets,e.date_emg
      FROM gpp_exhaustives.f2_credits f2
      LEFT JOIN gpp_exhaustives.encours_credits e ON e.id_credit=f2.id_credit
      WHERE f2.id_credit=$1
    `,[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'Crédit introuvable'});
    res.json(r.rows[0]);
  } catch(err){res.status(500).json({error:err.message});}
});

// ── PUT /api/credits/:id — avec validation convention bloquante ──
router.put('/:id', async (req, res) => {
  try {
    const f = req.body;

    // ── Validation contre la convention ── BLOQUANTE ──────
    const conv = await query(`
      SELECT montant_min, montant_max, duree_max_jours, objet_credit_eligible
      FROM gpp_conventions.conventions
      WHERE nom_ifp = $1 AND id_gpp = $2
      LIMIT 1
    `, [process.env.IFP_NOM, process.env.IFP_ID_GPP]);

    if (conv.rows.length) {
      const c = conv.rows[0];
      const montant = parseFloat(f.montant_credit) || 0;

      if (c.montant_min && montant > 0 && montant < parseFloat(c.montant_min)) {
        return res.status(422).json({
          error: `⛔ Convention : montant ${new Intl.NumberFormat('fr-FR').format(montant)} MGA inférieur au minimum autorisé (${new Intl.NumberFormat('fr-FR').format(parseFloat(c.montant_min))} MGA). Modification refusée.`
        });
      }
      if (c.montant_max && montant > parseFloat(c.montant_max)) {
        return res.status(422).json({
          error: `⛔ Convention : montant ${new Intl.NumberFormat('fr-FR').format(montant)} MGA supérieur au maximum autorisé (${new Intl.NumberFormat('fr-FR').format(parseFloat(c.montant_max))} MGA). Modification refusée.`
        });
      }

      // Vérifier durée si les deux dates sont fournies
      if (c.duree_max_jours && f.date_ouverture && f.date_echeance) {
        const duree = Math.round(
          (new Date(f.date_echeance) - new Date(f.date_ouverture)) / (1000 * 60 * 60 * 24)
        );
        if (duree > parseInt(c.duree_max_jours)) {
          return res.status(422).json({
            error: `⛔ Convention : durée calculée ${duree} jours supérieure au maximum autorisé (${c.duree_max_jours} jours). Modification refusée.`
          });
        }
      }
    }
    // ── Fin validation ────────────────────────────────────

    const r = await query(`
      UPDATE gpp_exhaustives.f2_credits SET
        nom_client=$1,numero_compte=$2,secteur_activite=$3,chiffre_affaires=$4,
        type_entreprise=$5,region=$6,anciennete=$7,nature_credit=$8,
        type_credit=$9,objet_credit=$10,montant_credit=$11,taux_interet=$12,
        date_ouverture=$13,date_echeance=$14
      WHERE id_credit=$15 RETURNING *
    `, [f.nom_client, f.numero_compte, f.secteur_activite, f.chiffre_affaires||null,
        f.type_entreprise, f.region, f.anciennete, f.nature_credit, f.type_credit,
        f.objet_credit, f.montant_credit||null, f.taux_interet||null,
        f.date_ouverture||null, f.date_echeance||null, req.params.id]);

    if (!r.rows.length) return res.status(404).json({ error: 'Crédit introuvable' });
    res.json({ success: true, data: r.rows[0] });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    // Supprimer aussi les encours liés
    await query(`DELETE FROM gpp_exhaustives.encours_credits   WHERE id_credit = $1`, [req.params.id]);
    await query(`DELETE FROM gpp_exhaustives.encours_historique WHERE id_credit = $1`, [req.params.id]);
    const r = await query(`DELETE FROM gpp_exhaustives.f2_credits WHERE id_credit = $1 RETURNING id_credit`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Crédit introuvable' });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, anomaliesStore };
