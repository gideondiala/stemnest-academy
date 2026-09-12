/* ═══════════════════════════════════════════════════════
   STEMNEST ACADEMY — ADMIN QUIZ MANAGEMENT (admin-quizzes.js)
   Upload JSON quiz files, view all quizzes, delete quizzes.
   Follows the same extension pattern as admin-pathways.js.
═══════════════════════════════════════════════════════ */

/* ── State ── */
let _quizParsedData   = null;  // Parsed quiz JSON from uploaded file
let _quizPathways     = [];    // Pathways loaded for dropdowns
let _allQuizzes       = [];    // All quizzes loaded from API

/* ── Hook into showAdminTab ── */
(function() {
  const _prev = window.showAdminTab;
  window.showAdminTab = function(tab) {
    if (!ADMIN_TABS.includes('quizzes'))      ADMIN_TABS.push('quizzes');
    if (!ADMIN_TABS.includes('upload-quiz'))  ADMIN_TABS.push('upload-quiz');
    _prev(tab);
    if (tab === 'quizzes')     loadAndRenderQuizzes();
    if (tab === 'upload-quiz') _initQuizUploadForm();
  };
})();

/* ══════════════════════════════════════════════════════
   QUIZZES TABLE — list all quizzes
══════════════════════════════════════════════════════ */
async function loadAndRenderQuizzes() {
  const wrap = document.getElementById('quizzesTableWrap');
  if (!wrap) return;

  wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--light);font-weight:700;">⏳ Loading quizzes…</div>';

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/quizzes', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data  = await res.json();

    if (!data.success) {
      wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#c53030;font-weight:700;">⚠️ Could not load quizzes.</div>';
      return;
    }

    _allQuizzes = data.quizzes || [];

    /* Update sidebar badge */
    const badge = document.getElementById('quizAdminBadge');
    if (badge) badge.textContent = _allQuizzes.length;

    if (_allQuizzes.length === 0) {
      wrap.innerHTML = `
        <div style="text-align:center;padding:60px 20px;">
          <div style="font-size:48px;margin-bottom:12px;">🧠</div>
          <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);margin-bottom:8px;">No quizzes uploaded yet</div>
          <div style="font-size:14px;color:var(--light);font-weight:700;margin-bottom:20px;">Upload your first quiz using the AI-generated JSON format.</div>
          <button class="btn btn-primary" onclick="showAdminTab('upload-quiz')">⬆️ Upload First Quiz</button>
        </div>`;
      return;
    }

    const thS = 'padding:12px 16px;text-align:left;font-size:11px;font-weight:900;color:var(--light);text-transform:uppercase;letter-spacing:.5px;';
    const tdS = 'padding:13px 16px;vertical-align:middle;';

    wrap.innerHTML = `
      <div style="overflow-x:auto;border-radius:16px;border:1.5px solid #e8eaf0;background:var(--white);">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--bg);border-bottom:2px solid #e8eaf0;">
              <th style="${thS}">Pathway</th>
              <th style="${thS}">Grade</th>
              <th style="${thS}">Unit</th>
              <th style="${thS}">Unit Name</th>
              <th style="${thS}">Questions</th>
              <th style="${thS}">Pass %</th>
              <th style="${thS}">Uploaded</th>
              <th style="${thS};text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${_allQuizzes.map((q, i) => `
              <tr style="border-bottom:1px solid #f0f2f8;${i%2===0?'':'background:#fafbff;'}">
                <td style="${tdS};font-weight:800;color:var(--dark);">${q.pathway_name || '—'}</td>
                <td style="${tdS};font-weight:700;color:var(--mid);">Grade ${q.grade_number}</td>
                <td style="${tdS};font-weight:700;color:var(--mid);">Unit ${q.unit_number}</td>
                <td style="${tdS};color:var(--mid);">${q.unit_name || '—'}</td>
                <td style="${tdS};text-align:center;">
                  <span style="background:var(--blue-light);color:var(--blue);font-size:12px;font-weight:900;padding:3px 12px;border-radius:50px;">${q.total_questions}</span>
                </td>
                <td style="${tdS};font-weight:700;color:var(--mid);">${q.pass_score}%</td>
                <td style="${tdS};font-size:12px;color:var(--light);">${q.created_at ? new Date(q.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                <td style="${tdS};text-align:center;">
                  <div style="display:flex;gap:6px;justify-content:center;">
                    <button onclick="previewQuizAdmin('${q.id}')"
                      style="background:var(--bg);border:1.5px solid #e8eaf0;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;color:var(--mid);">
                      👁 Preview
                    </button>
                    <button onclick="deleteQuizAdmin('${q.id}', '${(q.unit_name||'Unit '+q.unit_number).replace(/'/g,'')}')"
                      style="background:#fde8e8;border:none;border-radius:8px;padding:6px 12px;font-family:'Nunito',sans-serif;font-weight:800;font-size:12px;cursor:pointer;color:#c53030;">
                      🗑 Delete
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (e) {
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#c53030;font-weight:700;">⚠️ Network error loading quizzes.</div>';
  }
}

/* ── Preview a quiz (shows first 5 questions in a modal) ── */
async function previewQuizAdmin(quizId) {
  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/quizzes/' + quizId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success) { showToast('Could not load quiz preview.', 'error'); return; }

    const quiz = data.quiz;
    const qs   = (quiz.questions || []).slice(0, 5);
    const letters = ['A','B','C','D'];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,20,50,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:32px;max-width:640px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="font-family:'Fredoka One',cursive;font-size:20px;color:var(--dark);">🧠 ${quiz.unit_name || 'Quiz Preview'}</div>
          <button onclick="this.closest('div[style]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--light);">✕</button>
        </div>
        <div style="background:#f0f4ff;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:13px;font-weight:700;color:#1e40af;">
          ${quiz.total_questions} questions · Pass: ${quiz.pass_score}% · Showing first 5
        </div>
        ${qs.map((q, i) => `
          <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1.5px solid #f0f2f8;">
            <div style="font-weight:800;color:var(--dark);font-size:14px;margin-bottom:10px;">${i+1}. ${q.q}</div>
            ${(q.options || []).map((opt, j) => `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;margin-bottom:4px;
                          background:${j === q.answer ? '#f0fdf4' : 'var(--bg)'};
                          border:1.5px solid ${j === q.answer ? '#0e9f6e' : '#e8eaf0'};">
                <span style="font-weight:900;font-size:12px;color:${j === q.answer ? '#0e9f6e' : 'var(--light)'};">${letters[j]}</span>
                <span style="font-size:13px;color:var(--dark);font-weight:${j === q.answer ? '800' : '600'};">${opt}</span>
                ${j === q.answer ? '<span style="margin-left:auto;font-size:12px;color:#0e9f6e;font-weight:900;">✓ Correct</span>' : ''}
              </div>`).join('')}
          </div>`).join('')}
        <button onclick="this.closest('div[style]').remove()" class="btn btn-outline" style="width:100%;margin-top:8px;">Close Preview</button>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (e) {
    showToast('Error loading quiz preview.', 'error');
  }
}

/* ── Delete a quiz ── */
async function deleteQuizAdmin(quizId, unitName) {
  if (!confirm(`Delete quiz for "${unitName}"?\n\nThis will also remove all student attempt records. This cannot be undone.`)) return;

  const token = localStorage.getItem('sn_access_token');
  try {
    const res  = await fetch('https://api.stemnestacademy.co.uk/api/quizzes/' + quizId, {
      method:  'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Quiz deleted successfully.');
      loadAndRenderQuizzes();
    } else {
      showToast('Failed to delete quiz: ' + (data.error || 'error'), 'error');
    }
  } catch (e) {
    showToast('Network error deleting quiz.', 'error');
  }
}

/* ══════════════════════════════════════════════════════
   UPLOAD FORM — file handling + submission
══════════════════════════════════════════════════════ */

/* Load pathways into the pathway dropdown */
async function _initQuizUploadForm() {
  const sel = document.getElementById('quizPathwaySelect');
  if (!sel) return;

  /* Only reload if empty */
  if (sel.options.length <= 1) {
    try {
      const token = localStorage.getItem('sn_access_token');
      const res   = await fetch('https://api.stemnestacademy.co.uk/api/pathways', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data  = await res.json();
      _quizPathways = data.pathways || [];

      sel.innerHTML = '<option value="">— Select Pathway —</option>';
      _quizPathways.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    } catch (e) {
      sel.innerHTML = '<option value="">⚠️ Could not load pathways</option>';
    }
  }

  /* Reset rest of form */
  document.getElementById('quizGradeSelect').innerHTML = '<option value="">— Select Grade —</option>';
  document.getElementById('quizUnitSelect').innerHTML  = '<option value="">— Select Unit —</option>';
  _quizParsedData = null;
  _updateUploadPreview(null);
  _setUploadBtnState(false);
}

/* When pathway selected: populate grade 1–12 */
function loadQuizGrades() {
  const gradeEl = document.getElementById('quizGradeSelect');
  const unitEl  = document.getElementById('quizUnitSelect');
  if (!gradeEl) return;

  gradeEl.innerHTML = '<option value="">— Select Grade —</option>';
  unitEl.innerHTML  = '<option value="">— Select Unit —</option>';

  for (let g = 1; g <= 12; g++) {
    const opt = document.createElement('option');
    opt.value       = g;
    opt.textContent = 'Grade ' + g;
    gradeEl.appendChild(opt);
  }
}

/* When grade selected: populate units 1–8 */
function loadQuizUnits() {
  const unitEl = document.getElementById('quizUnitSelect');
  if (!unitEl) return;
  unitEl.innerHTML = '<option value="">— Select Unit —</option>';

  for (let u = 1; u <= 8; u++) {
    const opt = document.createElement('option');
    opt.value       = u;
    opt.textContent = 'Unit ' + u;
    unitEl.appendChild(opt);
  }
}

/* ── File drag & drop ── */
function handleQuizFileDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById('quizDropZone');
  if (dropZone) { dropZone.style.borderColor = '#e8eaf0'; dropZone.style.background = 'var(--bg)'; }
  const file = event.dataTransfer?.files?.[0];
  if (file) _processQuizFile(file);
}

/* ── File input select ── */
function handleQuizFileSelect(input) {
  const file = input.files?.[0];
  if (file) _processQuizFile(file);
}

/* ── Parse and validate the JSON file ── */
function _processQuizFile(file) {
  const nameEl = document.getElementById('quizFileNameDisplay');
  if (nameEl) nameEl.textContent = file.name;

  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    _updateUploadPreview(null, 'File must be a .json file');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);

      /* Validate structure */
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        _updateUploadPreview(null, 'JSON must contain a "questions" array');
        return;
      }

      /* Check each question */
      const errors = [];
      parsed.questions.forEach((q, i) => {
        if (!q.q)                                         errors.push(`Q${i+1}: missing question text ("q")`);
        if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`Q${i+1}: must have exactly 4 options`);
        if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) errors.push(`Q${i+1}: "answer" must be 0–3`);
      });

      if (errors.length > 0) {
        _updateUploadPreview(null, 'Validation errors:\n• ' + errors.slice(0, 5).join('\n• ') + (errors.length > 5 ? `\n…and ${errors.length - 5} more` : ''));
        return;
      }

      _quizParsedData = parsed;
      _updateUploadPreview(`✅ Valid quiz file: ${parsed.questions.length} questions parsed successfully. Unit: "${parsed.unit || 'Not specified'}"`, null);
      _setUploadBtnState(true);
    } catch (parseErr) {
      _updateUploadPreview(null, 'Invalid JSON file: ' + parseErr.message);
    }
  };
  reader.readAsText(file);
}

