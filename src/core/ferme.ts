// La ferme : chaque notion est une plante que l'on place soi-même ; réviser fait pousser,
// rapporte des pièces, et les pièces achètent des décorations.
//
// Les pièces sont recalculées à partir de l'historique des révisions (rien ne peut être compté deux fois,
// et la ferme reste juste même synchronisée entre deux ordinateurs). Seule la disposition est enregistrée
// dans .forge/ferme.json.

import * as fs from 'fs';
import * as path from 'path';
import { DOSSIERS } from './coffre';
import { lireHistorique, lireNotionsRevision, serieDeJours, type EntreeHistorique, type NotionRevision } from './notionsRevision';
import { joursDeRetard, stade } from './repetition';
import { aujourdhui } from './texte';

// --------------------------------------------------------------------------
// Catalogue de la boutique

export interface ArticleBoutique {
  type: string;
  nom: string;
  prix: number;
  largeur: number;
  hauteur: number;
  niveauRequis: number;
  description: string;
}

export const BOUTIQUE: ArticleBoutique[] = [
  { type: 'chemin', nom: 'Chemin', prix: 5, largeur: 1, hauteur: 1, niveauRequis: 1, description: 'Une dalle de chemin.' },
  { type: 'cloture', nom: 'Clôture', prix: 8, largeur: 1, hauteur: 1, niveauRequis: 1, description: 'Un morceau de clôture en bois.' },
  { type: 'fleurs', nom: 'Fleurs', prix: 12, largeur: 1, hauteur: 1, niveauRequis: 1, description: 'Un parterre de fleurs sauvages.' },
  { type: 'rocher', nom: 'Rocher', prix: 10, largeur: 1, hauteur: 1, niveauRequis: 1, description: 'Un joli rocher moussu.' },
  { type: 'buisson', nom: 'Buisson', prix: 15, largeur: 1, hauteur: 1, niveauRequis: 1, description: 'Un buisson bien taillé.' },
  { type: 'panneau', nom: 'Panneau', prix: 20, largeur: 1, hauteur: 1, niveauRequis: 2, description: 'Pour indiquer tes parcelles.' },
  { type: 'banc', nom: 'Banc', prix: 30, largeur: 1, hauteur: 1, niveauRequis: 2, description: 'Pour se reposer entre deux révisions.' },
  { type: 'lanterne', nom: 'Lanterne', prix: 35, largeur: 1, hauteur: 1, niveauRequis: 2, description: 'Éclaire la ferme le soir.' },
  { type: 'epouvantail', nom: 'Épouvantail', prix: 50, largeur: 1, hauteur: 1, niveauRequis: 3, description: 'Protège tes graines (et ta motivation).' },
  { type: 'ruche', nom: 'Ruche', prix: 60, largeur: 1, hauteur: 1, niveauRequis: 3, description: 'Des abeilles pour polliniser tes notions.' },
  { type: 'puits', nom: 'Puits', prix: 90, largeur: 1, hauteur: 1, niveauRequis: 4, description: "L'eau de la connaissance." },
  { type: 'etang', nom: 'Étang', prix: 150, largeur: 2, hauteur: 2, niveauRequis: 4, description: 'Un petit étang avec des nénuphars.' },
  { type: 'arbre', nom: 'Grand chêne', prix: 120, largeur: 1, hauteur: 1, niveauRequis: 5, description: 'Un vieil arbre, symbole de savoir.' },
  { type: 'grange', nom: 'Grange', prix: 400, largeur: 3, hauteur: 2, niveauRequis: 6, description: 'La grange rouge des grands fermiers.' },
];

export function article(type: string): ArticleBoutique | undefined {
  return BOUTIQUE.find((a) => a.type === type);
}

// --------------------------------------------------------------------------
// Pièces et niveau de fermier

