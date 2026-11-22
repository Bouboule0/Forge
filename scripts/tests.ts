// Tests automatiques (sans VS Code) : npm test
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { memeNotion, nomDepuisAav, nomFichierSur, notionPresenteDans } from '../src/core/texte';
import { argumentsPour, versCheminWsl } from '../src/systeme';
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
  assert.deepEqual(argumentsPour('wsl', ['g++', "/mnt/c/L'arène (2)/a.cpp"]), ['-e', 'g++', "/mnt/c/L'arène (2)/a.cpp"]);
  assert.deepEqual(argumentsPour('wsl', ['-e', 'ls']), ['-e', 'ls']);
  assert.deepEqual(argumentsPour('g++', ['a.cpp']), ['a.cpp']);
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
  const premier = (await seance.suivant())!;
  const bonne = premier.exercice.options ? { type: 'option' as const, index: premier.exercice.bonneOption! } : { type: 'texte' as const, valeur: premier.exercice.attendu! };
  const r = await seance.repondre(bonne);
  assert.equal(r.changement?.apres, 1);
  assert.match(fs.readFileSync(premier.notion!.chemin, 'utf8'), /niveau: 1[\s\S]*maitrise\/1/);

  const second = (await seance.suivant())!;
  await seance.repondre({ type: 'jeNeSaisPas' });
  const restants = seance.restants();
  assert.equal(restants, 4, 'la notion ratée est remise dans la file');
  // Revue une 2e fois dans la journée : entraînement, plus de changement de niveau
  let x = (await seance.suivant());
  while (x && x.notion!.chemin !== second.notion!.chemin) {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = (await seance.suivant());
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
  for (let x = (await seance.suivant()); x; x = (await seance.suivant())) {
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
  let x = (await seance.suivant());
  while (x && x.exercice.type !== 'piste_vf') {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = (await seance.suivant());
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
  let x = (await seance.suivant());
  while (x && x.exercice.type !== 'piste_valider') {
    await seance.repondre({ type: 'jeNeSaisPas' });
    x = (await seance.suivant());
  }
  const r = await seance.repondre({ type: 'piste', statut: 'validee', justification: 'j' });
  assert.equal(r.correction.resultat, null);
  assert.match(r.correction.erreur ?? '', /réseau coupé/);
  assert.equal(lirePistesCoffre(coffre)[0].statut, 'a_valider', 'rien n’est écrit dans le CER');
});

test('les scripts des webviews sont du JavaScript valide', async () => {
  const { html: htmlSeance } = await import('../src/vues/ecranSeance');
  const { html: htmlImport } = await import('../src/vues/ecranImport');
  const { html: htmlPapier } = await import('../src/vues/ecranPapier');
  const { html: htmlFerme } = await import('../src/vues/ecranFerme');
  for (const page of [htmlSeance({ cspSource: 'x' }), htmlImport({ cspSource: 'x' }, { prosits: [], notions: [] }), htmlPapier({ cspSource: 'x' }), htmlFerme({ cspSource: 'x' })]) {
    const script = page.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, 'script trouvé');
    assert.doesNotThrow(() => new Function(script!), 'erreur de syntaxe dans le script de la webview');
  }
});

// --------------------------------------------------------------------------
// Phase 4 : exercices de code, compilation, étude de cas

import { spawnSync } from 'child_process';
import { analyserErreursGpp, analyserSortieTests } from '../src/core/compilation';
import { codeSur, ExerciceImpossible, exerciceExistant, genererExerciceCode, lireExercice } from '../src/core/exercicesCode';
import { corrigerEtude, enregistrerEtude, genererEtude } from '../src/core/etudeDeCas';

const gppDispo = spawnSync('g++', ['--version']).status === 0;
const cfgGpp = { compilateur: 'g++', delaiExecutionMs: 3000 };

/** Fausse IA qui renvoie, dans l'ordre, les réponses données (et retient les demandes). */
function iaScriptee(reponses: unknown[]) {
  const demandes: string[] = [];
  const client: ClientIA = { json: async (_s, u) => { demandes.push(u); return reponses[Math.min(demandes.length - 1, reponses.length - 1)]; } };
  return { client, demandes };
}

