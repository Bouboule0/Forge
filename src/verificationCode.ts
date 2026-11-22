// Vérification d'un exercice de code dans VS Code : enregistre les fichiers, compile,
// lance les tests, souligne les erreurs du compilateur dans l'éditeur.

import * as path from 'path';
import * as vscode from 'vscode';
import { lancerTests, type ConfigCompilation, type ResultatTests } from './core/compilation';
import { compilateur } from './config';

let diagnostics: vscode.DiagnosticCollection | undefined;

export function initialiserDiagnostics(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('forge');
  context.subscriptions.push(diagnostics);
}

export function configCompilation(): ConfigCompilation {
  return { compilateur: compilateur(), delaiExecutionMs: 5_000 };
}

/** Enregistre les fichiers modifiés de l'exercice, compile et lance les tests. */
export async function verifierExercice(dossier: string): Promise<ResultatTests> {
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.isDirty && path.dirname(doc.uri.fsPath) === dossier) await doc.save();
  }
  const r = await lancerTests(configCompilation(), dossier);

  // Erreurs et avertissements soulignés dans les fichiers de l'exercice
  if (diagnostics) {
    const aEffacer: vscode.Uri[] = [];
    diagnostics.forEach((uri) => {
      if (path.dirname(uri.fsPath) === dossier) aEffacer.push(uri);
    });
    for (const uri of aEffacer) diagnostics.delete(uri);
    const parFichier = new Map<string, vscode.Diagnostic[]>();
    for (const e of r.erreurs) {
      if (e.gravite === 'note') continue;
      const position = new vscode.Position(Math.max(0, e.ligne - 1), Math.max(0, e.colonne - 1));
      const d = new vscode.Diagnostic(
        new vscode.Range(position, position.translate(0, 1)),
        e.message,
        e.gravite === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      );
      d.source = 'g++ (Forge)';
      const liste = parFichier.get(e.fichier) ?? [];
      liste.push(d);
      parFichier.set(e.fichier, liste);
    }
    for (const [fichier, liste] of parFichier) diagnostics.set(vscode.Uri.file(path.join(dossier, fichier)), liste);
  }
  return r;
}

/** Résumé lisible d'un résultat de tests. */
export function resumeTests(r: ResultatTests): string {
  if (!r.compile) return '❌ Le code ne compile pas.';
  if (r.delaiDepasse) return '⏱️ Le programme ne se termine pas (boucle infinie ?).';
  if (r.plante) return `💥 Le programme a planté après ${r.reussis} test(s) réussi(s).`;
  return r.reussis === r.total ? `✅ ${r.reussis}/${r.total} tests réussis !` : `❌ ${r.reussis}/${r.total} tests réussis.`;
}
