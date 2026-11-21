// Répétition espacée : niveaux 0 à 6 (= stades de la plante) et dates de révision.

import { aujourdhui } from './texte';

/** Jours avant la prochaine révision quand on atteint ce niveau. */
export const INTERVALLES = [0, 1, 3, 7, 14, 30, 60];

export const STADES = [
  { emoji: '🌰', nom: 'graine' },
  { emoji: '🌱', nom: 'germe' },
  { emoji: '🌿', nom: 'pousse' },
  { emoji: '🪴', nom: 'jeune plant' },
  { emoji: '🌳', nom: 'plant adulte' },
  { emoji: '🌸', nom: 'en fleurs' },
  { emoji: '🍎', nom: 'récoltable' },
];

export const NIVEAU_MAX = STADES.length - 1;

/** Types d'exercices dont la réussite « prouve » la maîtrise (exigés par les AAV). */
export type TypePreuve = 'trou' | 'qcm' | 'explication' | 'code' | 'long' | 'papier';

export type Resultat = 'reussite' | 'moyen' | 'echec';

export interface EtatRevision {
  niveau: number;
  prochaine: string | null;
  derniere: string | null;
  aavCible: number;
  reussites: number;
  echecs: number;
  preuves: Partial<Record<TypePreuve, number>>;
}

export function stade(niveau: number) {
  return STADES[Math.min(NIVEAU_MAX, Math.max(0, Math.round(niveau)))];
}

export function ajouterJours(date: string, jours: number): string {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(a, m - 1, j + jours);
  return aujourdhui(d);
}

/**
 * Niveau maximum autorisé selon l'AAV visé et les exercices déjà réussis.
 * [2] comprendre → explication ; [3] mettre en œuvre → + 2 codes ; [5] maîtriser → + exercice long et papier.
 */
export function plafond(etat: EtatRevision): { max: number; raison?: string } {
  const p = (t: TypePreuve) => etat.preuves[t] ?? 0;
  const manque: string[] = [];
  if (p('explication') < 1) manque.push('une explication libre');
  if (etat.aavCible >= 3 && p('code') < 2) manque.push(`${2 - p('code')} exercice(s) de code`);
  if (etat.aavCible >= 5 && p('long') < 1) manque.push('un exercice long');
  if (etat.aavCible >= 5 && p('papier') < 1) manque.push('un exercice « sur papier »');
  if (manque.length === 0) return { max: NIVEAU_MAX };
  return { max: 4, raison: `Pour dépasser 🌳, réussis ${manque.join(', ')} (AAV [${etat.aavCible}]).` };
}

export interface Changement {
  avant: number;
  apres: number;
  prochaine: string;
  bloque?: string;
}

/** Applique le résultat d'une révision (comptée) et renvoie le nouvel état. */
export function appliquerResultat(
  etat: EtatRevision,
  resultat: Resultat,
  preuve: TypePreuve | null,
  date = aujourdhui(),
): { etat: EtatRevision; changement: Changement } {
  const nouveau: EtatRevision = { ...etat, preuves: { ...etat.preuves }, derniere: date };
  let bloque: string | undefined;

  if (resultat === 'reussite') {
    nouveau.reussites++;
    if (preuve) nouveau.preuves[preuve] = (nouveau.preuves[preuve] ?? 0) + 1;
    const limite = plafond(nouveau);
    if (etat.niveau + 1 > limite.max) bloque = limite.raison;
    nouveau.niveau = Math.min(etat.niveau + 1, limite.max, NIVEAU_MAX);
    nouveau.prochaine = ajouterJours(date, Math.max(1, INTERVALLES[nouveau.niveau]));
  } else if (resultat === 'moyen') {
    nouveau.prochaine = ajouterJours(date, Math.max(1, Math.floor(INTERVALLES[etat.niveau] / 2)));
  } else {
    nouveau.echecs++;
    nouveau.niveau = etat.niveau >= 4 ? etat.niveau - 2 : Math.max(0, etat.niveau - 1);
    nouveau.prochaine = ajouterJours(date, 1);
  }
  return { etat: nouveau, changement: { avant: etat.niveau, apres: nouveau.niveau, prochaine: nouveau.prochaine!, bloque } };
}

/** La notion est-elle à réviser à cette date ? */
export function estARevoir(etat: Pick<EtatRevision, 'prochaine'>, date = aujourdhui()): boolean {
  return etat.prochaine === null || etat.prochaine <= date;
}

/** Une notion dont la date est dépassée « a soif » (elle fanera dans la ferme). */
export function joursDeRetard(etat: Pick<EtatRevision, 'prochaine'>, date = aujourdhui()): number {
  if (!etat.prochaine || etat.prochaine >= date) return 0;
  const [a1, m1, j1] = etat.prochaine.split('-').map(Number);
  const [a2, m2, j2] = date.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000);
}
