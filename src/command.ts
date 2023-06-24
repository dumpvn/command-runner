'use strict';

import * as vscode from 'vscode';
import replace from './replace';
import Accessor, { VariableScope } from './accessor';


/* 
start https://www.typescriptlang.org/docs/handbook/utility-types.html # Utility Types 
start https://stackoverflow.com/a/38317664 # & in a type position means intersection type. 
start https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types # Intersection Types 
start https://code.visualstudio.com/api/references/vscode-api#TerminalOptions
*/
export type TerminalOptions = Partial<vscode.TerminalOptions> & {
    executeLineByLine?: boolean;
    replaceTemplate?: boolean;
    commandDelay?: number;
    autoScrollToBottom?: boolean;
    sendRawText?: boolean;
    autoFocus?: boolean;
    autoClear?: boolean;
    sorted?: string[];
};


/* create or activate current terminal window */
function createTerminal(options: vscode.TerminalOptions) {
    const { window } = vscode;
    const { name } = options;
    
    if (name && typeof name === 'string') {
        return (
            window.terminals.find(term => term.name === name) ||
            window.createTerminal(options)
        );
    }

    /* there are cases that the terminal is there, however, it is not active and winodw.activeTerminal is undefined 
    to avoid creating another terminal, the terminals array is checked and if there is 1 and only 1, we will use it
    */
    if (window.terminals.length === 1) {
        return window.terminals[0];
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

    // change the replace template to ${{xxx}} to make it work for variable in bash shell
    // e.g. BUCKET_ID=$(dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n')
    // echo ${BUCKET_ID} # should work for bash shell
    // echo ${{currentLineText}}
    public async resolve(cmd: string): Promise<string> {
        return cmd && replace(cmd, async str => {
            // env:xxx
            // config:yyy
            // input:zzz
            // command:blah blah blah
            let [variable, args = ''] = str.split(':'); 

            variable = variable.trim(); // 
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
        const { autoScrollToBottom, sendRawText, commandDelay, replaceTemplate, executeLineByLine, autoClear, autoFocus, ...terminalOptions }: TerminalOptions = {
            ...this.$accessor.config('command-runner.terminal'),
            ...options,
            hideFromUser: false,
        };

        const command = cmd + ' ' + this.$files.join(' ');
       
        function delay(ms: number) {
            return new Promise( resolve => setTimeout(resolve, ms) );
        }

        // send a block of code usually causing terminal issue
        let text = command;

        /* user can specify terminal name that he wants to run */
        const regexPattern = /# term (\w+)$/;
        const match = text.match(regexPattern);
        if (match) {
            terminalOptions.name = match[1];
        }
        const terminal = createTerminal(terminalOptions);
        if (autoFocus && terminal !== vscode.window.activeTerminal) {
            terminal.show();
        }

        if (autoClear) {
            await vscode.commands.executeCommand('workbench.action.terminal.clear');
        }


        // vscode user option to enable or disable
        if (replaceTemplate) {
            text = await this.resolve(command);
        }

        // vscode user option to enable or disable 
        // the selected block will be executed line by line
        if (executeLineByLine) {
            let texts = [];
            if (vscode.window.activeTextEditor?.document.eol === vscode.EndOfLine.LF) {
                texts = text.split("\n");
            } else {
                texts = text.split("\r\n");
            }

            for(var i in texts) { 
                terminal.sendText(texts[i], true); // send line by line
                await delay(commandDelay ?? 50);
            }
            terminal.sendText("", true); // final enter
        } else {
            // vscode terminal sendText
            // typescript string starts with #
            // typescript search and replace string regularexpression
            // var searchPattern = new RegExp('^\s*#+', 'i');
            // if (searchPattern.test(text)) {
            // }

            if (sendRawText) {
                text = text
            } else {
                // # key words
                text = text.replace(/^\s*#+(.*)/, 'comment $1')
                // // key words
                text = text.replace(/^\s*\/\/+(.*)/, 'comment $1')

                /** key words */
                text = text.replace(/^\s*\/\*+\s*(.*)(\s*\*+\/)/, 'comment $1')

                /** key words
                 */
                text = text.replace(/^\s*\/\*+\s*(.*)/, 'comment $1')

                // <# key words #>
                text = text.replace(/^\s*\<#\s*(.*)\s*#\>/, 'comment $1')

                // <# key words
                text = text.replace(/^\s*\<#\s*(.*)/, 'comment $1')

                // -- key words || - key words
                text = text.replace(/^\s*--*\s*(.*)/, 'comment $1')

                // <!-- key words -->
                text = text.replace(/^\s*\<!--\s*(.*)\s*--\>/, 'comment $1')

                // <!-- key words
                text = text.replace(/^\s*\<!--\s*(.*)/, 'comment $1')

                // ** key words || * key words
                text = text.replace(/^\s*\*\**\s*(.*)/, 'comment $1')

            }
            
            terminal.sendText(text, true);
        }

        if (autoScrollToBottom) {
            await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
        }
        
        console.log('--> Run Command:', command);
    }

    public async executeSelectText(options?: TerminalOptions) {
        await this.execute(this.$accessor.variable('selectedTextSection') || this.$accessor.variable('currentLineText'), options);
    }
}
