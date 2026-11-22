// Exercices de code dans VS Code : atelier pour les séances, nouvel exercice, vérification, liste.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  cheminSolution,
  exerciceDuFichier,
  exerciceExistant,
  ExerciceImpossible,
  enregistrerTentative,
  FICHIER_EXERCICE,
  genererExerciceCode,
  LIBELLES_GENRE,
  lireExercice,
  listerExercices,
  recommencerExercice,
  type CibleExercice,
  type ExerciceCode,
  type GenreCode,
} from './core/exercicesCode';
import { ajouterHistorique, ajouterPreuve, lireNotionsRevision, marquerSansCode, type NotionRevision } from './core/notionsRevision';
import { lireContexteProsit } from './core/pistes';
import { cheminDossier } from './core/coffre';
import type { Atelier } from './core/seance';
import type { ClientIA } from './core/relectureIA';
import { executer } from './systeme';
import { compilateur, obtenirCoffre } from './config';
import { clientIA } from './ia';
import { configCompilation, resumeTests, verifierExercice } from './verificationCode';
import { EcranSeance } from './vues/ecranSeance';
import { ouvrirEcranPapier } from './vues/ecranPapier';
import { genererEtude } from './core/etudeDeCas';

let compilateurVerifie: { commande: string; ok: boolean } | undefined;

/** Le compilateur répond-il ? (vérifié une fois par session de VS Code) */
export async function compilateurDisponible(): Promise<boolean> {
  const commande = compilateur();
  if (compilateurVerifie?.commande !== commande) {
    const r = await executer(commande, ['--version'], { delaiMs: 30_000 });
    compilateurVerifie = { commande, ok: r.code === 0 };
  }
  return compilateurVerifie.ok;
}

function cibleNotion(coffre: string, notion: NotionRevision): CibleExercice {
  const prosit = notion.prosits[0] ? lireContexteProsit(coffre, notion.prosits[0]) : undefined;
  return { titre: notion.titre, notions: [notion], contexte: prosit ? `${prosit.contexte}\n\nProblématique : ${prosit.problematique}` : '' };
}

/** Atelier des séances : réutilise un exercice non réussi, sinon en génère un (si l'IA est disponible). */
export function creerAtelier(coffre: string, client: ClientIA | undefined, journal: vscode.OutputChannel): Atelier {
  return {
    async preparer(notion, genre) {
      const existant = exerciceExistant(coffre, notion.nom, genre);
      if (existant) {
        if (existant.statut === 'abandonne') recommencerExercice(existant);
        return existant;
      }
      if (!client) return null;
      try {
        return await genererExerciceCode(coffre, client, configCompilation(), cibleNotion(coffre, notion), genre);
      } catch (e) {
        if (e instanceof ExerciceImpossible) {
          marquerSansCode(notion.chemin);
          journal.appendLine(`[code] « ${notion.titre} » : pas d'exercice de code (${e.message})`);
        } else {
          journal.appendLine(`[code] génération impossible pour « ${notion.titre} » : ${e instanceof Error ? e.message : e}`);
        }
        return null;
      }
    },
  };
}

async function ouvrirExercice(e: ExerciceCode): Promise<void> {
  await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(e.dossier, 'enonce.md')));
  await vscode.window.showTextDocument(vscode.Uri.file(path.join(e.dossier, FICHIER_EXERCICE)), { viewColumn: vscode.ViewColumn.Beside, preview: false });
}

// --------------------------------------------------------------------------
// Commande : nouvel exercice de code

