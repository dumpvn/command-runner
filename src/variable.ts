'use strict';


import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import cache from './cache';


export default () => cache({

    config() {
        const document = this.document();
        if (document) {
            return vscode.workspace.getConfiguration(undefined, document.uri);
        }
        return vscode.workspace.getConfiguration();
    },

    package() {
        const workspaceFolder = this.workspaceFolder();
        const packageFile = workspaceFolder ? path.join(workspaceFolder, 'package.json') : '';
        if (packageFile) {
            try {
                return JSON.parse(fs.readFileSync(packageFile, 'utf8')) as Record<string, unknown>;
            } catch (err) {
                // do nothing;
            }
        }
        return {} as Record<string, unknown>;
    },

    env() {
        const env = process.env;
        const map: Record<string, string> = Object.create(null);
        Object.keys(env).forEach(key => map[key.toUpperCase()] = env[key] || '');
        return map;
    },

    workspace() {
        return vscode.workspace;
    },

    window() {
        return vscode.window;
    },

    editor() {
        return this.window().activeTextEditor;
    },

    document() {
        return this.editor()?.document;
    },

    selections() {
        return this.editor()?.selections.sort(
            (sl1, sl2) => sl1.active.line > sl2.active.line ? 1 : -1
        );
    },

    file(): string {
        return this.document()?.uri.fsPath || '';
    },

    fileBasename(): string {
        return this.file() && path.basename(this.file());
    },

    fileBasenameNoExtension(): string {
        return this.file() && path.basename(this.file(), this.fileExtname());
    },

    fileDirname(): string {
        return this.file() && path.dirname(this.file());
    },

    fileExtname(): string {
        return this.file() && path.extname(this.file());
    },

    relativeFile(): string {
        return vscode.workspace.asRelativePath(this.file());
    },

    lineNumber(): string {
        const [sl] = this.selections() || [];

        if (sl) {
            return sl.active.line + 1 + '';
        }
        return '';
    },

    lineNumbers(): string {
        const selections = this.selections();

        if (selections && selections.length) {
            return selections.map(sl => sl.active.line + 1).join();
        }

        return '';
    },

    selectedPosition(): string {
        const [sl] = this.selections() || [];

        if (sl) {
            return [sl.active.line + 1, sl.active.character].join();
        }

        return '';
    },

    selectedPositionList(): string {
        const selections = this.selections();
        if (selections && selections.length) {
            return selections.map(sl => [sl.active.line + 1, sl.active.character].join(',')).join(' ');
        }
        return '';
    },

    selectedText(): string {
        const [sl] = this.selections() || [];

        if (sl && !sl.isEmpty) {
            return this.document()?.getText(sl) || '';
        }

        return '';
    },

    selectedTextList(): string {
        const document = this.document();
        const selections = this.selections();

        if (selections && selections.length && document) {
            return selections.map(sl => document.getText(sl)).join(' ');
        }

        return '';
    },

    selectedTextSection(): string {
        const document = this.document();
        const selections = this.selections();

        if (selections && selections.length && document) {
            return selections.map(sl => document.getText(sl)).join('\n').trim();
        }

        return '';
    },

    workspaceFolder(): string {
        const workspace = this.workspace();
        const document = this.document();
        const workspaceFolder = (
            document ?
            workspace.getWorkspaceFolder(document.uri) :
            workspace.workspaceFolders ?
            workspace.workspaceFolders[0] :
            undefined
        );

        return workspaceFolder ? workspaceFolder.uri.fsPath : '';
    },

    workspaceFolderBasename(): string {
        return this.workspaceFolder() && path.basename(this.workspaceFolder());
    },

    homedir(): string {
        return os.homedir();
    },

    tmpdir(): string {
        return os.tmpdir();
    },

    platform(): string {
        return os.platform();
    },

    commands(): Record<string, string> {
        return {
            ...this.config().get('command-runner.commands'),
            ...this.package()['commands'] as object,
        };
    },

    currentLineText(): string {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const {text} = activeEditor.document.lineAt(activeEditor.selection.active.line);
            return text;
        }
        return '';
    }
});

