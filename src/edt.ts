// Emploi du temps dans VS Code : configuration (ENT CESI ou lien iCal), cache, actualisation, barre d'état.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { coursActuelOuProchain, coursDepuisIcs, ecrireCache, lireCache, type CacheEmploiDuTemps, type Cours } from './core/emploiDuTemps';
import { connexionEnt, ErreurEnt, seancesEnt } from './core/entCesi';
import { ajouterJours } from './core/repetition';
import { aujourdhui } from './core/texte';
import { reglages } from './config';

const SECRET_MDP = 'forge.edt.motDePasse';
const SECRET_ICS = 'forge.edt.lienIcs';
const CLE_EMAIL = 'forge.edt.email';
const CLE_SOURCE = 'forge.edt.source';

/** On ne se reconnecte pas à l'ENT plus d'une fois toutes les 10 minutes. */
const DELAI_MIN_MS = 10 * 60_000;

type Source = 'ent' | 'ics';

export class EmploiDuTemps implements vscode.Disposable {
  private readonly changement = new vscode.EventEmitter<void>();
  readonly surChangement = this.changement.event;
  private cache?: CacheEmploiDuTemps;
  private enCours?: Promise<void>;
  private derniereTentative = 0;
  erreur?: string;
  private readonly barre = vscode.window.createStatusBarItem('forge.edt', vscode.StatusBarAlignment.Left, 48);
  private readonly minuterie: NodeJS.Timeout;

  constructor(private readonly context: vscode.ExtensionContext, private readonly journal: vscode.OutputChannel) {
    this.cache = lireCache(this.fichierCache());
    this.barre.name = 'Forge — prochain cours';
    this.barre.command = 'forge.edt.ouvrir';
    this.majBarre();
    // Chaque minute : barre d'état ; toutes les 3 h : actualisation discrète
    this.minuterie = setInterval(() => {
      this.majBarre();
      this.changement.fire();
      if (this.configure() && this.cacheVieux()) void this.actualiser(false);
    }, 60_000);
    if (this.configure() && this.cacheVieux()) void this.actualiser(false);
  }

