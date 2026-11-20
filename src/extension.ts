// Point d'entrée de l'extension Forge.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { analyserCer, type CerAnalyse } from './core/parseurCer';
import { construirePlan } from './core/planImport';
import { creerProsit, ecrirePlan } from './core/ecritureCoffre';
import { construireCer } from './core/exportWord';
import { cheminDossier, DOSSIERS } from './core/coffre';
import { afficherEcranImport } from './vues/ecranImport';
import { afficherNotionsARevoir, BarreEtat } from './barreEtat';
import { choisirCoffre, coffreActuel, commandePandoc, compilateur, modeleWord, moduleParDefaut, obtenirCoffre } from './config';
import { cheminPour, executer, passeParWsl } from './systeme';
import { lancerRevision, suggererRevision } from './revision';

let journal: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  journal = vscode.window.createOutputChannel('Forge');
  const barre = new BarreEtat();

  const commande = (id: string, action: (...args: any[]) => unknown) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: any[]) => {
        try {
          await action(...args);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          journal.appendLine(`[erreur] ${id} : ${e instanceof Error ? e.stack : message}`);
          vscode.window.showErrorMessage(`Forge : ${message}`, 'Voir le journal').then((r) => r && journal.show());
        }
      }),
    );

  commande('forge.verifierInstallation', verifierInstallation);
  commande('forge.choisirCoffre', async () => {
    await choisirCoffre();
    barre.actualiser();
  });
  commande('forge.importer', async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
    await importer(uri, uris);
    barre.actualiser();
  });
  commande('forge.nouveauProsit', nouveauProsit);
  commande('forge.exporterWord', exporterWord);
  commande('forge.ouvrirCoffre', ouvrirCoffre);
  commande('forge.notionsARevoir', afficherNotionsARevoir);
  commande('forge.reviser', (uri?: vscode.Uri) => lancerRevision(uri, () => barre.actualiser()));

  context.subscriptions.push(
    barre,
    journal,
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('forge') && barre.actualiser()),
  );

  // Une révision est proposée au démarrage (au plus une fois par jour)
  setTimeout(() => suggererRevision(context), 4000);

  // Premier lancement : petit message d'accueil
  if (!context.globalState.get('forge.accueilVu') && !coffreActuel()) {
    context.globalState.update('forge.accueilVu', true);
    vscode.window
      .showInformationMessage('🌱 Bienvenue dans Forge ! Commence par créer ton second cerveau.', 'Créer mon coffre', 'Vérifier l\'installation')
      .then((r) => {
        if (r === 'Créer mon coffre') vscode.commands.executeCommand('forge.choisirCoffre');
        if (r === 'Vérifier l\'installation') vscode.commands.executeCommand('forge.verifierInstallation');
      });
  }
}

export function deactivate(): void {}

// --------------------------------------------------------------------------
// Vérifier l'installation (phase 0 : « Hello Forge »)

