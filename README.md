# ANEF Suivi (perso) — MVP

Extension Chrome MV3, usage perso, chargée en mode développeur. 100 % locale : aucun appel hors du domaine ANEF.

## Installation
1. `chrome://extensions` → **Mode développeur** ON
2. **Charger l'extension non empaquetée** → dossier `anef-mvp/`
3. Se connecter sur ANEF → « Mon compte » : le statut est lu automatiquement.

## Fonctions
- Statut réel décodé (stepper + frise + notifications + détail), étape /12 + sous-étape
- Barre de progression, description de l'étape, durée depuis le statut / depuis le dépôt
- Entretien (date, lieu), préfecture, n° national, n° décret, DMR + attestation
- Timeline des événements ANEF (écarts entre événements)
- Historique local des changements de statut
- Garde anti-régression (un signal grossier ne fait pas reculer l'étape)
- Vérification auto (30 min → 12 h) : onglet ANEF ouvert → appel direct → repli fenêtre minimisée
- Notifications (changement d'étape, nouvel événement), badge d'étape sur l'icône
- Mode privé (floute les données), export PNG, copie résumé, export JSON brut, effacement
- Panneau « Signaux bruts » (macro, drapeaux, frise, source de dérivation) pour analyser le dossier

Volontairement absent : stats communautaires (Supabase), auto-login (identifiants stockés).

## Architecture
| Fichier | Rôle |
|---|---|
| `lib/collect.js` | Appels API ANEF (cookies de session) → payload brut |
| `lib/mapper.js` | Recombinaison des signaux → code statut |
| `lib/statuts.js` | Dictionnaire des 52 codes (étape, rang, texte) |
| `lib/util.js` | Dates, durées, régression |
| `content/page.js` | Monde MAIN : collecte quand on est sur « Mon compte » |
| `content/bridge.js` | Relais page ↔ service worker |
| `background.js` | Stockage, historique, alarmes, notifications, repli fenêtre |
| `popup/` | UI |

## Fiabilité des hypothèses (méthode vu / déduit / inconnu)
| Élément | Niveau | Source |
|---|---|---|
| Endpoints `dossier-stepper`, `frise-stepper`, `notifications`, `dossiers/{id}`, `dmr` | Déduit | Code de l'extension de référence (oct. 2026), non observé sur ton compte |
| `statut` = `MACRO\|DRAPEAUX` en clair (plus de RSA) | Déduit | Commentaires réf. « changement d'API juillet 2026 » |
| Table `type_frise` × `id_active` → étape | Déduit | Rétro-conçue par la réf. ; parité testée 13 860 cas, 0 écart |
| Macros autres que `DEMANDE_EN_COURS_DE_TRAITEMENT` / `DECISION_NOTIFIEE` | Inconnu | Marquées « hypothèses » dans la réf. |
| Envoi des cookies depuis le service worker (appel direct) | Inconnu | Dépend des attributs SameSite ANEF → repli fenêtre prévu |

À valider sur ton compte : ouvrir « Signaux bruts » et comparer avec DevTools → Network.

## Tests faits
- Parité mapper vs référence : 13 860 combinaisons, 0 écart
- E2E Chromium headless (API ANEF simulée) : collecte auto, refresh via onglet, anti-régression, alerte session, alarme

## Licence
Dictionnaire et logique de mapping repris de [Letranger-dev/anef-extension](https://github.com/Letranger-dev/anef-extension) (MIT) — voir `THIRD_PARTY_LICENSE.txt`. Non affilié au ministère de l'Intérieur.
