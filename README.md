# 🔨 Forge

Extension VS Code pour réviser **en agissant** les notions vues en Prosit au CESI.

Tes CER deviennent un **second cerveau Obsidian** : une note par Prosit, une note par notion, toutes reliées entre elles. VS Code devient ton terrain d'entraînement (exercices de code C++, textes à trous, explications…). Tes révisions font pousser une ferme pixel-art.

Le plan complet est dans [`docs/PLAN.md`](docs/PLAN.md).

## Où on en est

| Phase | Contenu | État |
|---|---|---|
| 0. Installation | Squelette, vérification de `wsl g++`, « Hello Forge » | ✅ |
| 1. Import | Import des CER (.docx), écran de validation, nouveau Prosit, export Word | ✅ |
| 2. Révision hors ligne | Texte à trous, QCM, répétition espacée | ⏳ |
| 3. IA (DeepSeek) | Vrai ou faux sur les pistes, explication libre | ⏳ |
| 4. Code | Exercices C++ compilés et testés, mode papier | ⏳ |
| 5. Ferme | Ferme pixel-art que tu aménages toi-même | ⏳ |
| 6. Finitions | Mode examen (CCTL, étude de cas), statistiques, `.vsix` | ⏳ |

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

Puis, dans VS Code : panneau Extensions → `…` → **Installer depuis un VSIX…** → `forge-0.1.0.vsix`.

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

## 🧭 Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| Forge : Vérifier l'installation | Teste `wsl g++` (compile et lance « Hello Forge »), pandoc et git |
| Forge : Créer / choisir le coffre Obsidian | Crée les dossiers et règle les couleurs du graphe |
| Forge : Importer des CER / Prosits (.docx) | Lit tes Word et crée les notes, après l'écran de validation |
| Forge : Nouveau Prosit | Crée un CER vierge en Markdown, avec toutes les sections CESI |
| Forge : Exporter le CER en Word | Génère un `.docx` au format CER, dans `Exports/` |
| Forge : Notions à revoir | Liste les notions à réviser (aussi via `🌱 N à revoir` dans la barre d'état) |
| Forge : Ouvrir le coffre dans VS Code | Ouvre le coffre dans une nouvelle fenêtre |

### Réglages (Ctrl+, puis cherche « forge »)

| Réglage | Par défaut | Rôle |
|---|---|---|
| `forge.cheminCoffre` | (vide) | Dossier du coffre |
| `forge.compilateur` | `auto` | `wsl g++` sous Windows, `g++` ailleurs |
| `forge.pandoc` | `pandoc` | `wsl pandoc` marche aussi |
| `forge.modeleWord` | (vide) | Un de tes CER .docx, pour que l'export reprenne ses styles |
| `forge.moduleParDefaut` | Programmation orientée objet | Module proposé à l'import |

---

## 🗂️ Organisation du coffre

```
SecondCerveau/
├── Accueil.md
├── Prosits/      P01 - La POO, quésaco.md, P02 - …
├── Notions/      Encapsulation.md, Polymorphisme.md, …
├── Modules/      Programmation orientée objet.md
├── Exercices/    (phase 4)
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
| `src/core/` | Logique sans VS Code : lecture des .docx, plan d'import, écriture du coffre, export Word |
| `src/vues/` | Webviews (écran de validation) |
| `src/extension.ts` | Commandes VS Code |
| `scripts/` | Tests et essais en ligne de commande |
