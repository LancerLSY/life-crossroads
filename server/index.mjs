import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.mjs';

export { createApp } from './app.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.loadEnvFile?.(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const server = createServer(createApp());
  server.listen(port, host, () => console.log(`人生岔路 server: http://${host}:${port}`));
  const shutdown = () => { server.close(); setTimeout(() => process.exit(0), 5000).unref(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
