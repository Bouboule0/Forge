// Petite fenêtre « Emploi du temps » dans la barre latérale (vue webview).

import * as fs from 'fs';
import * as vscode from 'vscode';
import { coursDuJour, type Cours } from '../core/emploiDuTemps';
import { cheminDossier, lireNote } from '../core/coffre';
import { ajouterJours } from '../core/repetition';
import { aujourdhui, normaliser } from '../core/texte';
import { coffreActuel } from '../config';
import { lundiDe, type EmploiDuTemps } from '../edt';

export interface ActionsEmploiDuTemps {
  /** Réviser les Prosits d'un module (le cours du jour). */
  reviserProsits(prosits: string[], titre: string): void;
}

/** Prosits dont le module correspond au cours (« Programmation orientée objet » ↔ « POO - Programmation orientée objet »…). */
export function prositsDuCours(c: Pick<Cours, 'titre' | 'module'>, prosits: Array<{ nom: string; module: string }>): string[] {
  const cles = [c.module, c.titre].map(normaliser).filter((x) => x.length >= 3);
  return prosits
    .filter((p) => {
      const m = normaliser(p.module);
      return m.length >= 3 && cles.some((k) => k.includes(m) || m.includes(k));
    })
    .map((p) => p.nom);
}

function lireProsits(): Array<{ nom: string; module: string }> {
  const coffre = coffreActuel();
  if (!coffre) return [];
  const dossier = cheminDossier(coffre, 'prosits');
  if (!fs.existsSync(dossier)) return [];
  return fs
    .readdirSync(dossier)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ nom: f.slice(0, -3), module: String(lireNote(`${dossier}/${f}`).data.module ?? '').replace(/\[\[|\]\]/g, '') }));
}

export class VueEmploiDuTemps implements vscode.WebviewViewProvider {
  static readonly id = 'forge.emploiDuTemps';
  private vue?: vscode.WebviewView;
  private jour = aujourdhui();

  constructor(private readonly edt: EmploiDuTemps, private readonly actions: ActionsEmploiDuTemps) {
    edt.surChangement(() => this.envoyer());
  }

  resolveWebviewView(vue: vscode.WebviewView): void {
    this.vue = vue;
    vue.webview.options = { enableScripts: true };
    vue.webview.html = html(vue.webview);
    vue.webview.onDidReceiveMessage(async (m: { type: string; jour?: string; prosits?: string[]; titre?: string }) => {
      if (m.type === 'pret') this.envoyer();
      if (m.type === 'jour' && m.jour) {
        this.jour = m.jour;
        this.envoyer();
      }
      if (m.type === 'actualiser') await this.edt.actualiser(true);
      if (m.type === 'configurer') await this.edt.configurer();
      if (m.type === 'reviser' && m.prosits?.length) this.actions.reviserProsits(m.prosits, m.titre ?? 'Cours');
    });
    vue.onDidChangeVisibility(() => vue.visible && this.envoyer());
  }

