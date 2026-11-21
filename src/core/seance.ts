// Séance de révision de durée libre : file des notions (et des pistes de solutions),
// enchaînement des exercices, correction (hors ligne ou par l'IA), bilan.

import {
  corriger,
  corrigeParIA,
  genererExercice,
  genererPiste,
  PREUVES,
  type Correction,
  type Exercice,
  type Hasard,
  type Reponse,
} from './exercices';
import {
  ajouterHistorique,
  enregistrerEtat,
  lireHistorique,
  lireNotionsRevision,
  serieDeJours,
  type EntreeHistorique,
  type NotionRevision,
} from './notionsRevision';
import { enregistrerPiste, ETIQUETTES_STATUT, lirePistesCoffre, type PisteRevision } from './pistes';
import { ajouterJours, appliquerResultat, estARevoir, type Changement } from './repetition';
import type { CorrecteurIA } from './correctionIA';
import { aujourdhui, normaliser } from './texte';

export type Perimetre = { type: 'tout' } | { type: 'prosit'; nom: string } | { type: 'notion'; nom: string };

export interface OptionsSeance {
  rapide: boolean;
  perimetre: Perimetre;
  /** Réviser même ce qui n'est pas encore à revoir (ne change pas la répétition espacée). */
  entrainement: boolean;
  /** Proposer « Vérifie la définition » (mode où les définitions IA ne sont pas acceptées d'office). */
  verifierDefinitions?: boolean;
  /** Correction par l'IA (explications, pistes à valider). Absent = séance hors ligne. */
  ia?: CorrecteurIA;
}

type Element = { genre: 'notion'; notion: NotionRevision } | { genre: 'piste'; piste: PisteRevision };

export interface EnCours {
  exercice: Exercice;
  notion?: NotionRevision;
  piste?: PisteRevision;
}

export interface ResultatReponse {
  correction: Correction;
  notion?: NotionRevision;
  piste?: PisteRevision;
  /** Changement de niveau, si la réponse a compté pour la répétition espacée. */
  changement?: Changement;
  compte: boolean;
}

export interface Bilan {
  faits: number;
  reussis: number;
  echecs: number;
  montees: Array<{ titre: string; avant: number; apres: number }>;
  descentes: Array<{ titre: string; avant: number; apres: number }>;
  verifiees: number;
  pistesValidees: number;
  restants: number;
  serie: number;
}

const MAX_TENTATIVES = 2;
/** Une piste déjà validée revient en vrai/faux au plus une fois par semaine. */
const JOURS_ENTRE_PISTES = 7;
/** Une piste est glissée après ce nombre de notions. */
const NOTIONS_PAR_PISTE = 3;

export function dansPerimetre(n: NotionRevision, p: Perimetre): boolean {
  if (p.type === 'tout') return true;
  if (p.type === 'notion') return n.nom === p.nom;
  return n.prosits.some((x) => normaliser(x) === normaliser(p.nom));
}

function pisteDansPerimetre(piste: PisteRevision, p: Perimetre): boolean {
  if (p.type === 'tout') return true;
  if (p.type === 'notion') return false;
  return normaliser(piste.prosit) === normaliser(p.nom);
}

const clePiste = (p: PisteRevision) => `piste:${p.id}`;

export class Seance {
  readonly notions: NotionRevision[];
  readonly pistes: PisteRevision[];
  private file: Element[] = [];
  private tentatives = new Map<string, number>();
  private precedent?: Exercice['type'];
  private courant?: EnCours;
  private readonly date: string;
  private readonly hasard: Hasard;
  readonly bilan: Bilan = { faits: 0, reussis: 0, echecs: 0, montees: [], descentes: [], verifiees: 0, pistesValidees: 0, restants: 0, serie: 0 };
  private niveauxDepart = new Map<string, number>();

  constructor(
    private readonly coffre: string,
    readonly options: OptionsSeance,
    hasard: Hasard = Math.random,
    date = aujourdhui(),
  ) {
    this.hasard = hasard;
    this.date = date;
    this.notions = lireNotionsRevision(coffre);
    this.pistes = lirePistesCoffre(coffre);
    for (const n of this.notions) this.niveauxDepart.set(n.chemin, n.etat.niveau);
    this.remplirFile();
  }

  /** Notions du périmètre à revoir aujourd'hui. */
  aRevoir(): NotionRevision[] {
    return this.notions.filter((n) => dansPerimetre(n, this.options.perimetre) && estARevoir(n.etat, this.date));
  }

