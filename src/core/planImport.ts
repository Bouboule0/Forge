// Plan d'import : ce qui sera créé dans le coffre à partir d'un ou plusieurs CER.
// Le plan est affiché dans l'écran de validation, modifié par l'utilisateur, puis écrit.

import * as path from 'path';
import type { Aav, CerAnalyse } from './parseurCer';
import { lireNotions, trouverNoteProsit } from './coffre';
import { memeNotion, nomDepuisAav, nomFichierSur, notionPresenteDans } from './texte';

export interface PrositPlan {
  index: number;
  fichierSource: string;
  numero: number;
  titre: string;
  module: string;
  existeDeja: boolean;
  /** Remplacer la note Prosit existante (sinon on la garde telle quelle). */
  remplacer: boolean;
}

export interface DefinitionSource {
  prosit: number; // index du PrositPlan
  texte: string;
}

export interface AavLie {
  prosit: number;
  aav: Aav;
}

export interface NotionCandidate {
  id: string;
  nom: string;
  inclure: boolean;
  origine: 'mot_cle' | 'aav';
  /** Nom de la note existante dans le coffre, si la notion y est déjà. */
  existante: string | null;
  /** id d'une autre candidate dans laquelle fusionner celle-ci. */
  fusionnerDans: string | null;
  autresNoms: string[];
  prosits: number[];
  definitions: DefinitionSource[];
  aav: AavLie[];
  genereeParIA: boolean;
}

export interface PlanImport {
  coffre: string;
  prosits: PrositPlan[];
  notions: NotionCandidate[];
  analyses: CerAnalyse[];
}

export function nomNoteProsit(numero: number, titre: string): string {
  const num = `P${String(numero).padStart(2, '0')}`;
  return nomFichierSur(titre ? `${num} - ${titre}` : num);
}

/** Titre par défaut quand le CER n'en a pas : la généralisation (« Adaptabilité »…). */
function titreParDefaut(a: CerAnalyse): string {
  if (a.titre) return a.titre.replace(/[\s:!?.]+$/, '').trim();
  const generalisation = a.sections.generalisation.replace(/^[-*\s]+/, '').split('\n')[0].trim();
  return generalisation;
}

/**
 * Un CER et son Prosit Aller importés ensemble décrivent le même Prosit :
 * on garde le CER et on complète ce qui lui manque avec le Prosit Aller.
 */
export function regrouperParProsit(analyses: CerAnalyse[]): CerAnalyse[] {
  const resultat: CerAnalyse[] = [];
  for (const a of analyses) {
    const meme = a.numero !== null ? resultat.find((r) => r.numero === a.numero) : undefined;
    if (!meme) {
      resultat.push(a);
      continue;
    }
    const [principal, secondaire] = meme.type === 'cer' || a.type !== 'cer' ? [meme, a] : [a, meme];
    for (const cle of Object.keys(principal.sections) as Array<keyof CerAnalyse['sections']>) {
      if (!principal.sections[cle].trim()) principal.sections[cle] = secondaire.sections[cle];
    }
    for (const mot of secondaire.motsCles) {
      if (!principal.motsCles.some((m) => memeNotion(m.nom, mot.nom))) principal.motsCles.push(mot);
    }
    if (principal.pistes.length === 0) principal.pistes = secondaire.pistes;
    if (principal.aav.length === 0) principal.aav = secondaire.aav;
    principal.titre ||= secondaire.titre;
    principal.module ||= secondaire.module;
    principal.roles = { ...secondaire.roles, ...principal.roles };
    principal.avertissements.push(`Complété avec ${path.basename(secondaire.fichierSource)}.`);
    resultat[resultat.indexOf(meme)] = principal;
  }
  return resultat;
}