  private fichierCache(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'emploi-du-temps.json');
  }

  source(): Source | undefined {
    return this.context.globalState.get<Source>(CLE_SOURCE);
  }

  configure(): boolean {
    return !!this.source();
  }

  get cours(): Cours[] {
    return this.cache?.cours ?? [];
  }

  get misAJour(): string | undefined {
    return this.cache?.misAJour;
  }

  private cacheVieux(): boolean {
    if (!this.cache) return true;
    const heures = reglages().get<number>('edt.actualisationHeures', 3);
    const lundi = lundiDe(aujourdhui());
    return Date.now() - Date.parse(this.cache.misAJour) > heures * 3600_000 || this.cache.du > lundi;
  }

  /** Recharge l'emploi du temps (de lundi de cette semaine à 3 semaines plus tard). */
  async actualiser(manuel: boolean): Promise<void> {
    if (this.enCours) return this.enCours;
    if (!manuel && Date.now() - this.derniereTentative < DELAI_MIN_MS) return;
    this.derniereTentative = Date.now();
    this.enCours = this.charger(manuel).finally(() => {
      this.enCours = undefined;
      this.majBarre();
      this.changement.fire();
    });
    return this.enCours;
  }

  private async charger(manuel: boolean): Promise<void> {
    const source = this.source();
    if (!source) return;
    const du = lundiDe(aujourdhui());
    const au = ajouterJours(du, 20);
    try {
      let cours: Cours[];
      if (source === 'ics') {
        const lien = await this.context.secrets.get(SECRET_ICS);
        if (!lien) throw new Error('Lien iCal manquant : reconfigure l’emploi du temps.');
        const u = new URL(lien.replace(/^webcal:/i, 'https:'));
        if (u.protocol !== 'https:') throw new Error('Le lien iCal doit commencer par https://');
        const r = await fetch(u, { headers: { 'User-Agent': 'Forge (extension VS Code de révision)' } });
        if (!r.ok) throw new Error(`Le calendrier a répondu ${r.status}.`);
        cours = coursDepuisIcs(await r.text()).filter((c) => c.debut.slice(0, 10) >= ajouterJours(du, -1) && c.debut.slice(0, 10) <= ajouterJours(au, 1));
      } else {
        const email = this.context.globalState.get<string>(CLE_EMAIL) ?? '';
        const motDePasse = (await this.context.secrets.get(SECRET_MDP)) ?? '';
        const session = await connexionEnt(email, motDePasse);
        this.journal.appendLine(`[emploi du temps] connecté à l'ENT (${session.navigateur.journal.length} requêtes)`);
        cours = await seancesEnt(session, du, au);
      }
      this.cache = { source, misAJour: new Date().toISOString(), du, au, cours };
      ecrireCache(this.fichierCache(), this.cache);
      this.erreur = undefined;
      if (manuel) vscode.window.setStatusBarMessage(`📅 Emploi du temps à jour (${cours.length} cours)`, 4000);
    } catch (e) {
      this.erreur = e instanceof Error ? e.message : String(e);
      const etape = e instanceof ErreurEnt ? ` [étape : ${e.etape}]` : '';
      this.journal.appendLine(`[emploi du temps] ${this.erreur}${etape}`);
      if (manuel || (e instanceof ErreurEnt && e.identifiantsRefuses)) {
        const choix = await vscode.window.showErrorMessage(`Emploi du temps : ${this.erreur}`, 'Reconfigurer', 'Voir le journal');
        if (choix === 'Reconfigurer') await this.configurer();
        if (choix === 'Voir le journal') this.journal.show(true);
      }
    }
  }

  /** Assistant de configuration : ENT CESI (identifiants) ou lien iCal. */
  async configurer(): Promise<void> {
    const choix = await vscode.window.showQuickPick(
      [
        {
          label: '🏫 ENT CESI',
          description: 'adresse @viacesi.fr + mot de passe',
          detail: "Connexion non officielle à l'ENT (peut cesser de marcher si le CESI change ses pages). Mot de passe stocké dans le coffre-fort de VS Code.",
          source: 'ent' as Source,
        },
        {
          label: '🔗 Lien iCal (.ics)',
          description: 'si ton ENT, Outlook ou Google Agenda en fournit un',
          detail: 'Plus robuste, sans mot de passe. Le lien est stocké dans le coffre-fort de VS Code.',
          source: 'ics' as Source,
        },
        { label: '🚪 Ne plus afficher mon emploi du temps', description: 'efface les identifiants et le cache', detail: undefined, source: undefined },
      ],
      { title: '📅 Emploi du temps — d’où le récupérer ?', ignoreFocusOut: true },
    );
    if (!choix) return;
    if (!choix.source) return this.deconnecter();

    if (choix.source === 'ent') {
      const email = await vscode.window.showInputBox({
        title: 'ENT CESI (1/2) — adresse e-mail',
        value: this.context.globalState.get<string>(CLE_EMAIL) ?? '',
        placeHolder: 'prenom.nom@viacesi.fr',
        ignoreFocusOut: true,
        validateInput: (v) => (/^[^@\s]+@(viacesi|cesi)\.fr$/i.test(v.trim()) ? undefined : 'Adresse attendue : prenom.nom@viacesi.fr'),
      });
      if (!email) return;
      const motDePasse = await vscode.window.showInputBox({
        title: 'ENT CESI (2/2) — mot de passe',
        prompt: "Envoyé uniquement aux serveurs du CESI (en HTTPS). Stocké dans le coffre-fort de VS Code, jamais dans un fichier.",
        password: true,
        ignoreFocusOut: true,
      });
      if (!motDePasse) return;
      await this.context.globalState.update(CLE_EMAIL, email.trim());
      await this.context.secrets.store(SECRET_MDP, motDePasse);
    } else {
      const lien = await vscode.window.showInputBox({
        title: 'Lien iCal de ton emploi du temps',
        placeHolder: 'https://… .ics (ou webcal://…)',
        ignoreFocusOut: true,
        validateInput: (v) => (/^(https|webcal):\/\//i.test(v.trim()) ? undefined : 'Le lien doit commencer par https:// ou webcal://'),
      });
      if (!lien) return;
      await this.context.secrets.store(SECRET_ICS, lien.trim());
    }
    await this.context.globalState.update(CLE_SOURCE, choix.source);
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '📅 Récupération de ton emploi du temps…' }, () => this.actualiser(true));
    if (!this.erreur) await vscode.commands.executeCommand('forge.edt.ouvrir');
  }

  async deconnecter(): Promise<void> {
    await this.context.secrets.delete(SECRET_MDP);
    await this.context.secrets.delete(SECRET_ICS);
    await this.context.globalState.update(CLE_SOURCE, undefined);
    this.cache = undefined;
    try {
      fs.rmSync(this.fichierCache(), { force: true });
    } catch {
      // rien à effacer
    }
    this.erreur = undefined;
    this.majBarre();
    this.changement.fire();
    vscode.window.showInformationMessage('Emploi du temps déconnecté : identifiants et cache effacés.');
  }

  private majBarre(): void {
    if (!reglages().get<boolean>('edt.barreEtat', true) || !this.cache) {
      this.barre.hide();
      return;
    }
    const x = coursActuelOuProchain(this.cours);
    if (!x) {
      this.barre.hide();
      return;
    }
    const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const salle = x.cours.salles[0] ? ` · ${x.cours.salles[0]}` : '';
    const titre = x.cours.titre.length > 28 ? `${x.cours.titre.slice(0, 27)}…` : x.cours.titre;
    this.barre.text = x.enCours ? `$(clock) ${titre} → ${heure(x.cours.fin)}` : `$(clock) ${heure(x.cours.debut)} ${titre}${salle}`;
    this.barre.tooltip = `${x.enCours ? 'En cours' : 'Prochain cours'} : ${x.cours.titre}\n${heure(x.cours.debut)}–${heure(x.cours.fin)}${salle}${x.cours.intervenants.length ? `\n${x.cours.intervenants.join(', ')}` : ''}`;
    this.barre.show();
  }

  dispose(): void {
    clearInterval(this.minuterie);
    this.barre.dispose();
    this.changement.dispose();
  }
}

/** Lundi de la semaine de cette date (AAAA-MM-JJ). */
export function lundiDe(date: string): string {
  const [a, m, j] = date.split('-').map(Number);
  const jourSemaine = (new Date(a, m - 1, j).getDay() + 6) % 7; // lundi = 0
  return ajouterJours(date, -jourSemaine);
}