export async function nouvelExercice(context: vscode.ExtensionContext, journal: vscode.OutputChannel): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  if (!(await compilateurDisponible())) {
    vscode.window.showErrorMessage(`Compilateur « ${compilateur()} » introuvable. Lance « Forge : Vérifier l'installation ».`);
    return;
  }
  const client = await clientIA(context, true);
  if (!client) return;

  const genres: Array<vscode.QuickPickItem & { genre: GenreCode }> = [
    { label: LIBELLES_GENRE.code, description: '5 à 10 min', detail: 'Compléter du code, vérifié par des tests', genre: 'code' },
    { label: LIBELLES_GENRE.bug, description: '5 à 10 min', detail: 'Un code qui compile mais se comporte mal : trouve et corrige le bug', genre: 'bug' },
    { label: LIBELLES_GENRE.long, description: '20 à 40 min', detail: "Dans l'histoire d'un Prosit, plusieurs notions à la fois (prépare les études de cas)", genre: 'long' },
  ];
  const choixGenre = await vscode.window.showQuickPick(genres, { title: 'Nouvel exercice de code', placeHolder: "Quel type d'exercice ?" });
  if (!choixGenre) return;

  let cible: CibleExercice | undefined;
  const notions = lireNotionsRevision(coffre).filter((n) => n.codePossible);
  if (choixGenre.genre === 'long') {
    const dossier = cheminDossier(coffre, 'prosits');
    const prosits = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
    const nom = await vscode.window.showQuickPick(prosits, { title: 'Mini-projet — sur quel Prosit ?' });
    if (!nom) return;
    const contexte = lireContexteProsit(coffre, nom);
    const liees = notions.filter((n) => n.prosits.includes(nom)).sort((a, b) => b.etat.aavCible - a.etat.aavCible).slice(0, 6);
    cible = { titre: contexte?.titre ?? nom, notions: liees, contexte: contexte ? `${contexte.contexte}\n\nProblématique : ${contexte.problematique}` : '' };
  } else {
    const items = notions
      .sort((a, b) => b.etat.aavCible - a.etat.aavCible || a.titre.localeCompare(b.titre, 'fr'))
      .map((n) => ({ label: n.titre, description: `AAV [${n.etat.aavCible}]`, detail: n.prosits.join(' · '), notion: n }));
    const choix = await vscode.window.showQuickPick(items, { title: `${choixGenre.label} — sur quelle notion ?`, matchOnDetail: true });
    if (!choix) return;
    cible = cibleNotion(coffre, choix.notion);
  }

  try {
    const exercice = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: choixGenre.label },
      (progression) => genererExerciceCode(coffre, client, configCompilation(), cible!, choixGenre.genre, { surEtape: (etape) => progression.report({ message: etape }) }),
    );
    await ouvrirExercice(exercice);
    vscode.window.showInformationMessage(`${LIBELLES_GENRE[exercice.genre]} prêt : « ${exercice.titre} ». Code dans exercice.cpp, puis Ctrl+Alt+V pour vérifier.`);
  } catch (e) {
    if (e instanceof ExerciceImpossible) vscode.window.showWarningMessage(`L'IA trouve que cette notion ne se prête pas à un exercice de code : ${e.message}`);
    else vscode.window.showErrorMessage(`Forge : ${e instanceof Error ? e.message : e}`);
  }
}

// --------------------------------------------------------------------------
// Commande : vérifier l'exercice ouvert

export async function verifierCommande(coffre: string | undefined, journal: vscode.OutputChannel, uri?: vscode.Uri): Promise<void> {
  const fichier = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const dossier = fichier ? exerciceDuFichier(fichier) : undefined;
  if (!dossier) {
    vscode.window.showWarningMessage("Ouvre le fichier d'un exercice Forge (exercice.cpp) pour le vérifier.");
    return;
  }
  // Exercice de la séance en cours : c'est l'écran de séance qui affiche le résultat
  if (EcranSeance.verifierSiEnCours(dossier)) return;

  const exercice = lireExercice(dossier);
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: '🔨 Forge : compilation…' }, () => verifierExercice(dossier));
  journal.appendLine(`\n[tests] ${exercice.titre}\n${resumeTests(r)}`);
  for (const t of r.tests) journal.appendLine(`  ${t.ok ? '✅' : '❌'} ${t.nom}${t.ok ? '' : ` — ${t.detail}`}`);
  if (!r.compile) journal.appendLine(r.sortieCompilation);
  if (r.sortie) journal.appendLine(`Sortie du programme :\n${r.sortie}`);

  const reussi = r.compile && !r.plante && !r.delaiDepasse && r.total > 0 && r.reussis === r.total;
  if (reussi) {
    const dejaReussi = exercice.statut === 'reussi';
    enregistrerTentative(exercice, 'reussi');
    if (!dejaReussi && coffre) {
      // Preuve d'AAV pour les notions de l'exercice
      for (const nom of exercice.notions) {
        const chemin = path.join(cheminDossier(coffre, 'notions'), `${nom}.md`);
        if (!fs.existsSync(chemin)) continue;
        ajouterPreuve(chemin, 'code');
        if (exercice.genre === 'long') ajouterPreuve(chemin, 'long');
        ajouterHistorique(coffre, { date: new Date().toISOString(), notion: nom, type: exercice.genre, resultat: 'reussite', compte: false });
      }
    }
    const choix = await vscode.window.showInformationMessage(`${resumeTests(r)} Bravo 🎉`, 'Voir la solution proposée');
    if (choix) await vscode.window.showTextDocument(vscode.Uri.file(cheminSolution(exercice)), { viewColumn: vscode.ViewColumn.Beside });
  } else {
    const choix = await vscode.window.showWarningMessage(resumeTests(r), 'Détails', 'Voir la correction');
    if (choix === 'Détails') journal.show(true);
    if (choix === 'Voir la correction') {
      enregistrerTentative(exercice, 'abandonne');
      await vscode.window.showTextDocument(vscode.Uri.file(cheminSolution(exercice)), { viewColumn: vscode.ViewColumn.Beside });
    }
  }
}

