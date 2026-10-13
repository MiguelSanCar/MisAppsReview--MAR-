import { useEffect, useRef, useState } from 'react';

const SIZE = 256;

/** Recorte circular: arrastra para encuadrar, deslizador para el zoom. Devuelve un JPEG 256×256. */
export function AvatarCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // desplazamiento del centro en px de canvas
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setError('No se pudo leer la imagen');
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scale = img ? (SIZE / Math.min(img.width, img.height)) * zoom : 1;

  const clamp = (p: { x: number; y: number }) => {
    if (!img) return p;
    const maxX = Math.max(0, (img.width * scale - SIZE) / 2);
    const maxY = Math.max(0, (img.height * scale - SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d')!;
    const p = clamp(pos);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, SIZE / 2 - w / 2 + p.x, SIZE / 2 - h / 2 + p.y, w, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom, pos]);

  return (
    <div className="cropper">
      {error && <p className="error-box">{error}</p>}
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        className="crop-canvas"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
        onPointerMove={(e) => { if (drag.current) setPos(clamp({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y })); }}
        onPointerUp={() => { drag.current = null; }}
        aria-label="Zona de recorte: arrastra para mover la imagen"
      />
      <label className="field">
        <span>Zoom</span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => { setZoom(Number(e.target.value)); setPos((p) => clamp(p)); }} />
      </label>
      <div className="row">
        <button className="btn ghost" type="button" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" type="button" disabled={!img} onClick={() => onDone(canvas.current!.toDataURL('image/jpeg', 0.85))}>Usar esta foto</button>
      </div>
      <p className="muted small">El recorte se muestra redondo en toda la app.</p>
    </div>
  );
}
