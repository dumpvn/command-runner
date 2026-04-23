'use strict';


// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import Command, { TerminalOptions } from './command';



export interface CommandOptions {
    cmd?: string;
    command?: string;
    terminal?: string | TerminalOptions;
}

/**
 * Finds the fenced code block (```...```) that ends on the line above the given line index.
 * @param document - The text document to search in.
 * @param lineIndex - 0-based line number of the line immediately below the desired code block (e.g. the "ins" line).
 * @returns The full code block text including fences, or `undefined` if no valid block is found.
 */
function getCodeBlockAboveLine(document: vscode.TextDocument, lineIndex: number): string | undefined {
    let currentLine = lineIndex - 1;
    while (currentLine > 0 && document.lineAt(currentLine).text.trim() !== '```') {
        currentLine--;
    }

    if (currentLine <= 0 || document.lineAt(currentLine).text.trim() !== '```') {
        return undefined;
    }

    const codeBlock: string[] = [];
    codeBlock.unshift(document.lineAt(currentLine).text);
    currentLine--;

    let foundOpeningBackticks = false;
    while (currentLine >= 0) {
        const lineText = document.lineAt(currentLine).text;
        if (lineText.trim().startsWith('```')) {
            foundOpeningBackticks = true;
        }
        codeBlock.unshift(lineText);
        if (foundOpeningBackticks) break;
        currentLine--;
    }

    return foundOpeningBackticks ? codeBlock.join('\n') : undefined;
}

/**
 * Scans backward from the given line to find the nearest "term <name>" directive.
 * @param document - The text document to search in.
 * @param lineIndex - 0-based line number to start searching from (inclusive).
 * @returns The terminal name if found, or undefined.
 */
function findTerminalFromContext(document: vscode.TextDocument, lineIndex: number): string | undefined {
    // Once we pass a plain closing fence (```), any opening fences above it belong to
    // a different code block — don't use their language for terminal detection.
    let passedClosingFence = false;

    for (let i = lineIndex; i >= 0; i--) {
        const lineText = document.lineAt(i).text.trim();

        if (lineText === 'claude') {
            return lineText;
        }

        if (lineText === 'pwsh') {
            return lineText;
        }

        if (lineText.startsWith('term ')) {
            const parts = lineText.split(/\s+/);
            if (parts.length >= 2) {
                return parts[1];
            }
        }

        // Support codeblock header as terminal specifier:
        //   ```pwsh   → run in "pwsh" terminal
        //   ```claude → run in "claude" terminal
        if (lineText.startsWith('```')) {
            const lang = lineText.slice(3).trim();
            if (lang && !passedClosingFence) {
                // Opening fence and cursor is inside this block
                return lang;
            } else if (!lang) {
                // Plain closing fence — cursor is outside this block
                passedClosingFence = true;
            }
        }
    }
    return undefined;
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
        vscode.commands.registerCommand('command-runner.runInTerminal', async ({ terminal }: CommandOptions = {}) => {

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                let text = activeEditor.document.getText(activeEditor.selection);
                if (!text) {
                    text = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                }
                text = text.trim();




                // Scan backward from the active line to find the nearest "term <name>" directive
                const detectedTerminal = findTerminalFromContext(activeEditor.document, activeEditor.selection.active.line);
                if (detectedTerminal) {
                    terminal = { name: detectedTerminal };
                    new Command(context).switchTerminal(detectedTerminal);
                }



                if (text.startsWith('#')) {
                    vscode.env.clipboard.writeText(text);
                    const command = new Command(context);

                    if (typeof terminal === 'string') {
                        terminal = { name: terminal };
                    }
                    command.execute('q', terminal);
                    return;
                }

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

                if (text.startsWith('open ')) {
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

                /* 
                if text.trim() === "work"
                    - get current active file without extension (e.g. if current file is command-runner.md => command-runner)
                    - text = text + file without extension + " -coder" (e.g. work command-runner -coder)
                */


                // Handle special 'work' command
                if (text.trim() === "work") {
                    const activeFile = activeEditor.document.fileName;
                    const fileBase = path.basename(activeFile, path.extname(activeFile));

                    const command = new Command(context);
                    if (typeof terminal === 'string') {
                        terminal = { name: terminal };
                    }
                    command.execute(`work ${fileBase} -coder`, terminal);
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
                    const codeBlock = getCodeBlockAboveLine(activeEditor.document, activeEditor.selection.active.line);
                    if (codeBlock) {
                        vscode.env.clipboard.writeText(codeBlock);
                    }
                }

                // /clip <description>: copy code block above to clipboard, then run this command in terminal
                if (text.startsWith('/clip')) {
                    const codeBlock = getCodeBlockAboveLine(activeEditor.document, activeEditor.selection.active.line);
                    if (codeBlock) {
                        vscode.env.clipboard.writeText(codeBlock);
                    }
                }

                // Handle PowerShell file sourcing pattern: "- some file here"
                if (text.startsWith('- ') && !text.startsWith('- [[')) {

                    // Support backtick-wrapped absolute path format:
                    // - `C:\path\to\file.c` — some description
                    const backtickMatch = text.match(/^- `([^`]+)`/);
                    if (backtickMatch) {
                        const filePath = backtickMatch[1];
                        if (path.isAbsolute(filePath)) {
                            try {
                                await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
                                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                                await vscode.window.showTextDocument(doc);
                                return;
                            } catch {
                                // File doesn't exist, fall through to normal handling
                            }
                        }
                    }

                    const match = text.match(/- (.+)/);
                    if (match) {
                        let fileName = match[1].toLowerCase().replace(/ /g, '-');
                        // Add .ps1 extension if no extension exists
                        if (!path.extname(fileName)) {
                            fileName += '.ps1';
                        }

                        if (path.isAbsolute(fileName)) {
                            try {
                                await vscode.workspace.fs.stat(vscode.Uri.file(fileName));
                                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
                                await vscode.window.showTextDocument(doc);
                                return;
                            } catch {
                                // File doesn't exist, fall through to normal handling
                            }
                        }

                        // Create the absolute path
                        const currentDir = path.dirname(vscode.window.activeTextEditor?.document?.uri.fsPath || '');
                        const absolutePath = path.join(currentDir, fileName);

                        // Create the PowerShell dot-sourcing command
                        const psCommand = `. ivk "${absolutePath}"`;

                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(psCommand, terminal);
                        return;
                    }
                }

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

                if (text.startsWith('* ')) {
                    const match = text.match(/\*\s+(.+)/);
                    if (match) {
                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(`sf ${match[1]}`, terminal);
                        return;
                    }
                }

                if (text.startsWith('**')) {
                    const match = text.match(/\*\*(.+)\*\*/);
                    if (match) {
                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(`sf ${match[1]}`, terminal);
                        return;
                    }
                }

                if (text.startsWith('`')) {
                    const match = text.match(/`(.+)`/);
                    if (match) {
                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(`sf ${match[1]}`, terminal);
                        return;
                    }
                }

                if (text.startsWith('> ')) {
                    const match = text.match(/>\s+(.+)/);
                    if (match) {
                        const command = new Command(context);
                        if (typeof terminal === 'string') {
                            terminal = { name: terminal };
                        }
                        command.execute(`cf ${match[1]}`, terminal);
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
export function deactivate() { }
