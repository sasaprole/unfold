import { TreeItemCollapsibleState, TreeItem, ThemeIcon } from 'vscode';
import { Frontmatter } from '../parser/FrontmatterSchema';

export class PlanNode extends TreeItem {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly level: number,
    public readonly status: string,
    public readonly filePath: string,
    public readonly parentPath: string,
    public readonly order: number,
    public readonly content: string,
    public readonly children: PlanNode[] = [],
    public readonly icon?: string
  ) {
    const isRoot = level === 1 && parentPath === '';
    const collapsibleState = isRoot
      ? TreeItemCollapsibleState.Expanded
      : children.length > 0 ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;

    super(title, collapsibleState);
    this.contextValue = `planNode-${status}`;
    this.tooltip = `${title} (${this.getLevelName()} - ${status})`;
    this.iconPath = this.getIcon();

    // Add description for root nodes to distinguish them
    if (isRoot) {
      this.description = 'Plan';
    }
  }

  private getLevelName(): string {
    const levelNames = ['Context', 'Workflow', 'Detail', 'Code'];
    return levelNames[this.level - 1] || `Level ${this.level}`;
  }

  private getIcon(): ThemeIcon {
    // Root nodes get a distinct icon
    const isRoot = this.level === 1 && this.parentPath === '';
    if (isRoot) {
      return new ThemeIcon('notebook');
    }

    // Use custom icon if provided (support VS Code codicon format or fa: prefix)
    if (this.icon) {
      const iconName = this.parseIconName(this.icon);
      return new ThemeIcon(iconName);
    }

    // Default level-based icons (up to 8 levels with defaults)
    const levelIcons = [
      'cube',           // Level 1: Context
      'git-branch',     // Level 2: Workflow
      'symbol-method',  // Level 3: Detail
      'code',           // Level 4: Code
      'symbol-file',    // Level 5: File
      'layers',         // Level 6: Layers
      'package',        // Level 7: Package
      'archive'         // Level 8: Archive
    ];
    return new ThemeIcon(levelIcons[this.level - 1] || 'file');
  }

  private parseIconName(icon: string): string {
    // Remove fa: prefix if present
    if (icon.startsWith('fa:')) {
      icon = icon.substring(3);
    }

    // Remove fa- prefix if present (FontAwesome naming)
    if (icon.startsWith('fa-')) {
      icon = icon.substring(3);
    }

    // Remove $( ) wrapper if present
    if (icon.startsWith('$(') && icon.endsWith(')')) {
      icon = icon.substring(2, icon.length - 1);
    }

    // Convert FontAwesome names to VS Code codicons
    return this.convertFaToCodicon(icon);
  }

  private convertFaToCodicon(faIcon: string): string {
    // Common FontAwesome to VS Code Codicon mappings
    const faToCodicon: Record<string, string> = {
      'fa-folder': 'folder',
      'fa-folder-open': 'folder-opened',
      'fa-file': 'file',
      'fa-file-code': 'file-code',
      'fa-file-text': 'file-text',
      'fa-check': 'pass',
      'fa-times': 'x',
      'fa-cog': 'settings-gear',
      'fa-cogs': 'settings-gear',
      'fa-wrench': 'wrench',
      'fa-hammer': 'hammer',
      'fa-code': 'code',
      'fa-terminal': 'terminal',
      'fa-database': 'database',
      'fa-server': 'server',
      'fa-cloud': 'cloud',
      'fa-globe': 'globe',
      'fa-link': 'link',
      'fa-arrow-right': 'arrow-right',
      'fa-arrow-left': 'arrow-left',
      'fa-arrow-up': 'arrow-up',
      'fa-arrow-down': 'arrow-down',
      'fa-plus': 'add',
      'fa-minus': 'remove',
      'fa-search': 'search',
      'fa-filter': 'filter',
      'fa-star': 'star-full',
      'fa-heart': 'heart-filled',
      'fa-bolt': 'zap',
      'fa-bug': 'bug',
      'fa-list': 'list-tree',
      'fa-th-list': 'list-flat',
      'fa-sitemap': 'graph',
      'fa-project-diagram': 'graph',
      'fa-cube': 'cube',
      'fa-cubes': 'packages',
      'fa-book': 'book',
      'fa-bookmark': 'bookmark',
      'fa-tag': 'tag',
      'fa-tags': 'tags',
      'fa-clock': 'clock',
      'fa-calendar': 'calendar',
      'fa-user': 'account',
      'fa-users': 'account',
      'fa-home': 'home',
      'fa-play': 'play',
      'fa-pause': 'debug-pause',
      'fa-stop': 'debug-stop',
      'fa-step-forward': 'debug-step-over',
      'fa-step-backward': 'debug-step-back',
      'fa-forward': 'debug-continue',
      'fa-backward': 'debug-previous',
      'fa-eye': 'eye',
      'fa-eye-slash': 'eye-closed',
      'fa-lock': 'lock',
      'fa-unlock': 'unlock',
      'fa-key': 'key',
      'fa-trash': 'trash',
      'fa-edit': 'edit',
      'fa-copy': 'copy',
      'fa-paste': 'clipboard',
      'fa-cut': 'cut',
      'fa-save': 'save',
      'fa-download': 'cloud-download',
      'fa-upload': 'cloud-upload',
      'fa-sync': 'sync',
      'fa-refresh': 'refresh',
      'fa-undo': 'discard',
      'fa-redo': 'redo',
      'fa-expand': 'expand-all',
      'fa-compress': 'collapse-all',
      'fa-ellipsis-h': 'ellipsis',
      'fa-ellipsis-v': 'ellipsis',
    };

    const codicon = faToCodicon[faIcon];
    if (codicon) {
      return codicon;
    }

    // Try to use the fa icon name directly as a codicon (many have similar names)
    const simpleName = faIcon.replace('fa-', '');
    return simpleName;
  }

  get statusIcon(): string {
    const statusIcons: Record<string, string> = {
      'not-started': '$(circle-large-outline)',
      'in-progress': '$(circle-large-filled)',
      'complete': '$(pass-filled)',
      'blocked': '$(error)',
    };
    return statusIcons[this.status] || '$(circle-large-outline)';
  }

  command = {
    command: 'unfold.openSection',
    title: 'Open Section',
    arguments: [this],
  };
}

export type PlanNodeData = Pick<PlanNode,
  'id' | 'title' | 'level' | 'status' | 'filePath' |
  'parentPath' | 'order' | 'content' | 'children' | 'icon'
>;
