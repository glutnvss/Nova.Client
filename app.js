const $ = (id) => document.getElementById(id);
const statuses = {};

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 5000);
}

/* navigation */
document.querySelectorAll('.nav').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    $('view-' + b.dataset.view).classList.remove('hidden');
  })
);

/* instances */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

async function render() {
  const list = await window.nova.listInstances();
  $('count').textContent = `${list.length} instance${list.length === 1 ? '' : 's'}`;
  const grid = $('grid');
  grid.replaceChildren();

  for (const inst of list) {
    const card = el('div', 'inst');
    const top = el('div', 'inst-top');
    top.append(el('div', 'icon', '📁'));

    const info = el('div');
    info.append(el('div', 'inst-name', inst.name));
    const st = el('div', 'status');
    const dot = el('span', 'dot ok');
    const stText = el('span', null, statuses[inst.id] || 'Ready to play');
    stText.dataset.status = inst.id;
    st.append(dot, stText);
    info.append(st);
    top.append(info);

    const tools = el('div', 'tools');
    const folder = el('button', 'icon-btn', '⚙');
    folder.title = 'Open folder';
    folder.onclick = () => window.nova.openFolder(inst.id);
    const del = el('button', 'icon-btn danger', '🗑');
    del.title = 'Delete';
    del.onclick = async () => {
      if (confirm(`Delete "${inst.name}" and all its files?`)) {
        await window.nova.deleteInstance(inst.id);
        render();
      }
    };
    tools.append(folder, del);
    top.append(tools);

    const tags = el('div', 'tags');
    tags.append(el('span', 'tag', inst.loader), el('span', 'tag', `Minecraft ${inst.version}`));
    if (inst.note) tags.append(el('span', 'tag', inst.note));

    const play = el('button', 'btn primary block', 'Play');
    play.onclick = async () => {
      play.disabled = true;
      try {
        await window.nova.play(inst.id);
      } catch (e) {
        toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
        setStatus(inst.id, 'Ready to play');
      }
      play.disabled = false;
    };

    const content = el('button', 'btn block', 'Content');
    content.onclick = () => openContent(inst);

    card.append(top, tags, content, play);
    grid.append(card);
  }
}

function setStatus(id, text) {
  statuses[id] = text;
  const node = document.querySelector(`[data-status="${id}"]`);
  if (node) node.textContent = text;
}
window.nova.onStatus((p) => setStatus(p.id, p.text));

/* new instance */
$('newBtn').onclick = () => { $('modal').classList.remove('hidden'); $('nameInput').focus(); };
$('cancelBtn').onclick = () => $('modal').classList.add('hidden');
$('createBtn').onclick = async () => {
  await window.nova.createInstance({
    name: $('nameInput').value.trim(),
    version: $('verInput').value.trim(),
    note: $('noteInput').value.trim(),
  });
  $('nameInput').value = '';
  $('noteInput').value = '';
  $('modal').classList.add('hidden');
  render();
};

/* settings */
async function loadSettings() {
  const s = await window.nova.getSettings();
  $('ramInput').value = s.maxRam || '4G';
  $('javaInput').value = s.javaPath || '';
}
$('saveSettings').onclick = async () => {
  await window.nova.setSettings({ maxRam: $('ramInput').value.trim() || '4G', javaPath: $('javaInput').value.trim() });
  $('settingsMsg').textContent = 'Saved.';
};

/* account */
function showAccount(acc) {
  $('miniName').textContent = acc ? acc.name : 'Not signed in';
  $('accStatus').textContent = acc ? `Signed in as ${acc.name}` : 'Not signed in.';
  $('miniAvatar').style.backgroundImage = acc ? `url(https://mc-heads.net/avatar/${acc.uuid}/64)` : '';
  $('loginBtn').classList.toggle('hidden', !!acc);
  $('logoutBtn').classList.toggle('hidden', !acc);
}
$('loginBtn').onclick = async () => {
  try { showAccount(await window.nova.login()); }
  catch (e) { toast('Sign-in failed or was cancelled.'); }
};
$('logoutBtn').onclick = async () => { await window.nova.logout(); showAccount(null); };

/* content: import from PC + Modrinth */
const errMsg = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
let cInst = null;
let cKind = 'mods';

function openContent(inst) {
  cInst = inst;
  cKind = 'mods';
  $('contentTitle').textContent = `Content: ${inst.name}`;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.kind === cKind));
  $('searchInput').value = '';
  $('contentModal').classList.remove('hidden');
  runSearch();
  refreshInstalled();
}

$('contentClose').onclick = () => $('contentModal').classList.add('hidden');

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    cKind = t.dataset.kind;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    runSearch();
    refreshInstalled();
  })
);

$('importBtn').onclick = async () => {
  try {
    const n = await window.nova.importContent(cInst.id, cKind);
    if (n) toast(`Imported ${n} file${n === 1 ? '' : 's'}.`);
    refreshInstalled();
  } catch (e) { toast(errMsg(e)); }
};

$('searchBtn').onclick = () => runSearch();
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

async function runSearch() {
  const box = $('results');
  box.replaceChildren(el('div', 'empty', 'Searching Modrinth…'));
  try {
    const hits = await window.nova.searchModrinth({
      query: $('searchInput').value.trim(),
      version: cInst.version,
      kind: cKind,
    });
    box.replaceChildren();
    if (!hits.length) box.append(el('div', 'empty', 'No results for this version.'));
    for (const h of hits) {
      const row = el('div', 'item');
      if (h.icon) {
        const img = document.createElement('img');
        img.src = h.icon;
        img.alt = '';
        row.append(img);
      } else {
        row.append(el('div', 'ph'));
      }
      const meta = el('div', 'meta');
      meta.append(el('div', 't', h.title), el('div', 'd', h.description));
      const btn = el('button', 'btn primary', 'Install');
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Installing…';
        try {
          const files = await window.nova.installModrinth({ id: cInst.id, projectId: h.id, kind: cKind });
          toast(files.length ? `Installed ${files.length} file${files.length === 1 ? '' : 's'}.` : 'Already installed.');
          btn.textContent = 'Installed';
          refreshInstalled();
        } catch (e) {
          toast(errMsg(e));
          btn.textContent = 'Install';
          btn.disabled = false;
        }
      };
      row.append(meta, btn);
      box.append(row);
    }
  } catch (e) {
    box.replaceChildren(el('div', 'empty', errMsg(e)));
  }
}

async function refreshInstalled() {
  const box = $('installed');
  const files = await window.nova.listContent(cInst.id, cKind);
  box.replaceChildren();
  if (!files.length) box.append(el('div', 'empty', 'Nothing installed yet.'));
  for (const f of files) {
    const row = el('div', 'item');
    const meta = el('div', 'meta');
    meta.append(el('div', 't', f));
    const rm = el('button', 'btn', 'Remove');
    rm.onclick = async () => {
      await window.nova.removeContent(cInst.id, cKind, f);
      refreshInstalled();
    };
    row.append(meta, rm);
    box.append(row);
  }
}

(async () => {
  await loadSettings();
  showAccount(await window.nova.authState());
  render();
})();
