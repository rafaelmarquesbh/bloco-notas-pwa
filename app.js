let notes = [];
let current = null;
let dirty = false;

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
const fontEl = $("font");
const sizeEl = $("size");
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

  // Marca a nota como alterada quando o usuário edita.
  titleEl.addEventListener("input", () => { dirty = true; statusEl.textContent = "Alterações não salvas"; });
  contentEl.addEventListener("input", () => { dirty = true; statusEl.textContent = "Alterações não salvas"; });

  document.querySelectorAll("[data-cmd]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      contentEl.focus();
      document.execCommand(button.dataset.cmd, false, null);
      dirty = true;
      statusEl.textContent = "Alterações não salvas";
    });
  });

  fontEl.addEventListener("change", (event) => {
    contentEl.focus();
    document.execCommand("fontName", false, event.target.value);
    dirty = true;
  });

  sizeEl.addEventListener("change", (event) => {
    contentEl.focus();
    document.execCommand("fontSize", false, event.target.value);
    dirty = true;
  });

  textColorEl.addEventListener("input", (event) => {
    contentEl.focus();
    document.execCommand("foreColor", false, event.target.value);
    dirty = true;
  });

  linkEl.addEventListener("mousedown", (event) => event.preventDefault());
  linkEl.addEventListener("click", () => {
    const url = prompt("Endereço do link:");
    if (url) {
      contentEl.focus();
      document.execCommand("createLink", false, url);
      dirty = true;
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

  // Não fecha ao clicar/soltar fora durante uma seleção de texto.
  // O fechamento da nota é feito pelo X, Salvar ou ESC.

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlayEl.classList.contains("hidden")) {
      saveAndClose();
    }
  });

  loadNotes();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
});

async function loadNotes() {
  try {
    const result = await supabaseClient
      .from("notas")
      .select("*")
      .eq("arquivada", false)
      .order("fixada", { ascending: false })
      .order("ordem", { ascending: true })
      .order("updated_at", { ascending: false });

    if (result.error) throw result.error;

    notes = result.data || [];
    // Compatibilidade com registros antigos.
    notes.forEach((n, i) => {
      if (n.ordem === null || n.ordem === undefined) n.ordem = i;
    });
    notes.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
    render();
  } catch (error) {
    console.error("Erro ao carregar notas:", error);
    emptyEl.querySelector("p").textContent =
      "Confira o Supabase e confirme que a coluna 'ordem' foi criada.";
    render();
  }
}

function render() {
  const query = searchInputEl.value.trim().toLowerCase();

  const filtered = notes.filter((note) => {
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
  sectionTitleEl.textContent = query ? `RESULTADOS (${filtered.length})` : "NOTAS";
}

function draw(element, list) {
  element.innerHTML = "";

  list.forEach((note) => {
    const article = document.createElement("article");
    article.draggable = true;
    article.dataset.id = note.id;
    article.title = "Arraste para mudar a ordem";
    article.style.background = note.cor_nota || "#fff";

    article.innerHTML = `
      <div class="note-label">${note.fixada ? "📌 Nota fixada" : "📝 Nota"}</div>
      <div class="note-label">Título</div>
      <h3>${escapeHtml(note.titulo || "Sem título")}</h3>
      <div class="note-label">Conteúdo</div>
      <div class="body">${note.conteudo || "<span style='color:#aaa'>Sem conteúdo</span>"}</div>
      <div class="note-label">Última atualização</div>
      <div class="meta">${formatDate(note.updated_at || note.created_at)}</div>
    `;

    article.addEventListener("click", (event) => {
      if (article.dataset.dragged === "1") {
        article.dataset.dragged = "0";
        return;
      }
      openEditor(note);
    });

    article.addEventListener("dragstart", (event) => {
      article.dataset.dragged = "0";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(note.id));
      article.classList.add("dragging");
    });

    article.addEventListener("dragend", () => {
      article.classList.remove("dragging");
    });

    article.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      article.classList.add("drag-over");
    });

    article.addEventListener("dragleave", () => {
      article.classList.remove("drag-over");
    });

    article.addEventListener("drop", async (event) => {
      event.preventDefault();
      article.classList.remove("drag-over");
      const draggedId = Number(event.dataTransfer.getData("text/plain"));
      if (!draggedId || draggedId === note.id) return;
      article.dataset.dragged = "1";
      await moveNote(draggedId, note.id);
    });

    element.appendChild(article);
  });
}

