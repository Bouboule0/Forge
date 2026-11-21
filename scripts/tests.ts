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

test('séance : la réussite fait pousser et est enregistrée, l’échec revient', () => {
  const coffre = coffreAvecNotions();
  const seance = new Seance(coffre, { rapide: true, entrainement: false, perimetre: { type: 'tout' } }, hasardFixe(), aujourdhui());
  assert.equal(seance.aRevoir().length, 5);
  const premier = seance.suivant()!;
  const bonne = premier.exercice.options ? { type: 'option' as const, index: premier.exercice.bonneOption! } : { type: 'texte' as const, valeur: premier.exercice.attendu! };
  const r = seance.repondre(bonne);
  assert.equal(r.changement?.apres, 1);
  assert.match(fs.readFileSync(premier.notion.chemin, 'utf8'), /niveau: 1[\s\S]*maitrise\/1/);

  const second = seance.suivant()!;
  seance.repondre({ type: 'jeNeSaisPas' });
  const restants = seance.restants();
  assert.equal(restants, 4, 'la notion ratée est remise dans la file');
  // Revue une 2e fois dans la journée : entraînement, plus de changement de niveau
  let x = seance.suivant();
  while (x && x.notion.chemin !== second.notion.chemin) {
    seance.repondre({ type: 'jeNeSaisPas' });
    x = seance.suivant();
  }
  assert.ok(x);
  assert.equal(seance.repondre({ type: 'jeNeSaisPas' }).compte, false);
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
