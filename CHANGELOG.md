# Journal des versions

## 1.1.0 — Phase annexe A : emploi du temps
- **Emploi du temps dans la barre latérale** (icône 🌱 Forge dans la barre d'activité) : cours du jour, navigation par jour et par semaine, cours en cours avec sa progression, salles et intervenants.
- **Prochain cours dans la barre d'état** (« 14:00 Anglais · C105 », ou le cours en cours et son heure de fin).
- Deux sources : **ENT CESI** (adresse @viacesi.fr + mot de passe, parcours de connexion adapté de go-cesi) ou **lien iCal (.ics)**.
- Sécurité : mot de passe et lien dans le coffre-fort de VS Code, certificats HTTPS toujours vérifiés, identifiants envoyés uniquement aux serveurs cesi.fr / viacesi.fr ; cache local et au plus une connexion à l'ENT toutes les 10 minutes.
- « 🌱 Réviser ce module » sur un cours : séance sur les Prosits du même module.

## 1.0.0 — Phase 6 : examens, statistiques, finitions (fin des phases principales)
- **Mes examens** : date, type (CCTL, étude de cas) et Prosits au programme. Dans les 3 semaines qui précèdent, les notions au programme reviennent de plus en plus souvent ; compte à rebours dans la barre d'état.
- **CCTL blanc** : questionnaire chronométré (10, 20 ou 30 questions) tiré de tes notes, de tes pistes validées et, avec une clé DeepSeek, de questions de l'IA sur le C++ ; note sur 20 et correction à la fin, compte rendu dans le coffre, « Réviser mes erreurs ».
- **Étude de cas blanche** sur le programme d'un examen (plusieurs Prosits).
- **Statistiques** : notions maîtrisées, série, exercices de la semaine, réussite sur 30 jours, activité par jour, révisions prévues, maîtrise par Prosit, réussite par type d'exercice, AAV prouvés, avancement des tableaux de validation des CER, notions fragiles, examens à venir. Graphiques lisibles en thème clair et sombre, bulles d'info, tableau sous chaque graphique.
- **Prise en main** intégrée à VS Code (page d'accueil « Bien démarrer avec Forge »).
- Icône pixel-art, vérification automatique sur GitHub (types, tests, paquet `.vsix`).

## 0.5.0 — Phase 5 : la ferme
- **Ma ferme** (commande, 🌻 dans la barre d'état, bouton en fin de séance) : une plante pixel-art par notion, que tu places toi-même.
- 7 stades de croissance (🌰 → 🍎) liés à la répétition espacée ; 8 variétés (une par Prosit) ; les notions en retard **fanent**, celles à réviser ont une goutte 💧, les mûres brillent.
- **Pièces** 🪙 gagnées en révisant (recalculées depuis l'historique : rien n'est compté deux fois, juste même entre deux ordinateurs), bonus de récolte sur les notions mûres, exercices de code et études de cas mieux payés.
- **Boutique** de 14 décorations (chemin, clôture, fleurs, banc, lanterne qui éclaire, épouvantail, ruche, puits, étang, grand chêne, grange…), débloquées par le **niveau de fermier** ; la ferme s'agrandit à chaque niveau.
- Placement à la souris, « Tout planter », déplacer, ranger ; fiche d'une plante avec « Réviser » et « Note ».
- Couleurs du sol selon la saison ; 📸 photo de la ferme dans le coffre (`Ferme.md`) pour Obsidian.
- Bilan de séance : pièces gagnées.

## 0.4.0 — Phase 4 : code C++ et études de cas
- **Exercices de code** générés par l'IA puis **vérifiés par Forge avant de te les donner** : la solution doit passer les tests, le code de départ doit compiler et échouer (sinon l'IA corrige, jusqu'à 3 essais).
  - ⌨️ Exercice de code (5–10 min), 🐞 Trouve le bug, 🧱 Mini-projet dans l'histoire d'un Prosit (20–40 min).
  - 🔮 Prédis la sortie : la bonne réponse est la **vraie** sortie du programme compilé.
- **Séance code** (💻) et exercices de code dans la séance complète ; compilation avec `wsl g++` (ou ton compilateur), erreurs soulignées dans l'éditeur, **Ctrl+Alt+V** pour vérifier.
- Les exercices restent dans le coffre (`Exercices/<notion>/`) : refaisables hors ligne, « Mes exercices de code ».
- **Étude de cas sur papier** : sujet chronométré (20 min à 1 h), réponses sans compilateur ni autocomplétion, correction sur 20 par question, copie et corrigé enregistrés dans le coffre.
- Preuves d'AAV : code (AAV [3]), exercice long et papier (AAV [5]) — elles débloquent les derniers stades des plantes.
- Sécurité : le code généré qui touche aux fichiers ou au système est refusé ; chaque programme est arrêté au bout de 5 s.
- WSL : commandes lancées avec `wsl -e` (chemins avec espaces ou apostrophes).

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
