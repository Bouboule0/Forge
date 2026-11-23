// Emploi du temps : modèle commun, lecture du JSON de l'ENT CESI, lecture d'un calendrier iCal (.ics),
// cache sur disque (pour ne pas solliciter l'ENT à chaque ouverture).

import * as fs from 'fs';
import * as path from 'path';

export interface Cours {
  id: string;
  debut: string; // ISO 8601 avec fuseau
  fin: string;
  titre: string;
  module: string;
  salles: string[];
  intervenants: string[];
  journee: boolean;
}

// --------------------------------------------------------------------------
// ENT CESI : /api/seance/all renvoie des séances au format JSON

/** « 2024-01-15T08:30:00+01 » (fuseau sans minutes) → date ISO valide. */
export function lireDateEnt(texte: string): string {
  const t = texte.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)([+-]\d{2})$/);
  if (m) return `${m[1]}${m[2]}:00`;
  return t;
}

export function coursDepuisEnt(seances: unknown): Cours[] {
  if (!Array.isArray(seances)) return [];
  return seances
    .map((s: any, i: number): Cours | null => {
      if (!s || typeof s.start !== 'string' || typeof s.end !== 'string') return null;
      const debut = lireDateEnt(s.start);
      const fin = lireDateEnt(s.end);
      if (Number.isNaN(Date.parse(debut)) || Number.isNaN(Date.parse(fin))) return null;
      const intervenants = Array.isArray(s.intervenants)
        ? s.intervenants.map((x: any) => [x?.prenom, x?.nom].filter(Boolean).join(' ').trim()).filter(Boolean)
        : [];
      return {
        id: String(s.code ?? `${debut}-${i}`),
        debut,
        fin,
        titre: String(s.title ?? s.nomModule ?? 'Cours').trim(),
        module: String(s.nomModule ?? '').trim(),
        salles: Array.isArray(s.salles) ? s.salles.map((x: any) => String(x?.nomSalle ?? '').trim()).filter(Boolean) : [],
        intervenants,
        journee: !!s.allDay,
      };
    })
    .filter((c): c is Cours => c !== null)
    .sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut));
}

// --------------------------------------------------------------------------
// Calendrier iCal (.ics)

/** Lignes « dépliées » (une ligne qui commence par un espace continue la précédente). */
function deplier(texte: string): string[] {
  return texte.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function decoderTexteIcs(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

/** Date iCal → ISO. Sans « Z » ni fuseau UTC, l'heure est considérée comme locale (Europe/Paris en pratique). */
export function lireDateIcs(valeur: string, parametres: string): { iso: string; journee: boolean } | null {
  const v = valeur.trim();
  const jour = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (jour || /VALUE=DATE(?!-)/.test(parametres)) {
    const m = jour ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { iso: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString(), journee: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [a, mo, j, h, mi, s] = m.slice(1, 7).map(Number);
  const date = m[7] === 'Z' ? new Date(Date.UTC(a, mo - 1, j, h, mi, s)) : new Date(a, mo - 1, j, h, mi, s);
  return { iso: date.toISOString(), journee: false };
}

export function coursDepuisIcs(texte: string): Cours[] {
  const cours: Cours[] = [];
  let actuel: Record<string, { valeur: string; parametres: string }> | null = null;
  for (const ligne of deplier(texte)) {
    if (ligne.startsWith('BEGIN:VEVENT')) {
      actuel = {};
      continue;
    }
    if (ligne.startsWith('END:VEVENT')) {
      if (actuel) {
        const debut = actuel.DTSTART && lireDateIcs(actuel.DTSTART.valeur, actuel.DTSTART.parametres);
        const fin = actuel.DTEND && lireDateIcs(actuel.DTEND.valeur, actuel.DTEND.parametres);
        if (debut) {
          const description = decoderTexteIcs(actuel.DESCRIPTION?.valeur ?? '');
          cours.push({
            id: actuel.UID?.valeur ?? `${debut.iso}-${cours.length}`,
            debut: debut.iso,
            fin: fin?.iso ?? debut.iso,
            titre: decoderTexteIcs(actuel.SUMMARY?.valeur ?? 'Cours'),
            module: '',
            salles: actuel.LOCATION ? decoderTexteIcs(actuel.LOCATION.valeur).split(/\s*[,;]\s*/).filter(Boolean) : [],
            intervenants: (description.match(/(?:intervenant|enseignant|professeur)s?\s*:\s*(.+)/i)?.[1] ?? '').split(/\s*,\s*/).filter(Boolean),
            journee: debut.journee,
          });
        }
      }
      actuel = null;
      continue;
    }
    if (!actuel) continue;
    const m = ligne.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (m) actuel[m[1]] = { parametres: m[2], valeur: m[3] };
  }
  return cours.sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut));
}

// --------------------------------------------------------------------------
// Cache

export interface CacheEmploiDuTemps {
  source: 'ent' | 'ics';
  misAJour: string; // ISO
  du: string; // AAAA-MM-JJ
  au: string;
  cours: Cours[];
}

export function lireCache(fichier: string): CacheEmploiDuTemps | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    return Array.isArray(c.cours) ? c : undefined;
  } catch {
    return undefined;
  }
}

export function ecrireCache(fichier: string, cache: CacheEmploiDuTemps): void {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(cache), 'utf8');
}

/** Cours d'une journée (heure locale), triés par heure. */
export function coursDuJour(cours: Cours[], jour: string): Cours[] {
  return [...cours].sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut)).filter((c) => {
    const d = new Date(c.debut);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return local === jour;
  });
}

/** Cours en cours, ou le prochain cours (dans les 24 h). */
export function coursActuelOuProchain(cours: Cours[], maintenant = new Date()): { cours: Cours; enCours: boolean } | undefined {
  const t = maintenant.getTime();
  const enCours = cours.find((c) => !c.journee && Date.parse(c.debut) <= t && t < Date.parse(c.fin));
  if (enCours) return { cours: enCours, enCours: true };
  const prochain = cours.find((c) => !c.journee && Date.parse(c.debut) > t && Date.parse(c.debut) - t < 24 * 3600_000);
  return prochain ? { cours: prochain, enCours: false } : undefined;
}
