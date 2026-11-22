// Compilation et exécution des exercices C++ (g++, éventuellement via WSL),
// lecture des erreurs du compilateur et des résultats des tests.

import * as fs from 'fs';
import * as path from 'path';
import { cheminPour, decouperCommande, executer, executerFichier, passeParWsl, type ResultatCommande } from '../systeme';

export type Executeur = (commande: string, args: string[], options?: { cwd?: string; delaiMs?: number }) => Promise<ResultatCommande>;
/** Lance un fichier exécutable (chemin non découpé, espaces permis). */
export type ExecuteurFichier = (programme: string, args: string[], options?: { cwd?: string; delaiMs?: number }) => Promise<ResultatCommande>;

export interface ConfigCompilation {
  /** « wsl g++ », « g++ », « clang++ »… */
  compilateur: string;
  executer?: Executeur;
  executerFichier?: ExecuteurFichier;
  /** Temps maximum d'exécution d'un programme (boucle infinie…) */
  delaiExecutionMs?: number;
}

export interface ErreurCompilation {
  fichier: string; // nom du fichier (sans dossier)
  ligne: number;
  colonne: number;
  gravite: 'error' | 'warning' | 'note';
  message: string;
}

export interface ResultatTest {
  nom: string;
  ok: boolean;
  detail: string;
}

export interface ResultatTests {
  compile: boolean;
  erreurs: ErreurCompilation[];
  sortieCompilation: string;
  tests: ResultatTest[];
  reussis: number;
  total: number;
  /** Le programme s'est arrêté sans afficher le bilan (plantage, exception…) */
  plante: boolean;
  delaiDepasse: boolean;
  /** Ce que le programme a affiché, hors lignes de test */
  sortie: string;
}

/** En-tête de test copié dans chaque exercice. */
export const ENTETE_TEST = `#pragma once
// En-tête de test fourni par Forge : ne pas modifier.
#include <cmath>
#include <iostream>
#include <sstream>
#include <string>

namespace forge {
inline int reussis = 0;
inline int total = 0;

inline std::string nettoyer(std::string s) {
  for (auto& c : s)
    if (c == '\\n' || c == '|') c = ' ';
  return s;
}

inline void resultat(bool ok, const std::string& nom, const std::string& detail = "") {
  ++total;
  if (ok) ++reussis;
  std::cout << (ok ? "FORGE_OK|" : "FORGE_ECHEC|") << nettoyer(nom) << "|" << nettoyer(detail) << std::endl;
}

template <class T>
std::string texte(const T& v) {
  std::ostringstream o;
  o << v;
  return o.str();
}
inline std::string texte(bool v) { return v ? "true" : "false"; }
inline std::string texte(const std::string& v) { return "\\"" + v + "\\""; }
inline std::string texte(const char* v) { return texte(std::string(v)); }

template <class A, class B>
bool egal(const A& a, const B& b) { return a == b; }
inline bool egal(const char* a, const char* b) { return std::string(a) == std::string(b); }

// Ce que la fonction f affiche sur std::cout
template <class F>
std::string capture(F f) {
  std::ostringstream o;
  auto* ancien = std::cout.rdbuf(o.rdbuf());
  f();
  std::cout.rdbuf(ancien);
  return o.str();
}

inline int bilan() {
  std::cout << "FORGE_BILAN|" << reussis << "|" << total << std::endl;
  return reussis == total ? 0 : 1;
}
}  // namespace forge

#define VERIFIE(condition, nom) forge::resultat(static_cast<bool>(condition), nom)
#define VERIFIE_EGAL(obtenu, attendu, nom)                                                              \\
  do {                                                                                                  \\
    const auto& forge_o = (obtenu);                                                                     \\
    const auto& forge_a = (attendu);                                                                    \\
    forge::resultat(forge::egal(forge_o, forge_a), nom,                                                 \\
                    "attendu : " + forge::texte(forge_a) + " ; obtenu : " + forge::texte(forge_o));     \\
  } while (0)
#define VERIFIE_PROCHE(obtenu, attendu, ecart, nom)                                                     \\
  do {                                                                                                  \\
    const double forge_o = (obtenu);                                                                    \\
    const double forge_a = (attendu);                                                                   \\
    forge::resultat(std::fabs(forge_o - forge_a) <= (ecart), nom,                                       \\
                    "attendu : " + forge::texte(forge_a) + " ; obtenu : " + forge::texte(forge_o));     \\
  } while (0)
`;

export function analyserErreursGpp(texte: string): ErreurCompilation[] {
  const erreurs: ErreurCompilation[] = [];
  for (const ligne of texte.split('\n')) {
    const m = ligne.match(/^(.*?):(\d+):(\d+):\s+(fatal error|error|warning|note|erreur|attention|remarque)\s*:\s*(.*)$/);
    if (!m) continue;
    const gravite = /error|erreur/.test(m[4]) ? 'error' : /warning|attention/.test(m[4]) ? 'warning' : 'note';
    erreurs.push({ fichier: m[1].split(/[\\/]/).pop() ?? m[1], ligne: Number(m[2]), colonne: Number(m[3]), gravite, message: m[5].trim() });
  }
  return erreurs;
}

