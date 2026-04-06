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

// ── CACHE EN MÉMOIRE ─────────────────────────────────────
// Stocke les réponses API pour éviter les allers-retours Neon répétés
const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data, ttlSeconds = 30) {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}

function clearCache(pattern) {
  // Supprime les entrées dont la clé contient le pattern
  for (const key of cache.keys()) {
    if (!pattern || key.includes(pattern)) cache.delete(key);
  }
}

// Middleware cache GET — appliqué aux routes qui le méritent
function cacheMiddleware(ttlSeconds = 30) {
  return (req, res, next) => {
    // Ne cache que les GET sans body
    if (req.method !== 'GET') return next();

    const key = req.originalUrl;
    const cached = getCache(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Intercepte res.json pour mettre en cache
    const origJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) setCache(key, data, ttlSeconds);
      res.setHeader('X-Cache', 'MISS');
      return origJson(data);
    };
    next();
  };
}

// Expose clearCache globalement pour les routes (import/PUT/DELETE)
app.locals.clearCache = clearCache;

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
  // Cache 30s sur credits et encours (données qui changent peu)
  app.use('/api/credits', cacheMiddleware(30), creditsRouter);
  app.use('/api/encours', cacheMiddleware(30), require('./routes/encours'));
  console.log('✅ Route encours chargée');
} catch(e) {
  console.error('❌ encours:', e.message);
  process.exit(1);
}

try {
  // Cache 5 minutes sur conventions (changent rarement)
  app.use('/api/conventions', cacheMiddleware(300), require('./routes/conventions'));
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

try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Route auth chargée');
} catch(e) {
  console.error('❌ auth:', e.message);
  process.exit(1);
}

try {
  // Cache 60s sur users (liste qui change peu)
  app.use('/api/users', cacheMiddleware(60), require('./routes/users'));
  console.log('✅ Route users chargée');
} catch(e) {
  console.error('❌ users:', e.message);
  process.exit(1);
}

// ── Invalidation cache après import ──────────────────────
// Route spéciale pour vider le cache depuis les routes d'import
app.post('/api/cache/clear', (req, res) => {
  const { pattern } = req.body;
  clearCache(pattern || null);
  res.json({ cleared: true, pattern: pattern || 'all' });
});

// ── Route santé ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.2.0',
    timestamp: new Date().toISOString(),
    db_host: process.env.DB_HOST,
    db_name: process.env.DB_NAME,
    cache_entries: cache.size,
  });
});

// ── Gestionnaire d'erreurs global ─────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ error: err.message });
});

// ── Démarrage du serveur ──────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n🚀 API GPP Fonds démarrée');
  console.log(`   → Port      : ${PORT}`);
  console.log(`   → API santé : /api/health`);
  console.log(`   → Cache     : actif (30s GET)`);
  console.log('');

  const { pool } = require('./db');
  pool.connect()
    .then(client => {
      client.release();
      console.log(`✅ PostgreSQL Neon connecté — ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    })
    .catch(err => {
      console.error('⚠️  PostgreSQL connexion échouée:', err.message);
    });
});

// Keepalive DB — évite la mise en veille Neon (toutes les 4 min)
setInterval(async () => {
  try {
    const { pool } = require('./db');
    await pool.query('SELECT 1');
  } catch(e) {}
}, 4 * 60 * 1000);

module.exports = app;
