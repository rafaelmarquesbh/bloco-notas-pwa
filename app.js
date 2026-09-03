let notes = [];
let current = null;
let dirty = false;
let syncing = false;

const CACHE_KEY = "minhas_notas_cache_v8";
const QUEUE_KEY = "minhas_notas_queue_v8";
const DEVICE_KEY = "minhas_notas_device_v8";

const $ = (id) => document.getElementById(id);

const newBtnEl = $("newBtn");
const emptyNewEl = $("emptyNew");
const closeEl = $("close");
const saveEl = $("save");
const delEl = $("del");
const pinEl = $("pin");
const archiveEl = $("archive");
const colorsEl = $("colors");
const paletteEl = $("palette");
const searchBtnEl = $("searchBtn");
const searchEl = $("search");
const searchInputEl = $("searchInput");
const closeSearchEl = $("closeSearch");
const titleEl = $("title");
const contentEl = $("content");
const sizeEl = $("size");
const weightEl = $("weight");
const lineSpacingEl = $("lineSpacing");
const textColorEl = $("textColor");
const linkEl = $("link");
const overlayEl = $("overlay");
const cardEl = $("card");
const statusEl = $("status");
const pinnedEl = $("pinned");
const notesEl = $("notes");
const pinnedSecEl = $("pinnedSec");
const emptyEl = $("empty");
const sectionTitleEl = $("sectionTitle");
const connectionEl = $("connection");
const connectionTextEl = connectionEl?.querySelector(".connection-text");
const syncTimeEl = $("syncTime");
const syncCloudEl = $("syncCloud");

const hasSupabase = () => typeof supabaseClient !== "undefined";

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error("Não foi possível guardar as notas localmente:", error);
  }
}

function readQueue() {
  try {
    const data = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error("Não foi possível guardar a fila de sincronização:", error);
  }
}

function queueUpsert(note) {
  const queue = readQueue();
  const key = String(note.id);
  const filtered = queue.filter((item) => !(item.type === "upsert" && String(item.localId) === key));
  filtered.push({ type: "upsert", localId: note.id, note: { ...note } });
  writeQueue(filtered);
}

function queueDelete(noteId) {
  const queue = readQueue().filter((item) => {
    if (item.type === "upsert" && String(item.localId) === String(noteId)) return false;
    if (item.type === "delete" && String(item.id) === String(noteId)) return false;
    return true;
  });
  queue.push({ type: "delete", id: noteId });
  writeQueue(queue);
}

function queueReorder() {
  const ids = notes.filter((n) => !n.arquivada).map((n) => n.id);
  const queue = readQueue().filter((item) => item.type !== "reorder");
  queue.push({ type: "reorder", ids });
  writeQueue(queue);
}

function updateSyncTime(value) {
  // Mantido por compatibilidade com versões anteriores.
  // Data/hora não são mais exibidas na interface.
}

function animateSyncIcon() {
  if (!syncCloudEl) return;
  syncCloudEl.classList.remove("sync-burst");
  void syncCloudEl.offsetWidth;
  syncCloudEl.classList.add("sync-burst");
  window.setTimeout(() => syncCloudEl.classList.remove("sync-burst"), 900);
}


function updateConnectionStatus() {
  const offline = !navigator.onLine;
  if (!connectionEl) return;
  const pending = readQueue().length;
  let label = "";
  let state = "";
  if (offline) {
    label = "Offline — salvo neste dispositivo";
    state = "offline";
  } else if (syncing) {
    label = "Sincronizando...";
    state = "syncing";
  } else if (pending) {
    label = `Online — ${pending} aguardando sincronização`;
    state = "pending";
  } else {
    label = "Sincronizado";
    state = "online";
  }
  connectionEl.className = `connection ${state}`;
  if (connectionTextEl) connectionTextEl.textContent = label;
  if (syncCloudEl) syncCloudEl.setAttribute("aria-label", state === "online" ? "Sincronizado" : "Sincronização");
}

