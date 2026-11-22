// Écran de la ferme (webview + canvas pixel-art).
// Tu places toi-même tes plantes (une par notion) et tes décorations ; réviser les fait pousser
// et rapporte des pièces pour la boutique.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  acheter,
  deplacerDecoration,
  deterrer,
  ErreurFerme,
  planter,
  toutPlanter,
  vueFerme,
} from '../core/ferme';
import { cheminDossier } from '../core/coffre';
import { DECORATIONS, PALETTE, PALETTE_DECORATION, SAISONS, STADES, VARIETES } from './fermeSprites';

export interface ActionsFerme {
  reviserNotion(nom: string): void;
}

type Message =
  | { type: 'pret' }
  | { type: 'planter'; nom: string; x: number; y: number }
  | { type: 'deterrer'; nom: string }
  | { type: 'acheter'; article: string; x: number; y: number }
  | { type: 'deplacerDeco'; id: string; x: number | null; y: number | null }
  | { type: 'toutPlanter' }
  | { type: 'reviser'; nom: string }
  | { type: 'ouvrirNote'; nom: string }
  | { type: 'photo'; image: string };

export class EcranFerme {
  private static actuel?: EcranFerme;
  private readonly panneau: vscode.WebviewPanel;

  static ouvrir(coffre: string, actions: ActionsFerme): void {
    if (EcranFerme.actuel) {
      EcranFerme.actuel.panneau.reveal();
      EcranFerme.actuel.envoyerEtat();
      return;
    }
    EcranFerme.actuel = new EcranFerme(coffre, actions);
  }

  /** À appeler après une séance : les plantes ont peut-être poussé. */
  static actualiser(): void {
    EcranFerme.actuel?.envoyerEtat();
  }

  private constructor(private readonly coffre: string, private readonly actions: ActionsFerme) {
    this.panneau = vscode.window.createWebviewPanel('forge.ferme', '🌻 Ma ferme', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panneau.webview.html = html(this.panneau.webview);
    this.panneau.webview.onDidReceiveMessage((m: Message) => this.recevoir(m));
    this.panneau.onDidDispose(() => (EcranFerme.actuel = undefined));
  }

  private envoyerEtat(): void {
    this.panneau.webview.postMessage({ type: 'etat', vue: vueFerme(this.coffre) });
  }

  private async recevoir(m: Message): Promise<void> {
    try {
      switch (m.type) {
        case 'pret':
          break;
        case 'planter':
          planter(this.coffre, m.nom, m.x, m.y);
          break;
        case 'deterrer':
          deterrer(this.coffre, m.nom);
          break;
        case 'acheter':
          acheter(this.coffre, m.article, m.x, m.y);
          break;
        case 'deplacerDeco':
          deplacerDecoration(this.coffre, m.id, m.x, m.y);
          break;
        case 'toutPlanter': {
          const n = toutPlanter(this.coffre);
          this.panneau.webview.postMessage({ type: 'info', message: n ? `🌱 ${n} graine(s) plantée(s).` : 'Plus de place : monte de niveau pour agrandir la ferme.' });
          break;
        }
        case 'reviser':
          this.actions.reviserNotion(m.nom);
          return;
        case 'ouvrirNote':
          await vscode.window.showTextDocument(vscode.Uri.file(path.join(cheminDossier(this.coffre, 'notions'), `${m.nom}.md`)), {
            viewColumn: vscode.ViewColumn.Beside,
          });
          return;
        case 'photo':
          await this.enregistrerPhoto(m.image);
          return;
      }
    } catch (e) {
      const message = e instanceof ErreurFerme ? e.message : `Oups : ${e instanceof Error ? e.message : e}`;
      this.panneau.webview.postMessage({ type: 'erreur', message });
    }
    this.envoyerEtat();
  }

  /** Photo de la ferme dans le coffre, pour la voir dans Obsidian (note Ferme.md). */
  private async enregistrerPhoto(image: string): Promise<void> {
    const donnees = image.replace(/^data:image\/png;base64,/, '');
    const dossier = cheminDossier(this.coffre, 'images');
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'Ferme.png'), Buffer.from(donnees, 'base64'));
    const v = vueFerme(this.coffre);
    const note = path.join(this.coffre, 'Ferme.md');
    const date = new Date().toLocaleDateString('fr-FR');
    fs.writeFileSync(
      note,
      [
        '# 🌻 Ma ferme',
        '',
        `> Photo du ${date} · fermier niveau ${v.niveau} · ${v.pieces} 🪙 · 🔥 ${v.serie} jour(s) de suite`,
        '',
        '![[Ferme.png]]',
        '',
        `- 🍎 ${v.recoltables} notion(s) récoltable(s) sur ${v.plantes.length}`,
        `- 💧 ${v.assoiffees} notion(s) qui fanent`,
        '',
        '_Mise à jour avec le bouton 📸 de la ferme, dans VS Code._',
        '',
      ].join('\n'),
    );
    const choix = await vscode.window.showInformationMessage('📸 Photo enregistrée dans ton coffre (Ferme.md).', 'Ouvrir');
    if (choix) await vscode.window.showTextDocument(vscode.Uri.file(note), { viewColumn: vscode.ViewColumn.Beside });
  }
}