test('compilation : lecture des erreurs g++ et des résultats de tests', () => {
  const e = analyserErreursGpp("/mnt/c/x/exercice.cpp:12:5: error: 'y' was not declared in this scope\n/mnt/c/x/exercice.cpp:3:1: warning: unused [-Wunused]\nIn file included from tests.cpp:2:");
  assert.deepEqual(e.map((x) => [x.fichier, x.ligne, x.gravite]), [['exercice.cpp', 12, 'error'], ['exercice.cpp', 3, 'warning']]);
  const t = analyserSortieTests('coucou\nFORGE_OK|a|\nFORGE_ECHEC|b|attendu : 2 ; obtenu : 3\nFORGE_BILAN|1|2');
  assert.deepEqual([t.reussis, t.total, t.bilanTrouve, t.sortie], [1, 2, true, 'coucou']);
  assert.equal(t.tests[1].detail, 'attendu : 2 ; obtenu : 3');
});

test('sécurité : le code généré qui touche au système est refusé', () => {
  assert.ok(codeSur('#include <iostream>\nint f() { return 1; }'));
  assert.ok(!codeSur('int main() { system("rm -rf /"); }'));
  assert.ok(!codeSur('#include <fstream>'));
  assert.ok(!codeSur('std::filesystem::remove_all(p);'));
});

const DEPART = 'int carre(int x) {\n  // TODO\n  return 0;\n}\n';
const SOLUTION_FAUSSE = 'int carre(int x) { return x + x; }\n';
const SOLUTION = 'int carre(int x) { return x * x; }\n';
const TESTS = '#include "forge_test.hpp"\n#include "exercice.cpp"\nint main() {\n  VERIFIE_EGAL(carre(3), 9, "carre(3)");\n  VERIFIE_EGAL(carre(-2), 4, "carre(-2)");\n  return forge::bilan();\n}\n';

test('exercice de code : une solution fausse de l’IA est détectée, puis corrigée', { skip: !gppDispo }, async () => {
  const coffre = coffreAvecNotions();
  const notion = lireNotionsRevision(coffre).find((n) => n.nom === 'Template')!;
  const base = { titre: 'Carré', enonce: 'Écris `carre`.', exercice_cpp: DEPART, tests_cpp: TESTS, indices: ['Multiplie.'] };
  const { client, demandes } = iaScriptee([{ ...base, solution_cpp: SOLUTION_FAUSSE }, { ...base, solution_cpp: SOLUTION }]);
  const e = await genererExerciceCode(coffre, client, cfgGpp, { titre: 'Template', notions: [notion], contexte: '' }, 'code');
  assert.equal(demandes.length, 2);
  assert.match(demandes[1], /ne passe pas ces tests/);
  assert.equal(fs.readFileSync(path.join(e.dossier, 'exercice.cpp'), 'utf8'), DEPART);
  assert.equal(fs.readFileSync(path.join(e.dossier, '.solution', 'exercice.cpp'), 'utf8'), SOLUTION);
  const relu = lireExercice(e.dossier);
  assert.deepEqual([relu.genre, relu.titre, relu.statut, relu.indices], ['code', 'Carré', 'a_faire', ['Multiplie.']]);
  assert.equal(relu.enonce, 'Écris `carre`.');
  assert.equal(exerciceExistant(coffre, 'Template', 'code')?.dossier, e.dossier);
});

test('exercice de code : départ qui passe déjà les tests, ou code dangereux → refusés', { skip: !gppDispo }, async () => {
  const coffre = coffreAvecNotions();
  const notion = lireNotionsRevision(coffre)[0];
  const cible = { titre: 'x', notions: [notion], contexte: '' };
  const { client } = iaScriptee([{ titre: 't', enonce: 'e', exercice_cpp: SOLUTION, solution_cpp: SOLUTION, tests_cpp: TESTS }]);
  await assert.rejects(genererExerciceCode(coffre, client, cfgGpp, cible, 'code', { essais: 1 }), /passe déjà tous les tests/);
  const dangereux = iaScriptee([{ titre: 't', enonce: 'e', exercice_cpp: 'int f(){ system("ls"); return 0; }', solution_cpp: SOLUTION, tests_cpp: TESTS }]);
  await assert.rejects(genererExerciceCode(coffre, dangereux.client, cfgGpp, cible, 'code', { essais: 1 }), /interdites/);
  await assert.rejects(genererExerciceCode(coffre, iaScriptee([{ impossible: true, raison: 'notion théorique' }]).client, cfgGpp, cible, 'code'), ExerciceImpossible);
});

