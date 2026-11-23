// Examens dans VS Code : ajout, préparation (révision du programme, CCTL blanc, étude de cas blanche).

import * as fs from 'fs';
import * as vscode from 'vscode';
import { genererCctl } from './core/cctl';
import { cheminDossier } from './core/coffre';
import { ajouterExamen, examensAVenir, joursAvant, LIBELLES_EXAMEN, lireExamens, supprimerExamen, type Examen, type TypeExamen } from './core/examens';
import type { Perimetre } from './core/seance';
import { aujourdhui } from './core/texte';
import { obtenirCoffre } from './config';
import { clientIA } from './ia';
import { ouvrirEcranCctl } from './vues/ecranCctl';

export interface OutilsExamens {
  reviser(perimetre: Perimetre): void;
  etudeDeCas(programme: { titre: string; prosits: string[] }): void;
  surFin(): void;
}

function listeProsits(coffre: string): string[] {
  const dossier = cheminDossier(coffre, 'prosits');
  return fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort() : [];
}

/** « 12/01/2027 », « 12/01 » ou « 2027-01-12 » → AAAA-MM-JJ */
export function lireDateSaisie(texte: string, aujourd = aujourdhui()): string | null {
  const t = texte.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!m) return null;
  const j = Number(m[1]), mo = Number(m[2]);
  if (j < 1 || j > 31 || mo < 1 || mo > 12) return null;
  let a = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(aujourd.slice(0, 4));
  const date = `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  // Sans année : la prochaine occurrence de cette date
  if (!m[3] && date < aujourd) a++;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

export async function nouvelExamen(surFin: () => void): Promise<Examen | undefined> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const type = await vscode.window.showQuickPick(
    (Object.keys(LIBELLES_EXAMEN) as TypeExamen[]).map((t) => ({ label: LIBELLES_EXAMEN[t], type: t })),
    { title: 'Nouvel examen (1/4) — quel type ?' },
  );
  if (!type) return;
  const titre = await vscode.window.showInputBox({ title: 'Nouvel examen (2/4) — nom', value: type.type === 'cctl' ? 'CCTL POO' : 'Étude de cas POO', ignoreFocusOut: true });
  if (!titre) return;
  const saisie = await vscode.window.showInputBox({
    title: 'Nouvel examen (3/4) — date',
    placeHolder: 'JJ/MM/AAAA (ou JJ/MM)',
    ignoreFocusOut: true,
    validateInput: (v) => {
      const d = lireDateSaisie(v);
      if (!d) return 'Date attendue : JJ/MM/AAAA';
      return d < aujourdhui() ? 'Cette date est passée' : undefined;
    },
  });
  if (!saisie) return;
  const prosits = await vscode.window.showQuickPick(listeProsits(coffre).map((p) => ({ label: p, picked: true })), {
    title: 'Nouvel examen (4/4) — Prosits au programme',
    canPickMany: true,
  });
  if (!prosits || prosits.length === 0) return;
  const examen = ajouterExamen(coffre, { titre: titre.trim(), type: type.type, date: lireDateSaisie(saisie)!, prosits: prosits.map((p) => p.label) });
  surFin();
  vscode.window.showInformationMessage(
    `📅 ${examen.titre} ajouté (dans ${joursAvant(examen)} jour(s)). Dans les 3 semaines qui précèdent, les notions au programme reviendront plus souvent.`,
  );
  return examen;
}

export async function lancerCctl(context: vscode.ExtensionContext, perimetre: Perimetre, titre: string, outils: OutilsExamens): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const taille = await vscode.window.showQuickPick(
    [
      { label: '10 questions · 10 min', nombre: 10, minutes: 10 },
      { label: '20 questions · 20 min', nombre: 20, minutes: 20, description: 'recommandé' },
      { label: '30 questions · 30 min', nombre: 30, minutes: 30 },
    ],
    { title: `📝 CCTL blanc — ${titre}` },
  );
  if (!taille) return;
  const client = await clientIA(context, false);
  const questions = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: client ? "🤖 Préparation du questionnaire (questions de l'IA + tes notes)…" : 'Préparation du questionnaire…' },
    () => genererCctl(coffre, perimetre, taille.nombre, { client }),
  );
  if (questions.length < 5) {
    vscode.window.showWarningMessage('Pas assez de matière pour un questionnaire (il faut au moins 5 questions) : importe plus de CER ou ajoute ta clé DeepSeek.');
    return;
  }
  ouvrirEcranCctl(coffre, titre, questions, taille.minutes, {
    reviserErreurs: (notions, nom) => outils.reviser({ type: 'notions', noms: notions, titre: nom }),
    surFin: outils.surFin,
  });
}

/** Commande « Mes examens ». */
export async function mesExamens(context: vscode.ExtensionContext, outils: OutilsExamens): Promise<void> {
  const coffre = await obtenirCoffre();
  if (!coffre) return;
  const examens = examensAVenir(lireExamens(coffre));
  const choix = await vscode.window.showQuickPick(
    [
      ...examens.map((e) => ({
        label: `📅 ${e.titre}`,
        description: `${joursAvant(e) === 0 ? "aujourd'hui" : `dans ${joursAvant(e)} jour(s)`} · ${LIBELLES_EXAMEN[e.type]}`,
        detail: e.prosits.join(' · '),
        examen: e as Examen | undefined,
      })),
      { label: '➕ Ajouter un examen', description: '', detail: undefined, examen: undefined },
    ],
    { title: '📅 Mes examens' },
  );
  if (!choix) return;
  if (!choix.examen) {
    await nouvelExamen(outils.surFin);
    return;
  }
  await preparerExamen(context, choix.examen, outils);
}

export async function preparerExamen(context: vscode.ExtensionContext, e: Examen, outils: OutilsExamens): Promise<void> {
  const programme: Perimetre = { type: 'prosits', noms: e.prosits, titre: e.titre };
  const action = await vscode.window.showQuickPick(
    [
      { label: '🌱 Réviser le programme', detail: 'Séance sur les notions des Prosits au programme', action: 'reviser' },
      { label: '📝 CCTL blanc', detail: 'Questionnaire chronométré, note sur 20', action: 'cctl' },
      { label: '📄 Étude de cas blanche', detail: 'Sujet sur papier chronométré, corrigé sur 20 (clé DeepSeek)', action: 'papier' },
      { label: '🗑️ Supprimer cet examen', detail: undefined, action: 'supprimer' },
    ],
    { title: `📅 ${e.titre} — ${e.date}` },
  );
  if (!action) return;
  if (action.action === 'reviser') outils.reviser(programme);
  if (action.action === 'cctl') await lancerCctl(context, programme, e.titre, outils);
  if (action.action === 'papier') outils.etudeDeCas({ titre: e.titre, prosits: e.prosits });
  if (action.action === 'supprimer') {
    const coffre = await obtenirCoffre();
    if (coffre) supprimerExamen(coffre, e.id);
    outils.surFin();
  }
}
