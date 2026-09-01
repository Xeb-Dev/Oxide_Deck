import React from "react";
import { useResolvedMediaUrl } from "../services/mediaService";

interface FlashcardImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
}

export default function FlashcardImage({ src, alt = "Flashcard attachment", className, ...props }: FlashcardImageProps) {
  const resolvedSrc = useResolvedMediaUrl(src);

  if (!resolvedSrc) {
    return null;
  }

  return <img src={resolvedSrc} alt={alt} className={className} {...props} />;
}