const PROGRAMME = '#include <iostream>\nstruct A { virtual void f() { std::cout << "A\\n"; } };\nstruct B : A { void f() override { std::cout << "B\\n"; } };\nint main() { B b; A a = b; a.f(); A& r = b; r.f(); }\n';

test('prédis la sortie : la vraie sortie fait foi, l’IA doit l’avoir prévue', { skip: !gppDispo }, async () => {
  const coffre = coffreAvecNotions();
  const notion = lireNotionsRevision(coffre).find((n) => n.nom === 'Polymorphisme')!;
  const { client, demandes } = iaScriptee([
    { titre: 'Slicing', programme_cpp: PROGRAMME, sortie_attendue: 'B\nB', explication: 'faux' },
    { titre: 'Slicing', programme_cpp: PROGRAMME, sortie_attendue: 'A\nB', explication: 'La copie `a` est un vrai A (slicing).' },
  ]);
  const e = await genererExerciceCode(coffre, client, cfgGpp, { titre: 'Polymorphisme', notions: [notion], contexte: '' }, 'sortie');
  assert.match(demandes[1], /affiche réellement :\\nA\\nB/);
  assert.equal(e.sortieAttendue, 'A\nB\n');
  assert.match(e.programme ?? '', /A a = b/);

  // Dans une séance : réussite si la prédiction est exacte (espaces ignorés)
  const atelier = { preparer: async () => e };
  const seance = new Seance(coffre, { rapide: false, entrainement: true, perimetre: { type: 'notion', nom: 'Polymorphisme' }, code: 'surtout', atelier }, hasardFixe());
  const x = (await seance.suivant())!;
  assert.equal(x.exercice.type, 'sortie');
  assert.equal((await seance.repondre({ type: 'texte', valeur: ' A \nB\n' })).correction.resultat, 'reussite');
});

test('séance code : exercice réussi = preuve « code », même en entraînement', async () => {
  const coffre = coffreAvecNotions();
  const notions = lireNotionsRevision(coffre);
  const poly = notions.find((n) => n.nom === 'Polymorphisme')!;
  // Notion AAV [3] : exercices d'écriture de code possibles
  const { data, content } = lireNote(poly.chemin);
  data.aav_cible = 3;
  (await import('../src/core/coffre')).ecrireNote(poly.chemin, data, content);
  const faux = { dossier: coffre, genre: 'code' as const, titre: 'T', enonce: 'E', indices: [], notions: ['Polymorphisme'], statut: 'a_faire' as const, tentatives: 0 };
  fs.writeFileSync(path.join(coffre, 'enonce.md'), '---\ntype: exercice\n---\n# T\n');
  const seance = new Seance(coffre, { rapide: false, entrainement: true, perimetre: { type: 'notion', nom: 'Polymorphisme' }, code: 'surtout', atelier: { preparer: async (_n, g) => ({ ...faux, genre: g }) } }, hasardFixe(5));
  let x = (await seance.suivant())!;
  while (x.exercice.type === 'sortie') {
    await seance.repondre({ type: 'texte', valeur: '' });
    x = (await seance.suivant())!;
  }
  assert.ok(['code', 'bug'].includes(x.exercice.type));
  await seance.repondre({ type: 'code', reussi: true });
  assert.match(fs.readFileSync(poly.chemin, 'utf8'), /preuves:\n\s+code: 1/);
  assert.match(fs.readFileSync(path.join(coffre, 'enonce.md'), 'utf8'), /statut: reussi/);
});

