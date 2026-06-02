import { describe, it, expect } from 'vitest';
import { urlBlockedReason, ipIsPrivate } from '../src/ssrf-guard.js';

describe('ipIsPrivate', () => {
  for (const ip of [
    '127.0.0.1', '127.1.2.3',
    '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // AWS IMDS
    '169.254.170.2',
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1', // multicast
    '240.0.0.1', // reserved
    '::1', // IPv6 loopback
    'fe80::1', // link-local v6
    'fc00::1', // ULA
    'ff00::1', // multicast v6
  ]) {
    it(`blocks ${ip}`, () => {
      expect(ipIsPrivate(ip)).toBe(true);
    });
  }

  for (const ip of ['1.1.1.1', '8.8.8.8', '209.16.158.254', '2606:4700:4700::1111']) {
    it(`allows public ${ip}`, () => {
      expect(ipIsPrivate(ip)).toBe(false);
    });
  }
});

describe('urlBlockedReason', () => {
  it('blocks file://', async () => {
    const r = await urlBlockedReason('file:///etc/passwd');
    expect(r).toMatch(/Only http/);
  });
  it('blocks gopher://', async () => {
    const r = await urlBlockedReason('gopher://internal:6379/');
    expect(r).toMatch(/Only http/);
  });
  it('blocks 127.0.0.1 literal IP', async () => {
    const r = await urlBlockedReason('http://127.0.0.1:8080/');
    expect(r).toMatch(/Refusing|private/);
  });
  it('blocks AWS IMDS literal IP', async () => {
    const r = await urlBlockedReason('http://169.254.169.254/latest/meta-data/');
    expect(r).toMatch(/Refusing|private/);
  });
  it('blocks localhost hostname', async () => {
    const r = await urlBlockedReason('http://localhost:8080/');
    expect(r).toMatch(/internal infrastructure/);
  });
  it('blocks metadata.google.internal', async () => {
    const r = await urlBlockedReason('http://metadata.google.internal/');
    expect(r).toMatch(/internal infrastructure/);
  });
  it('rejects oversized URL', async () => {
    const r = await urlBlockedReason('https://example.com/' + 'a'.repeat(3000));
    expect(r).toMatch(/too long/);
  });
  it('rejects malformed URL', async () => {
    const r = await urlBlockedReason('not-a-url');
    expect(r).not.toBeNull();
  });
});