const GAINS: Record<string, Partial<Record<EntreeHistorique['resultat'], number>>> = {
  code: { reussite: 15, moyen: 5 },
  bug: { reussite: 15, moyen: 5 },
  long: { reussite: 40, moyen: 10 },
  explication: { reussite: 8, moyen: 3 },
  piste_valider: { reussite: 8, moyen: 4, echec: 2 }, // même raté, le CER est complété
};

/** Pièces rapportées par une entrée de l'historique. */
export function gainEntree(e: EntreeHistorique): number {
  if (e.type === 'etude_de_cas' || e.type === 'cctl') return Math.round(2 * (e.points ?? 0));
  const regle = GAINS[e.type];
  let gain = regle ? regle[e.resultat] ?? 0 : e.resultat === 'reussite' ? (e.compte ? 5 : 2) : e.resultat === 'moyen' ? 2 : 0;
  // Récolte : réviser avec succès une notion déjà mûre (🍎)
  if (e.resultat === 'reussite' && e.niveauAvant === 6) gain += 20;
  return gain;
}

export function piecesGagnees(historique: EntreeHistorique[]): number {
  return historique.reduce((s, e) => s + gainEntree(e), 0);
}

/** Pièces nécessaires pour atteindre le niveau n : 0, 100, 300, 600, 1000, 1500… */
export function seuilNiveau(n: number): number {
  return 50 * n * (n - 1);
}

export function niveauFermier(gagnees: number): { niveau: number; prochain: number; precedent: number } {
  let niveau = 1;
  while (gagnees >= seuilNiveau(niveau + 1)) niveau++;
  return { niveau, precedent: seuilNiveau(niveau), prochain: seuilNiveau(niveau + 1) };
}

/** La ferme s'agrandit avec le niveau. */
export function tailleFerme(niveau: number): { largeur: number; hauteur: number } {
  return { largeur: Math.min(30, 12 + 2 * (niveau - 1)), hauteur: Math.min(18, 8 + (niveau - 1)) };
}

export function saison(date = aujourdhui()): 'printemps' | 'ete' | 'automne' | 'hiver' {
  const mois = Number(date.slice(5, 7));
  if (mois >= 3 && mois <= 5) return 'printemps';
  if (mois >= 6 && mois <= 8) return 'ete';
  if (mois >= 9 && mois <= 11) return 'automne';
  return 'hiver';
}

// --------------------------------------------------------------------------
// Disposition (.forge/ferme.json)

export interface Decoration {
  id: string;
  type: string;
  prix: number;
  /** null = rangée dans l'inventaire */
  x: number | null;
  y: number | null;
}

export interface DispositionFerme {
  version: 1;
  plantes: Record<string, { x: number; y: number }>;
  decorations: Decoration[];
}

function cheminFerme(coffre: string): string {
  return path.join(coffre, DOSSIERS.forge, 'ferme.json');
}

export function lireDisposition(coffre: string): DispositionFerme {
  try {
    const d = JSON.parse(fs.readFileSync(cheminFerme(coffre), 'utf8'));
    return { version: 1, plantes: d.plantes ?? {}, decorations: Array.isArray(d.decorations) ? d.decorations : [] };
  } catch {
    return { version: 1, plantes: {}, decorations: [] };
  }
}

export function ecrireDisposition(coffre: string, d: DispositionFerme): void {
  fs.mkdirSync(path.dirname(cheminFerme(coffre)), { recursive: true });
  fs.writeFileSync(cheminFerme(coffre), JSON.stringify(d, null, 1), 'utf8');
}

// --------------------------------------------------------------------------
// Vue complète de la ferme (pour l'écran)

/** Variétés de plantes : une par Prosit, pour reconnaître ses parcelles. */
export const VARIETES = ['pommier', 'oranger', 'myrtillier', 'citronnier', 'cerisier', 'prunier', 'tomate', 'framboisier'] as const;

function variete(notion: NotionRevision, prosits: string[]): string {
  const prosit = notion.prosits[0];
  const index = prosit ? prosits.indexOf(prosit) : -1;
  return VARIETES[(index >= 0 ? index : 0) % VARIETES.length];
}

