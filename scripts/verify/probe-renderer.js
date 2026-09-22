// Throwaway debugging tool.
// Attaches to a running Electron instance over the DevTools protocol and
// evaluates expressions in the renderer, so the UI can be inspected without
// stealing focus from whatever the user is doing.
//
// Start the app with:  npx electron . --remote-debugging-port=9333
// Then:                node scripts/verify/probe-renderer.js "<js expression>"

const PORT = process.env.CDP_PORT || 9333;

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) {
    console.error('No page target found. Is the app running with --remote-debugging-port?');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const expressions = process.argv.slice(2);
  let id = 0;
  const pending = new Map();

  const send = (method, params) => new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));

  for (const expr of expressions) {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    const out = res.exceptionDetails
      ? `EXCEPTION: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      : JSON.stringify(res.result?.value, null, 2);
    console.log(`\n>>> ${expr}\n${out}`);
  }

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error('probe failed:', e.message); process.exit(1); });
