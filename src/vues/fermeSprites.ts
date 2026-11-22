// Sprites pixel-art de la ferme (16 × 16, dessinés pour Forge).
// Chaque caractère est un pixel ; « . » est transparent. Les lettres L l D f F dépendent de la variété.

export const PALETTE: Record<string, string> = {
  k: '#2b2118', // contour sombre
  B: '#6b4423', // bois sombre / tronc
  b: '#8b5a2b', // bois
  w: '#c08a52', // bois clair
  s: '#5a3a22', // terre sombre
  S: '#7a5230', // terre
  g: '#2f6b2f', // tige
  h: '#fff7e0', // reflet
  y: '#f2c94c', // jaune
  o: '#d9962b', // orange miel
  r: '#d64545', // rouge
  R: '#a83232', // rouge grange
  p: '#f28cb1', // rose
  v: '#9b6bd6', // violet
  W: '#ffffff', // blanc
  m: '#f1dcb5', // paille / visage
  e: '#9aa0a6', // pierre
  E: '#6b7177', // pierre sombre
  c: '#5ab4e5', // eau
  C: '#2f7fb8', // eau profonde
};

/** Couleurs propres à chaque variété : feuillage (L, l, D), fleurs (f), fruits (F). */
export const VARIETES: Record<string, Record<string, string>> = {
  pommier: { L: '#4c9a2a', l: '#7cc24a', D: '#2f6b1f', f: '#f7b6c8', F: '#d63a3a' },
  oranger: { L: '#3f8f3a', l: '#6cbf55', D: '#2a5e26', f: '#fff3e0', F: '#f08a24' },
  myrtillier: { L: '#3c7f5a', l: '#63aa7c', D: '#285a3f', f: '#ffffff', F: '#3a5fcd' },
  citronnier: { L: '#5a9a2e', l: '#8cc44e', D: '#3c6b1e', f: '#ffffff', F: '#f2d43a' },
  cerisier: { L: '#4a8f3a', l: '#78bf5c', D: '#2e5f24', f: '#ffc0d9', F: '#b3123a' },
  prunier: { L: '#4b8a3e', l: '#7bb86a', D: '#305c28', f: '#f3e6ff', F: '#7a3fa0' },
  tomate: { L: '#3e8e41', l: '#6abf6c', D: '#2a6230', f: '#ffe066', F: '#e8432e' },
  framboisier: { L: '#4f8f3f', l: '#80bd66', D: '#335e29', f: '#ffffff', F: '#d6336c' },
  // Décorations végétales
  buisson: { L: '#4f9a3a', l: '#7cc25a', D: '#2f6624', f: '#ffffff', F: '#ffffff' },
  chene: { L: '#3d7a2a', l: '#5f9e3e', D: '#24521a', f: '#ffffff', F: '#8b5a2b' },
};

const VIDE = '................';

const ARBRE = [
  '.....llllll.....',
  '...llLLLLLLll...',
  '..lLLLLDLLLLLl..',
  '.lLLDLLLLLLDLLl.',
  '.LLLLLLLDLLLLLL.',
  'lLLDLLLLLLLLDLLl',
  'LLLLLLDLLLLLLLLL',
  'DLLDLLLLLLDLLLLD',
  '.DLLLLDLLLLLLLD.',
  '..DDLLLLLLLLDD..',
  '....DDDLLDDD....',
  '......DBBD......',
  '.......BB.......',
  '.......BB.......',
  '....ssBBBBss....',
  VIDE,
];

function avecPixels(base: string[], pixels: Array<[number, number, string]>): string[] {
  const lignes = base.map((l) => l.split(''));
  for (const [x, y, c] of pixels) lignes[y][x] = c;
  return lignes.map((l) => l.join(''));
}

const FLEURS: Array<[number, number, string]> = [
  [5, 1, 'f'], [10, 2, 'f'], [3, 4, 'f'], [8, 3, 'y'], [12, 4, 'f'], [6, 6, 'f'], [1, 6, 'f'],
  [14, 6, 'f'], [10, 7, 'y'], [4, 8, 'f'], [8, 9, 'f'], [12, 8, 'f'],
];

const FRUITS: Array<[number, number, string]> = [];
for (const [x, y] of [[4, 2], [10, 2], [2, 5], [7, 5], [12, 5], [5, 8], [10, 8]]) {
  FRUITS.push([x, y, 'h'], [x + 1, y, 'F'], [x, y + 1, 'F'], [x + 1, y + 1, 'F']);
}

/** Les 7 stades de croissance (niveau 0 à 6 de la répétition espacée). */
export const STADES: string[][] = [
  // 0 graine
  [VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE,
    '......ssss......',
    '.....sSyySs.....',
    '....ssSSSSss....',
    VIDE],
  // 1 germe
  [VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE,
    '......l...l.....',
    '.....lLl.lLl....',
    '......LgggL.....',
    '........g.......',
    '........g.......',
    '.....ssSgSss....',
    '....ssSSSSss....',
    VIDE],
  // 2 pousse
  [VIDE, VIDE, VIDE, VIDE, VIDE,
    '.......ll.......',
    '......lLLl......',
    '..ll...gg...ll..',
    '.lLLl..gg..lLLl.',
    '..DLLL.gg.LLLD..',
    '....LLggggLL....',
    '.......gg.......',
    '.......gg.......',
    '.....ssggss.....',
    '....ssSSSSss....',
    VIDE],
  // 3 jeune plant
  [VIDE, VIDE, VIDE,
    '......llll......',
    '....llLLLLll....',
    '...lLLLLLLLLl...',
    '..lLLDLLLLLDLl..',
    '..LLLLLLDLLLLL..',
    '.lLDLLLLLLLLDLl.',
    '.LLLLLDLLLLLLLL.',
    '..DLLLLLLLDLLD..',
    '...DDLLLLLLDD...',
    '.....DDBBDD.....',
    '.......BB.......',
    '....ssSBBSss....',
    VIDE],
  // 4 plant adulte
  ARBRE,
  // 5 en fleurs
  avecPixels(ARBRE, FLEURS),
  // 6 récoltable
  avecPixels(ARBRE, FRUITS),
];

