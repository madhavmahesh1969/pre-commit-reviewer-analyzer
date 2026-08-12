import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('[Pre-Commit Analyzer] Extension initializing...');

    // Register a manual test command first (allows testing without clicking commit)
    const manualCommand = vscode.commands.registerCommand(
        'preCommitAnalyzer.runManualReview',
        async () => {
            console.log('[Pre-Commit Analyzer] Manual trigger invoked.');
            const gitApi = await getGitApi();
            if (!gitApi || gitApi.repositories.length === 0) {
                vscode.window.showErrorMessage('No active Git repository found.');
                return;
            }
            const repo = gitApi.repositories[0];
            await runPreCommitAgentFlow(repo);
        }
    );
    context.subscriptions.push(manualCommand);

    // Initialize Git API binding
    setupGitHooks(context);
}

async function getGitApi() {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        console.error('[Pre-Commit Analyzer] vscode.git extension not found.');
        return null;
    }

    if (!gitExtension.isActive) {
        console.log('[Pre-Commit Analyzer] Activating vscode.git extension...');
        await gitExtension.activate();
    }

    return gitExtension.exports.getAPI(1);
}

async function setupGitHooks(context: vscode.ExtensionContext) {
    const gitApi = await getGitApi();
    if (!gitApi) return;

    const bindRepo = (repo: any) => {
        console.log('[Pre-Commit Analyzer] Binding preCommit hook to repository:', repo.rootUri.fsPath);
        
        // Attach hook to the repo instance
        repo.preCommit = async () => {
            console.log('[Pre-Commit Analyzer] Git preCommit hook intercepted!');
            return await runPreCommitAgentFlow(repo);
        };
    };

    // Bind existing repos
    gitApi.repositories.forEach(bindRepo);

    // Bind future repos
    context.subscriptions.push(
        gitApi.onDidOpenRepository((repo: any) => bindRepo(repo))
    );

    // Handle state change (e.g. when git finishes loading)
    context.subscriptions.push(
        gitApi.onDidChangeState((state: string) => {
            console.log('[Pre-Commit Analyzer] Git API State Changed:', state);
            if (state === 'initialized') {
                gitApi.repositories.forEach(bindRepo);
            }
        })
    );
}

async function runPreCommitAgentFlow(repo: any): Promise<boolean> {
    try {
        console.log('[Pre-Commit Analyzer] Extracting staged diffs...');
        const stagedDiff = await repo.diff(true);

        if (!stagedDiff || stagedDiff.trim().length === 0) {
            vscode.window.showInformationMessage('No staged changes found to analyze.');
            return true; // Allow commit if nothing staged
        }

        console.log('[Pre-Commit Analyzer] Staged diff found. Length:', stagedDiff.length);

        // Show progress indicator while calling Copilot
        const agentOutput = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Pre-Commit Analyzer: Calling Copilot Agent...",
                cancellable: false
            },
            async () => {
                return await invokeCopilotAgent(stagedDiff);
            }
        );

        if (!agentOutput) {
            console.warn('[Pre-Commit Analyzer] Copilot returned no output or failed.');
            return false;
        }

        // Display Modal Dialog
        console.log('[Pre-Commit Analyzer] Displaying Modal Dialog...');
        const selection = await vscode.window.showInformationMessage(
            `Pre-Commit Reviewer & Analyzer\n\n${agentOutput}`,
            { modal: true },
            'Proceed Commit',
            'Cancel'
        );

        return selection === 'Proceed Commit';

    } catch (err: any) {
        console.error('[Pre-Commit Analyzer] Error in flow:', err);
        vscode.window.showErrorMessage(`Pre-Commit Agent Error: ${err.message}`);
        return false;
    }
}

async function invokeCopilotAgent(diffContent: string): Promise<string | null> {
    try {
        console.log('[Pre-Commit Analyzer] Querying Copilot model via vscode.lm API...');
        
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot'
        });

        if (!models || models.length === 0) {
            vscode.window.showErrorMessage("No GitHub Copilot model available. Please log in to GitHub Copilot.");
            return null;
        }

        const model = models[0];
        console.log('[Pre-Commit Analyzer] Using Copilot Model:', model.id || model.family);

        const messages = [
            vscode.LanguageModelChatMessage.User(
                "You are a Pre-Commit Reviewer and Analyzer agent. " +
                "Analyze the staged git diff provided. Return a concise analysis including:\n" +
                "1. PR Weight Score (1-100)\n" +
                "2. Summary of changes\n" +
                "3. Potential risks or bugs."
            ),
            vscode.LanguageModelChatMessage.User(`Staged Git Diff:\n${diffContent}`)
        ];

        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        let resultText = '';
        for await (const chunk of response.text) {
            resultText += chunk;
        }

        return resultText;

    } catch (err: any) {
        console.error('[Pre-Commit Analyzer] Copilot API error:', err);
        vscode.window.showErrorMessage(`Copilot API Error: ${err.message}`);
        return null;
    }
}

export function deactivate() {}