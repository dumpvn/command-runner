'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type ClaudeState = 'running' | 'input' | 'idle';

// Written by the cr-claude-status.ps1 Claude hook, keyed by basename(session cwd).
const DIR = path.join(os.tmpdir(), 'cr-claude-status');

function isState(s: unknown): s is ClaudeState {
    return s === 'running' || s === 'input' || s === 'idle';
}

/** Watches the Claude hook status dir and exposes the live state per task key. */
export class ClaudeStatusWatcher {
    private map = new Map<string, ClaudeState>();
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChange = this._onDidChange.event;
    private watcher: vscode.FileSystemWatcher;

    constructor() {
        try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ }
        this.loadAll();
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(DIR), '*.json')
        );
        this.watcher.onDidCreate(uri => this.onFile(uri));
        this.watcher.onDidChange(uri => this.onFile(uri));
        this.watcher.onDidDelete(uri => this.onDelete(uri));
    }

    keys(): string[] {
        return [...this.map.keys()];
    }

    get(key: string): ClaudeState | undefined {
        return this.map.get(key);
    }

    dispose(): void {
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

    private onFile(uri: vscode.Uri): void {
        const state = this.read(uri.fsPath);
        if (state) {
            this.map.set(this.keyOf(uri), state);
            this._onDidChange.fire();
        }
    }

    private onDelete(uri: vscode.Uri): void {
        if (this.map.delete(this.keyOf(uri))) {
            this._onDidChange.fire();
        }
    }
}
