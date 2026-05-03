import { getBrowserWindow } from '../legacy/legacyApi.js';
import { getConsultantToolsTabForPage, normalizePage } from '../modules/moduleConfig.js';
import { UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

let navigationHandler = null;

function notifyConsultantToolsTab(tab) {
  const browserWindow = getBrowserWindow();
  if (!browserWindow || !tab) return;

  browserWindow.dispatchEvent(new browserWindow.CustomEvent('sc:consultant-tools-tab', {
    detail: { tab }
  }));
}

export function setNavigationHandler(handler) {
  navigationHandler = typeof handler === 'function' ? handler : null;
}

export function navigateToPage(page) {
  if (!page) return;

  if (navigationHandler) {
    const consultantToolsTab = getConsultantToolsTabForPage(page);
    if (consultantToolsTab) {
      writeText(UI_STORAGE_KEYS.consultantToolsTab, consultantToolsTab);
      notifyConsultantToolsTab(consultantToolsTab);
    }
    navigationHandler(page);
    return;
  }

  const consultantToolsTab = getConsultantToolsTabForPage(page);
  if (consultantToolsTab) {
    writeText(UI_STORAGE_KEYS.consultantToolsTab, consultantToolsTab);
  }
  writeText(UI_STORAGE_KEYS.page, normalizePage(page));
  getBrowserWindow()?.location?.reload();
}
