# Changelog

All notable changes to the actgent framework will be documented in this file.

## [1.1.0] - 2025-04-12

### Added
- Conversation Data Handler system for processing conversation messages
  - Simple interface with `handleMessage` method and optional priority
  - Support for registering multiple handlers with priority ordering
  - Error isolation between handlers
  - Comprehensive documentation and examples
- Hook points in message flow to capture all message types (user, assistant, tool)
- Registration methods in AgentCore and BaseAgent classes
- Updated documentation with examples and use cases

## [1.0.6] - Previous release

Initial public release with core functionality.
