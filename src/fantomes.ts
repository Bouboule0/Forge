// Révisions fantômes dans l'éditeur : une question en gris en fin de ligne (comme une suggestion de Copilot),
// déclenchée par un mot du code (« virtual » → Polymorphisme…) ou par une pause.
// Tab : mini-question en haut de VS Code. Échap : ignorer. Le texte n'est JAMAIS écrit dans le fichier :
// c'est une simple décoration, qui disparaît dès que l'on tape ou que l'on déplace le curseur.

import * as vscode from 'vscode';
import { corriger, type Exercice, type Reponse } from './core/exercices';
import { choisirNotion, enregistrerReponseRapide, motAvantCurseur, MOTS_DU_CODE, notionsPourMot, questionRapide, texteFantome } from './core/fantomes';
import { lireNotionsRevision, type NotionRevision } from './core/notionsRevision';
import { stade } from './core/repetition';
import { coffreActuel, reglages } from './config';

const CLE_CONTEXTE = 'forge.fantomeVisible';
/** Après un mot-clé, on attend cette pause avant d'afficher (pour ne pas clignoter pendant la frappe). */
const ATTENTE_MOT_MS = 1500;
/** Pause sans taper qui peut faire apparaître une révision au hasard. */
const PAUSE_MS = 25_000;

interface Fantome {
  editeur: vscode.TextEditor;
  ligne: number;
  notion: NotionRevision;
  notions: NotionRevision[];
  exercice: Exercice;
}

