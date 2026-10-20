import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ShownImage } from '../../../shared/newsApi';

function Lightbox({ images, index, onIndex, onClose }: { images: ShownImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const touchX = useRef<number | null>(null);
  const many = images.length > 1;
  const go = useCallback((step: number) => onIndex((index + step + images.length) % images.length), [index, images.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  const image = images[index];
  const control = 'absolute flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 safe-x"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start === null || !many) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <img
        src={image.url}
        alt={`Photo ${index + 1} of ${images.length}`}
        width={image.width}
        height={image.height}
        className="max-h-[90vh] max-w-[95vw] h-auto w-auto object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button type="button" aria-label="Close" className={`${control} right-3 top-3`} onClick={onClose}>
        <X size={20} />
      </button>
      {many && (
        <>
          <button type="button" aria-label="Previous photo" className={`${control} left-3 top-1/2 -translate-y-1/2`} onClick={(e) => (e.stopPropagation(), go(-1))}>
            <ChevronLeft size={22} />
          </button>
          <button type="button" aria-label="Next photo" className={`${control} right-3 top-1/2 -translate-y-1/2`} onClick={(e) => (e.stopPropagation(), go(1))}>
            <ChevronRight size={22} />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white safe-bottom">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </div>
  );
}

/** One photo at full width, or a grid of squares; a click opens the photos full screen. */
export function Gallery({ images }: { images: ShownImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const thumb = 'block overflow-hidden rounded-lg bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2';
  return (
    <>
      {images.length === 1 ? (
        <button type="button" className={`${thumb} w-full`} onClick={() => setOpen(0)} aria-label="Open the photo">
          <img src={images[0].url} alt="" width={images[0].width} height={images[0].height} className="h-auto max-h-[70vh] w-full object-cover" />
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((image, i) => (
            <button key={image.path} type="button" className={thumb} onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${images.length}`}>
              <img src={image.url} alt="" loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-[1.02]" />
            </button>
          ))}
        </div>
      )}
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