function _updateUploadPreview(successMsg, errorMsg) {
  const prevEl = document.getElementById('quizParsePreview');
  const errEl  = document.getElementById('quizParseError');
  if (prevEl) { prevEl.style.display = successMsg ? 'block' : 'none'; prevEl.textContent = successMsg || ''; }
  if (errEl)  { errEl.style.display  = errorMsg   ? 'block' : 'none'; errEl.textContent  = errorMsg  || ''; }
}

function _setUploadBtnState(enabled) {
  const btn = document.getElementById('quizUploadBtn');
  if (!btn) return;
  btn.disabled          = !enabled;
  btn.style.background  = enabled ? 'var(--blue)' : '#e8eaf0';
  btn.style.color       = enabled ? '#fff'        : '#a0aec0';
  btn.style.cursor      = enabled ? 'pointer'     : 'not-allowed';
}

/* ── Submit the quiz to the backend ── */
async function submitQuizUpload() {
  const pathwayId  = document.getElementById('quizPathwaySelect')?.value;
  const gradeNum   = parseInt(document.getElementById('quizGradeSelect')?.value);
  const unitNum    = parseInt(document.getElementById('quizUnitSelect')?.value);
  const passScore  = parseInt(document.getElementById('quizPassScore')?.value) || 70;

  if (!pathwayId)       { showToast('Please select a pathway.',     'error'); return; }
  if (!gradeNum)        { showToast('Please select a grade.',       'error'); return; }
  if (!unitNum)         { showToast('Please select a unit.',        'error'); return; }
  if (!_quizParsedData) { showToast('Please upload a valid quiz file.', 'error'); return; }

  const btn = document.getElementById('quizUploadBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Uploading…'; }

  try {
    const token = localStorage.getItem('sn_access_token');
    const res   = await fetch('https://api.stemnestacademy.co.uk/api/quizzes/upload', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        pathway_id:   pathwayId,
        grade_number: gradeNum,
        unit_number:  unitNum,
        unit_name:    _quizParsedData.unit || null,
        pass_score:   passScore,
        questions:    _quizParsedData.questions,
      }),
    });

    const data = await res.json();

    if (btn) { btn.disabled = false; btn.textContent = '⬆️ Upload Quiz'; }

    if (!data.success) {
      showToast('Upload failed: ' + (data.error || 'Unknown error'), 'error');
      return;
    }

    showToast(`✅ Quiz uploaded! ${_quizParsedData.questions.length} questions for Grade ${gradeNum}, Unit ${unitNum}.`);

    /* Reset form */
    _quizParsedData = null;
    document.getElementById('quizFileInput').value = '';
    const nameEl = document.getElementById('quizFileNameDisplay');
    if (nameEl) nameEl.textContent = 'No file selected';
    _updateUploadPreview(null, null);
    _setUploadBtnState(false);

    /* Go to quizzes list */
    setTimeout(() => showAdminTab('quizzes'), 800);

  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '⬆️ Upload Quiz'; }
    showToast('Network error uploading quiz.', 'error');
  }
}
