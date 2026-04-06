// server.js — Point d'entrée principal de l'API GPP
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes API ────────────────────────────────────────────
let creditsRouter;
try {
  const m = require('./routes/credits');
  creditsRouter = m.router;
  console.log('✅ Route credits chargée');
} catch(e) {
  console.error('❌ credits:', e.message);
  process.exit(1);
}

try {
  app.use('/api/credits', creditsRouter);
  app.use('/api/encours', require('./routes/encours'));
  console.log('✅ Route encours chargée');
} catch(e) {
  console.error('❌ encours:', e.message);
  process.exit(1);
}

try {
  app.use('/api/conventions', require('./routes/conventions'));
  console.log('✅ Route conventions chargée');
} catch(e) {
  console.error('❌ conventions:', e.message);
  process.exit(1);
}

try {
  app.use('/api/lettres', require('./routes/lettres'));
  console.log('✅ Route lettres chargée');
} catch(e) {
  console.error('❌ lettres:', e.message);
  process.exit(1);
}

// ── Route santé ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    db_host: process.env.DB_HOST,
    db_name: process.env.DB_NAME,
  });
});

// ── Gestionnaire d'erreurs global ─────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: err.message });
});

// ── Démarrage du serveur ───────────────────────────────────
// PORT fourni par la plateforme cloud (Render, Railway…) ou 3000 en local
const PORT = process.env.PORT || 3000;

// On démarre le serveur IMMÉDIATEMENT (requis par Render qui surveille le port)
// Le test de connexion DB se fait en arrière-plan, sans bloquer
app.listen(PORT, () => {
  console.log('\n🚀 API GPP Fonds démarrée');
  console.log(`   → Port      : ${PORT}`);
  console.log(`   → API santé : /api/health`);
  console.log(`   → Crédits  : /api/credits`);
  console.log(`   → Encours  : /api/encours`);
  console.log(`   → Lettres  : /api/lettres/f3`);
  console.log('');

  // Test de connexion PostgreSQL (Neon) après démarrage
  const { pool } = require('./db');
  pool.connect()
    .then(client => {
      client.release();
      console.log(`✅ PostgreSQL Neon connecté — ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    })
    .catch(err => {
      // On log l'erreur mais on ne coupe pas le serveur :
      // les routes renverront une erreur SQL propre si la DB est inaccessible
      console.error('⚠️  PostgreSQL connexion échouée (le serveur reste actif):', err.message);
    });
});

module.exports = app;
