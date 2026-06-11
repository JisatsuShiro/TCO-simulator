# Serveur relais cantonnement (Voie Libre)

Petit serveur WebSocket qui met en relation les opérateurs d'une même partie de
cantonnement. Il relaie la présence (qui est connecté, sur quelle gare) entre les
navigateurs, qui ne peuvent pas communiquer directement.

Indépendant du front : sa seule dépendance est `ws`. Il n'est **pas** inclus dans le
bundle de l'application.

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
   npm install --omit=dev
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
