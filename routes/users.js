// routes/users.js — Gestion des utilisateurs (admin seulement)
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// Toutes les routes nécessitent auth + admin
router.use(authMiddleware, adminOnly);

// GET /api/users — liste tous les utilisateurs
router.get('/', async (req, res) => {
  try {
    const r = await query(`
      SELECT id, username, email, role, actif, created_at, created_by
      FROM gpp_exhaustives.users
      ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — créer un utilisateur
router.post('/', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email et password sont requis' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await query(`
      INSERT INTO gpp_exhaustives.users (username, email, password, role, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, role, actif, created_at
    `, [
      username.trim(),
      email.trim(),
      hash,
      role || 'operateur',
      req.user.username
    ]);
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ error: 'Cet identifiant ou email existe déjà' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — modifier un utilisateur
router.put('/:id', async (req, res) => {
  const { email, role, actif, password } = req.body;
  try {
    let passwordClause = '';
    let params = [email, role, actif, req.params.id];

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ', password = $5';
      params = [email, role, actif, req.params.id, hash];
    }

    const r = await query(`
      UPDATE gpp_exhaustives.users
      SET email = $1, role = $2, actif = $3 ${passwordClause}
      WHERE id = $4
      RETURNING id, username, email, role, actif
    `, params);

    if (!r.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — supprimer un utilisateur
router.delete('/:id', async (req, res) => {
  try {
    // Empêcher de supprimer son propre compte
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });

    const r = await query(`
      DELETE FROM gpp_exhaustives.users WHERE id = $1 RETURNING username
    `, [req.params.id]);

    if (!r.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ success: true, deleted: r.rows[0].username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
