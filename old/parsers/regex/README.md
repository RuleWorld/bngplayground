# Deprecated Regex-Based Parser

⚠️ **DEPRECATED** - This folder contains the old regex-based BNGL parser.

## Do Not Use

Use the ANTLR-based parser instead:

```typescript
import { parseBNGLWithANTLR } from '@bngplayground/engine';

const result = parseBNGLWithANTLR(bnglContent);
if (result.success) {
  const model = result.model;
  // ...
}
```

## Why ANTLR?

- **More accurate parsing** - Grammar-based parsing handles edge cases better
- **Better error messages** - Syntax errors are reported with location information
- **Maintainable** - Grammar file (`BNGL.g4`) is easier to extend than regex patterns
- **BNG2.pl parity** - ANTLR parser matches BNG2.pl behavior more closely

## Files in this folder

- `parseBNGL.ts` - The main regex parser (deprecated)
- `parseBNGL_Legacy.ts` - An even older version (deprecated)
