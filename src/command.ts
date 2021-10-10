'use strict';

import * as vscode from 'vscode';
import replace from './replace';
import Accessor, { VariableScope } from './accessor';


// Utility Types https://www.typescriptlang.org/docs/handbook/utility-types.html
// & in a type position means intersection type. https://stackoverflow.com/a/38317664
// Intersection Types https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types
// https://code.visualstudio.com/api/references/vscode-api#TerminalOptions
export type TerminalOptions = Partial<vscode.TerminalOptions> & {
    autoFocus?: boolean;
    autoClear?: boolean;
    sorted?: string[];
};


function createTerminal(options: vscode.TerminalOptions) {
    const { window } = vscode;
    const { name } = options;

    if (name && typeof name === 'string') {
        return (
            window.terminals.find(term => term.name === name) ||
            window.createTerminal(options)
        );
    }

    return window.activeTerminal || window.createTerminal(options);
}

export default class Command {
    private context: vscode.ExtensionContext;
    private $files: string[] = [];
    private $accessor = new Accessor();

    public constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public get commands() {
        return this.$accessor.commands();
    }

    public addFile(file?: string) {
        file && this.$files.push(JSON.stringify(file));
    }

    public async resolve(cmd: string): Promise<string> {
        return cmd && replace(cmd, async str => {
            let [variable, args = ''] = str.split(':');

            variable = variable.trim();
            args = args.trim();

            switch (variable) {
                case 'config':
                    return args && this.$accessor.config(args) as string;
                case 'env':
                    return args && this.$accessor.env(args);
                case 'input':
                    return await this.$accessor.input(args) || args;
                case 'command':
                    args && vscode.commands.executeCommand(args);
                    return '';
                default:
                    return this.$accessor.variable(variable as VariableScope);
            }
        });
    }

    public async pick(options?: TerminalOptions) {
        const commands = this.$accessor.commands();
        const keys = Object.keys(commands);

        if (!keys.length) {
            return vscode.window.showWarningMessage('Command Runner Error: Please add commands to your settings');
        }

        const recent = this.context.workspaceState.get('COMMAND_RUNNER_RECENT', [] as string[]);

        if (recent && recent.length) {
            keys.unshift.apply(keys, recent.filter(key => {
                const idx = keys.indexOf(key);
                if (idx > -1) {
                    return keys.splice(idx, 1);
                }
            }));
        }

        try {
            const cmd = await vscode.window.showQuickPick(
                keys, { placeHolder: 'Type or select command to run' }
            );

            this.context.workspaceState.update('COMMAND_RUNNER_RECENT', [cmd, ...keys]);
            if (cmd) {
                await this.execute(commands[cmd], options);
            }
        } catch (err) {
            // do nothings;
        }
    }

    public async execute(cmd: string, options?: TerminalOptions) {
        const { autoClear, autoFocus, ...terminalOptions }: TerminalOptions = {
            ...this.$accessor.config('command-runner.terminal'),
            ...options,
            hideFromUser: false,
        };

        const terminal = createTerminal(terminalOptions);
        if (autoFocus && terminal !== vscode.window.activeTerminal) {
            terminal.show();
        }

        if (autoClear) {
            await vscode.commands.executeCommand('workbench.action.terminal.clear');
        }

        const command = cmd + ' ' + this.$files.join(' ');

        terminal.sendText(await this.resolve(command));
        console.log('--> Run Command:', command);
    }

    public async executeSelectText(options?: TerminalOptions) {
        await this.execute(this.$accessor.variable('selectedTextSection'), options);
    }
}
