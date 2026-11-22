// Pistes de solutions des Prosits : lecture et mise à jour du bloc <!-- forge:pistes -->
// des notes Prosit (statut + justification), utilisées pendant les révisions.

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier, ecrireNote, lireNote } from './coffre';
import { lireBloc, remplacerBloc } from './blocs';
import type { StatutPiste } from './parseurCer';

export const ETIQUETTES_STATUT: Record<StatutPiste, string> = {
  validee: '✅ Validée',
  partielle: '⚠️ Validée en partie',
  invalidee: '❌ Invalidée',
  a_valider: '❓ À valider',
};

/** Libellé du statut dans le tableau Word du CER. */
export const STATUT_WORD: Record<StatutPiste, string> = {
  validee: 'Validée',
  partielle: 'Validée en partie',
  invalidee: 'Invalidée',
  a_valider: '',
};

export function lireStatutPiste(texte: string): StatutPiste {
  if (/invalid/i.test(texte)) return 'invalidee';
  if (/en partie|partiel/i.test(texte)) return 'partielle';
  if (/à valider|a valider/i.test(texte)) return 'a_valider';
  if (/valid/i.test(texte)) return 'validee';
  return 'a_valider';
}

export interface PisteNote {
  texte: string;
  statut: StatutPiste;
  justification: string;
}

/** Lit le bloc des pistes (format : « - [ ] texte » puis « Statut : » et « Justification : » en sous-liste). */
export function lirePistes(bloc: string): PisteNote[] {
  const pistes: PisteNote[] = [];
  for (const ligne of bloc.split('\n')) {
    const piste = ligne.match(/^- \[[ xX]\]\s+(.*)$/);
    if (piste) {
      pistes.push({ texte: piste[1].trim(), statut: 'a_valider', justification: '' });
      continue;
    }
    const derniere = pistes[pistes.length - 1];
    if (!derniere) continue;
    const statut = ligne.match(/^\s+- Statut\s*:\s*(.*)$/);
    if (statut) derniere.statut = lireStatutPiste(statut[1]);
    const justification = ligne.match(/^\s+- Justification\s*:\s*(.*)$/);
    if (justification) derniere.justification = justification[1].trim() === '…' ? '' : justification[1].trim();
  }
  return pistes.filter((p) => p.texte !== '…');
}

export function pistesEnMarkdown(pistes: PisteNote[]): string {
  if (pistes.length === 0) return '_Aucune piste._';
  return pistes
    .map((p) =>
      [
        `- [${p.statut === 'a_valider' ? ' ' : 'x'}] ${p.texte}`,
        `    - Statut : ${ETIQUETTES_STATUT[p.statut]}`,
        `    - Justification : ${p.justification.replace(/\s*\n\s*/g, ' ') || '…'}`,
      ].join('\n'),
    )
    .join('\n');
}

// --------------------------------------------------------------------------
// Pistes de tout le coffre, pour les séances

export interface PisteRevision extends PisteNote {
  /** Identifiant stable : « P04 - Moteur de combat#2 » */
  id: string;
  prosit: string;
  titreProsit: string;
  chemin: string;
  index: number;
  contexte: string;
  problematique: string;
}

function section(content: string, titre: string): string {
  const m = content.match(new RegExp(`^### ${titre}\\s*\\n([\\s\\S]*?)(?=^#{1,3} |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

export function lirePistesCoffre(coffre: string): PisteRevision[] {
  const dossier = cheminDossier(coffre, 'prosits');
  if (!fs.existsSync(dossier)) return [];
  const resultat: PisteRevision[] = [];
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.md')).sort()) {
    const chemin = path.join(dossier, f);
    const { data, content } = lireNote(chemin);
    const prosit = f.slice(0, -3);
    const titre = String(data.titre ?? '') || prosit;
    const contexte = section(content, 'Contexte');
    const problematique = section(content, 'Problématique');
    lirePistes(lireBloc(content, 'pistes') ?? '').forEach((p, index) => {
      resultat.push({ ...p, id: `${prosit}#${index}`, prosit, titreProsit: titre, chemin, index, contexte, problematique });
    });
  }
  return resultat;
}

/** Met à jour le statut et la justification d'une piste dans la note Prosit. */
export function enregistrerPiste(chemin: string, index: number, statut: StatutPiste, justification: string): void {
  const { data, content } = lireNote(chemin);
  const pistes = lirePistes(lireBloc(content, 'pistes') ?? '');
  if (!pistes[index]) throw new Error(`Piste ${index + 1} introuvable dans ${path.basename(chemin)}.`);
  pistes[index] = { ...pistes[index], statut, justification };
  ecrireNote(chemin, data, remplacerBloc(content, 'pistes', pistesEnMarkdown(pistes)));
}

/** Contexte et problématique d'une note Prosit (pour des exercices « dans l'histoire » du Prosit). */
export function lireContexteProsit(coffre: string, nomProsit: string): { titre: string; contexte: string; problematique: string } | undefined {
  const chemin = path.join(cheminDossier(coffre, 'prosits'), `${nomProsit}.md`);
  if (!fs.existsSync(chemin)) return undefined;
  const { data, content } = lireNote(chemin);
  return { titre: String(data.titre ?? '') || nomProsit, contexte: section(content, 'Contexte'), problematique: section(content, 'Problématique') };
}
