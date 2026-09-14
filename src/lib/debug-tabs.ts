/** Общий контракт вкладок отладки для интерфейса, стора и чистого движка уроков. */
export const DEBUG_PANEL_TABS = ['simulator', 'chat', 'phone', 'web', 'ports', 'log', 'history'] as const;
export type DebugPanelTab = typeof DEBUG_PANEL_TABS[number];
