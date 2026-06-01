/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — ADMIN CAREER PATHWAYS JS
   Pathway CRUD, Grade/Unit/Lesson management
═══════════════════════════════════════════════════════ */

/* ── State ── */
window.PATHWAY_DATA = {
  pathways: [],
  currentPathwayId: null,
  currentGradeId: null,
  currentUnitId: null,
};

/* ── Hook into showAdminTab ── */
(function() {
  const _prev = window.showAdminTab;
  window.showAdminTab = function(tab) {
    if (!ADMIN_TABS.includes('pathways'))       ADMIN_TABS.push('pathways');
    if (!ADMIN_TABS.includes('add-pathway'))    ADMIN_TABS.push('add-pathway');
    if (!ADMIN_TABS.includes('pathway-detail')) ADMIN_TABS.push('pathway-detail');
    _prev(tab);
    if (tab === 'pathways')       renderPathwaysTable();
    if (tab === 'add-pathway')    resetPathwayForm();
    if (tab === 'pathway-detail') { /* rendered on demand */ }
  };
})();

/* ── Load pathways from API ── */
async function loadPathways() {
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/pathways', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) {
      window.PATHWAY_DATA.pathways = data.pathways || [];
      const badge = document.getElementById('pathwayBadge');
      if (badge) badge.textContent = data.pathways.length;
    }
  } catch(e) { console.warn('[Pathways] Load failed:', e.message); }
}

/* ── Render pathways table ── */
async function renderPathwaysTable() {
  await loadPathways();
  const tbody = document.getElementById('pathwaysTableBody');
  if (!tbody) return;
  const pathways = window.PATHWAY_DATA.pathways;
  if (!pathways.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--light);font-weight:700;">No pathways yet. Click "Add Pathway" to create the first one.</td></tr>';
    return;
  }
  tbody.innerHTML = pathways.map(p => `
    <tr>
      <td>
        <div style="font-weight:800;color:var(--dark);">${p.emoji || '🚀'} ${p.name}</div>
        <div style="font-size:11px;color:var(--light);">${p.tagline || ''}</div>
      </td>
      <td style="font-weight:800;color:var(--green-dark);">£${parseFloat(p.price||0).toFixed(0)}/mo</td>
      <td style="font-weight:700;color:var(--mid);">${p.grade_count || 0} / 12</td>
      <td>
        <span style="background:${p.is_active?'var(--green-light)':'#f0f2f8'};color:${p.is_active?'var(--green-dark)':'var(--light)'};font-size:11px;font-weight:900;padding:3px 10px;border-radius:50px;">
          ${p.is_active ? '✅ Active' : '⏸ Inactive'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="openPathwayDetail('${p.id}')"
            style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
            📂 Manage
          </button>
          <button onclick="editPathway('${p.id}')"
            style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
            ✏️ Edit
          </button>
          <button onclick="deletePathway('${p.id}','${p.name.replace(/'/g,'')}')"
            style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;">
            🗑️
          </button>
        </div>
      </td>
    </tr>`).join('');
}

/* ── Save / update pathway ── */
async function savePathway() {
  const id          = document.getElementById('pw-id')?.value.trim();
  const name        = document.getElementById('pw-name')?.value.trim();
  const tagline     = document.getElementById('pw-tagline')?.value.trim();
  const price       = document.getElementById('pw-price')?.value.trim();
  const emoji       = document.getElementById('pw-emoji')?.value.trim() || '🚀';
  const color       = document.getElementById('pw-color')?.value || 'blue';
  const intro       = document.getElementById('pw-intro')?.value.trim();
  const description = document.getElementById('pw-description')?.value.trim();
  const learnRaw    = document.getElementById('pw-learn')?.value.trim();
  const outcomesRaw = document.getElementById('pw-outcomes')?.value.trim();
  const graduation  = document.getElementById('pw-graduation')?.value.trim();

  if (!name)  { showToast('Pathway name is required.', 'error'); return; }
  if (!price) { showToast('Price is required.', 'error'); return; }

  const what_you_learn  = learnRaw    ? learnRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const career_outcomes = outcomesRaw ? outcomesRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];

  const payload = { name, tagline, intro, description, what_you_learn, career_outcomes, graduation_outcome: graduation, emoji, color, price: parseFloat(price) };

  const btn = document.getElementById('savePathwayBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const url    = id ? `https://api.stemnestacademy.co.uk/api/pathways/${id}` : 'https://api.stemnestacademy.co.uk/api/pathways';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = '✦ Save Pathway'; }
    if (!data.success) { showToast('Failed: ' + (data.error || 'Unknown error'), 'error'); return; }
    showToast(id ? '✅ Pathway updated!' : '✅ Pathway created!');
    resetPathwayForm();
    showAdminTab('pathways');
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Save Pathway'; }
    showToast('Error: ' + e.message, 'error');
  }
}

