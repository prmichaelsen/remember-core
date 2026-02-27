# Core SDK Architecture

**Concept**: Patterns and templates for creating reusable core libraries that can be shared across MCP servers, REST APIs, and client applications
**Created**: 2026-02-26
**Status**: Design Specification

---

## Overview

This design document describes the architecture and patterns for building reusable core libraries (SDKs) that can be shared across multiple application types: Model Context Protocol (MCP) servers, REST APIs, and client applications. The goal is to eliminate code duplication and ensure consistency across different deployment targets while maintaining clean separation of concerns.

The core-sdk package provides patterns, templates, and best practices for:
- Structuring shared business logic
- Managing dependencies across different runtime environments
- Handling configuration and environment-specific concerns
- Testing core functionality independently of deployment targets
- Publishing and versioning shared libraries

---

## Problem Statement

Modern applications often need to expose the same functionality through multiple interfaces:
- **MCP Servers**: For AI agent integration
- **REST APIs**: For web and mobile clients
- **Client Libraries**: For direct integration in other applications

Without a structured approach, teams face several challenges:

1. **Code Duplication**: Same business logic implemented multiple times across different projects
2. **Inconsistency**: Different implementations may have subtle behavioral differences
3. **Maintenance Burden**: Bug fixes and features must be applied in multiple places
4. **Testing Complexity**: Each implementation requires separate test suites
5. **Version Drift**: Different deployments may use different versions of the "same" logic
6. **Dependency Management**: Unclear how to handle shared dependencies across environments

**Consequences of not solving this**:
- Increased development time and costs
- Higher bug rates due to inconsistent implementations
- Difficulty maintaining feature parity across interfaces
- Slower iteration cycles
- Technical debt accumulation

---

## Solution

Create a **Core SDK Pattern** that separates business logic into reusable libraries that can be consumed by any deployment target. The pattern consists of:

### High-Level Approach

1. **Core Library Layer**: Pure business logic with no deployment-specific dependencies
2. **Adapter Layer**: Thin wrappers that adapt core functionality to specific deployment targets
3. **Configuration Layer**: Environment-specific configuration management
4. **Testing Strategy**: Comprehensive testing at the core layer, integration testing at adapter layer

### Key Components

```
┌─────────────────────────────────────────────────────────┐
│                    Deployment Targets                    │
├──────────────┬──────────────┬──────────────┬────────────┤
│  MCP Server  │   REST API   │  CLI Tool    │   Client   │
└──────┬───────┴──────┬───────┴──────┬───────┴─────┬──────┘
       │              │              │             │
       └──────────────┴──────────────┴─────────────┘
                      │
              ┌───────▼────────┐
              │  Adapter Layer │  ← Deployment-specific
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │   Core SDK     │  ← Pure business logic
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │  Dependencies  │  ← Shared utilities
              └────────────────┘
```

### Alternative Approaches Considered

1. **Monorepo with Shared Code**: Rejected because it couples deployment targets together
2. **Copy-Paste Pattern**: Rejected due to maintenance burden and drift
3. **Microservices Only**: Rejected because it adds network overhead for simple operations
4. **Plugin Architecture**: Rejected as too complex for most use cases

---

## Implementation

### Directory Structure

```
core-sdk/
├── src/
│   ├── core/              # Core business logic
│   │   ├── services/      # Business services
│   │   ├── models/        # Data models
│   │   ├── utils/         # Utility functions
│   │   └── types/         # TypeScript types
│   │
│   ├── adapters/          # Optional: Example adapters
│   │   ├── mcp/           # MCP server adapter
│   │   ├── rest/          # REST API adapter
│   │   └── cli/           # CLI adapter
│   │
│   └── config/            # Configuration management
│       ├── base.ts        # Base configuration
│       └── schema.ts      # Config validation
│
├── tests/
│   ├── unit/              # Unit tests for core
│   ├── integration/       # Integration tests
│   └── fixtures/          # Test fixtures
│
├── examples/              # Usage examples
│   ├── mcp-server/        # Example MCP server
│   ├── rest-api/          # Example REST API
│   └── client-app/        # Example client
│
└── package.json           # NPM package config
```

### Core Service Pattern

