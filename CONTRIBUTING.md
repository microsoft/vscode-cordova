## Development setup

We welcome any quality bugfixes or contributions!

To avoid conflicts with your existing installation, it is recommended to delete the installed extension at:

- **Linux and macOS**: `~/.vscode/extensions/msjsdiag.vscode-cordova-<version>`
- **Windows**: `C:\Users\<username>\.vscode\extensions\msjsdiag.vscode-cordova-<version>`

### Build the project

- `git clone https://github.com/microsoft/vscode-cordova.git` to any preferrable folder
- `cd` to the folder you just cloned
- Run `npm install -g gulp` and `npm ci`
- Run `gulp`
- After completing above steps, run `gulp release` to package extension `.vsix` file. A VSIX package can help you install the latest extension maunally in VS Code extension tab.

## Debugging

To debug the extension process itself and the debug adapter it provides, in VS Code run the `Launch Extension` debug target which will spawn a new instance of VS Code with the extension installed. You can set breakpoints in the Typescript and debug things such as extension activation and the command palette.

## Testing

There is a set of mocha tests for the debug adapter which can be run with `npm test`, and a set of mocha tests for the other functionality run as part of the `test` launch config. Also run `gulp eslint` to check your code against our `eslint` rules.

See the project under `test/testProject/` for a sample project that should build and compile, allow debugging of plugins and merges, and enable Intellisense for plugins.

## Legal

You will need to complete a Contributor License Agreement (CLA). Briefly, this agreement testifies that you are granting us permission to use the submitted change according to the terms of the project's license, and that the work being submitted is under appropriate copyright.

Please submit a Contributor License Agreement (CLA) before submitting a pull request. You may visit https://cla.microsoft.com to sign digitally. Alternatively, download the agreement ([Microsoft Contribution License Agreement.docx](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=822190) or [Microsoft Contribution License Agreement.pdf](https://www.codeplex.com/Download?ProjectName=typescript&DownloadId=921298)), sign, scan, and email it back to <cla@microsoft.com>. Be sure to include your github user name along with the agreement. Once we have received the signed CLA, we'll review the request.

## Sending PR

Your pull request should:

- Include a clear description of the change
- Be a child commit of a reasonably recent commit in the **master** branch
  - Requests need not be a single commit, but should be a linear sequence of commits (i.e. no merge commits in your PR)
- It is desirable, but not necessary, for the tests to pass at each commit
- Have clear commit messages
  - e.g. "Refactor feature", "Fix issue", "Add tests for issue"
- Include adequate tests
  - At least one test should fail in the absence of your non-test code changes. If your PR does not match this criteria, please specify why
  - Tests should include reasonable permutations of the target fix/change
  - Include baseline changes with your change
- Ensure there are no linting issues (`gulp eslint`)
- To avoid line ending issues, set `autocrlf = input` and `whitespace = cr-at-eol` in your git configuration

## Code

This extension is based on [JavaScript Debugger extension](https://github.com/Microsoft/vscode-js-debug).

## Code of conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
