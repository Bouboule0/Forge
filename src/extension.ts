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
import { reglages as reglagesForge, choisirCoffre, coffreActuel, commandePandoc, compilateur, modeleWord, moduleParDefaut, obtenirCoffre } from './config';
import { cheminPour, executer, passeParWsl } from './systeme';
import { lancerRevision, suggererRevision } from './revision';
import { etudeDeCas, mesExercices, nouvelExercice, verifierCommande } from './code';
import { initialiserDiagnostics } from './verificationCode';
import { EcranFerme } from './vues/ecranFerme';
import { EcranStats } from './vues/ecranStats';
import { EmploiDuTemps } from './edt';
import { VueEmploiDuTemps } from './vues/vueEmploiDuTemps';
import { lancerCctl, mesExamens, nouvelExamen, preparerExamen, type OutilsExamens } from './examens';
import { lireExamens } from './core/examens';
import type { Perimetre } from './core/seance';
import { accepterDefinitionsIA, configurerCle, lancerRelecture } from './ia';

let journal: vscode.OutputChannel;
let contexte: vscode.ExtensionContext | undefined;

declare const __VERSION_BUILD__: string;

/** Le code compilé ne correspond pas au package.json : il faut relancer npm install + build. */
function verifierBuild(context: vscode.ExtensionContext): void {
  const attendue = String(context.extension?.packageJSON?.version ?? '');
  const compilee = typeof __VERSION_BUILD__ === 'string' ? __VERSION_BUILD__ : '?';
  if (attendue && compilee !== attendue) {
    vscode.window.showWarningMessage(
      `Forge n'a pas été reconstruite après la mise à jour (code ${compilee}, version ${attendue}). Dans le terminal du projet : npm install, puis arrête et relance le débogage (F5).`,
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  contexte = context;
  journal = vscode.window.createOutputChannel('Forge');
  try {
    verifierBuild(context);
  } catch {
    // Une simple vérification ne doit jamais empêcher l'extension de démarrer
  }
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
    const importe = await importer(uri, uris);
    barre.actualiser();
    // Les nouvelles définitions sont relues par l'IA (si une clé DeepSeek est enregistrée)
    if (importe && reglagesForge().get<boolean>('relectureIAApresImport', true)) {
      await lancerRelecture(context, { demander: false, journal });
    }
  });
  commande('forge.configurerCleDeepSeek', () => configurerCle(context));
  commande('forge.relireDefinitions', () => lancerRelecture(context, { demander: true, journal }));
  commande('forge.relireToutesDefinitions', async () => {
    const ok = await vscode.window.showWarningMessage(
      "Faire relire TOUTES les définitions par l'IA, même celles déjà relues ou écrites par toi ?",
      { modal: true },
      'Oui, tout relire',
    );
    if (ok) await lancerRelecture(context, { demander: true, toutes: true, journal });
  });
  commande('forge.nouveauProsit', nouveauProsit);
  commande('forge.exporterWord', exporterWord);
  commande('forge.ouvrirCoffre', ouvrirCoffre);
  commande('forge.notionsARevoir', afficherNotionsARevoir);
  // Après une activité (séance, étude de cas…) : barre d'état et ferme à jour
  const apresActivite = () => {
    barre.actualiser();
    EcranFerme.actualiser();
    EcranStats.actualiser();
  };
  const outilsExamens: OutilsExamens = {
    reviser: (perimetre: Perimetre) => lancerRevision(context, journal, perimetre, apresActivite),
    etudeDeCas: (programme) => etudeDeCas(context, apresActivite, programme),
    surFin: apresActivite,
  };
  commande('forge.reviser', (uri?: vscode.Uri) => lancerRevision(context, journal, uri, apresActivite));
  commande('forge.ferme', async () => {
    const coffre = await obtenirCoffre();
    if (!coffre) return;
    EcranFerme.ouvrir(coffre, {
      reviserNotion: (nom) => lancerRevision(context, journal, vscode.Uri.file(path.join(cheminDossier(coffre, 'notions'), `${nom}.md`)), apresActivite),
    });
  });
  commande('forge.nouvelExercice', () => nouvelExercice(context, journal));
  commande('forge.verifierExercice', (uri?: vscode.Uri) => verifierCommande(coffreActuel(), journal, uri));
  commande('forge.mesExercices', mesExercices);
  commande('forge.etudeDeCas', () => etudeDeCas(context, apresActivite));
  commande('forge.examens', () => mesExamens(context, outilsExamens));
  // Emploi du temps (phase annexe A) : petite fenêtre dans la barre latérale.
  // Protégé : un souci ici ne doit pas empêcher le reste de Forge de fonctionner.
  let edt: EmploiDuTemps | undefined;
  try {
    edt = new EmploiDuTemps(context, journal);
    context.subscriptions.push(
      edt,
      vscode.window.registerWebviewViewProvider(
        VueEmploiDuTemps.id,
        new VueEmploiDuTemps(edt, {
          reviserProsits: (prosits, titre) => lancerRevision(context, journal, { type: 'prosits', noms: prosits, titre }, apresActivite),
        }),
      ),
    );
  } catch (e) {
    journal.appendLine(`[emploi du temps] initialisation impossible : ${e instanceof Error ? e.stack : e}`);
  }
  const sansEdt = () => vscode.window.showErrorMessage("L'emploi du temps n'a pas pu démarrer : voir le journal Forge.");
  commande('forge.edt.ouvrir', () => vscode.commands.executeCommand(`${VueEmploiDuTemps.id}.focus`));
  commande('forge.edt.configurer', () => (edt ? edt.configurer() : sansEdt()));
  commande('forge.edt.actualiser', () => (edt ? edt.actualiser(true) : sansEdt()));
  commande('forge.edt.deconnecter', () => (edt ? edt.deconnecter() : sansEdt()));
  commande('forge.priseEnMain', () => vscode.commands.executeCommand('workbench.action.openWalkthrough', 'bouboule0.forge#forge.priseEnMain', false));
  commande('forge.cctlBlanc', async () => {
    const coffre = await obtenirCoffre();
    if (!coffre) return;
    const dossier = cheminDossier(coffre, 'prosits');
    const prosits = fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
    const choix = await vscode.window.showQuickPick(
      [{ label: '📚 Toutes les notions', p: { type: 'tout' } as Perimetre }, ...prosits.map((p) => ({ label: p, p: { type: 'prosit', nom: p } as Perimetre }))],
      { title: '📝 CCTL blanc — sur quoi ?' },
    );
    if (choix) await lancerCctl(context, choix.p, choix.label.replace('📚 ', ''), outilsExamens);
  });
  commande('forge.statistiques', async () => {
    const coffre = await obtenirCoffre();
    if (!coffre) return;
    EcranStats.ouvrir(coffre, {
      reviserNotion: (nom) => lancerRevision(context, journal, { type: 'notion', nom }, apresActivite),
      reviserExamen: (id) => {
        const e = lireExamens(coffre).find((x) => x.id === id);
        if (e) void preparerExamen(context, e, outilsExamens);
      },
      ajouterExamen: () => void nouvelExamen(apresActivite),
    });
  });

  context.subscriptions.push(
    barre,
    journal,
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('forge') && barre.actualiser()),
  );

  // Après les commandes : un souci ici ne doit pas empêcher Forge de fonctionner
  try {
    initialiserDiagnostics(context);
  } catch (e) {
    journal.appendLine(`[diagnostics] ${e}`);
  }

  // Une révision est proposée au démarrage (au plus une fois par jour)
  setTimeout(() => suggererRevision(context), 4000);

  // Premier lancement : petit message d'accueil
  if (!context.globalState.get('forge.accueilVu') && !coffreActuel()) {
    context.globalState.update('forge.accueilVu', true);
    vscode.window
      .showInformationMessage('🌱 Bienvenue dans Forge ! Commence par créer ton second cerveau.', 'Prise en main', 'Créer mon coffre', 'Vérifier l\'installation')
      .then((r) => {
        if (r === 'Prise en main') vscode.commands.executeCommand('forge.priseEnMain');
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

    const cle = await contexte?.secrets.get('forge.deepseek.cle');
    ligne(cle ? true : null, cle ? 'Clé DeepSeek : enregistrée' : 'Clé DeepSeek : absente (commande « Forge : Configurer la clé DeepSeek »), utile pour la relecture des définitions');
  });
  journal.appendLine('\nTerminé. Si tout est ✅, tu peux importer tes CER : « Forge : Importer des CER / Prosits (.docx) ».');
}