  /** Pistes proposées dans cette séance : à valider (avec l'IA), ou validées pas revues depuis une semaine. */
  pistesAProposer(historique: EntreeHistorique[] = lireHistorique(this.coffre)): PisteRevision[] {
    const derniere = new Map<string, string>();
    for (const e of historique) if (e.notion.startsWith('piste:')) derniere.set(e.notion, e.date.slice(0, 10));
    const limite = ajouterJours(this.date, -JOURS_ENTRE_PISTES);
    return this.pistes.filter((p) => {
      if (!pisteDansPerimetre(p, this.options.perimetre)) return false;
      if (p.statut === 'a_valider') return !!this.options.ia && !this.options.rapide;
      if (this.options.entrainement) return true;
      const vue = derniere.get(clePiste(p));
      return !vue || vue <= limite;
    });
  }

  get enCours(): EnCours | undefined {
    return this.courant;
  }

  get enEntrainement(): boolean {
    return this.options.entrainement;
  }

  restants(): number {
    return this.file.length;
  }

  private melanger<T>(liste: T[]): T[] {
    return liste.map((x) => ({ x, r: this.hasard() })).sort((a, b) => a.r - b.r).map((y) => y.x);
  }

  private remplirFile(): void {
    let notions: NotionRevision[];
    if (this.options.entrainement) {
      notions = this.melanger(this.notions.filter((n) => dansPerimetre(n, this.options.perimetre))).sort((a, b) => a.etat.niveau - b.etat.niveau);
    } else {
      notions = this.melanger(this.aRevoir()).sort(
        (a, b) => (a.etat.prochaine ?? '').localeCompare(b.etat.prochaine ?? '') || a.etat.niveau - b.etat.niveau,
      );
    }
    // Les pistes à valider d'abord (elles complètent le CER), puis les autres
    const pistes = this.melanger(this.pistesAProposer()).sort((a, b) => Number(b.statut === 'a_valider') - Number(a.statut === 'a_valider'));

    // Une piste toutes les NOTIONS_PAR_PISTE notions
    this.file = [];
    let p = 0;
    notions.forEach((notion, i) => {
      this.file.push({ genre: 'notion', notion });
      if ((i + 1) % NOTIONS_PAR_PISTE === 0 && p < pistes.length) this.file.push({ genre: 'piste', piste: pistes[p++] });
    });
    while (p < pistes.length) this.file.push({ genre: 'piste', piste: pistes[p++] });
  }

  /** Exercice suivant, ou null quand la file est vide. */
  suivant(): EnCours | null {
    if (this.file.length === 0 && this.options.entrainement && this.bilan.faits > 0) this.remplirFile();
    const element = this.file.shift();
    if (!element) {
      this.courant = undefined;
      return null;
    }
    if (element.genre === 'piste') {
      this.courant = { exercice: genererPiste(element.piste), piste: element.piste };
    } else {
      const exercice = genererExercice(element.notion, this.notions, {
        rapide: this.options.rapide,
        precedent: this.precedent,
        hasard: this.hasard,
        verifierDefinitions: this.options.verifierDefinitions,
        ia: !!this.options.ia,
      });
      this.courant = { exercice, notion: element.notion };
    }
    this.precedent = this.courant.exercice.type;
    return this.courant;
  }

  /** Correction faite par l'IA (explication, piste à valider). */
  private async corrigerAvecIA(courant: EnCours, reponse: Reponse): Promise<Correction> {
    const { exercice, notion, piste } = courant;
    const ia = this.options.ia;
    if (exercice.type === 'explication') {
      const texte = reponse.type === 'texte' ? reponse.valeur.trim() : '';
      if (!texte || reponse.type === 'jeNeSaisPas') return { resultat: 'echec' };
      if (!ia || !notion) return { resultat: null, erreur: "L'IA n'est pas configurée." };
      const c = await ia.explication(notion, texte);
      return { resultat: c.resultat, ia: { note: c.note, pointsForts: c.pointsForts, aRevoir: c.aRevoir, modele: c.modele } };
    }
    // Piste à valider : même « je ne sais pas » est envoyé, pour que l'IA complète le CER
    if (!ia || !piste) return { resultat: null, erreur: "L'IA n'est pas configurée." };
    const nsp = reponse.type !== 'piste';
    const c = await ia.piste(piste, nsp ? { statut: 'a_valider', justification: "(je ne sais pas)" } : { statut: reponse.statut, justification: reponse.justification });
    enregistrerPiste(piste.chemin, piste.index, c.statut, c.justification);
    piste.statut = c.statut;
    piste.justification = c.justification;
    this.bilan.pistesValidees++;
    return {
      resultat: nsp ? 'echec' : c.resultat,
      bonneReponse: ETIQUETTES_STATUT[c.statut],
      ia: { retour: c.retour, statut: c.statut, justification: c.justification },
    };
  }

