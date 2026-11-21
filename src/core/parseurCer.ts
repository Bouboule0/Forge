// Lecture d'un CER ou d'un Prosit Aller (.docx) au format CESI → structure de données.
// Le découpage est fait localement (sans IA) : les CER suivent toujours le même modèle.

import * as mammoth from 'mammoth';
import { parse, HTMLElement, Node, NodeType } from 'node-html-parser';
import TurndownService from 'turndown';
// @ts-ignore : pas de types fournis pour ce plugin
import { gfm } from 'turndown-plugin-gfm';
import { normaliser, similarite } from './texte';

export interface Aav {
  niveau: number;
  texte: string;
}

export interface MotCle {
  nom: string;
  /** Définition en Markdown (vide pour un Prosit Aller). */
  definition: string;
}

export type StatutPiste = 'validee' | 'partielle' | 'invalidee' | 'a_valider';

export interface Piste {
  texte: string;
  statut: StatutPiste;
  justification: string;
}

export interface ImageExtraite {
  /** Identifiant temporaire présent dans le Markdown : forge-image://N */
  id: string;
  extension: string;
  donnees: Buffer;
}

export type CleSection =
  | 'contexte'
  | 'problematique'
  | 'contraintes'
  | 'livrables'
  | 'generalisation'
  | 'planAction'
  | 'workshop'
  | 'corbeille'
  | 'resolution'
  | 'bilan'
  | 'sources'
  | 'autres';

export interface CerAnalyse {
  fichierSource: string;
  type: 'cer' | 'prosit_aller';
  numero: number | null;
  titre: string;
  module: string;
  roles: Record<string, string>;
  aav: Aav[];
  motsCles: MotCle[];
  definitionsGenereesParIA: boolean;
  pistes: Piste[];
  sections: Record<CleSection, string>;
  images: ImageExtraite[];
  avertissements: string[];
}

// --------------------------------------------------------------------------
// Reconnaissance des titres de section

type CleInterne = CleSection | 'aav' | 'motsCles' | 'pistes' | 'validation' | 'conteneur';

const TITRES: Array<[RegExp, CleInterne]> = [
  [/^aav$/, 'aav'],
  [/^rappel du prosit aller$/, 'conteneur'],
  [/^prosit retour$/, 'conteneur'],
  [/^mots? cles?$/, 'motsCles'],
  [/^contextes?$/, 'contexte'],
  [/^problematiques?$/, 'problematique'],
  [/^contraintes?$/, 'contraintes'],
  [/^livrables?$/, 'livrables'],
  [/^generalisations?$/, 'generalisation'],
  [/^pistes? de solutions?$/, 'pistes'],
  [/^plans? d actions?$/, 'planAction'],
  [/^workshops?$/, 'workshop'],
  [/^corbeilles?$/, 'corbeille'],
  [/^resolution( du prosit)?$/, 'resolution'],
  [/^bilan$/, 'bilan'],
  [/^validation des pistes( de solutions?)?$/, 'validation'],
  [/^sources?$/, 'sources'],
];

function reconnaitreTitre(texte: string): CleInterne | null {
  const n = normaliser(texte.replace(/:\s*$/, ''));
  if (n.length === 0 || n.length > 45) return null;
  for (const [motif, cle] of TITRES) {
    if (motif.test(n)) return cle;
  }
  return null;
}

/** Sections dans lesquelles les sous-titres (h3+) font partie du contenu. */
const SECTIONS_LIBRES = new Set<CleInterne>(['resolution', 'workshop', 'corbeille', 'bilan', 'planAction']);

// Paragraphes « modèle » à ne pas recopier
const TEXTES_MODELE = [
  /^a completer s il y a/,
  /^rediger ici/,
  /^reponse a la problematique ce que j ai appris/,
  /^lister les sources/,
  /^definitions? generees? automatiquement par ia/,
];

function estTexteModele(texte: string): boolean {
  const n = normaliser(texte);
  if (n === '' && /^[\s.…]*$/.test(texte) && texte.trim() !== '') return true; // « … »
  return TEXTES_MODELE.some((m) => m.test(n));
}

// --------------------------------------------------------------------------
// Détection du code C++ écrit en paragraphes dans Word

