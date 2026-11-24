# Trajets automatiques pour Google Agenda

Ce script Google Apps Script estime les temps de trajet avec Google Maps et réserve les créneaux correspondants dans un agenda **Trajets**. Il ajoute une marge, arrondit les horaires et calcule un trajet direct entre deux rendez-vous rapprochés.

## Installation

1. Ouvrir [Google Apps Script](https://script.google.com/) et coller le contenu de `Code.gs` dans le projet. En cas de mise à jour, conserver le même projet pour réutiliser l’agenda **Trajets**.
2. Dans **Paramètres du projet → Propriétés du script**, renseigner les réglages ci-dessous. Saisir les valeurs personnelles directement dans Apps Script.
3. Exécuter `apercu`, accorder les autorisations demandées par Google et vérifier les trajets dans le journal d’exécution. L’aperçu laisse les agendas intacts.
4. Exécuter `installer` pour créer ou réutiliser l’agenda **Trajets**, synchroniser les déplacements et activer les déclencheurs. Relancer cette commande après une modification de la liste des agendas sources.

Pour désactiver les déclencheurs, exécuter `arreter`. Les trajets déjà inscrits restent dans l’agenda.

## Configuration

| Propriété | Valeur |
| --- | --- |
| `ADRESSE_BASE` | Adresse de départ. Obligatoire. |
| `CALENDRIERS_SOURCE` | Liste JSON d’identifiants d’agenda. Par défaut, `["primary"]` désigne l’agenda principal. Pour ajouter un agenda, utiliser `["primary", "ID_AUTRE_AGENDA"]`. |
| `CENTRE_REFERENCE` | Adresse de référence du centre-ville. Laisser vide pour désactiver la marge supplémentaire. |
| `LIEU_SPECIAL` | Liste JSON facultative de fragments d’adresse, par exemple `["nom de la rue", "commune"]`. Si le lieu contient tous ces fragments, le script réserve au moins 15 minutes pour les trajets entre ce lieu et l’adresse de départ. |

Le bloc `CONFIG` permet d’ajuster le mode de transport, l’horizon de planification, les marges et l’arrondi. Si le journal indique que la limite de 80 nouveaux itinéraires par exécution est atteinte, réduire `JOURS`, puis relancer `apercu`.
