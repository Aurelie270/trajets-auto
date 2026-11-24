const CONFIG = {
  MODE: 'DRIVING',
  JOURS: 365,
  PAUSE_RETOUR_HEURES: 4,
  ARRONDI_MINUTES: 5,
  FUSEAU: 'Europe/Paris',
  CENTRE_RAYON_METRES: 800,
  CENTRE_SUPPLEMENT_MINUTES: 15,
  TRAJET_SPECIAL_MINUTES: 15
};

const MARQUE = '[TRAJETS_AUTO_V1]';
const TAG_TRAJET = 'trajets_auto_meta';
const MEMO = new Map();

function lireListe_(props, nom, valeurParDefaut) {
  const texte = props.getProperty(nom);
  if (texte === null || !texte.trim()) return valeurParDefaut;

  let valeurs;
  try {
    valeurs = JSON.parse(texte);
  } catch (_) {
    throw new Error(nom + ' doit contenir une liste JSON.');
  }

  if (!Array.isArray(valeurs) || valeurs.some(v => typeof v !== 'string' || !v.trim())) {
    throw new Error(nom + ' doit contenir une liste de textes non vides.');
  }

  return valeurs.map(v => v.trim());
}

function reglagesPrives_() {
  const props = PropertiesService.getScriptProperties();
  return {
    adresseBase: (props.getProperty('ADRESSE_BASE') || '').trim(),
    calendriersSource: lireListe_(props, 'CALENDRIERS_SOURCE', ['primary']),
    centreReference: (props.getProperty('CENTRE_REFERENCE') || '').trim(),
    lieuSpecial: lireListe_(props, 'LIEU_SPECIAL', [])
      .map(normaliserAdresse_)
      .filter(Boolean)
  };
}

function normaliserAdresse_(texte) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function apercu() {
  synchroniser_(true);
}

function synchroniserTrajets() {
  synchroniser_(false);
}

function agendaModifie() {
  synchroniser_(false);
}

function installer() {
  const reglages = reglagesPrives_();
  valider_(reglages);

  const props = PropertiesService.getScriptProperties();
  const cibleId = props.getProperty('AGENDA_TRAJETS');
  let cible = cibleId ? CalendarApp.getCalendarById(cibleId) : null;

  if (cibleId && !cible) {
    throw new Error('L’agenda Trajets enregistré est inaccessible.');
  }

  const sources = agendasSources_(reglages);

  if (!cible) {
    cible = CalendarApp.createCalendar('Trajets', {
      timeZone: CONFIG.FUSEAU,
      description: 'Trajets automatiques avec marges et horaires arrondis.'
    });
    cible.setColor('#8e24aa');
    props.setProperty('AGENDA_TRAJETS', cible.getId());
  }

  if (sources.some(agenda => agenda.getId() === cible.getId())) {
    throw new Error('Trajets ne doit pas être un agenda source.');
  }

  synchroniserTrajets();
  arreter();

  sources.forEach(agenda => {
    ScriptApp.newTrigger('agendaModifie')
      .forUserCalendar(agenda.getId())
      .onEventUpdated()
      .create();
  });

  ScriptApp.newTrigger('synchroniserTrajets')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Installation terminée : suivi des modifications et vérification chaque heure.');
}