/* ── Edit pathway (pre-fill form) ── */
function editPathway(id) {
  const p = window.PATHWAY_DATA.pathways.find(x => x.id === id);
  if (!p) return;
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  set('pw-id', p.id);
  set('pw-name', p.name);
  set('pw-tagline', p.tagline);
  set('pw-price', p.price);
  set('pw-emoji', p.emoji);
  set('pw-color', p.color);
  set('pw-intro', p.intro);
  set('pw-description', p.description);
  set('pw-learn', (p.what_you_learn || []).join('\n'));
  set('pw-outcomes', (p.career_outcomes || []).join('\n'));
  set('pw-graduation', p.graduation_outcome);
  const titleEl = document.getElementById('addPathwayTabTitle');
  if (titleEl) titleEl.textContent = '✏️ Edit Pathway';
  const btnEl = document.getElementById('savePathwayBtn');
  if (btnEl) btnEl.textContent = '✦ Update Pathway';
  showAdminTab('add-pathway');
}

/* ── Delete pathway ── */
async function deletePathway(id, name) {
  if (!confirm(`Delete pathway "${name}"? This will delete all grades, units, and lessons inside it. This cannot be undone.`)) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    showToast(`"${name}" deleted.`);
    await loadPathways();
    renderPathwaysTable();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ── Reset pathway form ── */
function resetPathwayForm() {
  ['pw-id','pw-name','pw-tagline','pw-price','pw-emoji','pw-intro','pw-description','pw-learn','pw-outcomes','pw-graduation'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const colorEl = document.getElementById('pw-color'); if (colorEl) colorEl.value = 'blue';
  const titleEl = document.getElementById('addPathwayTabTitle');
  if (titleEl) titleEl.textContent = '➕ Add New Pathway';
  const btnEl = document.getElementById('savePathwayBtn');
  if (btnEl) btnEl.textContent = '✦ Save Pathway';
}

/* ══════════════════════════════════════════════════════
   PATHWAY DETAIL — Grades, Units, Lessons
══════════════════════════════════════════════════════ */

async function openPathwayDetail(pathwayId) {
  window.PATHWAY_DATA.currentPathwayId = pathwayId;
  const p = window.PATHWAY_DATA.pathways.find(x => x.id === pathwayId);
  const titleEl = document.getElementById('pathwayDetailTitle');
  if (titleEl) titleEl.textContent = `🚀 ${p ? p.name : 'Pathway'} — Grades & Lessons`;
  showAdminTab('pathway-detail');
  await renderGradesList(pathwayId);
}

async function renderGradesList(pathwayId) {
  const container = document.getElementById('pathwayDetailContent');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;color:var(--light);font-weight:700;">⏳ Loading grades...</div>';
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades`, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const grades = data.grades || [];
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);">Grades (${grades.length}/12)</div>
        <button onclick="openAddGradeModal('${pathwayId}')" class="btn btn-primary" style="font-size:13px;">➕ Add Grade</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
        ${grades.map(g => `
          <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:18px 20px;cursor:pointer;" onclick="openGradeDetail('${pathwayId}','${g.id}',${g.grade_number})">
            <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--blue);">Grade ${g.grade_number}</div>
            <div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">${g.name || ''}</div>
            <div style="font-size:12px;color:var(--light);margin-top:6px;">${g.lesson_count || 0} lessons · ${g.unit_count || 0} units</div>
            <div style="display:flex;gap:6px;margin-top:12px;">
              <button onclick="event.stopPropagation();editGrade('${pathwayId}','${g.id}',${g.grade_number},'${(g.name||'').replace(/'/g,'')}')" style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:8px;padding:5px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">✏️ Edit</button>
              <button onclick="event.stopPropagation();deleteGrade('${pathwayId}','${g.id}',${g.grade_number})" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:5px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">🗑️</button>
            </div>
          </div>`).join('')}
        ${grades.length < 12 ? `
          <div style="background:var(--bg);border:2px dashed #e8eaf0;border-radius:16px;padding:18px 20px;display:flex;align-items:center;justify-content:center;cursor:pointer;min-height:100px;" onclick="openAddGradeModal('${pathwayId}')">
            <div style="text-align:center;color:var(--light);font-weight:700;font-size:13px;">➕ Add Grade ${grades.length + 1}</div>
          </div>` : ''}
      </div>`;
  } catch(e) {
    container.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Failed to load grades.</div>';
  }
}