async function verifierInstallation(): Promise<void> {
  journal.clear();
  journal.show(true);
  const ligne = (ok: boolean | null, texte: string) => journal.appendLine(`${ok === null ? '➖' : ok ? '✅' : '❌'} ${texte}`);
  journal.appendLine('🔨 Forge — vérification de l\'installation\n');

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Forge : vérification…' }, async () => {
    // Coffre
    const coffre = coffreActuel();
    ligne(!!coffre, coffre ? `Coffre : ${coffre}` : 'Coffre : pas encore créé (commande « Forge : Créer / choisir le coffre Obsidian »)');

    // Compilateur C++ + programme de test
    const cxx = compilateur();
    const version = await executer(cxx, ['--version'], { delaiMs: 30_000 });
    if (version.introuvable || version.code !== 0) {
      ligne(false, `Compilateur « ${cxx} » introuvable ou en erreur.`);
      if (version.erreurs) journal.appendLine(`    ${version.erreurs.trim()}`);
      if (passeParWsl(cxx)) journal.appendLine('    → Vérifie que WSL est installé et que « g++ » y fonctionne (dans WSL : sudo apt install g++).');
    } else {
      ligne(true, `Compilateur : ${cxx} — ${version.sortie.split('\n')[0]}`);
      const dossierTest = coffre ? path.join(coffre, DOSSIERS.forge, 'test') : fs.mkdtempSync(path.join(os.tmpdir(), 'forge-'));
      fs.mkdirSync(dossierTest, { recursive: true });
      const source = path.join(dossierTest, 'hello.cpp');
      const executable = path.join(dossierTest, 'hello');
      fs.writeFileSync(source, '#include <iostream>\nint main() { std::cout << "Hello Forge !" << std::endl; return 0; }\n');
      const compilation = await executer(cxx, ['-std=c++17', cheminPour(cxx, source), '-o', cheminPour(cxx, executable)], { delaiMs: 60_000 });
      if (compilation.code !== 0) {
        ligne(false, `Compilation d'un programme de test : échec\n${compilation.erreurs}`);
      } else {
        const lanceur = passeParWsl(cxx) ? cxx.split(/\s+/)[0] : cheminPour(cxx, executable);
        const execution = passeParWsl(cxx) ? await executer(lanceur, [cheminPour(cxx, executable)]) : await executer(lanceur, []);
        ligne(execution.sortie.includes('Hello Forge'), `Programme de test compilé et lancé : « ${execution.sortie.trim() || execution.erreurs.trim()} »`);
      }
    }

    // pandoc (export Word)
    const pandoc = commandePandoc();
    const vPandoc = await executer(pandoc, ['--version']);
    ligne(vPandoc.code === 0 ? true : null, vPandoc.code === 0 ? `pandoc : ${vPandoc.sortie.split('\n')[0]}` : `pandoc absent (utile seulement pour l'export Word) → winget install JohnMacFarlane.Pandoc, ou réglage forge.pandoc = « wsl pandoc »`);

    // git (synchronisation)
    const vGit = await executer('git', ['--version']);
    ligne(vGit.code === 0 ? true : null, vGit.code === 0 ? `git : ${vGit.sortie.trim()}` : 'git absent (utile pour synchroniser le coffre avec GitHub)');

    ligne(null, 'Clé DeepSeek : sera demandée à la phase 3 (exercices avec IA).');
  });
  journal.appendLine('\nTerminé. Si tout est ✅, tu peux importer tes CER : « Forge : Importer des CER / Prosits (.docx) ».');
}

// --------------------------------------------------------------------------
// Import des CER

async function importer(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;

  let fichiers = (uris && uris.length ? uris : uri ? [uri] : []).filter((u) => u.fsPath.toLowerCase().endsWith('.docx'));
  if (fichiers.length === 0) {
    fichiers =
      (await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: { 'Documents Word': ['docx'] },
        openLabel: 'Importer',
        title: 'Choisis un ou plusieurs CER / Prosits Aller (.docx)',
      })) ?? [];
  }
  if (fichiers.length === 0) return;

  const analyses: CerAnalyse[] = [];
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Forge : lecture des documents' }, async (progression) => {
    for (const f of fichiers) {
      progression.report({ message: path.basename(f.fsPath), increment: 100 / fichiers.length });
      try {
        analyses.push(await analyserCer(f.fsPath));
      } catch (e) {
        journal.appendLine(`[erreur] lecture de ${f.fsPath} : ${e instanceof Error ? e.stack : e}`);
        vscode.window.showWarningMessage(`Impossible de lire ${path.basename(f.fsPath)} (fichier Word valide ?)`);
      }
    }
  });
  if (analyses.length === 0) return;

  const plan = construirePlan(coffre, analyses, moduleParDefaut());
  const valide = await afficherEcranImport(plan);
  if (!valide) return;

  const resultat = ecrirePlan(valide);
  journal.appendLine(`[import] ${JSON.stringify(resultat, null, 2)}`);

  const morceaux = [
    `${resultat.prositsCrees.length} Prosit(s)`,
    `${resultat.notionsCreees.length} notion(s) créée(s)`,
    resultat.notionsMisesAJour.length ? `${resultat.notionsMisesAJour.length} mise(s) à jour` : '',
    resultat.prositsIgnores.length ? `${resultat.prositsIgnores.length} Prosit(s) déjà présent(s) gardé(s)` : '',
  ].filter(Boolean);
  const choix = await vscode.window.showInformationMessage(`🌱 Import terminé : ${morceaux.join(', ')}.`, 'Ouvrir dans Obsidian', 'Ouvrir le Prosit');
  const premier = resultat.prositsCrees[0] ?? resultat.prositsIgnores[0];
  const cheminPremier = premier ? path.join(cheminDossier(coffre, 'prosits'), `${premier}.md`) : undefined;
  if (choix === 'Ouvrir le Prosit' && cheminPremier) await vscode.window.showTextDocument(vscode.Uri.file(cheminPremier));
  if (choix === 'Ouvrir dans Obsidian') {
    await vscode.env.openExternal(vscode.Uri.parse(`obsidian://open?path=${encodeURIComponent(cheminPremier ?? coffre)}`));
  }
}

