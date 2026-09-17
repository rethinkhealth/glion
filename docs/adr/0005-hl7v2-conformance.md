# 5. HL7v2 Conformance Implementation Strategy

Date: 2025-11-26

## Status

Accepted

## Context

HL7v2 messaging relies on **Conformance** to ensure data quality and interoperability. Conformance involves validating a message against a set of rules defined in a **Conformance Profile** (or Message Profile). These rules cover multiple dimensions:

1. **Usage Constraints**: Whether an element is Required (R), Optional (O), Not Supported (X), etc.
2. **Cardinality Constraints**: The minimum and maximum number of repetitions.
3. **Length Constraints**: The minimum and maximum character length.
4. **Value Set Conformance**: Whether a coded value exists in the specified Table (e.g., `0001` for Sex).
5. **Data Type Conformance**: Whether the data follows the format of its type (e.g., `YYYYMMDD` for DT, Numeric for NM).
6. **Structural Conformance**: Whether the sequence and nesting of segments match the message structure (e.g., ADT^A01).

## Decision

We will implement a comprehensive **Conformance Utility** that provides stateless validation functions for all conformance dimensions.

### 1. Package Structure

The package will be organized into modules reflecting the different conformance aspects.

### 2. API Design

The API will expose granular validation functions that can be composed by a higher-level Validator or Plugin.

```typescript
// Constraints
checkOptionality(node, usage);
checkCardinality(node, min, max);
// Note: checkLength(node, max, min?) where min is optional and defaults to 0
checkLength(node, max, min);
```

### 3. Scope of Initial Implementation

We will implement:

- **Constraints**: Usage, Cardinality, Length.

## Consequences

- **Pros**:
  - **Modular**: Different validation aspects are separated.
  - **Extensible**: New data types or complex table logic can be added easily.
  - **Reusable**: Can be used for "strict" validation or "loose" validation depending on caller needs.

## Acceptance Criteria

1. **Refactor Constraints**: Move existing constraint logic to `constraints` module.
2. **Tests**: Comprehensive unit tests for all new modules.
