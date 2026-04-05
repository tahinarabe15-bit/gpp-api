// db.js — Connexion PostgreSQL via pool de connexions
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'postgres',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test de connexion au démarrage
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Impossible de se connecter à PostgreSQL :', err.message);
    console.error('   Vérifiez les paramètres dans le fichier .env');
    return;
  }
  console.log(`✅ PostgreSQL connecté — ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  release();
});

// Fonction utilitaire : exécuter une requête
async function query(sql, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(sql, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️  Requête lente (${duration}ms): ${sql.substring(0, 80)}`);
    }
    return result;
  } catch (err) {
    console.error('❌ Erreur SQL:', err.message);
    console.error('   Requête:', sql.substring(0, 200));
    throw err;
  }
}

// Formater les nombres MGA
function formatMGA(n) {
  if (n == null) return '0';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(n);
}

// Formater date en français
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Nombre en lettres (simplifié pour les montants)
function nbEnLettres(n) {
  // Délégué à une lib ou à générer côté lettre
  return `(${new Intl.NumberFormat('fr-FR').format(Math.round(n))} Ariary)`;
}

module.exports = { pool, query, formatMGA, formatDate, nbEnLettres };
// Dans db.js, remplacer console.log par des logs conditionnels
const DEBUG = process.env.DEBUG === 'true';

function logQuery(text, params) {
  if (DEBUG) {
    console.log('[SQL]', text, params);
  }
}