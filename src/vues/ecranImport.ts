// Écran de validation de l'import : l'utilisateur vérifie, renomme, fusionne ou ignore
// les Prosits et notions détectés avant que quoi que ce soit soit écrit dans le coffre.

import * as vscode from 'vscode';
import * as path from 'path';
import type { PlanImport } from '../core/planImport';

interface ReponseProsit {
  index: number;
  numero: number;
  titre: string;
  module: string;
  remplacer: boolean;
}

interface ReponseNotion {
  id: string;
  nom: string;
  inclure: boolean;
  fusionnerDans: string | null;
}

type Message = { type: 'valider'; prosits: ReponseProsit[]; notions: ReponseNotion[] } | { type: 'annuler' };

export function afficherEcranImport(plan: PlanImport): Promise<PlanImport | undefined> {
  const panneau = vscode.window.createWebviewPanel('forge.import', 'Forge — Import', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });

  const donnees = donneesEcran(plan);

  panneau.webview.html = html(panneau.webview, donnees);

  return new Promise((resolve) => {
    let fini = false;
    panneau.webview.onDidReceiveMessage((m: Message) => {
      if (m.type === 'annuler') {
        fini = true;
        resolve(undefined);
        panneau.dispose();
        return;
      }
      for (const r of m.prosits) {
        const p = plan.prosits.find((x) => x.index === r.index);
        if (!p) continue;
        p.numero = Math.max(1, Math.round(r.numero)) || p.numero;
        p.titre = r.titre.trim();
        p.module = r.module.trim();
        p.remplacer = r.remplacer;
      }
      for (const r of m.notions) {
        const n = plan.notions.find((x) => x.id === r.id);
        if (!n) continue;
        const nom = r.nom.trim();
        if (nom && nom !== n.nom) {
          if (!n.autresNoms.includes(n.nom) && !n.existante) n.autresNoms.push(n.nom);
          n.nom = nom;
        }
        n.inclure = r.inclure;
        n.fusionnerDans = r.fusionnerDans || null;
      }
      fini = true;
      resolve(plan);
      panneau.dispose();
    });
    panneau.onDidDispose(() => {
      if (!fini) resolve(undefined);
    });
  });
}

export function donneesEcran(plan: PlanImport) {
  return {
    prosits: plan.prosits.map((p) => ({
      ...p,
      fichier: path.basename(p.fichierSource),
      type: plan.analyses[p.index].type,
      avertissements: plan.analyses[p.index].avertissements,
      nbAav: plan.analyses[p.index].aav.length,
      nbPistes: plan.analyses[p.index].pistes.length,
      nbImages: plan.analyses[p.index].images.length,
    })),
    notions: plan.notions.map((n) => ({
      id: n.id,
      nom: n.nom,
      inclure: n.inclure,
      origine: n.origine,
      existante: n.existante,
      autresNoms: n.autresNoms,
      prosits: n.prosits.map((i) => plan.prosits[i]?.numero),
      aav: n.aav.map((a) => a.aav.niveau),
      aDefinition: n.definitions.length > 0,
    })),
  };
}

function nonce(): string {
  let texte = '';
  const possibles = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) texte += possibles.charAt(Math.floor(Math.random() * possibles.length));
  return texte;
}