/* ── Add/Edit Grade Modal ── */
function openAddGradeModal(pathwayId, gradeId, gradeNumber, gradeName) {
  document.getElementById('gradeModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'gradeModalOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title">${gradeId ? '✏️ Edit Grade' : '➕ Add Grade'}</div>
        <button class="modal-close" onclick="document.getElementById('gradeModalOverlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="gm-pathway-id" value="${pathwayId}">
        <input type="hidden" id="gm-grade-id" value="${gradeId || ''}">
        <div class="pm-field">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Grade Number (1–12) *</label>
          <input type="number" id="gm-number" min="1" max="12" value="${gradeNumber || ''}" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div class="pm-field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Grade Name</label>
          <input type="text" id="gm-name" value="${gradeName || ''}" placeholder="e.g. Grade 5 — Data Foundations" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('gradeModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" onclick="saveGrade()">✦ Save Grade</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function saveGrade() {
  const pathwayId   = document.getElementById('gm-pathway-id')?.value;
  const gradeId     = document.getElementById('gm-grade-id')?.value;
  const gradeNumber = document.getElementById('gm-number')?.value;
  const gradeName   = document.getElementById('gm-name')?.value.trim();
  if (!gradeNumber) { showToast('Grade number is required.', 'error'); return; }
  try {
    const token = localStorage.getItem('sn_access_token');
    const url    = gradeId ? `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}` : `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades`;
    const method = gradeId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ grade_number: parseInt(gradeNumber), name: gradeName || `Grade ${gradeNumber}` }) });
    const data = await res.json();
    if (!data.success) { showToast('Failed: ' + (data.error || 'Unknown'), 'error'); return; }
    document.getElementById('gradeModalOverlay')?.remove();
    showToast(gradeId ? '✅ Grade updated!' : '✅ Grade added!');
    await renderGradesList(pathwayId);
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function editGrade(pathwayId, gradeId, gradeNumber, gradeName) {
  openAddGradeModal(pathwayId, gradeId, gradeNumber, gradeName);
}