// --------------------------------------------------------------------------
// Nouveau Prosit

async function nouveauProsit(): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const dossier = cheminDossier(coffre, 'prosits');
  const numeros = fs.existsSync(dossier)
    ? fs.readdirSync(dossier).map((f) => Number(f.match(/^P(\d+)/)?.[1])).filter((n) => !Number.isNaN(n))
    : [];
  const suivant = numeros.length ? Math.max(...numeros) + 1 : 1;

  const numero = await vscode.window.showInputBox({
    title: 'Nouveau Prosit (1/3) — numéro',
    value: String(suivant),
    validateInput: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? undefined : 'Un nombre, par exemple 5'),
  });
  if (!numero) return;
  const titre = await vscode.window.showInputBox({ title: 'Nouveau Prosit (2/3) — titre', placeHolder: 'ex. Le zoo des templates' });
  if (titre === undefined) return;
  const module = await vscode.window.showInputBox({ title: 'Nouveau Prosit (3/3) — module', value: moduleParDefaut() });
  if (module === undefined) return;

  const chemin = creerProsit(coffre, Number(numero), titre.trim(), module.trim());
  await vscode.window.showTextDocument(vscode.Uri.file(chemin));
}

// --------------------------------------------------------------------------
// Export Word

async function exporterWord(uri?: vscode.Uri): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  let note = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  const dossierProsits = cheminDossier(coffre, 'prosits');
  if (!note || !note.endsWith('.md') || path.dirname(note) !== dossierProsits) {
    const notes = fs.existsSync(dossierProsits) ? fs.readdirSync(dossierProsits).filter((f) => f.endsWith('.md')).sort() : [];
    if (notes.length === 0) {
      vscode.window.showWarningMessage('Aucun Prosit dans le coffre pour le moment.');
      return;
    }
    const choix = await vscode.window.showQuickPick(notes.map((f) => f.slice(0, -3)), { title: 'Quel Prosit exporter en Word ?' });
    if (!choix) return;
    note = path.join(dossierProsits, `${choix}.md`);
  }

  // Enregistre la note si elle est ouverte et modifiée
  const ouvert = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === note);
  if (ouvert?.isDirty) await ouvert.save();

  const { markdown, nomFichier } = construireCer(coffre, note);
  const temporaire = path.join(coffre, DOSSIERS.forge, 'export.md');
  fs.mkdirSync(path.dirname(temporaire), { recursive: true });
  fs.writeFileSync(temporaire, markdown, 'utf8');
  const sortie = path.join(cheminDossier(coffre, 'exports'), nomFichier);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });

  const pandoc = commandePandoc();
  const args = ['-f', 'markdown', '-t', 'docx', '-o', cheminPour(pandoc, sortie), `--resource-path=${cheminPour(pandoc, coffre)}`];
  const modele = modeleWord();
  if (modele && fs.existsSync(modele)) args.push(`--reference-doc=${cheminPour(pandoc, modele)}`);
  args.push(cheminPour(pandoc, temporaire));

  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Forge : export Word…' }, () => executer(pandoc, args));
  if (r.introuvable || r.code !== 0) {
    journal.appendLine(`[export] ${pandoc} ${args.join(' ')}\n${r.erreurs}`);
    const choix = await vscode.window.showErrorMessage(
      r.introuvable
        ? 'pandoc est introuvable. Installe-le (PowerShell : winget install JohnMacFarlane.Pandoc) puis redémarre VS Code.'
        : `L'export a échoué : ${r.erreurs.split('\n')[0]}`,
      'Page d\'installation de pandoc',
      'Voir le journal',
    );
    if (choix === 'Page d\'installation de pandoc') vscode.env.openExternal(vscode.Uri.parse('https://pandoc.org/installing.html'));
    if (choix === 'Voir le journal') journal.show();
    return;
  }
  const choix = await vscode.window.showInformationMessage(`📄 CER exporté : ${nomFichier}`, 'Ouvrir', 'Afficher dans le dossier');
  if (choix === 'Ouvrir') await vscode.env.openExternal(vscode.Uri.file(sortie));
  if (choix === 'Afficher dans le dossier') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(sortie));
}

// --------------------------------------------------------------------------

async function ouvrirCoffre(): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(coffre), { forceNewWindow: true });
}
