# Contributing to RateBox Platform

## 🤝 Welcome Contributors

Thank you for your interest in Contributing.md to RateBox! This guide will help you get started with Contributing.md to the Platform.

## 📋 Types of Contributions

### Documentation
- Fix typos and improve clarity
- Add missing documentation
- Update outdated information
- Translate documentation
- Add code examples

### Code Contributions
- Bug fixes
- New features
- Performance improvements
- Test coverage
- Code refactoring

### Community
- Answer questions in discussions
- Help with issue triage
- Share usage examples
- Report bugs and issues

## 🚀 Getting Started

### 1. Fork and Clone

```powershell
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/RateBox-Docs.git
cd RateBox-Docs

# Add upstream remote
git remote add upstream https://github.com/RateBox/Docs.git
```

### 2. Set Up Development Environment

```powershell
# Follow the Development-Setup.md guide
cat Guides/Development-Setup.md

# Install dependencies for the Modules you're working on
cd ../RateNew && pnpm install
cd ../RateImporter && npm install
```

### 3. Create a Branch

```powershell
# Create a feature branch
git checkout -b feature/your-feature-name

# Or for documentation updates
git checkout -b docs/update-section-name
```

## 📝 Documentation Guidelines

### Writing Style
- Use clear, concise language
- Write in second person ("you") for instructions
- Use active voice when possible
- Include code examples where relevant
- Test all code examples before submitting

### Structure
- Use consistent heading hierarchy
- Include table of contents for long documents
- Add cross-references to related documentation
- Use emoji sparingly but consistently

### Markdown Standards
```markdown
# Main Title (H1)
## Section (H2)
### Subsection (H3)

**Bold for emphasis**
*Italic for terms*
`code` for inline code
```

### Code Examples
```powershell
# Always include language specification
# Use PowerShell for Windows commands
# Include comments explaining complex steps
npm install package-name
```

## 💻 Code Contribution Guidelines

### Code Style

**TypeScript/JavaScript:**
```typescript
// Use TypeScript for new code
// Follow existing code style
// Include proper type definitions
interface ContributionExample {
  name: string;
  type: 'feature' | 'bugfix' | 'docs';
  description: string;
}
```

**Commit Messages:**
```
type(scope): description

feat(crawler): add proxy rotation support
fix(api): resolve validation error handling
docs(setup): update Development-Setup.md guide
test(integration): add crawler API tests
```

### Testing Requirements

**Unit Tests:**
```powershell
# Run tests before submitting
npm test
pnpm test

# Add tests for new features
# Maintain test coverage above 80%
```

**Integration Tests:**
```powershell
# Test module integration
npm run test:integration

# Test end-to-end workflows
npm run test:e2e
```

## 🔄 Contribution Workflow

### 1. Issue First
- Check existing issues before creating new ones
- Use issue templates when available
- Provide clear reproduction steps for bugs
- Discuss major changes before implementing

### 2. Development Process
```powershell
# Keep your fork updated
git fetch upstream
git checkout main
git merge upstream/main

# Work on your feature
git checkout -b feature/new-feature
# Make changes
git add .
git commit -m "feat(Modules): add new feature"

# Push to your fork
git push origin feature/new-feature
```

### 3. Pull Request Process
1. **Create PR**: Submit pull request to main repository
2. **Description**: Use PR template, explain changes clearly
3. **Review**: Address feedback from maintainers
4. **Tests**: Ensure all tests pass
5. **Merge**: Maintainer will merge after approval

## 📦 Module-Specific Guidelines

### RateNew (Core Platform)
- Follow Strapi plugin development guidelines
- Use Next.js 14+ App Router patterns
- Implement proper error boundaries
- Add TypeScript types for all APIs

### RateImporter (Crawler)
- Test with FlareSolverr integration
- Handle rate limiting and retries
- Validate all scraped data
- Document new data Resources

### RateExtension (Browser Extension)
- Follow browser extension best practices
- Test across Chrome, Firefox, Edge
- Implement proper content security policy
- Handle cross-origin requests properly

## 🧪 Testing Guidelines

### Test Categories

**Unit Tests:**
```typescript
// Test individual functions/classes
describe('DataValidator', () => {
  it('should validate phone numbers correctly', () => {
    const validator = new DataValidator();
    expect(validator.isValidPhone('0901234567')).toBe(true);
  });
});
```

**Integration Tests:**
```typescript
// Test module interactions
describe('Crawler Integration', () => {
  it('should submit data to API successfully', async () => {
    const data = await crawler.scrape('test-url');
    const response = await api.submit(data);
    expect(response.status).toBe(200);
  });
});
```

**E2E Tests:**
```typescript
// Test complete user workflows
test('should process crawler data to dashboard', async () => {
  await crawler.start();
  await waitFor(() => dashboard.hasNewData());
  expect(dashboard.getRecentReports()).toHaveLength(1);
});
```

## 📋 Review Process

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No breaking changes without discussion
- [ ] Performance impact considered
- [ ] Security implications reviewed

### Documentation Review
- [ ] Information is accurate and up-to-date
- [ ] Writing is clear and concise
- [ ] Code examples work as expected
- [ ] Cross-references are correct
- [ ] Structure follows guidelines

## 🏷️ Issue Labels

### Priority
- `priority:high` - Critical bugs or security issues
- `priority:medium` - Important features or bugs
- `priority:low` - Nice-to-have improvements

### Type
- `type:bug` - Something isn't working
- `type:feature` - New feature request
- `type:docs` - Documentation improvements
- `type:performance` - Performance improvements

### Module
- `Modules:Rate-New` - Core Platform issues
- `Modules:Rate-Importer` - Crawler Modules issues
- `Modules:Rate-Extension` - Browser extension issues
- `Modules:docs` - Documentation repository issues

## 🎯 Recognition

### Contributors
- All contributors are recognized in release notes
- Significant contributors get maintainer status
- Community contributors get special recognition

### Maintainers
Current maintainers:
- **Platform Lead**: [Maintainer Name]
- **Documentation**: [Maintainer Name]
- **Crawler Module**: [Maintainer Name]

## 📞 Getting Help

### Community Support
- **GitHub Discussions**: Ask questions and share ideas
- **Discord**: Real-time chat with community
- **Issues**: Report bugs and request features

### Maintainer Contact
- **Email**: maintainers@ratebox.Platform
- **Discord**: @RateBoxMaintainers
- **GitHub**: @RateBoxTeam

## 📄 License

By contributing to RateBox, you agree that your contributions will be licensed under the same license as the project (MIT License).

### Contributor License Agreement
- You have the right to contribute the code/documentation
- You grant RateBox rights to use your contribution
- Your contribution is provided "as-is" without warranties

---

**Thank you for contributing to RateBox!** 🎉

Your contributions help make fraud detection more accessible and effective for everyone.
