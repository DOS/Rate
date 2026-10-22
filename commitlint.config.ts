import type { UserConfig } from '@commitlint/types';

// Dependabot writes "Bump x from a to b" and picks the case of "Bump" from its
// own commit history; dependabot.yml cannot change it. Skip only messages in
// that exact form so every other commit keeps the conventional rules
// (DOS/Rate#725).
const DEPENDABOT_SUBJECT =
  /^\w+\(deps(?:-dev)?\): Bump (?:\S+ from \S+ to \S+|the \S+ group\b)/;

const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => DEPENDABOT_SUBJECT.test(message)],
};

module.exports = Configuration;