  private envoyer(): void {
    if (!this.vue) return;
    const lundi = lundiDe(this.jour);
    const prosits = lireProsits();
    const semaine = Array.from({ length: 5 }, (_, i) => {
      const jour = ajouterJours(lundi, i);
      return { jour, nombre: coursDuJour(this.edt.cours, jour).length };
    });
    this.vue.webview.postMessage({
      type: 'etat',
      configure: this.edt.configure(),
      erreur: this.edt.erreur,
      misAJour: this.edt.misAJour,
      aujourdhui: aujourdhui(),
      jour: this.jour,
      semaine,
      cours: coursDuJour(this.edt.cours, this.jour).map((c) => ({ ...c, prosits: prositsDuCours(c, prosits) })),
    });
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
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); padding: 6px 10px 12px; margin: 0; }
  .nav { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .nav .titre { flex: 1; text-align: center; font-weight: 600; text-transform: capitalize; }
  button { font: inherit; cursor: pointer; border: none; border-radius: 3px; }
  .icone { background: transparent; color: var(--vscode-foreground); padding: 2px 6px; }
  .icone:hover { background: var(--vscode-toolbar-hoverBackground); }
  .jours { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; margin-bottom: 10px; }
  .jours button { padding: 4px 0; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); font-size: 12px; line-height: 1.2; }
  .jours button.actif { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .jours button.auj { outline: 1px solid var(--vscode-focusBorder); }
  .jours small { display: block; opacity: .75; font-size: 10px; }
  .cours { border-left: 3px solid var(--vscode-textLink-foreground); padding: 6px 8px; margin-bottom: 8px; border-radius: 3px;
           background: var(--vscode-sideBar-background, transparent); box-shadow: 0 0 0 1px var(--vscode-panel-border) inset; }
  .cours.passe { opacity: .55; }
  .cours.maintenant { border-left-color: #0ca30c; }
  .heure { font-weight: 600; font-variant-numeric: tabular-nums; }
  .badge { font-size: 10px; padding: 1px 5px; border-radius: 8px; background: #0ca30c; color: #fff; margin-left: 4px; }
  .titre-cours { margin: 2px 0; }
  .detail { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .barre { height: 3px; background: var(--vscode-panel-border); border-radius: 2px; margin-top: 5px; overflow: hidden; }
  .barre div { height: 100%; background: #0ca30c; }
  .lien { background: none; color: var(--vscode-textLink-foreground); padding: 0; margin-top: 3px; font-size: 12px; }
  .vide, .pied { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .pied { margin-top: 10px; display: flex; align-items: center; gap: 6px; }
  .erreur { color: var(--vscode-errorForeground); font-size: 12px; margin: 6px 0; }
  .principal { background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 6px 10px; margin-top: 8px; width: 100%; }
</style>
</head>
<body>
<div id="contenu"><p class="vide">Chargement…</p></div>
<script nonce="${n}">
const vscode = acquireVsCodeApi();
const contenu = document.getElementById('contenu');
const h = (tag, texte, classe) => { const e = document.createElement(tag); if (texte !== undefined) e.textContent = texte; if (classe) e.className = classe; return e; };
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const date = (j) => new Date(j + 'T12:00:00');
const decaler = (j, n) => { const d = date(j); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let etat = null;

function afficher() {
  const e = etat;
  contenu.replaceChildren();
  if (!e.configure) {
    contenu.appendChild(h('p', 'Affiche ici ton emploi du temps CESI : depuis l’ENT (identifiants) ou un lien iCal.', 'vide'));
    const b = h('button', '📅 Configurer mon emploi du temps', 'principal');
    b.onclick = () => vscode.postMessage({ type: 'configurer' });
    contenu.appendChild(b);
    return;
  }
  // Navigation
  const nav = h('div', undefined, 'nav');
  const prec = h('button', '‹', 'icone'); prec.title = 'Jour précédent';
  const suiv = h('button', '›', 'icone'); suiv.title = 'Jour suivant';
  const titre = h('span', date(e.jour).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), 'titre');
  prec.onclick = () => vscode.postMessage({ type: 'jour', jour: decaler(e.jour, date(e.jour).getDay() === 1 ? -3 : -1) });
  suiv.onclick = () => vscode.postMessage({ type: 'jour', jour: decaler(e.jour, date(e.jour).getDay() === 5 ? 3 : 1) });
  nav.append(prec, titre, suiv);
  contenu.appendChild(nav);
  // Jours de la semaine
  const jours = h('div', undefined, 'jours');
  for (const s of e.semaine) {
    const b = h('button', date(s.jour).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''));
    b.appendChild(h('small', s.nombre ? s.nombre + ' cours' : '—'));
    if (s.jour === e.jour) b.classList.add('actif');
    if (s.jour === e.aujourdhui) b.classList.add('auj');
    b.onclick = () => vscode.postMessage({ type: 'jour', jour: s.jour });
    jours.appendChild(b);
  }
  contenu.appendChild(jours);
  if (e.erreur) contenu.appendChild(h('div', '⚠️ ' + e.erreur, 'erreur'));
  // Cours du jour
  if (e.cours.length === 0) contenu.appendChild(h('p', 'Pas de cours ce jour-là 🌿', 'vide'));
  const maintenant = Date.now();
  for (const c of e.cours) {
    const d = Date.parse(c.debut), f = Date.parse(c.fin);
    const carte = h('div', undefined, 'cours');
    if (f < maintenant) carte.classList.add('passe');
    const encours = d <= maintenant && maintenant < f;
    if (encours) carte.classList.add('maintenant');
    const ligne = h('div', c.journee ? 'Toute la journée' : heure(c.debut) + ' – ' + heure(c.fin), 'heure');
    if (encours) ligne.appendChild(h('span', 'en cours', 'badge'));
    carte.appendChild(ligne);
    carte.appendChild(h('div', c.titre, 'titre-cours'));
    const details = [c.salles.join(', '), c.intervenants.join(', ')].filter(Boolean).join(' · ');
    if (details) carte.appendChild(h('div', details, 'detail'));
    if (encours) {
      const barre = h('div', undefined, 'barre');
      const rempli = document.createElement('div');
      rempli.style.width = Math.round(100 * (maintenant - d) / (f - d)) + '%';
      barre.appendChild(rempli);
      carte.appendChild(barre);
    }
    if (c.prosits.length) {
      const r = h('button', '🌱 Réviser ce module (' + c.prosits.length + ' Prosit' + (c.prosits.length > 1 ? 's' : '') + ')', 'lien');
      r.onclick = () => vscode.postMessage({ type: 'reviser', prosits: c.prosits, titre: c.module || c.titre });
      carte.appendChild(r);
    }
    contenu.appendChild(carte);
  }
  // Pied : dernière mise à jour
  const pied = h('div', undefined, 'pied');
  const maj = e.misAJour ? new Date(e.misAJour) : null;
  pied.appendChild(h('span', maj ? 'À jour : ' + maj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + heure(e.misAJour) : 'Jamais mis à jour'));
  const act = h('button', '🔄', 'icone'); act.title = 'Actualiser';
  act.onclick = () => { act.disabled = true; act.textContent = '⏳'; vscode.postMessage({ type: 'actualiser' }); };
  const conf = h('button', '⚙️', 'icone'); conf.title = 'Configurer';
  conf.onclick = () => vscode.postMessage({ type: 'configurer' });
  pied.append(act, conf);
  contenu.appendChild(pied);
}

window.addEventListener('message', (ev) => { if (ev.data.type === 'etat') { etat = ev.data; afficher(); } });
// La barre de progression du cours en cours avance toute seule
setInterval(() => { if (etat) afficher(); }, 60000);
vscode.postMessage({ type: 'pret' });
</script>
</body>
</html>`;
}
