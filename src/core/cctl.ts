// Examen blanc façon CCTL : questionnaire chronométré, note sur 20, correction à la fin seulement.
// Questions tirées des notes (QCM sur les notions, pistes validées des CER) et, si l'IA est
// disponible, questions de l'IA sur le comportement du C++.

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier } from './coffre';
import { genererQcmDefinition, genererQcmNotion, type Hasard } from './exercices';
import { ajouterHistorique, lireNotionsRevision, type NotionRevision } from './notionsRevision';
import { ETIQUETTES_STATUT, lirePistesCoffre } from './pistes';
import type { ClientIA } from './relectureIA';
import { dansPerimetre, pisteDansPerimetre, type Perimetre } from './seance';
import { aujourdhui, nomFichierSur } from './texte';

export interface QuestionCctl {
  source: 'notion' | 'piste' | 'ia';
  enonce: string; // texte brut (gras **…** permis)
  code?: string;
  options: string[];
  bonne: number;
  explication?: string;
  notion?: string; // nom de la note de notion concernée
}

export interface ResultatCctl {
  bonnes: number;
  total: number;
  note: number; // sur 20
  erreurs: number[]; // index des questions ratées (ou sans réponse)
  notionsARevoir: string[];
}

function melanger<T>(liste: T[], hasard: Hasard): T[] {
  const c = [...liste];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

const SYSTEME_QCM = `Tu écris des questions de QCM pour un examen CESI de type CCTL (questionnaire sur ordinateur) en C++ / programmation orientée objet.
Questions précises et sans ambiguïté : comportement d'un code court (ce qu'il affiche, s'il compile), règles du langage (virtual, override, héritage, surcharge, templates, constructeurs, encapsulation…), choix de conception.
Chaque question a exactement 4 propositions dont UNE seule correcte, des distracteurs plausibles. Un extrait de code (optionnel) fait au plus 15 lignes.
Réponds uniquement en JSON : {"questions":[{"question":"...","code":"(optionnel)","propositions":["...","...","...","..."],"bonne":0,"explication":"une à deux phrases","notion":"nom exact d'une des notions fournies"}]}`;

async function questionsIA(client: ClientIA, notions: NotionRevision[], nombre: number): Promise<QuestionCctl[]> {
  const r = (await client.json(
    SYSTEME_QCM,
    JSON.stringify({ nombre_de_questions: nombre, notions: notions.map((n) => ({ notion: n.titre, aav: n.etat.aavCible })) }),
  )) as { questions?: unknown[] };
  const questions: QuestionCctl[] = [];
  for (const q of Array.isArray(r.questions) ? r.questions : []) {
    const x = q as Record<string, unknown>;
    const options = Array.isArray(x.propositions) ? x.propositions.map((o) => String(o).trim()) : [];
    const bonne = Number(x.bonne);
    // On écarte toute question mal formée : 4 propositions différentes, une bonne réponse valide
    if (options.length !== 4 || new Set(options).size !== 4 || !Number.isInteger(bonne) || bonne < 0 || bonne > 3 || !String(x.question ?? '').trim()) continue;
    const notion = notions.find((n) => n.titre === x.notion || n.nom === x.notion);
    questions.push({
      source: 'ia',
      enonce: String(x.question).trim(),
      code: typeof x.code === 'string' && x.code.trim() ? x.code.trimEnd() : undefined,
      options,
      bonne,
      explication: String(x.explication ?? '').trim() || undefined,
      notion: notion?.nom,
    });
  }
  return questions.slice(0, nombre);
}

export async function genererCctl(
  coffre: string,
  perimetre: Perimetre,
  nombre: number,
  options: { client?: ClientIA; hasard?: Hasard } = {},
): Promise<QuestionCctl[]> {
  const hasard = options.hasard ?? Math.random;
  const toutes = lireNotionsRevision(coffre);
  const notions = toutes.filter((n) => dansPerimetre(n, perimetre));
  const questions: QuestionCctl[] = [];

  // 1. Questions de l'IA (environ 40 %), si elle est disponible
  if (options.client && notions.length) {
    try {
      questions.push(...(await questionsIA(options.client, notions, Math.round(nombre * 0.4))));
    } catch {
      // Pas grave : on complète avec les questions tirées des notes
    }
  }

  // 2. Pistes déjà validées de tes CER (une sur quatre au plus)
  const pistes = melanger(lirePistesCoffre(coffre).filter((p) => p.statut !== 'a_valider' && pisteDansPerimetre(p, perimetre)), hasard);
  const choix = (['validee', 'partielle', 'invalidee'] as const).map((s) => ETIQUETTES_STATUT[s]);
  for (const p of pistes.slice(0, Math.floor(nombre / 4))) {
    questions.push({
      source: 'piste',
      enonce: `Dans le Prosit « ${p.titreProsit} », cette piste de solution est-elle validée ?\n\n« ${p.texte} »`,
      options: choix,
      bonne: choix.indexOf(ETIQUETTES_STATUT[p.statut]),
      explication: p.justification || undefined,
    });
  }

  // 3. QCM sur les définitions, en faisant le tour des notions avant d'en reprendre une
  const melangees = melanger(notions, hasard);
  for (let tour = 0; questions.length < nombre && tour < 3; tour++) {
    let ajout = false;
    for (const n of melangees) {
      if (questions.length >= nombre) break;
      const q = (tour + questions.length) % 2 === 0 ? genererQcmNotion(n, toutes, hasard) : genererQcmDefinition(n, toutes, hasard);
      if (!q || !q.options || q.bonneOption === undefined) continue;
      ajout = true;
      questions.push({ source: 'notion', enonce: q.enonce ? `${q.consigne}\n\n${q.enonce}` : q.consigne, options: q.options, bonne: q.bonneOption, notion: n.nom });
    }
    if (!ajout) break;
  }
  return melanger(questions, hasard).slice(0, nombre);
}

export function corrigerCctl(questions: QuestionCctl[], reponses: Array<number | null>): ResultatCctl {
  const erreurs = questions.map((q, i) => (reponses[i] === q.bonne ? -1 : i)).filter((i) => i >= 0);
  const bonnes = questions.length - erreurs.length;
  const notionsARevoir = [...new Set(erreurs.map((i) => questions[i].notion).filter((n): n is string => !!n))];
  return {
    bonnes,
    total: questions.length,
    note: questions.length ? Math.round((200 * bonnes) / questions.length) / 10 : 0,
    erreurs,
    notionsARevoir,
  };
}

/** Historique (pièces de la ferme) + compte rendu dans le coffre. */
export function enregistrerCctl(
  coffre: string,
  titre: string,
  questions: QuestionCctl[],
  reponses: Array<number | null>,
  resultat: ResultatCctl,
  dureeMinutes: number,
): string {
  ajouterHistorique(coffre, {
    date: new Date().toISOString(),
    notion: `cctl:${titre}`,
    type: 'cctl',
    resultat: resultat.note >= 10 ? 'reussite' : resultat.note >= 7 ? 'moyen' : 'echec',
    compte: false,
    points: resultat.note,
  });
  const dossier = path.join(cheminDossier(coffre, 'exercices'), 'Examens blancs');
  fs.mkdirSync(dossier, { recursive: true });
  let chemin = path.join(dossier, nomFichierSur(`${aujourdhui()} CCTL - ${titre}`) + '.md');
  for (let i = 2; fs.existsSync(chemin); i++) chemin = chemin.replace(/( \(\d+\))?\.md$/, ` (${i}).md`);
  const lignes = [
    '---',
    'type: cctl_blanc',
    `date: ${aujourdhui()}`,
    `note: ${resultat.note}`,
    `duree: ${dureeMinutes}`,
    'tags: [forge/examen-blanc]',
    '---',
    `# 📝 CCTL blanc — ${titre}`,
    '',
    `**${resultat.note}/20** · ${resultat.bonnes}/${resultat.total} bonnes réponses · ${dureeMinutes} min`,
    '',
  ];
  if (resultat.notionsARevoir.length) lignes.push('## À retravailler', '', ...resultat.notionsARevoir.map((n) => `- [[${n}]]`), '');
  lignes.push('## Questions ratées', '');
  for (const i of resultat.erreurs) {
    const q = questions[i];
    const r = reponses[i];
    lignes.push(
      `### ${q.enonce.split('\n')[0]}`,
      '',
      ...(q.code ? ['```cpp', q.code, '```', ''] : []),
      ...q.enonce.split('\n').slice(1).filter(Boolean),
      '',
      `- Ta réponse : ${r === null || r === undefined ? '_(aucune)_' : q.options[r]}`,
      `- Bonne réponse : **${q.options[q.bonne]}**`,
      ...(q.explication ? [`- ${q.explication}`] : []),
      '',
    );
  }
  if (resultat.erreurs.length === 0) lignes.push('Aucune erreur 🎉', '');
  fs.writeFileSync(chemin, lignes.join('\n'));
  return chemin;
}
