/* memory.js (Cloudinary-enabled + persistent storage + compress/rescale + share/import/export) */
/* Replace CLOUD_NAME and UPLOAD_PRESET with your Cloudinary config */
const CLOUD_NAME = 'dpdvqfoyf';
const UPLOAD_PRESET = 'img_preset';

const STORAGE_KEY = 'memories_images_v1';
const IDB_DB = 'memories-db';
const IDB_STORE = 'images-store';

let images = []; // array of dataURLs OR remote URLs
let currentIndex = 0;

/* --- DOM --- */
const memoryImage = document.getElementById('memoryImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const goToCakeBtn = document.getElementById('goToCakeBtn');

const uploadInput = document.getElementById('uploadInput');
const changeBtn = document.getElementById('changeBtn');
const changeInput = document.getElementById('changeInput');

const deleteBtn = document.getElementById('deleteBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

const thumbnails = document.getElementById('thumbnails');
const imageIndex = document.getElementById('imageIndex');

/* Share UI elements */
const shareBtn = document.getElementById('shareBtn');
const shareModal = document.getElementById('shareModal');
const shareTextarea = document.getElementById('shareTextarea');
const copyUrlsBtn = document.getElementById('copyUrlsBtn');
const closeShareBtn = document.getElementById('closeShareBtn');

const downloadBtn = document.getElementById('downloadBtn');
const importInput = document.getElementById('importInput');
const loadUrlInput = document.getElementById('loadUrlInput');
const loadUrlBtn = document.getElementById('loadUrlBtn');

/* ---------------- (IDB helpers and storage) ---------------- */
// ... (same IDB/localStorage helpers as earlier) ...
function openIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbSaveImages(imgArray) {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(JSON.stringify(imgArray), 'images');
      req.onsuccess = () => { resolve(true); db.close(); };
      req.onerror = (e) => { reject(e.target.error); db.close(); };
    });
  } catch (e) {
    console.warn('idbSaveImages error:', e);
    throw e;
  }
}

async function idbLoadImages() {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get('images');
      req.onsuccess = (e) => {
        const val = e.target.result;
        db.close();
        if (!val) return resolve(null);
        try { resolve(JSON.parse(val)); } catch { resolve(null); }
      };
      req.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (e) {
    console.warn('idbLoadImages error:', e);
    return null;
  }
}

async function saveImagesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    console.log('Saved images to localStorage (count:', images.length, ')');
    return true;
  } catch (e) {
    console.warn('localStorage.setItem failed:', e);
    try {
      await idbSaveImages(images);
      console.log('Saved images to IndexedDB as fallback.');
      return true;
    } catch (e2) {
      console.error('Both localStorage and IndexedDB save failed:', e2);
      return false;
    }
  }
}

async function loadImagesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        images = parsed;
        console.log('Loaded images from localStorage (count:', parsed.length, ')');
        return;
      }
    }
  } catch (e) { console.warn('Could not parse localStorage data:', e); }

  try {
    const idbImgs = await idbLoadImages();
    if (Array.isArray(idbImgs)) {
      images = idbImgs;
      console.log('Loaded images from IndexedDB (count:', images.length, ')');
      return;
    }
  } catch (e) { console.warn('idbLoadImages failed:', e); }

  images = [];
  console.log('No saved images found.');
}

/* ---------------- image compress/upload helpers (same as before) ---------------- */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => resolve(e.target.result);
    fr.onerror = (e) => reject(e);
    fr.readAsDataURL(file);
  });
}

async function resizeImageFile(file, maxDim = 1200, quality = 0.78) {
  const dataUrl = await readFileAsDataURL(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [w, h] = [img.width, img.height];
      let targetW = w, targetH = h;
      if (Math.max(w, h) > maxDim) {
        if (w > h) {
          targetW = maxDim;
          targetH = Math.round(h * (maxDim / w));
        } else {
          targetH = maxDim;
          targetW = Math.round(w * (maxDim / h));
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => { console.warn('Image load failed for resizing; using raw data URL.'); resolve(dataUrl); };
    img.src = dataUrl;
  });
}

function dataURLToBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

async function uploadToCloudinary(fileOrBlob, filename = 'upload.jpg') {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error('Cloudinary not configured.');
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
  const fd = new FormData();
  fd.append('file', fileOrBlob, filename);
  fd.append('upload_preset', UPLOAD_PRESET);
  const resp = await fetch(endpoint, { method: 'POST', body: fd });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Cloudinary upload failed: ' + resp.status + ' ' + text);
  }
  const data = await resp.json();
  return { url: data.secure_url || data.url, raw: data };
}