  async repondre(reponse: Reponse): Promise<ResultatReponse> {
    if (!this.courant) throw new Error('Aucun exercice en cours.');
    const courant = this.courant;
    const { notion, piste, exercice } = courant;

    let correction: Correction;
    if (corrigeParIA(exercice)) {
      try {
        correction = await this.corrigerAvecIA(courant, reponse);
      } catch (e) {
        correction = { resultat: null, erreur: e instanceof Error ? e.message : String(e) };
      }
    } else {
      correction = corriger(exercice, reponse);
    }

    const compte = !!notion && correction.resultat !== null && !this.options.entrainement && estARevoir(notion.etat, this.date);
    let changement: Changement | undefined;

    if (correction.resultat !== null) {
      this.bilan.faits++;
      if (correction.resultat === 'reussite') this.bilan.reussis++;
      if (correction.resultat === 'echec') this.bilan.echecs++;
    }

    if (notion && compte && correction.resultat) {
      const r = appliquerResultat(notion.etat, correction.resultat, PREUVES[exercice.type], this.date);
      notion.etat = r.etat;
      changement = r.changement;
    }
    if (notion && correction.verifiee) {
      notion.statut = 'verifie';
      this.bilan.verifiees++;
    }
    if (notion && (changement || correction.verifiee)) enregistrerEtat(notion.chemin, notion.etat, correction.verifiee ? 'verifie' : undefined);

    if (correction.resultat !== null) {
      ajouterHistorique(this.coffre, {
        date: new Date().toISOString(),
        notion: notion ? notion.nom : piste ? clePiste(piste) : '?',
        type: exercice.type,
        resultat: correction.resultat,
        compte,
        niveauAvant: changement?.avant,
        niveauApres: changement?.apres,
      });
    }

    // Notion ratée : elle revient un peu plus tard dans la séance
    if (notion && correction.resultat === 'echec') {
      const n = (this.tentatives.get(notion.chemin) ?? 0) + 1;
      this.tentatives.set(notion.chemin, n);
      if (n <= MAX_TENTATIVES) this.file.splice(Math.min(3, this.file.length), 0, { genre: 'notion', notion });
    }
    this.courant = undefined;
    return { correction, notion, piste, changement, compte };
  }

  /** La réponse tapée était bonne en fait (synonyme, faute de frappe) : on corrige le dernier résultat. */
  rectifier(resultat: ResultatReponse): ResultatReponse {
    const { notion } = resultat;
    if (resultat.correction.resultat !== 'echec' || !notion) return resultat;
    // On retire la nouvelle tentative programmée
    const index = this.file.findIndex((e) => e.genre === 'notion' && e.notion === notion);
    if (index >= 0) this.file.splice(index, 1);
    this.bilan.echecs--;
    this.bilan.reussis++;
    let changement = resultat.changement;
    if (resultat.compte && changement) {
      // Repart de l'état d'avant l'échec
      notion.etat = { ...notion.etat, niveau: changement.avant, echecs: Math.max(0, notion.etat.echecs - 1) };
      const r = appliquerResultat(notion.etat, 'reussite', 'trou', this.date);
      notion.etat = r.etat;
      changement = r.changement;
      enregistrerEtat(notion.chemin, notion.etat);
    }
    ajouterHistorique(this.coffre, { date: new Date().toISOString(), notion: notion.nom, type: 'rectification', resultat: 'reussite', compte: resultat.compte });
    return { ...resultat, correction: { ...resultat.correction, resultat: 'reussite' }, changement };
  }

  terminer(): Bilan {
    this.bilan.montees = [];
    this.bilan.descentes = [];
    for (const n of this.notions) {
      const avant = this.niveauxDepart.get(n.chemin) ?? 0;
      if (n.etat.niveau > avant) this.bilan.montees.push({ titre: n.titre, avant, apres: n.etat.niveau });
      if (n.etat.niveau < avant) this.bilan.descentes.push({ titre: n.titre, avant, apres: n.etat.niveau });
    }
    this.bilan.restants = this.aRevoir().length;
    this.bilan.serie = serieDeJours(lireHistorique(this.coffre), this.date);
    return this.bilan;
  }
}
