// Mode « sur papier » : étude de cas chronométrée, comme aux examens CESI.
// L'IA écrit le sujet (avec barème et corrigé), l'étudiant répond sans compilateur
// ni autocomplétion, puis l'IA corrige comme un correcteur d'examen (note sur 20).

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier } from './coffre';
import { ajouterHistorique, ajouterPreuve, type NotionRevision } from './notionsRevision';
import { ErreurIA, type ClientIA } from './relectureIA';
import { aujourdhui, nomFichierSur } from './texte';

export interface QuestionEtude {
  numero: number;
  enonce: string; // Markdown
  type: 'code' | 'texte';
  points: number;
  corrige: string; // Markdown
  criteres: string[];
}

export interface EtudeDeCas {
  titre: string;
  contexte: string; // Markdown
  dureeMinutes: number;
  questions: QuestionEtude[];
}

export interface CorrectionEtude {
  questions: Array<{ numero: number; points: number; max: number; commentaire: string }>;
  note: number; // sur 20
  appreciation: string;
}

const SYSTEME_SUJET = `Tu es enseignant au CESI et tu écris une ÉTUDE DE CAS d'examen, à faire SUR PAPIER (sans compilateur), en programmation C++ / POO.
Le sujet s'inspire du contexte du Prosit fourni mais propose une situation nouvelle. Il comporte 3 à 5 questions progressives : écrire du code C++ (classes, héritage, méthodes virtuelles, surcharge, templates… selon les notions), expliquer un choix de conception, prédire un comportement, éventuellement décrire un diagramme de classes en texte.
Barème total : 20 points. Durée indiquée par l'étudiant. Pour chaque question, donne un corrigé complet et des critères de notation précis.
Réponds uniquement en JSON : {"titre":"...","contexte":"mise en situation (Markdown)","questions":[{"numero":1,"enonce":"... (Markdown)","type":"code|texte","points":4,"corrige":"... (Markdown, code entre \`\`\`cpp)","criteres":["...","..."]}]}`;

const SYSTEME_CORRECTION = `Tu es correcteur d'examen au CESI. Tu corriges une copie d'étude de cas écrite SUR PAPIER : pas de compilateur, donc tu tolères les petites fautes de syntaxe sans conséquence (point-virgule oublié…) mais tu pénalises les erreurs de logique, de conception et de C++ (oubli de virtual, mauvais héritage, fuite mémoire…).
Note chaque question selon son barème et ses critères, avec des demi-points si besoin. Commentaire bienveillant et précis (ce qui est juste, ce qui manque), en tutoyant l'étudiant. Une réponse vide vaut 0.
Réponds uniquement en JSON : {"questions":[{"numero":1,"points":3.5,"commentaire":"..."}],"appreciation":"2 à 3 phrases sur la copie"}`;

export async function genererEtude(
  client: ClientIA,
  cible: { titre: string; contexte: string; problematique: string; notions: NotionRevision[] },
  dureeMinutes: number,
): Promise<EtudeDeCas> {
  const r = (await client.json(
    SYSTEME_SUJET,
    JSON.stringify({
      prosit: cible.titre,
      contexte: cible.contexte,
      problematique: cible.problematique,
      notions: cible.notions.map((n) => ({ notion: n.titre, aav: n.etat.aavCible })),
      duree_minutes: dureeMinutes,
    }),
  )) as Record<string, unknown>;
  const questions = (Array.isArray(r.questions) ? r.questions : []).map((q: any, i: number) => ({
    numero: Number(q?.numero) || i + 1,
    enonce: String(q?.enonce ?? '').trim(),
    type: q?.type === 'code' ? 'code' : 'texte',
    points: Math.max(0, Number(q?.points) || 0),
    corrige: String(q?.corrige ?? '').trim(),
    criteres: Array.isArray(q?.criteres) ? q.criteres.map(String) : [],
  })) as QuestionEtude[];
  if (questions.length === 0 || questions.some((q) => !q.enonce)) throw new ErreurIA("Le sujet proposé par l'IA est incomplet.");
  // Barème ramené à 20 points si l'IA s'est trompée dans ses additions
  const total = questions.reduce((s, q) => s + q.points, 0);
  if (total > 0 && Math.abs(total - 20) > 0.01) for (const q of questions) q.points = Math.round((q.points * 20 * 2) / total) / 2;
  return { titre: String(r.titre ?? 'Étude de cas').trim(), contexte: String(r.contexte ?? '').trim(), dureeMinutes, questions };
}

