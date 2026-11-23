// Connexion à l'ENT CESI pour lire l'emploi du temps.
// Adapté du parcours de connexion de la bibliothèque go-cesi (github.com/mateo08c/go-cesi, licence MIT),
// avec deux différences de sécurité : les certificats HTTPS sont TOUJOURS vérifiés, et les identifiants
// ne sont envoyés qu'à un serveur autorisé (cesi.fr / viacesi.fr) en HTTPS.
//
// Parcours : ent.cesi.fr → wayf.cesi.fr (SAML) → page de connexion CESI (identifiants) → retour ENT (SAML)
// → page « emploi du temps » (code personne) → /api/seance/all (JSON).
//
// Ce n'est PAS une API officielle : si le CESI change ses pages, la connexion peut cesser de marcher.

import { parse, type HTMLElement } from 'node-html-parser';
import { coursDepuisEnt, type Cours } from './emploiDuTemps';

export interface AdressesEnt {
  ent: string; // https://ent.cesi.fr
  wayf: string; // https://wayf.cesi.fr
  /** Domaines auxquels on accepte d'envoyer des requêtes (et le mot de passe). */
  domainesAutorises: string[];
  /** Pour les tests uniquement : accepter http:// */
  autoriserHttp?: boolean;
}

export const ADRESSES_CESI: AdressesEnt = {
  ent: 'https://ent.cesi.fr',
  wayf: 'https://wayf.cesi.fr',
  domainesAutorises: ['cesi.fr', 'viacesi.fr'],
};

export class ErreurEnt extends Error {
  constructor(message: string, readonly etape: string, readonly identifiantsRefuses = false) {
    super(message);
  }
}

// --------------------------------------------------------------------------
// Petit navigateur : cookies + redirections, limité aux domaines autorisés

interface Cookie {
  nom: string;
  valeur: string;
  domaine: string; // sans point initial
  sousDomaines: boolean;
  chemin: string;
}

export class Navigateur {
  private cookies: Cookie[] = [];
  readonly journal: string[] = [];

  constructor(private readonly adresses: AdressesEnt, private readonly agent = 'Forge (extension VS Code de révision)') {}

  verifierAdresse(url: string): URL {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(this.adresses.autoriserHttp && u.protocol === 'http:')) {
      throw new ErreurEnt(`Adresse refusée (pas en HTTPS) : ${u.host}`, 'sécurité');
    }
    const hote = u.hostname.toLowerCase();
    const ok = this.adresses.domainesAutorises.some((d) => hote === d || hote.endsWith(`.${d}`));
    if (!ok) throw new ErreurEnt(`Adresse refusée : ${hote} n'est pas un serveur du CESI. Par sécurité, Forge s'arrête là.`, 'sécurité');
    return u;
  }

  private enTete(u: URL): string {
    const hote = u.hostname.toLowerCase();
    return this.cookies
      .filter((c) => (c.sousDomaines ? hote === c.domaine || hote.endsWith(`.${c.domaine}`) : hote === c.domaine) && u.pathname.startsWith(c.chemin))
      .map((c) => `${c.nom}=${c.valeur}`)
      .join('; ');
  }

  private enregistrerCookies(u: URL, entetes: Headers): void {
    for (const brut of entetes.getSetCookie()) {
      const [paire, ...attributs] = brut.split(';');
      const egal = paire.indexOf('=');
      if (egal <= 0) continue;
      const nom = paire.slice(0, egal).trim();
      const valeur = paire.slice(egal + 1).trim();
      let domaine = u.hostname.toLowerCase();
      let sousDomaines = false;
      let chemin = '/';
      let expire = false;
      for (const a of attributs) {
        const [cle, ...reste] = a.trim().split('=');
        const v = reste.join('=').trim();
        if (/^domain$/i.test(cle) && v) {
          domaine = v.replace(/^\./, '').toLowerCase();
          sousDomaines = true;
        } else if (/^path$/i.test(cle) && v) chemin = v;
        else if (/^max-age$/i.test(cle) && Number(v) <= 0) expire = true;
        else if (/^expires$/i.test(cle) && Date.parse(v) < Date.now()) expire = true;
      }
      this.cookies = this.cookies.filter((c) => !(c.nom === nom && c.domaine === domaine && c.chemin === chemin));
      if (!expire) this.cookies.push({ nom, valeur, domaine, sousDomaines, chemin });
    }
  }

  /** Requête avec suivi des redirections (chaque étape est vérifiée). */
  async requete(url: string, options: { methode?: 'GET' | 'POST'; formulaire?: Record<string, string> } = {}): Promise<{ url: string; statut: number; texte: string }> {
    let u = this.verifierAdresse(url);
    let methode = options.methode ?? 'GET';
    let corps: string | undefined = options.formulaire ? new URLSearchParams(options.formulaire).toString() : undefined;
    for (let saut = 0; saut < 15; saut++) {
      const entetes: Record<string, string> = { 'User-Agent': this.agent, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' };
      const cookies = this.enTete(u);
      if (cookies) entetes.Cookie = cookies;
      if (corps !== undefined) entetes['Content-Type'] = 'application/x-www-form-urlencoded';
      // Le journal ne contient jamais le corps (il peut contenir le mot de passe)
      this.journal.push(`${methode} ${u.origin}${u.pathname}`);
      const r = await fetch(u, { method: methode, headers: entetes, body: corps, redirect: 'manual' });
      this.enregistrerCookies(u, r.headers);
      const cible = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && cible) {
        u = this.verifierAdresse(new URL(cible, u).toString());
        // Après une redirection 301/302/303, on repart en GET sans corps (comme un navigateur)
        if (r.status !== 307 && r.status !== 308) {
          methode = 'GET';
          corps = undefined;
        }
        continue;
      }
      return { url: u.toString(), statut: r.status, texte: await r.text() };
    }
    throw new ErreurEnt('Trop de redirections.', 'navigation');
  }
}

