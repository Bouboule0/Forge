// Écran de l'examen blanc CCTL : une question par page, grille de navigation, chronomètre,
// note et correction à la fin seulement (comme le vrai).

import * as vscode from 'vscode';
import { corrigerCctl, enregistrerCctl, type QuestionCctl } from '../core/cctl';

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texteHtml = (t: string) => echapper(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

export function ouvrirEcranCctl(
  coffre: string,
  titre: string,
  questions: QuestionCctl[],
  dureeMinutes: number,
  actions: { reviserErreurs(notions: string[], titre: string): void; surFin(): void },
): void {
  const panneau = vscode.window.createWebviewPanel('forge.cctl', `📝 CCTL blanc — ${titre}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panneau.webview.html = html(panneau.webview);
  const debut = Date.now();
  let notionsARevoir: string[] = [];

  panneau.webview.onDidReceiveMessage(async (m: { type: string; reponses?: Array<number | null> }) => {
    if (m.type === 'pret') {
      panneau.webview.postMessage({
        type: 'sujet',
        sujet: {
          titre,
          duree: dureeMinutes,
          questions: questions.map((q) => ({ enonce: texteHtml(q.enonce), code: q.code ? echapper(q.code) : undefined, options: q.options.map(texteHtml) })),
        },
      });
    }
    if (m.type === 'terminer' && m.reponses) {
      const duree = Math.max(1, Math.round((Date.now() - debut) / 60_000));
      const resultat = corrigerCctl(questions, m.reponses);
      notionsARevoir = resultat.notionsARevoir;
      const chemin = enregistrerCctl(coffre, titre, questions, m.reponses, resultat, duree);
      panneau.webview.postMessage({
        type: 'correction',
        correction: {
          note: resultat.note,
          bonnes: resultat.bonnes,
          total: resultat.total,
          duree,
          aRevoir: resultat.notionsARevoir.length,
          questions: questions.map((q, i) => ({
            bonne: q.bonne,
            reponse: m.reponses![i],
            explication: q.explication ? texteHtml(q.explication) : undefined,
          })),
        },
      });
      actions.surFin();
      const choix = await vscode.window.showInformationMessage(`📝 CCTL blanc : ${resultat.note}/20. Compte rendu enregistré dans ton coffre.`, 'Ouvrir le compte rendu');
      if (choix) await vscode.window.showTextDocument(vscode.Uri.file(chemin), { viewColumn: vscode.ViewColumn.Beside });
    }
    if (m.type === 'reviserErreurs' && notionsARevoir.length) {
      actions.reviserErreurs(notionsARevoir, `erreurs du CCTL blanc ${titre}`);
    }
  });
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 15px; line-height: 1.5; margin: 0; }
  .page { max-width: 780px; margin: 0 auto; padding: 0 24px 50px; }
  .haut { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 10px 0;
          background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
  .temps { font-family: var(--vscode-editor-font-family); font-size: 1.3em; font-weight: 600; }
  .temps.fini { color: #d03b3b; }
  .espace { flex: 1; }
  .grille { display: flex; flex-wrap: wrap; gap: 4px; margin: 12px 0; }
  .case { width: 30px; height: 30px; border-radius: 4px; border: 2px solid var(--vscode-panel-border); background: transparent;
          color: var(--vscode-foreground); cursor: pointer; font: inherit; font-size: 12px; }
  .case.repondue { background: var(--vscode-button-secondaryBackground); }
  .case.actuelle { border-color: var(--vscode-focusBorder); }
  .case.juste { background: #0ca30c; color: #fff; border-color: #0ca30c; }
  .case.fausse { background: #d03b3b; color: #fff; border-color: #d03b3b; }
  .question { margin: 16px 0; }
  .numero { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .enonce { font-size: 1.1em; margin: 8px 0 14px; }
  pre { font-family: var(--vscode-editor-font-family); font-size: 13px; padding: 10px 12px; overflow-x: auto; background: var(--vscode-textCodeBlock-background); border-radius: 6px; }
  .option { display: block; width: 100%; text-align: left; margin: 6px 0; padding: 10px 14px; border-radius: 6px; cursor: pointer; font: inherit;
            border: 2px solid transparent; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .option.choisie { border-color: var(--vscode-focusBorder); }
  .option.bonne { border-color: #0ca30c; }
  .option.mauvaise { border-color: #d03b3b; }
  .option .touche { opacity: .6; margin-right: 8px; font-family: var(--vscode-editor-font-family); }
  .nav { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
  button.bouton { padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer; font: inherit;
                  background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.bouton.secondaire { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .note { font-size: 3em; font-weight: 600; margin: 12px 0 0; }
  .aide { font-size: 13px; color: var(--vscode-descriptionForeground); }
  .explication { margin-top: 8px; padding: 8px 12px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); }
  .avert { color: #d03b3b; font-size: 13px; }
</style>
</head>
<body>
<div class="page" id="page"><p class="aide">Préparation du questionnaire…</p></div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const page = document.getElementById('page');
let sujet = null, reponses = [], actuelle = 0, fin = 0, minuterie = null, termine = false, correction = null, confirmer = false;

const deux = (x) => String(x).padStart(2, '0');
function tic() {
  const el = document.getElementById('temps');
  if (!el) return;
  const reste = Math.round((fin - Date.now()) / 1000), a = Math.abs(reste);
  el.textContent = (reste < 0 ? '+' : '') + deux(Math.floor(a / 60)) + ':' + deux(a % 60);
  el.classList.toggle('fini', reste < 0);
}

function grille() {
  return '<div class="grille">' + sujet.questions.map((q, i) => {
    let c = 'case';
    if (correction) c += correction.questions[i].reponse === correction.questions[i].bonne ? ' juste' : ' fausse';
    else if (reponses[i] !== null) c += ' repondue';
    if (i === actuelle) c += ' actuelle';
    return '<button class="' + c + '" data-aller="' + i + '">' + (i + 1) + '</button>';
  }).join('') + '</div>';
}

function afficher() {
  const q = sujet.questions[actuelle];
  let h = '<div class="haut"><b>📝 ' + sujet.titre.replace(/</g, '&lt;') + '</b>' +
    (correction ? '<span class="aide">Correction</span>' : '<span>⏱️ <span class="temps" id="temps"></span></span>') +
    '<span class="espace"></span>' +
    (correction ? '<button class="bouton secondaire" id="resultats">Résultats</button>' : '<button class="bouton" id="terminer">Terminer</button>') + '</div>';
  h += grille();
  h += '<div class="question"><div class="numero">Question ' + (actuelle + 1) + ' / ' + sujet.questions.length + '</div><div class="enonce">' + q.enonce + '</div>';
  if (q.code) h += '<pre>' + q.code + '</pre>';
  q.options.forEach((o, i) => {
    let c = 'option';
    if (correction) {
      const r = correction.questions[actuelle];
      if (i === r.bonne) c += ' bonne'; else if (i === r.reponse) c += ' mauvaise';
    } else if (reponses[actuelle] === i) c += ' choisie';
    h += '<button class="' + c + '" data-option="' + i + '"' + (correction ? ' disabled' : '') + '><span class="touche">' + (i + 1) + '</span>' + o + '</button>';
  });
  if (correction && correction.questions[actuelle].explication) h += '<div class="explication">💡 ' + correction.questions[actuelle].explication + '</div>';
  h += '</div><div class="nav"><button class="bouton secondaire" id="prec">← Précédente</button><button class="bouton secondaire" id="suiv">Suivante →</button>' +
    '<span class="aide">Touches 1–4 pour répondre, ← → pour naviguer</span></div><p class="avert" id="avert"></p>';
  page.innerHTML = h;
  page.querySelectorAll('[data-aller]').forEach((b) => b.onclick = () => { actuelle = Number(b.dataset.aller); afficher(); });
  page.querySelectorAll('[data-option]').forEach((b) => b.onclick = () => { reponses[actuelle] = Number(b.dataset.option); confirmer = false; afficher(); });
  document.getElementById('prec').onclick = () => aller(-1);
  document.getElementById('suiv').onclick = () => aller(1);
  if (document.getElementById('terminer')) document.getElementById('terminer').onclick = terminer;
  if (document.getElementById('resultats')) document.getElementById('resultats').onclick = afficherResultats;
  tic();
}

function aller(d) { actuelle = Math.max(0, Math.min(sujet.questions.length - 1, actuelle + d)); afficher(); }

function terminer() {
  const vides = reponses.filter((r) => r === null).length;
  if (vides && !confirmer) {
    confirmer = true;
    document.getElementById('avert').textContent = vides + ' question(s) sans réponse. Clique encore sur « Terminer » pour rendre quand même.';
    return;
  }
  termine = true;
  clearInterval(minuterie);
  page.innerHTML = '<p class="aide">Correction…</p>';
  vscode.postMessage({ type: 'terminer', reponses });
}

function afficherResultats() {
  const c = correction;
  page.innerHTML = '<div class="note">' + c.note + '/20</div>' +
    '<p>' + c.bonnes + ' bonne(s) réponse(s) sur ' + c.total + ' · ' + c.duree + ' min</p>' +
    '<p class="aide">Clique sur une case pour revoir la question et sa correction (vert : juste, rouge : faux).</p>' + grille() +
    (c.aRevoir ? '<p><button class="bouton" id="reviser">🌱 Réviser les ' + c.aRevoir + ' notion(s) ratée(s)</button></p>' : '<p>Aucune notion à retravailler 🎉</p>');
  page.querySelectorAll('[data-aller]').forEach((b) => b.onclick = () => { actuelle = Number(b.dataset.aller); afficher(); });
  if (document.getElementById('reviser')) document.getElementById('reviser').onclick = () => vscode.postMessage({ type: 'reviserErreurs' });
}

document.addEventListener('keydown', (ev) => {
  if (!sujet || termine && !correction) return;
  if (ev.key === 'ArrowRight') aller(1);
  else if (ev.key === 'ArrowLeft') aller(-1);
  else if (!correction && /^[1-4]$/.test(ev.key) && Number(ev.key) <= sujet.questions[actuelle].options.length) {
    reponses[actuelle] = Number(ev.key) - 1; confirmer = false; afficher();
  }
});

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.type === 'sujet') {
    sujet = m.sujet;
    reponses = sujet.questions.map(() => null);
    fin = Date.now() + sujet.duree * 60000;
    minuterie = setInterval(tic, 1000);
    afficher();
  }
  if (m.type === 'correction') { correction = m.correction; afficherResultats(); }
});
vscode.postMessage({ type: 'pret' });
</script>
</body>
</html>`;
}