export const DECORATIONS: Record<string, string[]> = {
  cloture: [VIDE, VIDE, VIDE, VIDE, VIDE,
    '.ww.........ww..',
    '.wb.........wb..',
    'wwwwwwwwwwwwwwww',
    'bbbbbbbbbbbbbbbb',
    '.wb.........wb..',
    'wwwwwwwwwwwwwwww',
    'bbbbbbbbbbbbbbbb',
    '.wb.........wb..',
    '.wb.........wb..',
    '.BB.........BB..',
    VIDE],
  fleurs: [VIDE, VIDE, VIDE, VIDE, VIDE,
    '...p.......v....',
    '..pyp.....vyv...',
    '...p...r...v....',
    '...g..ryr..g.y..',
    '...g...r..g.yyy.',
    '..W.g..g.g...y..',
    '.WyW.g.g.g...g..',
    '..W..ggg.g..g...',
    '..g...gg..g.g...',
    '...g...g...g....',
    VIDE],
  rocher: [VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE,
    '......eeee......',
    '....eeeeeeee....',
    '...eeWeeeeeEe...',
    '..eeeeeeeeeeEE..',
    '..eeeeeeeeeEEE..',
    '..EeeeeeeeEEEE..',
    '...EEEEEEEEEE...',
    '....gg.....gg...',
    VIDE],
  buisson: STADES[3],
  arbre: ARBRE,
  banc: [VIDE, VIDE, VIDE, VIDE, VIDE, VIDE, VIDE,
    '..wwwwwwwwwwww..',
    '..bbbbbbbbbbbb..',
    '..B..........B..',
    '..wwwwwwwwwwww..',
    '..bbbbbbbbbbbb..',
    '..B.B......B.B..',
    '..B.B......B.B..',
    VIDE, VIDE],
  lanterne: [VIDE, VIDE,
    '......kkkk......',
    '.....kkkkkk.....',
    '......kyyk......',
    '......kyyk......',
    '......kyyk......',
    '......kkkk......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '......kkkk......',
    '.....kkkkkk.....',
    VIDE],
  epouvantail: [VIDE,
    '......bbbb......',
    '....bbbbbbbb....',
    '......mmmm......',
    '......kmmk......',
    '......mmmm......',
    '.......BB.......',
    '..yrrrrrrrrrry..',
    '..y.rrrrrrrr.y..',
    '.....rrrrrr.....',
    '.....rRrrRr.....',
    '.....yyyyyy.....',
    '.......BB.......',
    '.......BB.......',
    '......BBBB......',
    VIDE],
  ruche: [VIDE, VIDE, VIDE, VIDE,
    '......yyyy......',
    '....yyyyyyyy....',
    '...oooooooooo...',
    '...yyyyyyyyyy...',
    '..oooooooooooo..',
    '..yyyykkyyyyyy..',
    '..oooooooooooo..',
    '..yyyyyyyyyyyy..',
    '...bbbbbbbbbb...',
    '...B........B...',
    '...B........B...',
    VIDE],
  puits: [VIDE,
    '...RRRRRRRRRR...',
    '..RRRRRRRRRRRR..',
    '...b........b...',
    '...b...kk...b...',
    '...b...ww...b...',
    '...b........b...',
    '..eeeeeeeeeeee..',
    '..eEeeeEeeeEee..',
    '..eeeeeeeeeeee..',
    '..EeeEeeeEeeEe..',
    '..eeeeeeeeeeee..',
    '..EEEEEEEEEEEE..',
    VIDE, VIDE, VIDE],
  panneau: [VIDE, VIDE, VIDE, VIDE,
    '..bbbbbbbbbbbb..',
    '..bwwwwwwwwwwb..',
    '..bwkkkwkkkwwb..',
    '..bwwwwwwwwwwb..',
    '..bwkkwkkkkwwb..',
    '..bwwwwwwwwwwb..',
    '..bbbbbbbbbbbb..',
    '.......BB.......',
    '.......BB.......',
    '.......BB.......',
    '......BBBB......',
    VIDE],
};

/** Palette d'une décoration végétale (les autres n'utilisent que la palette commune). */
export const PALETTE_DECORATION: Record<string, string> = { buisson: 'buisson', arbre: 'chene' };

/** Couleurs du sol selon la saison : herbe, herbe sombre, petites touches. */
export const SAISONS: Record<string, { herbe: string; sombre: string; touches: string[] }> = {
  printemps: { herbe: '#78c25a', sombre: '#62a848', touches: ['#ffffff', '#f7d84a', '#f29ac0'] },
  ete: { herbe: '#8cc152', sombre: '#74a840', touches: ['#e6d66a', '#ffffff'] },
  automne: { herbe: '#9aa54e', sombre: '#83903f', touches: ['#d9822b', '#c4562e', '#e3b23c'] },
  hiver: { herbe: '#a9c9a0', sombre: '#93b48b', touches: ['#ffffff', '#ffffff', '#e8f1ff'] },
};
