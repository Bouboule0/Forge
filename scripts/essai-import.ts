// Essai hors VS Code : importe des .docx dans un coffre de test.
// Utilisation : npm run essai-import -- <dossier-coffre> <fichier1.docx> [fichier2.docx ...]
import * as fs from 'fs';
import { analyserCer } from '../src/core/parseurCer';
import { construirePlan } from '../src/core/planImport';
import { ecrirePlan } from '../src/core/ecritureCoffre';

(async () => {
  const [coffre, ...fichiers] = process.argv.slice(2);
  if (!coffre || fichiers.length === 0) {
    console.error('Utilisation : essai-import <dossier-coffre> <fichier.docx>...');
    process.exit(1);
  }
  fs.mkdirSync(coffre, { recursive: true });
  const analyses = [];
  for (const f of fichiers) analyses.push(await analyserCer(f));
  const plan = construirePlan(coffre, analyses, 'Programmation orientée objet');
  console.log('Prosits :', plan.prosits.map((p) => `P${p.numero} « ${p.titre} » (${p.module})${p.existeDeja ? ' [existe]' : ''}`));
  console.log('Notions :');
  for (const n of plan.notions) {
    console.log(`  ${n.origine === 'aav' ? '🎯' : '🔑'} ${n.nom}${n.autresNoms.length ? ` (= ${n.autresNoms.join(', ')})` : ''}${n.existante ? ' [existe]' : ''} — prosits ${n.prosits.map((i) => plan.prosits[i].numero).join(',')} — AAV ${n.aav.map((a) => a.aav.niveau).join(',') || '-'}`);
  }
  const r = ecrirePlan(plan);
  console.log(JSON.stringify(r, null, 1));
})();