function applyFontWeight(weight) {
  contentEl.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    contentEl.style.fontWeight = weight;
  } else {
    const fragment = range.extractContents();
    const span = document.createElement("span");
    span.style.fontWeight = weight;
    span.appendChild(fragment);
    range.insertNode(span);
    selection.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(span);
    selection.addRange(next);
  }
  dirty = true;
  statusEl.textContent = "Alterações não salvas";
}

function applyLineSpacing(value) {
  if (!contentEl) return;
  const spacing = String(value || "1.6");
  contentEl.style.lineHeight = spacing;
  contentEl.querySelectorAll("*").forEach((el) => {
    el.style.lineHeight = spacing;
  });
  dirty = true;
  statusEl.textContent = "Espaçamento ajustado — alterações não salvas";
}

function makeLocalId() {
  const random = Math.random().toString(36).slice(2);
  return `local-${Date.now()}-${random}`;
}

function ensureRobotoFormatting() {
  if (!contentEl) return;
  contentEl.style.fontFamily = 'Roboto, sans-serif';
  contentEl.querySelectorAll('*').forEach((el) => {
    el.style.fontFamily = 'Roboto, sans-serif';
  });
}

function normalizeNote(note, index = 0) {
  return {
    ...note,
    titulo: note.titulo || "",
    conteudo: note.conteudo || "",
    cor_nota: note.cor_nota || "#fffdf5",
    fixada: Boolean(note.fixada),
    arquivada: Boolean(note.arquivada),
    etiquetas: Array.isArray(note.etiquetas) ? note.etiquetas : [],
    ordem: Number.isFinite(Number(note.ordem)) ? Number(note.ordem) : index,
    created_at: note.created_at || new Date().toISOString(),
    updated_at: note.updated_at || new Date().toISOString()
  };
}

function applyPendingToServerData(serverNotes) {
  let merged = serverNotes.map((n, i) => normalizeNote(n, i));
  const queue = readQueue();

  for (const item of queue) {
    if (item.type === "upsert") {
      const localNote = normalizeNote(item.note);
      const existingIndex = merged.findIndex((n) => String(n.id) === String(localNote.id));
      if (existingIndex >= 0) merged[existingIndex] = localNote;
      else merged.push(localNote);
    }
    if (item.type === "delete") {
      merged = merged.filter((n) => String(n.id) !== String(item.id));
    }
  }

  const reorder = [...queue].reverse().find((item) => item.type === "reorder");
  if (reorder) {
    const rank = new Map(reorder.ids.map((id, index) => [String(id), index]));
    merged.sort((a, b) => (rank.get(String(a.id)) ?? 999999) - (rank.get(String(b.id)) ?? 999999));
    merged.forEach((n, index) => { n.ordem = index; });
  }

  return merged;
}