test('étude de cas : barème ramené à 20, copie vide = 0, preuves si la moyenne', async () => {
  const coffre = coffreAvecNotions();
  const notions = lireNotionsRevision(coffre);
  const sujet = iaScriptee([{ titre: 'Zoo', contexte: 'Un zoo', questions: [
    { numero: 1, enonce: 'Écris la classe Animal', type: 'code', points: 6, corrige: '```cpp\nclass Animal {};\n```', criteres: ['virtual'] },
    { numero: 2, enonce: 'Pourquoi virtual ?', type: 'texte', points: 4, corrige: 'Liaison dynamique', criteres: [] },
  ] }]);
  const etude = await genererEtude(sujet.client, { titre: 'P04', contexte: 'Jeu', problematique: '?', notions }, 30);
  assert.deepEqual(etude.questions.map((q) => q.points), [12, 8]);
  const correction = await corrigerEtude(iaScriptee([{ questions: [{ numero: 1, points: 15, commentaire: 'Très bien' }, { numero: 2, points: 5, commentaire: '?' }], appreciation: 'Bien' }]).client, etude, ['class Animal { virtual ~Animal(); };', '']);
  assert.deepEqual(correction.questions.map((q) => q.points), [12, 0], 'plafonné au barème ; vide = 0');
  assert.equal(correction.note, 12);
  const chemin = enregistrerEtude(coffre, 'P04 - Titre 4', etude, ['class Animal { virtual ~Animal(); };', ''], correction, notions, 25);
  assert.match(fs.readFileSync(chemin, 'utf8'), /Note : 12\/20[\s\S]*Ma copie[\s\S]*class Animal/);
  assert.match(fs.readFileSync(notions[0].chemin, 'utf8'), /papier: 1[\s\S]*long: 1|long: 1[\s\S]*papier: 1/);
});

test('compilation : dossier dont le nom contient des espaces', { skip: !gppDispo }, async () => {
  const { lancerTests } = await import('../src/core/compilation');
  const dossier = path.join(coffreTemporaire(), '2026-11-22 Mon exercice (2)');
  fs.mkdirSync(dossier);
  fs.writeFileSync(path.join(dossier, 'exercice.cpp'), SOLUTION);
  fs.writeFileSync(path.join(dossier, 'tests.cpp'), TESTS);
  const r = await lancerTests(cfgGpp, dossier);
  assert.deepEqual([r.compile, r.reussis, r.total, r.plante], [true, 2, 2, false]);
});

// --------------------------------------------------------------------------
// Phase 5 : la ferme

import { acheter, deplacerDecoration, ErreurFerme, gainEntree, lireDisposition, niveauFermier, piecesGagnees, planter, saison, tailleFerme, toutPlanter, vueFerme } from '../src/core/ferme';
import { DECORATIONS, PALETTE, STADES } from '../src/vues/fermeSprites';
import { ajouterHistorique } from '../src/core/notionsRevision';

const entree = (type: string, resultat: 'reussite' | 'moyen' | 'echec', extra: object = {}) => ({ date: '2026-11-22T10:00:00', notion: 'x', type, resultat, compte: true, ...extra });

test('ferme : pièces gagnées en révisant, niveau de fermier, taille, saison', () => {
  assert.equal(gainEntree(entree('trou', 'reussite')), 5);
  assert.equal(gainEntree({ ...entree('trou', 'reussite'), compte: false }), 2);
  assert.equal(gainEntree(entree('code', 'reussite')), 15);
  assert.equal(gainEntree(entree('trou', 'reussite', { niveauAvant: 6 })), 25, 'récolte : +20');
  assert.equal(gainEntree(entree('etude_de_cas', 'reussite', { points: 14.5 })), 29);
  assert.equal(gainEntree(entree('qcm_notion', 'echec')), 0);
  assert.deepEqual(niveauFermier(0), { niveau: 1, precedent: 0, prochain: 100 });
  assert.equal(niveauFermier(300).niveau, 3);
  assert.deepEqual(tailleFerme(1), { largeur: 12, hauteur: 8 });
  assert.equal(saison('2026-11-22'), 'automne');
  assert.equal(saison('2027-01-05'), 'hiver');
});

