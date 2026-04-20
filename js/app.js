document.addEventListener('DOMContentLoaded', async () => {
    const messagesEl = document.getElementById('chat-messages');
    const inputEl    = document.getElementById('user-input');
    const btnSend    = document.getElementById('btn-send');
    const btnReset   = document.getElementById('btn-reset');
    const btnLogout  = document.getElementById('btn-logout');
    const btnMic     = document.getElementById('btn-mic');
    const slashMenu  = document.getElementById('slash-menu');
    const statusBadge = document.getElementById('status-badge');
    const pendingBanner = document.getElementById('pending-banner');
    const inputContainer = document.getElementById('input-container');
    const fileInput  = document.getElementById('file-input');
    const filePreviewBar = document.getElementById('file-preview-bar');

    const token = localStorage.getItem('webchat_token');

    function authHeaders() {
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    }

    function logout() {
        localStorage.removeItem('webchat_token');
        localStorage.removeItem('webchat_user');
        window.location.href = '/login.html';
    }

    // ── Auth check ──
    let me = null;
    try {
        const r = await fetch('/api/auth/me', { headers: authHeaders() });
        if (r.status === 401) return logout();
        me = await r.json();
    } catch { return logout(); }

    document.getElementById('user-display-name').textContent = me.username;
    document.getElementById('user-display-email').textContent = me.email;

    const approved = me.is_approved;
    if (!approved) {
        pendingBanner.style.display = 'flex';
        inputEl.disabled = true;
        btnSend.disabled = true;
        fileInput.disabled = true;
        inputEl.placeholder = 'Waiting for admin approval…';
        statusBadge.className = 'status-badge badge-warning';
        statusBadge.innerHTML = '<span class="badge-dot"></span> Pending Approval';
        addMsg('system', '⌛ Your account is pending admin approval.');
    }

    btnLogout.addEventListener('click', () => { if (confirm('Logout?')) logout(); });

    // ── Message rendering ──
    function addMsg(role, html) {
        const el = document.createElement('div');
        el.className = `chat-msg ${role}`;
        el.innerHTML = html;
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return el;
    }

    function addThinking() {
        const el = document.createElement('div');
        el.className = 'chat-msg thinking';
        el.innerHTML = `<div class="thinking-dots"><span></span><span></span><span></span></div>`;
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return el;
    }

    function formatReply(text) {
        // Basic markdown: bold, inline code, code blocks, newlines
        return text
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    // ── Slash commands ──
    const COMMANDS = [
        { cmd: '/start',   icon: 'fa-play',            desc: '身份驗證並問候' },
        { cmd: '/reset',   icon: 'fa-rotate-right',    desc: '重設對話' },
        { cmd: '/profile', icon: 'fa-id-card',         desc: '查看個人資料' },
        { cmd: '/list',    icon: 'fa-list-check',      desc: '查看提醒任務' },
        { cmd: '/help',    icon: 'fa-circle-question', desc: '顯示可用指令' },
        { cmd: '/whoami',  icon: 'fa-user',            desc: '查看帳號資訊' },
    ];

    let slashFocusIdx = -1;

    function buildSlashMenu(filter) {
        const matches = COMMANDS.filter(c => c.cmd.startsWith(filter));
        if (!matches.length) { slashMenu.classList.add('hidden'); return; }

        const existingItems = slashMenu.querySelectorAll('.slash-item');
        existingItems.forEach(e => e.remove());

        matches.forEach((c, i) => {
            const item = document.createElement('div');
            item.className = 'slash-item';
            item.dataset.cmd = c.cmd;
            item.innerHTML = `<i class="fas ${c.icon} w-4 text-center" style="color:var(--primary)"></i><span class="slash-cmd">${c.cmd}</span><span class="slash-desc">${c.desc}</span>`;
            item.addEventListener('mousedown', e => { e.preventDefault(); selectSlashCmd(c.cmd); });
            slashMenu.appendChild(item);
        });

        slashFocusIdx = -1;
        slashMenu.classList.remove('hidden');
    }

    function hideSlashMenu() { slashMenu.classList.add('hidden'); slashFocusIdx = -1; }

    function updateSlashFocus() {
        slashMenu.querySelectorAll('.slash-item').forEach((el, i) =>
            el.classList.toggle('focused', i === slashFocusIdx));
    }

    function selectSlashCmd(cmd) {
        inputEl.value = cmd + ' ';
        hideSlashMenu();
        inputEl.focus();
    }

    inputEl.addEventListener('input', () => {
        autoResize();
        const val = inputEl.value;
        if (val.startsWith('/') && !val.includes(' ')) {
            buildSlashMenu(val);
        } else {
            hideSlashMenu();
        }
    });

    inputEl.addEventListener('keydown', e => {
        if (!slashMenu.classList.contains('hidden')) {
            const items = slashMenu.querySelectorAll('.slash-item');
            if (e.key === 'ArrowDown')  { e.preventDefault(); slashFocusIdx = Math.min(slashFocusIdx + 1, items.length - 1); updateSlashFocus(); return; }
            if (e.key === 'ArrowUp')    { e.preventDefault(); slashFocusIdx = Math.max(slashFocusIdx - 1, 0); updateSlashFocus(); return; }
            if (e.key === 'Enter' && slashFocusIdx >= 0) { e.preventDefault(); selectSlashCmd(items[slashFocusIdx].dataset.cmd); return; }
            if (e.key === 'Escape')     { hideSlashMenu(); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // ── File attachment ──
    // pendingAttachments: array of {type, filename, mimeType?, data?, path?}
    let pendingAttachments = [];

    fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files);
        fileInput.value = '';
        for (const file of files) {
            await uploadFile(file);
        }
    });

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            if (res.status === 401) return logout();
            if (!res.ok) { addMsg('system', `⚠️ Failed to upload ${file.name}.`); return; }
            const att = await res.json();
            att.filename = att.filename || file.name;
            pendingAttachments.push(att);
            renderFilePreview();
        } catch {
            addMsg('system', `⚠️ Upload error for ${file.name}.`);
        }
    }

    function renderFilePreview() {
        filePreviewBar.innerHTML = '';
        if (!pendingAttachments.length) {
            filePreviewBar.classList.add('hidden');
            return;
        }
        filePreviewBar.classList.remove('hidden');
        pendingAttachments.forEach((att, idx) => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            const icon = att.type === 'image' ? 'fa-image' : 'fa-file';
            chip.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(att.filename)}</span><button class="file-chip-remove" data-idx="${idx}" title="Remove"><i class="fas fa-xmark"></i></button>`;
            chip.querySelector('.file-chip-remove').addEventListener('click', () => {
                pendingAttachments.splice(idx, 1);
                renderFilePreview();
            });
            filePreviewBar.appendChild(chip);
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Send ──
    async function handleSend() {
        if (!approved) return;
        const raw = inputEl.value.trim();
        if (!raw && !pendingAttachments.length) return;

        // Built-in slash commands (only if no attachments)
        if (!pendingAttachments.length) {
            if (raw === '/start')   { await runAgentCmd('/start',   'Please check my identity and greet me.'); return; }
            if (raw === '/reset')   { inputEl.value = ''; autoResize(); hideSlashMenu(); await doReset(); return; }
            if (raw === '/profile') { await runAgentCmd('/profile', 'Show my profile.'); return; }
            if (raw === '/list')    { await runAgentCmd('/list',    'List my reminders.'); return; }
            if (raw === '/help')    { inputEl.value = ''; autoResize(); hideSlashMenu(); showHelp(); return; }
            if (raw === '/whoami')  { inputEl.value = ''; autoResize(); hideSlashMenu(); showWhoami(); return; }
        }

        // Build user bubble display
        let userBubbleHtml = raw ? formatReply(raw) : '';
        if (pendingAttachments.length) {
            const attachHtml = pendingAttachments.map(a => {
                if (a.type === 'image') {
                    return `<img src="data:${a.mimeType};base64,${a.data}" alt="${escapeHtml(a.filename)}" style="max-width:200px;max-height:160px;border-radius:8px;margin-top:6px;display:block">`;
                }
                return `<div style="margin-top:6px"><i class="fas fa-file" style="color:var(--primary)"></i> <code>${escapeHtml(a.filename)}</code></div>`;
            }).join('');
            userBubbleHtml += attachHtml;
        }
        if (userBubbleHtml) addMsg('user', userBubbleHtml);

        const attachmentsToSend = [...pendingAttachments];
        pendingAttachments = [];
        renderFilePreview();
        inputEl.value = '';
        autoResize();
        hideSlashMenu();

        const thinking = addThinking();
        btnSend.disabled = true;
        statusBadge.className = 'status-badge badge-live';
        statusBadge.innerHTML = '<span class="badge-dot"></span> Thinking…';

        try {
            const res = await fetch('/api/run', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ text: raw, attachments: attachmentsToSend })
            });
            if (res.status === 401) return logout();
            if (res.status === 403) {
                const d = await res.json();
                thinking.remove();
                addMsg('system', `⚠️ ${d.detail}`);
                return;
            }
            const data = await res.json();
            thinking.remove();
            addMsg('agent', formatReply(data.reply || '⚠️ No response.'));
        } catch {
            thinking.remove();
            addMsg('system', '⚠️ Connection error. Please try again.');
        } finally {
            btnSend.disabled = false;
            statusBadge.className = 'status-badge badge-live';
            statusBadge.innerHTML = '<span class="badge-dot"></span> Connected';
        }
    }

    async function runAgentCmd(label, prompt) {
        inputEl.value = ''; autoResize(); hideSlashMenu();
        addMsg('system', `<code>${label}</code>`);
        const thinking = addThinking();
        btnSend.disabled = true;
        statusBadge.className = 'status-badge badge-live';
        statusBadge.innerHTML = '<span class="badge-dot"></span> Thinking…';
        try {
            const res = await fetch('/api/run', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ text: prompt, attachments: [] })
            });
            if (res.status === 401) return logout();
            if (res.status === 403) { const d = await res.json(); thinking.remove(); addMsg('system', `⚠️ ${d.detail}`); return; }
            const data = await res.json();
            thinking.remove();
            addMsg('agent', formatReply(data.reply || '⚠️ No response.'));
        } catch {
            thinking.remove();
            addMsg('system', '⚠️ Connection error. Please try again.');
        } finally {
            btnSend.disabled = false;
            statusBadge.className = 'status-badge badge-live';
            statusBadge.innerHTML = '<span class="badge-dot"></span> Connected';
        }
    }

    async function doReset() {
        if (!confirm('Reset this conversation?')) return;
        messagesEl.innerHTML = '';
        pendingAttachments = [];
        renderFilePreview();
        addMsg('system', 'Session reset.');
        try { await fetch('/api/session', { method: 'DELETE', headers: authHeaders() }); } catch {}
    }

    function showHelp() {
        const lines = COMMANDS.map(c => `<code>${c.cmd}</code> — ${c.desc}`).join('<br>');
        addMsg('system', `<strong>可用指令：</strong><br>${lines}`);
    }

    function showWhoami() {
        addMsg('system', `<strong>Signed in as:</strong> ${me.username} (${me.email})<br><strong>Session ID:</strong> <code>${me.session_id}</code>`);
    }

    btnSend.addEventListener('click', handleSend);
    btnReset.addEventListener('click', doReset);

    // ── Auto-resize textarea (1–6 lines) ──
    const _lineHeight  = parseFloat(getComputedStyle(inputEl).lineHeight) || 23;
    const _padTop      = parseFloat(getComputedStyle(inputEl).paddingTop)  || 0;
    const _padBottom   = parseFloat(getComputedStyle(inputEl).paddingBottom) || 0;
    const _padding     = _padTop + _padBottom;
    const _maxLines    = 6;
    const _oneLineH    = _lineHeight + _padding;
    const _maxH        = _lineHeight * _maxLines + _padding;

    function autoResize() {
        inputEl.style.height = 'auto';
        const h = Math.min(inputEl.scrollHeight, _maxH);
        inputEl.style.height = h + 'px';
        inputEl.style.overflowY = inputEl.scrollHeight > _maxH ? 'auto' : 'hidden';
    }

    // Set initial single-line height
    inputEl.style.height = _oneLineH + 'px';
    inputEl.style.overflowY = 'hidden';
    inputEl.addEventListener('input', autoResize);

    // ── Voice input ──
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isRecording  = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous    = false;
        recognition.interimResults = true;
        recognition.lang          = 'zh-TW';

        let interimStart = inputEl.value.length; // offset into textarea where voice text begins

        recognition.onstart = () => {
            interimStart = inputEl.value.length;
            btnMic.style.background = 'rgba(239,68,68,.15)';
            btnMic.style.color      = '#ef4444';
            btnMic.title            = 'Stop recording';
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(r => r[0].transcript).join('');
            inputEl.value = inputEl.value.slice(0, interimStart) + transcript;
            autoResize();
        };

        recognition.onend = () => {
            isRecording             = false;
            btnMic.style.background = 'var(--surface-high)';
            btnMic.style.color      = 'var(--dm-text-secondary)';
            btnMic.title            = 'Voice input';
            inputEl.focus();
        };

        recognition.onerror = (e) => {
            isRecording             = false;
            btnMic.style.background = 'var(--surface-high)';
            btnMic.style.color      = 'var(--dm-text-secondary)';
            btnMic.title            = 'Voice input';
            if (e.error !== 'no-speech') addMsg('system', `⚠️ Voice error: ${e.error}`);
        };

        btnMic.addEventListener('click', () => {
            if (!approved) return;
            if (isRecording) {
                recognition.stop();
                isRecording = false;
            } else {
                recognition.start();
                isRecording = true;
            }
        });
    } else {
        btnMic.title   = 'Voice input not supported in this browser';
        btnMic.style.opacity = '0.35';
        btnMic.style.cursor  = 'not-allowed';
    }
});
