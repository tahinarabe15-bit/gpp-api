// middleware/auth.js — Vérification JWT
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'gpp_secret_changez_ceci_2026';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

module.exports = { authMiddleware, adminOnly };
