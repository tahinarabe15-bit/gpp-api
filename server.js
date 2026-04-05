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
// credits exporte { router, anomaliesStore }
const { router: creditsRouter } = require('./routes/credits');
app.use('/api/credits', creditsRouter);

app.use('/api/encours',     require('./routes/encours'));
app.use('/api/conventions', require('./routes/conventions'));
app.use('/api/lettres',     require('./routes/lettres'));

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

app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
const { pool } = require('./db');
pool.connect()
  .then(client => {
    client.release();
    console.log(`\n✅ PostgreSQL connecté — ${process.env.DB_HOST}:${process.env.DB_PORT||5432}/${process.env.DB_NAME}`);
  })
  .catch(err => console.error('❌ PostgreSQL connexion échouée:', err.message));

app.listen(PORT, () => {
  console.log('\n🚀 API GPP Fonds démarrée');
  console.log(`   → Dashboard : http://localhost:${PORT}`);
  console.log(`   → API santé : http://localhost:${PORT}/api/health`);
  console.log(`   → Crédits  : http://localhost:${PORT}/api/credits`);
  console.log(`   → Encours  : http://localhost:${PORT}/api/encours`);
  console.log(`   → Lettres  : http://localhost:${PORT}/api/lettres/f3`);
  console.log('');
});

module.exports = app;