```typescript
// src/core/services/BaseService.ts
export abstract class BaseService {
  protected config: ServiceConfig;
  
  constructor(config: ServiceConfig) {
    this.config = config;
  }
  
  // Core business logic methods
  abstract initialize(): Promise<void>;
  abstract cleanup(): Promise<void>;
}

// src/core/services/ExampleService.ts
export class ExampleService extends BaseService {
  async processData(input: DataInput): Promise<DataOutput> {
    // Pure business logic - no deployment-specific code
    const validated = this.validateInput(input);
    const processed = await this.transform(validated);
    return this.formatOutput(processed);
  }
  
  private validateInput(input: DataInput): ValidatedInput {
    // Validation logic
  }
  
  private async transform(input: ValidatedInput): Promise<ProcessedData> {
    // Transformation logic
  }
  
  private formatOutput(data: ProcessedData): DataOutput {
    // Output formatting
  }
}
```

### Adapter Pattern

```typescript
// adapters/mcp/MCPAdapter.ts
import { ExampleService } from '../../core/services/ExampleService';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

export class MCPAdapter {
  private service: ExampleService;
  private server: Server;
  
  constructor(config: MCPConfig) {
    this.service = new ExampleService(config.serviceConfig);
    this.server = new Server(config.serverInfo, config.serverOptions);
  }
  
  setupHandlers(): void {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Adapt MCP request to service call
      const input = this.adaptMCPRequest(request);
      const result = await this.service.processData(input);
      return this.adaptMCPResponse(result);
    });
  }
  
  private adaptMCPRequest(request: CallToolRequest): DataInput {
    // Convert MCP request format to service input
  }
  
  private adaptMCPResponse(output: DataOutput): CallToolResult {
    // Convert service output to MCP response format
  }
}
```

### Configuration Management

```typescript
// src/config/schema.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'text']),
  }),
  services: z.object({
    timeout: z.number().min(1000).max(30000),
    retries: z.number().min(0).max(5),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// src/config/base.ts
export class ConfigManager {
  private config: Config;
  
  constructor(envOverrides?: Partial<Config>) {
    this.config = this.loadConfig(envOverrides);
  }
  
  private loadConfig(overrides?: Partial<Config>): Config {
    const baseConfig = {
      environment: process.env.NODE_ENV || 'development',
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'text',
      },
      services: {
        timeout: parseInt(process.env.SERVICE_TIMEOUT || '5000'),
        retries: parseInt(process.env.SERVICE_RETRIES || '3'),
      },
    };
    
    const merged = { ...baseConfig, ...overrides };
    return ConfigSchema.parse(merged);
  }
  
  get(): Config {
    return this.config;
  }
}
```

### Dependency Injection

```typescript
// src/core/container.ts
export class ServiceContainer {
  private services: Map<string, any> = new Map();
  
  register<T>(name: string, factory: () => T): void {
    this.services.set(name, factory);
  }
  
  resolve<T>(name: string): T {
    const factory = this.services.get(name);
    if (!factory) {
      throw new Error(`Service ${name} not registered`);
    }
    return factory();
  }
}

// Usage in adapter
const container = new ServiceContainer();
container.register('exampleService', () => new ExampleService(config));
const service = container.resolve<ExampleService>('exampleService');
```

---

## Benefits

### 1. Code Reusability
- **Single Source of Truth**: Business logic exists in one place
- **DRY Principle**: No duplication across deployment targets
- **Faster Development**: New deployment targets only need thin adapters

### 2. Consistency
- **Behavioral Consistency**: Same logic produces same results everywhere
- **Version Control**: Single version number for all deployments
- **Unified Testing**: Test once, deploy everywhere

### 3. Maintainability
- **Centralized Updates**: Bug fixes and features applied once
- **Clear Boundaries**: Separation between core logic and deployment concerns
- **Easier Refactoring**: Changes isolated to specific layers

### 4. Testing
- **Comprehensive Core Tests**: Test business logic without deployment complexity
- **Faster Test Execution**: Core tests run without deployment infrastructure
- **Better Coverage**: Easier to achieve high test coverage

### 5. Flexibility
- **Multiple Deployment Targets**: Same core, different interfaces
- **Easy Migration**: Move between deployment targets without rewriting logic
- **Incremental Adoption**: Can adopt pattern gradually

---

## Trade-offs

### 1. Initial Setup Complexity
**Trade-off**: More upfront work to structure code properly
**Mitigation**: 
- Provide templates and examples
- Start simple and evolve
- Document patterns clearly

