// Clé DeepSeek (stockée dans le coffre-fort de VS Code, jamais en clair) et relecture des définitions.

import * as vscode from 'vscode';
import { creerClientDeepSeek, ErreurIA, notionsARelire, relireDefinitions, type ClientIA } from './core/relectureIA';
import { lireNotionsRevision } from './core/notionsRevision';
import { obtenirCoffre, reglages } from './config';

const CLE_SECRETE = 'forge.deepseek.cle';

export function accepterDefinitionsIA(): boolean {
  return reglages().get<string>('definitionsIA', 'accepter') !== 'verifier';
}

export async function configurerCle(context: vscode.ExtensionContext): Promise<boolean> {
  const actuelle = await context.secrets.get(CLE_SECRETE);
  const cle = await vscode.window.showInputBox({
    title: 'Clé API DeepSeek',
    prompt: actuelle
      ? 'Une clé est déjà enregistrée. Colle une nouvelle clé pour la remplacer, ou laisse vide et valide pour la supprimer.'
      : 'Crée une clé sur platform.deepseek.com → API keys, puis colle-la ici. Elle est stockée de façon sécurisée par VS Code.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-…',
  });
  if (cle === undefined) return false;
  if (!cle.trim()) {
    await context.secrets.delete(CLE_SECRETE);
    vscode.window.showInformationMessage('Clé DeepSeek supprimée.');
    return false;
  }
  await context.secrets.store(CLE_SECRETE, cle.trim());
  vscode.window.showInformationMessage('🔑 Clé DeepSeek enregistrée.');
  return true;
}

/** Client DeepSeek, ou undefined si aucune clé n'est enregistrée (propose d'en ajouter une si `demander`). */
export async function clientIA(context: vscode.ExtensionContext, demander: boolean): Promise<ClientIA | undefined> {
  let cle = await context.secrets.get(CLE_SECRETE);
  if (!cle && demander) {
    const r = await vscode.window.showInformationMessage(
      "Forge a besoin d'une clé API DeepSeek pour faire relire tes définitions.",
      'Ajouter ma clé',
      'Créer une clé',
    );
    if (r === 'Créer une clé') vscode.env.openExternal(vscode.Uri.parse('https://platform.deepseek.com/api_keys'));
    if (r === 'Ajouter ma clé' && (await configurerCle(context))) cle = await context.secrets.get(CLE_SECRETE);
  }
  if (!cle) return undefined;
  return creerClientDeepSeek(cle, reglages().get<string>('deepseek.url', 'https://api.deepseek.com'), reglages().get<string>('deepseek.modele', 'deepseek-chat'));
}

/**
 * Fait relire par l'IA les définitions pas encore relues (ou toutes si `toutes`).
 * `demander` : proposer d'ajouter une clé si elle manque (faux lors d'une relecture automatique).
 */
export async function lancerRelecture(context: vscode.ExtensionContext, opts: { toutes?: boolean; demander: boolean; journal: vscode.OutputChannel }): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const aRelire = notionsARelire(lireNotionsRevision(coffre), opts.toutes);
  if (aRelire.length === 0) {
    if (opts.demander) vscode.window.showInformationMessage('🤖 Toutes les définitions ont déjà été relues par l\'IA.');
    return;
  }
  const client = await clientIA(context, opts.demander);
  if (!client) {
    // Relecture automatique sans clé : on le signale une seule fois
    if (!opts.demander && !context.globalState.get('forge.astuceCleVue')) {
      context.globalState.update('forge.astuceCleVue', true);
      const r = await vscode.window.showInformationMessage(
        `🤖 Ajoute ta clé DeepSeek pour que Forge relise tes ${aRelire.length} définition(s) et corrige celles qui sont fausses.`,
        'Ajouter ma clé',
      );
      if (r && (await configurerCle(context))) await lancerRelecture(context, { ...opts, demander: true });
    }
    return;
  }

  try {
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '🤖 Relecture des définitions par l\'IA', cancellable: true },
      (progression, annulation) => {
        let precedent = 0;
        return relireDefinitions(coffre, client, {
          accepter: accepterDefinitionsIA(),
          toutes: opts.toutes,
          annule: () => annulation.isCancellationRequested,
          progression: (fait, total) => {
            progression.report({ message: `${fait}/${total} notions`, increment: ((fait - precedent) / Math.max(1, total)) * 100 });
            precedent = fait;
          },
        });
      },
    );
    opts.journal.appendLine(`[relecture IA] ${JSON.stringify(r, null, 2)}`);
    const resume = `🤖 Relecture terminée : ${r.correctes.length} correcte(s), ${r.corrigees.length} corrigée(s), ${r.ecrites.length} écrite(s)${r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : ''}.`;
    const choix = await vscode.window.showInformationMessage(resume, ...(r.rapport ? ['Voir le rapport'] : []));
    if (choix === 'Voir le rapport' && r.rapport) await vscode.window.showTextDocument(vscode.Uri.file(r.rapport));
  } catch (e) {
    const message = e instanceof ErreurIA ? e.message : `Relecture interrompue : ${e instanceof Error ? e.message : e}`;
    const choix = await vscode.window.showErrorMessage(message, 'Configurer la clé DeepSeek');
    if (choix) await configurerCle(context);
  }
}
