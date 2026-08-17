'use strict';

import * as vscode from 'vscode';

const STATE_KEY = 'COMMAND_RUNNER_SESSION';
const SAVE_DEBOUNCE_MS = 750;
const SNAPSHOT_INTERVAL_MS = 15000;
const RESTORE_DELAY_MS = 1500;

interface SavedTerminal {
    name: string;
    cwd?: string;
}

interface SavedState {
    files: string[];
    terminals: SavedTerminal[];
}

/** fsPaths of all open file-scheme text tabs, deduped, order preserved. */
function collectOpenFiles(): string[] {
    const files: string[] = [];
    const seen = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file') {
                const fsPath = tab.input.uri.fsPath;
                if (!seen.has(fsPath)) {
                    seen.add(fsPath);
                    files.push(fsPath);
                }
            }
        }
    }
    return files;
}

/** cwd from a terminal's creation options, if it exposes one. */
function terminalCwd(term: vscode.Terminal): string | undefined {
    const cwd = (term.creationOptions as vscode.TerminalOptions)?.cwd;
    if (!cwd) return undefined;
    return typeof cwd === 'string' ? cwd : cwd.fsPath;
}

function collectTerminals(): SavedTerminal[] {
    return vscode.window.terminals.map(term => {
        const saved: SavedTerminal = { name: term.name };
        const cwd = terminalCwd(term);
        if (cwd) saved.cwd = cwd;
        return saved;
    });
}

function currentState(): SavedState {
    return { files: collectOpenFiles(), terminals: collectTerminals() };
}

async function restore(context: vscode.ExtensionContext): Promise<void> {
    const state = context.workspaceState.get<SavedState>(STATE_KEY);
    if (!state) return;

    // Open saved files that aren't already open (native hot-exit may have restored some).
    for (const fsPath of state.files || []) {
        const uri = vscode.Uri.file(fsPath);
        const alreadyOpen = vscode.window.tabGroups.all.some(group =>
            group.tabs.some(tab =>
                tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === fsPath
            )
        );
        if (alreadyOpen) continue;
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
        } catch {
            // File may have moved/been deleted; skip it.
        }
    }

    // Recreate saved terminals whose names don't already exist.
    for (const saved of state.terminals || []) {
        if (vscode.window.terminals.some(t => t.name === saved.name)) continue;
        vscode.window.createTerminal({ name: saved.name, cwd: saved.cwd });
    }
}

export function setupSessionRestore(context: vscode.ExtensionContext): void {
    let lastSaved = '';
    let debounce: NodeJS.Timeout | undefined;

    const save = () => {
        const serialized = JSON.stringify(currentState());
        if (serialized === lastSaved) return;
        lastSaved = serialized;
        void context.workspaceState.update(STATE_KEY, JSON.parse(serialized));
    };

    const scheduleSave = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(save, SAVE_DEBOUNCE_MS);
    };

    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(scheduleSave),
        vscode.window.onDidOpenTerminal(scheduleSave),
        vscode.window.onDidCloseTerminal(scheduleSave),
    );

    // Safety net for terminal renames (no rename event exists) and anything the
    // event listeners miss. Only writes when the serialized state changed.
    const interval = setInterval(save, SNAPSHOT_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });

    // Let VSCode's native restore settle first, then fill the gaps.
    setTimeout(() => { void restore(context); }, RESTORE_DELAY_MS);
}