export async function corrigerEtude(client: ClientIA, etude: EtudeDeCas, copies: string[]): Promise<CorrectionEtude> {
  const r = (await client.json(
    SYSTEME_CORRECTION,
    JSON.stringify({
      sujet: etude.contexte,
      questions: etude.questions.map((q, i) => ({
        numero: q.numero,
        enonce: q.enonce,
        bareme: q.points,
        corrige: q.corrige,
        criteres: q.criteres,
        copie_de_l_etudiant: copies[i]?.trim() || '(vide)',
      })),
    }),
  )) as Record<string, unknown>;
  const notes = Array.isArray(r.questions) ? (r.questions as any[]) : [];
  const questions = etude.questions.map((q, i) => {
    const n = notes.find((x) => Number(x?.numero) === q.numero) ?? notes[i];
    const vide = !copies[i]?.trim();
    return {
      numero: q.numero,
      max: q.points,
      // Une réponse vide vaut 0, quoi qu'en dise l'IA ; et jamais plus que le barème
      points: vide ? 0 : Math.max(0, Math.min(q.points, Math.round((Number(n?.points) || 0) * 2) / 2)),
      commentaire: String(n?.commentaire ?? (vide ? 'Pas de réponse.' : '')).trim(),
    };
  });
  const note = Math.round(questions.reduce((s, q) => s + q.points, 0) * 2) / 2;
  return { questions, note, appreciation: String(r.appreciation ?? '').trim() };
}

/** Enregistre sujet, copie et correction dans le coffre ; donne les preuves d'AAV si la copie a la moyenne. */
export function enregistrerEtude(
  coffre: string,
  prosit: string,
  etude: EtudeDeCas,
  copies: string[],
  correction: CorrectionEtude,
  notions: NotionRevision[],
  dureeReelle: number,
): string {
  const dossier = path.join(cheminDossier(coffre, 'exercices'), nomFichierSur(prosit));
  fs.mkdirSync(dossier, { recursive: true });
  let chemin = path.join(dossier, nomFichierSur(`${aujourdhui()} Étude de cas - ${etude.titre}`) + '.md');
  for (let i = 2; fs.existsSync(chemin); i++) chemin = chemin.replace(/( \(\d+\))?\.md$/, ` (${i}).md`);

  const lignes = [
    '---',
    'type: etude_de_cas',
    `prosit: "[[${prosit}]]"`,
    `date: ${aujourdhui()}`,
    `note: ${correction.note}`,
    `duree_prevue: ${etude.dureeMinutes}`,
    `duree_reelle: ${dureeReelle}`,
    'tags: [forge/etude-de-cas]',
    '---',
    `# 📝 Étude de cas — ${etude.titre}`,
    '',
    `**Note : ${correction.note}/20** · ${dureeReelle} min sur ${etude.dureeMinutes} prévues`,
    '',
    correction.appreciation ? `> ${correction.appreciation}` : '',
    '',
    '## Sujet',
    '',
    etude.contexte,
    '',
  ];
  etude.questions.forEach((q, i) => {
    const c = correction.questions[i];
    lignes.push(
      `### Question ${q.numero} (${q.points} pts)`,
      '',
      q.enonce,
      '',
      '**Ma copie :**',
      '',
      q.type === 'code' ? `\`\`\`cpp\n${copies[i]?.trimEnd() || '(vide)'}\n\`\`\`` : copies[i]?.trim() || '_(vide)_',
      '',
      `**Correction : ${c.points}/${c.max}** — ${c.commentaire}`,
      '',
      `> [!success]- Corrigé`,
      ...q.corrige.split('\n').map((l) => `> ${l}`),
      '',
    );
  });
  lignes.push('## Notions', '', ...notions.map((n) => `- [[${n.nom}]]`), '');
  fs.writeFileSync(chemin, lignes.join('\n'));

  ajouterHistorique(coffre, {
    date: new Date().toISOString(),
    notion: `etude:${prosit}`,
    type: 'etude_de_cas',
    resultat: correction.note >= 10 ? 'reussite' : correction.note >= 7 ? 'moyen' : 'echec',
    compte: false,
    points: correction.note,
  });

  // La moyenne prouve l'AAV « savoir faire sur papier » (et un exercice long si l'épreuve dure 30 min ou plus)
  if (correction.note >= 10) {
    for (const n of notions) {
      ajouterPreuve(n.chemin, 'papier');
      if (etude.dureeMinutes >= 30) ajouterPreuve(n.chemin, 'long');
    }
  }
  return chemin;
}