test('ferme : planter, acheter, déplacer, ranger ; pièces = gagnées − dépensées', () => {
  const coffre = coffreAvecNotions();
  for (let i = 0; i < 10; i++) ajouterHistorique(coffre, entree('trou', 'reussite'));
  let vue = vueFerme(coffre);
  assert.equal(vue.pieces, 50);
  assert.equal(vue.plantes.filter((p) => p.x === null).length, 5, 'toutes les notions sont des graines');

  planter(coffre, 'Template', 2, 2);
  assert.throws(() => planter(coffre, 'Surcharge', 2, 2), ErreurFerme);
  assert.throws(() => planter(coffre, 'Surcharge', 12, 0), ErreurFerme, 'hors de la ferme');
  acheter(coffre, 'chemin', 2, 2); // un chemin est un sol : il passe sous une plante
  assert.throws(() => acheter(coffre, 'chemin', 2, 2), ErreurFerme, 'pas deux chemins au même endroit');
  acheter(coffre, 'rocher', 4, 4);
  assert.throws(() => acheter(coffre, 'fleurs', 4, 4), ErreurFerme, 'case occupée');
  assert.throws(() => acheter(coffre, 'banc', 6, 6), /niveau 2/);
  assert.equal(vueFerme(coffre).pieces, 50 - 5 - 10);
  acheter(coffre, 'buisson', 5, 5);
  acheter(coffre, 'buisson', 6, 5);
  assert.throws(() => acheter(coffre, 'fleurs', 7, 7), /Il te manque 7/);

  const rocher = lireDisposition(coffre).decorations.find((d) => d.type === 'rocher')!;
  deplacerDecoration(coffre, rocher.id, null, null); // rangé : gardé, sans remboursement
  assert.equal(vueFerme(coffre).decorations.find((d) => d.id === rocher.id)?.x, null);
  deplacerDecoration(coffre, rocher.id, 2, 3);
  assert.equal(vueFerme(coffre).pieces, 5);

  assert.equal(toutPlanter(coffre), 4);
  vue = vueFerme(coffre);
  assert.equal(vue.plantes.filter((p) => p.x === null).length, 0);
  const cases = vue.plantes.map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(cases).size, cases.length, 'jamais deux plantes sur la même case');
});

test('ferme : les plantes reflètent la révision (stade, variété par Prosit, soif)', () => {
  const coffre = coffreAvecNotions();
  const n = lireNotionsRevision(coffre)[0];
  enregistrerEtatTest(n.chemin, 5, '2026-11-01');
  const p = vueFerme(coffre, '2026-11-22').plantes.find((x) => x.nom === n.nom)!;
  assert.deepEqual([p.niveau, p.emoji, p.retard, p.variete], [5, '🌸', 21, 'pommier']);
});

function enregistrerEtatTest(chemin: string, niveau: number, prochaine: string) {
  const { data, content } = lireNote(chemin);
  data.niveau = niveau;
  data.prochaine_revision = prochaine;
  require('../src/core/coffre').ecrireNote(chemin, data, content);
}

test('ferme : sprites 16×16 avec des couleurs connues', () => {
  const connues = new Set([...Object.keys(PALETTE), 'L', 'l', 'D', 'f', 'F', '.']);
  for (const s of [...STADES, ...Object.values(DECORATIONS)]) {
    assert.equal(s.length, 16);
    for (const ligne of s) {
      assert.equal(ligne.length, 16, ligne);
      for (const c of ligne) assert.ok(connues.has(c), `couleur inconnue « ${c} »`);
    }
  }
});

test('séance : le bilan compte les pièces gagnées', async () => {
  const coffre = coffreAvecNotions();
  const seance = new Seance(coffre, { rapide: true, entrainement: false, perimetre: { type: 'tout' } }, hasardFixe());
  const x = (await seance.suivant())!;
  await seance.repondre(x.exercice.options ? { type: 'option', index: x.exercice.bonneOption! } : { type: 'texte', valeur: x.exercice.attendu ?? '' });
  assert.equal(seance.terminer().pieces, 5);
});