async function deleteGrade(pathwayId, gradeId, gradeNumber) {
  if (!confirm(`Delete Grade ${gradeNumber} and all its units and lessons?`)) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    showToast(`Grade ${gradeNumber} deleted.`);
    await renderGradesList(pathwayId);
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   GRADE DETAIL — Units
══════════════════════════════════════════════════════ */

async function openGradeDetail(pathwayId, gradeId, gradeNumber) {
  window.PATHWAY_DATA.currentGradeId = gradeId;
  const container = document.getElementById('pathwayDetailContent');
  if (!container) return;
  const titleEl = document.getElementById('pathwayDetailTitle');
  const p = window.PATHWAY_DATA.pathways.find(x => x.id === pathwayId);
  if (titleEl) titleEl.textContent = `🚀 ${p ? p.name : 'Pathway'} — Grade ${gradeNumber}`;
  container.innerHTML = '<div style="padding:24px;color:var(--light);font-weight:700;">⏳ Loading units...</div>';
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units`, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const units = data.units || [];
    container.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
        <button onclick="renderGradesList('${pathwayId}')" class="btn btn-outline" style="font-size:12px;">← Back to Grades</button>
        <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);">Grade ${gradeNumber} — Units (${units.length}/8)</div>
        <button onclick="openAddUnitModal('${pathwayId}','${gradeId}')" class="btn btn-primary" style="font-size:13px;margin-left:auto;">➕ Add Unit</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">
        ${units.map(u => `
          <div style="background:var(--white);border:1.5px solid #e8eaf0;border-radius:16px;padding:18px 20px;">
            <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--blue);">Unit ${u.unit_number}</div>
            <div style="font-size:13px;font-weight:700;color:var(--mid);margin-top:4px;">${u.name || ''}</div>
            <div style="font-size:12px;color:var(--light);margin-top:4px;">${u.lesson_count || 0} lessons ${u.quiz_id ? '· ✅ Quiz' : '· ⬜ No quiz'}</div>
            <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">
              <button onclick="openUnitLessons('${pathwayId}','${gradeId}',${gradeNumber},'${u.id}',${u.unit_number})" style="background:var(--blue);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">📚 Lessons</button>
              <button onclick="editUnit('${pathwayId}','${gradeId}','${u.id}',${u.unit_number},'${(u.name||'').replace(/'/g,'')}')" style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:8px;padding:6px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">✏️</button>
              <button onclick="deleteUnit('${pathwayId}','${gradeId}','${u.id}',${u.unit_number})" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:6px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">🗑️</button>
            </div>
          </div>`).join('')}
        ${units.length < 8 ? `
          <div style="background:var(--bg);border:2px dashed #e8eaf0;border-radius:16px;padding:18px 20px;display:flex;align-items:center;justify-content:center;cursor:pointer;min-height:100px;" onclick="openAddUnitModal('${pathwayId}','${gradeId}')">
            <div style="text-align:center;color:var(--light);font-weight:700;font-size:13px;">➕ Add Unit ${units.length + 1}</div>
          </div>` : ''}
      </div>`;
  } catch(e) {
    container.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Failed to load units.</div>';
  }
}

function openAddUnitModal(pathwayId, gradeId, unitId, unitNumber, unitName) {
  document.getElementById('unitModalOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'unitModalOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title">${unitId ? '✏️ Edit Unit' : '➕ Add Unit'}</div>
        <button class="modal-close" onclick="document.getElementById('unitModalOverlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="um-pathway-id" value="${pathwayId}">
        <input type="hidden" id="um-grade-id" value="${gradeId}">
        <input type="hidden" id="um-unit-id" value="${unitId || ''}">
        <div class="pm-field">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Unit Number (1–8) *</label>
          <input type="number" id="um-number" min="1" max="8" value="${unitNumber || ''}" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div class="pm-field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Unit Name</label>
          <input type="text" id="um-name" value="${unitName || ''}" placeholder="e.g. Unit 1 — Introduction to Data" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('unitModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" onclick="saveUnit()">✦ Save Unit</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function saveUnit() {
  const pathwayId  = document.getElementById('um-pathway-id')?.value;
  const gradeId    = document.getElementById('um-grade-id')?.value;
  const unitId     = document.getElementById('um-unit-id')?.value;
  const unitNumber = document.getElementById('um-number')?.value;
  const unitName   = document.getElementById('um-name')?.value.trim();
  if (!unitNumber) { showToast('Unit number is required.', 'error'); return; }
  try {
    const token = localStorage.getItem('sn_access_token');
    const url    = unitId ? `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}` : `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units`;
    const method = unitId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ unit_number: parseInt(unitNumber), name: unitName || `Unit ${unitNumber}` }) });
    const data = await res.json();
    if (!data.success) { showToast('Failed: ' + (data.error || 'Unknown'), 'error'); return; }
    document.getElementById('unitModalOverlay')?.remove();
    showToast(unitId ? '✅ Unit updated!' : '✅ Unit added!');
    const gradeNum = document.getElementById('pathwayDetailTitle')?.textContent.match(/Grade (\d+)/)?.[1] || 1;
    await openGradeDetail(pathwayId, gradeId, parseInt(gradeNum));
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function editUnit(pathwayId, gradeId, unitId, unitNumber, unitName) {
  openAddUnitModal(pathwayId, gradeId, unitId, unitNumber, unitName);
}

