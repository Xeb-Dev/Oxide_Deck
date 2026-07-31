/**
 * Converts an image file or Data URL into a compressed WebP Data URL.
 * @param input File object or string (Data URL / Image URL)
 * @param quality Quality factor between 0.1 and 1.0 (default: 0.85)
 * @param maxDimension Optional max width/height for automatic resizing (default: 1200px)
 */
export function convertToWebP(input: File | string, quality = 0.85, maxDimension = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const processImage = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get 2d canvas context for WebP conversion"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      try {
        const webpDataUrl = canvas.toDataURL("image/webp", quality);
        resolve(webpDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image for WebP conversion"));

    if (input instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
          if (img.complete) {
            processImage();
          } else {
            img.onload = processImage;
          }
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(input);
    } else {
      img.src = input;
      if (img.complete) {
        processImage();
      } else {
        img.onload = processImage;
      }
    }
  });
}
