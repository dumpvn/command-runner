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
	console.log('Congratulations, your extension "command-runner" is now active!');


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

                    text = await command.resolve(text);
                    text = text.trim();

                    await vscode.env.clipboard.writeText(text);
                    await vscode.commands.executeCommand('workbench.action.chat.open');
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } 
                // else {
                //     vscode.window.showInformationMessage('No text selected to run in Chat Copilot.');
                // }
            } 
            // else {
            //     vscode.window.showInformationMessage('No active editor found.');
            // }
        })
    );

	context.subscriptions.push(
        vscode.commands.registerCommand('command-runner.runInTerminal', ({ terminal }: CommandOptions = {}) => {

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                let text = activeEditor.document.getText(activeEditor.selection);
                if (!text) {
                    text = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                }

                text = text.trim();

                // if (text.startsWith('open ')) {
                //     const match = text.match(/open\s+(.+)/);
                //     if (match) {
                //         const filePath = match[1];
                //         const openPath = vscode.Uri.file(filePath);
                //         vscode.workspace.openTextDocument(openPath).then(doc => {
                //             vscode.window.showTextDocument(doc);
                //         });
                //     }
                //     return;
                // }

                if (text.startsWith('open')) {
                    const textNoQuotes = text.replace(/['"\(\)]/g, '');
                    const match = textNoQuotes.match(/open\s*(.+)/);
                    if (match) {
                        const filePath = match[1];
                        const openPath = vscode.Uri.file(filePath);
                        vscode.workspace.openTextDocument(openPath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    }
                    return;
                }


                if (text.startsWith('term ')) {
                    const terminalName = text.split(' ')[1];
                    const command = new Command(context);
                    command.switchTerminal(terminalName);
                    return;
                }

                // Handle insert command
                // If the text starts with 'ins ' or 'explain', we will look for the code block above it
                if (text.startsWith('ins ') || text.trim() === 'explain' || text.startsWith('explain ') || text.trim() === 'exp' || text.trim() === 'exp llm') {
                    const document = activeEditor.document;
                    let currentLine = activeEditor.selection.active.line - 1;
                    while (currentLine > 0 && document.lineAt(currentLine).text.trim() !== '```') {
                        currentLine--;
                    }
                
                    // Step 1: Check if the line above "ins" is ```
                    if (currentLine > 0 && document.lineAt(currentLine).text.trim() === '```') {
                        let codeBlock = [];
                        let foundOpeningBackticks = false;
                        
                        codeBlock.unshift(document.lineAt(currentLine).text); // Add to the block
                        currentLine--;
                    
                        // Step 2: Traverse upwards to find the start of the code block
                        while (currentLine >= 0) {
                            const lineText = document.lineAt(currentLine).text;
                    
                            // If we find the opening backticks, stop
                            if (lineText.trim().startsWith('```')) {
                                foundOpeningBackticks = true;
                            }
                    
                            codeBlock.unshift(lineText); // Add to the block
                            if (foundOpeningBackticks) break;

                            currentLine--;
                        }
                    
                        // Step 3: Copy to clipboard if a block was found
                        if (foundOpeningBackticks) {
                            vscode.env.clipboard.writeText(codeBlock.join('\n'));
                        }
                    }
                }


                /* search references
                if text match '- [[something-here]]' then replace text with "sf something-here"
                */
                if (text.startsWith('- [[')) {
                    const match = text.match(/- \[\[(.+)\]\]/);
                    if (match) {
                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(`sf ${match[1]}`, terminal);
                        return;
                    }
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

                // user need to select the text
                // if (!text) {
                //     text = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                // }

                if (!text || !text.trim()) {
                    // clear clipboard
                    await vscode.env.clipboard.writeText('');
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



            /* 
            
             await vscode.env.clipboard.writeText(text);
                    await vscode.commands.executeCommand('workbench.action.chat.openInNewWindow');
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
            */

            command.pick();
        })
    );
}

// this method is called when your extension is deactivated
export function deactivate() {}
