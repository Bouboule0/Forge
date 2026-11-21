// Séance de révision de durée libre : file des notions, enchaînement des exercices, bilan.

import { corriger, genererExercice, PREUVES, type Correction, type Exercice, type Hasard, type Reponse } from './exercices';
import {
  ajouterHistorique,
  enregistrerEtat,
  lireHistorique,
  lireNotionsRevision,
  serieDeJours,
  type NotionRevision,
} from './notionsRevision';
import { appliquerResultat, estARevoir, type Changement } from './repetition';
import { aujourdhui, normaliser } from './texte';

export type Perimetre = { type: 'tout' } | { type: 'prosit'; nom: string } | { type: 'notion'; nom: string };

export interface OptionsSeance {
  rapide: boolean;
  perimetre: Perimetre;
  /** Réviser même ce qui n'est pas encore à revoir (ne change pas la répétition espacée). */
  entrainement: boolean;
  /** Proposer « Vérifie la définition » (mode où les définitions IA ne sont pas acceptées d'office). */
  verifierDefinitions?: boolean;
}

export interface ResultatReponse {
  correction: Correction;
  notion: NotionRevision;
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
  restants: number;
  serie: number;
}

const MAX_TENTATIVES = 2;

export function dansPerimetre(n: NotionRevision, p: Perimetre): boolean {
  if (p.type === 'tout') return true;
  if (p.type === 'notion') return n.nom === p.nom;
  return n.prosits.some((x) => normaliser(x) === normaliser(p.nom));
}

export class Seance {
  readonly notions: NotionRevision[];
  private file: NotionRevision[] = [];
  private tentatives = new Map<string, number>();
  private precedent?: Exercice['type'];
  private courant?: { notion: NotionRevision; exercice: Exercice };
  private readonly date: string;
  private readonly hasard: Hasard;
  readonly bilan: Bilan = { faits: 0, reussis: 0, echecs: 0, montees: [], descentes: [], verifiees: 0, restants: 0, serie: 0 };
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
    for (const n of this.notions) this.niveauxDepart.set(n.chemin, n.etat.niveau);
    this.remplirFile();
  }

  /** Notions du périmètre à revoir aujourd'hui. */
  aRevoir(): NotionRevision[] {
    return this.notions.filter((n) => dansPerimetre(n, this.options.perimetre) && estARevoir(n.etat, this.date));
  }

  /** Exercice affiché en ce moment. */
  get enCours(): { notion: NotionRevision; exercice: Exercice } | undefined {
    return this.courant;
  }

  get enEntrainement(): boolean {
    return this.options.entrainement;
  }

  restants(): number {
    return this.file.length;
  }

  private remplirFile(): void {
    const tri = (a: NotionRevision, b: NotionRevision) =>
      (a.etat.prochaine ?? '').localeCompare(b.etat.prochaine ?? '') || a.etat.niveau - b.etat.niveau;
    const melange = (liste: NotionRevision[]) => liste.map((n) => ({ n, r: this.hasard() })).sort((a, b) => a.r - b.r).map((x) => x.n);
    if (this.options.entrainement) {
      const perimetre = this.notions.filter((n) => dansPerimetre(n, this.options.perimetre));
      this.file = melange(perimetre).sort((a, b) => a.etat.niveau - b.etat.niveau);
    } else {
      this.file = melange(this.aRevoir()).sort(tri);
    }
  }

  /** Exercice suivant, ou null quand la file est vide. */
  suivant(): { notion: NotionRevision; exercice: Exercice } | null {
    if (this.file.length === 0 && this.options.entrainement && this.bilan.faits > 0) this.remplirFile();
    const notion = this.file.shift();
    if (!notion) {
      this.courant = undefined;
      return null;
    }
    const exercice = genererExercice(notion, this.notions, { rapide: this.options.rapide, precedent: this.precedent, hasard: this.hasard, verifierDefinitions: this.options.verifierDefinitions });
    this.precedent = exercice.type;
    this.courant = { notion, exercice };
    return this.courant;
  }

  repondre(reponse: Reponse): ResultatReponse {
    if (!this.courant) throw new Error('Aucun exercice en cours.');
    const { notion, exercice } = this.courant;
    const correction = corriger(exercice, reponse);
    const compte = correction.resultat !== null && !this.options.entrainement && estARevoir(notion.etat, this.date);
    let changement: Changement | undefined;

    if (correction.resultat !== null) {
      this.bilan.faits++;
      if (correction.resultat === 'reussite') this.bilan.reussis++;
      if (correction.resultat === 'echec') this.bilan.echecs++;
    }

    if (compte && correction.resultat) {
      const r = appliquerResultat(notion.etat, correction.resultat, PREUVES[exercice.type], this.date);
      notion.etat = r.etat;
      changement = r.changement;
    }
    if (correction.verifiee) {
      notion.statut = 'verifie';
      this.bilan.verifiees++;
    }
    if (changement || correction.verifiee) enregistrerEtat(notion.chemin, notion.etat, correction.verifiee ? 'verifie' : undefined);

    if (correction.resultat !== null) {
      ajouterHistorique(this.coffre, {
        date: new Date().toISOString(),
        notion: notion.nom,
        type: exercice.type,
        resultat: correction.resultat,
        compte,
        niveauAvant: changement?.avant,
        niveauApres: changement?.apres,
      });
    }

    // Raté : la notion revient un peu plus tard dans la séance
    if (correction.resultat === 'echec') {
      const n = (this.tentatives.get(notion.chemin) ?? 0) + 1;
      this.tentatives.set(notion.chemin, n);
      if (n <= MAX_TENTATIVES) this.file.splice(Math.min(3, this.file.length), 0, notion);
    }
    this.courant = undefined;
    return { correction, notion, changement, compte };
  }

  /** La réponse tapée était bonne en fait (synonyme, faute de frappe) : on corrige le dernier résultat. */
  rectifier(resultat: ResultatReponse): ResultatReponse {
    if (resultat.correction.resultat !== 'echec') return resultat;
    const { notion } = resultat;
    // On retire la nouvelle tentative programmée
    const index = this.file.indexOf(notion);
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
