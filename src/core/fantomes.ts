// Révisions fantômes : de petites questions qui apparaissent dans l'éditeur, comme une suggestion
// de Copilot, en fonction du code écrit et de la maîtrise des notions.
// Ce fichier contient la logique sans VS Code : quel mot évoque quelle notion, quelle notion
// proposer, quelle question poser, et l'enregistrement de la réponse.

import { genererQcmDefinition, genererQcmNotion, genererTrou, PREUVES, type Exercice, type Hasard } from './exercices';
import { ajouterHistorique, enregistrerEtat, type NotionRevision } from './notionsRevision';
import { appliquerResultat, estARevoir, joursDeRetard, type Changement, type Resultat } from './repetition';
import { aujourdhui, motsCles, motsProches, normaliser } from './texte';

/** Mots du C/C++ et les mots qu'on cherche dans le nom (ou les autres noms) des notions. */
export const MOTS_DU_CODE: Record<string, string[]> = {
  virtual: ['virtuel', 'virtuelle', 'virtual', 'polymorphisme', 'vft', 'table'],
  override: ['redefinition', 'override', 'polymorphisme'],
  final: ['heritage', 'redefinition'],
  template: ['template', 'generique', 'genericite'],
  typename: ['template', 'generique'],
  class: ['classe', 'objet', 'poo', 'instance'],
  struct: ['structure'],
  public: ['encapsulation', 'heritage', 'accesseur'],
  private: ['encapsulation', 'accesseur'],
  protected: ['encapsulation', 'heritage'],
  operator: ['operateur', 'surcharge'],
  new: ['pointeur', 'instance', 'constructeur'],
  delete: ['pointeur', 'destructeur'],
  nullptr: ['pointeur'],
  unique_ptr: ['pointeur'],
  shared_ptr: ['pointeur', 'polymorphisme'],
  abstract: ['abstraite', 'abstrait'],
  const: ['accesseur', 'encapsulation'],
  this: ['instance', 'objet'],
  friend: ['encapsulation'],
  namespace: ['decoupage', 'module'],
  include: ['decoupage', 'compilateur'],
  try: ['exception'],
  catch: ['exception'],
  throw: ['exception'],
  static: ['classe', 'attribut'],
};

/** Notions évoquées par un mot du code (« virtual » → Polymorphisme, Virtual Function Table…). */
export function notionsPourMot(mot: string, notions: NotionRevision[]): NotionRevision[] {
  const cibles = MOTS_DU_CODE[mot.replace(/^std::/, '')];
  if (!cibles) return [];
  return notions.filter((n) => {
    const mots = [n.titre, n.nom, ...n.aliases].flatMap((x) => motsCles(x));
    return cibles.some((c) => mots.some((m) => motsProches(normaliser(c), m) || m.startsWith(normaliser(c))));
  });
}

/** Dernier mot tapé juste avant le curseur (« virtual », « std::shared_ptr »…). */
export function motAvantCurseur(debutDeLigne: string): string | undefined {
  const m = debutDeLigne.match(/([A-Za-z_][A-Za-z0-9_:]*)\s*[\s(<{;:]?$/);
  return m?.[1].replace(/^std::/, '');
}

/**
 * Notion à proposer, tirée au hasard en favorisant les notions fragiles :
 * à revoir aujourd'hui (×3), en retard (+1 par semaine), peu avancées, souvent ratées.
 * Les notions mûres qui ne sont pas à revoir ne sont presque jamais proposées.
 */
export function choisirNotion(candidates: NotionRevision[], hasard: Hasard = Math.random, date = aujourdhui()): NotionRevision | undefined {
  const avecDefinition = candidates.filter((n) => n.definitions.length > 0 || n.notesPerso);
  if (avecDefinition.length === 0) return undefined;
  const poids = avecDefinition.map((n) => {
    const aRevoir = estARevoir(n.etat, date);
    let p = (7 - n.etat.niveau) * (1 + Math.min(5, n.etat.echecs));
    if (aRevoir) p *= 3 + Math.floor(joursDeRetard(n.etat, date) / 7);
    else if (n.etat.niveau >= 5) p *= 0.1;
    return Math.max(0.05, p);
  });
  let tirage = hasard() * poids.reduce((s, p) => s + p, 0);
  for (let i = 0; i < avecDefinition.length; i++) {
    tirage -= poids[i];
    if (tirage <= 0) return avecDefinition[i];
  }
  return avecDefinition[avecDefinition.length - 1];
}

/** Question courte (quelques secondes) : mot manquant ou QCM « quelle notion ? ». */
export function questionRapide(n: NotionRevision, toutes: NotionRevision[], hasard: Hasard = Math.random): Exercice | undefined {
  const ordre = hasard() < 0.5 ? ['trou', 'qcm_notion', 'qcm_definition'] : ['qcm_notion', 'trou', 'qcm_definition'];
  for (const type of ordre) {
    const e = type === 'trou' ? genererTrou(n, toutes, hasard) : type === 'qcm_notion' ? genererQcmNotion(n, toutes, hasard) : genererQcmDefinition(n, toutes, hasard);
    if (e) return e;
  }
  return undefined;
}

/** Texte gris affiché en fin de ligne (court : il ne doit pas gêner la lecture du code). */
export function texteFantome(n: NotionRevision, e: Exercice, declencheur?: string): string {
  const quoi = e.type === 'trou' ? 'un mot manque dans ta définition' : e.type === 'qcm_notion' ? 'de quelle notion parle-t-on ?' : 'quelle est sa définition ?';
  // Pour « de quelle notion parle-t-on ? », afficher le nom de la notion donnerait la réponse
  const titre = e.type === 'qcm_notion' ? 'Révision' : n.titre.length > 32 ? `${n.titre.slice(0, 31)}…` : n.titre;
  const pourquoi = declencheur ? ` (« ${declencheur} »)` : '';
  return `🌱 ${titre}${pourquoi} : ${quoi}  Tab · Échap`;
}

/**
 * Enregistre la réponse à une révision fantôme, comme dans une séance : elle compte pour la répétition
 * espacée si la notion est à revoir aujourd'hui, sinon c'est un entraînement (pièces, historique).
 */
export function enregistrerReponseRapide(
  coffre: string,
  n: NotionRevision,
  e: Exercice,
  resultat: Resultat,
  date = aujourdhui(),
): { compte: boolean; changement?: Changement } {
  const compte = estARevoir(n.etat, date);
  let changement: Changement | undefined;
  if (compte) {
    const r = appliquerResultat(n.etat, resultat, PREUVES[e.type], date);
    n.etat = r.etat;
    changement = r.changement;
    enregistrerEtat(n.chemin, n.etat);
  }
  ajouterHistorique(coffre, {
    date: new Date().toISOString(),
    notion: n.nom,
    type: e.type,
    resultat,
    compte,
    niveauAvant: changement?.avant,
    niveauApres: changement?.apres,
  });
  return { compte, changement };
}
