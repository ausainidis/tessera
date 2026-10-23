// Development mode: builds the runtime, starts the Vite dev server for the editor UI with hot
// reload, then launches Electron pointed at it. Usage: npm run dev
import { spawn } from 'node:child_process';
import { createServer, build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

await build({ configFile: 'vite.runtime.config.js', logLevel: 'warn' });
const server = await createServer({ configFile: 'vite.editor.config.js' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Editor dev server: ${url}`);

const electron = (await import('electron')).default;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, TESSERA_DEV_URL: url } });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
