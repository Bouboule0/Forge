// Corrections faites par l'IA pendant les séances : explication libre et validation des pistes.

import type { NotionRevision } from './notionsRevision';
import type { PisteRevision } from './pistes';
import type { StatutPiste } from './parseurCer';
import type { Resultat } from './repetition';
import { ErreurIA, type ClientIA } from './relectureIA';

const PROF =
  "Tu es professeur d'informatique en école d'ingénieurs (CESI, pédagogie par Prosits). Tu corriges un étudiant qui révise (C++, programmation orientée objet, architecture logicielle). " +
  "Tu es bienveillant mais exigeant sur l'exactitude technique. Tu ne pénalises ni l'orthographe ni le style. Tu tutoies l'étudiant. Réponds uniquement en JSON.";

// --------------------------------------------------------------------------
// Explication libre

export interface CorrectionExplication {
  resultat: Resultat;
  note: number; // sur 10
  pointsForts: string[];
  aRevoir: string[];
  modele: string; // explication modèle courte
}

const SYSTEME_EXPLICATION = `${PROF}
L'étudiant explique une notion avec ses mots. Compare à la définition de référence (si elle est vide, appuie-toi sur tes connaissances) et au niveau attendu (AAV : 2 = comprendre, 3 = mettre en œuvre, 5 = maîtriser).
Verdict : "reussite" si l'idée essentielle est juste sans erreur importante ; "moyen" si c'est partiel ou flou ; "echec" si c'est faux, hors sujet ou vide.
Format : {"verdict":"reussite|moyen|echec","note":0-10,"points_forts":["..."],"a_revoir":["..."],"modele":"explication modèle en 2 à 4 phrases (Markdown, code entre accents graves)"}`;

export async function corrigerExplication(client: ClientIA, notion: NotionRevision, explication: string): Promise<CorrectionExplication> {
  const r = (await client.json(
    SYSTEME_EXPLICATION,
    JSON.stringify({
      notion: notion.titre,
      aav: notion.etat.aavCible,
      prosits: notion.prosits,
      definition_de_reference: [...notion.definitions.map((d) => d.texte), notion.notesPerso].filter(Boolean).join('\n\n'),
      explication_de_l_etudiant: explication,
    }),
  )) as Record<string, unknown>;
  const resultat = lireVerdict(r.verdict);
  return {
    resultat,
    note: Math.max(0, Math.min(10, Number(r.note) || 0)),
    pointsForts: listeTextes(r.points_forts),
    aRevoir: listeTextes(r.a_revoir),
    modele: String(r.modele ?? '').trim(),
  };
}

// --------------------------------------------------------------------------
// Validation d'une piste de solution

export interface CorrectionPiste {
  resultat: Resultat;
  statut: StatutPiste; // statut correct de la piste
  justification: string; // justification à écrire dans le CER
  retour: string; // commentaire pour l'étudiant
}

const SYSTEME_PISTE = `${PROF}
Pendant le Prosit Aller, le groupe a émis une hypothèse (« piste de solution »). L'étudiant indique si elle est validée, validée en partie ou invalidée, avec une justification.
Détermine le bon statut, puis juge la réponse : "reussite" si le statut est bon et la justification correcte ; "moyen" si le statut est bon mais la justification fausse ou trop faible, ou si l'étudiant a répondu « en partie » alors que c'était tranché (ou l'inverse) ; "echec" si le statut est faux.
La justification à écrire dans le CER reprend les idées justes de l'étudiant, corrigées et complétées, en 1 à 3 phrases.
Format : {"statut":"validee|partielle|invalidee","verdict":"reussite|moyen|echec","justification":"...","retour":"commentaire pour l'étudiant, 1 à 3 phrases"}`;

export async function corrigerPiste(
  client: ClientIA,
  piste: PisteRevision,
  reponse: { statut: StatutPiste; justification: string },
): Promise<CorrectionPiste> {
  const r = (await client.json(
    SYSTEME_PISTE,
    JSON.stringify({
      prosit: piste.titreProsit,
      contexte: piste.contexte,
      problematique: piste.problematique,
      piste: piste.texte,
      reponse_de_l_etudiant: { statut: reponse.statut, justification: reponse.justification },
    }),
  )) as Record<string, unknown>;
  const statut = String(r.statut ?? '');
  if (!['validee', 'partielle', 'invalidee'].includes(statut)) throw new ErreurIA("Réponse de l'IA inattendue (statut de la piste).");
  return {
    resultat: lireVerdict(r.verdict),
    statut: statut as StatutPiste,
    justification: String(r.justification ?? '').trim() || reponse.justification,
    retour: String(r.retour ?? '').trim(),
  };
}

// --------------------------------------------------------------------------

/** Ce que la séance attend pour corriger avec l'IA (permet des tests sans réseau). */
export interface CorrecteurIA {
  explication(notion: NotionRevision, texte: string): Promise<CorrectionExplication>;
  piste(piste: PisteRevision, reponse: { statut: StatutPiste; justification: string }): Promise<CorrectionPiste>;
}

export function creerCorrecteur(client: ClientIA): CorrecteurIA {
  return {
    explication: (n, t) => corrigerExplication(client, n, t),
    piste: (p, r) => corrigerPiste(client, p, r),
  };
}

function lireVerdict(v: unknown): Resultat {
  if (v === 'reussite' || v === 'moyen' || v === 'echec') return v;
  throw new ErreurIA("Réponse de l'IA inattendue (verdict).");
}

function listeTextes(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [];
}
