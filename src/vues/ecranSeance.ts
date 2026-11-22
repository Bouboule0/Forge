// Écran de séance de révision (webview). La logique est dans core/seance.ts ;
// ce fichier ne fait qu'afficher les exercices et transmettre les réponses.

import * as vscode from 'vscode';
import { marked } from 'marked';
import { LIBELLES, type Exercice, type Reponse } from '../core/exercices';
import type { NotionRevision } from '../core/notionsRevision';
import { texteBrut } from '../core/exercices';
import { stade } from '../core/repetition';
import { Seance, type OptionsSeance, type ResultatReponse } from '../core/seance';
import { cheminSolution, FICHIER_EXERCICE } from '../core/exercicesCode';
import { resumeTests, verifierExercice } from '../verificationCode';
import * as path from 'path';

const sansLiens = (md: string) => md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/!?\[\[([^\]]+)\]\]/g, '$1');
const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const enLigne = (md: string) => marked.parseInline(sansLiens(md), { async: false }) as string;
const enBloc = (md: string) => marked.parse(sansLiens(md), { async: false }) as string;
/** Texte brut (pas de Markdown) → HTML, en gardant le gras **…** des solutions. */
const texteHtml = (t: string) => echapper(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

/** Markdown → texte simple (pour la problématique d'un Prosit). */
const texteSimple = (md: string) => texteBrut(md).replace(/\s*\n\s*/g, ' ');

function formaterDate(date: string): string {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function definitionsHtml(n: NotionRevision): string {
  const morceaux = n.definitions.map((d) => (d.prosit ? `<p class="source">D'après ${echapper(d.prosit)}</p>` : '') + enBloc(d.texte));
  if (n.notesPerso) morceaux.push(`<p class="source">Mes notes</p>${enBloc(n.notesPerso)}`);
  return morceaux.join('') || '<p><em>Pas encore de définition dans la note.</em></p>';
}

export class EcranSeance {
  private static actuel?: EcranSeance;
  private readonly panneau: vscode.WebviewPanel;
  private seance: Seance;
  private dernier?: ResultatReponse;
  private dernierExercice?: Exercice;
  private occupe = false;
  private readonly abonnements: vscode.Disposable[] = [];

  /** Commande « Vérifier l'exercice » : si c'est l'exercice de la séance, c'est la séance qui vérifie. */
  static verifierSiEnCours(dossier: string): boolean {
    const a = EcranSeance.actuel;
    if (!a || a.seance.enCours?.exercice.code?.dossier !== dossier) return false;
    a.panneau.reveal(undefined, true);
    void a.verifierCode();
    return true;
  }

  static ouvrir(coffre: string, options: OptionsSeance, surFin: () => void): void {
    if (EcranSeance.actuel) {
      EcranSeance.actuel.panneau.reveal();
      EcranSeance.actuel.recommencer(options);
      return;
    }
    EcranSeance.actuel = new EcranSeance(coffre, options, surFin);
  }

  private constructor(private readonly coffre: string, options: OptionsSeance, private readonly surFin: () => void) {
    this.seance = new Seance(coffre, options);
    this.panneau = vscode.window.createWebviewPanel('forge.seance', '🌱 Révision', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panneau.webview.html = html(this.panneau.webview);
    this.panneau.webview.onDidReceiveMessage((m) => this.recevoir(m), null, this.abonnements);
    this.panneau.onDidDispose(() => this.fermer(), null, this.abonnements);
  }

  private recommencer(options: OptionsSeance): void {
    this.seance = new Seance(this.coffre, options);
    void this.envoyerSuivant();
  }

  private envoyer(message: unknown): void {
    this.panneau.webview.postMessage(message);
  }

  private progression() {
    const b = this.seance.bilan;
    return { faits: b.faits, reussis: b.reussis, restants: this.seance.restants(), entrainement: this.seance.enEntrainement, ia: !!this.seance.options.ia };
  }

  private async envoyerSuivant(): Promise<void> {
    // La préparation d'un exercice de code peut prendre du temps (l'IA écrit, Forge compile)
    const attente = setTimeout(() => this.envoyer({ type: 'chargement', message: "🤖 Préparation d'un exercice de code : l'IA l'écrit, puis Forge le compile pour le vérifier (jusqu'à une minute)" }), 400);
    const suivant = await this.seance.suivant();
    clearTimeout(attente);
    if (!suivant) {
      this.envoyerFin();
      return;
    }
    const { notion, piste, exercice: e } = suivant;
    const s = notion ? stade(notion.etat.niveau) : undefined;
    const enonceMarkdown = e.type === 'flashcard' || e.type === 'verification' || e.type === 'explication';
    this.envoyer({
      type: 'exercice',
      progression: this.progression(),
      exercice: {
        type: e.type,
        libelle: LIBELLES[e.type],
        sousTitre: s ? `${s.emoji} ${s.nom}` : `🧩 ${piste?.prosit ?? ''}`,
        consigne: enLigne(e.consigne),
        enonce: enonceMarkdown ? enLigne(e.enonce) : texteHtml(e.enonce),
        options: e.options?.map(texteHtml),
        indice: e.indice,
        // La vérification montre directement la définition à relire
        definitions: e.type === 'verification' && notion ? definitionsHtml(notion) : undefined,
        problematique: piste?.problematique ? texteHtml(texteSimple(piste.problematique)) : undefined,
        code: e.code
          ? {
              genre: e.code.genre,
              enonce: enBloc(e.code.enonce),
              programme: e.code.programme ? echapper(e.code.programme) : undefined,
              indices: e.code.indices.map(enLigne),
              tentatives: e.code.tentatives,
            }
          : undefined,
      },
    });
    // Exercice à écrire dans l'éditeur : on l'ouvre directement à côté
    if (e.code && e.code.genre !== 'sortie') await this.ouvrirExercice();
  }

  private async ouvrirExercice(): Promise<void> {
    const code = this.seance.enCours?.exercice.code;
    if (!code) return;
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(code.dossier, FICHIER_EXERCICE)), { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  private async voirSolution(): Promise<void> {
    const code = this.dernierExercice?.code ?? this.seance.enCours?.exercice.code;
    if (!code) return;
    await vscode.window.showTextDocument(vscode.Uri.file(cheminSolution(code)), { viewColumn: vscode.ViewColumn.Beside, preview: true });
  }

  /** Compile et teste l'exercice en cours ; s'il est réussi, la réponse est enregistrée. */
  async verifierCode(): Promise<void> {
    const courant = this.seance.enCours;
    const code = courant?.exercice.code;
    if (!courant || !code || this.occupe) return;
    this.occupe = true;
    try {
      this.envoyer({ type: 'verificationEnCours' });
      const r = await verifierExercice(code.dossier);
      this.envoyer({
        type: 'resultatTests',
        resultat: {
          resume: resumeTests(r),
          compile: r.compile,
          sortieCompilation: r.compile ? '' : echapper(r.sortieCompilation.slice(0, 4000)),
          tests: r.tests.map((t) => ({ nom: echapper(t.nom), ok: t.ok, detail: echapper(t.detail) })),
          sortie: echapper(r.sortie.slice(0, 2000)),
          reussi: r.compile && !r.plante && !r.delaiDepasse && r.total > 0 && r.reussis === r.total,
        },
      });
      if (r.compile && !r.plante && !r.delaiDepasse && r.total > 0 && r.reussis === r.total) {
        this.dernierExercice = courant.exercice;
        const reponse = await this.seance.repondre({ type: 'code', reussi: true });
        this.dernier = reponse;
        this.envoyerCorrection(reponse);
        this.surFin();
      }
    } finally {
      this.occupe = false;
    }
  }

  private envoyerCorrection(r: ResultatReponse): void {
    const exercice = this.dernierExercice;
    const ch = r.changement;
    const ia = r.correction.ia;
    this.envoyer({
      type: 'correction',
      progression: this.progression(),
      correction: {
        resultat: r.correction.resultat,
        erreur: r.correction.erreur,
        compte: r.compte,
        estPiste: !!r.piste,
        verifiee: !!r.correction.verifiee,
        bonneReponse: r.correction.bonneReponse ? texteHtml(r.correction.bonneReponse) : undefined,
        solution: exercice?.solution ? texteHtml(exercice.solution) : undefined,
        bonneOption: exercice?.bonneOption,
        definitions: r.notion ? definitionsHtml(r.notion) : undefined,
        // Pour une piste déjà validée, on rappelle la justification du CER
        justificationCer: exercice?.type === 'piste_vf' && r.piste?.justification ? enLigne(r.piste.justification) : undefined,
        estCode: !!exercice?.code,
        tentatives: exercice?.code?.tentatives,
        // Prédis la sortie : vraie sortie + explication
        sortieAttendue: exercice?.code?.genre === 'sortie' ? echapper(exercice.code.sortieAttendue ?? '') : undefined,
        explication: exercice?.code?.genre === 'sortie' && exercice.code.explication ? enBloc(exercice.code.explication) : undefined,
        ia: ia
          ? {
              note: ia.note,
              pointsForts: ia.pointsForts?.map(enLigne),
              aRevoir: ia.aRevoir?.map(enLigne),
              modele: ia.modele ? enBloc(ia.modele) : undefined,
              retour: ia.retour ? enLigne(ia.retour) : undefined,
              justification: ia.justification ? enLigne(ia.justification) : undefined,
            }
          : undefined,
        peutRectifier: exercice?.type === 'trou' && r.correction.resultat === 'echec',
        changement: ch
          ? {
              avant: `${stade(ch.avant).emoji} ${stade(ch.avant).nom}`,
              apres: `${stade(ch.apres).emoji} ${stade(ch.apres).nom}`,
              sens: Math.sign(ch.apres - ch.avant),
              prochaine: formaterDate(ch.prochaine),
              bloque: ch.bloque,
            }
          : undefined,
      },
    });
  }

  private envoyerFin(): void {
    const bilan = this.seance.terminer();
    this.envoyer({
      type: 'fin',
      entrainement: this.seance.enEntrainement,
      bilan: {
        ...bilan,
        montees: bilan.montees.map((m) => ({ titre: m.titre, avant: stade(m.avant).emoji, apres: stade(m.apres).emoji })),
        descentes: bilan.descentes.map((m) => ({ titre: m.titre, avant: stade(m.avant).emoji, apres: stade(m.apres).emoji })),
      },
    });
    this.surFin();
  }

  /** Note à ouvrir : la notion, ou la note Prosit pour une piste. */
  private cheminCourant(): string | undefined {
    const source = this.dernier ?? this.seance.enCours;
    return source?.notion?.chemin ?? source?.piste?.chemin;
  }

  private async recevoir(m: { type: string; reponse?: Reponse }): Promise<void> {
    switch (m.type) {
      case 'pret':
        await this.envoyerSuivant();
        break;
      case 'ouvrirExercice':
        await this.ouvrirExercice();
        break;
      case 'verifierCode':
        await this.verifierCode();
        break;
      case 'voirSolution':
        await this.voirSolution();
        break;
      case 'reponse': {
        if (!m.reponse || this.occupe) return;
        const courant = this.seance.enCours;
        if (!courant) return;
        this.occupe = true;
        try {
          this.dernierExercice = courant.exercice;
          this.dernier = undefined;
          const verifCorriger = m.reponse.type === 'verification' && m.reponse.choix === 'corriger';
          const r = await this.seance.repondre(m.reponse);
          this.dernier = r;
          if (m.reponse.type === 'code' && !m.reponse.reussi) await this.voirSolution();
          if (verifCorriger && r.notion) {
            await vscode.window.showTextDocument(vscode.Uri.file(r.notion.chemin), { viewColumn: vscode.ViewColumn.Beside, preview: false });
          }
          if (r.correction.resultat === null && !r.correction.erreur) await this.envoyerSuivant();
          else this.envoyerCorrection(r);
          this.surFin();
        } finally {
          this.occupe = false;
        }
        break;
      }
      case 'reveler':
        // Flashcard : on montre la définition avant l'auto-évaluation
        if (this.seance.enCours?.notion) this.envoyer({ type: 'revelation', definitions: definitionsHtml(this.seance.enCours.notion) });
        break;
      case 'rectifier':
        if (this.dernier) {
          this.dernier = this.seance.rectifier(this.dernier);
          this.envoyerCorrection(this.dernier);
          this.surFin();
        }
        break;
      case 'suivant':
        this.dernier = undefined;
        await this.envoyerSuivant();
        break;
      case 'ouvrirNote': {
        const chemin = this.cheminCourant();
        if (chemin) await vscode.window.showTextDocument(vscode.Uri.file(chemin), { viewColumn: vscode.ViewColumn.Beside, preview: false });
        break;
      }
      case 'stop':
        this.envoyerFin();
        break;
      case 'continuer':
        this.recommencer({ ...this.seance.options, entrainement: true });
        break;
      case 'fermer':
        this.panneau.dispose();
        break;
    }
  }

  private fermer(): void {
    EcranSeance.actuel = undefined;
    this.abonnements.forEach((d) => d.dispose());
    this.surFin();
  }
}

function nonce(): string {
  return Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
}

export function html(webview: Pick<vscode.Webview, 'cspSource'>): string {
  const n = nonce();
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --vert: #4caf50; --rouge: #e57373; --orange: #ffb74d; }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 15px; line-height: 1.5; margin: 0; }
  .page { max-width: 760px; margin: 0 auto; padding: 18px 24px 40px; }
  header { display: flex; gap: 16px; align-items: center; color: var(--vscode-descriptionForeground); font-size: 13px; margin-bottom: 18px; }
  header .espace { flex: 1; }
  .pastille { padding: 2px 10px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .carte { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 22px 24px; background: var(--vscode-editorWidget-background); }
  .type { text-transform: uppercase; letter-spacing: .06em; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .notion { font-size: 13px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .consigne { font-size: 1.25em; margin: 14px 0 10px; }
  .enonce { font-size: 1.05em; margin: 10px 0 16px; }
  .definition { border-left: 3px solid var(--vscode-textLink-foreground); padding: 4px 14px; margin: 12px 0; background: var(--vscode-textBlockQuote-background); }
  .definition .source { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 8px 0 2px; }
  .definition pre { overflow-x: auto; padding: 8px; background: var(--vscode-textCodeBlock-background); }
  input[type=text], textarea {
    width: 100%; box-sizing: border-box; font: inherit; padding: 8px 10px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  textarea { min-height: 90px; resize: vertical; }
  .options { display: grid; gap: 8px; margin: 8px 0; }
  .option { text-align: left; padding: 10px 14px; border-radius: 6px; cursor: pointer; font: inherit;
            background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 2px solid transparent; }
  .option:hover { border-color: var(--vscode-focusBorder); }
  .option .touche { opacity: .6; margin-right: 8px; font-family: var(--vscode-editor-font-family); }
  .option.bonne { border-color: var(--vert); }
  .option.mauvaise { border-color: var(--rouge); }
  .option:disabled { cursor: default; }
  .actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; align-items: center; }
  button.principal, button.secondaire { padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer; font: inherit; }
  button.principal { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondaire { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.lien { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; font: inherit; }
  .indice { color: var(--vscode-descriptionForeground); font-style: italic; margin-top: 8px; }
  .verdict { font-size: 1.3em; font-weight: 600; margin: 4px 0 8px; }
  .verdict.reussite { color: var(--vert); }
  .verdict.echec { color: var(--rouge); }
  .verdict.moyen { color: var(--orange); }
  .croissance { margin: 12px 0; padding: 10px 14px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); }
  .bloque { color: var(--vscode-descriptionForeground); font-size: 13px; margin-top: 4px; }
  .cache { display: none !important; }
  .fin h1 { margin-top: 0; }
  .chiffres { display: flex; gap: 14px; margin: 14px 0; flex-wrap: wrap; }
  .chiffre { flex: 1; min-width: 120px; padding: 12px; border-radius: 8px; background: var(--vscode-textBlockQuote-background); text-align: center; }
  .chiffre b { display: block; font-size: 1.8em; }
  ul.plantes { list-style: none; padding: 0; columns: 2; }
  kbd { font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 0 4px; border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .aide { color: var(--vscode-descriptionForeground); font-size: 12px; margin-top: 18px; }
  .piste { font-size: 1.1em; font-style: italic; border-left: 3px solid var(--orange); padding: 6px 14px; margin: 12px 0; background: var(--vscode-textBlockQuote-background); }
  .problematique { font-size: 13px; color: var(--vscode-descriptionForeground); }
  .statuts { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  .statut { padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit; border: 2px solid transparent;
            background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .statut.choisi { border-color: var(--vscode-focusBorder); }
  .attente { margin-top: 14px; color: var(--vscode-descriptionForeground); }
  .attente::after { content: ''; display: inline-block; width: 1em; animation: points 1.2s steps(4) infinite; overflow: hidden; vertical-align: bottom; }
  @keyframes points { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
  .retour-ia { margin: 10px 0; padding: 10px 14px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); }
  .retour-ia ul { margin: 4px 0 8px; padding-left: 20px; }
  .cer { margin: 10px 0; padding: 10px 14px; border-radius: 6px; border: 1px dashed var(--vscode-panel-border); }
  button:disabled { opacity: .5; cursor: default; }
  pre.code, textarea.mono { font-family: var(--vscode-editor-font-family); font-size: 13px; }
  pre.code { padding: 10px 12px; overflow-x: auto; background: var(--vscode-textCodeBlock-background); border-radius: 6px; }
  .enonce-code { margin: 8px 0 12px; }
  .enonce-code pre { overflow-x: auto; padding: 8px; background: var(--vscode-textCodeBlock-background); }
  ul.tests { list-style: none; padding: 0; margin: 6px 0; }
  ul.tests li { padding: 2px 0; }
  ul.tests .detail { color: var(--vscode-descriptionForeground); font-size: 12px; margin-left: 24px; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .deux h4 { margin: 6px 0; }
</style>
</head>
<body>
<div class="page">
  <header>
    <span id="mode" class="pastille">🌱 Révision</span>
    <span id="compteurs"></span>
    <span class="espace"></span>
    <button class="lien" id="stop">⏹ Terminer la séance</button>
  </header>

  <div id="zone" class="carte"><p>Chargement…</p></div>
  <p class="aide"><kbd>Entrée</kbd> valider / suivant · <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> envoyer un texte · <kbd>1</kbd>–<kbd>4</kbd> choisir une réponse · <kbd>Échap</kbd> je ne sais pas</p>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
const zone = document.getElementById('zone');
let etat = 'attente';   // exercice | revelation | correction | fin
let exercice = null;
let choisi = null;
let statutChoisi = null;
const STATUTS = [['validee', '✅ Validée'], ['partielle', '⚠️ En partie'], ['invalidee', '❌ Invalidée']];

const envoyer = (m) => vscode.postMessage(m);
const repondre = (reponse) => { if (etat === 'exercice' || etat === 'revelation') { etat = 'envoi'; envoyer({ type: 'reponse', reponse }); } };

function compteurs(p) {
  document.getElementById('mode').textContent = p.entrainement ? '🏋️ Entraînement' : '🌱 Révision';
  document.getElementById('compteurs').textContent =
    p.faits + ' exercice(s) · ' + p.reussis + ' réussi(s)' + (p.entrainement ? '' : ' · ' + p.restants + ' notion(s) en attente');
}

function afficherExercice(e) {
  exercice = e;
  choisi = null;
  etat = 'exercice';
  statutChoisi = null;
  let corps = '<div class="type">' + e.libelle + '</div><div class="notion">' + e.sousTitre + '</div>' +
              '<div class="consigne">' + e.consigne + '</div>';
  if (e.problematique) corps += '<div class="problematique">Problématique : ' + e.problematique + '</div>';
  if (e.type === 'trou') {
    corps += '<div class="enonce">' + e.enonce + '</div>' +
      '<input type="text" id="saisie" placeholder="Le mot manquant…" autocomplete="off">' +
      '<div id="indice" class="indice cache">💡 ' + (e.indice || '') + '</div>' +
      '<div class="actions"><button class="principal" id="valider">Valider</button>' +
      '<button class="secondaire" id="voirIndice">💡 Indice</button>' +
      '<button class="lien" id="nsp">Je ne sais pas</button></div>';
  } else if (e.options) {
    corps += (e.enonce ? '<div class="enonce definition">' + e.enonce + '</div>' : '') + '<div class="options">' +
      e.options.map((o, i) => '<button class="option" data-i="' + i + '"><span class="touche">' + (i + 1) + '</span>' + o + '</button>').join('') +
      '</div><div class="actions"><button class="lien" id="nsp">Je ne sais pas</button></div>';
  } else if (e.type === 'flashcard') {
    corps += '<div class="enonce">' + e.enonce + '</div>' +
      '<textarea id="saisie" placeholder="(facultatif) Écris ton explication…"></textarea>' +
      '<div id="revelation"></div>' +
      '<div class="actions" id="actionsFlash"><button class="principal" id="reveler">Voir la définition</button></div>';
  } else if (e.type === 'explication') {
    corps += '<div class="enonce">' + e.enonce + '</div>' +
      '<textarea id="saisie" placeholder="Ton explication…"></textarea>' +
      '<div class="actions"><button class="principal" id="envoyerIA">🤖 Envoyer à l\\'IA</button>' +
      '<button class="lien" id="nsp">Je ne sais pas</button></div>';
  } else if (e.type === 'piste_valider') {
    corps += '<div class="piste">« ' + e.enonce + ' »</div>' +
      '<div class="statuts">' + STATUTS.map((x) => '<button class="statut" data-statut="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<textarea id="saisie" placeholder="Ta justification (pourquoi ?)…"></textarea>' +
      '<div class="actions"><button class="principal" id="envoyerIA" disabled>🤖 Envoyer à l\\'IA</button>' +
      '<button class="lien" id="nsp">Je ne sais pas</button></div>';
  } else if (e.type === 'piste_vf') {
    corps += '<div class="piste">« ' + e.enonce + ' »</div>' +
      '<div class="statuts">' + STATUTS.map((x, i) => '<button class="statut" data-statut="' + x[0] + '"><span class="touche">' + (i + 1) + '</span> ' + x[1] + '</button>').join('') + '</div>';
  } else if (e.code && e.code.genre === 'sortie') {
    corps += '<pre class="code">' + e.code.programme + '</pre>' +
      '<textarea id="saisie" class="mono" spellcheck="false" placeholder="Ce que le programme affiche, ligne par ligne…"></textarea>' +
      '<div class="actions"><button class="principal" id="validerSortie">Valider</button>' +
      '<button class="lien" id="nsp">Je ne sais pas</button></div>';
  } else if (e.code) {
    corps += '<div class="enonce-code">' + e.code.enonce + '</div>' +
      (e.code.tentatives ? '<p class="indice">Déjà ' + e.code.tentatives + ' tentative(s) sur cet exercice.</p>' : '') +
      '<div id="indices"></div>' +
      '<div class="actions">' +
        '<button class="principal" id="verifierCode">▶️ Vérifier</button>' +
        '<button class="secondaire" id="ouvrirExercice">📂 Ouvrir le code</button>' +
        (e.code.indices.length ? '<button class="secondaire" id="indiceCode">💡 Indice</button>' : '') +
        '<button class="lien" id="abandonner">🏳️ Voir la correction</button>' +
      '</div><div id="resultatTests"></div>' +
      '<p class="indice">Code dans l\\'éditeur à droite, puis ▶️ Vérifier (ou <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> depuis l\\'éditeur).</p>';
  } else if (e.type === 'verification') {
    corps += '<div class="enonce">' + e.enonce + '</div><div class="definition">' + e.definitions + '</div>' +
      '<div class="actions"><button class="principal" data-verif="juste">✅ Elle est juste</button>' +
      '<button class="secondaire" data-verif="corriger">✏️ Je la corrige</button>' +
      '<button class="lien" data-verif="passer">Plus tard</button></div>';
  }
  zone.innerHTML = corps;
  const saisie = document.getElementById('saisie');
  if (saisie) saisie.focus();
  lier('valider', () => repondre({ type: 'texte', valeur: saisie.value }));
  lier('voirIndice', () => document.getElementById('indice').classList.remove('cache'));
  lier('nsp', () => repondre({ type: 'jeNeSaisPas' }));
  lier('reveler', () => envoyer({ type: 'reveler' }));
  zone.querySelectorAll('.option').forEach((b) => b.onclick = () => { choisi = Number(b.dataset.i); repondre({ type: 'option', index: choisi }); });
  zone.querySelectorAll('[data-verif]').forEach((b) => b.onclick = () => repondre({ type: 'verification', choix: b.dataset.verif }));

  // Exercices de code
  lier('ouvrirExercice', () => envoyer({ type: 'ouvrirExercice' }));
  lier('verifierCode', () => envoyer({ type: 'verifierCode' }));
  lier('abandonner', () => repondre({ type: 'code', reussi: false }));
  lier('validerSortie', () => repondre({ type: 'texte', valeur: saisie.value }));
  let indicesMontres = 0;
  lier('indiceCode', () => {
    if (indicesMontres >= e.code.indices.length) return;
    document.getElementById('indices').insertAdjacentHTML('beforeend', '<div class="indice">💡 ' + e.code.indices[indicesMontres++] + '</div>');
    if (indicesMontres >= e.code.indices.length) document.getElementById('indiceCode').disabled = true;
  });
  if (e.code && e.code.genre === 'sortie') lier('nsp', () => repondre({ type: 'texte', valeur: '' }));

  // Exercices corrigés par l'IA
  const envoyerIA = document.getElementById('envoyerIA');
  const majEnvoi = () => { if (envoyerIA && e.type === 'piste_valider') envoyerIA.disabled = !statutChoisi || !saisie.value.trim(); };
  if (saisie && e.type === 'piste_valider') saisie.addEventListener('input', majEnvoi);
  zone.querySelectorAll('.statut').forEach((b) => b.onclick = () => {
    if (e.type === 'piste_vf') { repondre({ type: 'piste', statut: b.dataset.statut, justification: '' }); return; }
    statutChoisi = b.dataset.statut;
    zone.querySelectorAll('.statut').forEach((x) => x.classList.toggle('choisi', x === b));
    majEnvoi();
    saisie.focus();
  });
  if (envoyerIA) envoyerIA.onclick = () => {
    if (envoyerIA.disabled) return;
    if (e.type === 'explication' && !saisie.value.trim()) { saisie.focus(); return; }
    const reponse = e.type === 'explication'
      ? { type: 'texte', valeur: saisie.value }
      : { type: 'piste', statut: statutChoisi, justification: saisie.value };
    attendreIA();
    repondre(reponse);
  };
  if (e.type === 'piste_valider' || e.type === 'explication') {
    const nsp = document.getElementById('nsp');
    nsp.onclick = () => { if (e.type === 'piste_valider') attendreIA(); repondre({ type: 'jeNeSaisPas' }); };
  }
}

function afficherChargement(message) {
  etat = 'attente';
  zone.innerHTML = '<div class="attente">' + message + '</div>';
}

function afficherResultatTests(r) {
  const zoneTests = document.getElementById('resultatTests');
  if (!zoneTests) return;
  let html = '<div class="retour-ia"><strong>' + r.resume + '</strong>';
  if (!r.compile) html += '<pre class="code">' + r.sortieCompilation + '</pre><div class="indice">Les erreurs sont aussi soulignées dans l\\'éditeur.</div>';
  if (r.tests.length) html += '<ul class="tests">' + r.tests.map((t) => '<li>' + (t.ok ? '✅ ' : '❌ ') + t.nom +
    (!t.ok && t.detail ? '<div class="detail">' + t.detail + '</div>' : '') + '</li>').join('') + '</ul>';
  if (r.sortie) html += '<details><summary>Ce que ton programme a affiché</summary><pre class="code">' + r.sortie + '</pre></details>';
  html += '</div>';
  zoneTests.innerHTML = html;
  const bouton = document.getElementById('verifierCode');
  if (bouton) { bouton.disabled = false; bouton.textContent = '▶️ Vérifier'; }
}

function attendreIA() {
  zone.querySelectorAll('.actions button, .statut, textarea').forEach((x) => x.disabled = true);
  const attente = document.createElement('div');
  attente.className = 'attente';
  attente.id = 'attente';
  attente.textContent = "🤖 L'IA corrige ta réponse";
  zone.appendChild(attente);
}

function lier(id, action) { const el = document.getElementById(id); if (el) el.onclick = action; }

function afficherRevelation(definitions) {
  etat = 'revelation';
  document.getElementById('revelation').innerHTML = '<div class="definition">' + definitions + '</div><p>Tu savais ?</p>';
  document.getElementById('actionsFlash').innerHTML =
    '<button class="principal" data-auto="reussite">😎 Je savais</button>' +
    '<button class="secondaire" data-auto="moyen">🤔 À moitié</button>' +
    '<button class="secondaire" data-auto="echec">😵 Pas du tout</button>' +
    '<button class="lien" id="ouvrir">✏️ Ouvrir la note</button>';
  zone.querySelectorAll('[data-auto]').forEach((b) => b.onclick = () => repondre({ type: 'autoEvaluation', resultat: b.dataset.auto }));
  lier('ouvrir', () => envoyer({ type: 'ouvrirNote' }));
}

function afficherCorrection(c) {
  etat = 'correction';
  const verdicts = { reussite: ['reussite', '✅ Bravo !'], echec: ['echec', '❌ Raté'], moyen: ['moyen', '🤔 À revoir bientôt'] };
  const [classe, texte] = verdicts[c.resultat] || ['', ''];
  // Les QCM restent visibles avec la bonne réponse en vert
  zone.querySelectorAll('.option').forEach((b) => {
    b.disabled = true;
    if (Number(b.dataset.i) === c.bonneOption) b.classList.add('bonne');
    else if (Number(b.dataset.i) === choisi) b.classList.add('mauvaise');
  });
  zone.querySelectorAll('.actions').forEach((a) => a.remove());
  document.getElementById('attente')?.remove();
  zone.querySelectorAll('.statut').forEach((b) => { b.disabled = true; });
  const saisie = document.getElementById('saisie');
  if (saisie) saisie.disabled = true;

  if (c.erreur) {
    const bloc = document.createElement('div');
    bloc.innerHTML = '<div class="verdict echec">⚠️ L\\'IA n\\'a pas pu corriger</div><p>' + c.erreur.replace(/</g, '&lt;') + '</p>' +
      '<div class="actions"><button class="principal" id="suivant">Passer ➜</button></div>';
    zone.appendChild(bloc);
    lier('suivant', () => { etat = 'attente'; envoyer({ type: 'suivant' }); });
    document.getElementById('suivant').focus();
    return;
  }

  let html = '<div class="verdict ' + classe + '">' + texte + (c.verifiee ? ' — définition vérifiée' : '') + '</div>';
  if (c.solution) html += '<div class="enonce">' + c.solution + '</div>';
  else if (c.estPiste && c.bonneReponse) html += '<p>Bonne réponse : <strong>' + c.bonneReponse + '</strong></p>';
  else if (c.resultat === 'echec' && c.bonneReponse && !exercice.options) html += '<p>Réponse attendue : <strong>' + c.bonneReponse + '</strong></p>';
  if (c.estCode && c.resultat === 'reussite' && !c.sortieAttendue) html += '<p>🎉 Exercice réussi' + (c.tentatives > 1 ? ' en ' + c.tentatives + ' tentatives' : '') + '. Compare avec la solution proposée : il y a souvent plusieurs bonnes façons de faire.</p>';
  if (c.estCode && c.resultat === 'echec' && !c.sortieAttendue) html += '<p>La correction est ouverte à côté. Cet exercice te sera reproposé plus tard.</p>';
  if (c.sortieAttendue !== undefined) {
    html += '<div class="deux"><div><h4>Ta réponse</h4><pre class="code">' + (saisie ? saisie.value.replace(/</g, '&lt;') : '') + '</pre></div>' +
            '<div><h4>Vraie sortie</h4><pre class="code">' + c.sortieAttendue + '</pre></div></div>';
    if (c.explication) html += '<details open><summary>💡 Pourquoi ?</summary><div class="definition">' + c.explication + '</div></details>';
  }
  if (c.justificationCer) html += '<div class="cer">📝 Justification de ton CER : ' + c.justificationCer + '</div>';
  if (c.ia) {
    let retour = '';
    if (typeof c.ia.note === 'number' && exercice.type === 'explication') retour += '<p><strong>Note : ' + c.ia.note + '/10</strong></p>';
    if (c.ia.retour) retour += '<p>' + c.ia.retour + '</p>';
    if (c.ia.pointsForts?.length) retour += '<div>✅ Ce qui est juste :</div><ul>' + c.ia.pointsForts.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
    if (c.ia.aRevoir?.length) retour += '<div>🔎 À revoir :</div><ul>' + c.ia.aRevoir.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
    if (retour) html += '<div class="retour-ia">' + retour + '</div>';
    if (c.ia.modele) html += '<details open><summary>💡 Explication modèle</summary><div class="definition">' + c.ia.modele + '</div></details>';
    if (c.ia.justification) html += '<div class="cer">📝 Écrit dans ton CER : <strong>' + (c.bonneReponse || '') + '</strong> — ' + c.ia.justification + '</div>';
  }
  if (c.changement) {
    const fleche = c.changement.sens > 0 ? '⬆️' : c.changement.sens < 0 ? '⬇️' : '➡️';
    html += '<div class="croissance">' + fleche + ' ' + c.changement.avant + (c.changement.sens ? ' → ' + c.changement.apres : '') +
            ' · prochaine révision ' + c.changement.prochaine +
            (c.changement.bloque ? '<div class="bloque">🔒 ' + c.changement.bloque + '</div>' : '') + '</div>';
  } else if (!c.compte && !c.estPiste) {
    html += '<div class="croissance">🏋️ Entraînement : ne change pas ta plante.</div>';
  }
  if (c.definitions && exercice.type !== 'verification' && exercice.type !== 'flashcard') html += '<details><summary>Voir la définition</summary><div class="definition">' + c.definitions + '</div></details>';
  html += '<div class="actions"><button class="principal" id="suivant">Suivant ➜</button>' +
          (c.peutRectifier ? '<button class="secondaire" id="rectifier">J\\'avais bon en fait</button>' : '') +
          (c.estCode && !c.sortieAttendue ? '<button class="secondaire" id="voirSolution">📖 Solution proposée</button>' : '') +
          '<button class="lien" id="ouvrir">✏️ ' + (c.estPiste ? 'Ouvrir le Prosit' : 'Ouvrir la note') + '</button></div>';
  const bloc = document.createElement('div');
  bloc.innerHTML = html;
  zone.appendChild(bloc);
  lier('suivant', () => { etat = 'attente'; envoyer({ type: 'suivant' }); });
  lier('rectifier', () => envoyer({ type: 'rectifier' }));
  lier('voirSolution', () => envoyer({ type: 'voirSolution' }));
  lier('ouvrir', () => envoyer({ type: 'ouvrirNote' }));
  document.getElementById('suivant').focus();
}

function afficherFin(b, entrainement) {
  etat = 'fin';
  const taux = b.faits ? Math.round(100 * b.reussis / b.faits) : 0;
  let html = '<div class="fin"><h1>' + (b.restants === 0 && !entrainement ? '🌳 Tout est arrosé !' : '🌙 Séance terminée') + '</h1>' +
    '<div class="chiffres">' +
      '<div class="chiffre"><b>' + b.faits + '</b>exercices</div>' +
      '<div class="chiffre"><b>' + taux + ' %</b>de réussite</div>' +
      '<div class="chiffre"><b>' + b.montees.length + '</b>plantes ont poussé</div>' +
      '<div class="chiffre"><b>🔥 ' + b.serie + '</b>jour(s) de suite</div>' +
    '</div>';
  if (b.verifiees) html += '<p>✅ ' + b.verifiees + ' définition(s) vérifiée(s).</p>';
  if (b.pistesValidees) html += '<p>📝 ' + b.pistesValidees + ' piste(s) de solution ajoutée(s) à tes CER.</p>';
  if (b.montees.length) html += '<h3>Ce qui a poussé</h3><ul class="plantes">' + b.montees.map((m) => '<li>' + m.avant + ' → ' + m.apres + ' ' + m.titre + '</li>').join('') + '</ul>';
  if (b.descentes.length) html += '<h3>À retravailler</h3><ul class="plantes">' + b.descentes.map((m) => '<li>' + m.avant + ' → ' + m.apres + ' ' + m.titre + '</li>').join('') + '</ul>';
  if (!entrainement) html += '<p>' + (b.restants ? b.restants + ' notion(s) attendent encore aujourd\\'hui.' : 'Plus rien à revoir aujourd\\'hui. Reviens demain 🌞') + '</p>';
  html += '<div class="actions">' +
    (b.restants && !entrainement ? '<button class="principal" id="reprendre">Continuer la révision</button>' : '') +
    '<button class="' + (b.restants && !entrainement ? 'secondaire' : 'principal') + '" id="continuer">🏋️ S\\'entraîner encore</button>' +
    '<button class="secondaire" id="fermer">Fermer</button></div></div>';
  zone.innerHTML = html;
  lier('reprendre', () => { etat = 'attente'; envoyer({ type: 'suivant' }); });
  lier('continuer', () => { etat = 'attente'; envoyer({ type: 'continuer' }); });
  lier('fermer', () => envoyer({ type: 'fermer' }));
}

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.progression) compteurs(m.progression);
  if (m.type === 'exercice') afficherExercice(m.exercice);
  if (m.type === 'revelation') afficherRevelation(m.definitions);
  if (m.type === 'chargement') afficherChargement(m.message);
  if (m.type === 'resultatTests') afficherResultatTests(m.resultat);
  if (m.type === 'verificationEnCours') {
    const b = document.getElementById('verifierCode');
    if (b) { b.disabled = true; b.textContent = '🔨 Compilation…'; }
  }
  if (m.type === 'correction') afficherCorrection(m.correction);
  if (m.type === 'fin') afficherFin(m.bilan, m.entrainement);
});

document.getElementById('stop').onclick = () => envoyer({ type: 'stop' });

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && etat === 'exercice') {
    ev.preventDefault();
    (document.getElementById('envoyerIA') || document.getElementById('validerSortie'))?.click();
    return;
  }
  if ((ev.key === 'v' || ev.key === 'V') && ev.ctrlKey && ev.altKey && etat === 'exercice') {
    ev.preventDefault();
    document.getElementById('verifierCode')?.click();
    return;
  }
  if (ev.key === 'Enter' && !ev.shiftKey) {
    if (document.activeElement?.tagName === 'TEXTAREA' && etat === 'exercice') return;
    if (etat === 'correction') { ev.preventDefault(); document.getElementById('suivant')?.click(); }
    else if (etat === 'exercice' && exercice?.type === 'trou') { ev.preventDefault(); document.getElementById('valider')?.click(); }
    else if (etat === 'exercice' && exercice?.type === 'flashcard' && document.activeElement?.id !== 'saisie') { ev.preventDefault(); document.getElementById('reveler')?.click(); }
  } else if (etat === 'exercice' && exercice?.type === 'piste_vf' && /^[1-3]$/.test(ev.key)) {
    zone.querySelectorAll('.statut')[Number(ev.key) - 1]?.click();
  } else if (etat === 'exercice' && exercice?.options && /^[1-4]$/.test(ev.key)) {
    zone.querySelector('.option[data-i="' + (Number(ev.key) - 1) + '"]')?.click();
  } else if (ev.key === 'Escape' && etat === 'exercice' && !document.getElementById('attente')) {
    document.getElementById('nsp')?.click();
  }
});

envoyer({ type: 'pret' });
</script>
</body>
</html>`;
}