export function html(webview: Pick<vscode.Webview, "cspSource">, donnees: unknown): string {
  const n = nonce();
  // JSON injecté dans un <script> : on neutralise « </script> »
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 24px 80px; }
  h1 { font-size: 1.6em; margin-bottom: 0; }
  h2 { margin-top: 28px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  .aide { color: var(--vscode-descriptionForeground); margin-top: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: middle; }
  th { font-weight: 600; color: var(--vscode-descriptionForeground); position: sticky; top: 0; background: var(--vscode-editor-background); }
  input[type=text], input[type=number], select {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); padding: 3px 5px; width: 100%; box-sizing: border-box;
  }
  input[type=number] { width: 60px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 0.85em; white-space: nowrap;
           background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .nouveau { background: #2e7d32; color: white; }
  .existe { background: #1565c0; color: white; }
  .ignore { opacity: 0.45; }
  .fusion td.nom input { text-decoration: line-through; }
  .avert { color: var(--vscode-editorWarning-foreground); font-size: 0.9em; }
  .barre { position: fixed; bottom: 0; left: 0; right: 0; padding: 10px 24px; display: flex; gap: 10px; align-items: center;
           background: var(--vscode-editor-background); border-top: 1px solid var(--vscode-panel-border); }
  .barre .resume { flex: 1; color: var(--vscode-descriptionForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; cursor: pointer; }
  button.secondaire { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .outils { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
  .outils input { max-width: 300px; }
  small { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<h1>📥 Import dans ton second cerveau</h1>
<p class="aide">Vérifie ce que Forge a trouvé. Rien n'est écrit dans le coffre avant que tu cliques sur <b>Importer</b>.</p>

<h2>Prosits</h2>
<table id="prosits">
  <thead><tr><th>N°</th><th>Titre</th><th>Module</th><th>Contenu détecté</th><th>État</th></tr></thead>
  <tbody></tbody>
</table>

<h2>Notions</h2>
<p class="aide">
  🔑 = mot-clé du Prosit · 🎯 = objectif (AAV) sans mot-clé correspondant — renomme-le si besoin.<br>
  Pour réunir deux notions (ex. « Virtual Fonction Table » et « VFT »), choisis la notion cible dans <b>Fusionner dans</b>.
</p>
<div class="outils">
  <input type="text" id="filtre" placeholder="🔍 Filtrer les notions…">
  <button class="secondaire" id="toutCocher">Tout cocher</button>
  <button class="secondaire" id="toutDecocher">Tout décocher</button>
</div>
<table id="notions">
  <thead><tr><th></th><th>Nom de la notion</th><th>Source</th><th>Prosits</th><th>AAV</th><th>État</th><th>Fusionner dans</th></tr></thead>
  <tbody></tbody>
</table>

<div class="barre">
  <span class="resume" id="resume"></span>
  <button class="secondaire" id="annuler">Annuler</button>
  <button id="importer">Importer</button>
</div>

<script nonce="${n}">
const vscode = acquireVsCodeApi();
const donnees = ${json};
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Prosits
const corpsProsits = document.querySelector('#prosits tbody');
for (const p of donnees.prosits) {
  const tr = document.createElement('tr');
  tr.dataset.index = p.index;
  const etat = p.existeDeja
    ? '<span class="badge existe">existe déjà</span><br><label><input type="checkbox" class="remplacer"' + (p.remplacer ? ' checked' : '') + '> remplacer la note</label>'
    : '<span class="badge nouveau">nouveau</span>';
  tr.innerHTML =
    '<td><input type="number" class="numero" min="1" value="' + p.numero + '"></td>' +
    '<td><input type="text" class="titre" value="' + echapper(p.titre) + '" placeholder="Titre du Prosit"><br><small>' + echapper(p.fichier) + (p.type === 'prosit_aller' ? ' (Prosit Aller)' : '') + '</small></td>' +
    '<td><input type="text" class="module" value="' + echapper(p.module) + '"></td>' +
    '<td><small>' + p.nbAav + ' AAV · ' + p.nbPistes + ' pistes · ' + p.nbImages + ' images</small>' +
      (p.avertissements.length ? '<div class="avert">⚠️ ' + p.avertissements.map(echapper).join('<br>⚠️ ') + '</div>' : '') + '</td>' +
    '<td>' + etat + '</td>';
  corpsProsits.appendChild(tr);
}

// --- Notions
const corpsNotions = document.querySelector('#notions tbody');
for (const n of donnees.notions) {
  const tr = document.createElement('tr');
  tr.dataset.id = n.id;
  const etat = n.existante ? '<span class="badge existe">mise à jour</span>' : '<span class="badge nouveau">nouvelle</span>';
  tr.innerHTML =
    '<td><input type="checkbox" class="inclure"' + (n.inclure ? ' checked' : '') + '></td>' +
    '<td class="nom"><input type="text" class="nom" value="' + echapper(n.nom) + '">' +
      (n.autresNoms.length ? '<br><small>aussi : ' + n.autresNoms.map(echapper).join(', ') + '</small>' : '') + '</td>' +
    '<td>' + (n.origine === 'aav' ? '🎯 AAV' : '🔑 mot-clé') + (n.aDefinition ? '' : '<br><small>sans définition</small>') + '</td>' +
    '<td>' + n.prosits.map((x) => 'P' + String(x).padStart(2, '0')).join(', ') + '</td>' +
    '<td>' + (n.aav.length ? '[' + Math.max(...n.aav) + ']' : '—') + '</td>' +
    '<td>' + etat + '</td>' +
    '<td><select class="fusion"><option value="">—</option></select></td>';
  corpsNotions.appendChild(tr);
}

function lignesNotions() { return [...corpsNotions.querySelectorAll('tr')]; }

function remplirFusions() {
  const noms = lignesNotions().map((tr) => ({ id: tr.dataset.id, nom: tr.querySelector('input.nom').value }));
  noms.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  for (const tr of lignesNotions()) {
    const select = tr.querySelector('select.fusion');
    const actuel = select.value;
    select.innerHTML = '<option value="">—</option>' + noms
      .filter((x) => x.id !== tr.dataset.id)
      .map((x) => '<option value="' + x.id + '"' + (x.id === actuel ? ' selected' : '') + '>' + echapper(x.nom) + '</option>')
      .join('');
  }
}

function mettreAJour() {
  let creees = 0, maj = 0, fusions = 0;
  for (const tr of lignesNotions()) {
    const inclure = tr.querySelector('.inclure').checked;
    const fusion = tr.querySelector('.fusion').value;
    tr.classList.toggle('ignore', !inclure && !fusion);
    tr.classList.toggle('fusion', !!fusion);
    if (fusion) fusions++;
    else if (inclure) {
      const n = donnees.notions.find((x) => x.id === tr.dataset.id);
      if (n.existante) maj++; else creees++;
    }
  }
  const prosits = [...corpsProsits.querySelectorAll('tr')].filter((tr) => {
    const r = tr.querySelector('.remplacer');
    return !r || r.checked;
  }).length;
  document.getElementById('resume').textContent =
    prosits + ' Prosit(s) écrit(s) · ' + creees + ' notion(s) créée(s) · ' + maj + ' mise(s) à jour · ' + fusions + ' fusion(s)';
}

corpsNotions.addEventListener('change', (e) => {
  if (e.target.classList.contains('fusion') && e.target.value) {
    e.target.closest('tr').querySelector('.inclure').checked = true;
  }
  if (e.target.classList.contains('nom')) remplirFusions();
  mettreAJour();
});
corpsProsits.addEventListener('change', mettreAJour);

document.getElementById('filtre').addEventListener('input', (e) => {
  const f = e.target.value.toLowerCase();
  for (const tr of lignesNotions()) tr.style.display = tr.querySelector('input.nom').value.toLowerCase().includes(f) ? '' : 'none';
});
document.getElementById('toutCocher').onclick = () => { for (const tr of lignesNotions()) if (tr.style.display !== 'none') tr.querySelector('.inclure').checked = true; mettreAJour(); };
document.getElementById('toutDecocher').onclick = () => { for (const tr of lignesNotions()) if (tr.style.display !== 'none') tr.querySelector('.inclure').checked = false; mettreAJour(); };

document.getElementById('annuler').onclick = () => vscode.postMessage({ type: 'annuler' });
document.getElementById('importer').onclick = () => {
  const prosits = [...corpsProsits.querySelectorAll('tr')].map((tr) => ({
    index: Number(tr.dataset.index),
    numero: Number(tr.querySelector('.numero').value),
    titre: tr.querySelector('.titre').value,
    module: tr.querySelector('.module').value,
    remplacer: tr.querySelector('.remplacer') ? tr.querySelector('.remplacer').checked : true,
  }));
  const notions = lignesNotions().map((tr) => ({
    id: tr.dataset.id,
    nom: tr.querySelector('input.nom').value,
    inclure: tr.querySelector('.inclure').checked,
    fusionnerDans: tr.querySelector('.fusion').value || null,
  }));
  vscode.postMessage({ type: 'valider', prosits, notions });
};

remplirFusions();
mettreAJour();
</script>
</body>
</html>`;
}
