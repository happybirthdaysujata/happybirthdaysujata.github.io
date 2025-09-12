// memory.js (updated)
// - Resizes/compresses images before saving (reduces size)
// - Saves to localStorage; if that fails falls back to IndexedDB
// - Loads from either localStorage or IndexedDB at init
// - Retains add / change / delete / thumbnails behavior

const STORAGE_KEY = 'memories_images_v1';
const IDB_DB = 'memories-db';
const IDB_STORE = 'images-store';

let images = []; // array of data URLs
let currentIndex = 0;

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

// ------------------ IndexedDB helpers ------------------
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

// ------------------ localStorage helpers (with fallback) ------------------
async function saveImagesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    console.log('Saved images to localStorage (count:', images.length, ')');
    return true;
  } catch (e) {
    console.warn('localStorage.setItem failed:', e);
    // try IndexedDB fallback
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
  // 1) try localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        console.log('Loaded images from localStorage (count:', parsed.length, ')');
        images = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('Could not parse localStorage data:', e);
  }

  // 2) fallback to IndexedDB
  try {
    const idbImgs = await idbLoadImages();
    if (Array.isArray(idbImgs)) {
      images = idbImgs;
      console.log('Loaded images from IndexedDB (count:', images.length, ')');
      return;
    }
  } catch (e) {
    console.warn('idbLoadImages failed:', e);
  }

  // nothing found
  images = [];
  console.log('No saved images found.');
}

// ------------------ image resize/compress ------------------
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => resolve(e.target.result);
    fr.onerror = (e) => reject(e);
    fr.readAsDataURL(file);
  });
}

async function resizeImageFile(file, maxDim = 1200, quality = 0.78) {
  // read as data URL first
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
      // white background in case of JPEG conversion (keeps visuals)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // convert to jpeg for much smaller size; transparency lost but usually okay for photos
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      // if image fails to load, fallback to raw dataUrl
      console.warn('Failed to load image for resizing; using original data URL.');
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

// ------------------ UI & helpers ------------------
function updateThumbnails() {
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
  if (images.length === 0) {
    memoryImage.src = '';
    memoryImage.alt = 'No images uploaded yet';
    imageIndex.textContent = 'No images';
    updateThumbnails();
    return;
  }
  currentIndex = ((index % images.length) + images.length) % images.length;
  memoryImage.src = images[currentIndex];
  memoryImage.alt = `Memory ${currentIndex + 1}`;
  imageIndex.textContent = `${currentIndex + 1} / ${images.length}`;
  updateThumbnails();
}

// ---------- Navigation ----------
prevBtn.addEventListener('click', () => {
  if (images.length > 0) {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    showImage(currentIndex);
  }
});

nextBtn.addEventListener('click', () => {
  if (images.length > 0) {
    currentIndex = (currentIndex + 1) % images.length;
    showImage(currentIndex);
  }
});

goToCakeBtn.addEventListener('click', () => {
  window.location.href = 'cake.html';
});

// ---------- Upload (add) ----------
uploadInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const compressed = await resizeImageFile(file, 1200, 0.78);
      images.push(compressed);
    } catch (err) {
      console.warn('Error compressing file, using original:', err);
      const raw = await readFileAsDataURL(file);
      images.push(raw);
    }
  }

  const ok = await saveImagesToStorage();
  if (!ok) alert('Saving images failed (storage full or blocked). Try removing some images or use a browser that allows storage.');
  currentIndex = images.length - 1;
  showImage(currentIndex);
  uploadInput.value = '';
});

// ---------- Change (replace current) ----------
changeBtn.addEventListener('click', () => {
  if (images.length === 0) {
    alert('No images to change. Please add an image first.');
    return;
  }
  changeInput.click();
});

changeInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    changeInput.value = '';
    return;
  }
  try {
    const compressed = await resizeImageFile(file, 1200, 0.78);
    images[currentIndex] = compressed;
    const ok = await saveImagesToStorage();
    if (!ok) alert('Saving updated image failed (storage full or blocked).');
    showImage(currentIndex);
  } catch (err) {
    console.warn('Failed to replace image:', err);
  } finally {
    changeInput.value = '';
  }
});

// ---------- Delete ----------
deleteBtn.addEventListener('click', async () => {
  if (images.length === 0) {
    alert('No images to delete.');
    return;
  }
  const yes = confirm('Delete the current image? This cannot be undone.');
  if (!yes) return;

  images.splice(currentIndex, 1);
  if (currentIndex >= images.length) currentIndex = images.length - 1;
  const ok = await saveImagesToStorage();
  if (!ok) alert('Update failed when deleting image (storage issue).');
  showImage(currentIndex);
});

// ---------- Clear All ----------
clearAllBtn.addEventListener('click', async () => {
  if (images.length === 0) {
    alert('Nothing to clear.');
    return;
  }
  const yes = confirm('Clear all saved images from this browser?');
  if (!yes) return;
  images = [];
  currentIndex = 0;
  const ok = await saveImagesToStorage();
  if (!ok) alert('Failed to clear storage.');
  showImage(currentIndex);
});

// ---------- Init ----------
async function init() {
  await loadImagesFromStorage();
  if (images.length === 0) {
    memoryImage.src = '';
    imageIndex.textContent = 'No images';
  } else {
    showImage(0);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn.click();
  });
}

init();