function arreter() {
  const fonctions = ['synchroniserTrajets', 'agendaModifie'];

  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (fonctions.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function valider_(reglages) {
  if (!reglages.adresseBase) {
    throw new Error('Renseigner votre adresse de départ.');
  }
  if (!reglages.calendriersSource.length) {
    throw new Error('Aucun agenda source.');
  }
  if (!['DRIVING', 'WALKING', 'BICYCLING'].includes(CONFIG.MODE)) {
    throw new Error('Mode de transport inconnu.');
  }
  if (!Number.isInteger(CONFIG.ARRONDI_MINUTES) || CONFIG.ARRONDI_MINUTES <= 0) {
    throw new Error('Arrondi invalide.');
  }
  if (!Number.isInteger(CONFIG.JOURS) || CONFIG.JOURS < 1) {
    throw new Error('Nombre de jours invalide.');
  }
}

function agendasSources_(reglages) {
  const agendas = new Map();

  reglages.calendriersSource.forEach(id => {
    const agenda = id === 'primary'
      ? CalendarApp.getDefaultCalendar()
      : CalendarApp.getCalendarById(id);

    if (!agenda) {
      throw new Error('Agenda source inaccessible : ' + id);
    }

    agendas.set(agenda.getId(), agenda);
  });

  return Array.from(agendas.values());
}

function ignorer_(evenement) {
  const lieu = evenement.getLocation().trim();
  return (
    evenement.isAllDayEvent() ||
    !lieu ||
    /^https?:\/\/\S+$/i.test(lieu) ||
    /\b(teams|zoom|google meet|visioconférence|visioconference|visio)\b/i.test(lieu) ||
    /\[sans trajet\]/i.test(evenement.getTitle() + '\n' + evenement.getDescription()) ||
    evenement.getMyStatus() === CalendarApp.GuestStatus.NO ||
    evenement.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT
  );
}

function memoriser_(type, donnees, calculer) {
  const cle = type + '_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(donnees))
  );

  if (MEMO.has(cle)) return MEMO.get(cle);

  const cache = CacheService.getScriptCache();
  const texte = cache.get(cle);

  if (texte !== null) {
    const valeur = JSON.parse(texte);
    MEMO.set(cle, valeur);
    return valeur;
  }

  const valeur = calculer();
  MEMO.set(cle, valeur);
  cache.put(cle, JSON.stringify(valeur), 21600);
  return valeur;
}

function position_(adresse) {
  return memoriser_('position', adresse.trim().toLowerCase(), () => {
    const resultat = Maps.newGeocoder()
      .setLanguage('fr')
      .setRegion('fr')
      .geocode(adresse);

    if (resultat.status !== 'OK' || !resultat.results || !resultat.results.length) {
      throw new Error('Adresse impossible à localiser : ' + adresse);
    }

    return resultat.results[0].geometry.location;
  });
}

function estAuCentre_(adresse, reference) {
  const point = position_(adresse);
  const centre = position_(reference);
  const radians = valeur => valeur * Math.PI / 180;
  const deltaLat = radians(point.lat - centre.lat);
  const deltaLng = radians(point.lng - centre.lng);

  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(centre.lat)) * Math.cos(radians(point.lat)) *
    Math.sin(deltaLng / 2) ** 2;

  const distance = 6371000 * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(Math.max(0, 1 - a))
  );

  return distance <= CONFIG.CENTRE_RAYON_METRES;
}

function margeHabituelle_(minutes) {
  if (minutes <= 15) return 5;
  if (minutes <= 45) return 10;
  if (minutes <= 90) return 15;
  return 20;
}

function calculateurDuree_() {
  let appels = 0;

  return (origine, destination) => {
    if (origine.trim().toLowerCase() === destination.trim().toLowerCase()) {
      return 0;
    }

    return memoriser_('duree', [origine, destination, CONFIG.MODE], () => {
      if (++appels > 80) {
        throw new Error('Plus de 80 nouveaux itinéraires : réduire JOURS dans CONFIG.');
      }

      const resultat = Maps.newDirectionFinder()
        .setOrigin(origine)
        .setDestination(destination)
        .setMode(Maps.DirectionFinder.Mode[CONFIG.MODE])
        .setLanguage('fr')
        .getDirections();

      const route = resultat.routes && resultat.routes[0];

      if (resultat.status !== 'OK' || !route || !route.legs || !route.legs.length) {
        throw new Error(
          'Itinéraire introuvable : ' + origine + ' → ' + destination +
          '. Vérifier les adresses des rendez-vous.'
        );
      }

      const secondes = route.legs.reduce(
        (total, portion) => total + portion.duration.value,
        0
      );
      return Math.ceil(secondes / 60);
    });
  };
}

