import * as vscode from "vscode";
import ts from "typescript";
import path from "path";
/**
 * Find all matching test via ts AST
 */
function findTests(
  document: vscode.TextDocument
): Array<{ name: string; range: vscode.Range }> {
  const sourceFile = ts.createSourceFile(
    document.fileName,
    document.getText(),
    ts.ScriptTarget.Latest,
    true
  );
  const tests: Array<{ name: string; range: vscode.Range }> = [];

  // Visit all nodes in the AST
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expressionText = node.expression.getText(sourceFile);
      // Check if the expression is a test function
      const isTest =
        expressionText === "test" ||
        expressionText === "describe" ||
        expressionText === "it";

      if (!isTest) {
        return;
      }
      // Get the test name from the first argument
      const testName =
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0].text
          : null;
      if (!testName) {
        return;
      }

      // Get the range of the test function for the CodeLens
      const start = document.positionAt(node.getStart());
      const end = document.positionAt(node.getEnd());
      const range = new vscode.Range(start, end);
      tests.push({ name: testName, range });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tests;
}

/**
 * This class provides CodeLens for test functions in the editor - find all tests in current document and provide CodeLens for them.
 * It finds all test functions in the current document and provides CodeLens for them (Run Test, Watch Test buttons).
 */
class TestCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const tests = findTests(document);

    for (const test of tests) {
      const runTestCommand = {
        title: "Run Test",
        command: "better.test.runTest",
        arguments: [document.fileName, test.name],
      };
      const watchTestCommand = {
        title: "Watch Test",
        command: "better.test.watchTest",
        arguments: [document.fileName, test.name],
      };

      codeLenses.push(new vscode.CodeLens(test.range, runTestCommand));
      codeLenses.push(new vscode.CodeLens(test.range, watchTestCommand));
    }
    // also we push codelens at top of the file
    const runAllTestsCommand = {
      title: "Run All Tests",
      command: "better.test.runTest",
      arguments: [document.fileName],
    };
    const watchAllTestsCommand = {
      title: "Watch All Tests",
      command: "better.test.watchTest",
      arguments: [document.fileName],
    };

    codeLenses.push(
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), runAllTestsCommand)
    );
    codeLenses.push(
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), watchAllTestsCommand)
    );

    return codeLenses;
  }
}
// default file pattern to search for tests
const DEFAULT_FILE_PATTERN = "**/*.{spec,test}.{js,jsx,ts,tsx}";

/**
 * This function registers a CodeLens provider for test files. It is used to display the "Run" and "Watch" buttons.
 */
export function registerTestCodeLens(context: vscode.ExtensionContext) {
  const codeLensProvider = new TestCodeLensProvider();

  // Get the user-defined file pattern from the settings, or use the default
  // Setting is:
  // better.test.filePattern
  const pattern = vscode.workspace
    .getConfiguration("better.test")
    .get("filePattern", DEFAULT_FILE_PATTERN);
  const options = { scheme: "file", pattern };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { ...options, language: "javascript" },
      codeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { ...options, language: "typescript" },
      codeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { ...options, language: "javascriptreact" },
      codeLensProvider
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { ...options, language: "typescriptreact" },
      codeLensProvider
    )
  );
}

async function getPackageJsonClosest(filePath: string) {
  const segments = filePath.split(path.sep);
  // loop through segments and check if there is package.json
  for (let i = segments.length; i > 0; i--) {
    const folderPath = segments.slice(0, i).join(path.sep);
    const packageJsonPath = path.join(folderPath, "package.json");
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
      if (stat.type !== vscode.FileType.Directory) {
        continue;
      }

      const packageJsonStat = await vscode.workspace.fs.stat(
        vscode.Uri.file(packageJsonPath)
      );
      if (packageJsonStat.type === vscode.FileType.File) {
        return folderPath;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Tracking only one active terminal, so there will be only one terminal running at a time.
// Example: when user clicks "Run Test" button, the previous terminal will be disposed.
let activeTerminal: vscode.Terminal | null = null;

/**
 * This function registers the test runner commands.
 */
export function registerTestRunner(context: vscode.ExtensionContext) {
  // Register the "Run Test" command
  const runTestCommand = vscode.commands.registerCommand(
    "better.test.runTest",
    async (
      filePath?: string,
      testName?: string,
      isWatchMode: boolean = false
    ) => {
      // Get custom flag
      const customFlag = vscode.workspace
        .getConfiguration("better.test")
        .get("customFlag", "")
        .trim();
      const customScriptSetting = vscode.workspace
        .getConfiguration("better.test")
        .get("customScript", "bun test")
        .trim();

      const watchFlag =
        vscode.workspace
          .getConfiguration("better.test")
          .get("watchFlag", "--watch")
          .trim() ?? "--watch";

      const customScript = customScriptSetting.length
        ? customScriptSetting
        : "bun test";
      // When this command is called from the command palette, the fileName and testName arguments are not passed (commands in package.json)
      // so then fileName is taken from the active text editor and it run for the whole file.
      if (!filePath) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          filePath = editor.document.fileName;
        }
      }

      console.log("Running test", filePath, testName, isWatchMode);

      const packageJsonPath = await getPackageJsonClosest(filePath);

      if (activeTerminal) {
        activeTerminal.dispose();
        activeTerminal = null;
      }

      const cwd =
        packageJsonPath ||
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        process.cwd();

      const message = isWatchMode
        ? `Watching \x1b[1m\x1b[32m${testName || filePath}\x1b[0m test`
        : `Running \x1b[1m\x1b[32m${testName || filePath}\x1b[0m test`;
      const terminalOptions: vscode.TerminalOptions = {
        cwd,
        name: "Better Test Runner",
        location: vscode.TerminalLocation.Panel,
        message,
        hideFromUser: true,
      };
      activeTerminal = vscode.window.createTerminal(terminalOptions);
      activeTerminal.show();
      let command = customScript;
      if (filePath.length) {
        command += ` ${filePath}`;
      }
      if (testName?.length) {
        if (customScriptSetting.length) {
          // escape the quotes in the test name
          command += ` -t "${testName}"`;
        } else {
          command += ` -t "${testName}"`;
        }
      }
      if (isWatchMode) {
        command += ` ${watchFlag}`;
      }
      if (customFlag.length) {
        command += ` ${customFlag}`;
      }
      activeTerminal.sendText(command);
    }
  );

  // Register the "Watch Test" command, which just calls the "Run Test" command with the watch flag
  const watchTestCommand = vscode.commands.registerCommand(
    "better.test.watchTest",
    async (fileName?: string, testName?: string) => {
      vscode.commands.executeCommand(
        "better.test.runTest",
        fileName,
        testName,
        true
      );
    }
  );

  context.subscriptions.push(runTestCommand);
  context.subscriptions.push(watchTestCommand);
}
