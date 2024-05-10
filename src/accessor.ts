
'use strict';

import * as vscode from 'vscode';
import variable from './variable';


/*
start https://stackoverflow.com/questions/55377365/what-does-keyof-typeof-mean-in-typescript
*/
export const variableMap = {
    file: 1,
    fileBasename: 1,
    fileBasenameNoExtension: 1,
    fileDirname: 1,
    fileExtname: 1,
    lineNumber: 1,
    lineNumbers: 1,
    selectedText: 1,
    selectedTextList: 1,
    selectedTextSection: 1,
    selectedPosition: 1,
    selectedPositionList: 1,
    relativeFile: 1,
    workspaceFolder: 1,
    workspaceFolderBasename: 1,
    homedir: 1,
    tmpdir: 1,
    platform: 1,
    currentLineText: 1,
    uuid: 1,
    killme: 1,
    killme1: 1,
    killme2: 1,
};
export type VariableScope = keyof typeof variableMap;


export default class Accessor {
    private $variable = variable();

    env(scope: string): string {
        return this.$variable.env()[scope.toUpperCase()] || '';
    }

    config<T = unknown>(scope: string): T | undefined {
        return this.$variable.config().get(scope);
    }

    package<T = unknown>(scope: string): T | undefined {
        return this.$variable.package()[scope] as T;
    }

    variable(scope: VariableScope): string {
        return variableMap[scope] === 1 ? this.$variable[scope]() : '';
    }

    command(name: string): string {
        return this.$variable.commands()[name] || name;
    }

    commands(): Record<string, string> {
        return this.$variable.commands();
    }

    input(value: string): Thenable<string | undefined> {
        return vscode.window.showInputBox({ placeHolder: value && `default: "${value}"` });
    }
}
