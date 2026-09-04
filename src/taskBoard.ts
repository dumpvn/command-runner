'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ClaudeState, ClaudeStatusWatcher } from './claudeStatus';

export type TaskStatus = 'blocked' | 'inProgress' | 'waiting' | 'todo' | 'done';

interface StatusMeta {
    label: string;
    icon: string;
    color?: string;
}

const STATUS: Record<TaskStatus, StatusMeta> = {
    blocked:    { label: 'Blocked',        icon: 'error',          color: 'charts.red'    },
    inProgress: { label: 'In Progress',    icon: 'play',           color: 'charts.yellow' },
    waiting:    { label: 'Waiting/Review',  icon: 'watch',          color: 'charts.blue'   },
    todo:       { label: 'Todo',            icon: 'circle-outline'                         },
    done:       { label: 'Done',            icon: 'pass-filled',    color: 'charts.green'  },
};

// Live Claude session state takes over the row's icon/text when present.
const CLAUDE_META: Record<ClaudeState, StatusMeta> = {
    running: { label: 'Running',           icon: 'loading~spin', color: 'charts.yellow' },
    input:   { label: 'Needs your input',  icon: 'bell',         color: 'charts.orange' },
};

const STORE_KEY = 'COMMAND_RUNNER_TASKS';

/** Task key for a file uri: basename without extension (abc.md -> "abc"). */
function keyOf(uri: vscode.Uri): string {
    return path.basename(uri.fsPath, path.extname(uri.fsPath));
}

/** True when `key` equals `name` or is a prefix of it ending at a non-alphanumeric boundary. */
function matchesPrefix(name: string, key: string): boolean {
    return name.startsWith(key) && (name.length === key.length || !/[A-Za-z0-9]/.test(name[key.length]));
}

/** Persists an explicit status per terminal name in workspace state. */
export class TaskStore {
    constructor(private state: vscode.Memento) {}

    all(): Record<string, TaskStatus> {
        return this.state.get<Record<string, TaskStatus>>(STORE_KEY, {});
    }

    set(name: string, status: TaskStatus): Thenable<void> {
        return this.state.update(STORE_KEY, { ...this.all(), [name]: status });
    }

    remove(name: string): Thenable<void> {
        const map = { ...this.all() };
        delete map[name];
        return this.state.update(STORE_KEY, map);
    }
}

export class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly status: TaskStatus,
        public readonly hasTerminal: boolean,
        public readonly fileUri: vscode.Uri | undefined,
        active: boolean,
        claude?: ClaudeState,
        public readonly activationRank?: number,
    ) {
        // Bold the whole label for the active terminal's / active editor's task.
        super(active ? { label: name, highlights: [[0, name.length]] } : name);
        const open = hasTerminal || !!fileUri || !!claude;
        // Live-first: a Claude session state takes over the icon/text; else the manual status.
        const meta = claude ? CLAUDE_META[claude] : STATUS[status];
        this.description = claude ? meta.label : (open ? meta.label : `${meta.label} · closed`);
        this.tooltip = claude ? `${name} — Claude: ${meta.label}` : `${name} — ${meta.label}${open ? '' : ' (closed)'}`;
        this.iconPath = new vscode.ThemeIcon(meta.icon, meta.color ? new vscode.ThemeColor(meta.color) : undefined);
        this.contextValue = open ? 'task-open' : 'task-closed';
        this.command = { command: 'command-runner.task.focus', title: 'Activate', arguments: [this] };
    }
}

export class TaskBoardProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: TaskStore, private claude?: ClaudeStatusWatcher) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskItem): TaskItem[] {
        if (element) return [];

        const saved = this.store.all();
        const liveNames = new Set(vscode.window.terminals.map(t => t.name));
        const activeTerminal = vscode.window.activeTerminal?.name;

        // First open file tab per basename (no extension) — the task key.
        const files = new Map<string, vscode.Uri>();
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
                    const key = keyOf(tab.input.uri);
                    if (key && !files.has(key)) files.set(key, tab.input.uri);
                }
            }
        }
        const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
        const activeFileKey = activeEditorUri && activeEditorUri.scheme === 'file' ? keyOf(activeEditorUri) : undefined;

        // Rows = live terminals + open file tabs + saved (closed) tasks.
        const baseNames = new Set<string>([...liveNames, ...files.keys(), ...Object.keys(saved)]);

        // A Claude session (keyed by cwd basename) merges into the row it exactly matches, else
        // the longest row whose name starts with the key at a separator (folder "DAD-1234" ->
        // file "DAD-1234-something"). Keys matching no row become their own bare row.
        const claudeKeys = this.claude?.keys() ?? [];
        const usedKeys = new Set<string>();
        // Longest prefix-matching key from a candidate list (folder "DAD-1234" -> row "DAD-1234-x").
        const bestKey = (name: string, candidates: string[]): string | undefined => {
            let best: string | undefined;
            for (const key of candidates) {
                if (matchesPrefix(name, key) && (!best || key.length > best.length)) best = key;
            }
            return best;
        };
        const claudeFor = (name: string): ClaudeState | undefined => {
            const key = this.claude && bestKey(name, claudeKeys);
            if (!key) return undefined;
            usedKeys.add(key);
            return this.claude!.get(key);
        };
        // Rank comes from the persisted activation order, so a task keeps its place after the run ends.
        const rankFor = (name: string): number | undefined => {
            if (!this.claude) return undefined;
            const key = bestKey(name, this.claude.orderKeys());
            return key ? this.claude.rank(key) : undefined;
        };

        const items = [...baseNames].map(name =>
            new TaskItem(
                name,
                saved[name] ?? 'todo',
                liveNames.has(name),
                files.get(name),
                name === activeTerminal || name === activeFileKey,
                claudeFor(name),
                rankFor(name),
            )
        );
        for (const key of claudeKeys) {
            if (usedKeys.has(key) || baseNames.has(key)) continue;
            items.push(new TaskItem(key, saved[key] ?? 'todo', false, undefined, false, this.claude?.get(key), this.claude?.rank(key)));
        }

        // Activated tasks first (most recent on top), then the rest by natural name order.
        items.sort((a, b) => {
            if (a.activationRank !== undefined && b.activationRank !== undefined) return b.activationRank - a.activationRank;
            if (a.activationRank !== undefined) return -1;
            if (b.activationRank !== undefined) return 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true });
        });
        return items;
    }
}
