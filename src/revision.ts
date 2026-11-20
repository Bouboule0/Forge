// Lancement des séances de révision : choix du mode, du périmètre, suggestion à l'ouverture.

import * as path from 'path';
import * as vscode from 'vscode';
import { cheminDossier, compterNotionsARevoir } from './core/coffre';
import { lireNotionsRevision } from './core/notionsRevision';
import { dansPerimetre, type Perimetre } from './core/seance';
import { aujourdhui } from './core/texte';
import { estARevoir } from './core/repetition';
import { coffreActuel, obtenirCoffre, reglages } from './config';
import { EcranSeance } from './vues/ecranSeance';

/** Périmètre déduit du fichier (clic droit sur une note Prosit ou Notion). */
function perimetreDepuis(coffre: string, uri?: vscode.Uri): Perimetre {
  if (!uri || !uri.fsPath.endsWith('.md')) return { type: 'tout' };
  const dossier = path.dirname(uri.fsPath);
  const nom = path.basename(uri.fsPath, '.md');
  if (dossier === cheminDossier(coffre, 'prosits')) return { type: 'prosit', nom };
  if (dossier === cheminDossier(coffre, 'notions')) return { type: 'notion', nom };
  return { type: 'tout' };
}

export async function lancerRevision(uri: vscode.Uri | undefined, surFin: () => void): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const perimetre = perimetreDepuis(coffre, uri instanceof vscode.Uri ? uri : undefined);
  const notions = lireNotionsRevision(coffre).filter((n) => dansPerimetre(n, perimetre));
  if (notions.length === 0) {
    const r = await vscode.window.showInformationMessage('Aucune notion à réviser pour le moment. Importe d\'abord tes CER.', 'Importer mes CER');
    if (r) vscode.commands.executeCommand('forge.importer');
    return;
  }
  const aRevoir = notions.filter((n) => estARevoir(n.etat)).length;
  const cible = perimetre.type === 'tout' ? '' : ` — ${perimetre.nom}`;

  type Choix = vscode.QuickPickItem & { rapide: boolean; entrainement: boolean };
  const choix: Choix[] = [];
  if (aRevoir > 0) {
    choix.push(
      { label: '⚡ Séance rapide', description: 'textes à trous et QCM', detail: `${aRevoir} notion(s) à revoir — idéal entre deux cours`, rapide: true, entrainement: false },
      { label: '🧠 Séance complète', description: '+ explications et vérification des définitions', detail: 'Pour une vraie session de révision', rapide: false, entrainement: false },
    );
  }
  choix.push({
    label: '🏋️ Entraînement libre',
    description: 'tout le périmètre, sans toucher au calendrier',
    detail: aRevoir === 0 ? 'Rien à revoir aujourd\'hui 🎉 — tu peux quand même t\'entraîner' : 'Ne fait ni pousser ni faner tes plantes',
    rapide: false,
    entrainement: true,
  });

  const choisi = await vscode.window.showQuickPick(choix, { title: `🌱 Réviser${cible}`, placeHolder: 'Quel type de séance ?' });
  if (!choisi) return;
  EcranSeance.ouvrir(coffre, { rapide: choisi.rapide, entrainement: choisi.entrainement, perimetre }, surFin);
}

/** Propose une révision au démarrage de VS Code (une fois par jour au maximum). */
export function suggererRevision(context: vscode.ExtensionContext): void {
  if (!reglages().get<boolean>('suggestionOuverture', true)) return;
  const coffre = coffreActuel();
  if (!coffre) return;
  const date = aujourdhui();
  if (context.globalState.get('forge.derniereSuggestion') === date) return;
  const { aRevoir } = compterNotionsARevoir(coffre);
  if (aRevoir === 0) return;
  context.globalState.update('forge.derniereSuggestion', date);
  vscode.window
    .showInformationMessage(`🌱 ${aRevoir} notion(s) ont soif 💧`, 'Réviser', 'Plus tard', 'Ne plus proposer')
    .then((r) => {
      if (r === 'Réviser') vscode.commands.executeCommand('forge.reviser');
      if (r === 'Ne plus proposer') reglages().update('suggestionOuverture', false, vscode.ConfigurationTarget.Global);
    });
}
