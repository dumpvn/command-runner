'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

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

const STORE_KEY = 'COMMAND_RUNNER_TASKS';

/** Task key for a file uri: basename without extension (abc.md -> "abc"). */
function keyOf(uri: vscode.Uri): string {
    return path.basename(uri.fsPath, path.extname(uri.fsPath));
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
    ) {
        // Bold the whole label for the active terminal's / active editor's task.
        super(active ? { label: name, highlights: [[0, name.length]] } : name);
        const open = hasTerminal || !!fileUri;
        const meta = STATUS[status];
        this.description = open ? meta.label : `${meta.label} · closed`;
        this.tooltip = `${name} — ${meta.label}${open ? '' : ' (closed)'}`;
        this.iconPath = new vscode.ThemeIcon(meta.icon, meta.color ? new vscode.ThemeColor(meta.color) : undefined);
        this.contextValue = open ? 'task-open' : 'task-closed';
        this.command = { command: 'command-runner.task.focus', title: 'Activate', arguments: [this] };
    }
}

export class TaskBoardProvider implements vscode.TreeDataProvider<TaskItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TaskItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private store: TaskStore) {}

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

        // Rows = union of live terminals, open file tabs, and saved (closed) tasks.
        const names = new Set<string>([...liveNames, ...files.keys(), ...Object.keys(saved)]);
        const items = [...names].map(name =>
            new TaskItem(
                name,
                saved[name] ?? 'todo',
                liveNames.has(name),
                files.get(name),
                name === activeTerminal || name === activeFileKey,
            )
        );

        items.sort((a, b) => a.name.localeCompare(b.name));
        return items;
    }
}
