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
