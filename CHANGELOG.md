# Journal des versions

## 0.3.0 — Phase 3 : exercices corrigés par l'IA
- **Explique avec tes mots, corrigé par DeepSeek** : note sur 10, ce qui est juste, ce qu'il faut revoir, explication modèle. Une explication réussie compte comme preuve d'AAV (débloque les stades au-delà de 🌳 pour les AAV [2]).
- **Pistes de solutions de tes CER** : choisis validée / en partie / invalidée et justifie ; l'IA corrige et la réponse (statut + justification) est écrite dans le tableau de validation de ton CER, puis dans l'export Word.
- **Vrai/faux hors ligne** sur les pistes déjà validées (au plus une fois par semaine chacune).
- Nouveau statut de piste « Validée en partie ».
- Une erreur de l'IA (réseau, clé) ne casse pas la séance ; rien n'est écrit dans le CER dans ce cas.
- Test qui vérifie que les scripts des webviews sont du JavaScript valide.

## 0.2.0 — Phase 2 : révision hors ligne
- Définitions générées par IA acceptées d'office (réglage `forge.definitionsIA`), relues par DeepSeek : les fausses sont corrigées (l'ancienne version reste visible), les manquantes sont écrites, un rapport est créé.
- Clé DeepSeek stockée dans le coffre-fort de VS Code ; relecture automatique après chaque import.
- Séances de révision de durée libre : rapide (trous + QCM), complète, ou entraînement libre.
- Exercices générés depuis tes notes, sans IA : texte à trous (correction tolérante, indice), QCM « quelle notion ? » et « quelle définition ? », explication avec auto-évaluation, vérification des définitions générées par IA.
- Répétition espacée sur 7 stades (🌰 → 🍎), plafond selon le niveau d'AAV.
- Une notion ratée revient dans la séance ; seule la 1re réponse du jour compte.
- Historique des révisions et série de jours, bilan de fin de séance.
- Barre d'état cliquable, raccourci Ctrl+Alt+R, clic droit « Réviser » sur un Prosit ou une notion, suggestion à l'ouverture (une fois par jour).

## 0.1.0 — Phases 0 et 1
- Vérification de l'installation (compilateur via WSL, pandoc, git) avec un programme « Hello Forge ».
- Création du coffre Obsidian (dossiers, couleurs du graphe selon la maîtrise).
- Import des CER et Prosits Aller (.docx) avec écran de validation (renommer, fusionner, ignorer).
- Nouveau Prosit en Markdown, export du CER en Word (pandoc).
- Barre d'état « 🌱 N à revoir ».
