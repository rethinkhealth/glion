# Architecture of the Parsing Process

This HL7v2 parsing library uses a **two-stage architecture** to convert raw HL7v2 text into an Abstract Syntax Tree (AST). The tokenizer and parser work in tandem to process HL7v2 messages with a focus on performance and correctness. Here's how they collaborate:

## 1. **Two-Stage Architecture**

```
Raw HL7v2 Text → Tokenizer → Token Stream → Parser → AST
```

The architecture separates concerns:

- **Tokenizer**: Handles low-level character processing and delimiter recognition
- **Parser**: Builds hierarchical structure using tokens

## 2. **The Tokenizer (`StreamingHL7v2Tokenizer`)**

The tokenizer processes HL7v2 messages **character by character** and emits tokens:

### Key Responsibilities:

- **Delimiter Detection**: Recognizes HL7v2 delimiters (`|`, `^`, `~`, `&`, `\r`)
- **MSH Header Handling**: Special processing for the MSH segment header
- **Dynamic Delimiter Learning**: Updates delimiters based on MSH.1 and MSH.2 fields
- **Position Tracking**: Maintains line, column, and offset positions
- **Streaming Support**: Processes input incrementally via `write()` chunks

### Token Types Generated:

```typescript
// Text content
{ type: 'text', value: 'PID', position: {...} }

// Delimiters create structure
{ type: 'fieldDelimiter', value: '|', position: {...} }
{ type: 'componentDelimiter', value: '^', position: {...} }
{ type: 'repetitionDelimiter', value: '~', position: {...} }
{ type: 'subcomponentDelimiter', value: '&', position: {...} }
{ type: 'segmentDelimiter', value: '\r', position: {...} }

// Special MSH fields
{ type: 'mshField', fieldNumber: 1, value: '|', position: {...} }
{ type: 'mshField', fieldNumber: 2, value: '^~\\&', position: {...} }
```

### MSH Header Processing:

The tokenizer has special logic for the MSH segment:

```4:34:packages/hl7v2-parser/src/tokenizer.ts
    this.state = {
      position: { line: 1, column: 1, offset: 0 },
      delimiters: {
        field: '|',
        component: '^',
        repetition: '~',
        subcomponent: '&',
        escape: '\\',
        ...initialDelimiters,
      },
      inMSHHeader: false,
      mshFieldCount: 0,
    };
```

## 3. **The Parser (`StreamingHL7v2Parser`)**

The parser consumes tokens from the tokenizer and builds an AST using a **stack-based approach**:

### Key Concepts:

- **Parse Frames**: Each open construct (segment, field, component, etc.) is a frame on the stack
- **Open/Close Patterns**: Delimiters trigger opening and closing of frames
- **Hierarchical Structure**: Maintains the HL7v2 hierarchy: Segment → Field → FieldRepetition → Component → Subcomponent

### Stack Management:

```typescript
interface ParseFrame {
  type:
    | "root"
    | "segment"
    | "field"
    | "field-repetition"
    | "component"
    | "subcomponent";
  node: Root | Segment | Field | FieldRepetition | Component | Subcomponent;
  startPosition: Position;
}
```

### Token Processing Logic:

```87:126:packages/hl7v2-parser/src/parser.ts
  private processToken(token: HL7v2Token): void {
    switch (token.type) {
      case 'text':
        this.handleText(token.value);
        break;

      case 'segmentDelimiter':
        this.handleSegmentDelimiter(token);
        break;

      case 'fieldDelimiter':
        this.handleFieldDelimiter(token);
        break;

      case 'repetitionDelimiter':
        this.handleRepetitionDelimiter(token);
        break;

      case 'componentDelimiter':
        this.handleComponentDelimiter(token);
        break;

      case 'subcomponentDelimiter':
        this.handleSubcomponentDelimiter(token);
        break;

      case 'mshField':
        this.handleMSHField(token);
        break;

      case 'eof':
        // Handled in main parse loop
        break;

      default:
        // Handle other token types (escape sequences, etc.)
        this.handleText(token.value || '');
        break;
    }
  }
```

## 4. **How They Work Together**

Here's the collaboration flow when parsing an HL7v2 message like:

