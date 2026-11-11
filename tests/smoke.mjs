// Teste de fumaça: sobe um servidor, abre o jogo no Chrome headless (via DevTools Protocol),
// executa passos (teclas simuladas, código), coleta erros do console e tira prints.
//
//   node tests/smoke.mjs                         -> roteiro padrão (?skip&noprologue, anda, pula, prints)
//   node tests/smoke.mjs "?skip&pos=0,20" 8      -> outra URL e N segundos andando para frente
//
// Saída: JSON no stdout + prints em tests/out/*.png
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', 'out');
mkdirSync(OUT, { recursive: true });
const query = process.argv[2] || '?skip&noprologue';
const walkSeconds = Number(process.argv[3] || 4);
const HTTP_PORT = 8097, CDP_PORT = 9337;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('python', ['-m', 'http.server', String(HTTP_PORT)], { cwd: ROOT, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'mo-chrome-'))}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });
const report = { url: '', errors: [], warnings: [], logs: [], checks: {}, shots: [] };
let ws, msgId = 0;
const pending = new Map();

function cleanup() { try { ws?.close(); } catch {} chrome.kill(); server.kill(); }
process.on('exit', cleanup);

async function cdp(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function evalJS(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  report.shots.push(file);
}
const key = (code, down) => evalJS(`window.__game.input.simulate(${JSON.stringify(code)}, ${down})`);

async function main() {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { await sleep(200); }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500);
      if (m.params.type === 'error') report.errors.push(txt);
      else if (m.params.type === 'warning') report.warnings.push(txt);
      else if (report.logs.length < 30) report.logs.push(txt);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') report.errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
  await sleep(800); // servidor subindo
  report.url = `http://127.0.0.1:${HTTP_PORT}/${query}`;
  await cdp('Page.navigate', { url: report.url });

  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 60000) {
    ready = await evalJS('!!(window.__game && window.__game.ready)').catch(() => false);
    if (ready) break;
    const crashed = await evalJS(`(document.body.innerText||'').includes('tropeçou')`).catch(() => false);
    if (crashed) break;
    await sleep(500);
  }
  report.checks.bootSeconds = (Date.now() - t0) / 1000;
  report.checks.ready = ready;
  await shot('01-inicio');
  if (!ready) { report.checks.pageText = (await evalJS('document.body.innerText').catch(() => '')).slice(0, 2000); return; }

  await sleep(1500);
  const pos = () => evalJS('(({x,y,z})=>({x:+x.toFixed(2),y:+y.toFixed(2),z:+z.toFixed(2)}))(window.__game.player.position)');
  report.checks.startPos = await pos();
  const f0 = await evalJS('window.__game.time.elapsed');
  await key('KeyW', true); await sleep(walkSeconds * 1000); await key('KeyW', false);
  report.checks.afterWalk = await pos();
  report.checks.fpsApprox = +(((await evalJS('window.__game.time.elapsed')) - f0) / walkSeconds).toFixed(2); // ~1 = tempo real
  await shot('02-andando');
  await key('Space', true); await sleep(250);
  report.checks.jumpY = (await pos()).y;
  await key('Space', false); await sleep(1200);
  report.checks.afterJump = await pos();
  await key('ShiftLeft', true); await key('KeyD', true); await sleep(1500); await key('KeyD', false); await key('ShiftLeft', false);
  report.checks.afterRun = await pos();
  report.checks.state = await evalJS(`({ player: window.__game.player.state, jujubas: window.__game.state.jujubas, region: window.__game.world.regionAt(window.__game.player.position.x, window.__game.player.position.z), dayTime: +window.__game.render.dayTime.toFixed(3), drawCalls: window.__game.render.renderer.info.render.calls, triangles: window.__game.render.renderer.info.render.triangles })`);
  await shot('03-final');
}

main().catch((e) => report.errors.push('HARNESS: ' + e.message)).finally(() => {
  console.log(JSON.stringify(report, null, 2));
  cleanup();
  process.exit(0);
});