export function construirePlan(coffre: string, analysesBrutes: CerAnalyse[], moduleParDefaut: string): PlanImport {
  const analyses = regrouperParProsit(analysesBrutes);
  const existantes = lireNotions(coffre);
  const moduleCommun = analyses.find((a) => a.module)?.module ?? moduleParDefaut;

  const prosits: PrositPlan[] = analyses.map((a, index) => {
    const numero = a.numero ?? index + 1;
    const existeDeja = trouverNoteProsit(coffre, numero) !== null;
    return {
      index,
      fichierSource: a.fichierSource,
      numero,
      titre: titreParDefaut(a),
      module: a.module || moduleCommun,
      existeDeja,
      remplacer: !existeDeja,
    };
  });

  const notions: NotionCandidate[] = [];
  let compteur = 0;

  const trouverOuCreer = (nom: string, origine: NotionCandidate['origine'], genereeParIA: boolean): NotionCandidate => {
    const deja = notions.find((n) => memeNotion(n.nom, nom) || n.autresNoms.some((a) => memeNotion(a, nom)));
    if (deja) {
      if (deja.nom !== nom && !deja.autresNoms.includes(nom)) deja.autresNoms.push(nom);
      return deja;
    }
    const existante = existantes.find((e) => memeNotion(e.nom, nom) || e.aliases.some((a) => memeNotion(a, nom)));
    const candidate: NotionCandidate = {
      id: `n${++compteur}`,
      nom: existante ? existante.nom : nom,
      inclure: true,
      origine,
      existante: existante ? existante.nom : null,
      fusionnerDans: null,
      autresNoms: existante && existante.nom !== nom ? [nom] : [],
      prosits: [],
      definitions: [],
      aav: [],
      genereeParIA,
    };
    notions.push(candidate);
    return candidate;
  };

  // 1. Les mots-clés
  analyses.forEach((a, index) => {
    for (const mot of a.motsCles) {
      const c = trouverOuCreer(mot.nom, 'mot_cle', a.definitionsGenereesParIA);
      if (!c.prosits.includes(index)) c.prosits.push(index);
      if (mot.definition) c.definitions.push({ prosit: index, texte: mot.definition });
      c.genereeParIA = c.genereeParIA || a.definitionsGenereesParIA;
    }
  });

  // 2. Les AAV : rattachés aux notions qu'ils citent, sinon nouvelle notion proposée
  analyses.forEach((a, index) => {
    for (const aav of a.aav) {
      const citees = notions.filter((n) => n.prosits.includes(index) && [n.nom, ...n.autresNoms].some((nom) => notionPresenteDans(nom, aav.texte)));
      const nomPropose = nomDepuisAav(aav.texte);
      const cible = notions.find((n) => memeNotion(n.nom, nomPropose));
      if (cible) {
        rattacher(cible, index, aav);
      } else if (citees.length > 0) {
        for (const c of citees) rattacher(c, index, aav);
      } else {
        const c = trouverOuCreer(nomPropose, 'aav', false);
        rattacher(c, index, aav);
      }
    }
  });

  return { coffre, prosits, notions, analyses };
}

function rattacher(c: NotionCandidate, prosit: number, aav: Aav): void {
  if (!c.prosits.includes(prosit)) c.prosits.push(prosit);
  if (!c.aav.some((x) => x.prosit === prosit && x.aav.texte === aav.texte)) c.aav.push({ prosit, aav });
}

/**
 * Applique les fusions choisies dans l'écran de validation.
 * Renvoie uniquement les notions à écrire, avec les données des notions fusionnées.
 */
export function resoudreFusions(notions: NotionCandidate[]): NotionCandidate[] {
  const parId = new Map(notions.map((n) => [n.id, n]));
  const cibleFinale = (n: NotionCandidate): NotionCandidate => {
    const vues = new Set<string>();
    let courante = n;
    while (courante.fusionnerDans && parId.has(courante.fusionnerDans) && !vues.has(courante.id)) {
      vues.add(courante.id);
      courante = parId.get(courante.fusionnerDans)!;
    }
    return courante;
  };

  const resultat = new Map<string, NotionCandidate>();
  for (const n of notions) {
    const cible = cibleFinale(n);
    if (!cible.inclure) continue;
    if (!resultat.has(cible.id)) {
      resultat.set(cible.id, {
        ...cible,
        autresNoms: [...cible.autresNoms],
        prosits: [...cible.prosits],
        definitions: [...cible.definitions],
        aav: [...cible.aav],
      });
    }
    if (cible === n) continue;
    if (!n.inclure && n.fusionnerDans === null) continue;
    const r = resultat.get(cible.id)!;
    for (const nom of [n.nom, ...n.autresNoms]) {
      if (nom !== r.nom && !r.autresNoms.includes(nom)) r.autresNoms.push(nom);
    }
    for (const p of n.prosits) if (!r.prosits.includes(p)) r.prosits.push(p);
    r.definitions.push(...n.definitions);
    for (const a of n.aav) if (!r.aav.some((x) => x.prosit === a.prosit && x.aav.texte === a.aav.texte)) r.aav.push(a);
    r.genereeParIA = r.genereeParIA || n.genereeParIA;
  }
  return [...resultat.values()];
}
