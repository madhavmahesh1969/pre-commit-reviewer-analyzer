# Pre-Commit Reviewer & Analyzer

AI-powered pre-commit inspection extension that invokes a GitHub Copilot Agent to analyze staged code changes, calculate a PR Weight score, and display the output in a modal dialog before finalizing commits.

## Features

- **Automated Pre-Commit Review**: Evaluates staged diffs automatically when committing via VS Code or manually via command.
- **PR Weight Scoring**: Provides early feedback on PR complexity and churn.
- **Blocking Modal Dialog**: Gives developers clear pass/fail confirmation options (`Proceed Commit` / `Cancel`).

## Requirements

- VS Code `1.85.0` or higher.
- Active GitHub Copilot extension/subscription.

## Extension Settings

This extension contributes the following settings:

* `preCommitAnalyzer.enablePrWeight`: Enable or disable PR Weight score calculations.
* `preCommitAnalyzer.showModalDialog`: Toggle displaying a modal dialog popup during GUI commit actions.

## Known Issues

- Requires active network connectivity to reach the Copilot API model.