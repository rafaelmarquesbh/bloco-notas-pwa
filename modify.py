from pathlib import Path
p=Path('/mnt/data/v33/index.html')
s=p.read_text()
s=s.replace('<div><span class="eyebrow">SEU CADERNO</span><h1 id="sectionTitle">NOTAS</h1></div>','<div class="page-heading-title"><span class="eyebrow">SEU CADERNO</span></div>')
s=s.replace('<div id="regularCaption" class="section-caption"><span>Notas</span><em>Mais recentes e organizadas por você</em></div>','')
s=s.replace('<select id="font" aria-label="Fonte"><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option><option>Courier New</option></select>\n          <select id="size" aria-label="Tamanho"><option value="2">Pequena</option><option value="3" selected>Normal</option><option value="4">Grande</option><option value="5">Muito grande</option><option value="6">Título</option></select>', '<select id="font" aria-label="Fonte"><option value="Roboto" selected>Roboto</option></select>\n          <select id="size" aria-label="Tamanho"><option value="2">Menor</option><option value="3" selected>Normal</option><option value="4">Maior</option><option value="5">Muito maior</option><option value="6">Título</option></select>\n          <select id="weight" aria-label="Intensidade"><option value="300">Suave</option><option value="400" selected>Normal</option><option value="600">Forte</option></select>')
p.write_text(s)

p=Path('/mnt/data/v33/style.css')
s=p.read_text()
s=s.replace('font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif','font-family:"Roboto",sans-serif')
s=s.replace('.eyebrow{font-size:10px;color:#9aa3b2;letter-spacing:.16em;font-weight:800}', '.eyebrow{font-size:10px;color:#9aa3b2;letter-spacing:.16em;font-weight:700}.page-heading-title{display:flex;align-items:center}')
s=s.replace('.toolbar button,.toolbar select{height:34px;', '.toolbar button,.toolbar select{height:34px;')
p.write_text(s)

p=Path('/mnt/data/v33/app.js')
s=p.read_text()
s=s.replace('const sizeEl = $("size");','const sizeEl = $("size");\nconst weightEl = $("weight");')
needle='  sizeEl.addEventListener("change", (event) => {\n    contentEl.focus();\n    document.execCommand("fontSize", false, event.target.value);\n    dirty = true;\n    statusEl.textContent = "Alterações não salvas";\n  });'
insert=needle+'\n\n  weightEl.addEventListener("change", (event) => {\n    applyFontWeight(event.target.value);\n  });'
s=s.replace(needle,insert)
# insert helper before makeLocalId
marker='function makeLocalId() {'
helper='''function applyFontWeight(weight) {\n  contentEl.focus();\n  const selection = window.getSelection();\n  if (!selection || selection.rangeCount === 0) return;\n  const range = selection.getRangeAt(0);\n  if (range.collapsed) {\n    contentEl.style.fontWeight = weight;\n  } else {\n    const fragment = range.extractContents();\n    const span = document.createElement("span");\n    span.style.fontWeight = weight;\n    span.appendChild(fragment);\n    range.insertNode(span);\n    selection.removeAllRanges();\n    const next = document.createRange();\n    next.selectNodeContents(span);\n    selection.addRange(next);\n  }\n  dirty = true;\n  statusEl.textContent = "Alterações não salvas";\n}\n\n'''
s=s.replace(marker,helper+marker)
p.write_text(s)
