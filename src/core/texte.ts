// Outils de texte : normalisation, comparaison de noms de notions, noms de fichiers.

const MOTS_VIDES = new Set([
  'de', 'la', 'le', 'les', 'l', 'du', 'des', 'd', 'et', 'en', 'un', 'une', 'a', 'au', 'aux',
  'par', 'pour', 'via', 'sur', 'dans', 'avec', 'ou', 'son', 'sa', 'ses', 'leur', 'leurs',
  'ce', 'cette', 'ces', 'qui', 'que', 'mecanisme', 'notion', 'notions', 'principe',
  'cadre', 'utilisation', 'differentes', 'forme', 'formes',
]);

/** Minuscules, sans accents, apostrophes et ponctuation remplacées par des espaces (garde + et #). */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

/** Singulier approximatif : "classes" → "classe", "methodes" → "methode". */
export function singulier(mot: string): string {
  if (mot.length > 3 && (mot.endsWith('s') || mot.endsWith('x'))) {
    return mot.slice(0, -1);
  }
  return mot;
}

/** Mots significatifs d'un texte, normalisés et au singulier. */
export function motsCles(texte: string): string[] {
  return normaliser(texte)
    .split(' ')
    .filter((m) => m.length > 0 && !MOTS_VIDES.has(m))
    .map(singulier);
}

/** Clé de comparaison d'un nom de notion. */
export function cleNotion(nom: string): string {
  return normaliser(nom).split(' ').filter(Boolean).map(singulier).join(' ');
}

/** Distance de Levenshtein. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const lignePrecedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonale = lignePrecedente[0];
    lignePrecedente[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = lignePrecedente[j];
      lignePrecedente[j] = Math.min(
        lignePrecedente[j] + 1,
        lignePrecedente[j - 1] + 1,
        diagonale + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonale = temp;
    }
  }
  return lignePrecedente[b.length];
}

/** Similarité entre 0 et 1. */
export function similarite(a: string, b: string): number {
  const longueur = Math.max(a.length, b.length);
  if (longueur === 0) return 1;
  return 1 - distance(a, b) / longueur;
}

/** Deux mots se ressemblent assez (fonction / function, methode / méthodes...). */
export function motsProches(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  return similarite(a, b) >= 0.75;
}

/** Deux noms de notions désignent probablement la même chose. */
export function memeNotion(a: string, b: string): boolean {
  const ca = cleNotion(a);
  const cb = cleNotion(b);
  if (ca === cb) return true;
  return Math.min(ca.length, cb.length) >= 6 && similarite(ca, cb) >= 0.88;
}

/** Tous les mots significatifs de la notion apparaissent dans le texte (ex. un AAV). */
export function notionPresenteDans(nomNotion: string, texte: string): boolean {
  const motsNotion = motsCles(nomNotion);
  if (motsNotion.length === 0) return false;
  const motsTexte = motsCles(texte);
  return motsNotion.every((m) => motsTexte.some((t) => motsProches(m, t)));
}

/** Nom de fichier valable sous Windows, macOS et Linux. */
export function nomFichierSur(nom: string): string {
  return nom
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120) || 'Sans titre';
}

/** Première lettre en majuscule. */
export function majusculeInitiale(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

const VERBES_AAV = /^(mettre en (œ|oe)uvre|comprendre|ma[iî]triser|utiliser|conna[iî]tre|savoir|identifier|expliquer|appliquer|impl[ée]menter|concevoir|d[ée]finir|manipuler|analyser|distinguer)\s+/i;
const DEBUTS_AAV = /^(les notions de|la notion de|les notions d['’]|la notion d['’])\s*/i;
const ARTICLES = /^(?:(?:les|le|la|des|du|une|un)\s+|l['’]|d['’])/i;

/** Propose un nom de notion à partir d'un AAV : "[3] Mettre en œuvre l'héritage." → "Héritage". */
export function nomDepuisAav(texteAav: string): string {
  let nom = texteAav.trim().replace(/[.\s]+$/, '');
  nom = nom.replace(VERBES_AAV, '');
  nom = nom.replace(DEBUTS_AAV, '');
  nom = nom.replace(ARTICLES, '');
  nom = nom.replace(/\s+en C\+\+$/i, '');
  return majusculeInitiale(nom.trim());
}

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export function aujourdhui(date = new Date()): string {
  const a = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const j = String(date.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}
