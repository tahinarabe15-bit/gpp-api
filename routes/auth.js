// routes/auth.js — Authentification JWT
const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { query } = require('../db');

const SECRET = process.env.JWT_SECRET || 'gpp_secret_changez_ceci_2026';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  try {
    const r = await query(
      `SELECT * FROM gpp_exhaustives.users WHERE username = $1 AND actif = true`,
      [username.trim()]
    );
    if (!r.rows.length)
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    const user = r.rows[0];
    const ok   = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — vérifier le token
router.get('/me', (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token manquant' });
  try {
    const token = header.split(' ')[1];
    const user  = jwt.verify(token, SECRET);
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
});

module.exports = router;
