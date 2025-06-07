---
description: Debug Production Issue
---

Systematically debug and fix production issues in Rate-Importer.

Context needed: Error description, affected service, logs
Steps:
1. Collect error logs from affected services
2. Check Docker container health and resource usage
3. Verify database connections and queries
4. Review recent deployments and changes
5. Reproduce issue in local environment if possible
6. Add debug logging to pinpoint issue
7. Implement fix with proper error handling
8. Write regression tests
9. Deploy fix with rollback plan
10. Monitor fix effectiveness and update incident log
