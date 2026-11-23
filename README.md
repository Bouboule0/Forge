# 🔨 Forge

<img src="media/icone.png" width="96" alt="Icône de Forge : un pommier pixel-art">

Extension VS Code pour réviser **en agissant** les notions vues en Prosit au CESI.

Tes CER deviennent un **second cerveau Obsidian** : une note par Prosit, une note par notion, toutes reliées entre elles. VS Code devient ton terrain d'entraînement (exercices de code C++, textes à trous, explications…). Tes révisions font pousser une ferme pixel-art.

Le plan complet est dans [`docs/PLAN.md`](docs/PLAN.md).

## Où on en est

| Phase | Contenu | État |
|---|---|---|
| 0. Installation | Squelette, vérification de `wsl g++`, « Hello Forge » | ✅ |
| 1. Import | Import des CER (.docx), écran de validation, nouveau Prosit, export Word | ✅ |
| 2. Révision hors ligne | Texte à trous, QCM, répétition espacée, séances | ✅ |
| 3. IA (DeepSeek) | Relecture des définitions, explications corrigées, pistes de solutions | ✅ |
| 4. Code | Exercices C++ compilés et testés, prédis la sortie, trouve le bug, mini-projets, mode papier | ✅ |
| 5. Ferme | Ferme pixel-art que tu aménages toi-même | ✅ |
| 6. Finitions | Mode examen (CCTL, étude de cas), statistiques, prise en main, `.vsix` | ✅ |

Ces six phases sont les **phases principales** du projet : elles sont terminées (version 1.0.0). D'autres idées viendront ensuite sous forme de **phases annexes** (par exemple : exercices UML avec Mermaid).

---

## 🚀 Installer et lancer Forge (Windows)

### Ce qu'il te faut

