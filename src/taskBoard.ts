'use strict';

import * as vscode from 'vscode';

export type TaskStatus = 'blocked' | 'inProgress' | 'waiting' | 'todo' | 'done';

interface StatusMeta {
    label: string;
    icon: string;
    color?: string;
    priority: number;
}

// Order of `priority` decides row order (blocked first, done last).
const STATUS: Record<TaskStatus, StatusMeta> = {
    blocked:    { label: 'Blocked',        icon: 'error',          color: 'charts.red',    priority: 0 },
    inProgress: { label: 'In Progress',    icon: 'play',           color: 'charts.yellow', priority: 1 },
    waiting:    { label: 'Waiting/Review',  icon: 'watch',          color: 'charts.blue',   priority: 2 },
    todo:       { label: 'Todo',            icon: 'circle-outline',                         priority: 3 },
    done:       { label: 'Done',            icon: 'pass-filled',    color: 'charts.green',  priority: 4 },
};

const STORE_KEY = 'COMMAND_RUNNER_TASKS';

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
        public readonly open: boolean,
        active: boolean,
    ) {
        // Bold the whole label for the active terminal's task.
        super(active ? { label: name, highlights: [[0, name.length]] } : name);
        const meta = STATUS[status];
        this.description = open ? meta.label : `${meta.label} · closed`;
        this.tooltip = `${name} — ${meta.label}${open ? '' : ' (terminal closed)'}`;
        this.iconPath = new vscode.ThemeIcon(meta.icon, meta.color ? new vscode.ThemeColor(meta.color) : undefined);
        this.contextValue = open ? 'task-open' : 'task-closed';
        this.command = { command: 'command-runner.task.focus', title: 'Focus Terminal', arguments: [this] };
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
        const activeName = vscode.window.activeTerminal?.name;

        // Rows = every live terminal (unmarked -> todo) plus saved tasks whose terminal is closed.
        const names = new Set<string>([...liveNames, ...Object.keys(saved)]);
        const items = [...names].map(name =>
            new TaskItem(name, saved[name] ?? 'todo', liveNames.has(name), name === activeName)
        );

        items.sort((a, b) =>
            STATUS[a.status].priority - STATUS[b.status].priority || a.name.localeCompare(b.name)
        );
        return items;
    }
}