/* ---------------- UI: thumbnails & image display ---------------- */
function updateThumbnails() {
  if (!thumbnails) return;
  thumbnails.innerHTML = '';
  images.forEach((dataUrl, idx) => {
    const btn = document.createElement('button');
    btn.className = 'thumb-btn';
    btn.title = `Image ${idx + 1}`;
    btn.dataset.index = idx;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = `thumb-${idx}`;
    img.className = 'thumb-img';

    btn.appendChild(img);
    if (idx === currentIndex) btn.classList.add('active-thumb');

    btn.addEventListener('click', () => {
      currentIndex = idx;
      showImage(currentIndex);
    });

    thumbnails.appendChild(btn);
  });
}

function showImage(index) {
  if (!memoryImage) return;
  if (images.length === 0) {
    memoryImage.src = '';
    memoryImage.alt = 'No images uploaded yet';
    if (imageIndex) imageIndex.textContent = 'No images';
    updateThumbnails();
    return;
  }
  currentIndex = ((index % images.length) + images.length) % images.length;
  memoryImage.src = images[currentIndex];
  memoryImage.alt = `Memory ${currentIndex + 1}`;
  if (imageIndex) imageIndex.textContent = `${currentIndex + 1} / ${images.length}`;
  updateThumbnails();
}

/* ---------------- Navigation buttons ---------------- */
if (prevBtn) prevBtn.addEventListener('click', () => {
  if (images.length > 0) { currentIndex = (currentIndex - 1 + images.length) % images.length; showImage(currentIndex); }
});
if (nextBtn) nextBtn.addEventListener('click', () => {
  if (images.length > 0) { currentIndex = (currentIndex + 1) % images.length; showImage(currentIndex); }
});
if (goToCakeBtn) goToCakeBtn.addEventListener('click', () => { window.location.href = 'cake.html'; });

/* ---------------- Upload handler (unchanged) ---------------- */
if (uploadInput) {
  uploadInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      let compressedDataUrl;
      try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } 
      catch (err) { console.warn('Compression failed, reading original', err); compressedDataUrl = await readFileAsDataURL(file); }
      const blob = dataURLToBlob(compressedDataUrl);

      // Try Cloudinary upload
      let publicUrl = null;
      try {
        const res = await uploadToCloudinary(blob, file.name.replace(/\s+/g, '_'));
        publicUrl = res.url;
        console.log('Uploaded to Cloudinary:', publicUrl);
      } catch (uploadErr) {
        console.warn('Cloudinary upload failed, falling back to local data URL', uploadErr);
        publicUrl = null;
      }
      if (publicUrl) images.push(publicUrl);
      else images.push(compressedDataUrl);
    }

    const ok = await saveImagesToStorage();
    if (!ok) alert('Saving image list failed (storage full or blocked). Uploaded images may still exist on Cloudinary.');
    currentIndex = images.length - 1;
    showImage(currentIndex);
    uploadInput.value = '';
  });
}

/* ---------------- Change / Delete / Clear (unchanged) ---------------- */
if (changeBtn) {
  changeBtn.addEventListener('click', () => {
    if (images.length === 0) { alert('No images to change. Please add an image first.'); return; }
    if (changeInput) changeInput.click();
  });
}
if (changeInput) {
  changeInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return; if (!file.type.startsWith('image/')) { alert('Please select an image file.'); changeInput.value = ''; return; }
    let compressedDataUrl;
    try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } catch (err) { compressedDataUrl = await readFileAsDataURL(file); }
    const blob = dataURLToBlob(compressedDataUrl);
    try {
      const res = await uploadToCloudinary(blob, file.name.replace(/\s+/g, '_'));
      images[currentIndex] = res.url;
      console.log('Replaced image uploaded to Cloudinary:', res.url);
    } catch (err) {
      console.warn('Cloudinary change upload failed, using local dataURL fallback', err);
      images[currentIndex] = compressedDataUrl;
    }
    const ok = await saveImagesToStorage();
    if (!ok) alert('Saving updated image list failed (storage issue).');
    showImage(currentIndex);
    changeInput.value = '';
  });
}
if (deleteBtn) deleteBtn.addEventListener('click', async () => {
  if (images.length === 0) { alert('No images to delete.'); return; }
  const yes = confirm('Delete the current image? This cannot be undone.'); if (!yes) return;
  images.splice(currentIndex, 1);
  if (currentIndex >= images.length) currentIndex = images.length - 1;
  const ok = await saveImagesToStorage();
  if (!ok) alert('Update failed when deleting image (storage issue).');
  showImage(currentIndex);
});
if (clearAllBtn) clearAllBtn.addEventListener('click', async () => {
  if (images.length === 0) { alert('Nothing to clear.'); return; }
  const yes = confirm('Clear all saved images from this browser?'); if (!yes) return;
  images = []; currentIndex = 0;
  const ok = await saveImagesToStorage();
  if (!ok) alert('Failed to clear storage.');
  showImage(currentIndex);
});

