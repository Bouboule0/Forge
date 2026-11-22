// Tests automatiques (sans VS Code) : npm test
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { memeNotion, nomDepuisAav, nomFichierSur, notionPresenteDans } from '../src/core/texte';
import { versCheminWsl } from '../src/systeme';
import type { CerAnalyse } from '../src/core/parseurCer';
import { construirePlan, resoudreFusions } from '../src/core/planImport';
import { decalerTitres, ecrirePlan, lireBloc, remplacerBloc } from '../src/core/ecritureCoffre';
import { compterNotionsARevoir, lireNote } from '../src/core/coffre';
import { construireCer } from '../src/core/exportWord';

function analyse(numero: number, motsCles: Array<[string, string]>, aav: Array<[number, string]> = []): CerAnalyse {
  return {
    fichierSource: `/inexistant/CER - Prosit ${numero}.docx`,
    type: 'cer',
    numero,
    titre: `Titre ${numero}`,
    module: 'Programmation orientée objet',
    roles: {},
    aav: aav.map(([niveau, texte]) => ({ niveau, texte })),
    motsCles: motsCles.map(([nom, definition]) => ({ nom, definition })),
    definitionsGenereesParIA: true,
    pistes: [{ texte: 'Le polymorphisme utilise la VFT', statut: 'a_valider', justification: 'Vrai pour le dynamique' }],
    sections: {
      contexte: 'Un jeu de combat.', problematique: 'Comment ?', contraintes: '', livrables: '', generalisation: 'Adaptabilité',
      planAction: '', workshop: '', corbeille: '', resolution: '### Etude\n\n#### Def\n\nTexte', bilan: '', sources: '', autres: '',
    },
    images: [],
    avertissements: [],
  };
}

const coffreTemporaire = () => fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));

test('reconnaît la même notion malgré les variantes', () => {
  assert.ok(memeNotion('Classes', 'Classe'));
  assert.ok(memeNotion('Virtual Fonction Table', 'Virtual Function Table'));
  assert.ok(!memeNotion('Classes', 'Sous-classes'));
  assert.ok(!memeNotion('Opérateur', 'Opérateur XOR'));
});

test("propose un nom de notion à partir d'un AAV", () => {
  assert.equal(nomDepuisAav("Mettre en œuvre l'héritage."), 'Héritage');
  assert.equal(nomDepuisAav('Mettre en œuvre les classes abstraites en C++.'), 'Classes abstraites');
  assert.equal(nomDepuisAav('Comprendre le principe de substitution de Liskov.'), 'Principe de substitution de Liskov');
  assert.equal(nomDepuisAav('Maîtriser les notions de type réel, type déclaré.'), 'Type réel, type déclaré');
});

test('repère une notion citée dans un AAV', () => {
  assert.ok(notionPresenteDans('Redéfinition Méthode', 'Mettre en œuvre le polymorphisme par héritage via la redéfinition de méthodes en C++.'));
  assert.ok(notionPresenteDans('Virtual Fonction Table', 'Comprendre la Virtual Function Table (VFT)'));
  assert.ok(!notionPresenteDans('Moteur', 'Comprendre la Virtual Function Table (VFT)'));
});

test('noms de fichiers valables sous Windows', () => {
  assert.equal(nomFichierSur('Chiffrement / déchiffrement'), 'Chiffrement déchiffrement');
  assert.equal(nomFichierSur('La POO, quésaco ?'), 'La POO, quésaco');
});

test('conversion des chemins pour WSL', () => {
  assert.equal(versCheminWsl('C:\\Users\\moi\\SecondCerveau\\a.cpp'), '/mnt/c/Users/moi/SecondCerveau/a.cpp');
  assert.equal(versCheminWsl('\\\\wsl$\\Ubuntu\\home\\moi\\x'), '/home/moi/x');
  assert.equal(versCheminWsl('\\\\wsl.localhost\\Ubuntu\\home\\moi'), '/home/moi');
});

test('décalage des titres sans toucher au code', () => {
  assert.equal(decalerTitres('### A\n```\n# commentaire\n```\n#### B', 4), '#### A\n```\n# commentaire\n```\n##### B');
});

