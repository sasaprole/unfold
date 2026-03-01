// Extension Host -> Webview
export type ExtensionToWebviewMessage =
  | { type: 'loadSection'; data: SectionData }
  | { type: 'themeChanged'; theme: 'dark' | 'light' | 'high-contrast' }
  | { type: 'error'; message: string };

// Webview -> Extension Host
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'navigateTo'; sectionId: string }
  | { type: 'openInEditor'; filePath: string }
  | { type: 'linkClicked'; href: string; basePath: string };

export interface SectionData {
  id: string;
  title: string;
  level: number;
  status: string;
  content: string;
  filePath: string;
  breadcrumb: BreadcrumbItem[];
  basePath: string;
}

export interface BreadcrumbItem {
  id: string;
  title: string;
  level: number;
}
