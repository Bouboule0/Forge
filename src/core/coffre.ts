// Accès au coffre Obsidian : dossiers, lecture des notes de notions, notions à réviser.

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { aujourdhui } from './texte';

export const DOSSIERS = {
  prosits: 'Prosits',
  notions: 'Notions',
  modules: 'Modules',
  exercices: 'Exercices',
  images: path.join('Ressources', 'images'),
  sources: 'Sources',
  exports: 'Exports',
  forge: '.forge',
} as const;

export interface NoteNotion {
  nom: string;
  chemin: string;
  aliases: string[];
  donnees: Record<string, unknown>;
}

export function cheminDossier(coffre: string, dossier: keyof typeof DOSSIERS): string {
  return path.join(coffre, DOSSIERS[dossier]);
}

export function lireNotions(coffre: string): NoteNotion[] {
  const dossier = cheminDossier(coffre, 'notions');
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const chemin = path.join(dossier, f);
      const { data } = lireNote(chemin);
      const aliases = Array.isArray(data.aliases) ? data.aliases.map(String) : [];
      return { nom: f.slice(0, -3), chemin, aliases, donnees: data };
    });
}

export function lireNote(chemin: string): { data: Record<string, unknown>; content: string } {
  const brut = fs.readFileSync(chemin, 'utf8');
  try {
    const { data, content } = matter(brut, {}); // options = pas de cache partagé
    return { data, content };
  } catch {
    // En-tête YAML invalide (modifié à la main) : on garde le texte tel quel
    return { data: {}, content: brut };
  }
}

export function ecrireNote(chemin: string, data: Record<string, unknown>, content: string): void {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, matter.stringify(content, data), 'utf8');
}

/** Date (AAAA-MM-JJ) lue dans l'en-tête, qu'elle soit écrite comme texte ou comme date YAML. */
export function lireDate(valeur: unknown): string | null {
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  if (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valeur)) return valeur.slice(0, 10);
  return null;
}

/** Nombre de notions dont la date de révision est aujourd'hui ou passée. */
export function compterNotionsARevoir(coffre: string, date = aujourdhui()): { aRevoir: number; total: number } {
  const notions = lireNotions(coffre);
  const aRevoir = notions.filter((n) => {
    const prochaine = lireDate(n.donnees.prochaine_revision);
    return prochaine === null || prochaine <= date;
  }).length;
  return { aRevoir, total: notions.length };
}

export function estUnCoffre(dossier: string): boolean {
  return fs.existsSync(path.join(dossier, DOSSIERS.forge)) || fs.existsSync(path.join(dossier, '.obsidian'));
}

/** Note Prosit existante pour ce numéro (« P04 - ... .md »), ou null. */
export function trouverNoteProsit(coffre: string, numero: number): string | null {
  const dossier = cheminDossier(coffre, 'prosits');
  if (!fs.existsSync(dossier)) return null;
  const prefixe = `P${String(numero).padStart(2, '0')}`;
  const trouve = fs.readdirSync(dossier).find((f) => f.endsWith('.md') && (f === `${prefixe}.md` || f.startsWith(`${prefixe} `)));
  return trouve ? path.join(dossier, trouve) : null;
}
