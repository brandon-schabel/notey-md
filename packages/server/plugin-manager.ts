// packages/server/plugin-manager.ts
import type { DocumentNode } from "../../markdown-parser/src/ast";

/**
 * Backend plugin interface:
 * For server-side hooks, e.g. reading/writing notes,
 * or hooking into server lifecycle events.
 */
export interface BackendPlugin {
  name: string;
  priority?: number;
  onNoteLoad?(path: string, content: string): string;
  onNoteSave?(path: string, content: string): void;
}

/**
 * AST plugin interface:
 * Transform the Markdown AST after parsing,
 * before rendering to HTML.
 */
export interface MarkdownAstPlugin {
  name: string;
  priority?: number;
  transformAst?(doc: DocumentNode): DocumentNode | void;
}

/**
 * Renderer plugin interface:
 * Post-process or override final HTML output.
 */
export interface RendererPlugin {
  name: string;
  priority?: number;
  postRender?(html: string): string;
}

/**
 * Frontend plugin interface:
 * Runs purely in the browser (client-side).
 */
export interface FrontendPlugin {
  name: string;
  priority?: number;
  initClient?(): void;
}

/**
 * A union type for any plugin in the system.
 */
export type AnyPlugin =
  | BackendPlugin
  | MarkdownAstPlugin
  | RendererPlugin
  | FrontendPlugin;

/**
 * The PluginManager orchestrates registration of different plugin categories
 * and manages execution order by priority.
 */
export class PluginManager {
  private static instance: PluginManager | null = null;

  private backendPlugins: BackendPlugin[] = [];
  private astPlugins: MarkdownAstPlugin[] = [];
  private rendererPlugins: RendererPlugin[] = [];
  // Frontend plugins are relevant only in the client environment,
  // but we store them here for demonstration. On the server we typically ignore them.
  private frontendPlugins: FrontendPlugin[] = [];

  private constructor() {}

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Register any plugin: backend, AST, renderer, or frontend.
   * We detect which category (or multiple) it implements.
   */
  public registerPlugin(plugin: AnyPlugin): void {
    // Identify which hooks exist
    const hasBackendHooks =
      typeof (plugin as BackendPlugin).onNoteLoad === "function" ||
      typeof (plugin as BackendPlugin).onNoteSave === "function";
    const hasAstTransform = typeof (plugin as MarkdownAstPlugin).transformAst === "function";
    const hasRendererHook = typeof (plugin as RendererPlugin).postRender === "function";
    const hasFrontendHook = typeof (plugin as FrontendPlugin).initClient === "function";

    // Place the plugin into the appropriate arrays
    if (hasBackendHooks) {
      this.backendPlugins.push(plugin as BackendPlugin);
    }
    if (hasAstTransform) {
      this.astPlugins.push(plugin as MarkdownAstPlugin);
    }
    if (hasRendererHook) {
      this.rendererPlugins.push(plugin as RendererPlugin);
    }
    if (hasFrontendHook) {
      this.frontendPlugins.push(plugin as FrontendPlugin);
    }

    // Sort each category by priority
    this.backendPlugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    this.astPlugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    this.rendererPlugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    this.frontendPlugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  /** Get all backend plugins (for server usage). */
  public getBackendPlugins(): BackendPlugin[] {
    return this.backendPlugins;
  }

  /** Get all AST plugins. */
  public getAstPlugins(): MarkdownAstPlugin[] {
    return this.astPlugins;
  }

  /** Get all renderer plugins. */
  public getRendererPlugins(): RendererPlugin[] {
    return this.rendererPlugins;
  }

  /** Get all frontend plugins. (Used client-side) */
  public getFrontendPlugins(): FrontendPlugin[] {
    return this.frontendPlugins;
  }
}