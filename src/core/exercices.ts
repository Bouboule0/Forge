// Génération et correction des exercices à partir des notes du coffre.
// Les exercices « explication » et « piste_valider » sont corrigés par l'IA (voir correctionIA.ts et seance.ts).

import type { NotionRevision } from './notionsRevision';
import { ETIQUETTES_STATUT, type PisteRevision } from './pistes';
import type { StatutPiste } from './parseurCer';
import { memeSortie } from './compilation';
import type { ExerciceCode } from './exercicesCode';
import type { Resultat, TypePreuve } from './repetition';
import { distance, motsCles, normaliser, singulier } from './texte';

export type TypeExercice = 'trou' | 'qcm_notion' | 'qcm_definition' | 'flashcard' | 'verification' | 'explication' | 'piste_valider' | 'piste_vf' | 'code' | 'bug' | 'sortie';

/** Exercices de code C++ (préparés par l'atelier : réutilisés ou générés, puis compilés). */
export const TYPES_CODE = ['code', 'bug', 'sortie'] as const;
export type TypeCode = (typeof TYPES_CODE)[number];
export const estCode = (t: TypeExercice): t is TypeCode => (TYPES_CODE as readonly string[]).includes(t);

export const LIBELLES: Record<TypeExercice, string> = {
  trou: 'Texte à trous',
  qcm_notion: 'QCM — quelle notion ?',
  qcm_definition: 'QCM — quelle définition ?',
  flashcard: 'Explique avec tes mots',
  verification: 'Vérifie la définition',
  explication: 'Explique — corrigé par l\'IA',
  piste_valider: 'Valide une piste de ton CER',
  piste_vf: 'Piste : validée ou pas ?',
  code: 'Exercice de code',
  bug: 'Trouve le bug',
  sortie: 'Prédis la sortie',
};

/** Type de preuve enregistré quand l'exercice est réussi (null = ne compte pas comme preuve). */
export const PREUVES: Record<TypeExercice, TypePreuve | null> = {
  trou: 'trou',
  qcm_notion: 'qcm',
  qcm_definition: 'qcm',
  flashcard: null, // auto-évalué
  verification: null,
  explication: 'explication',
  piste_valider: null,
  piste_vf: null,
  code: 'code',
  bug: 'code',
  sortie: null,
};

export interface Exercice {
  type: TypeExercice;
  notion: string;
  consigne: string;
  /** Texte principal en Markdown (phrase à trous, définition masquée…). */
  enonce: string;
  options?: string[];
  /** Index de la bonne option (QCM) */
  bonneOption?: number;
  /** Réponse attendue (trou) */
  attendu?: string;
  indice?: string;
  /** Phrase complète, montrée après la réponse (trou) */
  solution?: string;
  /** Pour les exercices sur une piste de solution */
  piste?: PisteRevision;
  /** Pour les exercices de code */
  code?: ExerciceCode;
}

export type Hasard = () => number;

// --------------------------------------------------------------------------
// Nettoyage du Markdown