function nonce(): string {
  return Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
}

export function html(webview: Pick<vscode.Webview, 'cspSource'>): string {
  const n = nonce();
  const sprites = JSON.stringify({ PALETTE, VARIETES, STADES, DECORATIONS, PALETTE_DECORATION, SAISONS }).replace(/</g, '\\u003c');
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; font-size: 14px; }
  .ecran { display: flex; height: 100vh; }
  .terrain { flex: 1; overflow: auto; padding: 16px; background: #3b2a1e; }
  canvas { image-rendering: pixelated; display: block; box-shadow: 0 4px 18px rgba(0,0,0,.45); border: 4px solid #6b4423; cursor: pointer; }
  .cote { width: 290px; flex-shrink: 0; overflow-y: auto; padding: 14px; border-left: 1px solid var(--vscode-panel-border); box-sizing: border-box; }
  h2 { margin: 0 0 6px; font-size: 1.2em; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0 10px; }
  .stat { background: var(--vscode-textBlockQuote-background); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .stat b { font-size: 1.15em; }
  .barre { height: 6px; background: var(--vscode-panel-border); border-radius: 3px; overflow: hidden; margin-top: 4px; }
  .barre div { height: 100%; background: #e3b23c; }
  .onglets { display: flex; gap: 4px; margin: 10px 0 6px; }
  .onglet { flex: 1; padding: 6px 4px; font: inherit; font-size: 12px; cursor: pointer; border: none; border-radius: 4px;
            background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .onglet.actif { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .liste { display: flex; flex-direction: column; gap: 4px; }
  .element { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px; cursor: pointer; border: 2px solid transparent; }
  .element:hover { background: var(--vscode-list-hoverBackground); }
  .element.choisi { border-color: var(--vscode-focusBorder); }
  .element.indispo { opacity: .45; cursor: default; }
  .element canvas { border: none; box-shadow: none; width: 32px; height: 32px; flex-shrink: 0; cursor: inherit; }
  .element .nom { flex: 1; font-size: 13px; line-height: 1.25; }
  .element .petit { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .prix { font-weight: 600; white-space: nowrap; }
  button.action { padding: 6px 10px; font: inherit; font-size: 13px; cursor: pointer; border: none; border-radius: 4px; margin: 3px 3px 3px 0;
                  background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.action.secondaire { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .info { margin-top: 10px; padding: 8px 10px; border-radius: 6px; background: var(--vscode-textBlockQuote-background); font-size: 13px; }
  .info:empty { display: none; }
  .aide { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 6px 0; }
  .message { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 6px;
             background: #2b2118; color: #fff; font-size: 13px; opacity: 0; transition: opacity .3s; pointer-events: none; }
  .message.visible { opacity: .95; }
  .bulle { position: fixed; pointer-events: none; padding: 5px 8px; border-radius: 5px; background: rgba(30,20,12,.92); color: #fff; font-size: 12px; display: none; max-width: 240px; z-index: 5; }
</style>
</head>
<body>
<div class="ecran">
  <div class="terrain"><canvas id="ferme"></canvas></div>
  <div class="cote">
    <h2>🌻 Ma ferme</h2>
    <div id="stats"></div>
    <div class="onglets">
      <button class="onglet actif" data-onglet="graines">🌰 Graines</button>
      <button class="onglet" data-onglet="boutique">🛒 Boutique</button>
      <button class="onglet" data-onglet="range">🎒 Rangé</button>
    </div>
    <div id="contenu"></div>
    <div class="info" id="info"></div>
    <p class="aide">Clic sur une plante : la réviser, la déplacer. <b>Échap</b> ou clic droit : annuler.</p>
    <button class="action secondaire" id="photo">📸 Photo pour Obsidian</button>
  </div>
</div>
<div class="bulle" id="bulle"></div>
<div class="message" id="message"></div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
const S = ${sprites};
const T = 16, ZOOM = 3, CASE = T * ZOOM;
const canvas = document.getElementById('ferme');
const ctx = canvas.getContext('2d');
let vue = null;
let onglet = 'graines';
let main = null;     // ce que l'on tient : { genre: 'graine'|'plante'|'achat'|'deco', nom?, id?, article? }
let selection = null; // élément cliqué (fiche affichée)
let souris = null;   // case survolée
const cache = new Map();

// ---------------------------------------------------------------- sprites
function sprite(lignes, varieteNom) {
  const cle = lignes.join('') + '|' + (varieteNom || '');
  if (cache.has(cle)) return cache.get(cle);
  const c = document.createElement('canvas');
  c.width = T; c.height = T;
  const g = c.getContext('2d');
  const couleurs = Object.assign({}, S.PALETTE, S.VARIETES[varieteNom] || S.VARIETES.pommier);
  lignes.forEach((ligne, y) => {
    for (let x = 0; x < ligne.length; x++) {
      const ch = ligne[x];
      if (ch === '.' || !couleurs[ch]) continue;
      g.fillStyle = couleurs[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(cle, c);
  return c;
}

function hasard(x, y, n) { const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return v - Math.floor(v); }

function dessinerHerbe(x, y) {
  const sa = S.SAISONS[vue.saison] || S.SAISONS.printemps;
  ctx.fillStyle = sa.herbe;
  ctx.fillRect(x * CASE, y * CASE, CASE, CASE);
  for (let i = 0; i < 6; i++) {
    const px = Math.floor(hasard(x, y, i) * T), py = Math.floor(hasard(x, y, i + 9) * T);
    ctx.fillStyle = sa.sombre;
    ctx.fillRect(x * CASE + px * ZOOM, y * CASE + py * ZOOM, ZOOM, ZOOM * 2);
  }
  if (hasard(x, y, 40) < 0.35) {
    const px = Math.floor(hasard(x, y, 41) * 14) + 1, py = Math.floor(hasard(x, y, 42) * 14) + 1;
    ctx.fillStyle = sa.touches[Math.floor(hasard(x, y, 43) * sa.touches.length)];
    ctx.fillRect(x * CASE + px * ZOOM, y * CASE + py * ZOOM, ZOOM, ZOOM);
  }
}

function dessinerTerre(x, y) {
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(x * CASE + ZOOM, y * CASE + ZOOM * 2, CASE - ZOOM * 2, CASE - ZOOM * 3);
  ctx.fillStyle = '#5a3a22';
  for (const ly of [4, 8, 12]) ctx.fillRect(x * CASE + ZOOM * 2, y * CASE + ly * ZOOM, CASE - ZOOM * 4, ZOOM);
}

function dessinerChemin(x, y) {
  ctx.fillStyle = '#d8c39a';
  ctx.fillRect(x * CASE, y * CASE, CASE, CASE);
  for (let i = 0; i < 5; i++) {
    const px = Math.floor(hasard(x, y, i + 20) * 14) + 1, py = Math.floor(hasard(x, y, i + 30) * 14) + 1;
    ctx.fillStyle = i % 2 ? '#b8a27a' : '#efe2c2';
    ctx.fillRect(x * CASE + px * ZOOM, y * CASE + py * ZOOM, ZOOM * 2, ZOOM);
  }
}

function dessinerEtang(x, y) {
  const cx = x * CASE + CASE, cy = y * CASE + CASE;
  ctx.fillStyle = '#7a8a5a';
  ctx.beginPath(); ctx.ellipse(cx, cy, CASE - 4, CASE - 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f7fb8';
  ctx.beginPath(); ctx.ellipse(cx, cy, CASE - 12, CASE - 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5ab4e5';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy - 4, CASE - 30, CASE - 32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e8e41';
  for (const [dx, dy] of [[-20, 6], [14, -8], [22, 10]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 7, 0.3, Math.PI * 2); ctx.lineTo(cx + dx, cy + dy); ctx.fill(); }
  ctx.fillStyle = '#f7b6c8'; ctx.fillRect(cx + 12, cy - 11, 5, 5);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + 13, cy - 10, 2, 2);
}

function dessinerGrange(x, y) {
  const X = x * CASE, Y = y * CASE, L = CASE * 3, H = CASE * 2;
  ctx.fillStyle = '#5a2a22'; ctx.fillRect(X + 6, Y + 4, L - 12, 18);           // toit
  ctx.fillStyle = '#7a3a2e'; ctx.fillRect(X + 12, Y + 22, L - 24, 4);
  ctx.fillStyle = '#a83232'; ctx.fillRect(X + 12, Y + 26, L - 24, H - 30);       // murs
  ctx.fillStyle = '#8a2626';
  for (let i = X + 18; i < X + L - 12; i += 12) ctx.fillRect(i, Y + 26, 3, H - 30);
  const pX = X + L / 2 - 18, pY = Y + H - 40;                                    // porte
  ctx.fillStyle = '#f1e8d6'; ctx.fillRect(pX, pY, 36, 36);
  ctx.fillStyle = '#a83232'; ctx.fillRect(pX + 4, pY + 4, 28, 28);
  ctx.strokeStyle = '#f1e8d6'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(pX + 4, pY + 4); ctx.lineTo(pX + 32, pY + 32); ctx.moveTo(pX + 32, pY + 4); ctx.lineTo(pX + 4, pY + 32); ctx.stroke();
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(X + L / 2 - 8, Y + 30, 16, 12);        // lucarne
}

function taille(type) {
  if (type === 'plante') return [1, 1];
  const a = vue.boutique.find((b) => b.type === type);
  return a ? [a.largeur, a.hauteur] : [1, 1];
}

function dessinerDeco(d, x, y, fantome) {
  if (d.type === 'chemin') return dessinerChemin(x, y);
  if (d.type === 'etang') return dessinerEtang(x, y);
  if (d.type === 'grange') return dessinerGrange(x, y);
  const lignes = S.DECORATIONS[d.type];
  if (!lignes) return;
  ctx.drawImage(sprite(lignes, S.PALETTE_DECORATION[d.type]), x * CASE, y * CASE, CASE, CASE);
  if (d.type === 'lanterne' && !fantome) {
    const g = ctx.createRadialGradient(x * CASE + CASE / 2, y * CASE + 15, 2, x * CASE + CASE / 2, y * CASE + 15, CASE);
    g.addColorStop(0, 'rgba(255,220,120,.45)'); g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x * CASE - CASE / 2, y * CASE - CASE / 2, CASE * 2, CASE * 2);
  }
}

function dessinerPlante(p, x, y) {
  const fane = p.retard > 7 ? 'grayscale(.5) sepia(.7) brightness(.85)' : p.retard > 0 ? 'saturate(.45) sepia(.35)' : 'none';
  ctx.filter = fane;
  ctx.drawImage(sprite(S.STADES[Math.max(0, Math.min(6, p.niveau))], p.variete), x * CASE, y * CASE, CASE, CASE);
  ctx.filter = 'none';
  const soif = p.prochaine === null || p.retard > 0 || p.prochaine <= aujourdhui();
  if (soif) {                       // goutte d'eau : à arroser (à réviser)
    ctx.fillStyle = '#5ab4e5';
    ctx.fillRect(x * CASE + CASE - 12, y * CASE + 4, 6, 6);
    ctx.fillRect(x * CASE + CASE - 10, y * CASE + 1, 2, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x * CASE + CASE - 11, y * CASE + 5, 2, 2);
  }
  if (p.niveau === 6) {             // étincelle : récoltable
    ctx.fillStyle = '#fff4a3';
    ctx.fillRect(x * CASE + 4, y * CASE + 2, 2, 6); ctx.fillRect(x * CASE + 2, y * CASE + 4, 6, 2);
  }
}

function aujourdhui() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// ---------------------------------------------------------------- occupation (même règle que l'extension)
function occupe(sauf) {
  const cases = new Set();
  for (const p of vue.plantes) if (p.x !== null && p.nom !== sauf) cases.add(p.x + ',' + p.y);
  for (const d of vue.decorations) {
    if (d.x === null || d.id === sauf) continue;
    if (d.type === 'chemin') { cases.add('chemin:' + d.x + ',' + d.y); continue; }
    const [l, h] = taille(d.type);
    for (let i = 0; i < l; i++) for (let j = 0; j < h; j++) cases.add((d.x + i) + ',' + (d.y + j));
  }
  return cases;
}

function libre(type, x, y, sauf) {
  const [l, h] = taille(type);
  if (x < 0 || y < 0 || x + l > vue.largeur || y + h > vue.hauteur) return false;
  const o = occupe(sauf);
  if (type === 'chemin') return !o.has('chemin:' + x + ',' + y);
  for (let i = 0; i < l; i++) for (let j = 0; j < h; j++) if (o.has((x + i) + ',' + (y + j))) return false;
  return true;
}

function typeTenu() {
  if (!main) return null;
  if (main.genre === 'graine' || main.genre === 'plante') return 'plante';
  if (main.genre === 'achat') return main.article;
  const d = vue.decorations.find((x) => x.id === main.id);
  return d ? d.type : null;
}

// ---------------------------------------------------------------- dessin
function dessiner() {
  if (!vue) return;
  canvas.width = vue.largeur * CASE; canvas.height = vue.hauteur * CASE;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < vue.hauteur; y++) for (let x = 0; x < vue.largeur; x++) dessinerHerbe(x, y);
  const enMain = main && (main.genre === 'plante' || main.genre === 'deco') ? (main.nom || main.id) : null;
  for (const d of vue.decorations) if (d.type === 'chemin' && d.x !== null && d.id !== enMain) dessinerChemin(d.x, d.y);
  // Plantes et décorations, de haut en bas (celles du bas passent devant)
  const objets = [];
  for (const p of vue.plantes) if (p.x !== null && p.nom !== enMain) objets.push({ y: p.y, dessin: () => { dessinerTerre(p.x, p.y); dessinerPlante(p, p.x, p.y); } });
  for (const d of vue.decorations) if (d.type !== 'chemin' && d.x !== null && d.id !== enMain) objets.push({ y: d.y + taille(d.type)[1] - 1, dessin: () => dessinerDeco(d, d.x, d.y) });
  objets.sort((a, b) => a.y - b.y).forEach((o) => o.dessin());
  // Sélection
  if (selection && selection.x !== null) {
    const [l, h] = taille(selection.type || 'plante');
    ctx.strokeStyle = '#fff4a3'; ctx.lineWidth = 3;
    ctx.strokeRect(selection.x * CASE + 1.5, selection.y * CASE + 1.5, l * CASE - 3, h * CASE - 3);
  }
  // Ce que l'on tient, sous la souris
  if (main && souris) {
    const type = typeTenu();
    const [l, h] = taille(type);
    const ok = libre(type, souris.x, souris.y, main.nom || main.id);
    ctx.globalAlpha = 0.75;
    if (type === 'plante') {
      const p = vue.plantes.find((q) => q.nom === main.nom);
      dessinerTerre(souris.x, souris.y); if (p) dessinerPlante(p, souris.x, souris.y);
    } else dessinerDeco({ type }, souris.x, souris.y, true);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? 'rgba(120,255,120,.25)' : 'rgba(255,80,80,.35)';
    ctx.fillRect(souris.x * CASE, souris.y * CASE, l * CASE, h * CASE);
  }
}

// ---------------------------------------------------------------- panneau latéral
function vignette(dessin) {
  const c = document.createElement('canvas'); c.width = T; c.height = T;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(dessin, 0, 0);
  return c;
}

function apercuDeco(type) {
  if (S.DECORATIONS[type]) return vignette(sprite(S.DECORATIONS[type], S.PALETTE_DECORATION[type]));
  const c = document.createElement('canvas'); c.width = T; c.height = T;
  const g = c.getContext('2d');
  const couleurs = { chemin: ['#d8c39a', '#b8a27a'], etang: ['#2f7fb8', '#5ab4e5'], grange: ['#a83232', '#f1e8d6'] }[type] || ['#888', '#aaa'];
  g.fillStyle = couleurs[0]; g.fillRect(1, 3, 14, 11); g.fillStyle = couleurs[1]; g.fillRect(5, 6, 6, 5);
  return c;
}

function afficherStats() {
  const p = vue.prochain > vue.precedent ? Math.round(100 * (vue.gagnees - vue.precedent) / (vue.prochain - vue.precedent)) : 100;
  document.getElementById('stats').innerHTML =
    '<div class="stats">' +
      '<div class="stat">🪙 <b>' + vue.pieces + '</b> pièces</div>' +
      '<div class="stat">🔥 <b>' + vue.serie + '</b> jour(s)</div>' +
      '<div class="stat">💧 <b>' + vue.assoiffees + '</b> fanent</div>' +
      '<div class="stat">🍎 <b>' + vue.recoltables + '</b> mûres</div>' +
    '</div>' +
    '<div class="stat">🧑‍🌾 Fermier niveau <b>' + vue.niveau + '</b> · ' + vue.largeur + '×' + vue.hauteur + ' cases' +
      '<div class="barre"><div style="width:' + Math.max(0, Math.min(100, p)) + '%"></div></div>' +
      '<div class="petit">' + (vue.prochain - vue.gagnees) + ' 🪙 à gagner pour le niveau ' + (vue.niveau + 1) + ' (ferme plus grande)</div></div>';
}

function element(apercu, nom, droite, choisi, indispo, action) {
  const div = document.createElement('div');
  div.className = 'element' + (choisi ? ' choisi' : '') + (indispo ? ' indispo' : '');
  div.appendChild(apercu);
  const t = document.createElement('div'); t.className = 'nom'; t.innerHTML = nom; div.appendChild(t);
  if (droite) { const d = document.createElement('div'); d.className = 'prix'; d.innerHTML = droite; div.appendChild(d); }
  if (!indispo) div.onclick = action;
  return div;
}

const echapper = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function afficherContenu() {
  const zone = document.getElementById('contenu');
  zone.innerHTML = '';
  const liste = document.createElement('div'); liste.className = 'liste';
  if (onglet === 'graines') {
    const sac = vue.plantes.filter((p) => p.x === null);
    if (sac.length === 0) zone.innerHTML = '<p class="aide">Toutes tes notions sont plantées 🌱. Importe un nouveau CER pour recevoir des graines.</p>';
    else {
      const bouton = document.createElement('button');
      bouton.className = 'action'; bouton.textContent = '🌱 Tout planter (' + sac.length + ')';
      bouton.onclick = () => vscode.postMessage({ type: 'toutPlanter' });
      zone.appendChild(bouton);
      zone.insertAdjacentHTML('beforeend', '<p class="aide">Ou choisis une graine, puis clique sur une case de la ferme.</p>');
      for (const p of sac) liste.appendChild(element(vignette(sprite(S.STADES[p.niveau], p.variete)), echapper(p.titre) + '<div class="petit">' + echapper(p.prosit) + '</div>', '',
        main && main.genre === 'graine' && main.nom === p.nom, false, () => { main = { genre: 'graine', nom: p.nom }; selection = null; majTout(); }));
    }
  } else if (onglet === 'boutique') {
    for (const a of vue.boutique) {
      const indispo = !a.disponible;
      const droite = indispo ? '🔒 niv. ' + a.niveauRequis : a.prix + ' 🪙';
      liste.appendChild(element(apercuDeco(a.type), echapper(a.nom) + '<div class="petit">' + echapper(a.description) + (a.largeur > 1 ? ' (' + a.largeur + '×' + a.hauteur + ')' : '') + '</div>', droite,
        main && main.genre === 'achat' && main.article === a.type, indispo, () => {
          if (vue.pieces < a.prix) return montrer('Il te manque ' + (a.prix - vue.pieces) + ' 🪙. Révise pour en gagner !');
          main = { genre: 'achat', article: a.type }; selection = null; majTout();
        }));
    }
  } else {
    const ranges = vue.decorations.filter((d) => d.x === null);
    if (ranges.length === 0) zone.innerHTML = '<p class="aide">Rien de rangé. Clique sur une décoration de la ferme puis « Ranger » pour la mettre ici.</p>';
    for (const d of ranges) {
      const a = vue.boutique.find((b) => b.type === d.type);
      liste.appendChild(element(apercuDeco(d.type), echapper(a ? a.nom : d.type), '', main && main.id === d.id, false, () => { main = { genre: 'deco', id: d.id }; selection = null; majTout(); }));
    }
  }
  zone.appendChild(liste);
}

function afficherInfo() {
  const info = document.getElementById('info');
  if (main) {
    info.innerHTML = '✋ Clique sur une case pour poser. <b>Échap</b> pour annuler.';
    return;
  }
  if (!selection) { info.innerHTML = ''; return; }
  if (selection.genre === 'plante') {
    const p = vue.plantes.find((q) => q.nom === selection.nom);
    if (!p) { info.innerHTML = ''; return; }
    const etat = p.retard > 0 ? '💧 Fane depuis ' + p.retard + ' jour(s)' : (p.prochaine && p.prochaine > aujourdhui() ? 'Prochaine révision : ' + p.prochaine : '💧 À arroser aujourd’hui');
    info.innerHTML = '<b>' + echapper(p.titre) + '</b><br>' + p.emoji + ' ' + p.stade + ' · ' + echapper(p.prosit) + '<br><span class="petit">' + etat + '</span><br>' +
      '<button class="action" id="bReviser">🌱 Réviser</button><button class="action secondaire" id="bNote">📄 Note</button>' +
      '<button class="action secondaire" id="bDeplacer">✋ Déplacer</button><button class="action secondaire" id="bSac">🌰 Au sac</button>';
    document.getElementById('bReviser').onclick = () => vscode.postMessage({ type: 'reviser', nom: p.nom });
    document.getElementById('bNote').onclick = () => vscode.postMessage({ type: 'ouvrirNote', nom: p.nom });
    document.getElementById('bDeplacer').onclick = () => { main = { genre: 'plante', nom: p.nom }; selection = null; majTout(); };
    document.getElementById('bSac').onclick = () => { selection = null; vscode.postMessage({ type: 'deterrer', nom: p.nom }); };
  } else {
    const d = vue.decorations.find((q) => q.id === selection.id);
    const a = d && vue.boutique.find((b) => b.type === d.type);
    if (!d) { info.innerHTML = ''; return; }
    info.innerHTML = '<b>' + echapper(a ? a.nom : d.type) + '</b><br>' +
      '<button class="action secondaire" id="bDeplacer">✋ Déplacer</button><button class="action secondaire" id="bRanger">🎒 Ranger</button>';
    document.getElementById('bDeplacer').onclick = () => { main = { genre: 'deco', id: d.id }; selection = null; majTout(); };
    document.getElementById('bRanger').onclick = () => { selection = null; vscode.postMessage({ type: 'deplacerDeco', id: d.id, x: null, y: null }); };
  }
}

function majTout() { afficherStats(); afficherContenu(); afficherInfo(); dessiner(); }

let minuterieMessage = null;
function montrer(texte) {
  const m = document.getElementById('message');
  m.textContent = texte; m.classList.add('visible');
  clearTimeout(minuterieMessage); minuterieMessage = setTimeout(() => m.classList.remove('visible'), 2600);
}

// ---------------------------------------------------------------- souris
function caseSous(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.floor((ev.clientX - r.left) * (canvas.width / r.width) / CASE), y: Math.floor((ev.clientY - r.top) * (canvas.height / r.height) / CASE) };
}

function objetEn(x, y) {
  const p = vue.plantes.find((q) => q.x === x && q.y === y);
  if (p) return { genre: 'plante', nom: p.nom, x: p.x, y: p.y, type: 'plante' };
  const decos = vue.decorations.filter((d) => d.x !== null && x >= d.x && y >= d.y && x < d.x + taille(d.type)[0] && y < d.y + taille(d.type)[1]);
  const d = decos.find((q) => q.type !== 'chemin') || decos[0];
  return d ? { genre: 'deco', id: d.id, x: d.x, y: d.y, type: d.type } : null;
}

canvas.addEventListener('mousemove', (ev) => {
  souris = caseSous(ev);
  const bulle = document.getElementById('bulle');
  const p = !main && vue.plantes.find((q) => q.x === souris.x && q.y === souris.y);
  if (p) {
    bulle.style.display = 'block';
    bulle.style.left = (ev.clientX + 14) + 'px'; bulle.style.top = (ev.clientY + 14) + 'px';
    bulle.innerHTML = '<b>' + echapper(p.titre) + '</b><br>' + p.emoji + ' ' + p.stade + (p.retard > 0 ? '<br>💧 fane depuis ' + p.retard + ' j' : '');
  } else bulle.style.display = 'none';
  if (main) dessiner();
});
canvas.addEventListener('mouseleave', () => { souris = null; document.getElementById('bulle').style.display = 'none'; dessiner(); });

canvas.addEventListener('click', (ev) => {
  const c = caseSous(ev);
  if (!main) {
    selection = objetEn(c.x, c.y);
    afficherInfo(); dessiner();
    return;
  }
  const type = typeTenu();
  if (!libre(type, c.x, c.y, main.nom || main.id)) return montrer('Pas de place ici.');
  if (main.genre === 'graine' || main.genre === 'plante') {
    vscode.postMessage({ type: 'planter', nom: main.nom, x: c.x, y: c.y });
    // On enchaîne avec la graine suivante du sac
    const suivante = main.genre === 'graine' && vue.plantes.find((p) => p.x === null && p.nom !== main.nom);
    main = suivante ? { genre: 'graine', nom: suivante.nom } : null;
  } else if (main.genre === 'achat') {
    vscode.postMessage({ type: 'acheter', article: main.article, x: c.x, y: c.y });
    // On garde l'article en main pour en poser plusieurs (chemins, clôtures…)
  } else {
    vscode.postMessage({ type: 'deplacerDeco', id: main.id, x: c.x, y: c.y });
    main = null;
  }
});
canvas.addEventListener('contextmenu', (ev) => { ev.preventDefault(); main = null; majTout(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { main = null; selection = null; majTout(); } });

document.querySelectorAll('.onglet').forEach((b) => b.onclick = () => {
  onglet = b.dataset.onglet;
  document.querySelectorAll('.onglet').forEach((x) => x.classList.toggle('actif', x === b));
  afficherContenu();
});
document.getElementById('photo').onclick = () => {
  const ancien = selection; selection = null; main = null; dessiner();
  vscode.postMessage({ type: 'photo', image: canvas.toDataURL('image/png') });
  selection = ancien; dessiner();
};

window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.type === 'etat') {
    vue = m.vue;
    // Plus rien à poser (graine plantée, sac vide…) : on lâche
    if (main && main.genre === 'graine' && !vue.plantes.some((p) => p.nom === main.nom && p.x === null)) main = null;
    if (main && main.genre === 'achat' && vue.pieces < (vue.boutique.find((a) => a.type === main.article) || { prix: 0 }).prix) main = null;
    majTout();
  }
  if (m.type === 'erreur') { montrer('⚠️ ' + m.message); }
  if (m.type === 'info') { montrer(m.message); }
});
vscode.postMessage({ type: 'pret' });
</script>
</body>
</html>`;
}
