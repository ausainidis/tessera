// Example custom component using the Tessera component protocol (docs/COMPONENTS.md).
let config = { items: [] };
const list = document.getElementById('items');
const done = document.getElementById('done');
const report = () => parent.postMessage({ type: 'tessera:resize', height: document.documentElement.scrollHeight }, '*');
function render() {
  list.innerHTML = '';
  for (const item of config.items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      const chosen = [...list.querySelectorAll('[aria-pressed=true]')].map((x) => x.textContent);
      const correct = config.items.filter((i) => i.personal).map((i) => i.label);
      if (chosen.length === correct.length && correct.every((c) => chosen.includes(c))) {
        done.textContent = 'All personal data found. Well done!';
        parent.postMessage({ type: 'tessera:complete', score: 1 }, '*');
      } else done.textContent = '';
      report();
    });
    li.appendChild(b);
    list.appendChild(li);
  }
  report();
}
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'tessera:config') { config = e.data.config || config; render(); }
});
render();
parent.postMessage({ type: 'tessera:ready' }, '*');
