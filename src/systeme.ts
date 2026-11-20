// Lancement de programmes externes (g++, pandoc, git), y compris via WSL sous Windows.

import { execFile } from 'child_process';

export interface ResultatCommande {
  code: number;
  sortie: string;
  erreurs: string;
  introuvable: boolean;
}

/** Découpe « wsl g++ -std=c++17 » en programme + arguments. */
export function decouperCommande(commande: string): { programme: string; arguments: string[] } {
  const morceaux = commande.trim().split(/\s+/).filter(Boolean);
  return { programme: morceaux[0] ?? '', arguments: morceaux.slice(1) };
}

export function passeParWsl(commande: string): boolean {
  return /^wsl(\.exe)?$/i.test(decouperCommande(commande).programme);
}

/**
 * Chemin Windows → chemin vu depuis WSL.
 * C:\Users\moi\x → /mnt/c/Users/moi/x ; \\wsl$\Ubuntu\home\moi → /home/moi
 */
export function versCheminWsl(chemin: string): string {
  const unc = chemin.match(/^\\\\wsl(?:\$|\.localhost)\\[^\\]+(\\.*)?$/i);
  if (unc) return (unc[1] ?? '\\').replace(/\\/g, '/');
  const lecteur = chemin.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (lecteur) return `/mnt/${lecteur[1].toLowerCase()}/${lecteur[2].replace(/\\/g, '/')}`;
  return chemin.replace(/\\/g, '/');
}

/** Adapte un chemin de fichier à la commande utilisée (conversion si elle passe par WSL). */
export function cheminPour(commande: string, chemin: string): string {
  return passeParWsl(commande) ? versCheminWsl(chemin) : chemin;
}

export function executer(
  commande: string,
  argumentsSupplementaires: string[],
  options: { cwd?: string; delaiMs?: number } = {},
): Promise<ResultatCommande> {
  const { programme, arguments: args } = decouperCommande(commande);
  return new Promise((resolve) => {
    execFile(
      programme,
      [...args, ...argumentsSupplementaires],
      { cwd: options.cwd, timeout: options.delaiMs ?? 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (erreur, sortie, erreurs) => {
        const introuvable = (erreur as NodeJS.ErrnoException | null)?.code === 'ENOENT';
        const code = erreur ? (typeof (erreur as { code?: unknown }).code === 'number' ? Number((erreur as { code?: unknown }).code) : 1) : 0;
        resolve({ code, sortie: String(sortie ?? ''), erreurs: String(erreurs ?? '') || (erreur && !sortie ? erreur.message : ''), introuvable });
      },
    );
  });
}
