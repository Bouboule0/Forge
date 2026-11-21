// Écriture du coffre : création initiale, notes Prosit, notes Notion, notes Module.
// Les parties gérées par Forge sont entre <!-- forge:xxx --> et <!-- /forge:xxx -->.
// Tout le reste de la note appartient à l'utilisateur et n'est jamais écrasé.

import * as fs from 'fs';
import * as path from 'path';
import type { CerAnalyse, Piste } from './parseurCer';
import { cheminDossier, DOSSIERS, ecrireNote, lireNote, trouverNoteProsit } from './coffre';
import { nomNoteProsit, resoudreFusions, type NotionCandidate, type PlanImport, type PrositPlan } from './planImport';
import { aujourdhui, motsCles, motsProches, nomFichierSur } from './texte';

// --------------------------------------------------------------------------
// Création du coffre

const COULEURS_MAITRISE = [
  0x9e9e9e, // 0 graine
  0xa1887f, // 1 germe
  0xc5e1a5, // 2 pousse
  0x9ccc65, // 3 jeune plant
  0x689f38, // 4 plant adulte
  0xf06292, // 5 en fleurs
  0xffb300, // 6 récoltable
];

export function initialiserCoffre(coffre: string): string[] {
  const crees: string[] = [];
  for (const cle of Object.keys(DOSSIERS) as Array<keyof typeof DOSSIERS>) {
    const dossier = cheminDossier(coffre, cle);
    if (!fs.existsSync(dossier)) {
      fs.mkdirSync(dossier, { recursive: true });
      crees.push(DOSSIERS[cle]);
    }
  }

  ecrireSiAbsent(path.join(coffre, '.forge', 'config.json'), JSON.stringify({ version: 1, cree_le: aujourdhui() }, null, 2) + '\n', crees);
  ecrireSiAbsent(path.join(coffre, '.gitignore'), ['.obsidian/workspace*.json', '.obsidian/cache', '.trash/', 'Exports/', ''].join('\n'), crees);
  ecrireSiAbsent(path.join(coffre, 'Accueil.md'), ACCUEIL, crees);

  // Couleurs du graphe Obsidian selon la maîtrise
  const graphe = path.join(coffre, '.obsidian', 'graph.json');
  if (!fs.existsSync(graphe)) {
    const colorGroups = [
      { query: 'tag:#forge/prosit', color: { a: 1, rgb: 0x5c6bc0 } },
      { query: 'tag:#forge/module', color: { a: 1, rgb: 0x26a69a } },
      ...COULEURS_MAITRISE.map((rgb, niveau) => ({ query: `tag:#maitrise/${niveau}`, color: { a: 1, rgb } })),
    ].reverse(); // Obsidian applique le premier groupe qui correspond
    ecrireSiAbsent(graphe, JSON.stringify({ colorGroups, showTags: false, showAttachments: false }, null, 2), crees);
  }
  return crees;
}

function ecrireSiAbsent(chemin: string, contenu: string, crees: string[]): void {
  if (fs.existsSync(chemin)) return;
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, contenu, 'utf8');
  crees.push(chemin);
}

const ACCUEIL = `# 🌱 Mon second cerveau

Ce coffre est géré avec l'extension VS Code **Forge**.

- **Prosits/** : un Prosit par note (CER au format Markdown).
- **Notions/** : une note par notion. Les Prosits qui en parlent y sont reliés.
- **Modules/** : une note par module (POO…).
- **Exercices/** : les exercices générés pendant les révisions.
- **Sources/** : les fichiers Word d'origine.

## Couleurs du graphe

Ouvre la vue graphe (Ctrl+G). Chaque notion est colorée selon sa maîtrise :
gris = graine, marron = germe, verts = pousse → plant adulte, rose = en fleurs, or = récoltable.

## Règles

- Tu peux écrire librement partout, **sauf** entre les balises \`<!-- forge:... -->\`, qui sont mises à jour par Forge.
- Quand tu as relu et corrigé une définition, passe \`statut\` à \`verifie\` dans l'en-tête de la notion.
`;

