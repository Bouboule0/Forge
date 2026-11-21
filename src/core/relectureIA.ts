// Relecture des définitions par l'IA (DeepSeek) : elle valide les bonnes,
// corrige les fausses ou imprécises, et écrit celles qui manquent.
// L'ancienne définition reste visible dans la note (encadré repliable).

import * as fs from 'fs';
import * as path from 'path';
import { ecrireNote, lireNote } from './coffre';
import { bloc, lireBloc, remplacerBloc, retirerAvertissementIA } from './ecritureCoffre';
import { lireNotionsRevision, type NotionRevision } from './notionsRevision';
import { aujourdhui } from './texte';

// --------------------------------------------------------------------------
// Client IA (compatible API OpenAI : DeepSeek)

export interface ClientIA {
  /** Envoie un échange et renvoie la réponse JSON déjà analysée. */
  json(systeme: string, utilisateur: string): Promise<unknown>;
}

export class ErreurIA extends Error {
  constructor(message: string, readonly statut?: number) {
    super(message);
  }
}

export function creerClientDeepSeek(cle: string, url = 'https://api.deepseek.com', modele = 'deepseek-chat'): ClientIA {
  return {
    async json(systeme, utilisateur) {
      let reponse: Response;
      try {
        reponse = await fetch(`${url.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
          body: JSON.stringify({
            model: modele,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systeme },
              { role: 'user', content: utilisateur },
            ],
          }),
        });
      } catch (e) {
        throw new ErreurIA(`Impossible de joindre DeepSeek (${e instanceof Error ? e.message : e}). Vérifie ta connexion.`);
      }
      if (!reponse.ok) {
        const detail = await reponse.text().catch(() => '');
        const messages: Record<number, string> = {
          401: 'Clé DeepSeek refusée. Vérifie-la avec « Forge : Configurer la clé DeepSeek ».',
          402: 'Crédit DeepSeek épuisé. Recharge ton compte sur platform.deepseek.com.',
          429: 'Trop de requêtes envoyées à DeepSeek. Réessaie dans une minute.',
        };
        throw new ErreurIA(messages[reponse.status] ?? `DeepSeek a répondu ${reponse.status} : ${detail.slice(0, 200)}`, reponse.status);
      }
      const donnees = (await reponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return analyserJson(donnees.choices?.[0]?.message?.content ?? '');
    },
  };
}

/** Analyse du JSON renvoyé par le modèle (tolère les blocs ```json). */
export function analyserJson(texte: string): unknown {
  const nettoye = texte.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(nettoye);
  } catch {
    const debut = nettoye.indexOf('{');
    const fin = nettoye.lastIndexOf('}');
    if (debut >= 0 && fin > debut) return JSON.parse(nettoye.slice(debut, fin + 1));
    throw new ErreurIA("La réponse de l'IA n'est pas du JSON valide.");
  }
}

// --------------------------------------------------------------------------
// Relecture

export const SYSTEME_RELECTURE = `Tu es professeur d'informatique en école d'ingénieurs (CESI). Tu relis les fiches de révision d'un étudiant sur la programmation (C++, programmation orientée objet, architecture logicielle).
Pour chaque notion :
- si la définition est juste et suffisamment précise pour réviser : verdict "correcte" ;
- si elle contient une erreur technique, une imprécision gênante ou une confusion : verdict "a_corriger", avec une définition corrigée ;
- si aucune définition n'est fournie : verdict "manquante", avec une définition.
Ne corrige pas pour de simples détails de style. Une définition corrigée ou écrite fait 2 à 4 phrases, en français, adaptée au contexte du Prosit (exemples en C++ bienvenus, en Markdown, code entre accents graves).
Réponds uniquement avec un objet JSON : {"resultats":[{"id":"...","verdict":"correcte|a_corriger|manquante","raison":"une phrase","definition":"..."}]}`;

export interface ResultatRelecture {
  correctes: string[];
  corrigees: Array<{ nom: string; titre: string; raison: string }>;
  ecrites: Array<{ nom: string; titre: string }>;
  erreurs: string[];
  rapport?: string;
}

interface VerdictIA {
  id: string;
  verdict: 'correcte' | 'a_corriger' | 'manquante';
  raison?: string;
  definition?: string;
}

/** Notions à faire relire : définitions générées par IA pas encore relues, ou définitions manquantes. */
export function notionsARelire(notions: NotionRevision[], toutes = false): NotionRevision[] {
  return notions.filter((n) => {
    if (toutes) return true;
    if (n.revueIA === 'ok' || n.revueIA === 'corrigee' || n.revueIA === 'ecrite') return false;
    return n.revueIA === 'a_faire' || n.statut === 'a_verifier' || n.definitions.length === 0;
  });
}

function demande(lot: NotionRevision[]): string {
  return JSON.stringify(
    {
      notions: lot.map((n, i) => ({
        id: String(i),
        notion: n.titre,
        autres_noms: n.aliases,
        module: n.module,
        prosits: n.prosits,
        definitions: n.definitions.map((d) => d.texte),
      })),
    },
    null,
    1,
  );
}

function lireVerdicts(reponse: unknown): VerdictIA[] {
  const r = reponse as { resultats?: unknown };
  if (!r || !Array.isArray(r.resultats)) throw new ErreurIA('Réponse de l\'IA inattendue (pas de « resultats »).');
  return r.resultats.filter((v): v is VerdictIA => !!v && typeof v === 'object' && 'id' in v && 'verdict' in v);
}

export async function relireDefinitions(
  coffre: string,
  client: ClientIA,
  options: {
    accepter: boolean;
    toutes?: boolean;
    taille?: number;
    date?: string;
    progression?: (fait: number, total: number) => void;
    annule?: () => boolean;
  },
): Promise<ResultatRelecture> {
  const date = options.date ?? aujourdhui();
  const notions = notionsARelire(lireNotionsRevision(coffre), options.toutes);
  const resultat: ResultatRelecture = { correctes: [], corrigees: [], ecrites: [], erreurs: [] };
  const taille = options.taille ?? 6;

  for (let i = 0; i < notions.length; i += taille) {
    if (options.annule?.()) break;
    const lot = notions.slice(i, i + taille);
    options.progression?.(i, notions.length);
    let verdicts: VerdictIA[];
    try {
      verdicts = lireVerdicts(await client.json(SYSTEME_RELECTURE, demande(lot)));
    } catch (e) {
      if (e instanceof ErreurIA && (e.statut === 401 || e.statut === 402)) throw e; // inutile de continuer
      resultat.erreurs.push(`${lot.map((n) => n.titre).join(', ')} : ${e instanceof Error ? e.message : e}`);
      continue;
    }
    lot.forEach((n, j) => {
      const v = verdicts.find((x) => String(x.id) === String(j));
      if (!v) {
        resultat.erreurs.push(`${n.titre} : pas de réponse de l'IA`);
        return;
      }
      const definition = (v.definition ?? '').trim();
      if (v.verdict === 'correcte' && n.definitions.length > 0) {
        marquerRelue(n.chemin, 'ok', options.accepter);
        resultat.correctes.push(n.titre);
      } else if (definition) {
        const mode = n.definitions.length === 0 ? 'ecrite' : 'corrigee';
        appliquerDefinitionIA(n.chemin, definition, v.raison ?? '', mode, options.accepter, date);
        if (mode === 'ecrite') resultat.ecrites.push({ nom: n.nom, titre: n.titre });
        else resultat.corrigees.push({ nom: n.nom, titre: n.titre, raison: v.raison ?? '' });
      } else {
        resultat.erreurs.push(`${n.titre} : verdict « ${v.verdict} » sans définition`);
      }
    });
  }
  options.progression?.(notions.length, notions.length);
  if (resultat.corrigees.length || resultat.ecrites.length || resultat.erreurs.length) {
    resultat.rapport = ecrireRapport(coffre, resultat, date);
  }
  return resultat;
}

function marquerRelue(chemin: string, revue: 'ok' | 'corrigee' | 'ecrite', accepter: boolean): void {
  const { data, content } = lireNote(chemin);
  data.revue_ia = revue;
  let texte = content;
  if (accepter) {
    data.statut = 'verifie';
    texte = retirerAvertissementIA(texte);
  }
  ecrireNote(chemin, data, texte);
}

/**
 * Remplace la définition par celle de l'IA. Les anciennes définitions sont gardées
 * dans un encadré repliable et listées dans l'en-tête (pour qu'un réimport ne les remette pas).
 */
export function appliquerDefinitionIA(
  chemin: string,
  definition: string,
  raison: string,
  mode: 'corrigee' | 'ecrite',
  accepter: boolean,
  date = aujourdhui(),
): void {
  const { data, content } = lireNote(chemin);
  const ancien = lireBloc(content, 'definitions') ?? '';
  const prositsRemplaces = [...ancien.matchAll(/\*\*D'après \[\[([^\]]+)\]\]\*\*/g)].map((m) => m[1]);
  const etiquette = mode === 'ecrite' ? `**Écrite par l'IA** (${date})` : `**Corrigée par l'IA** (${date})`;
  let texte = remplacerBloc(content, 'definitions', `${etiquette}\n\n${definition}`);

  if (mode === 'corrigee' && ancien.trim()) {
    const cite = ancien
      .trim()
      .replace(/\*\*D'après \[\[([^\]]+)\]\]\*\*/g, '*D\'après $1*')
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    const encadre = bloc('ancienne-definition', `> [!quote]- Définition d'origine (remplacée par l'IA le ${date})\n> **Pourquoi :** ${raison || 'imprécise'}\n>\n${cite}`);
    texte = texte.replace(/(<!-- \/forge:definitions -->)(\n\n<!-- forge:ancienne-definition -->[\s\S]*?<!-- \/forge:ancienne-definition -->)?/, `$1\n\n${encadre}`);
  }

  data.revue_ia = mode;
  if (prositsRemplaces.length) {
    const deja = Array.isArray(data.definitions_remplacees) ? data.definitions_remplacees.map(String) : [];
    data.definitions_remplacees = [...new Set([...deja, ...prositsRemplaces.map((p) => `[[${p}]]`)])];
  }
  if (accepter) {
    data.statut = 'verifie';
    texte = retirerAvertissementIA(texte);
  }
  ecrireNote(chemin, data, texte);
}

function ecrireRapport(coffre: string, r: ResultatRelecture, date: string): string {
  const dossier = path.join(coffre, 'Rapports');
  fs.mkdirSync(dossier, { recursive: true });
  const chemin = path.join(dossier, `Relecture IA ${date}.md`);
  const lignes = [
    `# 🤖 Relecture des définitions — ${date}`,
    '',
    `${r.correctes.length} correcte(s) · ${r.corrigees.length} corrigée(s) · ${r.ecrites.length} écrite(s)${r.erreurs.length ? ` · ${r.erreurs.length} erreur(s)` : ''}`,
    '',
  ];
  if (r.corrigees.length) {
    lignes.push('## ✏️ Corrigées', '', ...r.corrigees.map((c) => `- [[${c.nom}|${c.titre}]] — ${c.raison}`), '');
  }
  if (r.ecrites.length) lignes.push('## 📝 Écrites (il n\'y avait pas de définition)', '', ...r.ecrites.map((n) => `- [[${n.nom}|${n.titre}]]`), '');
  if (r.erreurs.length) lignes.push('## ⚠️ Erreurs', '', ...r.erreurs.map((e) => `- ${e}`), '');
  lignes.push('> L\'ancienne version reste visible dans chaque note (encadré « Définition d\'origine »). Tu peux toujours modifier une définition à la main.');
  // Plusieurs relectures le même jour : on ajoute à la suite
  const contenu = lignes.join('\n') + '\n';
  if (fs.existsSync(chemin)) fs.appendFileSync(chemin, `\n---\n\n${contenu}`);
  else fs.writeFileSync(chemin, contenu);
  return chemin;
}
