// Examens à venir (CCTL, étude de cas…) et révision resserrée à leur approche.
//
// Règle : dans les 21 jours qui précèdent un examen, une notion de son programme dont la prochaine
// révision tomberait APRÈS l'examen redevient « à revoir » si on ne l'a pas travaillée depuis un
// certain temps — un tiers des jours restants (au moins 1 jour). Plus l'examen approche, plus on la revoit.

import * as fs from 'fs';
import * as path from 'path';
import { DOSSIERS } from './coffre';
import { lireHistorique, lireNotionsRevision, type EntreeHistorique, type NotionRevision } from './notionsRevision';
import { ajouterJours, estARevoir } from './repetition';
import { aujourdhui, normaliser } from './texte';

export type TypeExamen = 'cctl' | 'etude_de_cas' | 'autre';

export const LIBELLES_EXAMEN: Record<TypeExamen, string> = {
  cctl: 'CCTL (questionnaire sur ordinateur)',
  etude_de_cas: 'Étude de cas',
  autre: 'Autre examen',
};

export interface Examen {
  id: string;
  titre: string;
  date: string; // AAAA-MM-JJ
  type: TypeExamen;
  /** Noms des notes Prosit au programme */
  prosits: string[];
}

/** Fenêtre (en jours) pendant laquelle un examen resserre les révisions. */
export const FENETRE_EXAMEN = 21;

function chemin(coffre: string): string {
  return path.join(coffre, DOSSIERS.forge, 'examens.json');
}

export function lireExamens(coffre: string): Examen[] {
  try {
    const d = JSON.parse(fs.readFileSync(chemin(coffre), 'utf8'));
    return Array.isArray(d.examens) ? d.examens : [];
  } catch {
    return [];
  }
}

function ecrireExamens(coffre: string, examens: Examen[]): void {
  fs.mkdirSync(path.dirname(chemin(coffre)), { recursive: true });
  fs.writeFileSync(chemin(coffre), JSON.stringify({ version: 1, examens }, null, 1), 'utf8');
}

export function ajouterExamen(coffre: string, e: Omit<Examen, 'id'>): Examen {
  const examen = { ...e, id: `e${Date.now().toString(36)}` };
  ecrireExamens(coffre, [...lireExamens(coffre), examen]);
  return examen;
}

export function supprimerExamen(coffre: string, id: string): void {
  ecrireExamens(coffre, lireExamens(coffre).filter((e) => e.id !== id));
}

export function joursAvant(examen: Pick<Examen, 'date'>, date = aujourdhui()): number {
  const [a1, m1, j1] = date.split('-').map(Number);
  const [a2, m2, j2] = examen.date.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000);
}

/** Examens d'aujourd'hui ou à venir, du plus proche au plus lointain. */
export function examensAVenir(examens: Examen[], date = aujourdhui()): Examen[] {
  return examens.filter((e) => joursAvant(e, date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
}

export function auProgramme(n: Pick<NotionRevision, 'prosits'>, e: Examen): boolean {
  return n.prosits.some((p) => e.prosits.some((q) => normaliser(p) === normaliser(q)));
}

/** Dernier jour où la notion a été travaillée (révision comptée ou entraînement). */
export function dernieresActivites(historique: EntreeHistorique[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of historique) {
    const jour = aujourdhui(new Date(e.date));
    if ((m.get(e.notion) ?? '') < jour) m.set(e.notion, jour);
  }
  return m;
}

/** L'examen proche qui oblige à revoir cette notion aujourd'hui, s'il y en a un. */
export function examenQuiPresse(
  n: NotionRevision,
  examens: Examen[],
  activites: Map<string, string>,
  date = aujourdhui(),
): Examen | undefined {
  for (const e of examensAVenir(examens, date)) {
    const jours = joursAvant(e, date);
    if (jours > FENETRE_EXAMEN || !auProgramme(n, e)) continue;
    // Déjà prévue avant l'examen par la répétition espacée : rien à ajouter
    if (n.etat.prochaine !== null && n.etat.prochaine <= e.date) continue;
    const derniere = [n.etat.derniere, activites.get(n.nom)].filter(Boolean).sort().pop();
    const ecart = Math.max(1, Math.floor(jours / 3));
    if (!derniere || derniere <= ajouterJours(date, -ecart)) return e;
  }
  return undefined;
}

/** À revoir aujourd'hui : par la répétition espacée, ou parce qu'un examen approche. */
export function aRevoirAujourdhui(n: NotionRevision, examens: Examen[], activites: Map<string, string>, date = aujourdhui()): boolean {
  return estARevoir(n.etat, date) || !!examenQuiPresse(n, examens, activites, date);
}

/** Nombre de notions à revoir aujourd'hui (répétition espacée + examens proches). */
export function compterARevoir(coffre: string, date = aujourdhui()): { aRevoir: number; total: number; examen?: Examen } {
  const notions = lireNotionsRevision(coffre);
  const examens = lireExamens(coffre);
  const activites = dernieresActivites(lireHistorique(coffre));
  const aRevoir = notions.filter((n) => aRevoirAujourdhui(n, examens, activites, date)).length;
  const examen = examensAVenir(examens, date).find((e) => joursAvant(e, date) <= FENETRE_EXAMEN);
  return { aRevoir, total: notions.length, examen };
}
