// Indicateur dans la barre d'état : « 🌱 7 à revoir ».

import * as vscode from 'vscode';
import { compterNotionsARevoir, lireDate, lireNotions } from './core/coffre';
import { aujourdhui } from './core/texte';
import { coffreActuel } from './config';

const STADES = ['🌰', '🌱', '🌿', '🪴', '🌳', '🌸', '🍎'];

export class BarreEtat implements vscode.Disposable {
  private readonly element = vscode.window.createStatusBarItem('forge.aRevoir', vscode.StatusBarAlignment.Left, 50);
  private surveillant?: vscode.FileSystemWatcher;
  private coffreSurveille?: string;
  private minuterie?: NodeJS.Timeout;

  constructor() {
    this.element.name = 'Forge — notions à revoir';
    this.actualiser();
    this.element.show();
  }

  actualiser(): void {
    const coffre = coffreActuel();
    this.surveiller(coffre);
    if (!coffre) {
      this.element.text = '🌱 Forge';
      this.element.tooltip = 'Forge : clique pour créer ou choisir ton coffre';
      this.element.command = 'forge.choisirCoffre';
      return;
    }
    const { aRevoir, total } = compterNotionsARevoir(coffre);
    if (total === 0) {
      this.element.text = '🌰 Forge';
      this.element.tooltip = 'Forge : aucune notion pour le moment. Clique pour importer tes CER.';
      this.element.command = 'forge.importer';
      return;
    }
    this.element.text = aRevoir > 0 ? `🌱 ${aRevoir} à revoir` : '🌳 À jour';
    this.element.tooltip = `Forge : ${aRevoir} notion(s) à revoir sur ${total} — clique pour réviser`;
    this.element.command = 'forge.reviser';
  }

  /** Actualise après une rafale de modifications (import de 50 notes = 1 seule actualisation). */
  private planifier(): void {
    if (this.minuterie) clearTimeout(this.minuterie);
    this.minuterie = setTimeout(() => this.actualiser(), 500);
  }

  private surveiller(coffre: string | undefined): void {
    if (coffre === this.coffreSurveille) return;
    this.surveillant?.dispose();
    this.coffreSurveille = coffre;
    if (!coffre) return;
    this.surveillant = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(coffre), 'Notions/*.md'));
    this.surveillant.onDidChange(() => this.planifier());
    this.surveillant.onDidCreate(() => this.planifier());
    this.surveillant.onDidDelete(() => this.planifier());
  }

  dispose(): void {
    this.surveillant?.dispose();
    this.element.dispose();
    if (this.minuterie) clearTimeout(this.minuterie);
  }
}

/** Liste des notions à revoir (en attendant les séances de révision de la phase 2). */
export async function afficherNotionsARevoir(): Promise<void> {
  const coffre = coffreActuel();
  if (!coffre) return;
  const date = aujourdhui();
  const notions = lireNotions(coffre)
    .map((n) => ({ n, prochaine: lireDate(n.donnees.prochaine_revision), niveau: Number(n.donnees.niveau) || 0 }))
    .filter((x) => x.prochaine === null || x.prochaine <= date)
    .sort((a, b) => a.niveau - b.niveau || a.n.nom.localeCompare(b.n.nom, 'fr'));

  const choix = await vscode.window.showQuickPick(
    notions.map((x) => ({
      label: `${STADES[Math.min(6, Math.max(0, x.niveau))]} ${x.n.nom}`,
      description: x.n.donnees.statut === 'a_verifier' ? 'définition à vérifier' : undefined,
      detail: Array.isArray(x.n.donnees.prosits) ? x.n.donnees.prosits.map(String).join(' · ').replace(/\[\[|\]\]/g, '') : undefined,
      chemin: x.n.chemin,
    })),
    {
      title: `Forge — ${notions.length} notion(s) à revoir`,
      placeHolder: 'Les séances de révision arrivent bientôt ! En attendant, ouvre une notion pour la relire.',
      matchOnDetail: true,
    },
  );
  if (choix) await vscode.window.showTextDocument(vscode.Uri.file(choix.chemin));
}