document.addEventListener("DOMContentLoaded", () => {
  newBtnEl.addEventListener("click", newNote);
  emptyNewEl.addEventListener("click", newNote);
  closeEl.addEventListener("click", saveAndClose);
  saveEl.addEventListener("click", saveAndClose);
  delEl.addEventListener("click", deleteNote);
  pinEl.addEventListener("click", togglePin);
  archiveEl.addEventListener("click", toggleArchive);
  colorsEl.addEventListener("click", () => paletteEl.classList.toggle("hidden"));

  searchBtnEl.addEventListener("click", () => {
    searchEl.classList.remove("hidden");
    searchInputEl.focus();
  });

  closeSearchEl.addEventListener("click", () => {
    searchEl.classList.add("hidden");
    searchInputEl.value = "";
    render();
  });

  searchInputEl.addEventListener("input", render);

  titleEl.addEventListener("input", () => {
    dirty = true;
    statusEl.textContent = "Alterações não salvas";
  });
  contentEl.addEventListener("input", () => {
    dirty = true;
    statusEl.textContent = "Alterações não salvas";
  });

  document.querySelectorAll("[data-cmd]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      contentEl.focus();
      document.execCommand(button.dataset.cmd, false, null);
      dirty = true;
      statusEl.textContent = "Alterações não salvas";
    });
  });

  sizeEl.addEventListener("change", (event) => {
    contentEl.focus();
    document.execCommand("fontSize", false, event.target.value);
    dirty = true;
    statusEl.textContent = "Alterações não salvas";
  });

  weightEl.addEventListener("change", (event) => {
    applyFontWeight(event.target.value);
  });

  lineSpacingEl.addEventListener("change", (event) => {
    applyLineSpacing(event.target.value);
  });

  textColorEl.addEventListener("input", (event) => {
    contentEl.focus();
    document.execCommand("foreColor", false, event.target.value);
    dirty = true;
    statusEl.textContent = "Alterações não salvas";
  });

  linkEl.addEventListener("mousedown", (event) => event.preventDefault());
  linkEl.addEventListener("click", () => {
    const url = prompt("Endereço do link:");
    if (url) {
      contentEl.focus();
      document.execCommand("createLink", false, url);
      dirty = true;
      statusEl.textContent = "Alterações não salvas";
    }
  });

  document.querySelectorAll("[data-c]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!current) return;
      current.cor_nota = button.dataset.c;
      cardEl.style.background = current.cor_nota;
      paletteEl.classList.add("hidden");
      dirty = true;
      statusEl.textContent = "Alterações não salvas";
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlayEl.classList.contains("hidden")) saveAndClose();
  });

  window.addEventListener("online", async () => {
    updateConnectionStatus();
    await syncPending();
    await loadNotes(true);
  });

  window.addEventListener("offline", updateConnectionStatus);
  window.addEventListener("focus", () => { if (navigator.onLine) syncPending(); });
  setInterval(() => { if (navigator.onLine) syncPending(); }, 30000);

  const cached = readCache();
  if (cached.length) {
    notes = cached.map(normalizeNote);
    render();
  }
  updateConnectionStatus();
  loadNotes(false);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
});

async function loadNotes(fromOnlineEvent = false) {
  if (!navigator.onLine || !hasSupabase()) {
    if (!notes.length) render();
    updateConnectionStatus();
    return;
  }

  try {
    const result = await supabaseClient
      .from("notas")
      .select("*")
      .order("fixada", { ascending: false })
      .order("ordem", { ascending: true })
      .order("updated_at", { ascending: false });

    if (result.error) throw result.error;

    notes = applyPendingToServerData(result.data || []);
    notes.forEach((n, i) => { if (n.ordem === null || n.ordem === undefined) n.ordem = i; });
    notes.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
    writeCache();
    localStorage.setItem("minhas_notas_last_sync", new Date().toISOString());
    animateSyncIcon();
    render();
    updateConnectionStatus();

    if (fromOnlineEvent) await syncPending();
  } catch (error) {
    console.error("Erro ao carregar notas:", error);
    if (!notes.length) {
      emptyEl.querySelector("p").textContent = "Sem conexão. As notas salvas neste dispositivo continuam disponíveis.";
      render();
    }
    updateConnectionStatus();
  }
}

function render() {
  const query = searchInputEl.value.trim().toLowerCase();

  const visible = notes.filter((note) => !note.arquivada);
  const filtered = visible.filter((note) => {
    const title = (note.titulo || "").toLowerCase();
    const body = strip(note.conteudo || "").toLowerCase();
    return !query || title.includes(query) || body.includes(query);
  });

  const pinned = filtered.filter((note) => note.fixada)
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
  const normal = filtered.filter((note) => !note.fixada)
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));

  draw(pinnedEl, pinned);
  draw(notesEl, normal);

  pinnedSecEl.classList.toggle("hidden", pinned.length === 0);
  emptyEl.classList.toggle("hidden", filtered.length !== 0);
  if (sectionTitleEl) sectionTitleEl.textContent = query ? `RESULTADOS (${filtered.length})` : "";
}

