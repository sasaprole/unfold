import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const context = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  logLevel: 'info',
});

if (isWatch) {
  await context.watch();
  console.log('Watching extension host...');
} else {
  await context.rebuild();
  await context.dispose();
}
