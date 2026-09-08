'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type ClaudeState = 'running' | 'input';

// Written by the cr-claude-status.ps1 Claude hook, keyed by basename(session cwd).
const DIR = path.join(os.tmpdir(), 'cr-claude-status');
// Persisted row order (per workspace), so Move-to-Top/Bottom and activation order survive restart.
const ORDER_KEY = 'COMMAND_RUNNER_ORDER';

interface PersistedOrder {
    order: Record<string, number>;
    counter: number;
    bottomCounter: number;
}

function isState(s: unknown): s is ClaudeState {
    return s === 'running' || s === 'input';
}

/** Watches the Claude hook status dir and exposes the live state per task key. */
export class ClaudeStatusWatcher {
    private map = new Map<string, ClaudeState>();
    // Row order: a task's rank bumps to the newest value each time it enters `running`
    // (or via Move to Top/Bottom), and persists across restart via workspace state.
    private order = new Map<string, number>();
    private counter = 0;
    private bottomCounter = 0;
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;
    private watcher: vscode.FileSystemWatcher;
    private reconcileTimer: NodeJS.Timeout;

    constructor(private state?: vscode.Memento) {
        this.loadOrder();
        try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ }
        this.loadAll();
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(DIR), '*.json')
        );
        this.watcher.onDidCreate(uri => this.onFile(uri));
        this.watcher.onDidChange(uri => this.onFile(uri));
        this.watcher.onDidDelete(uri => this.onDelete(uri));
        // Safety net for missed/coalesced watcher events and partial-read races.
        this.reconcileTimer = setInterval(() => this.reconcile(), 1000);
    }

    keys(): string[] {
        return [...this.map.keys()];
    }

    get(key: string): ClaudeState | undefined {
        return this.map.get(key);
    }

    orderKeys(): string[] {
        return [...this.order.keys()];
    }

    rank(key: string): number | undefined {
        return this.order.get(key);
    }

    /** Bump a key to the newest activation rank (positive = top; used by Move to Top). */
    bump(key: string): void {
        this.order.set(key, ++this.counter);
        this.saveOrder();
        this._onDidChange.fire();
    }

    /** Sink a key below everything (negative rank; used by Move to Bottom). */
    sink(key: string): void {
        this.order.set(key, --this.bottomCounter);
        this.saveOrder();
        this._onDidChange.fire();
    }

    private loadOrder(): void {
        const saved = this.state?.get<PersistedOrder>(ORDER_KEY);
        if (!saved) return;
        this.order = new Map(Object.entries(saved.order ?? {}));
        this.counter = saved.counter ?? 0;
        this.bottomCounter = saved.bottomCounter ?? 0;
    }

    private saveOrder(): void {
        void this.state?.update(ORDER_KEY, {
            order: Object.fromEntries(this.order),
            counter: this.counter,
            bottomCounter: this.bottomCounter,
        } as PersistedOrder);
    }

    /** Clear the live status for a row: delete the status file for the key it maps to. */
    clearForName(name: string): void {
        let best: string | undefined;
        for (const key of this.map.keys()) {
            // key equals the row name, or is a prefix of it at a separator (web -> web-something).
            const boundary = name.length === key.length || !/[A-Za-z0-9]/.test(name[key.length]);
            if (name.startsWith(key) && boundary && (!best || key.length > best.length)) best = key;
        }
        if (!best) return;
        this.map.delete(best);
        this.order.delete(best);
        this.saveOrder();
        try { fs.rmSync(path.join(DIR, best + '.json'), { force: true }); } catch { /* ignore */ }
        this._onDidChange.fire();
    }

    dispose(): void {
        clearInterval(this.reconcileTimer);
        this.watcher.dispose();
        this._onDidChange.dispose();
    }

    private keyOf(uri: vscode.Uri): string {
        return path.basename(uri.fsPath, '.json');
    }

    private read(fsPath: string): ClaudeState | undefined {
        try {
            const status = JSON.parse(fs.readFileSync(fsPath, 'utf8')).status;
            return isState(status) ? status : undefined;
        } catch {
            return undefined;
        }
    }

    private loadAll(): void {
        let files: string[] = [];
        try { files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')); } catch { return; }
        for (const f of files) {
            const state = this.read(path.join(DIR, f));
            if (state) this.map.set(path.basename(f, '.json'), state);
        }
    }

    // Set a key's state; bump to the top on each fresh transition into running. Returns whether it changed.
    private apply(key: string, state: ClaudeState): boolean {
        const prev = this.map.get(key);
        if (prev === state) return false;
        this.map.set(key, state);
        if (state === 'running' && prev !== 'running') {
            this.order.set(key, ++this.counter);
            this.saveOrder();
        }
        return true;
    }

    private onFile(uri: vscode.Uri): void {
        const state = this.read(uri.fsPath);
        if (state && this.apply(this.keyOf(uri), state)) this._onDidChange.fire();
    }

    // Re-sync the map to what's on disk (catches missed watcher events and partial reads).
    private reconcile(): void {
        let files: string[];
        try { files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')); } catch { return; }
        const present = new Set<string>();
        let changed = false;
        for (const f of files) {
            const key = path.basename(f, '.json');
            present.add(key); // file exists (readable or mid-write); never drop it on a transient read failure
            const state = this.read(path.join(DIR, f));
            if (state && this.apply(key, state)) changed = true;
        }
        for (const key of [...this.map.keys()]) {
            if (!present.has(key) && this.map.delete(key)) changed = true;
        }
        if (changed) this._onDidChange.fire();
    }

    private onDelete(uri: vscode.Uri): void {
        if (this.map.delete(this.keyOf(uri))) {
            this._onDidChange.fire();
        }
    }
}
