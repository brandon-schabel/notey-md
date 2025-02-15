import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { MarkdownPlugin,  } from "../../src/plugin-system";
import { usePlugin, getPlugins } from "../../src/plugin-system";
import type { DocumentNode } from "../../src/ast";

// TODO: Implement plugin system tests
// describe("Plugin System", () => {
//   beforeEach(() => {
//     // Clear plugins before each test.  getPlugins() returns a copy, so we need to clear the original.
//     while (getPlugins().length > 0) {
//       getPlugins().pop();
//     }
//   });

//   test("registers a plugin", () => {
//     const plugin: MarkdownPlugin = {};
//     usePlugin(plugin);
//     expect(getPlugins().length).toBe(1);
//     expect(getPlugins()[0].plugin).toBe(plugin);
//   });

//   test("calls onLoad when registering", () => {
//     const onLoad = mock(() => {});
//     const plugin: MarkdownPlugin = { onLoad };
//     usePlugin(plugin);
//     expect(onLoad).toHaveBeenCalledTimes(1);
//   });

//   test("passes options to onLoad", () => {
//     const onLoad = mock(() => {});
//     const plugin: MarkdownPlugin = { onLoad };
//     const options = { foo: "bar" };
//     usePlugin(plugin, options);
//     expect(onLoad).toHaveBeenCalledWith(options);
//   });

//   test("getPlugins returns a copy", () => {
//     const plugin: MarkdownPlugin = {};
//     usePlugin(plugin);
//     const plugins1 = getPlugins();
//     const plugins2 = getPlugins();
//     expect(plugins1).not.toBe(plugins2); // Should be different arrays
//     expect(plugins1).toEqual(plugins2); // But with the same content
//   });

//   test("getPlugins returns plugins in priority order (ascending)", () => {
//     const plugin1: MarkdownPlugin = {};
//     const plugin2: MarkdownPlugin = {};
//     const plugin3: MarkdownPlugin = {};

//     usePlugin(plugin1, {}, 2);
//     usePlugin(plugin2, {}, 1);
//     usePlugin(plugin3, {}, 3);

//     const plugins = getPlugins();
//     expect(plugins[0].plugin).toBe(plugin2);
//     expect(plugins[1].plugin).toBe(plugin1);
//     expect(plugins[2].plugin).toBe(plugin3);
//   });

//   test("getPlugins returns plugins in registration order if priority is the same", () => {
//     const plugin1: MarkdownPlugin = {};
//     const plugin2: MarkdownPlugin = {};
//     const plugin3: MarkdownPlugin = {};

//     usePlugin(plugin1);
//     usePlugin(plugin2);
//     usePlugin(plugin3);

//     const plugins = getPlugins();
//     expect(plugins[0].plugin).toBe(plugin1);
//     expect(plugins[1].plugin).toBe(plugin2);
//     expect(plugins[2].plugin).toBe(plugin3);
//   });

//   test("handles undefined priority", () => {
//     const plugin1: MarkdownPlugin = {};
//     const plugin2: MarkdownPlugin = {};

//     usePlugin(plugin1, {}, undefined); // Explicitly undefined
//     usePlugin(plugin2, {}, 1);

//     const plugins = getPlugins();
//     expect(plugins[0].plugin).toBe(plugin1); // Undefined should be treated as 0
//     expect(plugins[1].plugin).toBe(plugin2);
//   });

//   test("calls other lifecycle methods", () => {
//     const onParseBlock = mock(() => {});
//     const onParseInline = mock(() => {});
//     const onTransform = mock(() => {});
//     const onRender = mock(() => "test");

//     const plugin: MarkdownPlugin = { onParseBlock, onParseInline, onTransform, onRender };
//     usePlugin(plugin);

//     const doc: DocumentNode = { type: 'document', children: [], refDefinitions: new Map()};

//     const registeredPlugins = getPlugins();
//     registeredPlugins[0].plugin.onParseBlock?.(doc);
//     expect(onParseBlock).toHaveBeenCalledTimes(1);
//     expect(onParseBlock).toHaveBeenCalledWith(doc);

//     registeredPlugins[0].plugin.onParseInline?.(doc);
//     expect(onParseInline).toHaveBeenCalledTimes(1);
//     expect(onParseInline).toHaveBeenCalledWith(doc);

//     registeredPlugins[0].plugin.onTransform?.(doc);
//     expect(onTransform).toHaveBeenCalledTimes(1);
//     expect(onTransform).toHaveBeenCalledWith(doc);

//     const renderedHtml = registeredPlugins[0].plugin.onRender?.("", doc);
//     expect(onRender).toHaveBeenCalledTimes(1);
//     expect(onRender).toHaveBeenCalledWith("", doc);
//     expect(renderedHtml).toBe("test");
//   });
// });
