// Indicateur dans la barre d'état : « 🌱 7 à revoir ».

import * as vscode from 'vscode';
import { lireDate, lireNotions } from './core/coffre';
import { compterARevoir, joursAvant } from './core/examens';
import { aujourdhui } from './core/texte';
import { coffreActuel } from './config';

const STADES = ['🌰', '🌱', '🌿', '🪴', '🌳', '🌸', '🍎'];

export class BarreEtat implements vscode.Disposable {
  private readonly element = vscode.window.createStatusBarItem('forge.aRevoir', vscode.StatusBarAlignment.Left, 50);
  private readonly ferme = vscode.window.createStatusBarItem('forge.ferme', vscode.StatusBarAlignment.Left, 49);
  private surveillant?: vscode.FileSystemWatcher;
  private coffreSurveille?: string;
  private minuterie?: NodeJS.Timeout;

  constructor() {
    this.element.name = 'Forge — notions à revoir';
    this.ferme.name = 'Forge — ma ferme';
    this.ferme.text = '🌻';
    this.ferme.tooltip = 'Forge : ouvrir ma ferme';
    this.ferme.command = 'forge.ferme';
    this.actualiser();
    this.element.show();
  }

  actualiser(): void {
    const coffre = coffreActuel();
    this.surveiller(coffre);
    if (coffre) this.ferme.show();
    else this.ferme.hide();
    if (!coffre) {
      this.element.text = '🌱 Forge';
      this.element.tooltip = 'Forge : clique pour créer ou choisir ton coffre';
      this.element.command = 'forge.choisirCoffre';
      return;
    }
    const { aRevoir, total, examen } = compterARevoir(coffre);
    if (total === 0) {
      this.element.text = '🌰 Forge';
      this.element.tooltip = 'Forge : aucune notion pour le moment. Clique pour importer tes CER.';
      this.element.command = 'forge.importer';
      return;
    }
    const jours = examen ? joursAvant(examen) : undefined;
    const compteur = jours === undefined ? '' : jours === 0 ? ` · 📅 ${examen!.titre} aujourd'hui` : ` · 📅 J-${jours}`;
    this.element.text = (aRevoir > 0 ? `🌱 ${aRevoir} à revoir` : '🌳 À jour') + compteur;
    this.element.tooltip =
      `Forge : ${aRevoir} notion(s) à revoir sur ${total} — clique pour réviser` +
      (examen ? `\n📅 ${examen.titre} le ${examen.date} : les notions au programme reviennent plus souvent` : '');
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
    this.ferme.dispose();
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
