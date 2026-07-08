import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

async function mustExist(rel) {
  const full = path.join(root, rel);
  await stat(full);
  return full;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await cp(await mustExist('site'), dist, { recursive: true });
await mkdir(path.join(dist, 'content'), { recursive: true });
await mkdir(path.join(dist, 'pdf'), { recursive: true });
await cp(await mustExist('content'), path.join(dist, 'content'), { recursive: true });
await cp(await mustExist('pdf/swarmlab-client-report.pdf'), path.join(dist, 'pdf/swarmlab-client-report.pdf'));
await cp(await mustExist('pdf/swarmlab-client-report.html'), path.join(dist, 'pdf/swarmlab-client-report.html'));

console.log('Built static SwarmLab learning package to dist/');
console.log('Routes: /, /pdf/swarmlab-client-report.pdf, /content/newsletter-sequence.md, /content/LESSONS.md');