export function analyserSortieTests(texte: string): { tests: ResultatTest[]; reussis: number; total: number; bilanTrouve: boolean; sortie: string } {
  const tests: ResultatTest[] = [];
  const autres: string[] = [];
  let bilan: [number, number] | null = null;
  for (const ligne of texte.split(/\r?\n/)) {
    const t = ligne.match(/^FORGE_(OK|ECHEC)\|([^|]*)\|?(.*)$/);
    const b = ligne.match(/^FORGE_BILAN\|(\d+)\|(\d+)/);
    if (t) tests.push({ ok: t[1] === 'OK', nom: t[2].trim(), detail: t[3].trim() });
    else if (b) bilan = [Number(b[1]), Number(b[2])];
    else autres.push(ligne);
  }
  const reussis = tests.filter((t) => t.ok).length;
  return { tests, reussis, total: bilan ? bilan[1] : tests.length, bilanTrouve: bilan !== null, sortie: autres.join('\n').trim() };
}

function nomExecutable(compilateur: string, base: string): string {
  return process.platform === 'win32' && !passeParWsl(compilateur) ? `${base}.exe` : base;
}

/** Compile `source` (dans `dossier`) en un exécutable. */
export async function compiler(
  cfg: ConfigCompilation,
  dossier: string,
  source: string,
  base: string,
): Promise<{ ok: boolean; executable: string; erreurs: ErreurCompilation[]; sortie: string; introuvable: boolean }> {
  const executer_ = cfg.executer ?? executer;
  const executable = path.join(dossier, nomExecutable(cfg.compilateur, base));
  if (fs.existsSync(executable)) fs.rmSync(executable);
  const r = await executer_(
    cfg.compilateur,
    ['-std=c++17', '-Wall', '-Wextra', '-O0', '-fdiagnostics-color=never', cheminPour(cfg.compilateur, path.join(dossier, source)), '-o', cheminPour(cfg.compilateur, executable)],
    { cwd: dossier, delaiMs: 90_000 },
  );
  const sortie = `${r.erreurs}\n${r.sortie}`.trim();
  return { ok: r.code === 0 && fs.existsSync(executable), executable, erreurs: analyserErreursGpp(sortie), sortie, introuvable: r.introuvable };
}

/** Lance un exécutable avec un délai maximum (via `timeout` dans WSL, pour tuer une boucle infinie). */
export async function lancer(cfg: ConfigCompilation, executable: string, dossier: string): Promise<{ code: number; sortie: string; erreurs: string; delaiDepasse: boolean }> {
  const executer_ = cfg.executer ?? executer;
  const delai = cfg.delaiExecutionMs ?? 5_000;
  const secondes = String(Math.ceil(delai / 1000));
  let r: ResultatCommande;
  if (passeParWsl(cfg.compilateur)) {
    const wsl = decouperCommande(cfg.compilateur).programme;
    r = await executer_(wsl, ['timeout', secondes, cheminPour(cfg.compilateur, executable)], { cwd: dossier, delaiMs: delai + 10_000 });
  } else {
    r = await (cfg.executerFichier ?? executerFichier)(executable, [], { cwd: dossier, delaiMs: delai });
  }
  // `timeout` (WSL) renvoie 124 ; sinon execFile tue le programme et le signale
  const delaiDepasse = r.code === 124 || !!r.tue;
  return { code: r.code, sortie: r.sortie, erreurs: r.erreurs, delaiDepasse };
}

/** Compile tests.cpp (qui inclut exercice.cpp) et lance les tests. */
export async function lancerTests(cfg: ConfigCompilation, dossier: string, fichierTests = 'tests.cpp'): Promise<ResultatTests> {
  const entete = path.join(dossier, 'forge_test.hpp');
  if (!fs.existsSync(entete)) fs.writeFileSync(entete, ENTETE_TEST);
  const c = await compiler(cfg, dossier, fichierTests, '.forge-tests');
  if (!c.ok) {
    return {
      compile: false,
      erreurs: c.erreurs,
      sortieCompilation: c.introuvable ? `Compilateur « ${cfg.compilateur} » introuvable.` : c.sortie,
      tests: [],
      reussis: 0,
      total: 0,
      plante: false,
      delaiDepasse: false,
      sortie: '',
    };
  }
  const r = await lancer(cfg, c.executable, dossier);
  const t = analyserSortieTests(r.sortie);
  return {
    compile: true,
    erreurs: c.erreurs, // avertissements éventuels
    sortieCompilation: c.sortie,
    tests: t.tests,
    reussis: t.reussis,
    total: t.total,
    plante: !t.bilanTrouve && !r.delaiDepasse,
    delaiDepasse: r.delaiDepasse,
    sortie: [t.sortie, r.erreurs.trim()].filter(Boolean).join('\n'),
  };
}

/** Compile et exécute un programme complet (avec main) ; renvoie ce qu'il affiche. */
export async function executerProgramme(
  cfg: ConfigCompilation,
  dossier: string,
  fichier = 'programme.cpp',
): Promise<{ compile: boolean; erreurs: ErreurCompilation[]; sortieCompilation: string; sortie: string; code: number; delaiDepasse: boolean }> {
  const c = await compiler(cfg, dossier, fichier, '.forge-programme');
  if (!c.ok) return { compile: false, erreurs: c.erreurs, sortieCompilation: c.sortie, sortie: '', code: -1, delaiDepasse: false };
  const r = await lancer(cfg, c.executable, dossier);
  return { compile: true, erreurs: c.erreurs, sortieCompilation: c.sortie, sortie: r.sortie, code: r.code, delaiDepasse: r.delaiDepasse };
}

/** Compare deux sorties de programme en ignorant les espaces de fin de ligne et les lignes vides finales. */
export function memeSortie(a: string, b: string): boolean {
  const norm = (t: string) => t.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').trim();
  return norm(a) === norm(b);
}
