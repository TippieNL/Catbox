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

  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        document.body.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
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
    const signup = document.querySelector('#signup-form');
    if (!login && !signup) return;
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
        statusEl.textContent = data.error || 'Success. Redirecting…';
        if (res.ok) setTimeout(() => (window.location.href = '/dashboard'), 600);
      });
    }
    if (login) handle(login, '/api/login');
    if (signup) handle(signup, '/api/register');
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
    const dashboardRoot = document.querySelector('[data-dashboard]');
    if (!dashboardRoot) return;

    const fileList = document.querySelector('#file-list');
    const stats = document.querySelector('#stats');
    const albumList = document.querySelector('#album-list');
    const albumSelect = document.querySelector('#album-select');
    const addToAlbumButton = document.querySelector('#add-to-album');
    const fileStatus = document.querySelector('#file-status');
    const albumForm = document.querySelector('#album-form');

    const [meRes, albumsRes] = await Promise.all([fetch('/api/me'), fetch('/api/albums')]);
    if (handleAuthRedirect(meRes) || handleAuthRedirect(albumsRes)) return;

    if (!meRes.ok) {
      fileList.innerHTML = '<div class="card">Log in to see your files.</div>';
      return;
    }

    const data = await meRes.json();
    const albumsPayload = albumsRes.ok ? await albumsRes.json() : [];

    const state = {
      files: Array.isArray(data.files) ? data.files : [],
      links: Array.isArray(data.links) ? data.links : [],
      albums: normalizeAlbums(albumsPayload),
    };

    function renderStats() {
      const totalSize = state.files.reduce((acc, file) => acc + file.size, 0);
      stats.innerHTML = `
        <div class="card"><strong>Total files</strong><br/>${state.files.length}</div>
        <div class="card"><strong>Storage used</strong><br/>${(totalSize / 1024 / 1024).toFixed(2)} MB</div>
        <div class="card"><strong>Short links</strong><br/>${state.links.length}</div>`;
    }

    function renderAlbumSelect() {
      const current = albumSelect.value;
      albumSelect.innerHTML = '<option value="">Select album…</option>';
      state.albums.forEach((album) => {
        const option = document.createElement('option');
        option.value = album.id;
        option.textContent = album.title || `Album ${album.id}`;
        albumSelect.append(option);
      });
      if (current) albumSelect.value = current;
    }

    function renderAlbums() {
      if (!state.albums.length) {
        albumList.innerHTML = '<div class="small">No albums yet.</div>';
        renderAlbumSelect();
        return;
      }
      albumList.innerHTML = state.albums
        .map(
          (album) => `
          <div class="album-card" data-album-id="${album.id}">
            <div>
              <strong>${album.title || 'Untitled album'}</strong>
              <div class="small">${getAlbumCount(album)} files</div>
            </div>
            <div class="album-actions">
              <button class="action secondary" type="button" data-album-edit="${album.id}">Edit</button>
              <button class="action danger" type="button" data-album-delete="${album.id}">Delete</button>
            </div>
          </div>`
        )
        .join('');
      renderAlbumSelect();
    }

    function renderFiles() {
      if (!state.files.length) {
        fileList.innerHTML = '<div class="card">No uploads yet.</div>';
        return;
      }
      fileList.innerHTML = state.files
        .map((file) => {
          const url = `/files/${file.storedName}`;
          return `
            <div class="file-card" data-file-id="${file.id}">
              <label class="file-select">
                <input type="checkbox" data-file-check="${file.id}" />
                <span>Select</span>
              </label>
              <div class="file-main">
                <div>
                  <strong>${file.originalName}</strong>
                  <div class="small">${(file.size / 1024).toFixed(1)} KB • ${new Date(file.createdAt).toLocaleString()}</div>
                  <div class="small">${file.isTemporary ? 'Temporary' : 'Permanent'}${file.expiresAt ? ` • Expires ${new Date(file.expiresAt).toLocaleString()}` : ''}</div>
                </div>
                <div class="input-row">
                  <input value="${url}" readonly />
                  <button class="action secondary" type="button" data-copy="${url}">Copy URL</button>
                </div>
              </div>
              <div class="file-actions">
                <a class="action secondary" href="${url}" target="_blank" rel="noopener">Open</a>
                <button class="action danger" type="button" data-delete="${file.id}" data-delete-token="${file.deleteToken}">Delete</button>
              </div>
            </div>`;
        })
        .join('');
    }

    async function removeFile(fileId) {
      const file = state.files.find((item) => item.id === Number(fileId));
      if (!file) return;
      fileStatus.textContent = 'Deleting…';
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id, deleteToken: file.deleteToken }),
      });
      if (handleAuthRedirect(res)) return;
      if (!res.ok) {
        const error = await res.json();
        fileStatus.textContent = error.error || 'Delete failed';
        return;
      }
      state.files = state.files.filter((item) => item.id !== file.id);
      fileStatus.textContent = 'File deleted';
      renderFiles();
      renderStats();
    }

    async function addFilesToAlbum() {
      const albumId = albumSelect.value;
      if (!albumId) {
        fileStatus.textContent = 'Select an album first.';
        return;
      }
      const selected = Array.from(fileList.querySelectorAll('[data-file-check]:checked')).map((input) =>
        Number(input.dataset.fileCheck)
      );
      if (!selected.length) {
        fileStatus.textContent = 'Select files to add.';
        return;
      }
      fileStatus.textContent = 'Adding to album…';
      const res = await fetch(`/api/albums/${albumId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: selected }),
      });
      if (handleAuthRedirect(res)) return;
      if (!res.ok) {
        const error = await res.json();
        fileStatus.textContent = error.error || 'Unable to add files.';
        return;
      }
      const updated = await res.json();
      const updatedAlbums = normalizeAlbums(updated) || [];
      if (updatedAlbums.length) {
        state.albums = updatedAlbums;
      } else {
        const target = state.albums.find((album) => String(album.id) === String(albumId));
        if (target && Array.isArray(target.fileIds)) {
          target.fileIds = Array.from(new Set([...target.fileIds, ...selected]));
        }
      }
      fileStatus.textContent = 'Files added to album.';
      fileList.querySelectorAll('[data-file-check]').forEach((input) => {
        input.checked = false;
      });
      renderAlbums();
    }

    fileList.addEventListener('click', (event) => {
      const copyTarget = event.target.closest('[data-copy]');
      if (copyTarget) {
        navigator.clipboard.writeText(copyTarget.dataset.copy);
        copyTarget.textContent = 'Copied';
        setTimeout(() => {
          copyTarget.textContent = 'Copy URL';
        }, 1200);
        return;
      }
      const deleteTarget = event.target.closest('[data-delete]');
      if (deleteTarget) {
        removeFile(deleteTarget.dataset.delete);
      }
    });

    albumList.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-album-delete]');
      if (deleteButton) {
        const albumId = deleteButton.dataset.albumDelete;
        const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' });
        if (handleAuthRedirect(res)) return;
        if (res.ok) {
          state.albums = state.albums.filter((album) => String(album.id) !== String(albumId));
          if (albumSelect.value === albumId) albumSelect.value = '';
          renderAlbums();
        }
        return;
      }
      const editButton = event.target.closest('[data-album-edit]');
      if (editButton) {
        const albumId = editButton.dataset.albumEdit;
        const album = state.albums.find((item) => String(item.id) === String(albumId));
        if (!album) return;
        const title = window.prompt('Album title', album.title || '');
        if (!title) return;
        const res = await fetch(`/api/albums/${albumId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (handleAuthRedirect(res)) return;
        if (res.ok) {
          const updated = await res.json();
          if (updated && updated.id) {
            state.albums = state.albums.map((item) => (item.id === updated.id ? updated : item));
          } else {
            album.title = title;
          }
          renderAlbums();
        }
      }
    });

    if (addToAlbumButton) {
      addToAlbumButton.addEventListener('click', addFilesToAlbum);
    }

    if (albumForm) {
      albumForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = albumForm.querySelector('[data-status]');
        const formData = new FormData(albumForm);
        const title = String(formData.get('title') || '').trim();
        if (!title) return;
        status.textContent = 'Creating…';
        const res = await fetch('/api/albums', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (handleAuthRedirect(res)) return;
        if (!res.ok) {
          const error = await res.json();
          status.textContent = error.error || 'Unable to create album.';
          return;
        }
        const created = await res.json();
        if (created && created.id) {
          state.albums.push(created);
        } else {
          state.albums = normalizeAlbums(created).length ? normalizeAlbums(created) : state.albums;
        }
        albumForm.reset();
        status.textContent = 'Album created.';
        renderAlbums();
      });
    }

    renderStats();
    renderFiles();
    renderAlbums();
  }
  loadDashboard();

  const logoutButton = document.querySelector('#logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/login';
    });
  }

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
