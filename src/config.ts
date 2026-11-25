// Réglages de Forge et choix du coffre.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { estUnCoffre } from './core/coffre';
import { initialiserCoffre } from './core/ecritureCoffre';
import { cheminLocal } from './systeme';

export function reglages() {
  return vscode.workspace.getConfiguration('forge');
}

export function compilateur(): string {
  const valeur = reglages().get<string>('compilateur', 'auto').trim();
  if (valeur && valeur !== 'auto') return valeur;
  return process.platform === 'win32' ? 'wsl g++' : 'g++';
}

export function commandePandoc(): string {
  return reglages().get<string>('pandoc', 'pandoc').trim() || 'pandoc';
}

export function modeleWord(): string {
  const chemin = reglages().get<string>('modeleWord', '').trim();
  return chemin ? cheminLocal(chemin) : '';
}

export function moduleParDefaut(): string {
  return reglages().get<string>('moduleParDefaut', 'Programmation orientée objet');
}

/** Coffre configuré et existant, sinon undefined. */
export function coffreActuel(): string | undefined {
  // Le réglage peut avoir été enregistré sous Windows (C:\…) ou dans WSL (/mnt/c/…)
  const chemin = cheminLocal(reglages().get<string>('cheminCoffre', '').trim());
  return chemin && fs.existsSync(chemin) ? chemin : undefined;
}

/** Coffre configuré ; sinon propose d'en créer ou d'en choisir un. */
export async function obtenirCoffre(): Promise<string | undefined> {
  return coffreActuel() ?? choisirCoffre();
}

export async function choisirCoffre(): Promise<string | undefined> {
  const actuel = coffreActuel();
  const choix = await vscode.window.showQuickPick(
    [
      { label: '$(new-folder) Créer un nouveau coffre', description: 'Recommandé si tu pars de zéro', valeur: 'creer' },
      { label: '$(folder-opened) Choisir un dossier existant', description: 'Un coffre Obsidian que tu as déjà', valeur: 'choisir' },
    ],
    { title: actuel ? `Forge — coffre actuel : ${actuel}` : 'Forge — où ranger ton second cerveau ?', ignoreFocusOut: true },
  );
  if (!choix) return undefined;

  let dossier: string | undefined;
  if (choix.valeur === 'creer') {
    const parent = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      defaultUri: vscode.Uri.file(os.homedir()),
      openLabel: 'Créer le coffre ici',
      title: 'Dans quel dossier créer le coffre ? (ex. ton dossier Documents)',
    });
    if (!parent?.[0]) return undefined;
    const nom = await vscode.window.showInputBox({
      title: 'Nom du coffre',
      value: 'SecondCerveau',
      ignoreFocusOut: true,
      validateInput: (v) => (/^[^\\/:*?"<>|]+$/.test(v.trim()) ? undefined : 'Nom de dossier invalide'),
    });
    if (!nom) return undefined;
    dossier = path.join(parent[0].fsPath, nom.trim());
    if (fs.existsSync(dossier) && fs.readdirSync(dossier).length > 0 && !estUnCoffre(dossier)) {
      const ok = await vscode.window.showWarningMessage(`Le dossier ${dossier} existe déjà et n'est pas vide. L'utiliser quand même ?`, { modal: true }, 'Oui');
      if (ok !== 'Oui') return undefined;
    }
    fs.mkdirSync(dossier, { recursive: true });
  } else {
    const choisi = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Utiliser ce coffre' });
    if (!choisi?.[0]) return undefined;
    dossier = choisi[0].fsPath;
  }

  initialiserCoffre(dossier);
  await reglages().update('cheminCoffre', dossier, vscode.ConfigurationTarget.Global);
  vscode.window
    .showInformationMessage(`Coffre prêt : ${dossier}. Ouvre-le une fois dans Obsidian (« Ouvrir un dossier comme coffre »).`, 'Importer mes CER')
    .then((r) => r && vscode.commands.executeCommand('forge.importer'));
  return dossier;
}
