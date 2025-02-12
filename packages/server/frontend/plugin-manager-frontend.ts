// packages/server/frontend/plugin-manager-frontend.ts
/**
 * A simple front-end PluginManager for client-side plugins.
 * Typically, you'd bundle and serve this to the browser.
 */

export interface FrontendPlugin {
    name: string;
    priority?: number;
    initClient?(): void;
}

export class FrontendPluginManager {
    private static instance: FrontendPluginManager | null = null;
    private frontendPlugins: FrontendPlugin[] = [];

    private constructor() { }

    public static getInstance(): FrontendPluginManager {
        if (!FrontendPluginManager.instance) {
            FrontendPluginManager.instance = new FrontendPluginManager();
        }
        return FrontendPluginManager.instance;
    }

    public registerPlugin(plugin: FrontendPlugin) {
        this.frontendPlugins.push(plugin);
        this.frontendPlugins.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
    }

    public getFrontendPlugins(): FrontendPlugin[] {
        return this.frontendPlugins;
    }

    /**
     * Optional helper to initialize all front-end plugins at once.
     * For example, call in DOMContentLoaded or similar.
     */
    public initAll() {
        for (const plugin of this.frontendPlugins) {
            plugin.initClient?.();
        }
    }
}