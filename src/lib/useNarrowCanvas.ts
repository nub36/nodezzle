/** Тот же порог, что у адаптивных стилей Canvas. Учитывает resize без перезагрузки. */
import { useEffect, useState } from 'react';
export function useNarrowCanvas() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return narrow;
}