async function deleteUnit(pathwayId, gradeId, unitId, unitNumber) {
  if (!confirm(`Delete Unit ${unitNumber} and all its lessons?`)) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    showToast(`Unit ${unitNumber} deleted.`);
    const gradeNum = document.getElementById('pathwayDetailTitle')?.textContent.match(/Grade (\d+)/)?.[1] || 1;
    await openGradeDetail(pathwayId, gradeId, parseInt(gradeNum));
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   UNIT LESSONS — List + Add/Edit Lesson
══════════════════════════════════════════════════════ */

async function openUnitLessons(pathwayId, gradeId, gradeNumber, unitId, unitNumber) {
  window.PATHWAY_DATA.currentUnitId = unitId;
  const container = document.getElementById('pathwayDetailContent');
  if (!container) return;
  const p = window.PATHWAY_DATA.pathways.find(x => x.id === pathwayId);
  const titleEl = document.getElementById('pathwayDetailTitle');
  if (titleEl) titleEl.textContent = `🚀 ${p ? p.name : ''} — Grade ${gradeNumber} · Unit ${unitNumber}`;
  container.innerHTML = '<div style="padding:24px;color:var(--light);font-weight:700;">⏳ Loading lessons...</div>';
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}/lessons`, { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const lessons = data.lessons || [];
    const sessionTypeLabel = { lesson: '📖 Lesson', flex: '🔄 Flex', review: '📝 Review', capstone: '🏆 Capstone' };
    container.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
        <button onclick="openGradeDetail('${pathwayId}','${gradeId}',${gradeNumber})" class="btn btn-outline" style="font-size:12px;">← Back to Units</button>
        <div style="font-family:'Fredoka One',cursive;font-size:18px;color:var(--dark);">Unit ${unitNumber} Lessons (${lessons.length})</div>
        <button onclick="openLessonForm('${pathwayId}','${gradeId}','${unitId}',null)" class="btn btn-primary" style="font-size:13px;margin-left:auto;">➕ Add Lesson</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>#</th><th>Title</th><th>Type</th><th>HW1</th><th>HW2</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${lessons.length ? lessons.map(l => `
              <tr>
                <td style="font-weight:800;color:var(--blue);">${l.lesson_number}</td>
                <td style="font-weight:700;color:var(--dark);">${l.title}</td>
                <td><span style="background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:900;padding:2px 8px;border-radius:50px;">${sessionTypeLabel[l.session_type]||l.session_type}</span></td>
                <td style="font-size:12px;color:var(--mid);">${l.homework1 ? '✅' : '—'}</td>
                <td style="font-size:12px;color:var(--mid);">${l.homework2 ? '✅' : '—'}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button onclick="openLessonForm('${pathwayId}','${gradeId}','${unitId}','${l.id}')" style="background:var(--bg);color:var(--mid);border:1.5px solid #e8eaf0;border-radius:8px;padding:5px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">✏️ Edit</button>
                    <button onclick="deleteLesson('${pathwayId}','${gradeId}','${unitId}','${l.id}',${l.lesson_number})" style="background:#fde8e8;color:#c53030;border:none;border-radius:8px;padding:5px 10px;font-family:'Nunito',sans-serif;font-weight:800;font-size:11px;cursor:pointer;">🗑️</button>
                  </div>
                </td>
              </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--light);font-weight:700;">No lessons yet. Click "Add Lesson" to start.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    container.innerHTML = '<div style="padding:24px;color:var(--orange);font-weight:700;">Failed to load lessons.</div>';
  }
}

