// Export d'une note Prosit (Markdown) vers le format CER de CESI, prêt pour pandoc → .docx.

import * as fs from 'fs';
import * as path from 'path';
import { cheminDossier, DOSSIERS, lireNote } from './coffre';
import { lireBloc } from './blocs';
import { lirePistes, STATUT_WORD } from './pistes';
import { nomFichierSur } from './texte';

/** [[a|b]] → b, [[a]] → a, ![[img.png]] → image du dossier Ressources. */
export function retirerLiensObsidian(md: string): string {
  return md
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, nom: string) => `![](<${DOSSIERS.images.replace(/\\/g, '/')}/${nom.trim()}>)`)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
}

function echapperCellule(texte: string): string {
  return texte.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/** Première définition de la notion, de préférence celle écrite pour ce Prosit. */
function definitionNotion(coffre: string, nom: string, nomProsit: string): string {
  const chemin = path.join(cheminDossier(coffre, 'notions'), `${nomFichierSur(nom)}.md`);
  if (!fs.existsSync(chemin)) return '';
  const { content } = lireNote(chemin);
  // « **Corrigée par l'IA** (date) » n'est qu'une étiquette
  const defs = (lireBloc(content, 'definitions') ?? '').replace(/^\s*\*\*(Corrigée|Écrite) par l'IA\*\*[^\n]*\n+/, '');
  const morceaux = defs.split(/\*\*D'après \[\[([^\]]+)\]\]\*\*/);
  // morceaux = [avant, prosit1, texte1, prosit2, texte2...]
  let choisie = morceaux.length > 2 ? morceaux[2] : defs;
  for (let i = 1; i + 1 < morceaux.length; i += 2) {
    if (morceaux[i] === nomProsit) choisie = morceaux[i + 1];
  }
  // La section « Mes notes » de l'utilisateur prime si elle commence par une définition
  return choisie.trim().startsWith('_') ? '' : choisie.trim();
}

/**
 * Construit le Markdown au format CER à partir d'une note Prosit du coffre.
 * Renvoie aussi le nom proposé pour le fichier .docx.
 */
export function construireCer(coffre: string, cheminNote: string): { markdown: string; nomFichier: string } {
  const { data, content } = lireNote(cheminNote);
  const nomProsit = path.basename(cheminNote, '.md');
  const numero = Number(data.numero) || Number(nomProsit.match(/^P(\d+)/)?.[1]) || 0;
  const titre = String(data.titre ?? '').trim();
  const module = retirerLiensObsidian(String(data.module ?? '')).trim();

  const entete: string[] = [`**CER – Prosit ${numero}${titre ? ` : ${titre}` : ''}**`, ''];
  if (module) entete.push(`**Module : ${module}**`, '');
  const roles = data.roles && typeof data.roles === 'object' ? (data.roles as Record<string, string>) : {};
  for (const [role, nom] of Object.entries(roles)) entete.push(`${role.charAt(0).toUpperCase()}${role.slice(1)} : ${nom}`, '');

  const aav = (lireBloc(content, 'aav') ?? '')
    .split('\n')
    .map((l) => l.match(/^- \*\*\[(\d)\]\*\*\s*(.*?)(\s*→.*)?$/))
    .filter((m): m is RegExpMatchArray => !!m && !m[2].startsWith('…'))
    .map((m) => `\\[${m[1]}\\] ${m[2]}`);
  if (aav.length) entete.push('AAV :', '', ...aav.flatMap((l) => [l, '']));

  // Tableau des mots-clés avec les définitions des notes de notions
  const motsCles = (lireBloc(content, 'mots-cles') ?? '')
    .split('\n')
    .map((l) => l.match(/^- \[\[([^\]|]+)(?:\|[^\]]*)?\]\]/)?.[1])
    .filter((x): x is string => !!x);
  const tableau = motsCles.length
    ? [
        '| Mot-clé | Définition |',
        '| --- | --- |',
        ...motsCles.map((m) => `| **${echapperCellule(m)}** | ${echapperCellule(retirerLiensObsidian(definitionNotion(coffre, m, nomProsit)))} |`),
      ].join('\n')
    : '';

  const pistes = lirePistes(lireBloc(content, 'pistes') ?? '');
  const listePistes = pistes.map((p) => `- ${p.texte}`).join('\n');
  const tableauValidation = pistes.length
    ? [
        '**Validation des pistes de solutions**',
        '',
        '| Pistes de solutions | Validée / Invalidée | Justification |',
        '| --- | --- | --- |',
        ...pistes.map((p) => `| ${echapperCellule(p.texte)} | ${STATUT_WORD[p.statut]} | ${echapperCellule(p.justification)} |`),
      ].join('\n')
    : '';

  // Corps : on retire le titre, les AAV, et on remplace les blocs gérés par Forge
  let corps = content
    .replace(/^# .*\n/, '')
    .replace(/## Objectifs \(AAV\)\s*\n[\s\S]*?<!-- \/forge:aav -->\s*/, '')
    .replace(/<!-- forge:mots-cles -->[\s\S]*?<!-- \/forge:mots-cles -->/, () => tableau)
    .replace(/\n> Les définitions sont dans chaque note de notion\.\n/, '\n')
    .replace(/<!-- forge:pistes -->[\s\S]*?<!-- \/forge:pistes -->/, () => listePistes)
    .replace(/<!-- \/?forge:[\w-]+ -->\n?/g, '');

  // Le tableau de validation va à la fin du Bilan (avant « Sources »)
  if (tableauValidation) {
    if (/^### Sources\s*$/m.test(corps)) corps = corps.replace(/^### Sources\s*$/m, `${tableauValidation}\n\n### Sources`);
    else corps = `${corps.trimEnd()}\n\n${tableauValidation}\n`;
  }

  // Les titres de la note sont un cran plus bas que dans le CER Word
  corps = corps.replace(/^#(#{1,5}) /gm, '$1 ');
  const markdown = retirerLiensObsidian(`${entete.join('\n')}\n${corps}`).replace(/\n{3,}/g, '\n\n');
  const nomFichier = nomFichierSur(`CER - Prosit ${numero}${titre ? ` - ${titre}` : ''}`) + '.docx';
  return { markdown, nomFichier };
}