export interface PlanteVue {
  nom: string;
  titre: string;
  niveau: number;
  stade: string;
  emoji: string;
  variete: string;
  prosit: string;
  prochaine: string | null;
  retard: number;
  x: number | null;
  y: number | null;
}

export interface VueFerme {
  largeur: number;
  hauteur: number;
  saison: string;
  pieces: number;
  gagnees: number;
  niveau: number;
  precedent: number;
  prochain: number;
  serie: number;
  plantes: PlanteVue[];
  decorations: Decoration[];
  boutique: Array<ArticleBoutique & { disponible: boolean }>;
  recoltables: number;
  assoiffees: number;
}

export function vueFerme(coffre: string, date = aujourdhui()): VueFerme {
  const historique = lireHistorique(coffre);
  const disposition = lireDisposition(coffre);
  const gagnees = piecesGagnees(historique);
  const depensees = disposition.decorations.reduce((s, d) => s + d.prix, 0);
  const { niveau, precedent, prochain } = niveauFermier(gagnees);
  const taille = tailleFerme(niveau);
  const notions = lireNotionsRevision(coffre);
  const prosits = [...new Set(notions.flatMap((n) => n.prosits))].sort();

  const plantes = notions.map((n): PlanteVue => {
    const s = stade(n.etat.niveau);
    const place = disposition.plantes[n.nom];
    const dansLaFerme = place && place.x < taille.largeur && place.y < taille.hauteur;
    return {
      nom: n.nom,
      titre: n.titre,
      niveau: n.etat.niveau,
      stade: s.nom,
      emoji: s.emoji,
      variete: variete(n, prosits),
      prosit: n.prosits[0] ?? '',
      prochaine: n.etat.prochaine,
      retard: joursDeRetard(n.etat, date),
      x: dansLaFerme ? place.x : null,
      y: dansLaFerme ? place.y : null,
    };
  });

  return {
    ...taille,
    saison: saison(date),
    pieces: gagnees - depensees,
    gagnees,
    niveau,
    precedent,
    prochain,
    serie: serieDeJours(historique, date),
    plantes,
    decorations: disposition.decorations,
    boutique: BOUTIQUE.map((a) => ({ ...a, disponible: niveau >= a.niveauRequis })),
    recoltables: plantes.filter((p) => p.niveau === 6).length,
    assoiffees: plantes.filter((p) => p.retard > 0).length,
  };
}

// --------------------------------------------------------------------------
// Actions

/** Cases occupées (hors l'élément `sauf`, qu'on est en train de déplacer). */
function occupation(d: DispositionFerme, sauf?: string): Set<string> {
  const cases = new Set<string>();
  for (const [nom, p] of Object.entries(d.plantes)) if (nom !== sauf) cases.add(`${p.x},${p.y}`);
  for (const deco of d.decorations) {
    if (deco.id === sauf || deco.x === null || deco.y === null) continue;
    const a = article(deco.type);
    // Un chemin est un sol : on peut tout poser dessus… sauf un autre chemin
    if (deco.type === 'chemin') {
      cases.add(`chemin:${deco.x},${deco.y}`);
      continue;
    }
    for (let i = 0; i < (a?.largeur ?? 1); i++) for (let j = 0; j < (a?.hauteur ?? 1); j++) cases.add(`${deco.x + i},${deco.y + j}`);
  }
  return cases;
}

/** La case (x, y) peut-elle accueillir cet élément ? (calcul en mémoire) */
export function estLibre(
  d: DispositionFerme,
  taille: { largeur: number; hauteur: number },
  type: 'plante' | string,
  x: number,
  y: number,
  sauf?: string,
): boolean {
  const a = type === 'plante' ? { largeur: 1, hauteur: 1 } : article(type);
  if (!a || x < 0 || y < 0 || x + a.largeur > taille.largeur || y + a.hauteur > taille.hauteur) return false;
  const occupe = occupation(d, sauf);
  if (type === 'chemin') return !occupe.has(`chemin:${x},${y}`);
  for (let i = 0; i < a.largeur; i++) for (let j = 0; j < a.hauteur; j++) if (occupe.has(`${x + i},${y + j}`)) return false;
  return true;
}

