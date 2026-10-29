import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTHORIZATION } from '../src/types/job';

describe('authorization gates', () => {
  it('defaults all collection authorizations to false', () => {
    expect(DEFAULT_AUTHORIZATION.tosAcknowledged).toBe(false);
    expect(DEFAULT_AUTHORIZATION.automatedTraversalAuthorized).toBe(false);
    expect(DEFAULT_AUTHORIZATION.profileEnrichmentAuthorized).toBe(false);
  });

  it('automated mode requires both tos and automated flags', () => {
    const auth = { ...DEFAULT_AUTHORIZATION, tosAcknowledged: true };
    const canAuto =
      auth.tosAcknowledged && auth.automatedTraversalAuthorized;
    expect(canAuto).toBe(false);
    auth.automatedTraversalAuthorized = true;
    expect(auth.tosAcknowledged && auth.automatedTraversalAuthorized).toBe(true);
  });
});