// --------------------------------------------------------------------------
// Blocs gérés par Forge

export function bloc(nom: string, contenu: string): string {
  return `<!-- forge:${nom} -->\n${contenu.trim()}\n<!-- /forge:${nom} -->`;
}

export function lireBloc(texte: string, nom: string): string | null {
  const m = texte.match(new RegExp(`<!-- forge:${nom} -->\\n?([\\s\\S]*?)\\n?<!-- /forge:${nom} -->`));
  return m ? m[1] : null;
}

export function remplacerBloc(texte: string, nom: string, contenu: string): string {
  const motif = new RegExp(`<!-- forge:${nom} -->[\\s\\S]*?<!-- /forge:${nom} -->`);
  if (motif.test(texte)) return texte.replace(motif, () => bloc(nom, contenu));
  return `${texte.trimEnd()}\n\n${bloc(nom, contenu)}\n`;
}

/** Ajoute à un bloc de lignes les lignes absentes. */
function fusionnerLignes(existant: string | null, nouvelles: string[]): string {
  const lignes = (existant ?? '').split('\n').filter((l) => l.trim() !== '' && !l.startsWith('_'));
  for (const l of nouvelles) if (!lignes.includes(l)) lignes.push(l);
  return lignes.join('\n');
}

// --------------------------------------------------------------------------
// Petits utilitaires Markdown

const lien = (nom: string) => `[[${nom}]]`;

