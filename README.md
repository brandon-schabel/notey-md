# Bun Markdown Notes App

## Quickstart

Make sure you have bun installed.

start the server:

```typescript
bun dev
```

Then, open your browser and visit:  
[http://localhost:3001](http://localhost:3001)

---

## Table of Contents

1. [Introduction](#introduction)  
2. [Installation](#installation)  
3. [Usage Examples](#usage-examples)  
   - [Simple Example](#simple-example)  
   - [Advanced Example (Pluggable Logic)](#advanced-example-pluggable-logic)  
4. [API Documentation](#api-documentation)  
   - [Core Functions](#core-functions)  
   - [Types & Interfaces](#types--interfaces)  
5. [Performance Notes](#performance-notes)  
6. [Configuration & Customization](#configuration--customization)  
   - [Configuration Interface](#configuration-interface)  
   - [Plugin System](#plugin-system)  
7. [Testing](#testing)  
8. [Contributing](#contributing)  
9. [License](#license)  

---

## Introduction

**Bun Markdown Notes App** is a focused note-taking library built on the Bun runtime and TypeScript. It offers a simple yet powerful environment to create, edit, and search Markdown files with:

- **Type safety**  
- **High performance**  
- **Plug-and-play modularity**  
- **Minimal dependencies** (only Bun)

The project features a built-in server, a custom Markdown parser, and a lightweight plugin system.

---

## Installation

### Using Bun (Preferred)

```bash
bun add notey-md
```

### Using npm (Optional)

```bash
npm install notey-md
```

### Using Yarn (Optional)

```bash
yarn add notey-md
```

*(Adjust as needed based on your project setup.)*

---

## Usage Examples

### Simple Example

Create a file named `index.ts`:

```ts
import { startServer, defaultConfig } from "notey-md";

// Start the Bun server with default configuration:
await startServer(defaultConfig);

// Run with: bun run index.ts
// Visit: http://localhost:3001/notes/example.md to create or edit a note.
```

### Advanced Example (Pluggable Logic)

Register plugins to extend functionality:

```ts
import { startServer, defaultConfig, registerPlugin, type Plugin } from "notey-md";

const secretFooterPlugin: Plugin = {
  name: "SecretFooterPlugin",
  onNoteLoad(path, content) {
    if (path.endsWith("secret.md")) {
      return content + "\n\n*(Shh... this is a secret note!)*";
    }
    return content;
  }
};

async function main() {
  // Register your plugin(s)
  registerPlugin(secretFooterPlugin);

  // Start the server on a custom port and with a custom notes directory
  const customConfig = {
    ...defaultConfig,
    port: 4000,
    vaultPath: "./my-special-notes"
  };

  await startServer(customConfig);
}

main().catch((err) => {
  console.error("Server failed to start:", err);
});
```

Run the application with:

```bash
bun run index.ts
```

---

## API Documentation

### Core Functions

<details>
<summary><strong><code>startServer(config: AppConfig): Promise&lt;BunServer&gt;</code></strong></summary>

**Description:**  
Initializes and starts the Bun HTTP server using the provided configuration. It handles routes for serving the home page, note read/write operations, and search functionality.

**Parameters:**  

- `config` (`AppConfig`): Configuration object containing server port and vault directory.

**Returns:**  

- `Promise<BunServer>`: A promise that resolves with the server instance.

</details>

<details>
<summary><strong><code>readNoteFromDisk(notePath: string): Promise&lt;string&gt;</code></strong></summary>

**Description:**  
Reads a Markdown note from disk.

**Parameters:**  

- `notePath` (`string`): Absolute path to the note file.

**Returns:**  

- `Promise<string>`: The raw Markdown content.

</details>

<details>
<summary><strong><code>writeNoteToDisk(notePath: string, content: string): Promise&lt;void&gt;</code></strong></summary>

**Description:**  
Writes content to a note file, creating or updating it.

**Parameters:**  

- `notePath` (`string`): Absolute path to the target file.  
- `content` (`string`): Markdown content to be saved.

**Returns:**  

- `Promise<void>`

</details>

<details>
<summary><strong><code>parseMarkdown(markdownContent: string): MarkdownNode[]</code></strong></summary>

**Description:**  
Parses raw Markdown text into an AST (Abstract Syntax Tree). Supports headings, paragraphs, and code blocks.

**Parameters:**  

- `markdownContent` (`string`): The raw Markdown text.

**Returns:**  

- `MarkdownNode[]`: An array of AST nodes.

</details>

<details>
<summary><strong><code>renderMarkdownASTToHTML(ast: MarkdownNode[]): string</code></strong></summary>

**Description:**  
Converts the Markdown AST into an HTML string.

**Parameters:**  

- `ast` (`MarkdownNode[]`): The Markdown AST produced by `parseMarkdown`.

**Returns:**  

- `string`: The rendered HTML.

</details>

### Types & Interfaces

```ts
export interface AppConfig {
  port: number;        // Port to run the Bun server on (default: 3001)
  vaultPath: string;   // Directory path for storing Markdown notes (default: "./notes")
}

export interface MarkdownNode {
  type: string;        // e.g. "heading", "paragraph", "codeblock"
  level?: number;      // Used for headings (1-6)
  content?: string;    // Raw text content
  children?: MarkdownNode[];
}

export interface Plugin {
  name: string;
  onNoteLoad?: (path: string, content: string) => string;
  onNoteSave?: (path: string, content: string) => void;
}
```

---

## Performance Notes

- **Bun Advantages:**  
  The built-in Bun HTTP server and file I/O APIs provide high performance without external frameworks.

- **Minimal Dependencies:**  
  Custom Markdown parsing and rendering keep the bundle lightweight.

- **Efficient Search:**  
  An in-memory inverted index allows fast full-text searches across notes.

- **Autosave Mechanism:**  
  The UI autosaves changes automatically after a brief pause, reducing potential data loss.

---

## Configuration & Customization

### Configuration Interface

Customize the server using the `AppConfig` interface:

```ts
export interface AppConfig {
  port: number;        // e.g. 3001
  vaultPath: string;   // e.g. "./notes"
}
```

Override the default settings:

```ts
import { startServer, defaultConfig } from "notey-md";

const config = {
  ...defaultConfig,
  port: 8080,
  vaultPath: "./my-custom-notes"
};

await startServer(config);
```

### Plugin System

Plugins extend the core functionality with lifecycle hooks:

- **`onNoteLoad(path, content)`**: Modify or log note content when loaded.
- **`onNoteSave(path, content)`**: Trigger actions (e.g., logging) when a note is saved.

Example plugin:

```ts
import { registerPlugin } from "notey-md";

const loggerPlugin = {
  name: "LoggerPlugin",
  onNoteLoad(path, content) {
    console.log(`[LoggerPlugin] Note loaded: ${path}`);
    return content;
  },
  onNoteSave(path, content) {
    console.log(`[LoggerPlugin] Note saved: ${path}`);
  }
};

registerPlugin(loggerPlugin);
```

---

## Testing

The project uses **Bun’s built-in test runner**. Tests are written in TypeScript and are located in files ending with `.test.ts`.

### Running Tests

```bash
bun test
```

### Sample Test (Excerpt)

```ts
import { describe, test, expect } from "bun:test";
import { parseMarkdown } from "notey-md";

describe("Markdown Parser", () => {
  test("handles headings", () => {
    const input = "# Heading";
    const result = parseMarkdown(input);
    expect(result[0].type).toBe("heading");
    expect(result[0].level).toBe(1);
  });
});
```

No additional setup is required; Bun automatically discovers and runs test files.

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Code Style:**  
   Use modern TypeScript features (e.g., async/await, arrow functions, generics).

2. **Branching:**  
   Fork the repository, create a feature branch, and open a Pull Request.

3. **Testing:**  
   Add or update tests to cover new functionality.

4. **Documentation:**  
   Update this README or add new documentation as needed, especially if new plugin hooks or features are introduced.

---

## License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute it in both commercial and non-commercial projects. See the [LICENSE](./LICENSE) file for more details.
