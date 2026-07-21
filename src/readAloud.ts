'use strict';

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

// Text is piped in via stdin (never interpolated), voice/rate via env vars,
// so nothing in the selection can break or inject into the command.
const SPEAK_SCRIPT = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'if ($env:READ_ALOUD_RATE) { $s.Rate = [int]$env:READ_ALOUD_RATE }',
    'if ($env:READ_ALOUD_VOICE) { try { $s.SelectVoice($env:READ_ALOUD_VOICE) } catch {} }',
    '$s.Speak([Console]::In.ReadToEnd())'
].join('; ');

let current: ChildProcess | undefined;

/** Stop any in-progress speech. */
export function stop(): void {
    if (current) {
        current.kill();
        current = undefined;
    }
}

/** Speak the given text via Windows System.Speech in a hidden pwsh process. */
export function speak(text: string): void {
    if (!text || !text.trim()) {
        return;
    }

    // Interrupt any in-progress speech so selections don't overlap.
    stop();

    const config = vscode.workspace.getConfiguration('command-runner.readAloud');
    const voice = config.get<string>('voice', '');
    const rate = config.get<number>('rate', 0);

    const child = spawn('pwsh', ['-NoProfile', '-Command', SPEAK_SCRIPT], {
        env: {
            ...process.env,
            READ_ALOUD_VOICE: voice,
            READ_ALOUD_RATE: String(rate),
        },
        windowsHide: true,
    });

    child.on('error', err => {
        vscode.window.showErrorMessage(`Read Aloud failed: ${err.message}`);
    });

    child.on('exit', () => {
        if (current === child) {
            current = undefined;
        }
    });

    current = child;
    child.stdin?.end(text);
}
