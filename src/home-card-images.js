(() => {
  "use strict";

  const maxFileBytes = 10 * 1024 * 1024;
  const maxEncodedLength = 260000;
  const rasterTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

  const rasterSignatures = { png: "iVBORw0KGgo", jpeg: "/9j/", webp: "UklGR" };

  // Only raster data URLs created locally may be persisted or rendered as custom images.
  function isRasterDataURL(value, maxLength) {
    if (typeof value !== "string" || value.length > maxLength) return false;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) return false;
    return match[2].startsWith(rasterSignatures[match[1]]);
  }

  function isSafeImage(value) {
    return isRasterDataURL(value, maxEncodedLength);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reader.onabort = () => reject(new Error("图片无法读取，请重新选择图片。"));
      reader.readAsDataURL(file);
    });
  }

  function decode(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片无法读取，请更换有效的 PNG、JPG 或 WebP 图片。"));
      image.src = source;
    });
  }

  async function process(file, {aspectRatio = 2} = {}) {
    if (![2, 8 / 3].includes(aspectRatio)) throw new Error("图片裁切比例无效，请重新选择图片。");
    if (!file || !rasterTypes.has(file.type)) throw new Error("请选择 PNG、JPG 或 WebP 格式的图片。");
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxFileBytes) throw new Error("图片大小不能超过 10MB，请更换图片。");
    const source = await readFile(file);
    if (!isRasterDataURL(source, Math.ceil(maxFileBytes * 4 / 3) + 64)) {
      throw new Error("图片格式无效，请选择有效的 PNG、JPG 或 WebP 图片。");
    }
    const image = await decode(source);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0) || sourceWidth * sourceHeight > 40000000) {
      throw new Error("图片尺寸过大或无法处理，请更换较小的图片。");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片，请更换浏览器后重试。");
    const cropWidth = Math.min(sourceWidth, sourceHeight * aspectRatio);
    const cropHeight = cropWidth / aspectRatio;
    const initialWidth = Math.min(1200, Math.max(2, Math.floor(cropWidth / 2) * 2));
    try {
      for (const scale of [1, 0.8, 0.64, 0.5]) {
        canvas.width = Math.max(2, Math.floor(initialWidth * scale / 2) * 2);
        canvas.height = Math.max(1, Math.round(canvas.width / aspectRatio));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2,
          cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.88, 0.76, 0.64, 0.52, 0.4]) {
          const encoded = canvas.toDataURL("image/jpeg", quality);
          if (isSafeImage(encoded)) return encoded;
        }
      }
    } catch {
      throw new Error("图片处理失败，请更换图片后重试。");
    }
    throw new Error("图片压缩后仍过大，请更换内容较简单的图片。");
  }

  window.BaigeHomeCardImages = Object.freeze({ isSafeImage, process });
})();
