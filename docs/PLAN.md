# Forge — Extension VS Code de révision par l'action

> Tes Prosits et CER deviennent un **second cerveau Obsidian** (une note par notion, toutes reliées entre elles). VS Code devient ton **terrain d'entraînement** : tu révises en *faisant* (code C++, UML, textes à trous, explications, QCM façon CCTL), avec la répétition espacée. Tes révisions font pousser une **ferme pixel-art** que tu aménages toi-même.

Version 2 du plan, mise à jour après tes réponses et la lecture de tes CER 1 à 4.

---

## 0. Ce que j'ai appris de tes 4 CER

| Constat | Conséquence pour Forge |
|---|---|
| Structure identique d'un Prosit à l'autre (AAV, mots-clés, contexte, problématique, contraintes, livrables, généralisation, pistes, plan d'action, workshop, corbeille, résolution, bilan, validation des pistes, sources) | L'import peut être **fiable et presque automatique**. |
| Toutes les définitions des mots-clés sont générées par IA, « à relire et vérifier » | Chaque notion porte un état : `à vérifier` ou `vérifié`. Vérifier une notion compte déjà comme une première révision. |
| Les **résolutions sont souvent incomplètes** (P1 et P2 vides, P3 et P4 en partie) et la **validation des pistes** est presque vide | C'est la grande idée : **réviser = compléter ton CER**. Une piste non validée devient un exercice (« Vrai ou faux ? Justifie »), et ta réponse corrigée remplit le tableau du CER. |
| Pas de corrigé officiel | L'IA sert de référence de secours, mais tout ce qu'elle produit est marqué comme tel. Les exercices de code ont une vraie vérification : la compilation et les tests. |
| Niveaux d'AAV : [2] comprendre, [3] mettre en œuvre, [5] maîtriser | Ces niveaux fixent la **cible de maîtrise** de chaque notion (voir la section 5). |
| Les notions reviennent d'un Prosit à l'autre (Encapsulation dans P2 et P4, POO dans P1 et P3, Classes dans P1 et P2…) | **Une seule note par notion**, liée à plusieurs Prosits. C'est ce qui fait un vrai graphe de connaissances. |
| Livrables UML dans P2 et P3 | Exercices UML écrits en **Mermaid** (diagrammes en texte, affichés aussi dans Obsidian). |
| Images dans les CER (diagrammes UML du P3) | Les images sont extraites et rangées dans le coffre. |
| Infos de groupe (animateur, scribe…) | Ignorées, ou conservées dans l'en-tête de la note Prosit. |

---

## 1. Vue d'ensemble

```
 Word (.docx) ──import──►  Coffre Obsidian (Markdown)  ◄──lit/écrit──►  Extension VS Code « Forge »
 CER, Prosit Aller            Prosits/  Notions/                          - Séances de révision
                              Exercices/  Ferme                           - Exercices C++ compilés (g++ via WSL)
        ▲                          ▲                                      - Ferme pixel-art
        └──── export .docx ────────┤                                      - Barre d'état « 🌱 7 à revoir »
          (si l'école exige Word)  │                                      - Statistiques
                              Graphe Obsidian                                      │
                              coloré par maîtrise                                  ▼
                                                                             API DeepSeek
```

**Deux dépôts GitHub :**
1. `forge` : le code de l'extension. Il peut devenir public si tu la partages un jour.
2. `second-cerveau` : ton coffre Obsidian (notes et progression), **privé**. Il se synchronise entre tes ordinateurs avec le plugin *Obsidian Git* ou avec Git dans VS Code.

---

## 2. Markdown d'abord, Word si besoin

- Tu écris et révises en **Markdown**.
- Commande **« Forge : Exporter le CER en Word »** : génère un `.docx` qui reprend la structure CESI (titres, tableaux des mots-clés et des pistes), via `pandoc` et un modèle Word de référence fait à partir de ton CER actuel.
- Tu peux donc passer au Markdown dès maintenant, quelle que soit la règle de l'école.
- Commande **« Forge : Nouveau Prosit »** : crée la note d'un Prosit vierge, avec toutes les sections CESI.

---

## 3. Organisation du coffre

```
SecondCerveau/
├── Prosits/
│   ├── P01 - La POO qu'saco.md
│   ├── P02 - Fini les spaghettis.md
│   ├── P03 - Formes géométriques.md
│   └── P04 - Moteur de combat.md
├── Notions/
│   ├── Encapsulation.md            ← liée à P02 et P04
│   ├── Héritage.md
│   ├── Polymorphisme.md
│   ├── Virtual Function Table.md
│   ├── Principe de substitution de Liskov.md
│   └── ...
├── Modules/
│   └── Programmation orientée objet.md
├── Exercices/
│   └── P04/01-ajouter-un-mage/     ← enonce.md, main.cpp, tests.cpp
├── Ressources/images/
├── Sources/                        ← tes .docx originaux
└── .forge/
    ├── historique.json             ← journal des séances
    └── ferme.json                  ← disposition de ta ferme
```

### Note « Notion »

```markdown
---
type: notion
module: "[[Programmation orientée objet]]"
prosits: ["[[P04 - Moteur de combat]]"]
aav_cible: 3                # niveau d'AAV le plus élevé parmi les Prosits liés
statut: a_verifier          # a_verifier | verifie
niveau: 2                   # 0 à 6, répétition espacée = stade de la plante
prochaine_revision: 2026-11-24
tags: [cpp, maitrise/2]
---
# Polymorphisme dynamique
...
```

### Note « Prosit »

Elle contient les sections CESI. Le tableau de **validation des pistes** devient une liste que Forge met à jour :

```markdown
## Validation des pistes
- [ ] L'héritage permet de rendre un code modulable — *à valider*
- [x] Le polymorphisme utilise la VFT — **Invalidée en partie** : vrai pour le dynamique, pas pour le statique. ✅ validé en révision le 2026-11-20
```

---

## 4. Import de tes CER

Commande **« Forge : Importer un Prosit / CER »** (un fichier, ou plusieurs d'un coup pour tes P1 à P4) :
1. Conversion du `.docx` en Markdown (`mammoth`), images comprises.
2. **Découpage local** des sections, sans IA : ta structure est très régulière.
3. DeepSeek ne sert que pour le reste :
   - reconnaître une notion qui existe déjà (« Encapsulation » dans P2 et P4) ;
   - relier les AAV aux mots-clés ;
   - proposer les liens entre notions.
4. **Écran de validation** avant d'écrire dans le coffre : tu peux fusionner, renommer ou ignorer des notions.

---

## 5. Les AAV comme objectif de maîtrise

| AAV | Sens | Ce qu'il faut réussir pour qu'une notion soit « mûre » |
|---|---|---|
| [2] Comprendre | savoir expliquer | explication libre, texte à trous, vrai ou faux |
| [3] Mettre en œuvre | savoir coder | ce qui précède **plus** au moins 2 exercices de code réussis |
| [5] Maîtriser | savoir s'adapter | ce qui précède **plus** un exercice long dans le contexte d'un Prosit, et un exercice « sur papier » |

Le tableau de bord indique, par Prosit, la part des AAV réellement atteints.

---

## 6. Les types d'exercices

### Courts (1 à 10 min)
| Type | Exemple | Correction |
|---|---|---|
| **Texte à trous** | « Chaque objet contient un pointeur caché, le ___, vers la table de sa classe. » | locale, sans IA |
| **QCM (façon CCTL)** | « Quelle condition n'est PAS requise pour le polymorphisme dynamique ? » | locale |
| **Vrai ou faux ? Justifie** | Tes propres pistes : « Le chiffrement César est plus sûr que XOR » | DeepSeek pour la justification, et **le résultat remplit ton CER** |
| **Prédis la sortie** | Qu'affiche `Animal* a = new Chat(); a->parler();` ? | locale (on compile et on compare) |
| **Trouve le bug** | `attaquer()` n'est pas `virtual` : pourquoi le Guerrier fait-il l'attaque de base ? | compilation et tests |
| **Petit exercice de code** | « Écris une classe `Rectangle` qui hérite de `Forme` avec `aire()` » | compilation et tests |
| **Explication libre** | « Explique le principe de Liskov avec l'exemple voiture / moteur » | DeepSeek, en comparant à ta note |

### Longs (20 à 40 min, dans le contexte d'un Prosit)
- **Mini-projet** : « Rends le moteur de combat modulable : ajoute un Mage et un Archer sans modifier `MoteurCombat` » (P4) ; « Ajoute un niveau de chiffrement 4 sans dupliquer de code » (P2).
- **UML et code** : dessiner le diagramme de classes en Mermaid, puis l'implémenter. DeepSeek compare le diagramme et le code.

### Mode « sur papier » (pour les études de cas)
- Éditeur **sans autocomplétion, sans compilation, sans coloration des erreurs**, avec un chronomètre.
- Tu rends ton code tel quel. DeepSeek le corrige comme le ferait un correcteur : logique, syntaxe, bonnes pratiques.
- Ensuite seulement, tu peux compiler pour voir ce que tu aurais raté.

### Déroulé d'un exercice de code
1. Forge crée `Exercices/P04/xx/` et ouvre l'énoncé et `main.cpp`.
2. Tu codes. **« Forge : Vérifier »** compile avec `wsl g++ -std=c++17`, lance les tests, puis affiche ✅ ou ❌ avec les erreurs.
3. Un indice ou la correction sont disponibles, mais la notion progresse moins.
4. Les exercices générés restent dans le coffre : tu peux les refaire, et l'IA n'est pas facturée deux fois.

---

## 7. Répétition espacée

| Niveau | Plante | Prochaine révision si réussite |
|---|---|---|
| 0 | graine (jamais révisée) | aujourd'hui |
| 1 | germe | 1 jour |
| 2 | pousse | 3 jours |
| 3 | jeune plant | 7 jours |
| 4 | plant adulte | 14 jours |
| 5 | en fleurs | 30 jours |
| 6 | récoltable (maîtrisé) | 60 jours, entretien |

- Réussite : la notion monte d'un niveau. Échec : elle perd un ou deux niveaux et revient le lendemain.
- Une notion ne peut pas dépasser le niveau 4 tant que sa cible d'AAV n'est pas atteinte. Par exemple, une notion [3] exige du code réussi.
- **Mode examen** : tu choisis les Prosits et la date.
  - **CCTL** : séance de QCM chronométrée.
  - **Étude de cas** : exercices longs et mode papier.
  - Les révisions se resserrent jusqu'au jour J.

---

## 8. La ferme (inspirée des jeux de ferme, mais avec un style et des graphismes originaux)

**Le principe : la révision est l'unique source d'énergie de la ferme.**

| Élément de jeu | Correspondance avec la révision |
|---|---|
| **Graine** | Chaque nouvelle notion importée te donne sa graine. Tu choisis où la planter. |
| **Espèce de plante** | Une espèce par module (POO = tomates, Réseau = blé…), une couleur par Prosit. |
| **Croissance** | Niveau de répétition espacée (0 à 6). |
| **Arrosage** | Réviser une notion arrose sa plante. Une notion en retard **fane**, puis **se dessèche**, sans jamais mourir : tu peux toujours la sauver. |
| **Récolte** | Une notion au niveau 6 produit une récolte à chaque révision d'entretien. |
| **Pièces** | Gagnées par les récoltes et les exercices réussis, avec un bonus pour le code compilé du premier coup. |
| **Boutique** | Clôtures, chemins, arbres, étang, épouvantail, serre, grange, animaux… pour **décorer et agrandir** la ferme. |
| **Agrandissement** | De nouvelles parcelles se débloquent avec ton niveau de fermier. |
| **Saisons** | Les semestres ; ou simplement un cycle visuel. |
| **Série de jours** | Bonus à l'arrosage. |

- **Édition libre** : grille en tuiles, glisser-déposer pour placer, déplacer ou supprimer.
- **Survol d'une plante** : nom de la notion, niveau, prochaine révision. Un clic lance la révision de cette notion.
- **Technique** : webview avec un canvas HTML5 en pixel-art. Graphismes originaux ou libres de droits (par exemple les packs CC0 de Kenney), jamais d'assets d'un jeu existant.
- **Lien avec Obsidian** : le graphe se colore selon la maîtrise. Optionnellement, une note `Ferme.md` reprend la ferme en image.

---

## 9. Séances de révision

- **Lancement** : commande « Forge : Réviser », clic sur `🌱 7 à revoir` dans la barre d'état, ou clic sur une plante.
- **Suggestion à l'ouverture** (désactivable) : « 7 notions ont soif 💧 — Réviser / Plus tard ».
- **Format** : « Rapide » (exercices courts, sans code long) ou « Longue » (avec du code). Durée libre dans les deux cas, bouton « Stop » à tout moment.
- **Ordre** : notions en retard, puis notions faibles, puis pistes non validées, puis nouvelles notions.
- **Fin de séance** : bilan (« +3 plantes arrosées, 1 récolte, +45 pièces ») et bouton « Voir ma ferme ».

---

## 10. Statistiques
- Série de jours, temps de révision par semaine.
- Maîtrise par module, par Prosit et par AAV.
- Les 5 notions les plus fragiles.
- Taux de réussite par type d'exercice.
- Progression du CER : pistes validées et sections complétées.
- Charge de révision prévue sur les 7 prochains jours.

---

## 11. Technique

| Élément | Choix |
|---|---|
| Langage | TypeScript |
| Squelette | `npx --package yo --package generator-code -- yo code` |
| Interfaces | Webviews (séance, ferme, statistiques), TreeView (Prosits et notions), StatusBarItem |
| Import .docx | `mammoth` (Word vers HTML/Markdown, images comprises) |
| Export .docx | `pandoc` avec un modèle de référence CESI |
| En-têtes | `gray-matter` |
| IA | DeepSeek (`deepseek-chat`, API compatible OpenAI). Clé dans le **SecretStorage** de VS Code. |
| C++ | réglage `forge.compilateur`, par défaut `wsl g++ -std=c++17 -Wall`. Les chemins Windows sont convertis pour WSL (`C:\...` → `/mnt/c/...`). Tests avec `doctest` (un seul en-tête) ou de simples `assert`. |
| UML | Mermaid `classDiagram` (affiché nativement dans Obsidian et dans l'aperçu Markdown de VS Code) |
| Ferme | Canvas HTML5, sprites 16×16 ou 32×32 |
| Synchronisation | Git/GitHub : dépôt privé pour le coffre |
| Partage | `.vsix`, puis Marketplace |

**Emplacement du coffre :** côté Windows (par exemple `C:\Users\<toi>\SecondCerveau`), pour qu'Obsidian (application Windows) y accède vite. Forge appelle `wsl g++` sur les fichiers via `/mnt/c/...`.

---

## 12. Étapes de réalisation (phases principales)

| Phase | Contenu | Résultat |
|---|---|---|
| **0. Installation** | Node.js, squelette de l'extension, vérification de `wsl g++`, coffre Obsidian vide, 2 dépôts GitHub | « Hello Forge » qui s'affiche avec F5 |
| **1. Import** | Import de tes 4 CER, fusion des notions communes, écran de validation, nouveau Prosit, export Word | Ton graphe Obsidian prend forme |
| **2. Révision hors ligne** | Texte à trous, QCM, répétition espacée, barre d'état, séance de durée libre | Tu révises tous les jours |
| **3. IA** | Vrai ou faux avec remplissage du CER, explication libre, vérification des définitions | Ton CER se complète en révisant |
| **4. Code** | Exercices courts, prédis la sortie, trouve le bug, mini-projets, compilation WSL, mode papier | Les AAV [3] et [5] se valident |
| **5. Ferme** | Canvas pixel-art, placement libre, croissance et fanaison, boutique, pièces | La motivation |
| **6. Finitions** | Mode examen (CCTL et étude de cas), statistiques, UML Mermaid, `.vsix` partageable | Version 1.0 |

---

### Phases annexes

Les phases 0 à 6 ci-dessus sont les **phases principales** : le socle de Forge. D'autres idées s'ajouteront ensuite sous forme de **phases annexes** (à définir ensemble).

## 13. Points de vigilance
- **Pas de corrigé officiel** : l'IA peut se tromper. Garde-fous : statut `à vérifier`, tests réels pour le code, bouton « Signaler une erreur », et un mode qui demande à DeepSeek ses sources.
- **WSL** : la conversion des chemins et le temps de démarrage de WSL (une seconde environ la première fois).
- **Ferme** : c'est la partie la plus longue à faire joliment. Une version simple d'abord (grille et émojis), le pixel-art ensuite.
- **Conflits Git** entre deux ordinateurs : penser à `pull` en début de séance (Forge peut le faire) et à `push` en fin de séance.
