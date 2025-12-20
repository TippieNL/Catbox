(function () {
  const themeToggle = document.querySelector('#theme-toggle');
  const root = document.documentElement;
  if (localStorage.getItem('theme') === 'dark') {
    root.classList.add('dark');
    if (themeToggle) themeToggle.textContent = '☀️ Light';
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = root.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      themeToggle.textContent = isDark ? '☀️ Light' : '🌙 Dark';
    });
  }

  const dropzones = document.querySelectorAll('[data-dropzone]');
  dropzones.forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) input.files = e.dataTransfer.files;
    });
  });

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(form) {
    const fileInput = form.querySelector('input[type="file"]');
    const statusEl = form.querySelector('[data-status]');
    const resultEl = form.querySelector('[data-result]');
    const expiry = form.querySelector('select[name="expiry"]');
    const temporary = form.dataset.temporary === 'true';
    const file = fileInput.files[0];
    if (!file) {
      statusEl.textContent = 'Pick a file to upload';
      return;
    }
    statusEl.textContent = 'Encoding file…';
    const base64 = await readFileAsBase64(file);
    statusEl.textContent = 'Uploading…';
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        content: base64,
        temporary,
        expiryHours: expiry ? Number(expiry.value) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || 'Upload failed';
      return;
    }
    statusEl.textContent = 'Upload complete';
    resultEl.innerHTML = `
      <div class="result-panel">
        <div class="input-row">
          <input value="${data.file_url}" readonly />
          <button class="action" data-copy="${data.file_url}">Copy</button>
        </div>
        <div class="small">Delete token: ${data.delete_token}</div>
        <div class="small">${temporary ? 'Temporary' : 'Permanent'} • ${Math.round(data.size / 1024)} KB</div>
      </div>`;
    resultEl.querySelector('[data-copy]').addEventListener('click', () => {
      navigator.clipboard.writeText(data.file_url);
      statusEl.textContent = 'Copied link to clipboard';
    });
  }

  const uploadForms = document.querySelectorAll('[data-upload-form]');
  uploadForms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      uploadFile(form);
    });
  });

  async function ensureAuthForms() {
    const login = document.querySelector('#login-form');
    const register = document.querySelector('#register-form');
    if (!login && !register) return;
    function handle(form, endpoint) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        const statusEl = form.querySelector('[data-status]');
        statusEl.textContent = data.error || 'Success';
        if (res.ok) setTimeout(() => window.location.reload(), 600);
      });
    }
    if (login) handle(login, '/api/login');
    if (register) handle(register, '/api/register');
  }
  ensureAuthForms();

  const changePasswordForm = document.querySelector('#change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = changePasswordForm.querySelector('[data-status]');
      const formData = new FormData(changePasswordForm);
      const payload = Object.fromEntries(formData.entries());
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      statusEl.textContent = data.error || 'Password updated';
      if (res.ok) changePasswordForm.reset();
    });
  }

  async function loadDashboard() {
    const table = document.querySelector('#file-table');
    if (!table) return;
    const res = await fetch('/api/me');
    if (!res.ok) {
      table.innerHTML = '<tr><td colspan="6">Log in to see your files.</td></tr>';
      return;
    }
    const data = await res.json();
    const stats = document.querySelector('#stats');
    const totalSize = data.files.reduce((a, b) => a + b.size, 0);
    stats.innerHTML = `
      <div class="card"><strong>Total files</strong><br/>${data.files.length}</div>
      <div class="card"><strong>Storage used</strong><br/>${(totalSize / 1024 / 1024).toFixed(2)} MB</div>
      <div class="card"><strong>Short links</strong><br/>${data.links.length}</div>`;
    table.innerHTML = data.files
      .map(
        (f) => `<tr>
            <td>${f.originalName}</td>
            <td>${(f.size / 1024).toFixed(1)} KB</td>
            <td>${new Date(f.createdAt).toLocaleString()}</td>
            <td>${f.isTemporary ? `<span class="badge">Temporary</span>` : 'Permanent'}</td>
            <td>${f.expiresAt ? new Date(f.expiresAt).toLocaleString() : '—'}</td>
            <td><a href="/files/${f.storedName}" target="_blank">Open</a></td>
          </tr>`
      )
      .join('');
  }
  loadDashboard();

  async function loadImageGallery() {
    const grid = document.querySelector('#image-grid');
    if (!grid) return;
    const res = await fetch('/api/me');
    if (!res.ok) {
      grid.innerHTML = '<div class="card">Log in to see your images.</div>';
      return;
    }
    const data = await res.json();
    const imageFiles = data.files.filter((file) =>
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.storedName || file.originalName)
    );
    if (!imageFiles.length) {
      grid.innerHTML = '<div class="card">No image uploads yet.</div>';
      return;
    }
    grid.innerHTML = imageFiles
      .map((file) => {
        const url = `/files/${file.storedName}`;
        return `
        <div class="image-card">
          <div class="image-frame">
            <img src="${url}" alt="${file.originalName}" loading="lazy" />
          </div>
          <div class="image-meta">
            <div class="small">${file.originalName}</div>
            <a href="${url}" target="_blank" rel="noopener">Open image</a>
            <div class="input-row">
              <input value="${url}" readonly />
              <button class="action" data-copy="${url}">Copy</button>
            </div>
          </div>
        </div>`;
      })
      .join('');
    grid.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = 'Copied';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 1200);
      });
    });
  }
  loadImageGallery();

  const shortenForm = document.querySelector('#shorten-form');
  if (shortenForm) {
    shortenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlInput = shortenForm.querySelector('input[name="url"]');
      const status = shortenForm.querySelector('[data-status]');
      const res = await fetch('/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.value }),
      });
      const data = await res.json();
      status.textContent = res.ok ? data.short_url : data.error;
    });
  }
})();