export function texteBrut(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\\([[\]()*_])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function phrases(md: string): string[] {
  return texteBrut(md)
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÀ-Ý«"(])/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 30 && p.length <= 320);
}

/** Toutes les définitions + notes perso de la notion. */
function sourcesTexte(n: NotionRevision): string[] {
  const textes = n.definitions.map((d) => d.texte);
  if (n.notesPerso) textes.push(n.notesPerso);
  return textes;
}

export function premiereDefinition(n: NotionRevision): string {
  return n.notesPerso && n.definitions.length === 0 ? n.notesPerso : n.definitions[0]?.texte ?? '';
}

// --------------------------------------------------------------------------
// Masquage du nom de la notion dans un texte

function motsDuNom(n: Pick<NotionRevision, 'nom' | 'titre' | 'aliases'>): Set<string> {
  const mots = new Set<string>();
  for (const nom of [n.nom, n.titre, ...n.aliases]) {
    for (const m of motsCles(nom)) if (m.length >= 3) mots.add(m);
  }
  return mots;
}

export function masquerNom(texte: string, n: Pick<NotionRevision, 'nom' | 'titre' | 'aliases'>): string {
  const mots = motsDuNom(n);
  if (mots.size === 0) return texte;
  return texte.replace(/[\p{L}\p{N}+#'’-]+/gu, (mot) => {
    const cle = singulier(normaliser(mot).replace(/\s+/g, ''));
    return [...mots].some((m) => m === cle || (m.length >= 5 && distance(m, cle) <= 1)) ? '▢▢▢' : mot;
  });
}

// --------------------------------------------------------------------------
// Texte à trous

const MOTS_COURANTS = new Set(
  [
    'permettant', 'permet', 'notamment', 'generalement', 'differentes', 'differents', 'plusieurs', 'lorsque', 'uniquement',
    'correspondant', 'possibilite', 'represente', 'representant', 'ensemble', 'egalement', 'exemple', 'consistant',
    'chaque', 'certains', 'certaines', 'facilement', 'directement', 'difficile', 'difficiles', 'simplement', 'quelque',
    'toujours', 'souvent', 'autres', 'entre', 'depuis', 'pendant', 'ainsi', 'cependant', 'contrairement', 'donnees',
    'element', 'elements', 'partie', 'parties', 'maniere', 'facon', 'utilise', 'utilisee', 'utilises', 'utilisees',
    'fonctionner', 'realiser', 'propre', 'propres', 'meme', 'memes', 'nouvelle', 'nouveau', 'nouvelles', 'nouveaux',
    'possede', 'possedant', 'definie', 'defini', 'definit', 'concerne', 'oppose', 'devient', 'autre', 'seule',
  ].map(singulier),
);

interface Candidat {
  debut: number;
  fin: number;
  texte: string;
  score: number;
}

function candidatsTrou(phrase: string, n: NotionRevision, autresNotions: NotionRevision[]): Candidat[] {
  const interdits = motsDuNom(n);
  const candidats: Candidat[] = [];

  // 1. Noms d'autres notions présents dans la phrase (le plus intéressant)
  const phraseNorm = normaliser(phrase);
  for (const autre of autresNotions) {
    for (const nom of [autre.titre, autre.nom, ...autre.aliases]) {
      const nomNorm = normaliser(nom);
      if (nomNorm.length < 3 || nom.length > 40) continue;
      const motsNom = nomNorm.split(' ');
      if (motsNom.some((m) => interdits.has(singulier(m)))) continue;
      const motif = new RegExp(`(^|[^\\p{L}])(${echapperRegex(nom)}s?)(?=[^\\p{L}]|$)`, 'iu');
      const m = phrase.match(motif);
      if (m && m.index !== undefined && phraseNorm.includes(nomNorm)) {
        const debut = m.index + m[1].length;
        candidats.push({ debut, fin: debut + m[2].length, texte: m[2], score: 5 });
      }
    }
  }

  // 2. Mots techniques : sigles, termes entre parenthèses ou guillemets, mots longs
  const motif = /[\p{L}\p{N}+#]+(?:[-'’][\p{L}\p{N}]+)*/gu;
  for (const m of phrase.matchAll(motif)) {
    // « l'adresse » → on cache seulement « adresse »
    const elision = m[0].match(/^((?:[ldjmnstc]|qu)['’])(.+)$/i);
    const mot = elision ? elision[2] : m[0];
    const index = m.index! + (elision ? elision[1].length : 0);
    const cle = singulier(normaliser(mot).replace(/\s+/g, ''));
    if (interdits.has(cle) || cle.length < 3) continue;
    const avant = phrase.slice(Math.max(0, index - 2), index);
    const apres = phrase.slice(index + mot.length, index + mot.length + 2);
    let score = 0;
    if (/^[A-Z]{2,}[a-z]*$/.test(mot) || /\+\+|#/.test(mot) || /[a-z][A-Z]/.test(mot)) score = 4; // VFT, XOR, C++, shared_ptr
    else if (/[(«"]\s*$/.test(avant) && /^\s*[)»"]/.test(apres)) score = 4; // (vptr), « est un »
    else if (cle.length >= 8 && !MOTS_COURANTS.has(cle) && !/ement$/.test(cle)) score = 2;
    else if (cle.length >= 6 && !MOTS_COURANTS.has(cle) && !/ement$/.test(cle) && /^[a-z]/.test(normaliser(mot))) score = 1;
    if (score > 0) candidats.push({ debut: index, fin: index + mot.length, texte: mot, score });
  }
  return candidats;
}

function echapperRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function choisir<T>(liste: T[], hasard: Hasard): T {
  return liste[Math.floor(hasard() * liste.length) % liste.length];
}

function melanger<T>(liste: T[], hasard: Hasard): T[] {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

export function genererTrou(n: NotionRevision, toutes: NotionRevision[], hasard: Hasard = Math.random): Exercice | null {
  const autres = toutes.filter((x) => x.chemin !== n.chemin);
  const options: Array<{ phrase: string; c: Candidat }> = [];
  for (const texte of sourcesTexte(n)) {
    for (const phrase of phrases(texte)) {
      for (const c of candidatsTrou(phrase, n, autres)) options.push({ phrase, c });
    }
  }
  if (options.length === 0) return null;
  const meilleur = Math.max(...options.map((o) => o.c.score));
  // On garde un peu de variété : les candidats proches du meilleur score
  const retenus = options.filter((o) => o.c.score >= Math.min(meilleur, Math.max(2, meilleur - 1)));
  const { phrase, c } = choisir(retenus.length ? retenus : options, hasard);
  const trou = '_'.repeat(Math.max(5, Math.min(14, c.texte.length)));
  const lettres = c.texte.replace(/[^\p{L}\p{N}+#]/gu, '').length;
  return {
    type: 'trou',
    notion: n.nom,
    consigne: `Complète la phrase sur **${n.titre}**`,
    enonce: `${phrase.slice(0, c.debut)}${trou}${phrase.slice(c.fin)}`,
    attendu: c.texte,
    indice: `Commence par « ${c.texte[0]} » · ${lettres} caractère${lettres > 1 ? 's' : ''}`,
    solution: `${phrase.slice(0, c.debut)}**${c.texte}**${phrase.slice(c.fin)}`,
  };
}

/** Compare une réponse tapée à la réponse attendue, avec tolérance (accents, pluriel, petite faute). */
export function reponseCorrecte(reponse: string, attendu: string): boolean {
  const a = normaliser(reponse).split(' ').map(singulier).join(' ');
  const b = normaliser(attendu).split(' ').map(singulier).join(' ');
  if (!a) return false;
  if (a === b || a.replace(/\s/g, '') === b.replace(/\s/g, '')) return true;
  const tolerance = b.length >= 10 ? 2 : b.length >= 5 ? 1 : 0;
  return distance(a, b) <= tolerance;
}

// --------------------------------------------------------------------------
// QCM

function aUneDefinition(n: NotionRevision): boolean {
  return premiereDefinition(n).trim().length > 0;
}

/** Distracteurs : de préférence des notions des mêmes Prosits, puis du même module. */
function distracteurs(n: NotionRevision, toutes: NotionRevision[], nombre: number, hasard: Hasard): NotionRevision[] {
  const autres = toutes.filter((x) => x.chemin !== n.chemin && aUneDefinition(x));
  const proches = melanger(autres.filter((x) => x.prosits.some((p) => n.prosits.includes(p))), hasard);
  const module = melanger(autres.filter((x) => !proches.includes(x) && x.module === n.module), hasard);
  const reste = melanger(autres.filter((x) => !proches.includes(x) && !module.includes(x)), hasard);
  return [...proches, ...module, ...reste].slice(0, nombre);
}

function premierePhrase(md: string, max = 260): string {
  const texte = texteBrut(md).replace(/\n+/g, ' ');
  const fin = texte.search(/(?<=[.!?])\s/);
  const phrase = fin > 40 ? texte.slice(0, fin) : texte;
  return phrase.length > max ? `${phrase.slice(0, max - 1).trimEnd()}…` : phrase;
}

export function genererQcmNotion(n: NotionRevision, toutes: NotionRevision[], hasard: Hasard = Math.random): Exercice | null {
  if (!aUneDefinition(n)) return null;
  const faux = distracteurs(n, toutes, 3, hasard);
  if (faux.length < 3) return null;
  const options = melanger([n, ...faux], hasard);
  const definition = choisir(sourcesTexte(n).filter((t) => t.trim()), hasard);
  return {
    type: 'qcm_notion',
    notion: n.nom,
    consigne: 'À quelle notion correspond cette définition ?',
    enonce: masquerNom(texteBrut(definition), n),
    options: options.map((o) => o.titre),
    bonneOption: options.indexOf(n),
  };
}

export function genererQcmDefinition(n: NotionRevision, toutes: NotionRevision[], hasard: Hasard = Math.random): Exercice | null {
  if (!aUneDefinition(n)) return null;
  const faux = distracteurs(n, toutes, 3, hasard);
  if (faux.length < 3) return null;
  const options = melanger([n, ...faux], hasard);
  return {
    type: 'qcm_definition',
    notion: n.nom,
    consigne: `Quelle est la bonne définition de **${n.titre}** ?`,
    enonce: '',
    options: options.map((o) => masquerNom(premierePhrase(premiereDefinition(o)), o)),
    bonneOption: options.indexOf(n),
  };
}

// --------------------------------------------------------------------------
// Flashcard et vérification

export function genererFlashcard(n: NotionRevision): Exercice {
  return {
    type: 'flashcard',
    notion: n.nom,
    consigne: `Explique **${n.titre}** avec tes mots`,
    enonce: aUneDefinition(n)
      ? 'Dis-le à voix haute ou écris-le ci-dessous, puis compare avec ta note. Sois honnête avec toi-même 😉'
      : "Cette notion n'a pas encore de définition : explique-la, puis ouvre la note pour l'écrire.",
  };
}

export function genererVerification(n: NotionRevision): Exercice | null {
  if (n.statut !== 'a_verifier' || !aUneDefinition(n)) return null;
  return {
    type: 'verification',
    notion: n.nom,
    consigne: `Vérifie la définition de **${n.titre}**`,
    enonce: 'Elle a été générée par IA. Relis-la : est-elle juste et claire pour toi ?',
  };
}

/** Exercice de code à préparer (l'atelier remplira `code` : exercice existant ou généré). */
export function genererCodeAPreparer(n: NotionRevision, type: TypeCode): Exercice {
  return { type, notion: n.nom, consigne: '', enonce: '' };
}

/** Complète un exercice de code préparé par l'atelier. */
export function exerciceDeCode(n: NotionRevision, code: ExerciceCode): Exercice {
  const type: TypeCode = code.genre === 'long' ? 'code' : code.genre;
  return {
    type,
    notion: n.nom,
    consigne: type === 'sortie' ? `Que va afficher ce programme ? (**${n.titre}**)` : `**${code.titre}** — ${n.titre}`,
    enonce: code.enonce,
    code,
  };
}

export function genererExplication(n: NotionRevision): Exercice {
  return {
    type: 'explication',
    notion: n.nom,
    consigne: `Explique **${n.titre}** avec tes mots`,
    enonce: "Écris ton explication comme si tu l'expliquais à un camarade (un exemple en C++ est un plus). L'IA la corrige.",
  };
}

/** Piste à valider (corrigée par l'IA) ou déjà validée (vrai/faux hors ligne). */
export function genererPiste(p: PisteRevision): Exercice {
  const aValider = p.statut === 'a_valider';
  return {
    type: aValider ? 'piste_valider' : 'piste_vf',
    notion: p.prosit,
    consigne: aValider
      ? `Cette piste du Prosit **${p.titreProsit}** est-elle juste ? Justifie.`
      : `Dans le Prosit **${p.titreProsit}**, cette piste a-t-elle été validée ?`,
    enonce: p.texte,
    piste: p,
  };
}

// --------------------------------------------------------------------------
// Choix de l'exercice

export type ModeCode = 'jamais' | 'parfois' | 'surtout';

export function typesPossibles(
  n: NotionRevision,
  toutes: NotionRevision[],
  rapide: boolean,
  verifierDefinitions = false,
  ia = false,
  code: ModeCode = 'jamais',
): TypeExercice[] {
  // Exercices de code : « prédis la sortie » pour toutes les notions, écrire / corriger du code pour les AAV [3] et plus
  if (code !== 'jamais' && !rapide && n.codePossible) {
    const typesCode: TypeExercice[] = n.etat.aavCible >= 3 ? ['code', 'bug', 'sortie'] : ['sortie'];
    if (code === 'surtout') return typesCode;
    return [...typesPossibles(n, toutes, rapide, verifierDefinitions, ia, 'jamais'), ...typesCode];
  }
  const types: TypeExercice[] = [];
  const avecDef = toutes.filter(aUneDefinition).length;
  if (aUneDefinition(n)) {
    types.push('trou');
    if (avecDef >= 4) types.push('qcm_notion', 'qcm_definition');
    if (verifierDefinitions && n.statut === 'a_verifier' && !rapide) types.push('verification');
  }
  // Avec l'IA, l'explication est corrigée ; sans, elle est auto-évaluée (flashcard)
  if (!rapide && ia) types.push('explication');
  else if (!rapide || types.length === 0) types.push('flashcard');
  return types;
}

const POIDS: Record<TypeExercice, number> = {
  trou: 3, qcm_notion: 2, qcm_definition: 2, flashcard: 1.5, verification: 2, explication: 2, piste_valider: 0, piste_vf: 0, code: 1.2, bug: 1, sortie: 1.2,
};

/** Choisit et génère un exercice pour la notion, en évitant de répéter le type précédent. */
export function genererExercice(
  n: NotionRevision,
  toutes: NotionRevision[],
  options: { rapide: boolean; precedent?: TypeExercice; hasard?: Hasard; verifierDefinitions?: boolean; ia?: boolean; code?: ModeCode },
): Exercice {
  const hasard = options.hasard ?? Math.random;
  let types = typesPossibles(n, toutes, options.rapide, options.verifierDefinitions, options.ia, options.code);
  if (types.length > 1 && options.precedent) types = types.filter((t) => t !== options.precedent);
  // Une graine jamais révisée dont la définition est à vérifier : on commence souvent par la vérifier
  const poids = (t: TypeExercice) => POIDS[t] * (t === 'verification' && n.etat.niveau === 0 ? 2 : 1);
  const essais = [...types];
  while (essais.length) {
    const total = essais.reduce((s, t) => s + poids(t), 0);
    let tirage = hasard() * total;
    let type = essais[essais.length - 1];
    for (const t of essais) {
      tirage -= poids(t);
      if (tirage <= 0) {
        type = t;
        break;
      }
    }
    const exercice =
      type === 'trou' ? genererTrou(n, toutes, hasard)
      : type === 'qcm_notion' ? genererQcmNotion(n, toutes, hasard)
      : type === 'qcm_definition' ? genererQcmDefinition(n, toutes, hasard)
      : type === 'verification' ? genererVerification(n)
      : type === 'explication' ? genererExplication(n)
      : estCode(type) ? genererCodeAPreparer(n, type)
      : genererFlashcard(n);
    if (exercice) return exercice;
    essais.splice(essais.indexOf(type), 1);
  }
  return genererFlashcard(n);
}

// --------------------------------------------------------------------------
// Correction

export type Reponse =
  | { type: 'texte'; valeur: string }
  | { type: 'option'; index: number }
  | { type: 'jeNeSaisPas' }
  | { type: 'autoEvaluation'; resultat: Resultat }
  | { type: 'verification'; choix: 'juste' | 'corriger' | 'passer' }
  | { type: 'piste'; statut: StatutPiste; justification: string }
  | { type: 'code'; reussi: boolean };

export interface Correction {
  resultat: Resultat | null; // null = ne compte pas (passer / corriger)
  /** Pour la vérification « juste » : la notion devient vérifiée. */
  verifiee?: boolean;
  bonneReponse?: string;
  /** Retour détaillé de l'IA (explication, piste) */
  ia?: {
    note?: number;
    pointsForts?: string[];
    aRevoir?: string[];
    modele?: string;
    retour?: string;
    statut?: StatutPiste;
    justification?: string;
  };
  /** L'IA n'a pas pu corriger (réseau, clé…) */
  erreur?: string;
}

/** Ces exercices sont corrigés par l'IA (dans la séance), pas par `corriger`. */
export function corrigeParIA(e: Exercice): boolean {
  return e.type === 'explication' || e.type === 'piste_valider';
}

export function corriger(e: Exercice, r: Reponse): Correction {
  if (r.type === 'jeNeSaisPas') {
    return { resultat: 'echec', bonneReponse: e.attendu ?? (e.bonneOption !== undefined ? e.options?.[e.bonneOption] : undefined) };
  }
  switch (e.type) {
    case 'trou':
      return { resultat: r.type === 'texte' && reponseCorrecte(r.valeur, e.attendu ?? '') ? 'reussite' : 'echec', bonneReponse: e.attendu };
    case 'qcm_notion':
    case 'qcm_definition':
      return { resultat: r.type === 'option' && r.index === e.bonneOption ? 'reussite' : 'echec', bonneReponse: e.options?.[e.bonneOption ?? 0] };
    case 'flashcard':
      return { resultat: r.type === 'autoEvaluation' ? r.resultat : null };
    case 'verification':
      if (r.type !== 'verification') return { resultat: null };
      return r.choix === 'juste' ? { resultat: 'reussite', verifiee: true } : { resultat: null };
    case 'piste_vf': {
      const attendu = e.piste?.statut ?? 'a_valider';
      const bonneReponse = ETIQUETTES_STATUT[attendu];
      if (r.type !== 'piste') return { resultat: null };
      if (r.statut === attendu) return { resultat: 'reussite', bonneReponse };
      // « en partie » contre « validée » : presque
      const proche = (r.statut === 'partielle' && attendu === 'validee') || (r.statut === 'validee' && attendu === 'partielle');
      return { resultat: proche ? 'moyen' : 'echec', bonneReponse };
    }
    case 'explication':
    case 'piste_valider':
      return { resultat: null };
    case 'code':
    case 'bug':
      return { resultat: r.type === 'code' ? (r.reussi ? 'reussite' : 'echec') : null };
    case 'sortie': {
      const attendu = e.code?.sortieAttendue ?? '';
      if (r.type !== 'texte') return { resultat: null };
      if (memeSortie(r.valeur, attendu)) return { resultat: 'reussite', bonneReponse: attendu };
      // À moitié juste : au moins la moitié des lignes à la bonne place
      const a = attendu.trim().split('\n').map((l) => l.trim());
      const b = r.valeur.trim().split('\n').map((l) => l.trim());
      const justes = a.filter((l, i) => l === b[i]).length;
      return { resultat: justes * 2 >= a.length && justes > 0 ? 'moyen' : 'echec', bonneReponse: attendu };
    }
  }
}