```
MSH|^~\&|SendingApp|SendingFacility|ReceivingApp||20241201120000||ADT^A01|12345|P|2.5
```

### Step-by-Step Process:

1. **Tokenizer receives**: `"MSH|^~\&|SendingApp|..."`

2. **Tokenizer emits tokens**:

   ```typescript
   { type: 'text', value: 'MSH' }
   { type: 'mshField', fieldNumber: 1, value: '|' }  // MSH.1
   { type: 'mshField', fieldNumber: 2, value: '^~\&' } // MSH.2
   { type: 'fieldDelimiter', value: '|' }
   { type: 'text', value: 'SendingApp' }
   // ... more tokens
   ```

3. **Parser consumes tokens**:
   - `text: 'MSH'` → Accumulates in `currentText`
   - `fieldDelimiter` → Creates segment, field, field-repetition, component frames and flushes text as subcomponent
   - `text: 'SendingApp'` → Accumulates in new `currentText`
   - Next `fieldDelimiter` → Closes to segment level, opens new field hierarchy

4. **Final AST Structure**:

   ```typescript
   {
     type: 'root',
     children: [{
       type: 'segment',
       children: [
         { type: 'field', children: [{ type: 'field-repetition', children: [{ type: 'component', children: [{ type: 'subcomponent', value: 'MSH' }] }] }] },
         { type: 'field', children: [{ type: 'field-repetition', children: [{ type: 'component', children: [{ type: 'subcomponent', value: 'SendingApp' }] }] }] },
         // ... more fields
       ]
     }]
   }
   ```

## 5. **Streaming API**

The `HL7v2StreamingParser` class orchestrates both components:

```16:38:packages/hl7v2-parser/src/streaming.ts
export class HL7v2StreamingParser {
  private tokenizer: StreamingHL7v2Tokenizer;
  private parser: StreamingHL7v2Parser;

  constructor(options: StreamingParseOptions = {}) {
    this.tokenizer = new StreamingHL7v2Tokenizer(options.delimiters);
    this.parser = new StreamingHL7v2Parser(this.tokenizer);
  }

  /**
   * Add chunk of text to parser
   */
  write(chunk: string): void {
    this.tokenizer.write(chunk);
  }

  /**
   * Signal end of input and get the parsed AST
   */
  end(): Root {
    this.tokenizer.end();
    return this.parser.parse();
  }
```

## 6. **Consistent Empty Field Structure**

The parser guarantees a **consistent structure** for all fields, including empty ones:

### Guarantee:

Every component **always** contains at least one subcomponent, even when empty:

```typescript
// Empty field structure
{
  type: 'field',
  children: [{
    type: 'field-repetition',
    children: [{
      type: 'component',
      children: [{
        type: 'subcomponent',
        value: ''  // Always present, even for empty fields
      }]
    }]
  }]
}
```

### Benefits:

- **No ambiguity**: Empty fields are always represented the same way
- **Simplified consumption**: No need to check for missing children AND empty values
- **Type safety**: Consumers can rely on the structure always being present
- **Predictable traversal**: `field.children[0].children[0].children[0]` always exists

### Implementation:

The parser uses helper functions to create consistent structures:

- `createSubcomponent(start)` - Creates an empty subcomponent
- `createComponent(start)` - Creates a component with an initial subcomponent
- `createFieldRepetition(start)` - Creates a repetition with initial component
- `createField(start)` - Creates complete field hierarchy

This ensures that whether a field is explicitly empty or implicitly empty, the AST structure is identical.

## 7. **Key Benefits of This Architecture**

- **Separation of Concerns**: Tokenizer handles character-level parsing, parser handles structure
- **Consistent Structure**: All fields have predictable hierarchy, even when empty
- **Performance**: Single-pass parsing with minimal allocations
- **Flexibility**: Easy to extend with new token types or parsing rules
- **Position Tracking**: Every token and AST node has precise source positions
- **Dynamic Delimiters**: Adapts to different HL7v2 encoding characters

This design makes the parser both **robust** and **efficient**, handling the complexities of HL7v2's variable delimiter system while maintaining clean separation between lexical analysis (tokenization) and syntactic analysis (parsing).
