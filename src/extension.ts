'use strict';


// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import Command, { TerminalOptions } from './command';



export interface CommandOptions {
    cmd?: string;
    command?: string;
    terminal?: string | TerminalOptions;
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
// https://code.visualstudio.com/api/references/vscode-api 
//		Extension writers can provide APIs to other extensions by returning their API public surface from the activate-call.
export function activate(context: vscode.ExtensionContext): void {
	
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "command-runner" is now active!');


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
    context.subscriptions.push(
        vscode.commands.registerCommand('command-runner.runChatCopilot', async () => {
            const command = new Command(context);
            const activeEditor = vscode.window.activeTextEditor;

            if (activeEditor) {
                let text = activeEditor.document.getText(activeEditor.selection);
                if (!text) {
                    text = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                }

                if (text) {
                    await vscode.commands.executeCommand('workbench.action.chat.openInNewWindow');
                    await vscode.env.clipboard.writeText(text);
                    await new Promise(resolve => setTimeout(resolve, 200)); 
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                } else {
                    vscode.window.showInformationMessage('No text selected to run in Chat Copilot.');
                }
            } else {
                vscode.window.showInformationMessage('No active editor found.');
            }
        })
    );

	context.subscriptions.push(
        vscode.commands.registerCommand('command-runner.runInTerminal', ({ terminal }: CommandOptions = {}) => {

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                var { text } = activeEditor.document.lineAt(activeEditor.selection.active.line);
                text = text.trim();
                if (text.startsWith('term ')) {
                    const terminalName = text.split(' ')[1];
                    const command = new Command(context);
                    command.switchTerminal(terminalName);
                    return;
                }                
            }



            const command = new Command(context);

            if (typeof terminal === 'string') {
                terminal = { name: terminal };
            }
            command.executeSelectText(terminal);
        })
    );

	context.subscriptions.push(
        vscode.commands.registerCommand('command-runner.run', async (opts: CommandOptions = {}, files?: vscode.Uri[]) => {
            const command = new Command(context);
            const cmd = opts.command || opts.cmd || '';

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                let text = activeEditor.document.getText(activeEditor.selection);
                if (!text) {
                    text = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                }

                if (!text || !text.trim()) {
                } else {
                    await vscode.env.clipboard.writeText(text);
                }
            }

            if (typeof opts.terminal === 'string') {
                opts.terminal = { name: opts.terminal };
            }

            if (files && files.length) {
                files.forEach(argv => command.addFile(argv.fsPath));
            }

            if (cmd) {
                return command.execute(command.commands[cmd] || cmd, opts.terminal);
            }

            command.pick();
        })
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
