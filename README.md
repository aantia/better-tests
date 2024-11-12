# Better tests for Visual Studio Code
Small extension to provide better user experience for testing your `typescript` / `javascript` code!

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/better-tests)

<img align="right" src="https://github.com/samuelgja/better-tests/blob/main/assets/icon.png?raw=true" height="150px" style="float: right; padding: 30px;">

Extension provide better experience to run tests in your typescript / javascript projects directly via opened file or via vscode command.

*Working also in monorepos, looking for the current `package.json` and running tests in the right context.*


**Example of usage**:
<!-- https://github.com/samuelgja/better-tests/blob/main/assets/example.png?raw=true -->
![alt text](https://github.com/samuelgja/better-tests/blob/main/assets/example.png?raw=true )


## Configuration

### `.vscode/settings.json`

You can use the following configurations to customize the behavior of the Better Tests extension.

```jsonc
{
  "better.test.filePattern": {
    "type": "string",
    "default": "**/*.{test,spec}.{js,ts,tsx,jsx}",
    "description": "Glob pattern to match test files (e.g., **/*.test.{js,ts,tsx,jsx})"
  },
  "better.test.customFlag": {
    "type": "string",
    "default": "",
    "description": "Custom flag added to the end of test command"
  },
  "better.test.customScript": {
    "type": "string",
    "default": "bun test",
    "description": "Custom script to use instead of `bun test`, for example script from `package.json`"
  },
  "better.test.watchFlag": {
      "type": "string",
      "default": "--watch",
      "description": "Custom flag for the watch mode. Default is --watch"
  }
}
```