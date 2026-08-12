import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    // 1. Obtain access to the official VS Code Git Extension API
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) {
        vscode.window.showErrorMessage('VS Code Git extension is missing or disabled.');
        return;
    }

    const gitApi = gitExtension.getAPI(1);

    // 2. Intercept repository commits
    gitApi.repositories.forEach((repo: any) => {
        // Register a pre-commit action/hook on the repository
        repo.preCommit = async () => {
            return await runPreCommitAgentFlow(repo);
        };
    });

    // Also handle dynamically opened repositories
    context.subscriptions.push(
        gitApi.onDidOpenRepository((repo: any) => {
            repo.preCommit = async () => {
                return await runPreCommitAgentFlow(repo);
            };
        })
    );
}

/**
 * Executes the Copilot Agent analysis on staged diffs and handles UI prompt
 */
async function runPreCommitAgentFlow(repo: any): Promise<boolean> {
    try {
        // Step A: Extract staged diffs
        const stagedDiff = await repo.diff(true);
        if (!stagedDiff || stagedDiff.trim().length === 0) {
            return true; // No staged changes, proceed standard git behavior
        }

        // Step B: Show progress notification while Copilot Agent analyzes
        const agentOutput = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Pre-Commit Reviewer: Running Copilot Agent...",
                cancellable: false
            },
            async () => {
                return await invokeCopilotAgent(stagedDiff);
            }
        );

        if (!agentOutput) {
            // Error occurred or no output returned
            return false; // Abort commit
        }

        // Step C: Present the output in a Modal Dialog
        const userChoice = await vscode.window.showInformationMessage(
            `Pre-Commit Reviewer & Analyzer\n\n${agentOutput}`,
            { modal: true },
            'Proceed Commit',
            'Cancel'
        );

        // Return true to allow git commit, false to cancel
        return userChoice === 'Proceed Commit';

    } catch (error: any) {
        vscode.window.showErrorMessage(`Pre-Commit Agent Error: ${error.message}`);
        return false; // Cancel commit on failure
    }
}

/**
 * Invokes GitHub Copilot LLM via VS Code Language Model API
 */
async function invokeCopilotAgent(diffContent: string): Promise<string | null> {
    // Select Copilot model
    const [model] = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o'
    });

    if (!model) {
        vscode.window.showErrorMessage("GitHub Copilot model is unavailable. Please sign into GitHub Copilot.");
        return null;
    }

    const messages = [
        vscode.LanguageModelChatMessage.User(
            "You are a Pre-Commit Reviewer and Analyzer agent. " +
            "Analyze the staged git diff provided. Return a concise analysis including:\n" +
            "1. PR Weight Score (1-100)\n" +
            "2. Summary of changes\n" +
            "3. Potential risks, security concerns, or architectural defects."
        ),
        vscode.LanguageModelChatMessage.User(`Staged Git Diff:\n${diffContent}`)
    ];

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    
    let resultText = '';
    for await (const chunk of response.text) {
        resultText += chunk;
    }

    return resultText;
}

export function deactivate() {}

// import * as vscode from 'vscode';

// export function activate(context: vscode.ExtensionContext) {
//     // Register the command that runs the Copilot review/agent task
//     let disposable = vscode.commands.registerCommand('preCommitAnalyzer.runCopilotAgent', async () => {
//         try {
//             // 1. Show progress notification while Copilot is working
//             await vscode.window.withProgress({
//                 location: vscode.ProgressLocation.Notification,
//                 title: "Running Pre-Commit Copilot Agent...",
//                 cancellable: false
//             }, async () => {

//                 // 2. Select the Copilot Language Model
//                 const [model] = await vscode.lm.selectChatModels({
//                     vendor: 'copilot',
//                     family: 'gpt-4o' // or 'claude-3.5-sonnet' depending on availability
//                 });

//                 if (!model) {
//                     vscode.window.showErrorMessage("GitHub Copilot model is not available. Please ensure GitHub Copilot is installed and active.");
//                     return;
//                 }

//                 // 3. Prepare prompt (Replace with your actual context/staged diff)
//                 const promptMessages = [
//                     vscode.LanguageModelChatMessage.User(
//                         "You are a pre-commit code review agent. Analyze the code changes and provide a concise PR Weight Score (1-100) and review highlights."
//                     ),
//                     vscode.LanguageModelChatMessage.User(
//                         "Context / Staged Diff:\n+ function calculateTotal(items) { return items.reduce((a,b) => a+b, 0); }"
//                     )
//                 ];

//                 // 4. Send request to Copilot
//                 const response = await model.sendRequest(promptMessages, {}, new vscode.CancellationTokenSource().token);
                
//                 // 5. Aggregate streamed response chunks
//                 let agentOutput = '';
//                 for await (const chunk of response.text) {
//                     agentOutput += chunk;
//                 }

//                 // 6. Display output as a Modal Dialog Popup
//                 await showOutputDialog("Pre-Commit Review Result", agentOutput);
//             });

//         } catch (error: any) {
//             vscode.window.showErrorMessage(`Copilot Agent Error: ${error.message}`);
//         }
//     });

//     context.subscriptions.push(disposable);
// }

// /**
//  * Utility to render formatted text inside a VS Code Modal Dialog
//  */
// async function showOutputDialog(title: string, outputText: string): Promise<boolean> {
//     const dialogMessage = `${title}\n\n${outputText}`;

//     // { modal: true } creates a blocking modal dialog in VS Code
//     const selection = await vscode.window.showInformationMessage(
//         dialogMessage,
//         { modal: true },
//         'Proceed with Commit',
//         'Cancel'
//     );

//     return selection === 'Proceed with Commit';
// }

// export function deactivate() {}

// function showRichMarkdownDialog(title: string, markdownContent: string) {
//     const panel = vscode.window.createWebviewPanel(
//         'copilotAgentResult',
//         title,
//         vscode.ViewColumn.Active,
//         { enableScripts: true }
//     );

//     panel.webview.html = `
//         <!DOCTYPE html>
//         <html lang="en">
//         <head>
//             <style>
//                 body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); }
//                 .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); padding: 16px; border-radius: 6px; }
//                 .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; }
//             </style>
//         </head>
//         <body>
//             <div class="card">
//                 <h2>${title}</h2>
//                 <pre>${markdownContent}</pre>
//                 <button class="btn" onclick="tsVscode.postMessage({ command: 'commit' })">Proceed Commit</button>
//             </div>
//         </body>
//         </html>
//     `;
// }