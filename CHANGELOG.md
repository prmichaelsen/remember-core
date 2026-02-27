# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.4.0] - 2026-02-27

### Added
- Port preference types: 6 category interfaces, defaults, descriptions, schema generator
- Port space types: SpaceMemory, SpaceSearchOptions, SpaceSearchResult, SpaceId, constants
- Port 41 content type constants with full metadata registry and category groupings
- Content type helpers: isValidContentType, getContentTypeMetadata, getContentTypesByCategory
- LLM types placeholder file for future use
- Constants barrel exports (src/constants/index.ts)

### Changed
- Milestone 1 (Types & Models) complete — all 3 tasks done

## [0.3.0] - 2026-02-27

### Added
- Port core memory types from remember-mcp: Memory, Relationship, MemoryDocument, MemoryUpdate, RelationshipUpdate
- Port context/location types: GPSCoordinates, Address, Location, Participant, Source, Environment, MemoryContext
- Port search types: SearchFilters, DeletedFilter, SearchOptions, SearchResult
- Port auth types: GroupPermissions, GroupMembership, UserCredentials, AuthContext, WriteMode, CredentialsProvider
- ContentType union (41 content types across 10 categories)
- Barrel exports from src/types/index.ts

### Changed
- Fix tsconfig.json paths for config/ subdirectory location
- Install TypeScript as dev dependency

## [0.2.0] - 2026-02-27

### Added
- Install core-sdk package (v1.22.0) with 25 patterns, architecture design doc, and bootstrap script
- TypeScript source scaffolding: services, client, config, errors, testing, and types modules
- Example implementations for REST, MCP, and CLI adapters
- Project config files (tsconfig, jest, esbuild)

### Changed
- Update ACP from v4.2.1 to v4.3.0
- Update manifest to track core-sdk package installation

## [0.1.0] - 2026-02-27

### Added
- Initialize project with ACP
- Basic project structure and README