async function moveNote(draggedId, targetId) {
  const fromIndex = notes.findIndex((n) => n.id === draggedId);
  const toIndex = notes.findIndex((n) => n.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = notes.splice(fromIndex, 1);
  let destination = notes.findIndex((n) => n.id === targetId);
  notes.splice(destination, 0, moved);

  // Normaliza a ordem e salva no Supabase.
  const updates = notes.map((note, index) => ({ id: note.id, ordem: index }));
  notes.forEach((note, index) => { note.ordem = index; });

  render();

  try {
    for (const item of updates) {
      const result = await supabaseClient
        .from("notas")
        .update({ ordem: item.ordem })
        .eq("id", item.id);
      if (result.error) throw result.error;
    }
  } catch (error) {
    console.error("Erro ao salvar ordem:", error);
    alert("A ordem mudou na tela, mas não foi possível gravá-la no Supabase.");
    await loadNotes();
  }
}

function newNote() {
  openEditor({
    id: null,
    titulo: "",
    conteudo: "",
    cor_nota: "#fffdf5",
    fixada: false,
    arquivada: false,
    etiquetas: [],
    ordem: notes.length ? Math.max(...notes.map(n => Number(n.ordem ?? 0))) + 1 : 0
  });
}

function openEditor(note) {
  current = { ...note };
  dirty = false;

  titleEl.value = note.titulo || "";
  contentEl.innerHTML = note.conteudo || "";

  pinEl.textContent = note.fixada ? "📌" : "📍";
  archiveEl.textContent = note.arquivada ? "📤" : "📥";

  cardEl.style.background = note.cor_nota || "#fff";
  statusEl.textContent = note.id ? "Nota carregada" : "Nova nota";

  overlayEl.classList.remove("hidden");
  setTimeout(() => contentEl.focus(), 50);
}

async function saveAndClose() {
  if (!current) return;

  // Não cria nota vazia ao apertar X.
  const isEmpty = !titleEl.value.trim() && !strip(contentEl.innerHTML).trim();
  if (!current.id && isEmpty) {
    closeEditor();
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

  const payload = {
    titulo: titleEl.value.trim(),
    conteudo: contentEl.innerHTML,
    cor_nota: current.cor_nota || "#fff",
    fixada: Boolean(current.fixada),
    arquivada: Boolean(current.arquivada),
    etiquetas: Array.isArray(current.etiquetas) ? current.etiquetas : [],
    ordem: Number.isFinite(Number(current.ordem)) ? Number(current.ordem) : notes.length,
    updated_at: new Date().toISOString()
  };

  statusEl.textContent = "Salvando...";
  saveEl.disabled = true;

  try {
    let result;

    if (current.id) {
      result = await supabaseClient
        .from("notas")
        .update(payload)
        .eq("id", current.id)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("notas")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    if (current.id) {
      notes = notes.map((note) => note.id === current.id ? result.data : note);
    } else {
      notes.push(result.data);
      current.id = result.data.id;
    }

    dirty = false;
    statusEl.textContent = "Salvo ✓";
    render();
    return true;
  } catch (error) {
    console.error("Erro ao salvar:", error);
    statusEl.textContent = "Erro ao salvar";
    alert(
      "Não foi possível salvar a nota no Supabase.\n\n" +
      "Detalhes: " + (error.message || "erro desconhecido")
    );
    return false;
  } finally {
    saveEl.disabled = false;
  }
}

async function deleteNote() {
  if (!current?.id) {
    closeEditor();
    return;
  }

  if (!confirm("Excluir esta nota?")) return;

  const result = await supabaseClient
    .from("notas")
    .delete()
    .eq("id", current.id);

  if (result.error) {
    console.error(result.error);
    alert("Erro ao excluir: " + (result.error.message || ""));
    return;
  }

  notes = notes.filter((note) => note.id !== current.id);
  closeEditor();
  render();
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
  return date.toLocaleString("pt-BR");
}