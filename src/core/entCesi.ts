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
  constructor(
    message: string,
    readonly etape: string,
    readonly identifiantsRefuses = false,
    /** Description de la page reçue, sans aucune valeur de champ ni mot de passe (à copier pour signaler un problème). */
    readonly diagnostic?: string,
  ) {
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

interface Page {
  url: string;
  statut: number;
  texte: string;
}

/** Description d'une page pour comprendre un échec, SANS valeur de champ (ni jeton, ni mot de passe). */
export function diagnosticPage(page: Page): string {
  const doc = parse(page.texte);
  const u = new URL(page.url);
  const court = (chemin: string) => chemin.replace(/[A-Za-z0-9_-]{25,}/g, '…');
  const lignes = [
    `Adresse : ${u.origin}${court(u.pathname)}${u.search ? ' (+ paramètres)' : ''} · statut ${page.statut}`,
    `Titre : ${doc.querySelector('title')?.text.trim() || '(aucun)'}`,
  ];
  doc.querySelectorAll('form').forEach((f, i) => {
    let action = f.getAttribute('action') ?? '';
    try {
      const a = new URL(action.replace(/&amp;/g, '&'), page.url);
      action = `${a.origin}${court(a.pathname)}`;
    } catch {
      action = '(action illisible)';
    }
    const champs = f.querySelectorAll('input, select, textarea').map((c) => `${c.getAttribute('name') ?? '?'}${c.getAttribute('type') ? `:${c.getAttribute('type')}` : ''}`);
    lignes.push(`Formulaire ${i + 1} (${f.getAttribute('id') || f.getAttribute('name') || 'sans nom'}) → ${action} · champs : ${champs.join(', ') || 'aucun'}`);
  });
  const liens = [...new Set(doc.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/') || h.includes('cesi.fr')).map((h) => {
    try {
      return court(new URL(h, page.url).pathname);
    } catch {
      return '';
    }
  }).filter(Boolean))].slice(0, 15);
  lignes.push(`Liens : ${liens.join(' · ') || 'aucun'}`);
  const reperes = ['.sidebar-lien', '.session_libelle', '#compte', '[data-code-personne]', 'a[href*="emploi-du-temps"]', '#errorText', 'script'];
  lignes.push(`Repères : ${reperes.map((r) => `${r}=${doc.querySelectorAll(r).length}`).join(' · ')}`);
  const scripts = doc.querySelectorAll('script').map((x) => x.text).join(' ');
  if (/location|submit\(/.test(scripts)) lignes.push('Scripts : redirection ou envoi automatique détecté');
  lignes.push(`Texte : ${doc.text.replace(/\s+/g, ' ').trim().slice(0, 240)}`);
  return lignes.join('\n');
}

/**
 * Suit les pages qu'un navigateur traverserait tout seul (avec JavaScript) :
 * formulaires envoyés automatiquement, <meta refresh>, redirection en JavaScript.
 */
