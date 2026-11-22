// Écran du mode « sur papier » : sujet chronométré, zones de réponse sans aide, correction.

import * as vscode from 'vscode';
import { marked } from 'marked';
import { corrigerEtude, enregistrerEtude, type EtudeDeCas } from '../core/etudeDeCas';
import type { NotionRevision } from '../core/notionsRevision';
import type { ClientIA } from '../core/relectureIA';

const enBloc = (md: string) => marked.parse(md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1'), { async: false }) as string;

export function ouvrirEcranPapier(
  coffre: string,
  client: ClientIA,
  prosit: string,
  etude: EtudeDeCas,
  notions: NotionRevision[],
  surFin: () => void,
): void {
  const panneau = vscode.window.createWebviewPanel('forge.papier', `📝 ${etude.titre}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  panneau.webview.html = html(panneau.webview);
  const debut = Date.now();
  let rendu = false;

  panneau.webview.onDidReceiveMessage(async (m: { type: string; copies?: string[] }) => {
    if (m.type === 'pret') {
      panneau.webview.postMessage({
        type: 'sujet',
        sujet: {
          titre: etude.titre,
          contexte: enBloc(etude.contexte),
          duree: etude.dureeMinutes,
          questions: etude.questions.map((q) => ({ numero: q.numero, enonce: enBloc(q.enonce), type: q.type, points: q.points })),
        },
      });
    }
    if (m.type === 'rendre' && m.copies && !rendu) {
      rendu = true;
      const dureeReelle = Math.max(1, Math.round((Date.now() - debut) / 60_000));
      try {
        const correction = await corrigerEtude(client, etude, m.copies);
        const chemin = enregistrerEtude(coffre, prosit, etude, m.copies, correction, notions, dureeReelle);
        panneau.webview.postMessage({
          type: 'correction',
          correction: {
            note: correction.note,
            appreciation: correction.appreciation,
            duree: dureeReelle,
            questions: correction.questions.map((c, i) => ({ ...c, commentaire: enBloc(c.commentaire), corrige: enBloc(etude.questions[i].corrige) })),
          },
        });
        surFin();
        const choix = await vscode.window.showInformationMessage(`📝 Étude de cas : ${correction.note}/20. Sujet, copie et corrigé enregistrés dans ton coffre.`, 'Ouvrir');
        if (choix) await vscode.window.showTextDocument(vscode.Uri.file(chemin), { viewColumn: vscode.ViewColumn.Beside });
      } catch (e) {
        rendu = false;
        panneau.webview.postMessage({ type: 'erreur', message: e instanceof Error ? e.message : String(e) });
      }
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
  .page { max-width: 820px; margin: 0 auto; padding: 0 24px 60px; }
  .chrono { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 10px 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
  .chrono .temps { font-family: var(--vscode-editor-font-family); font-size: 1.4em; font-weight: 600; }
  .chrono .temps.fini { color: #e57373; }
  .chrono .espace { flex: 1; }
  .question { margin: 22px 0; padding: 14px 18px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; }
  .question h3 { margin: 0 0 8px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 140px; resize: vertical; padding: 8px 10px; font-size: 14px;
             background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); }
  textarea.code { font-family: var(--vscode-editor-font-family); min-height: 220px; tab-size: 4; }
  pre { overflow-x: auto; padding: 8px; background: var(--vscode-textCodeBlock-background); }
  button { padding: 7px 16px; border: none; border-radius: 4px; cursor: pointer; font: inherit; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:disabled { opacity: .5; }
  .note { font-size: 2.4em; font-weight: 700; margin: 10px 0; }
  .points { float: right; font-weight: 600; }
  .commentaire { margin: 8px 0; padding: 8px 12px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); }
  .aide { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .attente { color: var(--vscode-descriptionForeground); margin: 30px 0; }
</style>
</head>
<body>
<div class="page" id="page"><p class="attente">Chargement du sujet…</p></div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const page = document.getElementById('page');
let fin = 0, minuterie = null, confirmer = false, questions = [];

function deuxChiffres(x) { return String(x).padStart(2, '0'); }
function tic() {
  const reste = Math.round((fin - Date.now()) / 1000);
  const el = document.getElementById('temps');
  if (!el) return;
  const a = Math.abs(reste);
  el.textContent = (reste < 0 ? '+' : '') + deuxChiffres(Math.floor(a / 60)) + ':' + deuxChiffres(a % 60);
  el.classList.toggle('fini', reste < 0);
  document.getElementById('etatTemps').textContent = reste < 0 ? 'Temps écoulé — tu peux encore rendre ta copie' : 'restant';
}

function afficherSujet(s) {
  questions = s.questions;
  fin = Date.now() + s.duree * 60000;
  let h = '<div class="chrono"><span>⏱️</span><span class="temps" id="temps"></span><span class="aide" id="etatTemps"></span>' +
          '<span class="espace"></span><button id="rendre">Rendre ma copie</button></div>' +
          '<h1>📝 ' + s.titre + '</h1><p class="aide">Comme sur papier : pas de compilateur, pas d\\'autocomplétion. Barème sur 20.</p>' +
          '<div>' + s.contexte + '</div>';
  for (const q of s.questions) {
    h += '<div class="question"><h3>Question ' + q.numero + ' <span class="points">' + q.points + ' pt' + (q.points > 1 ? 's' : '') + '</span></h3>' + q.enonce +
         '<textarea class="' + (q.type === 'code' ? 'code' : '') + '" id="q' + q.numero + '" spellcheck="false" autocomplete="off" autocorrect="off" ' +
         'placeholder="' + (q.type === 'code' ? 'Ton code C++…' : 'Ta réponse…') + '"></textarea></div>';
  }
  h += '<button id="rendre2">Rendre ma copie</button> <span class="aide" id="avertissement"></span>';
  page.innerHTML = h;
  // Tabulation = indentation dans les zones de code
  page.querySelectorAll('textarea.code').forEach((t) => t.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const d = t.selectionStart;
    t.value = t.value.slice(0, d) + '    ' + t.value.slice(t.selectionEnd);
    t.selectionStart = t.selectionEnd = d + 4;
  }));
  document.getElementById('rendre').onclick = rendre;
  document.getElementById('rendre2').onclick = rendre;
  tic();
  minuterie = setInterval(tic, 1000);
}

function rendre() {
  const copies = questions.map((q) => document.getElementById('q' + q.numero).value);
  const vides = copies.filter((c) => !c.trim()).length;
  if (vides && !confirmer) {
    confirmer = true;
    document.getElementById('avertissement').textContent = vides + ' question(s) sans réponse. Clique encore sur « Rendre ma copie » pour confirmer.';
    return;
  }
  clearInterval(minuterie);
  page.querySelectorAll('textarea, button').forEach((x) => x.disabled = true);
  const attente = document.createElement('p');
  attente.className = 'attente';
  attente.id = 'attente';
  attente.textContent = '🤖 Correction de ta copie en cours…';
  page.appendChild(attente);
  attente.scrollIntoView();
  vscode.postMessage({ type: 'rendre', copies });
}

function afficherCorrection(c) {
  document.getElementById('attente')?.remove();
  document.querySelector('.chrono')?.remove();
  let h = '<div class="note">' + c.note + '/20</div><p>' + (c.appreciation || '') + '</p><p class="aide">Rendu en ' + c.duree + ' min.</p>';
  c.questions.forEach((q) => {
    const bloc = document.getElementById('q' + q.numero)?.closest('.question');
    if (!bloc) return;
    bloc.insertAdjacentHTML('beforeend', '<div class="commentaire"><span class="points">' + q.points + '/' + q.max + '</span>' + q.commentaire + '</div>' +
      '<details><summary>Corrigé</summary>' + q.corrige + '</details>');
  });
  page.insertAdjacentHTML('afterbegin', '<div class="question">' + h + '</div>');
  document.getElementById('rendre2')?.remove();
  window.scrollTo(0, 0);
}

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.type === 'sujet') afficherSujet(m.sujet);
  if (m.type === 'correction') afficherCorrection(m.correction);
  if (m.type === 'erreur') {
    document.getElementById('attente')?.remove();
    page.querySelectorAll('textarea, button').forEach((x) => x.disabled = false);
    confirmer = true;
    page.insertAdjacentHTML('beforeend', '<p class="attente">⚠️ ' + m.message.replace(/</g, '&lt;') + ' — ta copie est conservée, réessaie « Rendre ma copie ».</p>');
  }
});
vscode.postMessage({ type: 'pret' });
</script>
</body>
</html>`;
}
