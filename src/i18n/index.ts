/**
 * NODEZZLE — локализация.
 *
 * Основная (и единственная на MVP-этапе) локаль — ru-RU.
 * Архитектура i18n:
 *  - все пользовательские строки UI — через i18n-ключи (не хардкод);
 *  - названия/описания блоков и портов — ключи `blocks.*` и `blocks.ports.*`;
 *  - добавление языка = новая папка `src/i18n/locales/<lang>.json`.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
  },
  lng: 'ru',
  fallbackLng: 'ru',
  interpolation: {
    // React уже экранирует вывод.
    escapeValue: false,
  },
});

export default i18n;
