# Serveur relais cantonnement (Voie Libre)

Petit serveur WebSocket qui met en relation les opérateurs d'une même partie de
cantonnement. Il relaie la présence (qui est connecté, sur quelle gare) entre les
navigateurs, qui ne peuvent pas communiquer directement.

Indépendant du front : sa seule dépendance est `ws`. Il n'est **pas** inclus dans le
bundle de l'application.

## Ligne CAPI partagée

Le même relais porte la ligne CAPI (Rennes – Châteaubriant), partagée entre tous
les opérateurs connectés. Le serveur détient l'état de la ligne, joue les
dialogues et rediffuse l'état ; l'horloge est la sienne. Les messages sont
préfixés `capi-` (voir l'en-tête de `capi.js`).

- Le moteur est celui de `src/capi` : `npm run build` le compile dans `engine/`
  (ignoré par git), et `npm start` le fait avant de démarrer. À refaire après tout
  changement de `src/capi/{ligne,alarmes,dialogues}.ts`.
- Identifiants uniques, vérifiés par le serveur : `CAPI_USER` et `CAPI_PASSWORD`
  (défaut `rennesp2` / `rennesp2` : à changer en production).
- Une gare ne peut être tenue que par un opérateur. Un poste temporaire (Vern,
  Janzé, Retiers) n'existe dans CAPI que s'il est tenu ; il entre en service à
  l'arrivée de son opérateur (dialogue ES joué par le serveur) sauf si le canton
  qu'il scinderait est occupé, auquel cas il reste en cessation de service. Rennes et Châteaubriant sont toujours
  en service.
- La ligne disparaît quand le dernier opérateur la quitte.

## Lancer en local (développement)

```bash
cd server
npm install
node index.js            # écoute sur ws://127.0.0.1:8081
```

Puis, côté front, indique l'URL du relais via une variable d'environnement Vite —
crée `.env.local` à la racine du projet :

```
VITE_CANTON_WS_URL=ws://localhost:8081
```

et lance le front normalement (`npm run dev`). Ouvre deux fenêtres pour tester à deux.

Variables d'environnement du serveur :

- `PORT` (défaut `8081`)
- `HOST` (défaut `127.0.0.1`)

## Déploiement sur le VPS (Apache + HTTPS)

Le serveur écoute en local et n'est **pas** exposé directement. Apache le publie en
`wss://TON-DOMAINE/canton` via `mod_proxy_wstunnel` (chiffrement géré par Apache).

1. Installer les dépendances et faire tourner le process en continu (pm2 ou systemd) :

   ```bash
   cd server
   npm install        # typescript sert à compiler le moteur CAPI (voir plus bas)
   # pm2 :
   pm2 start index.js --name canton
   pm2 save
   ```

2. Activer les modules proxy Apache :

   ```bash
   sudo a2enmod proxy proxy_http proxy_wstunnel
   sudo systemctl reload apache2
   ```

3. Dans le vhost **HTTPS** du site, ajouter :

   ```apache
   ProxyPass        /canton ws://127.0.0.1:8081/
   ProxyPassReverse /canton ws://127.0.0.1:8081/
   ```

   Recharger Apache. Le front déduit alors l'URL `wss://TON-DOMAINE/canton` tout seul
   depuis `window.location` — **aucune** variable `VITE_CANTON_WS_URL` n'est nécessaire
   en production.

### Exemple systemd (alternative à pm2)

`/etc/systemd/system/canton.service` :

```ini
[Unit]
Description=Voie Libre — relais cantonnement
After=network.target

[Service]
WorkingDirectory=/chemin/vers/server
ExecStart=/usr/bin/node index.js
Environment=PORT=8081
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now canton
```

## Protocole (résumé)

Messages JSON `{ t: <type>, ... }`. Voir `src/net/protocol.ts` côté front pour les types.

Client → serveur : `join {code, gare, name?}`, `leave`, `ping`, `train {toGare, train}` (phase 2).
Serveur → client : `joined {you, members}`, `presence {members}`, `error {code, message}`,
`pong`, `train {...}` / `train-undelivered {toGare}` (phase 2).
