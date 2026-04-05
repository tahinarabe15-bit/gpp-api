// routes/anomalies.js
const express = require('express');
const router = express.Router();

// Stockage en mémoire des anomalies
let anomalies = [];

// GET /api/credits/anomalies
router.get('/', (req, res) => {
  res.json({
    total: anomalies.length,
    anomalies: anomalies
  });
});

// DELETE /api/credits/anomalies
router.delete('/', (req, res) => {
  const count = anomalies.length;
  anomalies = [];
  res.json({
    message: 'Anomalies effacées',
    total: 0,
    effacees: count
  });
});

// Fonction pour ajouter une anomalie
function addAnomaly(id_credit, motif, fichier = null) {
  anomalies.unshift({
    id_credit: id_credit || 'inconnu',
    motif: motif,
    fichier: fichier,
    date: new Date().toISOString()
  });
  
  if (anomalies.length > 500) {
    anomalies = anomalies.slice(0, 500);
  }
  
  console.log(`[ANOMALIE] ${id_credit} : ${motif}`);
}

// Exporter le router directement (pas en tant qu'objet)
module.exports = router;