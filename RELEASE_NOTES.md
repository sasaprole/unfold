# Unfold v0.2.0 Release Notes

## What's New

### Improved Plan Generation
- Switched from JSON to delimiter-based output format for more reliable LLM parsing
- Plans are now generated with cleaner syntax and better error handling
- No more escaped characters or JSON formatting issues

### Better Prompt Engineering
- Refined system and command prompts with clearer examples
- More explicit requirements for LLM output
- Better handling of code blocks and special characters

### Streamlined Codebase
- Simplified type definitions
- Removed unnecessary abstractions
- Improved maintainability

### Marketplace Updates
- Updated categories for better discoverability (Visualization, Chat, Other)

## Installation

Search for **Unfold** in the VS Code Extensions Marketplace, or install from a `.vsix`:

```bash
code --install-extension unfold-0.2.0.vsix
```

## Quick Start

1. Install the extension
2. Open VS Code Chat (`Ctrl+L`)
3. Type: `@unfold /create Build a REST API with user auth`
4. Explore the generated plan in the Unfold sidebar

## Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete version history.
