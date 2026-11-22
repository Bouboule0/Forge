// Notions vues par le moteur de révision : définitions, notes perso, état de répétition.

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier, DOSSIERS, ecrireNote, lireDate, lireNote } from './coffre';
import { lireBloc, retirerAvertissementIA } from './ecritureCoffre';
import type { EtatRevision, TypePreuve } from './repetition';
import { aujourdhui } from './texte';

export interface DefinitionLue {
  prosit: string | null;
  texte: string;
}

export interface NotionRevision {
  nom: string;
  titre: string;
  chemin: string;
  aliases: string[];
  prosits: string[];
  module: string;
  statut: 'a_verifier' | 'verifie';
  /** Relecture par l'IA : a_faire | ok | corrigee | ecrite (vide si non concernée). */
  revueIA: string;
  definitions: DefinitionLue[];
  notesPerso: string;
  /** Faux si l'IA a jugé la notion inadaptée aux exercices de code */
  codePossible: boolean;
  etat: EtatRevision;
}

const sansLiens = (t: string) => t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');

export function lireDefinitions(content: string): DefinitionLue[] {
  const bloc = lireBloc(content, 'definitions') ?? '';
  if (!bloc.trim() || bloc.trim().startsWith('_')) return [];
  // « **Corrigée par l'IA** (date) » n'est qu'une étiquette
  const sansEtiquette = bloc.replace(/^\s*\*\*(Corrigée|Écrite) par l'IA\*\*[^\n]*\n/, '');
  const morceaux = sansEtiquette.split(/\*\*D'après \[\[([^\]]+)\]\]\*\*/);
  const definitions: DefinitionLue[] = [];
  if (morceaux[0].trim()) definitions.push({ prosit: null, texte: morceaux[0].trim() });
  for (let i = 1; i + 1 < morceaux.length; i += 2) {
    const texte = morceaux[i + 1].trim();
    if (texte) definitions.push({ prosit: morceaux[i], texte });
  }
  return definitions;
}

/** Contenu de la section « Mes notes » (écrite par l'utilisateur). */
export function lireNotesPerso(content: string): string {
  const debut = content.search(/^## Mes notes[ \t]*$/m);
  if (debut < 0) return '';
  const reste = content.slice(debut).replace(/^## Mes notes[ \t]*\n?/, '');
  const fin = reste.search(/^## /m);
  return (fin < 0 ? reste : reste.slice(0, fin)).trim();
}

function liste(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => sansLiens(String(x))) : [];
}

export function lireNotionRevision(chemin: string): NotionRevision {
  const { data, content } = lireNote(chemin);
  const preuves = (data.preuves && typeof data.preuves === 'object' ? data.preuves : {}) as Partial<Record<TypePreuve, number>>;
  const titre = content.match(/^# (.+)$/m)?.[1].trim() ?? path.basename(chemin, '.md');
  return {
    nom: path.basename(chemin, '.md'),
    titre,
    chemin,
    aliases: liste(data.aliases),
    prosits: liste(data.prosits),
    module: sansLiens(String(data.module ?? '')),
    statut: data.statut === 'verifie' ? 'verifie' : 'a_verifier',
    revueIA: typeof data.revue_ia === 'string' ? data.revue_ia : '',
    definitions: lireDefinitions(content),
    notesPerso: lireNotesPerso(content),
    codePossible: data.code_possible !== false,
    etat: {
      niveau: Math.max(0, Math.min(6, Number(data.niveau) || 0)),
      prochaine: lireDate(data.prochaine_revision),
      derniere: lireDate(data.derniere_revision),
      aavCible: Number(data.aav_cible) || 2,
      reussites: Number(data.reussites) || 0,
      echecs: Number(data.echecs) || 0,
      preuves,
    },
  };
}

export function lireNotionsRevision(coffre: string): NotionRevision[] {
  const dossier = cheminDossier(coffre, 'notions');
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier)
    .filter((f) => f.endsWith('.md'))
    .map((f) => lireNotionRevision(path.join(dossier, f)));
}

/** Écrit l'état de révision dans l'en-tête de la note, sans toucher au reste. */
export function enregistrerEtat(chemin: string, etat: EtatRevision, statut?: 'a_verifier' | 'verifie'): void {
  const { data, content } = lireNote(chemin);
  data.niveau = etat.niveau;
  data.prochaine_revision = etat.prochaine ?? aujourdhui();
  data.derniere_revision = etat.derniere ?? '';
  data.reussites = etat.reussites;
  data.echecs = etat.echecs;
  if (Object.keys(etat.preuves).length) data.preuves = etat.preuves;
  if (statut) data.statut = statut;
  const tags = (Array.isArray(data.tags) ? data.tags.map(String) : []).filter((t) => !t.startsWith('maitrise/'));
  if (!tags.includes('forge/notion')) tags.unshift('forge/notion');
  tags.push(`maitrise/${etat.niveau}`);
  data.tags = tags;
  ecrireNote(chemin, data, statut === 'verifie' ? retirerAvertissementIA(content) : content);
}

/** Ajoute une preuve d'AAV (code réussi hors séance, étude de cas…) sans changer le niveau. */
export function ajouterPreuve(chemin: string, type: TypePreuve): void {
  const { data, content } = lireNote(chemin);
  const preuves = (data.preuves && typeof data.preuves === 'object' ? data.preuves : {}) as Record<string, number>;
  preuves[type] = (Number(preuves[type]) || 0) + 1;
  data.preuves = preuves;
  ecrireNote(chemin, data, content);
}

/** Marque une notion comme inadaptée aux exercices de code (jugé par l'IA). */
export function marquerSansCode(chemin: string): void {
  const { data, content } = lireNote(chemin);
  data.code_possible = false;
  ecrireNote(chemin, data, content);
}

// --------------------------------------------------------------------------
// Historique des révisions (.forge/historique.json)

export interface EntreeHistorique {
  date: string; // ISO
  notion: string;
  type: string;
  resultat: 'reussite' | 'moyen' | 'echec';
  compte: boolean; // false = entraînement (n'a pas changé la répétition espacée)
  niveauAvant?: number;
  niveauApres?: number;
  /** Note sur 20 (étude de cas) */
  points?: number;
}

function cheminHistorique(coffre: string): string {
  return path.join(coffre, DOSSIERS.forge, 'historique.json');
}

export function lireHistorique(coffre: string): EntreeHistorique[] {
  try {
    const brut = JSON.parse(fs.readFileSync(cheminHistorique(coffre), 'utf8'));
    return Array.isArray(brut.entrees) ? brut.entrees : [];
  } catch {
    return [];
  }
}

export function ajouterHistorique(coffre: string, entree: EntreeHistorique): void {
  const entrees = lireHistorique(coffre);
  entrees.push(entree);
  fs.mkdirSync(path.dirname(cheminHistorique(coffre)), { recursive: true });
  fs.writeFileSync(cheminHistorique(coffre), JSON.stringify({ version: 1, entrees }, null, 1), 'utf8');
}

/** Nombre de jours consécutifs (jusqu'à aujourd'hui ou hier) avec au moins une révision. */
export function serieDeJours(entrees: EntreeHistorique[], date = aujourdhui()): number {
  const jours = new Set(entrees.map((e) => aujourdhui(new Date(e.date))));
  let serie = 0;
  const curseur = new Date(`${date}T12:00:00`);
  if (!jours.has(date)) curseur.setDate(curseur.getDate() - 1); // la série d'hier compte encore
  while (jours.has(aujourdhui(curseur))) {
    serie++;
    curseur.setDate(curseur.getDate() - 1);
  }
  return serie;
}