function planifier_(rdvs, premierJour, dernierJour, reglages) {
  const groupes = new Map();
  const duree = calculateurDuree_();
  const trajets = [];

  rdvs.sort((a, b) => a.debut - b.debut);

  rdvs.forEach(rdv => {
    const jour = Utilities.formatDate(rdv.debut, CONFIG.FUSEAU, 'yyyy-MM-dd');
    if (jour < premierJour || jour > dernierJour) return;

    if (!groupes.has(jour)) groupes.set(jour, []);
    groupes.get(jour).push(rdv);
  });

  function ajouter(cle, jour, origine, destination, ancre, avant, detail) {
    const brut = duree(origine, destination);
    if (!brut) return;

    const marge = margeHabituelle_(brut);
    const centre = CONFIG.MODE === 'DRIVING' && reglages.centreReference && (
      estAuCentre_(origine, reglages.centreReference) ||
      estAuCentre_(destination, reglages.centreReference)
    );
    const supplement = centre ? CONFIG.CENTRE_SUPPLEMENT_MINUTES : 0;

    const estLieuSpecial = adresse => {
      const texte = normaliserAdresse_(adresse);
      return reglages.lieuSpecial.every(fragment => texte.includes(fragment));
    };
    const estMaison = adresse =>
      normaliserAdresse_(adresse) === normaliserAdresse_(reglages.adresseBase);

    const trajetSpecial = reglages.lieuSpecial.length > 0 && (
      (estMaison(origine) && estLieuSpecial(destination)) ||
      (estLieuSpecial(origine) && estMaison(destination))
    );

    const totalMinutes = trajetSpecial
      ? Math.max(CONFIG.TRAJET_SPECIAL_MINUTES, brut + marge + supplement)
      : brut + marge + supplement;

    const dureeMs = totalMinutes * 60000;
    const tranche = CONFIG.ARRONDI_MINUTES * 60000;
    const debut = avant
      ? new Date(Math.floor((+ancre - dureeMs) / tranche) * tranche)
      : new Date(+ancre);
    const fin = avant
      ? new Date(+ancre)
      : new Date(Math.ceil((+ancre + dureeMs) / tranche) * tranche);

    trajets.push({
      cle,
      jour,
      origine,
      destination,
      brut,
      marge,
      supplement,
      debut,
      fin,
      minutes: Math.round((fin - debut) / 60000),
      detail
    });
  }

  groupes.forEach((liste, jour) => {
    liste.forEach((rdv, i) => {
      const precedent = liste[i - 1];
      const suivant = liste[i + 1];
      const seuil = CONFIG.PAUSE_RETOUR_HEURES * 3600000;
      const procheAvant = precedent && rdv.debut - precedent.fin <= seuil;
      const procheApres = suivant && suivant.debut - rdv.fin <= seuil;

      if (precedent && rdv.debut < precedent.fin) {
        console.warn('Rendez-vous qui se chevauchent : ' + precedent.titre + ' / ' + rdv.titre);
      }

      ajouter(
        'vers|' + rdv.cle,
        jour,
        procheAvant ? precedent.lieu : reglages.adresseBase,
        rdv.lieu,
        rdv.debut,
        true,
        'Vers : ' + rdv.titre
      );

      if (!procheApres) {
        ajouter(
          'retour|' + rdv.cle,
          jour,
          rdv.lieu,
          reglages.adresseBase,
          rdv.fin,
          false,
          'Retour après : ' + rdv.titre
        );
      }
    });
  });

  return trajets;
}

function description_(trajet) {
  const lignes = [
    trajet.detail,
    '',
    'Départ : ' + trajet.origine,
    'Arrivée : ' + trajet.destination,
    '',
    'Trajet estimé : ' + trajet.brut + ' min',
    'Stationnement et marche : ' + trajet.marge + ' min'
  ];

  if (trajet.supplement) {
    lignes.push('Marge supplémentaire centre-ville : ' + trajet.supplement + ' min');
  }

  lignes.push(
    'Temps réservé, arrondi inclus : ' + trajet.minutes + ' min',
    '',
    'Estimation sans trafic en direct.'
  );

  return lignes.join('\n');
}

function lireMeta_(evenement) {
  try {
    const interne = evenement.getTag(TAG_TRAJET);
    if (interne) return JSON.parse(interne);

    const description = evenement.getDescription();
    if (description.startsWith(MARQUE)) {
      return JSON.parse(description.split('\n')[0].slice(MARQUE.length));
    }

    return null;
  } catch (_) {
    return null;
  }
}

function formaterDate_(date) {
  return Utilities.formatDate(date, CONFIG.FUSEAU, 'dd/MM/yyyy HH:mm');
}