async function suivrePagesAutomatiques(nav: Navigateur, page: Page): Promise<Page> {
  for (let saut = 0; saut < 6; saut++) {
    const doc = parse(page.texte);
    // <meta http-equiv="refresh" content="0;url=...">
    const meta = doc.querySelectorAll('meta').find((m) => /refresh/i.test(m.getAttribute('http-equiv') ?? ''));
    const cibleMeta = meta?.getAttribute('content')?.match(/url\s*=\s*['"]?([^'";]+)/i)?.[1];
    if (cibleMeta) {
      page = await nav.requete(new URL(cibleMeta.replace(/&amp;/g, '&'), page.url).toString());
      continue;
    }
    // Formulaire sans champ à remplir (tous cachés) : un navigateur l'envoie automatiquement
    const auto = doc.querySelectorAll('form').find((f) => {
      const champs = f.querySelectorAll('input');
      const caches = champs.filter((c) => (c.getAttribute('type') ?? '').toLowerCase() === 'hidden');
      const saisie = champs.some((c) => /^(text|password|email)$/i.test(c.getAttribute('type') ?? 'text') && (c.getAttribute('type') ?? '').toLowerCase() !== 'hidden');
      const nomsConnus = caches.some((c) => /^(SAMLResponse|SAMLRequest|RelayState|ticket|wresult|wa|code|id_token|state)$/i.test(c.getAttribute('name') ?? ''));
      return caches.length > 0 && !saisie && nomsConnus;
    });
    if (auto) {
      const valeurs: Record<string, string> = {};
      for (const c of auto.querySelectorAll('input')) {
        const nom = c.getAttribute('name');
        if (nom) valeurs[nom] = c.getAttribute('value') ?? '';
      }
      const action = new URL((auto.getAttribute('action') || page.url).replace(/&amp;/g, '&'), page.url).toString();
      const post = (auto.getAttribute('method') ?? 'post').toLowerCase() !== 'get';
      if (post) page = await nav.requete(action, { methode: 'POST', formulaire: valeurs });
      else {
        const u = new URL(action);
        for (const [k, v] of Object.entries(valeurs)) u.searchParams.set(k, v);
        page = await nav.requete(u.toString());
      }
      continue;
    }
    // window.location = "..." / location.href = '...' / location.replace("...")
    const scripts = doc.querySelectorAll('script').map((x) => x.text).join('\n');
    const cibleJs = scripts.match(/(?:window\.|document\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]|location\.replace\(\s*['"]([^'"]+)['"]\s*\)/);
    const cible = cibleJs?.[1] ?? cibleJs?.[2];
    if (cible && !/^javascript:/i.test(cible)) {
      page = await nav.requete(new URL(cible, page.url).toString());
      continue;
    }
    return page;
  }
  return page;
}

/** Session et adresse de la page « emploi du temps » trouvées sur une page de l'ENT. */
function trouverSession(page: Page, adresses: AdressesEnt): { session: string; urlEdt: string; prenom: string; nom: string } | undefined {
  const doc = parse(page.texte);
  const nomAffiche = (doc.querySelector('#compte .plier-deplier__bouton .session_libelle') ?? doc.querySelector('.session_libelle'))?.text.trim().replace(/\s+/g, ' ') ?? '';
  const [prenom = '', ...reste] = nomAffiche.split(' ');
  const nom = reste.join(' ');
  // 1. Un lien direct vers « /<session>/emploi-du-temps/<nom-prenom> »
  for (const a of doc.querySelectorAll('a[href*="emploi-du-temps"]')) {
    try {
      const u = new URL(a.getAttribute('href')!, page.url);
      const parties = u.pathname.split('/').filter(Boolean);
      const i = parties.indexOf('emploi-du-temps');
      if (i >= 1 && parties[i + 1]) return { session: parties[i - 1], urlEdt: new URL(u.pathname, adresses.ent).toString(), prenom, nom };
    } catch {
      // lien illisible : on essaie le suivant
    }
  }
  // 2. Comme go-cesi : premier lien du menu (session) + nom affiché
  const lien = doc.querySelector('.sidebar-lien')?.getAttribute('href');
  if (lien && prenom && nom) {
    const session = new URL(lien, page.url).pathname.replace(/^\/+/, '').split('/')[0];
    if (session) return { session, urlEdt: `${adresses.ent}/${session}/emploi-du-temps/${identifiantEnt(prenom, nom)}`, prenom, nom };
  }
  return undefined;
}

type ChampRetour = 'SAMLResponse' | 'SAMLRequest';

async function connexionVariante(email: string, motDePasse: string, adresses: AdressesEnt, champ: ChampRetour): Promise<SessionEnt> {
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
  if (!action) throw new ErreurEnt('Page de connexion inattendue (formulaire introuvable).', 'page de connexion', false, diagnosticPage(p3));
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
      false,
      diagnosticPage(p4),
    );
  }
  const reponse = formulaire(doc4, 'form[name="hiddenform"]', ['RelayState', 'SAMLResponse'], 'retour SAML', p4.url);

  // 5. Retour à l'ENT avec l'assertion SAML, puis les pages qu'un navigateur traverserait tout seul
  let p5: Page = await nav.requete(reponse.action, {
    methode: 'POST',
    formulaire: { RelayState: reponse.valeurs.RelayState, [champ]: reponse.valeurs.SAMLResponse },
  });
  p5 = await suivrePagesAutomatiques(nav, p5);
  let infos = trouverSession(p5, adresses);
  const diagnostics = [`Après le retour SAML (${champ}) :\n${diagnosticPage(p5)}`];
  if (!infos) {
    // Peut-être connecté mais arrivé ailleurs que sur l'accueil : on recharge l'accueil de l'ENT
    const accueil = await suivrePagesAutomatiques(nav, await nav.requete(`${adresses.ent}/`));
    infos = trouverSession(accueil, adresses);
    if (!infos) diagnostics.push(`Accueil de l'ENT :\n${diagnosticPage(accueil)}`);
  }
  if (!infos) throw new ErreurEnt("Connexion réussie mais page de l'ENT inattendue (session introuvable).", 'ENT', false, diagnostics.join('\n\n'));

  // 6. Page « emploi du temps » : code personne
  const p6 = await suivrePagesAutomatiques(nav, await nav.requete(infos.urlEdt));
  const code = parse(p6.texte).querySelector('[data-code-personne]')?.getAttribute('data-code-personne');
  const codePersonne = Number(code);
  if (!code || !Number.isInteger(codePersonne)) {
    throw new ErreurEnt("Code personne introuvable sur la page d'emploi du temps.", 'emploi du temps', false, diagnosticPage(p6));
  }
  return { navigateur: nav, session: infos.session, codePersonne, prenom: infos.prenom, nom: infos.nom };
}

export async function connexionEnt(email: string, motDePasse: string, adresses: AdressesEnt = ADRESSES_CESI): Promise<SessionEnt> {
  if (!email || !motDePasse) throw new ErreurEnt('Adresse e-mail ou mot de passe manquant.', 'identifiants', true);
  try {
    return await connexionVariante(email, motDePasse, adresses, 'SAMLResponse');
  } catch (e) {
    // go-cesi renvoie l'assertion sous le nom « SAMLRequest » : si le nom standard n'aboutit pas, on essaie le sien (une fois)
    if (!(e instanceof ErreurEnt) || e.etape !== 'ENT') throw e;
    try {
      return await connexionVariante(email, motDePasse, adresses, 'SAMLRequest');
    } catch (e2) {
      const d2 = e2 instanceof ErreurEnt && e2.diagnostic ? `\n\n— Deuxième essai —\n${e2.diagnostic}` : '';
      throw new ErreurEnt(e.message, e.etape, false, `${e.diagnostic ?? ''}${d2}`);
    }
  }
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