function draw(element, list) {
  element.innerHTML = "";

  list.forEach((note) => {
    const article = document.createElement("article");
    article.draggable = true;
    article.dataset.id = note.id;
    article.title = "Arraste para mudar a ordem";
    article.style.backgroundColor = note.cor_nota || "#fff";

    const title = escapeHtml(note.titulo || "");
    const body = note.conteudo || "";
    const safeBody = body.trim() ? body : "<span class='watermark-empty'>Sem conteúdo</span>";
    article.innerHTML = `
      <h3 class="note-title">${title || "<span class='watermark-empty'>Sem título</span>"}</h3>
      <div class="body">${safeBody}</div>
    `;

    article.addEventListener("click", () => openEditor(note, false));

    article.addEventListener("dragstart", (event) => {
      article.dataset.dragged = "0";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(note.id));
      article.classList.add("dragging");
    });

    article.addEventListener("dragend", () => article.classList.remove("dragging"));

    article.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      article.classList.add("drag-over");
    });

    article.addEventListener("dragleave", () => article.classList.remove("drag-over"));

    article.addEventListener("drop", async (event) => {
      event.preventDefault();
      article.classList.remove("drag-over");
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!draggedId || String(draggedId) === String(note.id)) return;
      article.dataset.dragged = "1";
      await moveNote(draggedId, note.id);
    });

    element.appendChild(article);
  });
}

async function moveNote(draggedId, targetId) {
  const visible = notes.filter((n) => !n.arquivada);
  const fromIndex = visible.findIndex((n) => String(n.id) === String(draggedId));
  const toIndex = visible.findIndex((n) => String(n.id) === String(targetId));
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = visible.splice(fromIndex, 1);
  visible.splice(toIndex, 0, moved);
  visible.forEach((note, index) => { note.ordem = index; });

  const archived = notes.filter((n) => n.arquivada);
  notes = [...visible, ...archived];
  writeCache();
  queueReorder();
  render();

  if (navigator.onLine) await syncPending();
}

function newNote() {
  const nextOrder = notes.length ? Math.max(...notes.map(n => Number(n.ordem ?? 0))) + 1 : 0;
  openEditor({
    id: makeLocalId(),
    titulo: "",
    conteudo: "",
    cor_nota: "#fffdf5",
    fixada: false,
    arquivada: false,
    etiquetas: [],
    ordem: nextOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _localOnly: true
  }, true);
}

function openEditor(note, focusTitle = false) {
  current = { ...note };
  dirty = false;

  titleEl.value = note.titulo || "";
  contentEl.innerHTML = note.conteudo || "";
  ensureRobotoFormatting();

  pinEl.textContent = note.fixada ? "📌" : "📍";
  archiveEl.textContent = note.arquivada ? "📤" : "📥";
  cardEl.style.background = note.cor_nota || "#fff";
  statusEl.textContent = note._localOnly || String(note.id).startsWith("local-") ? "Salva neste dispositivo" : "Nota carregada";

  overlayEl.classList.remove("hidden");

  // Nota existente: abre apenas para visualização, sem colocar foco em nenhum campo.
  // Nova nota: coloca o cursor no título e abre o teclado automaticamente.
  requestAnimationFrame(() => {
    if (focusTitle) {
      titleEl.focus();
      titleEl.setSelectionRange(titleEl.value.length, titleEl.value.length);
    } else {
      titleEl.blur();
      contentEl.blur();
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      cardEl.focus({ preventScroll: true });
    }
  });
}

async function saveAndClose() {
  if (!current) return;

  const isEmpty = !titleEl.value.trim() && !strip(contentEl.innerHTML).trim();
  if (isEmpty && String(current.id).startsWith("local-") && !current._existing) {
    notes = notes.filter((n) => String(n.id) !== String(current.id));
    writeCache();
    closeEditor();
    render();
    return;
  }

  await saveNote();
  if (current) closeEditor();
}

function closeEditor() {
  overlayEl.classList.add("hidden");
  paletteEl.classList.add("hidden");
  current = null;
  dirty = false;
}

