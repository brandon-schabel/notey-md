// packages/markdown-parser/src/debug.ts
import type { DocumentNode } from "./ast";

export interface DebugSnapshot {
    stage: string;
    ast: DocumentNode;
    logs: string[];
    diff?: any;
}

let debugMode = false;
let debugLogs: string[] = [];
let debugSnapshots: DebugSnapshot[] = [];

export function setDebugMode(enabled: boolean) {
    debugMode = enabled;
}

export function isDebugMode(): boolean {
    return debugMode;
}

export function logDebug(message: string) {
    if (!debugMode) return;
    debugLogs.push(message);
}

export function getDebugSnapshots(): DebugSnapshot[] {
    return debugSnapshots;
}

export function resetDebugState() {
    debugMode = false;
    debugLogs = [];
    debugSnapshots = [];
}

function cloneAst(doc: DocumentNode): DocumentNode {
    return JSON.parse(JSON.stringify(doc));
}


// packages/markdown-parser/src/debug.ts (revised snippet)
function diffAst(a: DocumentNode, b: DocumentNode): any {
    // naive approach or any JSON diff library
    return null;
}

export function captureSnapshot(stage: string, doc: DocumentNode) {
    if (!debugMode) return;
    const cloned = cloneAst(doc);
    let diff: any;
    if (debugSnapshots.length > 0) {
        const prev = debugSnapshots[debugSnapshots.length - 1].ast;
        diff = diffAst(prev, cloned);
    }
    debugSnapshots.push({
        stage,
        ast: cloned,
        logs: [...debugLogs],
        diff
    });
    debugLogs = [];
}