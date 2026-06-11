// Synchronise l'horloge de la simulation sur l'horloge autoritative du serveur
// de cantonnement, quand une partie est active et que l'opérateur est en poste.
//
// Branchement :
//   - tant que la session est connectée ET qu'on est en mode 'play', on
//     enregistre auprès du store un « émetteur de vitesse » (setSpeed sera
//     relayé au serveur) et on lève le drapeau `clockSynced` (le tick local
//     est neutralisé).
//   - chaque message d'horloge serveur met à jour `roomClock` ; on applique
//     alors le temps + la vitesse au store (`applyRemoteClock`), ce qui
//     dispatche les events échus localement.
//
// À monter une seule fois à la racine de la sim. Côté desktop comme mobile,
// l'appeler dans App (avant l'embranchement mobile) suffit : App est la racine
// commune.

import { useEffect } from 'react';
import { useGessieStore } from '../store/useGessieStore';
import { useCantonnementSession } from './useCantonnementSession';

export function useCantonnementClock(): void {
  const status = useCantonnementSession((s) => s.status);
  const roomClock = useCantonnementSession((s) => s.roomClock);
  const gare = useCantonnementSession((s) => s.gare);
  const setClockSpeed = useCantonnementSession((s) => s.setClockSpeed);
  const sendTrain = useCantonnementSession((s) => s.sendTrain);
  const onTrain = useCantonnementSession((s) => s.onTrain);
  const mode = useGessieStore((s) => s.player.mode);

  const active = status === 'connected' && mode === 'play';

  // (Dé)branche la synchro : relaie setSpeed au serveur + neutralise le tick local.
  useEffect(() => {
    if (!active) return;
    useGessieStore.getState().setClockSyncSender(setClockSpeed);
    return () => {
      useGessieStore.getState().setClockSyncSender(null);
    };
  }, [active, setClockSpeed]);

  // Applique l'horloge serveur à chaque diffusion.
  useEffect(() => {
    if (!active || !roomClock) return;
    useGessieStore.getState().applyRemoteClock(roomClock.simTime, roomClock.speed);
  }, [active, roomClock]);

  // (Dé)branche le transfert des trains sortants + l'écoute des entrants.
  useEffect(() => {
    if (!active || !gare) return;
    useGessieStore.getState().setTrainHandoff(gare, (h) => sendTrain(h.toGare, h.train));
    const off = onTrain((msg) => {
      useGessieStore.getState().spawnRemoteTrain(msg.train);
    });
    return () => {
      off();
      useGessieStore.getState().setTrainHandoff(null, null);
    };
  }, [active, gare, sendTrain, onTrain]);
}