test('blocs gérés par Forge', () => {
  const texte = 'Début\n\n<!-- forge:x -->\nancien\n<!-- /forge:x -->\n\nFin';
  assert.equal(lireBloc(texte, 'x'), 'ancien');
  assert.equal(lireBloc(remplacerBloc(texte, 'x', 'nouveau'), 'x'), 'nouveau');
  assert.ok(remplacerBloc(texte, 'x', 'nouveau').endsWith('Fin'));
});

test('import : notions partagées, AAV, réimport sans doublon ni perte', () => {
  const coffre = coffreTemporaire();
  const p2 = analyse(2, [['Encapsulation', 'Déf P2'], ['Classes', 'Déf classes']]);
  const p4 = analyse(4, [['Encapsulation', 'Déf P4'], ['Polymorphisme', 'Déf poly, voir Classes']], [[3, 'Mettre en œuvre le polymorphisme en C++.'], [3, "Mettre en œuvre l'héritage."]]);
  const plan = construirePlan(coffre, [p2, p4], 'POO');
  const encapsulation = plan.notions.find((n) => n.nom === 'Encapsulation')!;
  assert.deepEqual(encapsulation.prosits, [0, 1]);
  assert.equal(plan.notions.find((n) => n.nom === 'Polymorphisme')!.aav.length, 1);
  assert.equal(plan.notions.find((n) => n.nom === 'Héritage')?.origine, 'aav');

  ecrirePlan(plan);
  const chemin = path.join(coffre, 'Notions', 'Encapsulation.md');
  const note = fs.readFileSync(chemin, 'utf8');
  assert.match(note, /D'après \[\[P02 - Titre 2\]\]/);
  assert.match(note, /D'après \[\[P04 - Titre 4\]\]/);
  assert.match(fs.readFileSync(path.join(coffre, 'Notions', 'Polymorphisme.md'), 'utf8'), /\[\[Classes\]\]/);

  // L'utilisateur travaille sa note, puis réimporte
  fs.writeFileSync(chemin, note.replace('niveau: 0', 'niveau: 4') + '\nMa note perso\n');
  ecrirePlan(construirePlan(coffre, [p4], 'POO'));
  const apres = fs.readFileSync(chemin, 'utf8');
  assert.match(apres, /niveau: 4/);
  assert.match(apres, /Ma note perso/);
  assert.equal(apres.match(/D'après \[\[P04 - Titre 4\]\]/g)?.length, 1);

  assert.equal(compterNotionsARevoir(coffre).total, 4);
});

test('fusion de deux notions', () => {
  const coffre = coffreTemporaire();
  const plan = construirePlan(coffre, [analyse(4, [['Template', 'A'], ['Fonction générique', 'B']])], 'POO');
  plan.notions.find((n) => n.nom === 'Fonction générique')!.fusionnerDans = plan.notions.find((n) => n.nom === 'Template')!.id;
  const finales = resoudreFusions(plan.notions);
  assert.equal(finales.length, 1);
  assert.deepEqual(finales[0].autresNoms, ['Fonction générique']);
  assert.equal(finales[0].definitions.length, 2);
});

test('export Word : tableau des mots-clés et validation des pistes', () => {
  const coffre = coffreTemporaire();
  ecrirePlan(construirePlan(coffre, [analyse(4, [['Polymorphisme', 'Une interface, plusieurs comportements.']], [[3, 'Mettre en œuvre le polymorphisme.']])], 'POO'));
  const { markdown, nomFichier } = construireCer(coffre, path.join(coffre, 'Prosits', 'P04 - Titre 4.md'));
  assert.equal(nomFichier, 'CER - Prosit 4 - Titre 4.docx');
  assert.match(markdown, /\| \*\*Polymorphisme\*\* \| Une interface, plusieurs comportements\. \|/);
  assert.match(markdown, /\\\[3\\\] Mettre en œuvre le polymorphisme\./);
  assert.match(markdown, /\| Le polymorphisme utilise la VFT \|  \| Vrai pour le dynamique \|/);
  assert.match(markdown, /^# Rappel du Prosit Aller$/m);
  assert.match(markdown, /^### Etude$/m);
  assert.doesNotMatch(markdown, /\[\[|forge:/);
  assert.equal(lireNote(path.join(coffre, 'Prosits', 'P04 - Titre 4.md')).data.type, 'prosit');
});

// --------------------------------------------------------------------------
// Phase 2 : répétition espacée, exercices, séance

import { ajouterJours, appliquerResultat, plafond, type EtatRevision } from '../src/core/repetition';
import { corriger, genererQcmNotion, genererTrou, masquerNom, reponseCorrecte } from '../src/core/exercices';
import { lireNotionsRevision, serieDeJours } from '../src/core/notionsRevision';
import { aujourdhui } from '../src/core/texte';
import { Seance } from '../src/core/seance';

const etat = (niveau: number, aavCible = 2, preuves = {}): EtatRevision => ({ niveau, prochaine: null, derniere: null, aavCible, reussites: 0, echecs: 0, preuves });

/** Hasard reproductible pour les tests. */
function hasardFixe(graine = 42) {
  let x = graine;
  return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

test('répétition espacée : montée, échec, intervalles', () => {
  const r1 = appliquerResultat(etat(0), 'reussite', 'trou', '2026-11-20');
  assert.equal(r1.etat.niveau, 1);
  assert.equal(r1.etat.prochaine, '2026-11-21');
  assert.equal(appliquerResultat(etat(2), 'reussite', 'qcm', '2026-11-20').etat.prochaine, '2026-11-27');
  assert.equal(appliquerResultat(etat(4), 'echec', null, '2026-11-20').etat.niveau, 2);
  assert.equal(appliquerResultat(etat(1), 'echec', null, '2026-11-20').etat.niveau, 0);
  assert.equal(appliquerResultat(etat(3), 'moyen', null, '2026-11-20').etat.niveau, 3);
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
});

test('plafond : les AAV exigent les bons types d’exercices', () => {
  const bloque = appliquerResultat(etat(4, 3), 'reussite', 'qcm', '2026-11-20');
  assert.equal(bloque.etat.niveau, 4);
  assert.match(bloque.changement.bloque ?? '', /explication.*code/);
  assert.equal(plafond(etat(4, 2, { explication: 1 })).max, 6);
  assert.equal(plafond(etat(4, 3, { explication: 1, code: 1 })).max, 4);
  assert.equal(plafond(etat(4, 5, { explication: 1, code: 2, long: 1, papier: 1 })).max, 6);
});

test('correction tolérante des textes à trous', () => {
  assert.ok(reponseCorrecte('Templates', 'templates'));
  assert.ok(reponseCorrecte('template', 'templates'));
  assert.ok(reponseCorrecte('desordones', 'désordonnés'));
  assert.ok(reponseCorrecte('heritage', 'héritage'));
  assert.ok(!reponseCorrecte('polymorphisme', 'encapsulation'));
  assert.ok(!reponseCorrecte('', 'vptr'));
});

test('masquage du nom de la notion dans sa définition', () => {
  const n = { nom: 'Opérateur XOR', titre: 'Opérateur XOR', aliases: [] };
  assert.equal(masquerNom('Opérateur logique : le XOR renvoie 1.', n), '▢▢▢ logique : le ▢▢▢ renvoie 1.');
});

function coffreAvecNotions(): string {
  const coffre = coffreTemporaire();
  const defs: Array<[string, string]> = [
    ['Polymorphisme', 'Capacité d’une même interface à produire des comportements différents. Il peut être statique (surcharge, templates) ou dynamique.'],
    ['Template', 'Mécanisme du C++ permettant d’écrire une classe paramétrée par un ou plusieurs types, instanciée par le compilateur.'],
    ['Surcharge', 'Possibilité de définir plusieurs fonctions portant le même nom mais avec des signatures différentes.'],
    ['Encapsulation', 'Principe consistant à regrouper les données et les méthodes dans une classe en masquant les détails internes (attributs private).'],
    ['Pointeurs', 'Variables qui contiennent l’adresse mémoire d’une autre variable ou d’un objet, utilisées avec new et delete.'],
  ];
  ecrirePlan(construirePlan(coffre, [analyse(4, defs)], 'POO'));
  return coffre;
}

test('génération des exercices à partir des notes', () => {
  const coffre = coffreAvecNotions();
  const notions = lireNotionsRevision(coffre);
  const poly = notions.find((n) => n.nom === 'Polymorphisme')!;
  assert.equal(poly.definitions.length, 1);
  const trou = genererTrou(poly, notions, hasardFixe())!;
  assert.ok(trou.attendu && trou.enonce.includes('___'));
  assert.ok(!/polymorphisme/i.test(trou.attendu!), 'le trou ne cache pas le nom de la notion');
  assert.equal(corriger(trou, { type: 'texte', valeur: trou.attendu! }).resultat, 'reussite');
  const qcm = genererQcmNotion(poly, notions, hasardFixe())!;
  assert.equal(qcm.options!.length, 4);
  assert.equal(qcm.options![qcm.bonneOption!], 'Polymorphisme');
  assert.equal(corriger(qcm, { type: 'option', index: (qcm.bonneOption! + 1) % 4 }).resultat, 'echec');
});

test('séance : la réussite fait pousser et est enregistrée, l’échec revient', async () => {
  const coffre = coffreAvecNotions();
  const seance = new Seance(coffre, { rapide: true, entrainement: false, perimetre: { type: 'tout' } }, hasardFixe(), aujourdhui());
  assert.equal(seance.aRevoir().length, 5);
  const premier = seance.suivant()!;
  const bonne = premier.exercice.options ? { type: 'option' as const, index: premier.exercice.bonneOption! } : { type: 'texte' as const, valeur: premier.exercice.attendu! };
  const r = await seance.repondre(bonne);
  assert.equal(r.changement?.apres, 1);
  assert.match(fs.readFileSync(premier.notion!.chemin, 'utf8'), /niveau: 1[\s\S]*maitrise\/1/);

  const second = seance.suivant()!;
  await seance.repondre({ type: 'jeNeSaisPas' });
  const restants = seance.restants();
  assert.equal(restants, 4, 'la notion ratée est remise dans la file');
  // Revue une 2e fois dans la journée : entraînement, plus de changement de niveau
  let x = seance.suivant();
  while (x && x.notion!.chemin !== second.notion!.chemin) {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = seance.suivant();
  }
  assert.ok(x);
  assert.equal((await seance.repondre({ type: 'jeNeSaisPas' })).compte, false);
  const bilan = seance.terminer();
  assert.equal(bilan.montees.length, 1);
  assert.equal(bilan.serie, 1);
});

test('série de jours', () => {
  const e = (d: string) => ({ date: `${d}T10:00:00`, notion: 'x', type: 'trou', resultat: 'reussite' as const, compte: true });
  assert.equal(serieDeJours([e('2026-11-18'), e('2026-11-19'), e('2026-11-20')], '2026-11-20'), 3);
  assert.equal(serieDeJours([e('2026-11-18'), e('2026-11-19')], '2026-11-20'), 2);
  assert.equal(serieDeJours([e('2026-11-17')], '2026-11-20'), 0);
});

// --------------------------------------------------------------------------
// Relecture des définitions par l'IA (faux serveur DeepSeek local)

import * as http from 'http';
import { creerClientDeepSeek, ErreurIA, relireDefinitions } from '../src/core/relectureIA';

async function fauxDeepSeek(repondre: (demande: any) => { statut?: number; corps: unknown }) {
  const recues: any[] = [];
  const serveur = http.createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => (brut += c));
    req.on('end', () => {
      const demande = { ...JSON.parse(brut), autorisation: req.headers.authorization, chemin: req.url };
      recues.push(demande);
      const { statut = 200, corps } = repondre(demande);
      res.writeHead(statut, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corps));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = (serveur.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, recues, fermer: () => serveur.close() };
}

const reponseIA = (resultats: unknown) => ({ choices: [{ message: { content: JSON.stringify({ resultats }) } }] });

test('import : définitions IA acceptées d’office par défaut, ou à vérifier', () => {
  const coffre = coffreTemporaire();
  ecrirePlan(construirePlan(coffre, [analyse(4, [['Template', 'Déf']])], 'POO'));
  const note = fs.readFileSync(path.join(coffre, 'Notions', 'Template.md'), 'utf8');
  assert.match(note, /statut: verifie/);
  assert.match(note, /revue_ia: a_faire/);
  assert.match(note, /\[!info\] Définition générée par IA/);

  const coffre2 = coffreTemporaire();
  ecrirePlan(construirePlan(coffre2, [analyse(4, [['Template', 'Déf']])], 'POO'), { accepterDefinitionsIA: false });
  assert.match(fs.readFileSync(path.join(coffre2, 'Notions', 'Template.md'), 'utf8'), /statut: a_verifier[\s\S]*\[!warning\]/);
});

test('relecture IA : valide, corrige (en gardant l’ancienne), écrit les manquantes', async () => {
  const coffre = coffreTemporaire();
  ecrirePlan(
    construirePlan(coffre, [analyse(3, [['Héritage', 'Une classe fille hérite seulement des attributs publics.'], ['POO', 'Paradigme à base d’objets.']], [[2, 'Comprendre le principe de substitution de Liskov.']])], 'POO'),
  );
  const serveur = await fauxDeepSeek((d) => {
    const notions = JSON.parse(d.messages[1].content).notions as Array<{ id: string; notion: string }>;
    return {
      corps: reponseIA(
        notions.map((n) =>
          n.notion === 'Héritage'
            ? { id: n.id, verdict: 'a_corriger', raison: 'Les membres protected sont aussi hérités.', definition: 'Mécanisme par lequel une classe dérivée reçoit les membres **public** et **protected** de sa classe de base.' }
            : n.notion === 'POO'
              ? { id: n.id, verdict: 'correcte', raison: 'OK' }
              : { id: n.id, verdict: 'manquante', raison: 'Pas de définition', definition: 'Un objet dérivé doit pouvoir remplacer un objet de base sans casser le programme.' },
        ),
      ),
    };
  });
  try {
    const client = creerClientDeepSeek('sk-test', serveur.url);
    const r = await relireDefinitions(coffre, client, { accepter: true, date: '2026-11-21' });
    assert.deepEqual(r.correctes, ['POO']);
    assert.deepEqual(r.corrigees.map((c) => c.titre), ['Héritage']);
    assert.deepEqual(r.ecrites.map((c) => c.titre), ['Principe de substitution de Liskov']);
    assert.equal(serveur.recues[0].autorisation, 'Bearer sk-test');
    assert.equal(serveur.recues[0].chemin, '/chat/completions');
    assert.equal(serveur.recues[0].model, 'deepseek-chat');

    const heritage = fs.readFileSync(path.join(coffre, 'Notions', 'Héritage.md'), 'utf8');
    assert.match(heritage, /Corrigée par l'IA/);
    assert.match(heritage, /\[!quote\]- Définition d'origine[\s\S]*Les membres protected[\s\S]*attributs publics/);
    assert.match(heritage, /definitions_remplacees:\s*\n\s*- '\[\[P03 - Titre 3\]\]'/);
    assert.match(heritage, /revue_ia: corrigee/);
    assert.doesNotMatch(heritage, /\[!info\] Définition générée par IA/);

    // Les exercices n'utilisent que la nouvelle définition
    const notions = lireNotionsRevision(coffre);
    const h = notions.find((n) => n.nom === 'Héritage')!;
    assert.equal(h.definitions.length, 1);
    assert.match(h.definitions[0].texte, /^Mécanisme par lequel/);
    assert.match(fs.readFileSync(path.join(coffre, 'Notions', 'POO.md'), 'utf8'), /revue_ia: ok/);
    assert.match(fs.readFileSync(path.join(coffre, 'Notions', 'Principe de substitution de Liskov.md'), 'utf8'), /Écrite par l'IA[\s\S]*remplacer un objet de base/);
    assert.ok(r.rapport && fs.existsSync(r.rapport));

    // Un réimport ne remet pas l'ancienne définition fausse
    ecrirePlan(construirePlan(coffre, [analyse(3, [['Héritage', 'Une classe fille hérite seulement des attributs publics.']])], 'POO'));
    assert.equal(lireNotionsRevision(coffre).find((n) => n.nom === 'Héritage')!.definitions.length, 1);

    // Une deuxième relecture ne renvoie rien : tout est déjà relu
    const avant = serveur.recues.length;
    await relireDefinitions(coffre, client, { accepter: true });
    assert.equal(serveur.recues.length, avant);
  } finally {
    serveur.fermer();
  }
});

test('relecture IA : clé refusée → erreur claire', async () => {
  const coffre = coffreTemporaire();
  ecrirePlan(construirePlan(coffre, [analyse(4, [['Template', 'Déf']])], 'POO'));
  const serveur = await fauxDeepSeek(() => ({ statut: 401, corps: { error: 'invalid key' } }));
  try {
    await assert.rejects(relireDefinitions(coffre, creerClientDeepSeek('mauvaise', serveur.url), { accepter: true }), (e: unknown) => e instanceof ErreurIA && /Clé DeepSeek refusée/.test(e.message));
  } finally {
    serveur.fermer();
  }
});

// --------------------------------------------------------------------------
// Phase 3 : pistes de solutions et corrections par l'IA

import { enregistrerPiste, lirePistes, lirePistesCoffre, pistesEnMarkdown } from '../src/core/pistes';
import { corrigerExplication, corrigerPiste, type CorrecteurIA } from '../src/core/correctionIA';
import type { ClientIA } from '../src/core/relectureIA';

test('pistes : lecture, statut « en partie », mise à jour dans la note Prosit', () => {
  const md = pistesEnMarkdown([
    { texte: 'Le polymorphisme utilise la VFT', statut: 'partielle', justification: 'Vrai pour le dynamique' },
    { texte: 'Les templates sont dynamiques', statut: 'a_valider', justification: '' },
  ]);
  assert.deepEqual(lirePistes(md).map((p) => p.statut), ['partielle', 'a_valider']);

  const coffre = coffreTemporaire();
  ecrirePlan(construirePlan(coffre, [analyse(4, [['Template', 'Déf']])], 'POO'));
  const [piste] = lirePistesCoffre(coffre);
  assert.equal(piste.titreProsit, 'Titre 4');
  assert.equal(piste.problematique, 'Comment ?');
  enregistrerPiste(piste.chemin, 0, 'invalidee', 'Seul le polymorphisme dynamique utilise la VFT.');
  const apres = lirePistesCoffre(coffre)[0];
  assert.equal(apres.statut, 'invalidee');
  assert.match(fs.readFileSync(piste.chemin, 'utf8'), /- \[x\] Le polymorphisme utilise la VFT\n {4}- Statut : ❌ Invalidée\n {4}- Justification : Seul le polymorphisme dynamique/);
  // L'export Word reprend le statut
  assert.match(construireCer(coffre, piste.chemin).markdown, /\| Le polymorphisme utilise la VFT \| Invalidée \| Seul le polymorphisme/);
});

test('corrections IA : lecture des réponses (explication, piste)', async () => {
  const faux = (reponse: unknown): ClientIA => ({ json: async () => reponse });
  const notion = { titre: 'Template', nom: 'Template', etat: etat(0, 3), prosits: [], definitions: [{ prosit: null, texte: 'Déf' }], notesPerso: '' } as any;
  const e = await corrigerExplication(faux({ verdict: 'moyen', note: 6, points_forts: ['Idée de type paramétré'], a_revoir: ['Instanciation à la compilation'], modele: 'Un template…' }), notion, 'mon texte');
  assert.equal(e.resultat, 'moyen');
  assert.deepEqual(e.aRevoir, ['Instanciation à la compilation']);
  const piste = { texte: 'x', titreProsit: 'T', contexte: '', problematique: '' } as any;
  const p = await corrigerPiste(faux({ statut: 'partielle', verdict: 'reussite', justification: 'J', retour: 'Bien vu' }), piste, { statut: 'partielle', justification: 'parce que' });
  assert.deepEqual([p.statut, p.resultat, p.justification], ['partielle', 'reussite', 'J']);
  await assert.rejects(corrigerPiste(faux({ statut: 'peut-être', verdict: 'reussite' }), piste, { statut: 'validee', justification: '' }));
});

/** Faux correcteur : réussite si le texte contient « compilation », piste toujours « invalidée ». */
const fauxCorrecteur: CorrecteurIA = {
  explication: async (_n, texte) => ({ resultat: /compilation/.test(texte) ? 'reussite' : 'echec', note: 8, pointsForts: [], aRevoir: [], modele: 'Modèle' }),
  piste: async (_p, r) => ({ resultat: r.statut === 'invalidee' ? 'reussite' : 'echec', statut: 'invalidee', justification: 'Justification IA', retour: 'OK' }),
};

test('séance avec IA : explications corrigées, pistes validées et écrites dans le CER', async () => {
  const coffre = coffreAvecNotions();
  const seance = new Seance(coffre, { rapide: false, entrainement: false, perimetre: { type: 'tout' }, ia: fauxCorrecteur }, hasardFixe(7), aujourdhui());
  assert.equal(seance.pistesAProposer().length, 1, 'la piste à valider est proposée');
  let vuPiste = false;
  let vuExplication = false;
  for (let x = seance.suivant(); x; x = seance.suivant()) {
    const e = x.exercice;
    if (e.type === 'piste_valider') {
      vuPiste = true;
      const r = await seance.repondre({ type: 'piste', statut: 'invalidee', justification: 'Le statique n’utilise pas la VFT' });
      assert.equal(r.correction.resultat, 'reussite');
      assert.equal(r.correction.ia?.justification, 'Justification IA');
    } else if (e.type === 'explication') {
      vuExplication = true;
      const r = await seance.repondre({ type: 'texte', valeur: 'résolu à la compilation' });
      assert.equal(r.correction.resultat, 'reussite');
      assert.equal(x.notion!.etat.preuves.explication, 1, 'l’explication réussie compte comme preuve');
    } else if (e.options) await seance.repondre({ type: 'option', index: e.bonneOption! });
    else if (e.attendu) await seance.repondre({ type: 'texte', valeur: e.attendu });
    else await seance.repondre({ type: 'jeNeSaisPas' });
  }
  assert.ok(vuPiste && vuExplication);
  const piste = lirePistesCoffre(coffre)[0];
  assert.deepEqual([piste.statut, piste.justification], ['invalidee', 'Justification IA']);
  assert.equal(seance.terminer().pistesValidees, 1);
  // La piste validée ne revient pas avant une semaine
  assert.equal(new Seance(coffre, { rapide: false, entrainement: false, perimetre: { type: 'tout' }, ia: fauxCorrecteur }).pistesAProposer().length, 0);
});

test('séance hors ligne : vrai/faux sur une piste validée, pas de piste à valider sans IA', async () => {
  const coffre = coffreAvecNotions();
  const [piste] = lirePistesCoffre(coffre);
  assert.equal(new Seance(coffre, { rapide: false, entrainement: false, perimetre: { type: 'tout' } }).pistesAProposer().length, 0);
  enregistrerPiste(piste.chemin, 0, 'partielle', 'Vrai pour le dynamique');
  const seance = new Seance(coffre, { rapide: true, entrainement: false, perimetre: { type: 'tout' } }, hasardFixe());
  let x = seance.suivant();
  while (x && x.exercice.type !== 'piste_vf') {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = seance.suivant();
  }
  assert.ok(x, 'la piste validée est proposée en vrai/faux');
  const r = await seance.repondre({ type: 'piste', statut: 'validee', justification: '' });
  assert.equal(r.correction.resultat, 'moyen', '« validée » au lieu de « en partie » : presque');
  assert.equal(r.correction.bonneReponse, '⚠️ Validée en partie');
});

test('séance : une erreur de l’IA ne casse pas la séance', async () => {
  const coffre = coffreAvecNotions();
  const enPanne: CorrecteurIA = { explication: async () => { throw new Error('réseau coupé'); }, piste: async () => { throw new Error('réseau coupé'); } };
  const seance = new Seance(coffre, { rapide: false, entrainement: true, perimetre: { type: 'tout' }, ia: enPanne }, hasardFixe(3));
  let x = seance.suivant();
  while (x && x.exercice.type !== 'piste_valider') {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = seance.suivant();
  }
  const r = await seance.repondre({ type: 'piste', statut: 'validee', justification: 'j' });
  assert.equal(r.correction.resultat, null);
  assert.match(r.correction.erreur ?? '', /réseau coupé/);
  assert.equal(lirePistesCoffre(coffre)[0].statut, 'a_valider', 'rien n’est écrit dans le CER');
});

test('les scripts des webviews sont du JavaScript valide', async () => {
  const { html: htmlSeance } = await import('../src/vues/ecranSeance');
  const { html: htmlImport } = await import('../src/vues/ecranImport');
  for (const page of [htmlSeance({ cspSource: 'x' }), htmlImport({ cspSource: 'x' }, { prosits: [], notions: [] })]) {
    const script = page.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, 'script trouvé');
    assert.doesNotThrow(() => new Function(script!), 'erreur de syntaxe dans le script de la webview');
  }
});