// --------------------------------------------------------------------------
// Parcours de connexion

function formulaire(doc: HTMLElement, selecteur: string, champs: string[], etape: string, base: string): { action: string; valeurs: Record<string, string> } {
  const f = doc.querySelector(selecteur);
  if (!f) throw new ErreurEnt(`Page inattendue (formulaire introuvable).`, etape);
  const action = f.getAttribute('action');
  if (!action) throw new ErreurEnt(`Page inattendue (adresse du formulaire introuvable).`, etape);
  const valeurs: Record<string, string> = {};
  for (const c of champs) {
    const v = f.querySelector(`input[name="${c}"]`)?.getAttribute('value');
    if (!v) throw new ErreurEnt(`Page inattendue (champ ${c} introuvable).`, etape);
    valeurs[c] = v;
  }
  return { action: new URL(action.replace(/&amp;/g, '&'), base).toString(), valeurs };
}

/** « Mateo Durand » → « durand-mateo » (sans accents), comme l'URL de l'ENT. */
export function identifiantEnt(prenom: string, nom: string): string {
  return `${nom}-${prenom}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export interface SessionEnt {
  navigateur: Navigateur;
  session: string;
  codePersonne: number;
  prenom: string;
  nom: string;
}

export async function connexionEnt(email: string, motDePasse: string, adresses: AdressesEnt = ADRESSES_CESI): Promise<SessionEnt> {
  if (!email || !motDePasse) throw new ErreurEnt('Adresse e-mail ou mot de passe manquant.', 'identifiants', true);
  const nav = new Navigateur(adresses);

  // 1. Page d'accueil de l'ENT (cookies de départ)
  await nav.requete(`${adresses.ent}/`);

  // 2. Le WAYF du CESI renvoie une demande SAML vers le serveur de connexion
  const wayf = new URL('/login', adresses.wayf);
  wayf.search = new URLSearchParams({ client_name: 'ClientIdpViaCesiFr', needs_client_redirection: 'true', UserName: email }).toString();
  const p2 = await nav.requete(wayf.toString(), { methode: 'POST', formulaire: {} });
  const demande = formulaire(parse(p2.texte), 'form', ['RelayState', 'SAMLRequest'], 'redirection SAML', p2.url);

  // 3. Le serveur de connexion affiche le formulaire d'identification
  const p3 = await nav.requete(demande.action, { methode: 'POST', formulaire: demande.valeurs });
  const doc3 = parse(p3.texte);
  const options = doc3.querySelector('#options') ?? doc3.querySelector('form#loginForm') ?? doc3.querySelector('form');
  const action = options?.getAttribute('action');
  if (!action) throw new ErreurEnt('Page de connexion inattendue (formulaire introuvable).', 'page de connexion');
  const actionConnexion = new URL(action.replace(/&amp;/g, '&'), p3.url).toString();
  nav.verifierAdresse(actionConnexion); // jamais de mot de passe vers un autre serveur

  // 4. Envoi des identifiants
  const p4 = await nav.requete(actionConnexion, { methode: 'POST', formulaire: { UserName: email, Password: motDePasse, AuthMethod: 'FormsAuthentication' } });
  const doc4 = parse(p4.texte);
  const erreur = doc4.querySelectorAll('#errorText').map((e) => e.text.trim()).filter(Boolean).join(' — ');
  if (erreur) throw new ErreurEnt(`Connexion refusée par le CESI : ${erreur}`, 'identifiants', true);
  if (!doc4.querySelector('form[name="hiddenform"]')) {
    const mfa = /authenticator|v[ée]rification|code|mfa|multi/i.test(doc4.text);
    throw new ErreurEnt(
      mfa
        ? 'Le CESI demande une vérification supplémentaire (double authentification) : Forge ne peut pas la faire à ta place. Utilise un lien iCal à la place.'
        : 'Page inattendue après la connexion (le CESI a peut-être changé sa page).',
      'après connexion',
    );
  }
  const reponse = formulaire(doc4, 'form[name="hiddenform"]', ['RelayState', 'SAMLResponse'], 'retour SAML', p4.url);

  // 5. Retour à l'ENT avec l'assertion SAML
  const p5 = await nav.requete(reponse.action, { methode: 'POST', formulaire: reponse.valeurs });
  const doc5 = parse(p5.texte);
  const lien = doc5.querySelector('.sidebar-lien')?.getAttribute('href');
  const nomAffiche = doc5.querySelector('#compte .plier-deplier__bouton .session_libelle')?.text.trim().replace(/\s+/g, ' ');
  if (!lien || !nomAffiche) throw new ErreurEnt("Connexion réussie mais page de l'ENT inattendue (session introuvable).", 'ENT');
  const session = new URL(lien, p5.url).pathname.replace(/^\/+/, '').split('/')[0];
  const [prenom, ...reste] = nomAffiche.split(' ');
  const nom = reste.join(' ');

  // 6. Page « emploi du temps » : code personne
  const p6 = await nav.requete(`${adresses.ent}/${session}/emploi-du-temps/${identifiantEnt(prenom, nom)}`);
  const code = parse(p6.texte).querySelector('[data-code-personne]')?.getAttribute('data-code-personne');
  const codePersonne = Number(code);
  if (!code || !Number.isInteger(codePersonne)) throw new ErreurEnt("Code personne introuvable sur la page d'emploi du temps.", 'emploi du temps');

  return { navigateur: nav, session, codePersonne, prenom, nom };
}

/** Séances entre deux dates (AAAA-MM-JJ). */
export async function seancesEnt(s: SessionEnt, du: string, au: string, adresses: AdressesEnt = ADRESSES_CESI): Promise<Cours[]> {
  const url = new URL('/api/seance/all', adresses.ent);
  url.search = new URLSearchParams({ start: du, end: au, codePersonne: String(s.codePersonne) }).toString();
  const r = await s.navigateur.requete(url.toString());
  if (r.statut === 204 || !r.texte.trim()) return [];
  if (r.statut !== 200) throw new ErreurEnt(`L'ENT a répondu ${r.statut}.`, 'séances');
  try {
    return coursDepuisEnt(JSON.parse(r.texte));
  } catch {
    throw new ErreurEnt("Réponse de l'ENT illisible (pas du JSON) : la session a peut-être expiré.", 'séances');
  }
}
