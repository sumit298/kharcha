import { allowlistPackages } from './drain';
import { KNOWN_APPS } from './knownApps';

describe('native allowlist', () => {
  it('includes payment and bank apps but never SMS apps (personal messages)', () => {
    const list = allowlistPackages();
    expect(list).toContain('com.google.android.apps.nbu.paisa.user');
    expect(list).toContain('com.snapwork.hdfc');
    for (const app of KNOWN_APPS.filter((a) => a.sourceKind === 'sms_app')) expect(list).not.toContain(app.packageName);
  });
});
