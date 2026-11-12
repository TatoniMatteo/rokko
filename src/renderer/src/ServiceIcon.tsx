import { useEffect, useRef, useState } from 'react';

export function ServiceIcon({ name, url, icon }: { name: string; url: string; icon?: string | null }) {
  const element = useRef<HTMLSpanElement>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    setFailed(false); setFavicon(null);
    const observer = new IntersectionObserver(entries => {
      if (icon || !url || !entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void window.rokko.getServiceIcon(url).then(value => { if (mounted) setFavicon(value); }).catch(() => {});
    });
    if (!icon && url && element.current) observer.observe(element.current);
    return () => { mounted = false; observer.disconnect(); };
  }, [url, icon]);
  const source = icon || favicon;
  return <span ref={element} className="service-icon" aria-hidden="true">{source && !failed
    ? <img src={source} alt="" onError={() => setFailed(true)}/>
    : name.slice(0, 1).toUpperCase() || '+'}</span>;
}

export async function readCustomIcon(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG or WebP image up to 2 MB.');
  }
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = source;
  await image.decode();
  if (!image.width || !image.height || image.width * image.height > 16000000) throw new Error('Image dimensions are too large.');
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to read image.');
  const scale = Math.min(96 / image.width, 96 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (96 - width) / 2, (96 - height) / 2, width, height);
  return canvas.toDataURL('image/png');
}
