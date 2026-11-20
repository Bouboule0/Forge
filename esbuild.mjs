// Construit l'extension (dist/extension.js) ou un script d'essai (--script chemin.ts).
import * as esbuild from 'esbuild';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const scriptIndex = args.indexOf('--script');

const options = scriptIndex >= 0
  ? {
      entryPoints: [args[scriptIndex + 1]],
      outdir: 'dist/scripts',
      external: ['vscode'],
    }
  : {
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
      external: ['vscode'],
    };

const ctx = await esbuild.context({
  ...options,
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
