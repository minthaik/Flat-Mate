export async function processProfilePhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const size = 150;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Cover fit: scale to fill 150x150 and crop center.
  const scale = Math.max(size / img.width, size / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, dx, dy, drawW, drawH);

  // Try AVIF first, fall back to WebP, then PNG.
  let out = canvas.toDataURL("image/avif", 0.75);
  if (!out || !out.startsWith("data:image/avif")) {
    out = canvas.toDataURL("image/webp", 0.8);
  }
  if (!out || !out.startsWith("data:image")) {
    out = canvas.toDataURL("image/png");
  }
  return out;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
