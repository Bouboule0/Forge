// Exercices de code C++ : génération par l'IA, vérification par compilation,
// rangement dans le coffre (Exercices/<notion>/…), réutilisation.
//
// Un exercice généré n'est gardé que s'il est cohérent :
// - code / bug / long : la solution passe tous les tests, le code de départ compile et rate au moins un test ;
// - sortie : le programme compile, et la sortie affichée par l'IA est celle du vrai programme.

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier, ecrireNote, lireNote } from './coffre';
import { ENTETE_TEST, executerProgramme, lancerTests, memeSortie, type ConfigCompilation } from './compilation';
import type { NotionRevision } from './notionsRevision';
import type { ClientIA } from './relectureIA';
import { aujourdhui, nomFichierSur } from './texte';

export type GenreCode = 'code' | 'bug' | 'sortie' | 'long';

export const LIBELLES_GENRE: Record<GenreCode, string> = {
  code: '⌨️ Exercice de code',
  bug: '🐞 Trouve le bug',
  sortie: '🔮 Prédis la sortie',
  long: '🧱 Mini-projet',
};

export interface ExerciceCode {
  dossier: string;
  genre: GenreCode;
  titre: string;
  enonce: string; // Markdown
  indices: string[];
  notions: string[]; // noms de notes de notions
  statut: 'a_faire' | 'reussi' | 'abandonne';
  tentatives: number;
  /** sortie : le programme et sa vraie sortie */
  programme?: string;
  sortieAttendue?: string;
  explication?: string;
}

/** Lien vers les cibles des exercices */
export interface CibleExercice {
  titre: string;
  notions: NotionRevision[];
  contexte: string; // contexte du Prosit, pour des exercices « dans l'histoire »
}

export const FICHIER_EXERCICE = 'exercice.cpp';
export const FICHIER_PROGRAMME = 'programme.cpp';
const DOSSIER_SOLUTION = '.solution';

// --------------------------------------------------------------------------
// Sécurité : le code généré par l'IA est exécuté sur ta machine