// --------------------------------------------------------------------------
// Commande : mes exercices

export async function mesExercices(): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const exercices = listerExercices(coffre).filter((e) => e.genre !== 'sortie');
  if (exercices.length === 0) {
    vscode.window.showInformationMessage("Aucun exercice pour l'instant. Lance « Forge : Nouvel exercice de code » ou une séance code.");
    return;
  }
  const icone = { a_faire: '⏳', reussi: '✅', abandonne: '🏳️' } as const;
  const choix = await vscode.window.showQuickPick(
    exercices
      .sort((a, b) => Number(a.statut === 'reussi') - Number(b.statut === 'reussi'))
      .map((e) => ({ label: `${icone[e.statut]} ${e.titre}`, description: LIBELLES_GENRE[e.genre], detail: e.notions.join(' · '), e })),
    { title: 'Mes exercices de code', matchOnDetail: true },
  );
  if (!choix) return;
  if (choix.e.statut !== 'a_faire') {
    const refaire = await vscode.window.showQuickPick(['Reprendre mon code', 'Recommencer depuis le début'], { title: choix.e.titre });
    if (!refaire) return;
    if (refaire === 'Recommencer depuis le début') recommencerExercice(choix.e);
  }
  await ouvrirExercice(choix.e);
}

// --------------------------------------------------------------------------
// Commande : étude de cas sur papier

export async function etudeDeCas(context: vscode.ExtensionContext, surFin: () => void): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const client = await clientIA(context, true);
  if (!client) return;
  const dossier = cheminDossier(coffre, 'prosits');
  const prosits = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
  if (prosits.length === 0) {
    vscode.window.showInformationMessage("Aucun Prosit dans le coffre : importe d'abord tes CER.");
    return;
  }
  const prosit = await vscode.window.showQuickPick(prosits, { title: '📝 Étude de cas sur papier — sur quel Prosit ?' });
  if (!prosit) return;
  const duree = await vscode.window.showQuickPick(
    [
      { label: '20 minutes', minutes: 20 },
      { label: '30 minutes', minutes: 30, description: 'compte aussi comme exercice long' },
      { label: '45 minutes', minutes: 45, description: 'compte aussi comme exercice long' },
      { label: '1 heure', minutes: 60, description: "proche d'une vraie épreuve" },
    ],
    { title: 'Durée de l\'épreuve' },
  );
  if (!duree) return;

  const contexte = lireContexteProsit(coffre, prosit);
  const notions = lireNotionsRevision(coffre).filter((n) => n.prosits.includes(prosit));
  try {
    const etude = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "🤖 L'IA écrit le sujet de ton étude de cas…" },
      () => genererEtude(client, { titre: contexte?.titre ?? prosit, contexte: contexte?.contexte ?? '', problematique: contexte?.problematique ?? '', notions }, duree.minutes),
    );
    ouvrirEcranPapier(coffre, client, prosit, etude, notions, surFin);
  } catch (e) {
    vscode.window.showErrorMessage(`Forge : ${e instanceof Error ? e.message : e}`);
  }
}
