# Trajets automatiques pour Google Agenda

Ce script Google Apps Script estime les durées de déplacement avec Google Maps et réserve les créneaux dans un agenda **Trajets**. Il ajoute une marge, arrondit les horaires et calcule un trajet direct entre deux rendez-vous rapprochés. Ajoute `[sans trajet]` au titre ou à la description d’un rendez-vous pour l’exclure.

## Installation

1. Ouvre [Google Apps Script](https://script.google.com/) et colle le contenu de `Code.gs` dans ton projet. Si tu utilises déjà le script, garde le même projet pour réutiliser ton agenda **Trajets**.
2. Ouvre **Paramètres du projet → Propriétés du script** et renseigne les réglages ci-dessous. Garde tes valeurs personnelles dans Apps Script.
3. Exécute `apercu`, accorde les autorisations demandées par Google et vérifie les trajets dans le journal d’exécution. Cette commande laisse les agendas intacts.
4. Exécute `installer` pour créer ou réutiliser l’agenda **Trajets**, synchroniser les déplacements et activer les déclencheurs. Relance cette commande si tu changes la liste des agendas sources.
5. Exécute `arreter` pour désactiver les déclencheurs. Les trajets déjà inscrits restent dans l’agenda.

| Propriété | Valeur |
| --- | --- |
| `ADRESSE_BASE` | Ton adresse de départ. Obligatoire. |
| `CALENDRIERS_SOURCE` | Liste JSON d’identifiants. Par défaut, `["primary"]` désigne ton agenda principal. Pour en ajouter un, utilise `["primary", "ID_AUTRE_AGENDA"]`. |
| `CENTRE_REFERENCE` | Adresse du point de référence du centre-ville. Laisse vide pour désactiver le supplément. |
| `LIEU_SPECIAL` | Liste JSON facultative de fragments d’adresse, par exemple `["nom de la rue", "commune"]`. Si le lieu contient tous ces fragments, les trajets entre ce lieu et ton adresse de départ réservent au moins 15 minutes. |

Le bloc `CONFIG` permet d’ajuster le mode de transport, l’horizon de planification et les marges. Si le journal indique que la limite de 80 nouveaux itinéraires par exécution est atteinte, réduis `JOURS`, puis relance `apercu`.