async function deleteLesson(pathwayId, gradeId, unitId, lessonId, lessonNumber) {
  if (!confirm(`Delete Lesson ${lessonNumber}?`)) return;
  try {
    const token = localStorage.getItem('sn_access_token');
    await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}/lessons/${lessonId}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
    showToast(`Lesson ${lessonNumber} deleted.`);
    const titleText = document.getElementById('pathwayDetailTitle')?.textContent || '';
    const gradeMatch = titleText.match(/Grade (\d+)/);
    const unitMatch  = titleText.match(/Unit (\d+)/);
    if (gradeMatch && unitMatch) await openUnitLessons(pathwayId, gradeId, parseInt(gradeMatch[1]), unitId, parseInt(unitMatch[1]));
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   LESSON FORM — Full 12-field lesson creation/edit
══════════════════════════════════════════════════════ */

async function openLessonForm(pathwayId, gradeId, unitId, lessonId) {
  document.getElementById('lessonFormOverlay')?.remove();
  let lesson = null;
  if (lessonId) {
    try {
      const token = localStorage.getItem('sn_access_token');
      const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}/lessons`, { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      lesson = (data.lessons || []).find(l => l.id === lessonId);
    } catch(e) {}
  }
  const v = (field) => lesson ? (lesson[field] || '') : '';
  const overlay = document.createElement('div');
  overlay.id = 'lessonFormOverlay';
  overlay.className = 'modal-overlay open';
  overlay.style.cssText = 'overflow-y:auto;';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;max-height:92vh;overflow-y:auto;">
      <div class="modal-header">
        <div class="modal-title">${lessonId ? '✏️ Edit Lesson' : '➕ Add Lesson'}</div>
        <button class="modal-close" onclick="document.getElementById('lessonFormOverlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="lf-pathway-id" value="${pathwayId}">
        <input type="hidden" id="lf-grade-id" value="${gradeId}">
        <input type="hidden" id="lf-unit-id" value="${unitId}">
        <input type="hidden" id="lf-lesson-id" value="${lessonId || ''}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Lesson # in Grade *</label>
            <input type="number" id="lf-number" value="${v('lesson_number')}" min="1" max="72" style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
          </div>
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Session Type</label>
            <select id="lf-type" style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;background:#fff;">
              <option value="lesson" ${v('session_type')==='lesson'?'selected':''}>📖 Lesson</option>
              <option value="flex"   ${v('session_type')==='flex'?'selected':''}>🔄 Flex Session</option>
              <option value="review" ${v('session_type')==='review'?'selected':''}>📝 Review Session</option>
              <option value="capstone" ${v('session_type')==='capstone'?'selected':''}>🏆 Capstone Project</option>
            </select>
          </div>
        </div>
        <div class="pm-field" style="margin-bottom:12px;">
          <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Lesson Title *</label>
          <input type="text" id="lf-title" value="${v('title')}" placeholder="e.g. Introduction to Data Types" style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        ${[
          ['lf-objectives','Learning Objectives','learning_objectives','What will students learn in this lesson?'],
          ['lf-warmup','Warm Up','warm_up','Opening activity or question...'],
          ['lf-briefing','Project Briefing','project_briefing','Brief description of the class project...'],
          ['lf-concept','Concept Discovery','concept_discovery','Main concept being taught...'],
        ].map(([id,label,field,ph]) => `
          <div class="pm-field" style="margin-bottom:12px;">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">${label}</label>
            <textarea id="${id}" rows="2" placeholder="${ph}" style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;resize:vertical;">${v(field)}</textarea>
          </div>`).join('')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Task 1 — Guided (description)</label>
            <textarea id="lf-task1-desc" rows="2" placeholder="Guided task description..." style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;resize:vertical;">${v('task1_description')}</textarea>
          </div>
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Task 1 Link (URL)</label>
            <input type="url" id="lf-task1-link" value="${v('task1_link')}" placeholder="https://..." style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;">
          </div>
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Task 2 — Independent (description)</label>
            <textarea id="lf-task2-desc" rows="2" placeholder="Independent task description..." style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;resize:vertical;">${v('task2_description')}</textarea>
          </div>
          <div class="pm-field">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Task 2 Link (URL)</label>
            <input type="url" id="lf-task2-link" value="${v('task2_link')}" placeholder="https://..." style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;">
          </div>
        </div>
        ${[
          ['lf-debrief','DeBrief','debrief','Closing discussion or reflection...'],
          ['lf-hw1','Homework 1','homework1','First homework assignment...'],
          ['lf-hw2','Homework 2','homework2','Second homework assignment...'],
          ['lf-next','What Comes Next','what_comes_next','Preview of the next lesson...'],
          ['lf-notes','Additional Notes for Teachers','teacher_notes','Internal notes for the teacher...'],
        ].map(([id,label,field,ph]) => `
          <div class="pm-field" style="margin-bottom:12px;">
            <label style="font-size:11px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">${label}</label>
            <textarea id="${id}" rows="2" placeholder="${ph}" style="width:100%;padding:10px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:13px;outline:none;resize:vertical;">${v(field)}</textarea>
          </div>`).join('')}
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('lessonFormOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" id="saveLessonBtn" onclick="saveLesson()">✦ Save Lesson</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function saveLesson() {
  const pathwayId = document.getElementById('lf-pathway-id')?.value;
  const gradeId   = document.getElementById('lf-grade-id')?.value;
  const unitId    = document.getElementById('lf-unit-id')?.value;
  const lessonId  = document.getElementById('lf-lesson-id')?.value;
  const title     = document.getElementById('lf-title')?.value.trim();
  const number    = document.getElementById('lf-number')?.value;
  if (!title)  { showToast('Lesson title is required.', 'error'); return; }
  if (!number) { showToast('Lesson number is required.', 'error'); return; }
  const payload = {
    lesson_number: parseInt(number),
    session_type:  document.getElementById('lf-type')?.value || 'lesson',
    title,
    learning_objectives: document.getElementById('lf-objectives')?.value.trim() || null,
    warm_up:             document.getElementById('lf-warmup')?.value.trim() || null,
    project_briefing:    document.getElementById('lf-briefing')?.value.trim() || null,
    concept_discovery:   document.getElementById('lf-concept')?.value.trim() || null,
    task1_description:   document.getElementById('lf-task1-desc')?.value.trim() || null,
    task1_link:          document.getElementById('lf-task1-link')?.value.trim() || null,
    task2_description:   document.getElementById('lf-task2-desc')?.value.trim() || null,
    task2_link:          document.getElementById('lf-task2-link')?.value.trim() || null,
    debrief:             document.getElementById('lf-debrief')?.value.trim() || null,
    homework1:           document.getElementById('lf-hw1')?.value.trim() || null,
    homework2:           document.getElementById('lf-hw2')?.value.trim() || null,
    what_comes_next:     document.getElementById('lf-next')?.value.trim() || null,
    teacher_notes:       document.getElementById('lf-notes')?.value.trim() || null,
  };
  const btn = document.getElementById('saveLessonBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
  try {
    const token = localStorage.getItem('sn_access_token');
    const url    = lessonId
      ? `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}/lessons/${lessonId}`
      : `https://api.stemnestacademy.co.uk/api/pathways/${pathwayId}/grades/${gradeId}/units/${unitId}/lessons`;
    const method = lessonId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = '✦ Save Lesson'; }
    if (!data.success) { showToast('Failed: ' + (data.error || 'Unknown'), 'error'); return; }
    document.getElementById('lessonFormOverlay')?.remove();
    showToast(lessonId ? '✅ Lesson updated!' : '✅ Lesson added!');
    const titleText = document.getElementById('pathwayDetailTitle')?.textContent || '';
    const gradeMatch = titleText.match(/Grade (\d+)/);
    const unitMatch  = titleText.match(/Unit (\d+)/);
    if (gradeMatch && unitMatch) await openUnitLessons(pathwayId, gradeId, parseInt(gradeMatch[1]), unitId, parseInt(unitMatch[1]));
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '✦ Save Lesson'; }
    showToast('Error: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════
   TEACHER CHANGE / RESCHEDULE
   Admin picks a student enrolment, selects new teacher,
   chooses starting lesson number.
   Accessible from postsales paid students list.
══════════════════════════════════════════════════════ */

function openTeacherChangeModal(enrolmentId, studentName, currentTeacher, currentLesson) {
  document.getElementById('teacherChangeOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'teacherChangeOverlay';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <div class="modal-title">🔄 Change Teacher</div>
        <button class="modal-close" onclick="document.getElementById('teacherChangeOverlay').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="background:var(--bg);border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:13px;font-weight:700;color:var(--mid);">
          <strong>${studentName}</strong><br>
          Current Teacher: ${currentTeacher || '—'} · Lessons completed: ${currentLesson || 0}
        </div>
        <input type="hidden" id="tc-enrolment-id" value="${enrolmentId}">
        <div class="pm-field">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">New Teacher *</label>
          <select id="tc-teacher" style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;background:#fff;">
            <option value="">— Select new teacher —</option>
          </select>
        </div>
        <div class="pm-field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Start from Lesson # *</label>
          <input type="number" id="tc-lesson-start" min="1" max="72"
            value="${(parseInt(currentLesson)||0) + 1}"
            placeholder="e.g. 11"
            style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
          <div style="font-size:11px;color:var(--light);font-weight:700;margin-top:4px;">
            Enter the lesson number to start with the new teacher. Lessons before this will remain with the previous teacher.
          </div>
        </div>
        <div class="pm-field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:900;color:var(--mid);text-transform:uppercase;letter-spacing:.4px;">Class Link (Meet/Zoom) *</label>
          <input type="url" id="tc-class-link" placeholder="https://meet.google.com/xxx-xxxx-xxx"
            style="width:100%;padding:11px 14px;border:2px solid #e8eaf0;border-radius:12px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;">
        </div>
        <div style="background:#fff8e1;border-radius:10px;padding:10px 14px;margin-top:12px;font-size:12px;font-weight:700;color:#e65100;">
          ⚠️ All future bookings from the chosen lesson onwards will be reassigned to the new teacher.
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="btn btn-outline" style="flex:1;" onclick="document.getElementById('teacherChangeOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:2;" onclick="confirmTeacherChange()">🔄 Confirm Teacher Change</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  /* Load teachers into dropdown */
  _loadTeachersForChange();
}

async function _loadTeachersForChange() {
  try {
    const token = localStorage.getItem('sn_access_token');
    const res = await fetch('https://api.stemnestacademy.co.uk/api/users?role=tutor', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const sel = document.getElementById('tc-teacher');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select new teacher —</option>' +
      (data.users || []).map(t => `<option value="${t.id}">${t.name} (${t.staff_id || t.id})</option>`).join('');
  } catch(e) { console.warn('[TeacherChange] Load teachers failed:', e.message); }
}

async function confirmTeacherChange() {
  const enrolmentId  = document.getElementById('tc-enrolment-id')?.value;
  const newTeacherId = document.getElementById('tc-teacher')?.value;
  const lessonStart  = document.getElementById('tc-lesson-start')?.value;
  const classLink    = document.getElementById('tc-class-link')?.value.trim();

  if (!newTeacherId) { showToast('Please select a new teacher.', 'error'); return; }
  if (!lessonStart)  { showToast('Please enter the starting lesson number.', 'error'); return; }
  if (!classLink)    { showToast('Please enter a class link.', 'error'); return; }

  try {
    const token = localStorage.getItem('sn_access_token');
    /* Reassign all future bookings from lessonStart onwards */
    const res = await fetch(`https://api.stemnestacademy.co.uk/api/pathways/teacher-change`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrolmentId,
        newTeacherId,
        startFromLesson: parseInt(lessonStart),
        classLink,
      })
    });
    const data = await res.json();
    document.getElementById('teacherChangeOverlay')?.remove();
    if (data.success) {
      showToast(`✅ Teacher changed! ${data.updated || 0} future lessons reassigned.`);
    } else {
      showToast('Failed: ' + (data.error || 'Unknown'), 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