function synchroniser_(simulation) {
  const reglages = reglagesPrives_();
  valider_(reglages);
  const verrou = LockService.getScriptLock();

  if (!verrou.tryLock(1000)) {
    console.log('Une synchronisation est déjà en cours.');
    return;
  }

  try {
    MEMO.clear();

    const jour = Utilities.formatDate(new Date(), CONFIG.FUSEAU, 'yyyy-MM-dd');
    const debut = new Date(Date.parse(jour + 'T00:00:00Z') - 86400000);
    const fin = new Date(+debut + (CONFIG.JOURS + 4) * 86400000);
    const limite = Utilities.formatDate(
      new Date(Date.parse(jour + 'T12:00:00Z') + CONFIG.JOURS * 86400000),
      CONFIG.FUSEAU,
      'yyyy-MM-dd'
    );

    const cibleId = PropertiesService.getScriptProperties().getProperty('AGENDA_TRAJETS');
    const rdvs = [];
    const dejaVus = new Set();

    agendasSources_(reglages).forEach(agenda => {
      if (agenda.getId() === cibleId) {
        throw new Error('Trajets ne doit pas être un agenda source.');
      }

      agenda.getEvents(debut, fin).forEach(evenement => {
        if (ignorer_(evenement)) return;

        const cle = evenement.getId() + '|' + evenement.getStartTime().toISOString();
        if (dejaVus.has(cle)) return;
        dejaVus.add(cle);

        rdvs.push({
          cle,
          titre: evenement.getTitle(),
          lieu: evenement.getLocation().trim(),
          debut: evenement.getStartTime(),
          fin: evenement.getEndTime()
        });
      });
    });

    // Calculer tous les trajets avant de modifier l’agenda.
    const trajets = planifier_(rdvs, jour, limite, reglages);

    if (simulation) {
      console.log('APERÇU : ' + trajets.length + ' trajets. Aucune modification.');
      trajets.forEach(trajet => console.log(
        formaterDate_(trajet.debut) + ' → ' + formaterDate_(trajet.fin) +
        '\n' + description_(trajet)
      ));
      return;
    }

    if (!cibleId) {
      throw new Error('Exécuter installer une première fois.');
    }
    const cible = CalendarApp.getCalendarById(cibleId);
    if (!cible) {
      throw new Error('Agenda Trajets inaccessible.');
    }

    const existants = cible.getEvents(
      new Date(+debut - 7 * 86400000),
      new Date(+fin + 7 * 86400000)
    );
    const index = new Map();

    existants.forEach(evenement => {
      const meta = lireMeta_(evenement);
      if (meta && meta.jour >= jour && meta.jour <= limite) {
        if (!index.has(meta.cle)) index.set(meta.cle, []);
        index.get(meta.cle).push(evenement);
      }
    });

    trajets.forEach(trajet => {
      const meta = JSON.stringify({ cle: trajet.cle, jour: trajet.jour });
      const description = description_(trajet);
      const liste = index.get(trajet.cle) || [];
      let evenement = liste.shift();

      if (!evenement) {
        // La marque provisoire permet de retrouver le trajet si l’écriture est interrompue.
        evenement = cible.createEvent('Trajet', trajet.debut, trajet.fin, {
          description: MARQUE + meta + '\n' + description,
          location: trajet.destination
        });
        evenement.setTransparency(CalendarApp.EventTransparency.OPAQUE).removeAllReminders();
      }

      if (evenement.getTag(TAG_TRAJET) !== meta) {
        evenement.setTag(TAG_TRAJET, meta);
      }
      if (+evenement.getStartTime() !== +trajet.debut || +evenement.getEndTime() !== +trajet.fin) {
        evenement.setTime(trajet.debut, trajet.fin);
      }
      if (evenement.getDescription() !== description) {
        evenement.setDescription(description);
      }
      if (evenement.getTitle() !== 'Trajet') {
        evenement.setTitle('Trajet');
      }
      if (evenement.getLocation() !== trajet.destination) {
        evenement.setLocation(trajet.destination);
      }

      liste.forEach(doublon => doublon.deleteEvent());
      index.delete(trajet.cle);
    });

    // L’index ne contient que les trajets générés par le script dans la période suivie.
    index.forEach(liste => {
      liste.forEach(evenement => {
        if (+evenement.getStartTime() > Date.now()) {
          evenement.deleteEvent();
        }
      });
    });

    console.log(trajets.length + ' trajets synchronisés.');
  } finally {
    verrou.releaseLock();
  }
}