### 2. Abstraction Overhead
**Trade-off**: Additional abstraction layer between deployment and logic
**Mitigation**:
- Keep adapters thin and simple
- Use TypeScript for type safety
- Provide clear adapter examples

### 3. Dependency Management
**Trade-off**: Must carefully manage dependencies to avoid deployment-specific leakage
**Mitigation**:
- Use dependency injection
- Clear separation of concerns
- Lint rules to enforce boundaries

### 4. Learning Curve
**Trade-off**: Team must understand the pattern and architecture
**Mitigation**:
- Comprehensive documentation
- Code examples for common scenarios
- Pair programming and code reviews

### 5. Build Complexity
**Trade-off**: May need different build configurations for different targets
**Mitigation**:
- Use modern build tools (esbuild, tsup)
- Provide build scripts
- Document build process

---

## Dependencies

### Required
- **TypeScript**: For type safety and better developer experience
- **Node.js**: Runtime environment (v18+)
- **Package Manager**: npm, yarn, or pnpm

### Recommended
- **Zod**: Runtime type validation and schema definition
- **Testing Framework**: Jest or Vitest for unit tests
- **Build Tool**: esbuild or tsup for fast builds
- **Linting**: ESLint with TypeScript support

### Optional (Deployment-Specific)
- **MCP SDK**: For MCP server deployments
- **Express/Fastify**: For REST API deployments
- **Commander**: For CLI deployments

---

## Testing Strategy

### Unit Tests (Core Layer)
```typescript
// tests/unit/services/ExampleService.test.ts
describe('ExampleService', () => {
  let service: ExampleService;
  
  beforeEach(() => {
    service = new ExampleService(mockConfig);
  });
  
  it('should process valid input', async () => {
    const input = { data: 'test' };
    const result = await service.processData(input);
    expect(result).toMatchObject({ processed: true });
  });
  
  it('should reject invalid input', async () => {
    const input = { data: '' };
    await expect(service.processData(input)).rejects.toThrow();
  });
});
```

### Integration Tests (Adapter Layer)
```typescript
// tests/integration/adapters/mcp.test.ts
describe('MCP Adapter', () => {
  let adapter: MCPAdapter;
  let client: Client;
  
  beforeEach(async () => {
    adapter = new MCPAdapter(testConfig);
    await adapter.start();
    client = new Client(/* ... */);
  });
  
  it('should handle tool calls', async () => {
    const response = await client.callTool({
      name: 'process_data',
      arguments: { data: 'test' }
    });
    expect(response.content).toBeDefined();
  });
});
```

### Test Coverage Goals
- **Core Services**: 90%+ coverage
- **Adapters**: 70%+ coverage (focus on integration)
- **Utilities**: 95%+ coverage

---

## Migration Path

### For New Projects
1. Install core-sdk package
2. Choose deployment target(s)
3. Implement adapters using provided templates
4. Configure environment-specific settings
5. Deploy

### For Existing Projects
1. **Identify Shared Logic**: Find code duplicated across projects
2. **Extract to Core**: Move business logic to core-sdk structure
3. **Create Adapters**: Build thin adapters for existing deployments
4. **Test Thoroughly**: Ensure behavior matches original
5. **Deploy Incrementally**: Roll out one deployment target at a time
6. **Remove Duplicates**: Delete old implementations after verification

---

## Future Considerations

### Potential Enhancements
- **Plugin System**: Allow extending core functionality with plugins
- **Event System**: Pub/sub for cross-service communication
- **Caching Layer**: Built-in caching abstractions
- **Observability**: Structured logging and metrics
- **Multi-Language Support**: Patterns for other languages (Python, Go)

### Related Patterns to Document
- **Error Handling Pattern**: Consistent error handling across layers
- **Logging Pattern**: Structured logging best practices
- **Configuration Pattern**: Advanced configuration management
- **Testing Pattern**: Comprehensive testing strategies
- **Deployment Pattern**: CI/CD for multi-target deployments

---

**Status**: Design Specification - Ready for Implementation
**Recommendation**: Begin by creating example implementations for each deployment target (MCP, REST, CLI) to validate the pattern
**Related Documents**: 
- Pattern: core-sdk.service-pattern.md (to be created)
- Pattern: core-sdk.adapter-pattern.md (to be created)
- Pattern: core-sdk.testing-pattern.md (to be created)
