/** Небольшие интерфейсные пиктограммы; не заменяют типовые маркеры портов. */
export type CanvasIconName = 'telegram' | 'web' | 'empty' | 'library' | 'inspector' | 'canvas' | 'sections' | 'text' | 'number' | 'message' | 'convert';
const paths: Record<CanvasIconName, React.ReactNode> = {
  text: <><path d="M5 6h14M12 6v13M9 19h6M5 6v3M19 6v3" /></>,
  number: <><path d="m9 4-2 16M17 4l-2 16M4 9h16M3 15h16" /></>,
  message: <path d="M6 4h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 3V18a3 3 0 0 1-1-3V7a3 3 0 0 1 3-3Zm1 5h10M7 13h6" />,
  convert: <><path d="M4 7h15l-3-3m3 3-3 3M20 17H5l3-3m-3 3 3 3" /></>,
  telegram: <><path d="m21 3-7 18-4-7-7-4 18-7Z" /><path d="m10 14 5-5" /></>,
  web: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01M8 13h8M8 16h5" /></>,
  empty: <path d="M12 5v14M5 12h14" />,
  library: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><path d="M17.5 14v7M14 17.5h7" /></>,
  inspector: <><path d="M4 7h8m4 0h4M4 17h3m4 0h9" /><circle cx="14" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  canvas: <><path d="M9 3H5a2 2 0 0 0-2 2v4m12-6h4a2 2 0 0 1 2 2v4M3 15v4a2 2 0 0 0 2 2h4m12-6v4a2 2 0 0 1-2 2h-4" /><path d="m9 12 2 2 4-4" /></>,
  sections: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
};
export function CanvasIcon({ name }: { name: CanvasIconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