const DEBUT_CODE = /^(#include|#define|class\s|struct\s|template\s*<|public:|private:|protected:|int\s+main|Int\s+main|return\b|std::|using\s|namespace\s|virtual\s|delete\s|\}|\{|\/\/)/;
const FIN_CODE = /[;{}]\s*(\/\/.*)?$/;

function ressembleAduCode(ligne: string): boolean {
  const t = ligne.trim();
  if (t.length === 0) return false;
  // Une phrase française se termine rarement par ; { ou }
  return DEBUT_CODE.test(t) || FIN_CODE.test(t);
}

function echapperHtml(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Regroupe les paragraphes consécutifs qui ressemblent à du code en un bloc <pre>. */
function regrouperCode(noeuds: Node[]): string {
  const morceaux: string[] = [];
  let i = 0;
  while (i < noeuds.length) {
    const n = noeuds[i];
    if (estParagraphe(n) && ressembleAduCode(n.text)) {
      const lignes: string[] = [];
      let j = i;
      while (j < noeuds.length && estParagraphe(noeuds[j])) {
        const texte = (noeuds[j] as HTMLElement).text;
        if (ressembleAduCode(texte) || (texte.trim() === '' && j + 1 < noeuds.length && estParagraphe(noeuds[j + 1]) && ressembleAduCode(noeuds[j + 1].text))) {
          lignes.push(texte.replace(/ /g, ' ').replace(/\s+$/, ''));
          j++;
        } else {
          break;
        }
      }
      if (lignes.length >= 2 || (lignes.length === 1 && /[;{}]/.test(lignes[0]))) {
        morceaux.push(`<pre><code class="language-cpp">${echapperHtml(lignes.join('\n'))}</code></pre>`);
        i = j;
        continue;
      }
    }
    morceaux.push(n.toString());
    i++;
  }
  return morceaux.join('\n');
}

function estParagraphe(n: Node): n is HTMLElement {
  return n.nodeType === NodeType.ELEMENT_NODE && (n as HTMLElement).tagName === 'P' && !(n as HTMLElement).querySelector('img');
}

// --------------------------------------------------------------------------
// HTML → Markdown

function creerTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  td.use(gfm);
  return td;
}

/** Prépare les tableaux Word pour la conversion : 1re ligne en en-tête, cellules sur une ligne. */
function preparerTableaux(html: string): string {
  const racine = parse(html);
  for (const table of racine.querySelectorAll('table')) {
    const lignes = table.querySelectorAll('tr');
    lignes.forEach((tr, index) => {
      for (const cellule of tr.querySelectorAll('td, th')) {
        const paragraphes = cellule.querySelectorAll('p').map((p) => p.innerHTML.trim()).filter((p) => p !== '');
        const contenu = paragraphes.length > 0 ? paragraphes.join('<br>') : cellule.innerHTML;
        const balise = index === 0 ? 'th' : 'td';
        cellule.replaceWith(`<${balise}>${contenu}</${balise}>`);
      }
    });
    // Supprime les lignes entièrement vides (fréquentes dans les modèles Word)
    for (const tr of table.querySelectorAll('tr')) {
      if (tr.text.trim() === '') tr.remove();
    }
  }
  return racine.toString();
}

function versMarkdown(td: TurndownService, noeuds: Node[]): string {
  const utiles = noeuds.filter((n) => !(n.nodeType === NodeType.ELEMENT_NODE && estTexteModele(n.text)));
  const html = preparerTableaux(regrouperCode(utiles));
  return td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
}

// --------------------------------------------------------------------------
// Analyse principale

const ROLES = /(Animateur|Animatrice|Scribe|Secr[ée]taire|Gestionnaire)\s*:\s*/gi;
const ROLES_TEST = /^(Animateur|Animatrice|Scribe|Secr[ée]taire|Gestionnaire)\s*:/i;

function lireRoles(texte: string, roles: Record<string, string>): string {
  // Renvoie le texte sans les rôles, et remplit `roles`.
  const parties = texte.split(ROLES);
  // split avec groupe capturant : [avant, role1, valeur1, role2, valeur2...]
  for (let i = 1; i + 1 < parties.length; i += 2) {
    const role = normaliser(parties[i]).replace('animatrice', 'animateur');
    const valeur = parties[i + 1].trim();
    if (valeur) roles[role] = valeur;
  }
  return parties[0].trim();
}

function lireStatut(texte: string): StatutPiste {
  const n = normaliser(texte);
  if (/invalid|faux|refut/.test(n)) return 'invalidee';
  if (/partiel|en partie/.test(n)) return 'partielle';
  if (/valid|vrai|confirm/.test(n)) return 'validee';
  return 'a_valider';
}

function cellules(tr: HTMLElement): HTMLElement[] {
  return tr.querySelectorAll('td, th');
}

function texteCellule(c: HTMLElement | undefined): string {
  return (c?.text ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export async function analyserCer(chemin: string, donnees?: Buffer): Promise<CerAnalyse> {
  const images: ImageExtraite[] = [];
  const resultat = await mammoth.convertToHtml(donnees ? { buffer: donnees } : { path: chemin }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const contenu = await image.readAsBuffer();
      const extension = (image.contentType.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('x-emf', 'emf');
      const id = `forge-image://${images.length + 1}`;
      images.push({ id, extension, donnees: contenu });
      return { src: id };
    }),
  });

  const analyse: CerAnalyse = {
    fichierSource: chemin,
    type: 'cer',
    numero: null,
    titre: '',
    module: '',
    roles: {},
    aav: [],
    motsCles: [],
    definitionsGenereesParIA: false,
    pistes: [],
    sections: {
      contexte: '', problematique: '', contraintes: '', livrables: '', generalisation: '',
      planAction: '', workshop: '', corbeille: '', resolution: '', bilan: '', sources: '', autres: '',
    },
    images,
    avertissements: resultat.messages
      .filter((m) => m.type === 'error')
      .map((m) => m.message),
  };

  const td = creerTurndown();
  const racine = parse(resultat.value);
  const noeuds = racine.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE) as HTMLElement[];

  let courante: CleInterne | 'entete' = 'entete';
  const contenus = new Map<CleInterne | 'entete', HTMLElement[]>();
  const ajouter = (cle: CleInterne | 'entete', n: HTMLElement) => {
    if (!contenus.has(cle)) contenus.set(cle, []);
    contenus.get(cle)!.push(n);
  };

  for (const n of noeuds) {
    const balise = n.tagName;
    const texte = n.text.replace(/ /g, ' ').trim();
    const estTitreHtml = /^H[1-6]$/.test(balise);
    const niveau = estTitreHtml ? Number(balise[1]) : 0;

    // « Livrables : » peut être suivi de texte sur la même ligne dans un Prosit Aller
    let cle: CleInterne | null = null;
    if (estTitreHtml && (niveau <= 2 || !SECTIONS_LIBRES.has(courante as CleInterne))) {
      cle = reconnaitreTitre(texte);
    } else if (balise === 'P') {
      cle = reconnaitreTitre(texte);
    }

    if (cle) {
      courante = cle;
      continue;
    }
    if (estTitreHtml && niveau <= 1 && courante !== 'entete') {
      // Titre de premier niveau inconnu : on le garde dans « autres »
      courante = 'autres';
    }
    ajouter(courante, n);
  }

  // --- En-tête : titre, module, rôles, AAV (parfois sans titre « AAV : »)
  for (const n of contenus.get('entete') ?? []) {
    const texte = n.text.replace(/ /g, ' ').trim();
    if (!texte) continue;
    const titre = texte.match(/prosit\s*(aller|retour)?\s*n?°?\s*(\d+)\s*[:–—-]?\s*(.*)$/i);
    if (titre && analyse.numero === null && /^(cer|prosit)/i.test(texte)) {
      analyse.numero = Number(titre[2]);
      analyse.titre = titre[3].trim();
      if (/^prosit\s*aller/i.test(texte)) analyse.type = 'prosit_aller';
      continue;
    }
    const module = texte.match(/^module\s*:\s*(.*)$/i);
    if (module) {
      analyse.module = lireRoles(module[1], analyse.roles);
      continue;
    }
    if (ROLES_TEST.test(texte)) {
      lireRoles(texte, analyse.roles);
      continue;
    }
    const aav = texte.match(/^\[(\d)\]\s*(.+)$/);
    if (aav) {
      analyse.aav.push({ niveau: Number(aav[1]), texte: aav[2].trim() });
      continue;
    }
    ajouter('autres', n);
  }

  for (const n of contenus.get('aav') ?? []) {
    for (const ligne of n.querySelectorAll('li').length ? n.querySelectorAll('li') : [n]) {
      const aav = ligne.text.trim().match(/^\[(\d)\]\s*(.+)$/);
      if (aav) analyse.aav.push({ niveau: Number(aav[1]), texte: aav[2].trim() });
    }
  }

  // --- Mots-clés : tableau (CER) ou liste (Prosit Aller)
  for (const n of contenus.get('motsCles') ?? []) {
    if (n.tagName === 'TABLE') {
      for (const tr of n.querySelectorAll('tr')) {
        const [c1, c2] = cellules(tr);
        const nom = texteCellule(c1);
        if (!nom || /^mots?[- ]cl[ée]s?$/i.test(nom)) continue;
        const definition = c2 ? versMarkdown(td, c2.childNodes) : '';
        analyse.motsCles.push({ nom, definition });
      }
    } else if (n.tagName === 'UL' || n.tagName === 'OL') {
      for (const li of n.querySelectorAll('li')) {
        const nom = li.text.trim();
        if (nom) analyse.motsCles.push({ nom, definition: '' });
      }
    } else if (estTexteModele(n.text) && /ia/i.test(n.text)) {
      analyse.definitionsGenereesParIA = true;
    }
  }
  if (/d[ée]finitions? g[ée]n[ée]r[ée]es? automatiquement par ia/i.test(racine.text)) {
    analyse.definitionsGenereesParIA = true;
  }
  analyse.motsCles = reparerMotsCoupes(analyse.motsCles);

  // --- Pistes de solutions
  for (const n of contenus.get('pistes') ?? []) {
    const elements = n.querySelectorAll('li');
    if (elements.length > 0) {
      for (const li of elements) {
        const texte = li.text.replace(/\s+/g, ' ').trim();
        if (texte) analyse.pistes.push({ texte, statut: 'a_valider', justification: '' });
      }
    } else {
      const texte = n.text.replace(/\s+/g, ' ').trim();
      if (texte) analyse.pistes.push({ texte, statut: 'a_valider', justification: '' });
    }
  }

  // --- Tableau de validation des pistes (peut se trouver dans « Bilan »)
  const tableauxValidation = [...(contenus.get('validation') ?? []), ...(contenus.get('bilan') ?? [])]
    .filter((n) => n.tagName === 'TABLE' && /piste/i.test(texteCellule(n.querySelector('tr td, tr th') ?? undefined)));
  for (const table of tableauxValidation) {
    for (const tr of table.querySelectorAll('tr')) {
      const [c1, c2, c3] = cellules(tr);
      const texte = texteCellule(c1);
      if (!texte || /^pistes? de solutions?$/i.test(texte)) continue;
      const statutBrut = texteCellule(c2);
      const justification = texteCellule(c3);
      const existante = trouverPiste(analyse.pistes, texte);
      const piste = existante ?? { texte, statut: 'a_valider' as StatutPiste, justification: '' };
      if (!existante) analyse.pistes.push(piste);
      if (statutBrut) piste.statut = lireStatut(statutBrut);
      if (justification) piste.justification = justification;
    }
  }
  // Le tableau ne fait pas partie du bilan rédigé
  const bilan = (contenus.get('bilan') ?? []).filter((n) => !tableauxValidation.includes(n));
  contenus.set('bilan', bilan);
  for (const n of contenus.get('validation') ?? []) {
    if (!tableauxValidation.includes(n)) ajouter('bilan', n);
  }

  // --- Sections rédigées
  const sectionsTexte: CleSection[] = [
    'contexte', 'problematique', 'contraintes', 'livrables', 'generalisation', 'planAction',
    'workshop', 'corbeille', 'resolution', 'bilan', 'sources', 'autres',
  ];
  for (const cle of sectionsTexte) {
    analyse.sections[cle] = versMarkdown(td, contenus.get(cle) ?? []);
  }

  if (analyse.numero === null) {
    const depuisNom = chemin.match(/prosit[\s_-]*(\d+)/i);
    if (depuisNom) analyse.numero = Number(depuisNom[1]);
    else analyse.avertissements.push('Numéro du Prosit introuvable.');
  }

  return analyse;
}

/** Le tableau Word coupe parfois un mot-clé sur deux lignes : « Accesseur (écriture » + « lecture) ». */
function reparerMotsCoupes(mots: MotCle[]): MotCle[] {
  const resultat: MotCle[] = [];
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    const ouvertes = (m.nom.match(/\(/g) ?? []).length - (m.nom.match(/\)/g) ?? []).length;
    const suivant = mots[i + 1];
    if (ouvertes > 0 && suivant && (suivant.nom.match(/\)/g) ?? []).length > (suivant.nom.match(/\(/g) ?? []).length) {
      resultat.push({
        nom: `${m.nom.trim()} / ${suivant.nom.trim()}`.replace(/\s+/g, ' '),
        definition: [m.definition, suivant.definition].filter(Boolean).join('\n\n'),
      });
      i++;
    } else {
      resultat.push(m);
    }
  }
  return resultat;
}

function trouverPiste(pistes: Piste[], texte: string): Piste | undefined {
  const n = normaliser(texte);
  let meilleure: Piste | undefined;
  let meilleurScore = 0;
  for (const p of pistes) {
    const score = similarite(normaliser(p.texte), n);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = p;
    }
  }
  return meilleurScore >= 0.8 ? meilleure : undefined;
}
