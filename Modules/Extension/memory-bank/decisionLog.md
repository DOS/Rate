# Decision Log - Rate-Extension

## Technical Decisions

### [2025-06-07 15:30] - Shopee Selector Strategy
**Decision**: Implement multiple fallback selectors with shadow DOM support
**Rationale**: Shopee frequently changes DOM structure and class names
**Alternatives Considered**: 
- Single robust selector → Too fragile
- XPath selectors → Performance concerns
**Implications**: More resilient to platform changes, slight performance overhead

### [2025-06-07 15:35] - Review Variant Field Naming
**Decision**: Use `reviewVariant` instead of `variant` or `warehouse`
**Rationale**: 
- Clear distinction from product warehouse info
- Indicates user-selected variation at purchase time
- Avoids confusion with product-level attributes
**Implications**: Better data clarity for analysis and comparison

### [2025-06-07 16:00] - Memory Bank Implementation
**Decision**: Create memory-bank directory structure per global rules
**Rationale**: Consistent project documentation and context tracking
**Implications**: Better continuity across development sessions

## Architecture Decisions

### Chrome Extension Manifest V3
**Decision**: Use Manifest V3 architecture
**Rationale**: Future-proof, required by Chrome Web Store
**Trade-offs**: Service workers instead of persistent background pages

### Content Script Approach
**Decision**: Passive extraction triggered by user action
**Rationale**: 
- Respect user privacy
- Avoid performance impact
- Comply with Chrome policies
**Alternative**: Auto-extraction on page load (rejected)

## Implementation Patterns

### Defensive DOM Querying
**Pattern**: Try multiple selectors in order of likelihood
**Benefits**: Resilience to DOM changes
**Example**: Price extraction with 5+ fallback selectors

### Platform-Specific Logging
**Pattern**: Prefix logs with platform name [Shopee], [Lazada]
**Benefits**: Easier debugging across platforms

---
*Last updated: 2025-06-07*