function tailleActuelle(coffre: string) {
  return tailleFerme(niveauFermier(piecesGagnees(lireHistorique(coffre))).niveau);
}

export function placeLibre(coffre: string, type: 'plante' | string, x: number, y: number, sauf?: string): boolean {
  return estLibre(lireDisposition(coffre), tailleActuelle(coffre), type, x, y, sauf);
}

export class ErreurFerme extends Error {}

export function planter(coffre: string, notion: string, x: number, y: number): void {
  if (!placeLibre(coffre, 'plante', x, y, notion)) throw new ErreurFerme('Cette case est déjà prise.');
  const d = lireDisposition(coffre);
  d.plantes[notion] = { x, y };
  ecrireDisposition(coffre, d);
}

export function deterrer(coffre: string, notion: string): void {
  const d = lireDisposition(coffre);
  delete d.plantes[notion];
  ecrireDisposition(coffre, d);
}

export function acheter(coffre: string, type: string, x: number | null, y: number | null): Decoration {
  const a = article(type);
  if (!a) throw new ErreurFerme('Article inconnu.');
  const vue = vueFerme(coffre);
  if (vue.niveau < a.niveauRequis) throw new ErreurFerme(`Disponible au niveau ${a.niveauRequis} de fermier.`);
  if (vue.pieces < a.prix) throw new ErreurFerme(`Il te manque ${a.prix - vue.pieces} 🪙. Révise pour en gagner !`);
  if (x !== null && y !== null && !placeLibre(coffre, type, x, y)) throw new ErreurFerme('Pas assez de place ici.');
  const d = lireDisposition(coffre);
  const deco: Decoration = { id: `d${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, type, prix: a.prix, x, y };
  d.decorations.push(deco);
  ecrireDisposition(coffre, d);
  return deco;
}

/** Déplace une décoration (x = null : la range dans l'inventaire, gratuitement). */
export function deplacerDecoration(coffre: string, id: string, x: number | null, y: number | null): void {
  const d = lireDisposition(coffre);
  const deco = d.decorations.find((x) => x.id === id);
  if (!deco) throw new ErreurFerme('Décoration introuvable.');
  if (x !== null && y !== null && !placeLibre(coffre, deco.type, x, y, id)) throw new ErreurFerme('Pas assez de place ici.');
  deco.x = x;
  deco.y = y;
  ecrireDisposition(coffre, d);
}

/** Plante automatiquement les graines du sac, en rangées, sur les cases libres. */
export function toutPlanter(coffre: string): number {
  const vue = vueFerme(coffre);
  const d = lireDisposition(coffre);
  const taille = { largeur: vue.largeur, hauteur: vue.hauteur };
  const sac = vue.plantes.filter((p) => p.x === null).sort((a, b) => a.prosit.localeCompare(b.prosit) || a.titre.localeCompare(b.titre, 'fr'));
  let plantees = 0;
  const essayer = (x: number, y: number) => {
    if (plantees < sac.length && estLibre(d, taille, 'plante', x, y)) d.plantes[sac[plantees++].nom] = { x, y };
  };
  // D'abord une rangée sur deux (on garde des allées), puis le reste si besoin
  for (let y = 1; y < taille.hauteur - 1; y += 2) for (let x = 1; x < taille.largeur - 1; x++) essayer(x, y);
  for (let y = 0; y < taille.hauteur; y++) for (let x = 0; x < taille.largeur; x++) essayer(x, y);
  if (plantees) ecrireDisposition(coffre, d);
  return plantees;
}
