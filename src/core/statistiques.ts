// Statistiques du tableau de bord : tout est calculé à partir des notes et de l'historique.

import { LIBELLES, type TypeExercice } from './exercices';
import { examensAVenir, joursAvant, auProgramme, LIBELLES_EXAMEN, lireExamens } from './examens';
import { lireHistorique, lireNotionsRevision, serieDeJours, type EntreeHistorique } from './notionsRevision';
import { lirePistesCoffre } from './pistes';
import { ajouterJours, joursDeRetard, plafond } from './repetition';
import { aujourdhui } from './texte';

/** Les 7 stades regroupés en 4 paliers (assez distincts pour être lus sur un graphique). */
export const PALIERS = [
  { nom: 'Graine', emoji: '🌰', niveaux: [0] },
  { nom: 'Pousse', emoji: '🌱', niveaux: [1, 2] },
  { nom: 'Plant', emoji: '🌳', niveaux: [3, 4] },
  { nom: 'Fleurs et fruits', emoji: '🍎', niveaux: [5, 6] },
];

export interface Statistiques {
  date: string;
  serie: number;
  exercicesSemaine: number;
  exercicesSemainePrecedente: number;
  reussite30: number | null; // taux sur 30 jours, 0–100
  totalNotions: number;
  maitrisees: number; // niveau 4 (🌳) ou plus
  activite: Array<{ date: string; total: number; reussis: number }>;
  prevision: Array<{ date: string; nombre: number }>;
  maitriseParProsit: Array<{ prosit: string; paliers: number[]; total: number }>;
  parType: Array<{ type: string; libelle: string; total: number; reussis: number; taux: number }>;
  aav: Array<{ niveau: number; total: number; prouvees: number }>;
  fragiles: Array<{ nom: string; titre: string; niveau: number; echecs: number; retard: number }>;
  cer: Array<{ prosit: string; validees: number; total: number }>;
  examens: Array<{ id: string; titre: string; date: string; jours: number; type: string; programme: number; pretes: number }>;
}

const LIBELLES_HISTORIQUE: Record<string, string> = {
  ...(LIBELLES as Record<TypeExercice, string>),
  long: 'Mini-projet',
  etude_de_cas: 'Étude de cas sur papier',
  cctl: 'CCTL blanc',
  rectification: 'Texte à trous (rectifié)',
};

/** Une entrée est un « exercice » (les rectifications ne sont qu'une correction d'une réponse). */
const estExercice = (e: EntreeHistorique) => e.type !== 'rectification';

export function calculerStatistiques(coffre: string, date = aujourdhui()): Statistiques {
  const notions = lireNotionsRevision(coffre);
  const historique = lireHistorique(coffre);
  const jour = (e: EntreeHistorique) => aujourdhui(new Date(e.date));

  // Activité des 30 derniers jours
  const activite = Array.from({ length: 30 }, (_, i) => ({ date: ajouterJours(date, i - 29), total: 0, reussis: 0 }));
  const indexJour = new Map(activite.map((a, i) => [a.date, i]));
  for (const e of historique) {
    const i = indexJour.get(jour(e));
    if (i === undefined || !estExercice(e)) continue;
    activite[i].total++;
    if (e.resultat === 'reussite') activite[i].reussis++;
  }
  const semaine = (debut: number, fin: number) =>
    historique.filter((e) => estExercice(e) && jour(e) > ajouterJours(date, -debut) && jour(e) <= ajouterJours(date, -fin)).length;
  const sur30 = activite.reduce((s, a) => s + a.total, 0);
  const reussis30 = activite.reduce((s, a) => s + a.reussis, 0);

  // Prévision : notions à revoir chacun des 7 prochains jours (aujourd'hui inclut les retards)
  const prevision = Array.from({ length: 7 }, (_, i) => ({ date: ajouterJours(date, i), nombre: 0 }));
  for (const n of notions) {
    const p = n.etat.prochaine ?? date;
    if (p <= date) prevision[0].nombre++;
    else {
      const i = prevision.findIndex((x) => x.date === p);
      if (i > 0) prevision[i].nombre++;
    }
  }

  // Maîtrise par Prosit
  const prosits = [...new Set(notions.flatMap((n) => n.prosits))].sort();
  const maitriseParProsit = prosits.map((prosit) => {
    const liees = notions.filter((n) => n.prosits.includes(prosit));
    return { prosit, total: liees.length, paliers: PALIERS.map((p) => liees.filter((n) => p.niveaux.includes(n.etat.niveau)).length) };
  });

  // Réussite par type d'exercice (tout l'historique)
  const parTypeMap = new Map<string, { total: number; reussis: number }>();
  for (const e of historique) {
    if (!estExercice(e)) continue;
    const t = parTypeMap.get(e.type) ?? { total: 0, reussis: 0 };
    t.total++;
    if (e.resultat === 'reussite') t.reussis++;
    parTypeMap.set(e.type, t);
  }
  const parType = [...parTypeMap.entries()]
    .map(([type, t]) => ({ type, libelle: LIBELLES_HISTORIQUE[type] ?? type, ...t, taux: Math.round((100 * t.reussis) / t.total) }))
    .sort((a, b) => b.total - a.total);

  // AAV prouvés : la notion peut atteindre le dernier stade (toutes les preuves demandées sont réunies)
  const aav = [2, 3, 5].map((niveau) => {
    const concernees = notions.filter((n) => (niveau === 2 ? n.etat.aavCible <= 2 : niveau === 3 ? n.etat.aavCible === 3 || n.etat.aavCible === 4 : n.etat.aavCible >= 5));
    return { niveau, total: concernees.length, prouvees: concernees.filter((n) => plafond(n.etat).max === 6).length };
  });

  // Notions fragiles : souvent ratées, en retard, peu avancées
  const fragiles = notions
    .map((n) => ({ nom: n.nom, titre: n.titre, niveau: n.etat.niveau, echecs: n.etat.echecs, retard: joursDeRetard(n.etat, date) }))
    .filter((n) => n.echecs > 0 || n.retard > 0)
    .sort((a, b) => b.echecs * 3 + b.retard - b.niveau - (a.echecs * 3 + a.retard - a.niveau))
    .slice(0, 5);

  // Avancement des CER : pistes de solutions validées
  const pistes = lirePistesCoffre(coffre);
  const cer = [...new Set(pistes.map((p) => p.prosit))].sort().map((prosit) => {
    const liste = pistes.filter((p) => p.prosit === prosit);
    return { prosit, total: liste.length, validees: liste.filter((p) => p.statut !== 'a_valider').length };
  });

  const examens = examensAVenir(lireExamens(coffre), date).map((e) => {
    const programme = notions.filter((n) => auProgramme(n, e));
    return {
      id: e.id,
      titre: e.titre,
      date: e.date,
      jours: joursAvant(e, date),
      type: LIBELLES_EXAMEN[e.type],
      programme: programme.length,
      pretes: programme.filter((n) => n.etat.niveau >= 3).length,
    };
  });

  return {
    date,
    serie: serieDeJours(historique, date),
    exercicesSemaine: semaine(7, 0),
    exercicesSemainePrecedente: semaine(14, 7),
    reussite30: sur30 ? Math.round((100 * reussis30) / sur30) : null,
    totalNotions: notions.length,
    maitrisees: notions.filter((n) => n.etat.niveau >= 4).length,
    activite,
    prevision,
    maitriseParProsit,
    parType,
    aav,
    fragiles,
    cer,
    examens,
  };
}
