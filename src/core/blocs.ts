// Blocs gérés par Forge dans les notes : <!-- forge:nom --> … <!-- /forge:nom -->

export function bloc(nom: string, contenu: string): string {
  return `<!-- forge:${nom} -->\n${contenu.trim()}\n<!-- /forge:${nom} -->`;
}

export function lireBloc(texte: string, nom: string): string | null {
  const m = texte.match(new RegExp(`<!-- forge:${nom} -->\\n?([\\s\\S]*?)\\n?<!-- /forge:${nom} -->`));
  return m ? m[1] : null;
}

export function remplacerBloc(texte: string, nom: string, contenu: string): string {
  const motif = new RegExp(`<!-- forge:${nom} -->[\\s\\S]*?<!-- /forge:${nom} -->`);
  if (motif.test(texte)) return texte.replace(motif, () => bloc(nom, contenu));
  return `${texte.trimEnd()}\n\n${bloc(nom, contenu)}\n`;
}