/** Décale les titres pour que le plus haut niveau devienne `niveauCible`. */
export function decalerTitres(md: string, niveauCible: number): string {
  let dansCode = false;
  const niveaux: number[] = [];
  for (const l of md.split('\n')) {
    if (l.startsWith('```')) dansCode = !dansCode;
    const m = !dansCode && l.match(/^(#{1,6})\s/);
    if (m) niveaux.push(m[1].length);
  }
  if (niveaux.length === 0) return md;
  const delta = niveauCible - Math.min(...niveaux);
  dansCode = false;
  return md
    .split('\n')
    .map((l) => {
      if (l.startsWith('```')) dansCode = !dansCode;
      if (dansCode) return l;
      return l.replace(/^(#{1,6})(\s)/, (_, dieses: string, espace: string) => '#'.repeat(Math.min(6, Math.max(1, dieses.length + delta))) + espace);
    })
    .join('\n');
}

/** Listes Turndown (« -   item ») → listes compactes (« - item »). */
export function compacterListes(md: string): string {
  return md.replace(/^(\s*)-\s{2,}/gm, '$1- ').replace(/^(\s*)(\d+\.)\s{2,}/gm, '$1$2 ');
}

const ETIQUETTES_STATUT: Record<Piste['statut'], string> = {
  validee: '✅ Validée',
  invalidee: '❌ Invalidée',
  a_valider: '❓ À valider',
};

export function pistesEnMarkdown(pistes: Piste[]): string {
  if (pistes.length === 0) return '_Aucune piste._';
  return pistes
    .map((p) => {
      const coche = p.statut === 'a_valider' ? ' ' : 'x';
      const lignes = [`- [${coche}] ${p.texte}`, `    - Statut : ${ETIQUETTES_STATUT[p.statut]}`];
      lignes.push(`    - Justification : ${p.justification || '…'}`);
      return lignes.join('\n');
    })
    .join('\n');
}

// --------------------------------------------------------------------------
// Écriture du plan d'import

export interface ResultatEcriture {
  prositsCrees: string[];
  prositsIgnores: string[];
  notionsCreees: string[];
  notionsMisesAJour: string[];
  modules: string[];
}

export interface OptionsEcriture {
  /** Les définitions générées par IA sont acceptées d'office (relues ensuite par l'IA). */
  accepterDefinitionsIA: boolean;
}

export function ecrirePlan(plan: PlanImport, options: OptionsEcriture = { accepterDefinitionsIA: true }): ResultatEcriture {
  const { coffre } = plan;
  initialiserCoffre(coffre);
  const resultat: ResultatEcriture = { prositsCrees: [], prositsIgnores: [], notionsCreees: [], notionsMisesAJour: [], modules: [] };
  const date = aujourdhui();

  const notions = resoudreFusions(plan.notions);
  const nomsProsits = plan.prosits.map((p) => nomNoteProsit(p.numero, p.titre));
  const nomsNotions = notions.map((n) => nomFichierSur(n.nom));

  // Notions citées par chaque Prosit
  const notionsParProsit = plan.prosits.map((p) => notions.filter((n) => n.prosits.includes(p.index)));

  // --- Notes Prosit
  plan.prosits.forEach((p, i) => {
    const analyse = plan.analyses[p.index];
    const nom = nomsProsits[i];
    const chemin = path.join(cheminDossier(coffre, 'prosits'), `${nom}.md`);
    const ancien = trouverNoteProsit(coffre, p.numero);
    if (ancien && !p.remplacer) {
      resultat.prositsIgnores.push(nom);
      return;
    }
    if (ancien && ancien !== chemin) fs.rmSync(ancien);

    const source = copierSource(coffre, analyse.fichierSource);
    const imagesRemplacees = enregistrerImages(coffre, analyse, `P${String(p.numero).padStart(2, '0')}`);
    const contenu = noteProsit(analyse, p, notionsParProsit[i], imagesRemplacees);
    const donnees: Record<string, unknown> = {
      type: 'prosit',
      numero: p.numero,
      titre: p.titre,
      module: p.module ? lien(nomFichierSur(p.module)) : '',
      generalisation: premiereLigne(analyse.sections.generalisation),
      roles: Object.keys(analyse.roles).length ? analyse.roles : undefined,
      source: source ? `${DOSSIERS.sources}/${source}` : undefined,
      importe_le: date,
      tags: ['forge/prosit'],
    };
    ecrireNote(chemin, nettoyer(donnees), contenu);
    resultat.prositsCrees.push(nom);
  });

  // --- Notes Notion
  notions.forEach((n, i) => {
    const nom = nomsNotions[i];
    const chemin = path.join(cheminDossier(coffre, 'notions'), `${nom}.md`);
    const prositsLies = n.prosits.map((index) => nomsProsits[plan.prosits.findIndex((p) => p.index === index)]).filter(Boolean);
    const modules = [...new Set(n.prosits.map((index) => plan.prosits.find((p) => p.index === index)?.module).filter((m): m is string => !!m))];
    const aavCible = n.aav.length ? Math.max(...n.aav.map((a) => a.aav.niveau)) : 2;

    const definitions = n.definitions.map((d) => {
      const nomProsit = nomsProsits[plan.prosits.findIndex((p) => p.index === d.prosit)];
      return { entete: `**D'après ${lien(nomProsit)}**`, texte: compacterListes(d.texte) };
    });
    const lignesAav = n.aav.map((a) => {
      const nomProsit = nomsProsits[plan.prosits.findIndex((p) => p.index === a.prosit)];
      return `- **[${a.aav.niveau}]** ${a.aav.texte} — ${lien(nomProsit)}`;
    });
    const liens = notionsLiees(n, notions, nomsNotions).map((x) => `- ${lien(x)}`);

    if (fs.existsSync(chemin)) {
      const { data, content } = lireNote(chemin);
      const prosits = new Set<string>([...(Array.isArray(data.prosits) ? data.prosits.map(String) : []), ...prositsLies.map(lien)]);
      data.prosits = [...prosits];
      data.aliases = [...new Set([...(Array.isArray(data.aliases) ? data.aliases.map(String) : []), ...(aliasesDe(n, nom) ?? [])])];
      data.aav_cible = Math.max(Number(data.aav_cible) || 0, aavCible);
      if (!data.module && modules[0]) data.module = lien(nomFichierSur(modules[0]));
      let texte = content;
      const blocDefinitions = lireBloc(texte, 'definitions') ?? '';
      // Une définition remplacée par l'IA (car fausse) n'est pas remise par un réimport
      const remplacees = (Array.isArray(data.definitions_remplacees) ? data.definitions_remplacees.map(String) : []).join(' ');
      const ajouts = definitions
        .filter((d) => !blocDefinitions.includes(d.entete) && !remplacees.includes(d.entete.replace(/^\*\*D'après /, '').replace(/\*\*$/, '')))
        .map((d) => `${d.entete}\n\n${d.texte}`);
      if (ajouts.length && data.revue_ia) data.revue_ia = 'a_faire'; // nouvelle définition à faire relire
      if (ajouts.length) {
        const base = blocDefinitions.trim().startsWith('_') ? '' : blocDefinitions.trim();
        texte = remplacerBloc(texte, 'definitions', [base, ...ajouts].filter(Boolean).join('\n\n'));
      }
      texte = remplacerBloc(texte, 'aav', fusionnerLignes(lireBloc(texte, 'aav'), lignesAav) || '_Aucun AAV relié._');
      texte = remplacerBloc(texte, 'liens', fusionnerLignes(lireBloc(texte, 'liens'), liens) || '_Aucun lien pour le moment._');
      ecrireNote(chemin, nettoyer(data), texte);
      resultat.notionsMisesAJour.push(nom);
    } else {
      const donnees: Record<string, unknown> = {
        type: 'notion',
        aliases: aliasesDe(n, nom),
        module: modules[0] ? lien(nomFichierSur(modules[0])) : '',
        prosits: prositsLies.map(lien),
        aav_cible: aavCible,
        statut: n.definitions.length === 0 || (n.genereeParIA && !options.accepterDefinitionsIA) ? 'a_verifier' : 'verifie',
        revue_ia: n.genereeParIA || n.definitions.length === 0 ? 'a_faire' : undefined,
        niveau: 0,
        prochaine_revision: date,
        derniere_revision: '',
        tags: ['forge/notion', 'maitrise/0'],
      };
      ecrireNote(chemin, nettoyer(donnees), noteNotion(n, definitions, lignesAav, liens, options.accepterDefinitionsIA));
      resultat.notionsCreees.push(nom);
    }
  });

  // --- Notes Module
  const modules = new Map<string, string[]>();
  plan.prosits.forEach((p, i) => {
    if (!p.module) return;
    const liste = modules.get(p.module) ?? [];
    liste.push(nomsProsits[i]);
    modules.set(p.module, liste);
  });
  for (const [module, prosits] of modules) {
    const nom = nomFichierSur(module);
    const chemin = path.join(cheminDossier(coffre, 'modules'), `${nom}.md`);
    const lignes = prosits.map((x) => `- ${lien(x)}`);
    if (fs.existsSync(chemin)) {
      const { data, content } = lireNote(chemin);
      ecrireNote(chemin, data, remplacerBloc(content, 'prosits', fusionnerLignes(lireBloc(content, 'prosits'), lignes)));
    } else {
      ecrireNote(chemin, { type: 'module', tags: ['forge/module'] }, `# ${module}\n\n## Prosits\n\n${bloc('prosits', lignes.join('\n'))}\n\n## Mes notes\n\n`);
    }
    resultat.modules.push(nom);
  }

  return resultat;
}

/** Autres noms de la notion, y compris son nom exact s'il diffère du nom de fichier (« / » retiré…). */
function aliasesDe(n: NotionCandidate, nomFichier: string): string[] | undefined {
  const aliases = [n.nom, ...n.autresNoms].filter((a) => a !== nomFichier);
  return aliases.length ? [...new Set(aliases)] : undefined;
}

function nettoyer(donnees: Record<string, unknown>): Record<string, unknown> {
  // js-yaml refuse les valeurs undefined
  return Object.fromEntries(Object.entries(donnees).filter(([, v]) => v !== undefined));
}

function premiereLigne(md: string): string {
  return md.replace(/^[-*\s]+/, '').split('\n')[0].trim();
}

function copierSource(coffre: string, fichier: string): string | null {
  if (!fs.existsSync(fichier)) return null;
  const nom = path.basename(fichier);
  const destination = path.join(cheminDossier(coffre, 'sources'), nom);
  if (path.resolve(fichier) !== path.resolve(destination)) fs.copyFileSync(fichier, destination);
  return nom;
}

/** Enregistre les images et renvoie une fonction qui remplace leurs identifiants dans le Markdown. */
function enregistrerImages(coffre: string, analyse: CerAnalyse, prefixe: string): (md: string) => string {
  const noms = new Map<string, string>();
  analyse.images.forEach((image, i) => {
    const nom = `${prefixe} - image ${i + 1}.${image.extension}`;
    fs.writeFileSync(path.join(cheminDossier(coffre, 'images'), nom), image.donnees);
    noms.set(image.id, nom);
  });
  return (md) => md.replace(/!\[[^\]]*\]\((forge-image:\/\/\d+)\)/g, (tout, id: string) => (noms.has(id) ? `![[${noms.get(id)}]]` : tout));
}

/** Notions dont tous les mots importants apparaissent dans les définitions de `n`. */
function notionsLiees(n: NotionCandidate, toutes: NotionCandidate[], noms: string[]): string[] {
  const texte = motsCles(n.definitions.map((d) => d.texte).join(' '));
  if (texte.length === 0) return [];
  const liees: string[] = [];
  toutes.forEach((autre, i) => {
    if (autre.id === n.id) return;
    const ok = [autre.nom, ...autre.autresNoms].some((nom) => {
      const mots = motsCles(nom);
      return mots.length > 0 && mots.length <= 3 && mots.every((m) => texte.some((t) => motsProches(m, t)));
    });
    if (ok) liees.push(noms[i]);
  });
  return liees;
}

// --------------------------------------------------------------------------
// Avertissement « définition générée par IA »

const AVERTISSEMENT_A_VERIFIER =
  '> [!warning] Définition générée par IA — à vérifier\n> Relis-la, corrige-la si besoin, puis passe `statut` à `verifie` dans l\'en-tête.\n\n';
const AVERTISSEMENT_ACCEPTEE =
  "> [!info] Définition générée par IA\n> Acceptée d'office : Forge la fait relire par l'IA, qui la corrige si elle est fausse. Tu peux toujours la modifier.\n\n";

/** Retire l'encadré d'avertissement (définition vérifiée, ou relue par l'IA). */
export function retirerAvertissementIA(content: string): string {
  return content.replace(/> \[!(warning|info)\] Définition générée par IA[^\n]*\n(> [^\n]*\n)*\n?/, '');
}

// --------------------------------------------------------------------------
// Modèles de notes

function section(titre: string, contenu: string, niveau = 3): string {
  const corps = contenu.trim() ? compacterListes(decalerTitres(contenu.trim(), niveau + 1)) : '';
  return `${'#'.repeat(niveau)} ${titre}\n\n${corps}`.trimEnd();
}

export function noteProsit(
  analyse: CerAnalyse,
  plan: Pick<PrositPlan, 'numero' | 'titre'>,
  notions: NotionCandidate[],
  remplacerImages: (md: string) => string = (md) => md,
): string {
  const s = analyse.sections;
  const titre = `P${String(plan.numero).padStart(2, '0')} — ${plan.titre || 'Sans titre'}`;

  const aav = analyse.aav.length
    ? analyse.aav
        .map((a) => {
          const liees = notions.filter((n) => n.aav.some((x) => x.aav.texte === a.texte)).map((n) => lien(nomFichierSur(n.nom)));
          return `- **[${a.niveau}]** ${a.texte}${liees.length ? ` → ${liees.join(', ')}` : ''}`;
        })
        .join('\n')
    : '';

  const motsCles = notions.filter((n) => n.origine === 'mot_cle').map((n) => `- ${lien(nomFichierSur(n.nom))}`).join('\n');

  const morceaux = [
    `# ${titre}`,
    `## Objectifs (AAV)\n\n${bloc('aav', aav || '_Aucun AAV indiqué._')}`,
    '## Rappel du Prosit Aller',
    `### Mots-clés\n\n${bloc('mots-cles', motsCles || '_Aucun mot-clé._')}\n\n> Les définitions sont dans chaque note de notion.`,
    section('Contexte', s.contexte),
    section('Problématique', s.problematique),
    section('Contraintes', s.contraintes),
    section('Livrables', s.livrables),
    section('Généralisation', s.generalisation),
    `### Pistes de solutions\n\n${bloc('pistes', pistesEnMarkdown(analyse.pistes))}`,
    section("Plan d'action", s.planAction),
    '## Prosit Retour',
    section('Workshop', s.workshop),
    section('Corbeille', s.corbeille),
    section('Résolution du prosit', s.resolution),
    section('Bilan', s.bilan),
    section('Sources', s.sources),
  ];
  if (s.autres.trim()) morceaux.push(section('Autres notes', s.autres, 2));
  return remplacerImages(morceaux.join('\n\n')) + '\n';
}

function noteNotion(
  n: NotionCandidate,
  definitions: Array<{ entete: string; texte: string }>,
  lignesAav: string[],
  liens: string[],
  accepter = true,
): string {
  const avertissement = !n.genereeParIA || n.definitions.length === 0
    ? ''
    : accepter
      ? AVERTISSEMENT_ACCEPTEE
      : AVERTISSEMENT_A_VERIFIER;
  const defs = definitions.length ? definitions.map((d) => `${d.entete}\n\n${d.texte}`).join('\n\n') : '_Pas encore de définition. Écris-la avec tes mots !_';
  return [
    `# ${n.nom}`,
    `${avertissement}## Définition\n\n${bloc('definitions', defs)}`,
    `## Objectifs (AAV)\n\n${bloc('aav', lignesAav.join('\n') || '_Aucun AAV relié._')}`,
    '## Mes notes\n\n',
    `## Voir aussi\n\n${bloc('liens', liens.join('\n') || '_Aucun lien pour le moment._')}`,
  ].join('\n\n') + '\n';
}

// --------------------------------------------------------------------------
// Nouveau Prosit vierge

export function creerProsit(coffre: string, numero: number, titre: string, module: string): string {
  initialiserCoffre(coffre);
  const vide: CerAnalyse = {
    fichierSource: '',
    type: 'cer',
    numero,
    titre,
    module,
    roles: {},
    aav: [],
    motsCles: [],
    definitionsGenereesParIA: false,
    pistes: [],
    sections: { contexte: '', problematique: '', contraintes: '', livrables: '', generalisation: '', planAction: '', workshop: '', corbeille: '', resolution: '', bilan: '', sources: '', autres: '' },
    images: [],
    avertissements: [],
  };
  const nom = nomNoteProsit(numero, titre);
  const chemin = path.join(cheminDossier(coffre, 'prosits'), `${nom}.md`);
  if (fs.existsSync(chemin)) return chemin;
  let contenu = noteProsit(vide, { numero, titre }, []);
  contenu = contenu
    .replace(bloc('aav', '_Aucun AAV indiqué._'), bloc('aav', '- **[3]** …'))
    .replace(bloc('mots-cles', '_Aucun mot-clé._'), bloc('mots-cles', '- …'))
    .replace(bloc('pistes', '_Aucune piste._'), bloc('pistes', pistesEnMarkdown([{ texte: '…', statut: 'a_valider', justification: '' }])));
  ecrireNote(
    chemin,
    { type: 'prosit', numero, titre, module: module ? lien(nomFichierSur(module)) : '', cree_le: aujourdhui(), tags: ['forge/prosit'] },
    contenu,
  );
  return chemin;
}