// --------------------------------------------------------------------------
// Import des CER

async function importer(uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<boolean> {
  const coffre = await obtenirCoffre();
  if (!coffre) return false;

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
  if (fichiers.length === 0) return false;

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
  if (analyses.length === 0) return false;

  const plan = construirePlan(coffre, analyses, moduleParDefaut());
  const valide = await afficherEcranImport(plan);
  if (!valide) return false;

  const resultat = ecrirePlan(valide, { accepterDefinitionsIA: accepterDefinitionsIA() });
  journal.appendLine(`[import] ${JSON.stringify(resultat, null, 2)}`);

  const morceaux = [
    `${resultat.prositsCrees.length} Prosit(s)`,
    `${resultat.notionsCreees.length} notion(s) créée(s)`,
    resultat.notionsMisesAJour.length ? `${resultat.notionsMisesAJour.length} mise(s) à jour` : '',
    resultat.prositsIgnores.length ? `${resultat.prositsIgnores.length} Prosit(s) déjà présent(s) gardé(s)` : '',
  ].filter(Boolean);
  const premier = resultat.prositsCrees[0] ?? resultat.prositsIgnores[0];
  const cheminPremier = premier ? path.join(cheminDossier(coffre, 'prosits'), `${premier}.md`) : undefined;
  // Pas d'attente ici : la relecture IA peut démarrer pendant que le message est affiché
  vscode.window.showInformationMessage(`🌱 Import terminé : ${morceaux.join(', ')}.`, 'Ouvrir dans Obsidian', 'Ouvrir le Prosit').then(async (choix) => {
    if (choix === 'Ouvrir le Prosit' && cheminPremier) await vscode.window.showTextDocument(vscode.Uri.file(cheminPremier));
    if (choix === 'Ouvrir dans Obsidian') {
      await vscode.env.openExternal(vscode.Uri.parse(`obsidian://open?path=${encodeURIComponent(cheminPremier ?? coffre)}`));
    }
  });
  return true;
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
