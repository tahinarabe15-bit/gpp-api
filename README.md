# GPP Fonds — API Web Complète

## Architecture

```
Navigateur (Dashboard HTML)
        ↕ HTTP / REST
server.js  (Node.js + Express — port 3000)
        ↕ Pool de connexions
PostgreSQL (Fons_GPP @ localhost:5432)
    ├── gpp_conventions.conventions
    ├── gpp_exhaustives.f2_credits
    ├── gpp_exhaustives.f2_rejets
    ├── gpp_exhaustives.encours_credits
    ├── gpp_exhaustives.encours_historique
    └── gpp_exhaustives.encours_rejets
```

---

## Structure des fichiers

```
gpp-api/
├── .env                  ← VOS PARAMÈTRES (DB, signataires, etc.)
├── server.js             ← Point d'entrée — lance le serveur
├── db.js                 ← Connexion PostgreSQL
├── routes/
│   ├── credits.js        ← GET/POST /api/credits (F2)
│   ├── encours.js        ← GET/POST /api/encours
│   ├── conventions.js    ← GET/POST /api/conventions
│   └── lettres.js        ← POST /api/lettres/f3|ptf|sortie
├── services/
│   └── lettres.js        ← Génération Word (.docx)
└── public/
    └── index.html        ← Dashboard (servi automatiquement)
```

---

## Étape 1 — Configurer le fichier .env

Ouvrez `.env` et renseignez :

```env
DB_HOST=localhost          # adresse du serveur PostgreSQL
DB_PORT=5432               # port (défaut 5432)
DB_NAME=postgres           # nom de votre base
DB_USER=postgres           # utilisateur PostgreSQL
DB_PASSWORD=VOTRE_MDP      # mot de passe

PORT=3000                  # port de l'API (défaut 3000)

SIGNATAIRE_NOM=Aina RAFELIARISOA
SIGNATAIRE_TITRE=Directeur Général Adjoint
SIGNATAIRE2_NOM=Jean Marc RAVELOMANANTSOA
SIGNATAIRE2_TITRE=Directeur Général

IFP_NOM=PAMF
IFP_ID_GPP=PAMF_GPP_DIGITAUX
STOP_LOSS_PCT=30
```

---

## Étape 2 — Installer les dépendances

```bash
cd gpp-api
npm install
```

---

## Étape 3 — Démarrer l'API

```bash
node server.js
```

Vous verrez :
```
✅ PostgreSQL connecté — localhost:5432/postgres
🚀 API GPP Fonds démarrée
   → Dashboard : http://localhost:3000
   → API santé : http://localhost:3000/api/health
```

Ouvrez http://localhost:3000 dans votre navigateur — le dashboard se connecte automatiquement.

---

## Endpoints API disponibles

### Crédits F2
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | /api/credits | Liste paginée (page, limit, nature, search) |
| GET | /api/credits/:id | Détail d'un crédit |
| GET | /api/credits/stats/kpi | KPIs tableau de bord |
| GET | /api/credits/stats/historique | Évolution mensuelle |
| POST | /api/credits/import | Import fichier XLSX/CSV |
| GET | /api/credits/export/xlsx | Export XLSX |

### Encours
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | /api/encours | Liste paginée (annee, mois, search) |
| GET | /api/encours/sorties | Crédits sortis du PTF |
| POST | /api/encours/import | Import mensuel NON-écrasant |
| GET | /api/encours/export/xlsx | Export XLSX |

### Conventions
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | /api/conventions | Toutes les conventions |
| POST | /api/conventions | Créer ou mettre à jour |
| GET | /api/conventions/export/xlsx | Export XLSX |

### Lettres Word
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | /api/lettres/f3 | Génère lettre F3 (.docx) |
| POST | /api/lettres/ptf | Génère lettre niveau PTF/Stop Loss |
| POST | /api/lettres/sortie | Génère lettre de sortie PTF |
| GET | /api/lettres/preview/sorties | Prévisualise les crédits sortis |

---

## Si PostgreSQL est sur un autre serveur

Modifiez dans .env :
```env
DB_HOST=192.168.1.100    # adresse IP du serveur PostgreSQL
DB_PORT=5432
```

Assurez-vous que PostgreSQL accepte les connexions distantes :
- dans `postgresql.conf` : `listen_addresses = '*'`
- dans `pg_hba.conf` : ajouter une ligne pour votre IP

---

## Accès multi-utilisateurs

Plusieurs personnes peuvent utiliser le dashboard simultanément.
Partagez simplement l'URL : `http://VOTRE_IP:3000`

Exemple : si votre ordinateur est sur 192.168.1.50 :
→ `http://192.168.1.50:3000`

---

## Prochaines étapes suggérées

- [ ] Ajouter authentification JWT (login/mot de passe par utilisateur)
- [ ] Ajouter le logo GPP dans les lettres Word
- [ ] Configurer HTTPS pour accès sécurisé
- [ ] Planifier l'import automatique mensuel (cron job)