async function saveNote() {
  if (!current) return false;

  const now = new Date().toISOString();
  const localId = current.id;
  const payload = normalizeNote({
    ...current,
    titulo: titleEl.value.trim(),
    conteudo: contentEl.innerHTML,
    cor_nota: current.cor_nota || "#fff",
    fixada: Boolean(current.fixada),
    arquivada: Boolean(current.arquivada),
    etiquetas: Array.isArray(current.etiquetas) ? current.etiquetas : [],
    ordem: Number.isFinite(Number(current.ordem)) ? Number(current.ordem) : notes.length,
    updated_at: now
  });

  statusEl.textContent = navigator.onLine ? "Salvando..." : "Salvo neste dispositivo ✓";
  saveEl.disabled = true;

  const isLocal = String(localId).startsWith("local-");

  if (!navigator.onLine || !hasSupabase()) {
    const localNote = { ...payload, id: localId, _localOnly: isLocal };
    const index = notes.findIndex((n) => String(n.id) === String(localId));
    if (index >= 0) notes[index] = localNote;
    else notes.push(localNote);
    queueUpsert(localNote);
    writeCache();
    render();
    dirty = false;
    statusEl.textContent = "Salvo neste dispositivo ✓";
    saveEl.disabled = false;
    updateConnectionStatus();
    return true;
  }

  try {
    let result;

    if (!isLocal) {
      result = await supabaseClient
        .from("notas")
        .update({
          titulo: payload.titulo,
          conteudo: payload.conteudo,
          cor_nota: payload.cor_nota,
          fixada: payload.fixada,
          arquivada: payload.arquivada,
          etiquetas: payload.etiquetas,
          ordem: payload.ordem,
          updated_at: payload.updated_at
        })
        .eq("id", localId)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("notas")
        .insert({
          titulo: payload.titulo,
          conteudo: payload.conteudo,
          cor_nota: payload.cor_nota,
          fixada: payload.fixada,
          arquivada: payload.arquivada,
          etiquetas: payload.etiquetas,
          ordem: payload.ordem,
          updated_at: payload.updated_at
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    const saved = normalizeNote(result.data);
    const replaced = notes.some((note) => String(note.id) === String(localId));
    notes = replaced
      ? notes.map((note) => String(note.id) === String(localId) ? saved : note)
      : [...notes, saved];
    current = { ...saved };
    dirty = false;
    writeCache();
    localStorage.setItem("minhas_notas_last_sync", new Date().toISOString());
    animateSyncIcon();
    removeQueueForId(localId);
    render();
    statusEl.textContent = "Salvo ✓";
    updateConnectionStatus();
    return true;
  } catch (error) {
    console.error("Erro ao salvar online; guardando localmente:", error);
    const localNote = { ...payload, id: localId, _localOnly: isLocal };
    const index = notes.findIndex((n) => String(n.id) === String(localId));
    if (index >= 0) notes[index] = localNote;
    else notes.push(localNote);
    queueUpsert(localNote);
    writeCache();
    dirty = false;
    statusEl.textContent = "Salvo neste dispositivo — aguardando internet";
    render();
    updateConnectionStatus();
    return true;
  } finally {
    saveEl.disabled = false;
  }
}

function removeQueueForId(id) {
  const queue = readQueue().filter((item) => {
    if (item.type === "upsert" && String(item.localId) === String(id)) return false;
    if (item.type === "delete" && String(item.id) === String(id)) return false;
    return true;
  });
  writeQueue(queue);
}

async function syncPending() {
  if (syncing || !navigator.onLine || !hasSupabase()) return;
  let queue = readQueue();
  if (!queue.length) {
    updateConnectionStatus();
    return;
  }

  syncing = true;
  updateConnectionStatus();

  try {
    // Primeiro sincroniza notas; assim novas notas locais recebem o ID real do Supabase.
    for (const item of [...queue]) {
      if (item.type !== "upsert") continue;

      const localNote = normalizeNote(item.note);
      const isLocal = String(localNote.id).startsWith("local-");
      let result;

      if (isLocal) {
        result = await supabaseClient.from("notas").insert({
          titulo: localNote.titulo,
          conteudo: localNote.conteudo,
          cor_nota: localNote.cor_nota,
          fixada: localNote.fixada,
          arquivada: localNote.arquivada,
          etiquetas: localNote.etiquetas,
          ordem: localNote.ordem,
          updated_at: localNote.updated_at
        }).select().single();
      } else {
        result = await supabaseClient.from("notas").update({
          titulo: localNote.titulo,
          conteudo: localNote.conteudo,
          cor_nota: localNote.cor_nota,
          fixada: localNote.fixada,
          arquivada: localNote.arquivada,
          etiquetas: localNote.etiquetas,
          ordem: localNote.ordem,
          updated_at: localNote.updated_at
        }).eq("id", localNote.id).select().single();
      }

      if (result.error) throw result.error;

      const saved = normalizeNote(result.data);
      const replaced = notes.some((n) => String(n.id) === String(localNote.id));
      notes = replaced
        ? notes.map((n) => String(n.id) === String(localNote.id) ? saved : n)
        : [...notes, saved];
      queue = queue.filter((q) => !(q.type === "upsert" && String(q.localId) === String(localNote.id)));
      writeQueue(queue);
      writeCache();
    }

    // Depois executa exclusões.
    for (const item of [...queue]) {
      if (item.type !== "delete") continue;
      if (String(item.id).startsWith("local-")) {
        queue = queue.filter((q) => !(q.type === "delete" && String(q.id) === String(item.id)));
        writeQueue(queue);
        continue;
      }
      const result = await supabaseClient.from("notas").delete().eq("id", item.id);
      if (result.error) throw result.error;
      notes = notes.filter((n) => String(n.id) !== String(item.id));
      queue = queue.filter((q) => !(q.type === "delete" && String(q.id) === String(item.id)));
      writeQueue(queue);
      writeCache();
    }

    // Por último salva a ordem.
    const reorder = [...queue].reverse().find((item) => item.type === "reorder");
    if (reorder) {
      const ids = reorder.ids.filter((id) => !String(id).startsWith("local-"));
      for (let i = 0; i < ids.length; i++) {
        const result = await supabaseClient.from("notas").update({ ordem: i }).eq("id", ids[i]);
        if (result.error) throw result.error;
      }
      queue = queue.filter((item) => item.type !== "reorder");
      writeQueue(queue);
    }

    writeCache();
    localStorage.setItem("minhas_notas_last_sync", new Date().toISOString());
    animateSyncIcon();
  } catch (error) {
    console.error("Sincronização pendente:", error);
  } finally {
    syncing = false;
    updateConnectionStatus();
    render();
  }
}

async function deleteNote() {
  if (!current?.id) {
    closeEditor();
    return;
  }
  if (!confirm("Excluir esta nota?")) return;

  const id = current.id;
  const isLocal = String(id).startsWith("local-");
  notes = notes.filter((note) => String(note.id) !== String(id));

  if (isLocal || !navigator.onLine || !hasSupabase()) {
    queueDelete(id);
    writeCache();
    closeEditor();
    render();
    updateConnectionStatus();
    if (navigator.onLine) await syncPending();
    return;
  }

  const result = await supabaseClient.from("notas").delete().eq("id", id);
  if (result.error) {
    console.error(result.error);
    queueDelete(id);
    alert("Não foi possível excluir agora. A exclusão ficou salva e será sincronizada quando a conexão estiver disponível.");
  } else {
    removeQueueForId(id);
  }
  writeCache();
  closeEditor();
  render();
  updateConnectionStatus();
}

async function togglePin() {
  if (!current) return;
  current.fixada = !current.fixada;
  pinEl.textContent = current.fixada ? "📌" : "📍";
  dirty = true;
  await saveNote();
}

async function toggleArchive() {
  if (!current) return;
  current.arquivada = !current.arquivada;
  archiveEl.textContent = current.arquivada ? "📤" : "📥";
  dirty = true;
  const ok = await saveNote();
  if (ok && current && current.arquivada) closeEditor();
}

function strip(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
