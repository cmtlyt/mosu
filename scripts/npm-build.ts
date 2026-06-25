import { build } from 'vite';
import { resolve, dirname, basename } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dts from 'vite-plugin-dts';
import packageJson from '../package.json' with { type: 'json' };

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const defaultExternal = Object.keys(packageJson.dependencies);

interface BuildLibOptions {
  entry: string | Record<string, string>;
  outDir: string;
  fileName?: string | ((format: string, entryName?: string) => string);
  dtsRoot?: string;
  dtsEntryRoot?: string;
  dtsInclude: string[];
  external?: string[];
}

function buildLib(options: BuildLibOptions) {
  const { entry, outDir, fileName, dtsRoot, dtsEntryRoot, dtsInclude, external = defaultExternal } = options;

  const resolvedEntry = typeof entry === 'string' ? resolve(rootDir, entry) : entry;

  const resolvedFileName =
    typeof fileName === 'function' ? fileName : (format: string) => `${fileName}.${format === 'es' ? 'mjs' : 'cjs'}`;

  return build({
    publicDir: false,
    build: {
      outDir,
      lib: {
        entry: resolvedEntry,
        formats: ['es', 'cjs'],
        fileName: resolvedFileName,
      },
      rolldownOptions: { external },
    },
    plugins: [dts({ root: dtsRoot, entryRoot: dtsEntryRoot, outDir, include: dtsInclude })],
  });
}

function buildPlugins() {
  const pluginsDir = resolve(rootDir, 'plugins');
  const pluginFiles = readdirSync(pluginsDir).filter((file) => file.endsWith('.ts'));

  const entries: Record<string, string> = {};
  for (const file of pluginFiles) {
    const pluginName = basename(file, '.ts');
    entries[pluginName] = resolve(pluginsDir, file);
  }

  const pluginExternal = [
    ...defaultExternal,
    ...Object.keys(packageJson.devDependencies).filter(
      (dep) => dep.startsWith('vite') || dep.startsWith('@hono') || dep === 'react' || dep === 'react-dom',
    ),
  ];

  return buildLib({
    entry: entries,
    outDir: 'dist-npm/plugins',
    fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    dtsInclude: ['plugins/**/*.ts'],
    external: pluginExternal,
  });
}

async function buildAll() {
  const sdkPromises = [
    buildLib({
      entry: 'libs/animation-sdk/index.ts',
      outDir: 'dist-npm/animation-sdk',
      fileName: 'animation-sdk',
      dtsInclude: ['libs/animation-sdk/**/*'],
    }),
    buildLib({
      entry: 'libs/api-client.ts',
      outDir: 'dist-npm/api',
      fileName: 'api-client',
      dtsInclude: ['libs/api-client.ts'],
    }),
  ];

  await Promise.all([...sdkPromises, buildPlugins()]);
}

buildAll().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
