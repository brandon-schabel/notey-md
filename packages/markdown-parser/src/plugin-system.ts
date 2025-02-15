import type { DocumentNode } from "./ast";

export interface MarkdownPlugin {
    onLoad?(options?: Record<string, unknown>): void;
    onParseBlock?(doc: DocumentNode): void;
    onParseInline?(doc: DocumentNode): void;
    onTransform?(doc: DocumentNode): void;
    onRender?(html: string, doc: DocumentNode): string;
}

interface RegisteredPlugin {
    plugin: MarkdownPlugin;
    options?: Record<string, unknown>;
    priority?: number;
}

const plugins: RegisteredPlugin[] = [];

export function usePlugin(
    plugin: MarkdownPlugin,
    options?: Record<string, unknown>,
    priority?: number
): void {
    plugins.push({ plugin, options, priority });
    if (plugin.onLoad) {
        plugin.onLoad(options);
    }
}

export function getPlugins(): RegisteredPlugin[] {
    // If you need a stable priority-based order, sort here before returning
    const sorted = [...plugins].sort((a, b) => {
        const pa = a.priority || 0;
        const pb = b.priority || 0;
        return pa - pb;
    });
    return sorted;
}