- **VS Code**
- **Node.js** : vérifie dans PowerShell avec `node -v`
- **Git** : vérifie avec `git --version`
- **WSL avec g++** : vérifie avec `wsl g++ --version`
- **Obsidian** : https://obsidian.md (gratuit)
- *(optionnel, pour l'export Word)* **pandoc** : `winget install JohnMacFarlane.Pandoc`

### 1. Récupérer le code

Dans PowerShell, depuis le dossier où tu veux le projet (par exemple `Documents`) :

```bash
git clone https://github.com/Bouboule0/Forge.git
```

```bash
cd Forge
```

```bash
npm install
```

```bash
code .
```

### 2. Lancer l'extension en mode développement

1. Dans VS Code, appuie sur **F5**.
2. Une **deuxième fenêtre** s'ouvre, avec « [Extension Development Host] » dans son titre. Forge y est chargée.
3. Dans cette deuxième fenêtre, ouvre la palette avec **Ctrl+Shift+P**, tape `Forge`, et tu vois toutes les commandes.

> Le code est dans `src/`. Après une modification, appuie sur **Ctrl+R** dans la deuxième fenêtre pour recharger l'extension. Si ça ne suffit pas, relance F5.

### 3. Vérifier l'installation

`Ctrl+Shift+P` → **Forge : Vérifier l'installation**

Le panneau « Forge » s'ouvre :
- ✅ compilateur : `wsl g++` est trouvé, et un petit programme qui affiche **« Hello Forge ! »** est compilé puis lancé dans WSL ;
- ✅ ou ➖ pour pandoc et git.

### 4. Créer ton second cerveau

`Ctrl+Shift+P` → **Forge : Créer / choisir le coffre Obsidian** → **Créer un nouveau coffre**. Choisis par exemple `Documents`, puis garde le nom `SecondCerveau`.

### 5. Importer tes CER

`Ctrl+Shift+P` → **Forge : Importer des CER / Prosits (.docx)**, puis sélectionne tes fichiers Word. Tu peux en sélectionner plusieurs, Prosits Aller compris.

L'**écran de validation** s'ouvre. Tu peux :
- corriger le titre d'un Prosit (ex. « Adaptabilité » → « Moteur de combat ») ;
- renommer une notion (ex. « Virtual Fonction Table » → « Virtual Function Table ») ;
- **fusionner** deux notions (ex. « Fonction générique » dans « Template ») ;
- décocher une notion inutile.

Clique sur **Importer**. Astuce : un clic droit sur un `.docx` dans l'explorateur de VS Code permet aussi d'importer.

### 6. Ouvrir le coffre dans Obsidian

Obsidian → **Ouvrir un dossier comme coffre** → `Documents\SecondCerveau`.
Ouvre ensuite la **vue graphe** (Ctrl+G) : chaque notion est colorée selon ta maîtrise. Tout est gris (« graine ») pour l'instant, et ça va pousser.

### 7. Installer Forge pour de bon (sans F5)

```bash
npm run package
```

Puis, dans VS Code : panneau Extensions → `…` → **Installer depuis un VSIX…** → `forge-1.0.0.vsix`.

> Le `.vsix` est aussi fabriqué automatiquement par GitHub à chaque pull request (onglet **Actions** → **Vérification** → artefact `forge-vsix`).

---

## 🔄 Synchroniser ton coffre entre tes ordinateurs (GitHub)

Crée sur GitHub un dépôt **privé** `second-cerveau`. Ensuite, dans le dossier du coffre :

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Mon second cerveau"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/Bouboule0/second-cerveau.git
```

```bash
git push -u origin main
```

Sur ton autre ordinateur : `git clone` du dépôt, puis **Forge : Créer / choisir le coffre** → **Choisir un dossier existant**.
Pour synchroniser automatiquement, installe dans Obsidian le plugin communautaire **Obsidian Git**.

---

## 🌱 Réviser

Lance une séance avec **Ctrl+Alt+R**, un clic sur `🌱 N à revoir` dans la barre d'état, ou `Ctrl+Shift+P` → **Forge : Réviser**.
Un clic droit sur une note Prosit ou Notion → **Forge : Réviser** révise seulement ce Prosit ou cette notion.

| Séance | Contenu |
|---|---|
| ⚡ Rapide | Textes à trous et QCM, idéal entre deux cours |
| 🧠 Complète | En plus : expliquer avec tes mots (corrigé par l'IA si ta clé DeepSeek est enregistrée) et valider les pistes de tes CER |
| 🏋️ Entraînement libre | Tout le périmètre, sans changer le calendrier (pratique avant un CCTL) |

La séance dure **aussi longtemps que tu veux** (bouton « Terminer la séance »). Raccourcis : `Entrée` valider / suivant, `1`–`4` choisir une réponse, `Échap` je ne sais pas.

### Avec l'IA (clé DeepSeek enregistrée)

- **Explique avec tes mots** : tu écris ton explication, l'IA la note sur 10, te dit ce qui est juste et ce qu'il faut revoir, et propose une explication modèle. Sans clé, tu t'auto-évalues.
- **Valide une piste de ton CER** : pour chaque piste « ❓ À valider » de tes Prosits, choisis ✅ validée, ⚠️ en partie ou ❌ invalidée, et justifie. L'IA corrige, puis **le statut et la justification sont écrits dans le tableau de validation de ton CER** (et donc dans l'export Word). Même « Je ne sais pas » complète le CER avec la réponse de l'IA.
- Les pistes déjà validées reviennent en **vrai/faux** (hors ligne), au plus une fois par semaine chacune.
- Raccourci : `Ctrl+Entrée` pour envoyer un texte à l'IA.

### Comment poussent tes plantes

| Niveau | Stade | Prochaine révision après une réussite |
|---|---|---|
| 0 | 🌰 graine | — |
| 1 | 🌱 germe | 1 jour |
| 2 | 🌿 pousse | 3 jours |
| 3 | 🪴 jeune plant | 7 jours |
| 4 | 🌳 plant adulte | 14 jours |
| 5 | 🌸 en fleurs | 30 jours |
| 6 | 🍎 récoltable | 60 jours |

- Un **échec** fait perdre un niveau (deux à partir de 🌳), et la notion revient le lendemain. Elle revient aussi plus tard dans la même séance.
- **Seule la première réponse du jour** compte ; les suivantes sont de l'entraînement.
- Pour dépasser 🌳, il faut des exercices qui prouvent l'AAV : une explication réussie corrigée par l'IA (AAV [2]), plus 2 exercices de code réussis (AAV [3]), plus un exercice long et une étude de cas sur papier (AAV [5]).

## 🤖 Définitions générées par IA

Tes CER contiennent des définitions générées par IA. Par défaut, Forge les **accepte d'office** (réglage `forge.definitionsIA` = `accepter`) et les fait **relire par DeepSeek** :

- une définition **juste** est marquée comme relue (`revue_ia: ok`) ;
- une définition **fausse ou imprécise** est **remplacée** par une version corrigée. L'ancienne reste visible dans la note (encadré repliable « Définition d'origine », avec la raison), et un réimport ne la remet pas ;
- une notion **sans définition** (par exemple un objectif d'AAV comme « Principe de substitution de Liskov ») reçoit une définition écrite par l'IA ;
- un rapport est créé dans `Rapports/Relecture IA <date>.md`.

Pour l'activer :
1. Crée une clé API sur https://platform.deepseek.com/api_keys.
2. `Ctrl+Shift+P` → **Forge : Configurer la clé DeepSeek**. La clé est stockée de façon sécurisée par VS Code, jamais dans un fichier.
3. `Ctrl+Shift+P` → **Forge : Faire relire les définitions par l'IA**.

Ensuite, chaque import lance automatiquement la relecture des nouvelles définitions (réglage `forge.relectureIAApresImport`). Tu peux toujours modifier une définition à la main.

> Tu préfères tout valider toi-même ? Mets `forge.definitionsIA` sur `verifier` : les séances complètes te proposeront alors « Vérifie la définition » pour chaque définition générée par IA.

## 💻 Exercices de code C++

Il faut une clé DeepSeek (pour générer les exercices) et un compilateur qui marche (« Forge : Vérifier l'installation » → ✅ Hello Forge).

| Exercice | Ce que tu fais | Comment c'est vérifié |
|---|---|---|
| ⌨️ Exercice de code (5–10 min) | Compléter `exercice.cpp` (les `// TODO`) | Tests compilés et lancés par Forge |
| 🐞 Trouve le bug | Un code compile mais se comporte mal : trouve et corrige | Tests |
| 🧱 Mini-projet (20–40 min) | Plusieurs classes, dans l'histoire d'un Prosit | Tests |
| 🔮 Prédis la sortie | Écrire ce qu'affiche un programme | La **vraie** sortie du programme compilé |

**Où les faire :**
- **Ctrl+Alt+R** → **💻 Séance code** (ou un peu dans la séance complète) ;
- `Ctrl+Shift+P` → **Forge : Nouvel exercice de code** (au choix : notion, type, mini-projet sur un Prosit) ;
- **Forge : Mes exercices de code** pour reprendre ou refaire un exercice.

**Comment ça marche :** `exercice.cpp` s'ouvre dans l'éditeur. Tu codes avec toutes les aides de VS Code, puis **Ctrl+Alt+V** (ou ▶️ Vérifier) : Forge compile avec `wsl g++`, lance les tests et souligne les erreurs du compilateur dans l'éditeur. 💡 Indices et 🏳️ correction sont disponibles.

**Exercices fiables :** avant de te donner un exercice, Forge le compile et vérifie que la solution de l'IA passe tous ses tests et que le code de départ échoue. Pour « prédis la sortie », la réponse attendue est la sortie réelle du programme. Si l'IA se trompe, Forge lui renvoie l'erreur pour qu'elle corrige (jusqu'à 3 essais).

Chaque exercice est rangé dans `Exercices/<notion>/` : `enonce.md` (lisible dans Obsidian), `exercice.cpp`, `tests.cpp`, et la solution dans `.solution/`.

> 🔒 **Sécurité** : le code écrit par l'IA est exécuté sur ta machine (dans WSL). Forge refuse le code qui touche aux fichiers ou au système (`system()`, `<fstream>`, `<filesystem>`…) et arrête tout programme au bout de 5 secondes.

## 📝 Étude de cas sur papier

`Ctrl+Shift+P` → **Forge : Étude de cas sur papier** : choisis un Prosit et une durée (20 min à 1 h). L'IA écrit un sujet d'examen (3 à 5 questions, barème sur 20). Tu réponds **comme sur papier** : chronomètre, pas de compilateur, pas d'autocomplétion. À la fin, l'IA corrige comme un correcteur d'examen (petites fautes de syntaxe tolérées, erreurs de conception pénalisées), question par question, avec le corrigé.

Le sujet, ta copie et la correction sont enregistrés dans `Exercices/<Prosit>/`. Avec au moins 10/20, les notions du Prosit gagnent la preuve « papier » (et « exercice long » si l'épreuve dure 30 min ou plus).

## 🌻 Ma ferme

Ouvre-la avec 🌻 dans la barre d'état, **Forge : Ma ferme**, ou le bouton en fin de séance.

- **Chaque notion est une plante** que tu places où tu veux (onglet 🌰 Graines, ou « Tout planter »). Chaque Prosit a sa variété : pommier, oranger, myrtillier, citronnier…
- **Réviser fait pousser** : 🌰 graine → 🌱 → 🌿 → 🪴 → 🌳 → 🌸 en fleurs → 🍎 récoltable (c'est le niveau de répétition espacée).
- 💧 une goutte = notion à réviser ; une plante **grisée fane** (révision en retard) ; elle ne meurt jamais, il suffit de la réviser.
- **Pièces** 🪙 : gagnées en révisant (5 par réussite, 15 par exercice de code, 40 par mini-projet, 2× la note d'une étude de cas, +20 de récolte sur une notion 🍎…).
- **Boutique** : chemins, clôtures, fleurs, banc, lanterne, épouvantail, ruche, puits, étang, grand chêne, grange… Les plus belles décorations se débloquent avec ton **niveau de fermier**, et la ferme **s'agrandit** à chaque niveau.
- Clic sur une plante : la réviser, ouvrir sa note, la déplacer. Clic sur une décoration : la déplacer ou la ranger (onglet 🎒).
- 📸 **Photo pour Obsidian** : enregistre `Ferme.md` + l'image dans ton coffre.

## 📅 Préparer un examen

`Ctrl+Shift+P` → **Forge : Mes examens** → **➕ Ajouter un examen** : type (CCTL ou étude de cas), nom, date, Prosits au programme.

- **Révision resserrée** : dans les 3 semaines avant l'examen, les notions au programme reviennent de plus en plus souvent (même si la répétition espacée les avait prévues après l'examen). La barre d'état affiche le compte à rebours (`📅 J-12`).
- **📝 CCTL blanc** (aussi **Forge : Examen blanc CCTL**) : 10, 20 ou 30 questions chronométrées, comme le vrai : une question par page, navigation libre, **note sur 20 et correction seulement à la fin**. Les questions viennent de tes notes (QCM sur les notions), de tes pistes validées, et de l'IA (comportement du C++) si ta clé est enregistrée. Ensuite : « Réviser les notions ratées », et un compte rendu dans `Exercices/Examens blancs/`.
- **📄 Étude de cas blanche** : le mode papier sur tout le programme de l'examen.

## 📊 Statistiques

`Ctrl+Shift+P` → **Forge : Statistiques** : notions maîtrisées, série, exercices de la semaine, réussite sur 30 jours, activité jour par jour, révisions prévues, maîtrise par Prosit, réussite par type d'exercice, objectifs (AAV) prouvés, avancement des tableaux de validation de tes CER, notions fragiles (avec « Réviser »), examens à venir. Survole les graphiques pour le détail ; chaque graphique a aussi sa version en tableau.

## 🧭 Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| Forge : Réviser | Lance une séance (Ctrl+Alt+R) |
| Forge : Ma ferme | Ta ferme pixel-art (aussi 🌻 dans la barre d'état) |
| Forge : Statistiques | Tableau de bord de ta progression |
| Forge : Mes examens | Ajouter un examen, réviser son programme, CCTL blanc, étude de cas blanche |
| Forge : Examen blanc CCTL | Questionnaire chronométré noté sur 20 |
| Forge : Prise en main | Le guide pas à pas dans VS Code |
| Forge : Vérifier l'installation | Teste `wsl g++` (compile et lance « Hello Forge »), pandoc et git |
| Forge : Créer / choisir le coffre Obsidian | Crée les dossiers et règle les couleurs du graphe |
| Forge : Importer des CER / Prosits (.docx) | Lit tes Word et crée les notes, après l'écran de validation |
| Forge : Nouveau Prosit | Crée un CER vierge en Markdown, avec toutes les sections CESI |
| Forge : Exporter le CER en Word | Génère un `.docx` au format CER, dans `Exports/` |
| Forge : Notions à revoir | Liste les notions à réviser, pour les relire |
| Forge : Configurer la clé DeepSeek | Enregistre (ou supprime) ta clé API DeepSeek |
| Forge : Faire relire les définitions par l'IA | Relit les définitions pas encore relues ; corrige les fausses, écrit les manquantes |
| Forge : Faire relire toutes les définitions par l'IA | Pareil, même celles déjà relues |
| Forge : Nouvel exercice de code | Exercice de code, trouve le bug ou mini-projet, généré puis vérifié |
| Forge : Vérifier l'exercice | Compile et teste l'exercice ouvert (Ctrl+Alt+V) |
| Forge : Mes exercices de code | Reprendre ou refaire un exercice |
| Forge : Étude de cas sur papier | Épreuve chronométrée corrigée sur 20 |
| Forge : Ouvrir le coffre dans VS Code | Ouvre le coffre dans une nouvelle fenêtre |

### Réglages (Ctrl+, puis cherche « forge »)

| Réglage | Par défaut | Rôle |
|---|---|---|
| `forge.cheminCoffre` | (vide) | Dossier du coffre |
| `forge.compilateur` | `auto` | `wsl g++` sous Windows, `g++` ailleurs |
| `forge.pandoc` | `pandoc` | `wsl pandoc` marche aussi |
| `forge.modeleWord` | (vide) | Un de tes CER .docx, pour que l'export reprenne ses styles |
| `forge.moduleParDefaut` | Programmation orientée objet | Module proposé à l'import |
| `forge.suggestionOuverture` | `true` | Proposer une séance au démarrage (une fois par jour) |
| `forge.definitionsIA` | `accepter` | `accepter` : définitions IA acceptées puis relues par DeepSeek · `verifier` : à valider toi-même |
| `forge.relectureIAApresImport` | `true` | Relire automatiquement les nouvelles définitions après un import |
| `forge.deepseek.modele` | `deepseek-chat` | Modèle DeepSeek |

---

## 🗂️ Organisation du coffre

```
SecondCerveau/
├── Accueil.md
├── Prosits/      P01 - La POO, quésaco.md, P02 - …
├── Notions/      Encapsulation.md, Polymorphisme.md, …
├── Modules/      Programmation orientée objet.md
├── Exercices/    exercices de code et études de cas
├── Ressources/images/
├── Sources/      tes .docx d'origine
├── Exports/      CER générés en Word
└── .forge/       données internes de Forge
```

Chaque notion porte dans son en-tête son niveau de maîtrise (`niveau`), sa prochaine révision et son statut (`a_verifier` / `verifie`).
**Tu peux écrire partout**, sauf entre les balises `<!-- forge:... -->`, que Forge met à jour. Un réimport ne touche jamais à tes notes ni à ta progression.

---

## 👩‍💻 Pour développer

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run essai-import -- ./coffre-test chemin/vers/CER.docx
```

| Dossier | Contenu |
|---|---|
| `src/core/` | Logique sans VS Code : import, coffre, export Word, répétition espacée, exercices, pistes, séance, corrections IA, compilation, exercices de code, études de cas |
| `src/vues/` | Webviews (validation, séance, étude de cas, CCTL blanc, statistiques, ferme et ses sprites) |
| `src/extension.ts` | Commandes VS Code |
| `scripts/` | Tests et essais en ligne de commande |
