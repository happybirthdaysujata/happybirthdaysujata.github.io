/* memory.js
   Minimal gallery: Add Image, Change Image (replace current), Clear All
   - Compresses/resizes images before saving
   - Uploads to Cloudinary unsigned preset if configured, otherwise stores dataURL locally
   - Persists images list in localStorage with IndexedDB fallback
   IMPORTANT: set CLOUD_NAME and UPLOAD_PRESET below
*/

const CLOUD_NAME = 'dpdvqfoyf';        // ← replace
const UPLOAD_PRESET = 'img_preset';     // ← replace

const STORAGE_KEY = 'memories_images_v1';
const IDB_DB = 'memories-db';
const IDB_STORE = 'images-store';

let images = []; // array of strings (dataURL or remote URL)
let currentIndex = 0;

/* --- DOM refs --- */
const memoryImage = document.getElementById('memoryImage');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const goToCakeBtn = document.getElementById('goToCakeBtn');

const uploadInput = document.getElementById('uploadInput');
const changeBtn = document.getElementById('changeBtn');
const changeInput = document.getElementById('changeInput');

const clearAllBtn = document.getElementById('clearAllBtn');

const thumbnails = document.getElementById('thumbnails');
const imageIndex = document.getElementById('imageIndex');

/* ---------------- IndexedDB helpers ---------------- */
function openIdb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB not supported'));
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
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

/* ---------------- Storage helpers ---------------- */
async function saveImagesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    // console.log('Saved images to localStorage (count:', images.length, ')');
    return true;
  } catch (e) {
    console.warn('localStorage.setItem failed:', e);
    try {
      await idbSaveImages(images);
      // console.log('Saved images to IndexedDB as fallback.');
      return true;
    } catch (e2) {
      console.error('Both localStorage and IndexedDB save failed:', e2);
      return false;
    }
  }
}

async function loadImagesFromStorage() {
  // try localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        images = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('Could not parse localStorage data:', e);
  }

  // fallback to IDB
  try {
    const idbImgs = await idbLoadImages();
    if (Array.isArray(idbImgs)) {
      images = idbImgs;
      return;
    }
  } catch (e) {
    console.warn('idbLoadImages failed:', e);
  }

  images = [];
}

/* ---------------- Image helpers (resize & convert) ---------------- */
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
        if (w > h) { targetW = maxDim; targetH = Math.round(h * (maxDim / w)); }
        else { targetH = maxDim; targetW = Math.round(w * (maxDim / h)); }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW; canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      console.warn('Image load failed for resizing; using raw data URL.');
      resolve(dataUrl);
    };
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

/* ---------------- Cloudinary upload (unsigned) ---------------- */
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

/* ---------------- UI: thumbnails & show image ---------------- */
function updateThumbnails() {
  if (!thumbnails) return;
  thumbnails.innerHTML = '';
  images.forEach((src, idx) => {
    const btn = document.createElement('button');
    btn.className = 'thumb-btn';
    btn.title = `Image ${idx + 1}`;
    btn.dataset.index = idx;

    const img = document.createElement('img');
    img.src = src;
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

/* ---------------- Upload (Add Images): compress -> Cloudinary -> save list ---------------- */
if (uploadInput) {
  uploadInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      let compressedDataUrl;
      try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } catch (err) { compressedDataUrl = await readFileAsDataURL(file); }
      const blob = dataURLToBlob(compressedDataUrl);

      // Try Cloudinary upload if configured, otherwise store dataURL
      let publicUrl = null;
      try {
        if (CLOUD_NAME && UPLOAD_PRESET) {
          const res = await uploadToCloudinary(blob, file.name.replace(/\s+/g, '_'));
          publicUrl = res.url;
        }
      } catch (uploadErr) {
        console.warn('Cloudinary upload failed — storing locally', uploadErr);
        publicUrl = null;
      }

      const urlToStore = publicUrl || compressedDataUrl;
      images.push(urlToStore);
    }

    const ok = await saveImagesToStorage();
    if (!ok) alert('Saving image list failed (storage full or blocked).');
    currentIndex = images.length - 1;
    showImage(currentIndex);
    uploadInput.value = '';
  });
}

/* ---------------- Change (replace current) ---------------- */
if (changeBtn) {
  changeBtn.addEventListener('click', () => {
    if (images.length === 0) { alert('No images to change. Please add an image first.'); return; }
    if (changeInput) changeInput.click();
  });
}

if (changeInput) {
  changeInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); changeInput.value = ''; return; }
    let compressedDataUrl;
    try { compressedDataUrl = await resizeImageFile(file, 1200, 0.78); } catch (err) { compressedDataUrl = await readFileAsDataURL(file); }
    const blob = dataURLToBlob(compressedDataUrl);

    let publicUrl = null;
    try {
      if (CLOUD_NAME && UPLOAD_PRESET) {
        const res = await uploadToCloudinary(blob, file.name.replace(/\s+/g, '_'));
        publicUrl = res.url;
      }
    } catch (err) {
      console.warn('Cloudinary change upload failed — using local dataURL', err);
      publicUrl = null;
    }

    const newUrl = publicUrl || compressedDataUrl;
    images[currentIndex] = newUrl;
    const ok = await saveImagesToStorage();
    if (!ok) alert('Saving updated image failed (storage issue).');
    showImage(currentIndex);
    changeInput.value = '';
  });
}

/* ---------------- Clear All ---------------- */
if (clearAllBtn) clearAllBtn.addEventListener('click', async () => {
  if (images.length === 0) { alert('Nothing to clear.'); return; }
  const yes = confirm('Clear all saved images from this browser? This will remove them from the gallery here.');
  if (!yes) return;
  images = [];
  currentIndex = 0;
  const ok = await saveImagesToStorage();
  if (!ok) alert('Failed to clear storage.');
  showImage(currentIndex);
});

/* ---------------- Init ---------------- */
async function init() {
  await loadImagesFromStorage();
  if (images.length === 0) {
    memoryImage.src = '';
    if (imageIndex) imageIndex.textContent = 'No images';
  } else {
    showImage(0);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevBtn && prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn && nextBtn.click();
  });
}

init();


