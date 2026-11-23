// Tableau de bord des statistiques (webview, graphiques SVG).
// Couleurs : bleu (une seule série) et rampe ordinale bleue en 4 paliers, validées en clair et en sombre.

import * as vscode from 'vscode';
import { calculerStatistiques, PALIERS } from '../core/statistiques';

export interface ActionsStats {
  reviserNotion(nom: string): void;
  reviserExamen(id: string): void;
  ajouterExamen(): void;
}

export class EcranStats {
  private static actuel?: EcranStats;
  private readonly panneau: vscode.WebviewPanel;

  static ouvrir(coffre: string, actions: ActionsStats): void {
    if (EcranStats.actuel) {
      EcranStats.actuel.panneau.reveal();
      EcranStats.actuel.envoyer();
      return;
    }
    EcranStats.actuel = new EcranStats(coffre, actions);
  }

  static actualiser(): void {
    EcranStats.actuel?.envoyer();
  }

  private constructor(private readonly coffre: string, actions: ActionsStats) {
    this.panneau = vscode.window.createWebviewPanel('forge.stats', '📊 Statistiques', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    this.panneau.webview.html = html(this.panneau.webview);
    this.panneau.webview.onDidReceiveMessage((m: { type: string; nom?: string; id?: string }) => {
      if (m.type === 'pret') this.envoyer();
      if (m.type === 'reviser' && m.nom) actions.reviserNotion(m.nom);
      if (m.type === 'reviserExamen' && m.id) actions.reviserExamen(m.id);
      if (m.type === 'ajouterExamen') actions.ajouterExamen();
    });
    this.panneau.onDidDispose(() => (EcranStats.actuel = undefined));
  }

  private envoyer(): void {
    this.panneau.webview.postMessage({ type: 'stats', stats: calculerStatistiques(this.coffre), paliers: PALIERS.map((p) => `${p.emoji} ${p.nom}`) });
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
  body {
    --serie-1: #2a78d6; --palier-0: #86b6ef; --palier-1: #3987e5; --palier-2: #1c5cab; --palier-3: #0d366b;
    --piste: #cde2fb; --grille: #e1e0d9; --axe: #c3c2b7; --discret: #898781; --hausse: #006300; --baisse: #d03b3b;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--vscode-foreground); margin: 0; font-size: 14px;
  }
  body.vscode-dark, body.vscode-high-contrast {
    --serie-1: #3987e5; --palier-0: #184f95; --palier-1: #2a78d6; --palier-2: #6da7ec; --palier-3: #b7d3f6;
    --piste: #104281; --grille: #2c2c2a; --axe: #383835; --discret: #898781; --hausse: #0ca30c;
  }
  .page { max-width: 1060px; margin: 0 auto; padding: 18px 24px 50px; }
  h1 { font-size: 1.5em; margin: 0 0 14px; }
  .tuiles { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .tuile, .carte { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 14px 16px; }
  .tuile .etiquette { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .tuile .valeur { font-size: 1.9em; font-weight: 600; margin-top: 2px; }
  .tuile .heros { font-size: 3.2em; font-weight: 600; line-height: 1.1; }
  .delta { font-size: 13px; }
  .delta.hausse { color: var(--hausse); }
  .delta.baisse { color: var(--baisse); }
  .grille2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .carte h2 { font-size: 1.05em; margin: 0 0 2px; }
  .carte .sous { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 10px; }
  .pleine { margin-bottom: 16px; }
  svg { display: block; overflow: visible; }
  svg text { fill: var(--discret); font-size: 11px; font-family: inherit; }
  svg .valeur { fill: var(--vscode-foreground); font-size: 12px; }
  .marque { cursor: default; }
  .marque:hover .tracé, .marque:focus .tracé { opacity: .8; }
  .marque:focus { outline: none; }
  .legende { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .legende span { display: inline-flex; align-items: center; gap: 6px; }
  .legende i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .ligne-jauge { margin: 8px 0; }
  .ligne-jauge .entete { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
  .jauge { height: 8px; border-radius: 4px; background: var(--piste); overflow: hidden; }
  .jauge div { height: 100%; border-radius: 4px; background: var(--serie-1); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  details { margin-top: 8px; font-size: 12px; }
  details summary { color: var(--vscode-descriptionForeground); cursor: pointer; }
  button.lien { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; font: inherit; }
  button.bouton { padding: 5px 12px; border: none; border-radius: 4px; cursor: pointer; font: inherit; font-size: 13px;
                  background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .vide { color: var(--vscode-descriptionForeground); font-size: 13px; }
  .bulle { position: fixed; pointer-events: none; display: none; padding: 6px 10px; border-radius: 6px; font-size: 12px; z-index: 10;
           background: var(--vscode-editorHoverWidget-background, #252526); color: var(--vscode-editorHoverWidget-foreground, #fff);
           border: 1px solid var(--vscode-editorHoverWidget-border, #454545); }
  .bulle b { font-size: 13px; }
  .bulle .titre { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="page" id="page"><p class="vide">Calcul des statistiques…</p></div>
<div class="bulle" id="bulle" role="tooltip"></div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const NS = 'http://www.w3.org/2000/svg';
const page = document.getElementById('page');
const bulle = document.getElementById('bulle');
const PALIERS_VAR = ['--palier-0', '--palier-1', '--palier-2', '--palier-3'];

function el(nom, attributs, parent) {
  const e = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attributs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function h(tag, texte, classe) { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; }

// Bulle d'information : valeur d'abord, libellé ensuite ; texte inséré avec textContent
function attacherBulle(cible, valeur, titre) {
  const montrer = (x, y) => {
    bulle.replaceChildren(h('b', valeur), document.createElement('br'), h('span', titre, 'titre'));
    bulle.style.display = 'block';
    bulle.style.left = Math.min(window.innerWidth - 220, x + 12) + 'px';
    bulle.style.top = (y + 12) + 'px';
  };
  cible.setAttribute('tabindex', '0');
  cible.setAttribute('aria-label', valeur + ' — ' + titre);
  cible.addEventListener('pointermove', (ev) => montrer(ev.clientX, ev.clientY));
  cible.addEventListener('focus', () => { const r = cible.getBoundingClientRect(); montrer(r.left + r.width / 2, r.top); });
  cible.addEventListener('pointerleave', () => bulle.style.display = 'none');
  cible.addEventListener('blur', () => bulle.style.display = 'none');
}

// Barre arrondie (4px) côté données, carrée côté base
function cheminBarre(x, y, l, haut, sens) {
  const r = Math.min(4, l / 2, haut);
  if (haut <= 0) return '';
  if (sens === 'haut') return 'M' + x + ',' + (y + haut) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + l - r) + 'Q' + (x + l) + ',' + y + ' ' + (x + l) + ',' + (y + r) + 'V' + (y + haut) + 'Z';
  // vers la droite : x = base, l = longueur, haut = épaisseur
  const rr = Math.min(4, l, haut / 2);
  return 'M' + x + ',' + y + 'H' + (x + l - rr) + 'Q' + (x + l) + ',' + y + ' ' + (x + l) + ',' + (y + rr) + 'V' + (y + haut - rr) + 'Q' + (x + l) + ',' + (y + haut) + ' ' + (x + l - rr) + ',' + (y + haut) + 'H' + x + 'Z';
}

function graduations(max) {
  if (max <= 0) return [0, 1];
  const brut = max / 4, p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 5, 10].map((k) => k * p).find((k) => k >= brut) || brut;
  const t = [];
  for (let v = 0; v <= max + pas * 0.001; v += pas) t.push(Math.round(v));
  if (t[t.length - 1] < max) t.push(t[t.length - 1] + pas);
  return t;
}

/** Histogramme en colonnes, une seule série. */
function colonnes(conteneur, donnees, options) {
  const largeur = conteneur.clientWidth || 460, hauteur = 170, gauche = 30, bas = 22;
  const svg = el('svg', { width: largeur, height: hauteur, role: 'img', 'aria-label': options.titre });
  const ticks = graduations(Math.max(1, ...donnees.map((d) => d.valeur)));
  const max = ticks[ticks.length - 1];
  const zone = hauteur - bas - 8, y = (v) => 8 + zone - (v / max) * zone;
  for (const t of ticks) {
    el('line', { x1: gauche, x2: largeur, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--axe)' : 'var(--grille)', 'stroke-width': 1 }, svg);
    el('text', { x: gauche - 6, y: y(t) + 4, 'text-anchor': 'end' }, svg).textContent = t;
  }
  const bande = (largeur - gauche) / donnees.length, l = Math.min(24, bande - 2);
  donnees.forEach((d, i) => {
    const x = gauche + i * bande + (bande - l) / 2;
    const g = el('g', { class: 'marque' }, svg);
    el('rect', { x: gauche + i * bande, y: 8, width: bande, height: zone, fill: 'transparent' }, g); // zone de survol
    if (d.valeur > 0) el('path', { class: 'tracé', d: cheminBarre(x, y(d.valeur), l, y(0) - y(d.valeur), 'haut'), fill: 'var(--serie-1)' }, g);
    attacherBulle(g, d.bulleValeur, d.bulleTitre);
    if (options.etiquettes(i)) el('text', { x: x + l / 2, y: hauteur - 6, 'text-anchor': 'middle' }, svg).textContent = d.label;
  });
  conteneur.appendChild(svg);
}

/** Barres horizontales empilées (paliers de maîtrise). */
function empilees(conteneur, lignes, couleurs, noms) {
  const largeur = conteneur.clientWidth || 460, gaucheL = 150, epaisseur = 20, pas = 32;
  const max = Math.max(1, ...lignes.map((l) => l.total));
  const svg = el('svg', { width: largeur, height: lignes.length * pas + 4, role: 'img', 'aria-label': 'Maîtrise par Prosit' });
  const zone = largeur - gaucheL - 40;
  lignes.forEach((ligne, j) => {
    const y = j * pas + 4;
    const t = el('text', { x: gaucheL - 8, y: y + 14, 'text-anchor': 'end' }, svg);
    t.textContent = ligne.label.length > 22 ? ligne.label.slice(0, 21) + '…' : ligne.label;
    let x = gaucheL;
    const segments = ligne.valeurs.map((v, i) => ({ v, i })).filter((s) => s.v > 0);
    segments.forEach((s, k) => {
      const longueur = (s.v / max) * zone;
      const dernier = k === segments.length - 1;
      const g = el('g', { class: 'marque' }, svg);
      const l = Math.max(1, longueur - (dernier ? 0 : 2)); // 2px d'écart entre segments
      el('path', { class: 'tracé', d: dernier ? cheminBarre(x, y, l, epaisseur, 'droite') : 'M' + x + ',' + y + 'h' + l + 'v' + epaisseur + 'h' + -l + 'Z', fill: 'var(' + couleurs[s.i] + ')' }, g);
      attacherBulle(g, s.v + ' notion' + (s.v > 1 ? 's' : ''), noms[s.i] + ' · ' + ligne.label);
      x += longueur;
    });
    el('text', { x: x + 6, y: y + 14, class: 'valeur' }, svg).textContent = ligne.total;
  });
  conteneur.appendChild(svg);
}

/** Barres horizontales simples (taux de réussite). */
function horizontales(conteneur, lignes) {
  const largeur = conteneur.clientWidth || 460, gaucheL = 170, epaisseur = 18, pas = 28;
  const svg = el('svg', { width: largeur, height: lignes.length * pas + 4, role: 'img', 'aria-label': 'Réussite par type d’exercice' });
  const zone = largeur - gaucheL - 90;
  el('line', { x1: gaucheL, x2: gaucheL, y1: 0, y2: lignes.length * pas, stroke: 'var(--axe)' }, svg);
  lignes.forEach((ligne, j) => {
    const y = j * pas + 4;
    el('text', { x: gaucheL - 8, y: y + 13, 'text-anchor': 'end' }, svg).textContent = ligne.label;
    const g = el('g', { class: 'marque' }, svg);
    const l = (ligne.valeur / 100) * zone;
    el('rect', { x: gaucheL, y: y - 4, width: zone + 80, height: pas, fill: 'transparent' }, g);
    if (l > 0) el('path', { class: 'tracé', d: cheminBarre(gaucheL, y, l, epaisseur, 'droite'), fill: 'var(--serie-1)' }, g);
    el('text', { x: gaucheL + l + 6, y: y + 13, class: 'valeur' }, svg).textContent = ligne.valeur + ' % (' + ligne.detail + ')';
    attacherBulle(g, ligne.valeur + ' % de réussite', ligne.label + ' · ' + ligne.detail + ' exercice(s)');
  });
  conteneur.appendChild(svg);
}

function tableau(entetes, lignes) {
  const d = document.createElement('details');
  d.appendChild(h('summary', 'Voir en tableau'));
  const t = document.createElement('table');
  const tr = document.createElement('tr');
  entetes.forEach((e) => tr.appendChild(h('th', e)));
  t.appendChild(tr);
  for (const l of lignes) {
    const r = document.createElement('tr');
    l.forEach((v, i) => r.appendChild(h('td', String(v), i > 0 && typeof v === 'number' ? 'n' : '')));
    t.appendChild(r);
  }
  d.appendChild(t);
  return d;
}

function carte(titre, sous) {
  const c = h('div', undefined, 'carte');
  c.appendChild(h('h2', titre));
  if (sous) c.appendChild(h('div', sous, 'sous'));
  return c;
}

function jauge(parent, libelle, valeur, total) {
  const l = h('div', undefined, 'ligne-jauge');
  const e = h('div', undefined, 'entete');
  e.appendChild(h('span', libelle));
  e.appendChild(h('span', total ? valeur + ' / ' + total : '—'));
  l.appendChild(e);
  const j = h('div', undefined, 'jauge');
  const f = document.createElement('div');
  f.style.width = (total ? Math.round(100 * valeur / total) : 0) + '%';
  j.appendChild(f);
  j.setAttribute('role', 'meter'); j.setAttribute('aria-valuenow', valeur); j.setAttribute('aria-valuemax', total);
  l.appendChild(j);
  parent.appendChild(l);
}

const jourCourt = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
const jourLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function afficher(s, paliers) {
  page.replaceChildren();
  page.appendChild(h('h1', '📊 Statistiques'));

  // Tuiles : un seul chiffre héros
  const tuiles = h('div', undefined, 'tuiles');
  const heros = h('div', undefined, 'tuile');
  heros.appendChild(h('div', 'Notions maîtrisées (🌳 et plus)', 'etiquette'));
  heros.appendChild(h('div', s.maitrisees + ' / ' + s.totalNotions, 'heros'));
  tuiles.appendChild(heros);
  const tuile = (etiquette, valeur, delta) => {
    const t = h('div', undefined, 'tuile');
    t.appendChild(h('div', etiquette, 'etiquette'));
    t.appendChild(h('div', valeur, 'valeur'));
    if (delta) t.appendChild(delta);
    tuiles.appendChild(t);
  };
  tuile('Série en cours', '🔥 ' + s.serie + ' j');
  const ecart = s.exercicesSemaine - s.exercicesSemainePrecedente;
  const delta = h('div', (ecart > 0 ? '▲ +' : ecart < 0 ? '▼ ' : '= ') + ecart + ' vs semaine précédente', 'delta ' + (ecart > 0 ? 'hausse' : ecart < 0 ? 'baisse' : ''));
  tuile('Exercices sur 7 jours', String(s.exercicesSemaine), delta);
  tuile('Réussite sur 30 jours', s.reussite30 === null ? '—' : s.reussite30 + ' %');
  page.appendChild(tuiles);

  // Activité + prévision
  const g1 = h('div', undefined, 'grille2');
  const cActivite = carte('Exercices par jour', '30 derniers jours');
  g1.appendChild(cActivite);
  const cPrevision = carte('Révisions prévues', '7 prochains jours (aujourd’hui inclut les retards)');
  g1.appendChild(cPrevision);
  page.appendChild(g1);
  colonnes(cActivite, s.activite.map((a) => ({ valeur: a.total, label: jourCourt(a.date), bulleValeur: a.total + ' exercice(s), ' + a.reussis + ' réussi(s)', bulleTitre: jourLong(a.date) })),
    { titre: 'Exercices par jour', etiquettes: (i) => i % 7 === 1 || i === 29 });
  cActivite.appendChild(tableau(['Jour', 'Exercices', 'Réussis'], s.activite.map((a) => [jourCourt(a.date), a.total, a.reussis])));
  colonnes(cPrevision, s.prevision.map((p, i) => ({ valeur: p.nombre, label: i === 0 ? 'auj.' : jourCourt(p.date), bulleValeur: p.nombre + ' notion(s) à revoir', bulleTitre: jourLong(p.date) })),
    { titre: 'Révisions prévues', etiquettes: () => true });
  cPrevision.appendChild(tableau(['Jour', 'Notions'], s.prevision.map((p) => [jourCourt(p.date), p.nombre])));

  // Maîtrise par Prosit (rampe ordinale, légende obligatoire)
  const cMaitrise = carte('Maîtrise par Prosit', 'Nombre de notions à chaque palier de croissance');
  cMaitrise.classList.add('pleine');
  const legende = h('div', undefined, 'legende');
  paliers.forEach((p, i) => { const sp = document.createElement('span'); const c = document.createElement('i'); c.style.background = 'var(' + PALIERS_VAR[i] + ')'; sp.appendChild(c); sp.appendChild(document.createTextNode(p)); legende.appendChild(sp); });
  cMaitrise.appendChild(legende);
  page.appendChild(cMaitrise);
  if (s.maitriseParProsit.length) {
    empilees(cMaitrise, s.maitriseParProsit.map((m) => ({ label: m.prosit, valeurs: m.paliers, total: m.total })), PALIERS_VAR, paliers);
    cMaitrise.appendChild(tableau(['Prosit', ...paliers, 'Total'], s.maitriseParProsit.map((m) => [m.prosit, ...m.paliers, m.total])));
  } else cMaitrise.appendChild(h('p', 'Importe tes CER pour voir ta progression.', 'vide'));

  // Réussite par type + AAV / CER
  const g2 = h('div', undefined, 'grille2');
  const cTypes = carte('Réussite par type d’exercice', 'Depuis le début');
  g2.appendChild(cTypes);
  const cAav = carte('Objectifs (AAV) prouvés', 'Notions qui ont réuni toutes les preuves demandées');
  g2.appendChild(cAav);
  page.appendChild(g2);
  if (s.parType.length) {
    horizontales(cTypes, s.parType.map((t) => ({ label: t.libelle, valeur: t.taux, detail: t.total })));
    cTypes.appendChild(tableau(['Type', 'Exercices', 'Réussis', 'Taux (%)'], s.parType.map((t) => [t.libelle, t.total, t.reussis, t.taux])));
  } else cTypes.appendChild(h('p', 'Pas encore d’exercice : lance une séance (Ctrl+Alt+R).', 'vide'));
  const noms = { 2: '[2] Comprendre — explication', 3: '[3] Mettre en œuvre — + code', 5: '[5] Maîtriser — + long et papier' };
  for (const a of s.aav) jauge(cAav, noms[a.niveau], a.prouvees, a.total);
  cAav.appendChild(h('h2', 'Tableaux de validation des CER'));
  if (s.cer.length) for (const c of s.cer) jauge(cAav, c.prosit, c.validees, c.total);
  else cAav.appendChild(h('p', 'Aucune piste de solution.', 'vide'));

  // Fragiles + examens
  const g3 = h('div', undefined, 'grille2');
  const cFragiles = carte('Notions fragiles', 'Souvent ratées ou en retard');
  g3.appendChild(cFragiles);
  const cExamens = carte('Examens à venir');
  g3.appendChild(cExamens);
  page.appendChild(g3);
  if (s.fragiles.length) {
    const t = document.createElement('table');
    const e = document.createElement('tr');
    ['Notion', 'Échecs', 'Retard', ''].forEach((x) => e.appendChild(h('th', x)));
    t.appendChild(e);
    for (const f of s.fragiles) {
      const r = document.createElement('tr');
      r.appendChild(h('td', f.titre));
      r.appendChild(h('td', String(f.echecs), 'n'));
      r.appendChild(h('td', f.retard ? f.retard + ' j' : '—', 'n'));
      const td = document.createElement('td');
      const b = h('button', 'Réviser', 'lien');
      b.onclick = () => vscode.postMessage({ type: 'reviser', nom: f.nom });
      td.appendChild(b); r.appendChild(td); t.appendChild(r);
    }
    cFragiles.appendChild(t);
  } else cFragiles.appendChild(h('p', 'Aucune notion fragile pour l’instant 💪', 'vide'));
  if (s.examens.length) {
    for (const x of s.examens) {
      const bloc = h('div', undefined, 'ligne-jauge');
      bloc.appendChild(h('div', '📅 ' + x.titre + ' — ' + (x.jours === 0 ? 'aujourd’hui' : 'dans ' + x.jours + ' jour(s)') + ' · ' + x.type));
      cExamens.appendChild(bloc);
      jauge(cExamens, 'Notions du programme au stade 🪴 ou plus', x.pretes, x.programme);
      const b = h('button', '🌱 Réviser le programme', 'lien');
      b.onclick = () => vscode.postMessage({ type: 'reviserExamen', id: x.id });
      cExamens.appendChild(b);
    }
  } else cExamens.appendChild(h('p', 'Aucun examen prévu.', 'vide'));
  const ajout = h('button', '➕ Ajouter un examen', 'bouton');
  ajout.style.marginTop = '14px';
  ajout.style.display = 'block';
  ajout.onclick = () => vscode.postMessage({ type: 'ajouterExamen' });
  cExamens.appendChild(ajout);
}

let dernier = null;
window.addEventListener('message', (ev) => {
  if (ev.data.type === 'stats') { dernier = ev.data; afficher(ev.data.stats, ev.data.paliers); }
});
window.addEventListener('resize', () => { if (dernier) afficher(dernier.stats, dernier.paliers); });
vscode.postMessage({ type: 'pret' });
</script>
</body>
</html>`;
}
