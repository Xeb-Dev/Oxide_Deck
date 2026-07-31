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

/**
 * Crops a specific region from an image Data URL using 0..1000 normalized bounding box coordinates [ymin, xmin, ymax, xmax]
 * and returns the cropped WebP Data URL.
 */
export function cropWebPImage(
  imageDataUrl: string,
  box_2d: [number, number, number, number],
  quality = 0.90
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const imgWidth = img.width;
      const imgHeight = img.height;

      let [ymin, xmin, ymax, xmax] = box_2d;

      // Handle 0..100 percentage scale
      if (ymax <= 100 && xmax <= 100 && (ymax > 1 || xmax > 1)) {
        ymin *= 10;
        xmin *= 10;
        ymax *= 10;
        xmax *= 10;
      }

      // Convert 0..1000 normalized bounds to actual pixel values
      const cropY = Math.max(0, Math.floor((ymin / 1000) * imgHeight));
      const cropX = Math.max(0, Math.floor((xmin / 1000) * imgWidth));
      const cropH = Math.min(imgHeight - cropY, Math.ceil(((ymax - ymin) / 1000) * imgHeight));
      const cropW = Math.min(imgWidth - cropX, Math.ceil(((xmax - xmin) / 1000) * imgWidth));

      if (cropW <= 20 || cropH <= 20) {
        // Bounding box was invalid or full image requested -> return whole image
        resolve(convertToWebP(imageDataUrl, quality));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get 2d canvas context for cropping"));
        return;
      }

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      try {
        const webpDataUrl = canvas.toDataURL("image/webp", quality);
        resolve(webpDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = imageDataUrl;
  });
}