const INTERDITS = [
  /\b(system|popen|_popen|fork|vfork|execl|execlp|execle|execv|execvp|execve|remove|rename|unlink|rmdir|kill|ShellExecute\w*|CreateProcess\w*)\s*\(/,
  /#\s*include\s*<\s*(filesystem|fstream|unistd\.h|windows\.h|sys\/[\w.]+|spawn\.h|dirent\.h|netinet\/[\w.]+|arpa\/[\w.]+)\s*>/,
  /std::filesystem|\bfopen\s*\(|\basm\b|__asm/,
];

export function codeSur(code: string): boolean {
  return !INTERDITS.some((m) => m.test(code));
}

// --------------------------------------------------------------------------
// Prompts

const COMMUN = `Tu es professeur de C++ en école d'ingénieurs (CESI). Tu crées des exercices pour un étudiant qui révise.
Règles techniques : C++17, bibliothèque standard uniquement, déterministe (pas d'aléatoire, pas d'heure), aucune saisie clavier, aucun fichier, aucun appel système, pas de <filesystem>, <fstream>, system(), fork().
Noms et commentaires en français. Énoncé en Markdown, clair et court, avec un exemple d'utilisation. Réponds uniquement en JSON.
Si la notion ne se prête pas à un exercice de code C++, réponds {"impossible": true, "raison": "..."}.`;

const FORMAT_TESTS = `Le fichier tests.cpp commence par #include "forge_test.hpp" puis #include "exercice.cpp", contient un main() qui teste avec :
- VERIFIE(condition, "nom du test")
- VERIFIE_EGAL(obtenu, attendu, "nom du test")  (types affichables : nombres, bool, std::string)
- VERIFIE_PROCHE(obtenu, attendu, ecart, "nom du test")  (nombres à virgule)
- forge::capture([&]{ ... }) renvoie en std::string ce qu'affiche le code sur std::cout
et se termine par return forge::bilan();
exercice.cpp ne contient PAS de main().`;

function promptGenre(genre: GenreCode): string {
  switch (genre) {
    case 'code':
      return `${COMMUN}
Crée un exercice COURT (5 à 10 minutes) pour pratiquer la notion.
${FORMAT_TESTS}
Le code de départ compile, contient la structure (classes, signatures) et des commentaires // TODO là où l'étudiant doit coder ; les fonctions à écrire renvoient une valeur par défaut. 3 à 6 tests.
Format : {"titre":"...","enonce":"...","exercice_cpp":"code de départ","solution_cpp":"exercice.cpp complet et correct","tests_cpp":"...","indices":["indice 1","indice 2"]}`;
    case 'long':
      return `${COMMUN}
Crée un MINI-PROJET (20 à 40 minutes) dans le contexte du Prosit (reprends son histoire), qui combine plusieurs notions (plusieurs classes, héritage, polymorphisme…).
${FORMAT_TESTS}
Le code de départ compile, donne le squelette et des // TODO ; 6 à 10 tests progressifs.
Format : {"titre":"...","enonce":"...","exercice_cpp":"code de départ","solution_cpp":"exercice.cpp complet et correct","tests_cpp":"...","indices":["indice 1","indice 2","indice 3"]}`;
    case 'bug':
      return `${COMMUN}
Crée un exercice « Trouve le bug » : un code réaliste (20 à 50 lignes) qui contient UN bug typique lié à la notion (oubli de virtual, slicing, mauvaise signature d'override, copie au lieu de référence, destructeur non virtuel, mauvais ordre d'initialisation, condition fausse…). Le bug doit compiler sans erreur.
${FORMAT_TESTS}
L'énoncé décrit le comportement attendu et dit qu'il y a un bug, sans dire où. 3 à 5 tests qui échouent à cause du bug et passent une fois corrigé.
Format : {"titre":"...","enonce":"...","exercice_cpp":"code avec le bug","solution_cpp":"code corrigé (même fichier)","tests_cpp":"...","indices":["indice 1","indice 2"]}`;
    case 'sortie':
      return `${COMMUN}
Crée un exercice « Prédis la sortie » : un programme complet (avec main, 15 à 40 lignes) qui met en jeu une subtilité de la notion (appel virtuel ou non, slicing, ordre des constructeurs/destructeurs, résolution de surcharge, portée…). Il affiche entre 2 et 8 lignes, sans saisie.
Format : {"titre":"...","programme_cpp":"...","sortie_attendue":"ce que le programme affiche exactement","explication":"pourquoi, ligne par ligne (Markdown)"}`;
  }
}

function demande(cible: CibleExercice, genre: GenreCode, erreurPrecedente?: string): string {
  return JSON.stringify(
    {
      genre,
      notions: cible.notions.map((n) => ({
        notion: n.titre,
        aav: n.etat.aavCible,
        definition: n.definitions.map((d) => d.texte).join('\n\n') || n.notesPerso,
      })),
      contexte_du_prosit: cible.contexte || undefined,
      ...(erreurPrecedente ? { probleme_avec_ta_proposition_precedente: erreurPrecedente } : {}),
    },
    null,
    1,
  );
}

// --------------------------------------------------------------------------
// Génération + vérification

export class ExerciceImpossible extends Error {}

function texte(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() + '\n' : '';
}

function dossierExercice(coffre: string, cible: CibleExercice, titre: string): string {
  const parent = path.join(cheminDossier(coffre, 'exercices'), nomFichierSur(cible.notions.length === 1 ? cible.notions[0].nom : cible.titre));
  const base = nomFichierSur(`${aujourdhui()} ${titre}`).slice(0, 80);
  let dossier = path.join(parent, base);
  for (let i = 2; fs.existsSync(dossier); i++) dossier = path.join(parent, `${base} (${i})`);
  return dossier;
}

/** Vérifie un exercice de code dans un dossier temporaire ; renvoie un message d'erreur ou null. */
async function verifierCode(cfg: ConfigCompilation, dossier: string, depart: string, solution: string, tests: string): Promise<string | null> {
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, 'forge_test.hpp'), ENTETE_TEST);
  fs.writeFileSync(path.join(dossier, 'tests.cpp'), tests);

  fs.writeFileSync(path.join(dossier, FICHIER_EXERCICE), solution);
  const avecSolution = await lancerTests(cfg, dossier);
  if (!avecSolution.compile) return `La solution ne compile pas :\n${avecSolution.sortieCompilation.slice(0, 1500)}`;
  if (avecSolution.delaiDepasse) return 'La solution ne se termine pas (boucle infinie ?).';
  if (avecSolution.plante) return `La solution plante pendant les tests :\n${avecSolution.sortie.slice(0, 800)}`;
  if (avecSolution.total === 0) return 'Les tests ne vérifient rien (aucun VERIFIE).';
  if (avecSolution.reussis < avecSolution.total) {
    const rates = avecSolution.tests.filter((t) => !t.ok).map((t) => `${t.nom} (${t.detail})`);
    return `La solution ne passe pas ces tests : ${rates.join(' ; ')}`;
  }

  fs.writeFileSync(path.join(dossier, FICHIER_EXERCICE), depart);
  const avecDepart = await lancerTests(cfg, dossier);
  if (!avecDepart.compile) return `Le code de départ doit compiler, or :\n${avecDepart.sortieCompilation.slice(0, 1500)}`;
  if (!avecDepart.plante && !avecDepart.delaiDepasse && avecDepart.reussis === avecDepart.total) {
    return 'Le code de départ passe déjà tous les tests : il ne reste rien à faire.';
  }
  return null;
}