/* ---------------- Share / Export / Import functions ---------------- */

/* Build newline-separated list of URLs (prefer remote URLs if present) */
function getShareableUrls() {
  // images[] may contain Cloudinary URLs or local dataURLs; include both.
  return images.map((u, i) => u).join('\n');
}

/* Show share modal with URLs */
if (shareBtn && shareModal && shareTextarea) {
  shareBtn.addEventListener('click', () => {
    shareTextarea.value = getShareableUrls();
    shareModal.style.display = 'flex';
    shareModal.setAttribute('aria-hidden', 'false');
    shareTextarea.focus();
    shareTextarea.select();
  });
  closeShareBtn.addEventListener('click', () => {
    shareModal.style.display = 'none';
    shareModal.setAttribute('aria-hidden', 'true');
  });
  // copy to clipboard
  copyUrlsBtn.addEventListener('click', async () => {
    const txt = shareTextarea.value;
    try {
      await navigator.clipboard.writeText(txt);
      copyUrlsBtn.textContent = '✅ Copied';
      setTimeout(() => (copyUrlsBtn.textContent = '📋 Copy URLs'), 1500);
    } catch (e) {
      alert('Copy failed — please select and copy manually.');
    }
  });
}

/* Download JSON file of images array */
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    const payload = { createdAt: Date.now(), images };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'memories_gallery.json'; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  });
}

/* Import JSON file (expects { images: [...] } or plain array) */
if (importInput) {
  importInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        let imported = null;
        if (Array.isArray(parsed)) imported = parsed;
        else if (parsed && Array.isArray(parsed.images)) imported = parsed.images;
        else if (parsed && Array.isArray(parsed.data)) imported = parsed.data;
        if (!Array.isArray(imported)) throw new Error('Invalid JSON format. Expected { images: [...] } or an array.');
        // merge but avoid duplicates (simple)
        const set = new Set(images);
        for (const u of imported) if (!set.has(u)) { images.push(u); set.add(u); }
        await saveImagesToStorage();
        showImage(images.length ? images.length - 1 : 0);
        alert('Imported ' + imported.length + ' images (duplicates ignored).');
      } catch (err) {
        alert('Import failed: ' + err.message);
      } finally {
        importInput.value = '';
      }
    };
    reader.onerror = () => { alert('Failed to read file.'); importInput.value = ''; };
    reader.readAsText(f);
  });
}

/* Load gallery JSON from a public URL (CORS must allow it) */
if (loadUrlBtn && loadUrlInput) {
  loadUrlBtn.addEventListener('click', async () => {
    const url = loadUrlInput.value.trim();
    if (!url) { alert('Enter a URL to load'); return; }
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Fetch failed: ' + resp.status);
      const parsed = await resp.json();
      let imported = null;
      if (Array.isArray(parsed)) imported = parsed;
      else if (parsed && Array.isArray(parsed.images)) imported = parsed.images;
      else if (parsed && Array.isArray(parsed.data)) imported = parsed.data;
      if (!Array.isArray(imported)) throw new Error('Invalid JSON from URL');
      const set = new Set(images);
      for (const u of imported) if (!set.has(u)) { images.push(u); set.add(u); }
      await saveImagesToStorage();
      showImage(images.length ? images.length - 1 : 0);
      alert('Loaded ' + imported.length + ' images from URL (duplicates ignored).');
    } catch (err) {
      alert('Load failed: ' + err.message);
    }
  });
}

/* ---------------- Init ---------------- */
async function init() {
  await loadImagesFromStorage();
  if (images.length === 0) { memoryImage.src = ''; if (imageIndex) imageIndex.textContent = 'No images'; }
  else showImage(0);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevBtn && prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn && nextBtn.click();
  });

  // hide modal when clicking outside content
  window.addEventListener('click', (ev) => {
    if (ev.target === shareModal) { shareModal.style.display = 'none'; shareModal.setAttribute('aria-hidden', 'true'); }
  });
}

init();