export class RevisionsFantomes implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor('editorGhostText.foreground'), fontStyle: 'italic', margin: '0 0 0 3em' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private courant?: Fantome;
  private derniereApparition = 0;
  private ignoreesDeSuite = 0;
  private derniereFrappe = 0;
  private minuterieMot?: NodeJS.Timeout;
  private minuteriePause?: NodeJS.Timeout;
  private cache?: { quand: number; coffre: string; notions: NotionRevision[] };
  private readonly abonnements: vscode.Disposable[] = [];

  constructor(private readonly surReponse: () => void) {
    this.abonnements.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.surModification(e)),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        // Déplacer le curseur hors de la ligne (ou sélectionner) fait disparaître la question
        if (this.courant && (e.textEditor !== this.courant.editeur || e.selections[0].active.line !== this.courant.ligne || !e.selections[0].isEmpty)) this.effacer();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.effacer()),
      vscode.window.onDidChangeWindowState((s) => !s.focused && this.effacer()),
    );
  }

  private actif(): boolean {
    return reglages().get<boolean>('fantomes.actif', true);
  }

  private langageAccepte(document: vscode.TextDocument): boolean {
    const langages = reglages().get<string[]>('fantomes.langages', ['cpp', 'c']);
    return langages.includes('*') || langages.includes(document.languageId);
  }

  /** Intervalle minimum entre deux questions ; il double après plusieurs questions ignorées d'affilée. */
  private intervalleMs(): number {
    const minutes = Math.max(1, reglages().get<number>('fantomes.intervalleMinutes', 10));
    const ralenti = this.ignoreesDeSuite >= 2 ? 2 ** Math.min(3, this.ignoreesDeSuite - 1) : 1;
    return minutes * 60_000 * ralenti;
  }

  private notions(): { coffre: string; notions: NotionRevision[] } | undefined {
    const coffre = coffreActuel();
    if (!coffre) return undefined;
    if (!this.cache || this.cache.coffre !== coffre || Date.now() - this.cache.quand > 60_000) {
      this.cache = { quand: Date.now(), coffre, notions: lireNotionsRevision(coffre) };
    }
    return this.cache;
  }

  private surModification(e: vscode.TextDocumentChangeEvent): void {
    const editeur = vscode.window.activeTextEditor;
    if (!editeur || e.document !== editeur.document || e.contentChanges.length === 0) return;
    this.effacer();
    this.derniereFrappe = Date.now();
    clearTimeout(this.minuterieMot);
    clearTimeout(this.minuteriePause);
    if (!this.actif() || !this.langageAccepte(e.document)) return;

    // Un mot-clé vient d'être tapé (suivi d'un espace, d'une parenthèse…) : question sur une notion liée
    const tape = e.contentChanges[e.contentChanges.length - 1].text;
    if (/^[\s(<{;:]$/.test(tape)) {
      const position = editeur.selection.active;
      const mot = motAvantCurseur(e.document.lineAt(position.line).text.slice(0, position.character));
      if (mot && MOTS_DU_CODE[mot]) {
        const frappe = this.derniereFrappe;
        this.minuterieMot = setTimeout(() => {
          if (this.derniereFrappe === frappe) this.proposer(editeur, mot);
        }, ATTENTE_MOT_MS);
      }
    }
    // Une pause un peu longue : question au hasard, sur une notion fragile de préférence
    const frappe = this.derniereFrappe;
    this.minuteriePause = setTimeout(() => {
      if (this.derniereFrappe === frappe && vscode.window.activeTextEditor === editeur) this.proposer(editeur);
    }, PAUSE_MS);
  }

  /** Affiche une révision fantôme si c'est le bon moment. `forcer` : commande « une révision maintenant ». */
  proposer(editeur: vscode.TextEditor, declencheur?: string, forcer = false): boolean {
    if (!forcer && (!this.actif() || !vscode.window.state.focused || Date.now() - this.derniereApparition < this.intervalleMs())) return false;
    if (!editeur.selection.isEmpty || this.courant) return false;
    const donnees = this.notions();
    if (!donnees || donnees.notions.length === 0) return false;
    const candidates = declencheur ? notionsPourMot(declencheur, donnees.notions) : donnees.notions;
    const notion = choisirNotion(candidates);
    if (!notion) return false;
    const exercice = questionRapide(notion, donnees.notions);
    if (!exercice) return false;

    const ligne = editeur.selection.active.line;
    const fin = editeur.document.lineAt(ligne).range.end;
    editeur.setDecorations(this.decoration, [{ range: new vscode.Range(fin, fin), renderOptions: { after: { contentText: texteFantome(notion, exercice, declencheur) } } }]);
    this.courant = { editeur, ligne, notion, notions: donnees.notions, exercice };
    this.derniereApparition = Date.now();
    void vscode.commands.executeCommand('setContext', CLE_CONTEXTE, true);
    return true;
  }

  effacer(): void {
    if (!this.courant) return;
    this.courant.editeur.setDecorations(this.decoration, []);
    this.courant = undefined;
    void vscode.commands.executeCommand('setContext', CLE_CONTEXTE, false);
  }

  ignorer(): void {
    if (!this.courant) return;
    this.effacer();
    this.ignoreesDeSuite++;
  }

  /** Tab : la mini-question (quelques secondes), puis retour au code. */
  async repondre(): Promise<void> {
    const f = this.courant;
    if (!f) return;
    this.effacer();
    this.ignoreesDeSuite = 0;
    const reponse = await this.poserQuestion(f.notion, f.exercice);
    if (!reponse) return; // fermée sans répondre : rien n'est compté
    const coffre = this.notions()?.coffre;
    if (!coffre) return;
    const correction = corriger(f.exercice, reponse);
    if (!correction.resultat) return;
    const { changement } = enregistrerReponseRapide(coffre, f.notion, f.exercice, correction.resultat);
    const plante = changement && changement.apres !== changement.avant ? ` ${stade(changement.avant).emoji} → ${stade(changement.apres).emoji}` : '';
    if (correction.resultat === 'reussite') {
      vscode.window.setStatusBarMessage(`✅ ${f.notion.titre} : bien joué !${plante}`, 5000);
    } else {
      const choix = await vscode.window.showInformationMessage(`❌ ${f.notion.titre} — réponse : « ${correction.bonneReponse ?? '?'} »`, 'Ouvrir la note');
      if (choix) await vscode.window.showTextDocument(vscode.Uri.file(f.notion.chemin), { viewColumn: vscode.ViewColumn.Beside, preview: true });
    }
    this.surReponse();
  }

  private async poserQuestion(n: NotionRevision, e: Exercice): Promise<Reponse | undefined> {
    const titre = `🌱 ${n.titre}`;
    if (e.type === 'trou') {
      const valeur = await vscode.window.showInputBox({
        title: `${titre} — complète la phrase`,
        prompt: `${e.enonce}${e.indice ? `   💡 ${e.indice}` : ''}`,
        placeHolder: 'Le mot manquant (Entrée vide = je ne sais pas)',
        ignoreFocusOut: false,
      });
      if (valeur === undefined) return undefined;
      return valeur.trim() ? { type: 'texte', valeur } : { type: 'jeNeSaisPas' };
    }
    const options = e.options ?? [];
    if (e.type === 'qcm_notion') {
      // Le nom de la notion est la réponse : il n'apparaît pas dans le titre
      const choix = await vscode.window.showInformationMessage(
        '🌱 Révision : de quelle notion parle cette définition ?',
        { modal: true, detail: e.enonce },
        ...options,
      );
      return choix === undefined ? undefined : { type: 'option', index: options.indexOf(choix) };
    }
    // QCM « quelle définition ? » : les propositions sont longues, on les numérote dans le texte
    const numeros = options.map((_, i) => String(i + 1));
    const choix = await vscode.window.showInformationMessage(
      `${titre} : quelle est la bonne définition ?`,
      { modal: true, detail: options.map((o, i) => `${i + 1}. ${o}`).join('\n\n') },
      ...numeros,
    );
    return choix === undefined ? undefined : { type: 'option', index: numeros.indexOf(choix) };
  }

  dispose(): void {
    this.effacer();
    clearTimeout(this.minuterieMot);
    clearTimeout(this.minuteriePause);
    this.decoration.dispose();
    this.abonnements.forEach((d) => d.dispose());
  }
}