export async function genererExerciceCode(
  coffre: string,
  client: ClientIA,
  cfg: ConfigCompilation,
  cible: CibleExercice,
  genre: GenreCode,
  options: { essais?: number; surEtape?: (etape: string) => void } = {},
): Promise<ExerciceCode> {
  const essais = options.essais ?? 3;
  const brouillon = path.join(coffre, '.forge', 'brouillon-exercice');
  let erreur: string | undefined;

  for (let essai = 1; essai <= essais; essai++) {
    options.surEtape?.(essai === 1 ? "🤖 L'IA écrit l'exercice…" : `🤖 L'IA corrige son exercice (essai ${essai}/${essais})…`);
    const r = (await client.json(promptGenre(genre), demande(cible, genre, erreur))) as Record<string, unknown>;
    if (r.impossible) throw new ExerciceImpossible(String(r.raison ?? 'Notion pas adaptée à un exercice de code.'));
    const titre = String(r.titre ?? '').trim() || cible.titre;

    fs.rmSync(brouillon, { recursive: true, force: true });
    fs.mkdirSync(brouillon, { recursive: true });
    options.surEtape?.('🔨 Forge compile et vérifie l\'exercice…');

    if (genre === 'sortie') {
      const programme = texte(r.programme_cpp);
      if (!programme) { erreur = 'programme_cpp manquant.'; continue; }
      if (!codeSur(programme)) { erreur = 'Le programme utilise des fonctions interdites (fichiers, système).'; continue; }
      fs.writeFileSync(path.join(brouillon, FICHIER_PROGRAMME), programme);
      const exec = await executerProgramme(cfg, brouillon, FICHIER_PROGRAMME);
      if (!exec.compile) { erreur = `Le programme ne compile pas :\n${exec.sortieCompilation.slice(0, 1500)}`; continue; }
      if (exec.delaiDepasse) { erreur = 'Le programme ne se termine pas.'; continue; }
      const sortie = exec.sortie.replace(/\r/g, '').trimEnd();
      if (!sortie.trim() || sortie.split('\n').length > 15) { erreur = `Le programme doit afficher entre 2 et 8 lignes (il en affiche ${sortie.split('\n').length}).`; continue; }
      // L'explication de l'IA n'est fiable que si elle avait prévu la bonne sortie
      const prevue = String(r.sortie_attendue ?? '');
      if (!memeSortie(prevue, sortie)) {
        erreur = `Ta sortie_attendue est fausse. Le programme affiche réellement :\n${sortie}\nCorrige sortie_attendue et l'explication.`;
        continue;
      }
      return enregistrer(coffre, cible, {
        genre, titre, enonce: 'Que va afficher ce programme ? Écris la sortie exacte, ligne par ligne.', indices: [],
        fichiers: { [FICHIER_PROGRAMME]: programme },
        solution: { 'sortie.txt': sortie + '\n', 'explication.md': texte(r.explication) },
      });
    }

    const depart = texte(r.exercice_cpp);
    const solution = texte(r.solution_cpp);
    const tests = texte(r.tests_cpp);
    if (!depart || !solution || !tests) { erreur = 'Il manque exercice_cpp, solution_cpp ou tests_cpp.'; continue; }
    if (![depart, solution, tests].every(codeSur)) { erreur = 'Le code utilise des fonctions interdites (fichiers, système).'; continue; }
    if (/\bint\s+main\s*\(/.test(depart) || /\bint\s+main\s*\(/.test(solution)) { erreur = 'exercice.cpp ne doit pas contenir de main().'; continue; }
    erreur = (await verifierCode(cfg, brouillon, depart, solution, tests)) ?? undefined;
    if (erreur) continue;
    return enregistrer(coffre, cible, {
      genre, titre, enonce: texte(r.enonce), indices: Array.isArray(r.indices) ? r.indices.map(String) : [],
      fichiers: { [FICHIER_EXERCICE]: depart, 'tests.cpp': tests, 'forge_test.hpp': ENTETE_TEST },
      solution: { [FICHIER_EXERCICE]: solution, 'depart.cpp': depart },
    });
  }
  throw new Error(`L'IA n'a pas réussi à produire un exercice valide.${erreur ? ` Dernier problème : ${erreur.split('\n')[0]}` : ''}`);
}

function enregistrer(
  coffre: string,
  cible: CibleExercice,
  e: { genre: GenreCode; titre: string; enonce: string; indices: string[]; fichiers: Record<string, string>; solution: Record<string, string> },
): ExerciceCode {
  const dossier = dossierExercice(coffre, cible, e.titre);
  fs.mkdirSync(path.join(dossier, DOSSIER_SOLUTION), { recursive: true });
  for (const [nom, contenu] of Object.entries(e.fichiers)) fs.writeFileSync(path.join(dossier, nom), contenu);
  for (const [nom, contenu] of Object.entries(e.solution)) fs.writeFileSync(path.join(dossier, DOSSIER_SOLUTION, nom), contenu);

  const indices = e.indices.map((x, i) => `> [!tip]- Indice ${i + 1}\n> ${x.replace(/\n/g, '\n> ')}`).join('\n\n');
  const fichierPrincipal = e.genre === 'sortie' ? FICHIER_PROGRAMME : FICHIER_EXERCICE;
  const corps = [
    `# ${LIBELLES_GENRE[e.genre]} — ${e.titre}`,
    e.enonce.trim(),
    e.genre === 'sortie' ? `\`\`\`cpp\n${e.fichiers[FICHIER_PROGRAMME].trimEnd()}\n\`\`\`` : `Code à compléter : \`${fichierPrincipal}\` · Vérifier : **Forge : Vérifier l'exercice** (Ctrl+Alt+V)`,
    indices ? `## Indices\n\n${indices}` : '',
  ].filter(Boolean).join('\n\n');
  ecrireNote(
    path.join(dossier, 'enonce.md'),
    {
      type: 'exercice',
      genre: e.genre,
      titre: e.titre,
      notions: cible.notions.map((n) => `[[${n.nom}]]`),
      cree_le: aujourdhui(),
      statut: 'a_faire',
      tentatives: 0,
      tags: ['forge/exercice'],
    },
    corps + '\n',
  );
  return lireExercice(dossier);
}

// --------------------------------------------------------------------------
// Lecture, réutilisation, résultat

export function lireExercice(dossier: string): ExerciceCode {
  const { data, content } = lireNote(path.join(dossier, 'enonce.md'));
  const genre = (['code', 'bug', 'sortie', 'long'].includes(String(data.genre)) ? data.genre : 'code') as GenreCode;
  const lire = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : undefined);
  const indices = [...content.matchAll(/> \[!tip\]- Indice \d+\n((?:> .*\n?)+)/g)].map((m) => m[1].replace(/^> ?/gm, '').trim());
  const enonce = content
    .replace(/^# .*\n+/, '')
    .replace(/\n## Indices[\s\S]*$/, '')
    .replace(/\n*Code à compléter : .*$/m, '')
    .replace(/\n*```cpp[\s\S]*?```\s*$/, '')
    .trim();
  return {
    dossier,
    genre,
    titre: String(data.titre ?? path.basename(dossier)),
    enonce,
    indices,
    notions: (Array.isArray(data.notions) ? data.notions : []).map((x: unknown) => String(x).replace(/^\[\[|\]\]$/g, '')),
    statut: data.statut === 'reussi' || data.statut === 'abandonne' ? data.statut : 'a_faire',
    tentatives: Number(data.tentatives) || 0,
    programme: genre === 'sortie' ? lire(path.join(dossier, FICHIER_PROGRAMME)) : undefined,
    sortieAttendue: genre === 'sortie' ? lire(path.join(dossier, DOSSIER_SOLUTION, 'sortie.txt')) : undefined,
    explication: genre === 'sortie' ? lire(path.join(dossier, DOSSIER_SOLUTION, 'explication.md')) : undefined,
  };
}

export function listerExercices(coffre: string): ExerciceCode[] {
  const racine = cheminDossier(coffre, 'exercices');
  if (!fs.existsSync(racine)) return [];
  const resultat: ExerciceCode[] = [];
  for (const groupe of fs.readdirSync(racine, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const dossierGroupe = path.join(racine, groupe.name);
    for (const ex of fs.readdirSync(dossierGroupe, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dossier = path.join(dossierGroupe, ex.name);
      if (fs.existsSync(path.join(dossier, 'enonce.md'))) resultat.push(lireExercice(dossier));
    }
  }
  return resultat;
}

/** Exercice existant à refaire pour cette notion et ce genre (pas encore réussi), s'il y en a un. */
export function exerciceExistant(coffre: string, notion: string, genre: GenreCode): ExerciceCode | undefined {
  return listerExercices(coffre).find((e) => e.genre === genre && e.statut !== 'reussi' && e.notions.includes(notion));
}

/** Dossier de l'exercice qui contient ce fichier (exercice.cpp, tests.cpp…), s'il y en a un. */
export function exerciceDuFichier(fichier: string): string | undefined {
  let dossier = path.dirname(fichier);
  if (path.basename(dossier) === DOSSIER_SOLUTION) dossier = path.dirname(dossier);
  return fs.existsSync(path.join(dossier, 'enonce.md')) && lireNote(path.join(dossier, 'enonce.md')).data.type === 'exercice' ? dossier : undefined;
}

export function cheminSolution(e: ExerciceCode): string {
  return path.join(e.dossier, DOSSIER_SOLUTION, e.genre === 'sortie' ? 'explication.md' : FICHIER_EXERCICE);
}

export function enregistrerTentative(e: ExerciceCode, statut: ExerciceCode['statut']): void {
  const chemin = path.join(e.dossier, 'enonce.md');
  const { data, content } = lireNote(chemin);
  data.tentatives = (Number(data.tentatives) || 0) + 1;
  data.derniere_tentative = aujourdhui();
  if (data.statut !== 'reussi') data.statut = statut;
  ecrireNote(chemin, data, content);
  e.tentatives = Number(data.tentatives);
  e.statut = data.statut as ExerciceCode['statut'];
}

/** Remet le code de départ (pour refaire l'exercice). */
export function recommencerExercice(e: ExerciceCode): void {
  const depart = path.join(e.dossier, DOSSIER_SOLUTION, 'depart.cpp');
  if (fs.existsSync(depart)) fs.copyFileSync(depart, path.join(e.dossier, FICHIER_EXERCICE));
}
