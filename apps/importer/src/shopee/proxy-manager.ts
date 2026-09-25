import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ProxyConfig {
  server: string;
  port: number;
  username?: string;
  password?: string;
  resetUrl?: string;
}

export const DEFAULT_MPROXY_CONFIG: ProxyConfig = {
  server: 'ip.mproxy.vn',
  port: 12103,
  username: 'JOY',
  password: '***REMOVED-SECRET***',
  resetUrl: 'https://mproxy.vn/capi/KteNfKBqVRx8aJ9lGNuQb1Dk7BjfXwhKXKx0Gf2IwlQ/key/***REMOVED-SECRET***/resetIp',
};

export class ProxyManager {
  private config: ProxyConfig;
  private agent: HttpsProxyAgent<string>;

  constructor(config: Partial<ProxyConfig> = {}) {
    this.config = { ...DEFAULT_MPROXY_CONFIG, ...config };
    const auth = this.config.username && this.config.password
      ? `${this.config.username}:${this.config.password}@`
      : '';
    const proxyUrl = `http://${auth}${this.config.server}:${this.config.port}`;
    this.agent = new HttpsProxyAgent(proxyUrl);
  }

  public getProxyServerString(): string {
    return `http://${this.config.server}:${this.config.port}`;
  }

  public getCredentials() {
    return {
      username: this.config.username || '',
      password: this.config.password || '',
    };
  }

  /**
   * Get the current public IP routed through the proxy
   */
  public async getCurrentIp(timeoutMs = 12000): Promise<string | null> {
    return new Promise((resolve) => {
      const req = https.get(
        'https://api.ipify.org?format=json',
        { agent: this.agent, timeout: timeoutMs },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.ip || null);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Trigger 4G IP rotation via MProxy API
   */
  public async rotateIp(waitForReconnection = true): Promise<{ success: boolean; newIp?: string; message?: string }> {
    if (!this.config.resetUrl) {
      return { success: false, message: 'No resetUrl configured' };
    }

    console.log('[ProxyManager] Requesting 4G IP rotation via MProxy API...');
    const oldIp = await this.getCurrentIp().catch(() => null);
    console.log(`[ProxyManager] Current IP before rotation: ${oldIp || 'unknown'}`);

    const resetResult = await new Promise<{ status?: number; code?: number; message?: string; data?: any }>((resolve) => {
      https.get(this.config.resetUrl!, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ message: data });
          }
        });
      }).on('error', (err) => resolve({ message: err.message }));
    });

    console.log('[ProxyManager] MProxy reset response:', resetResult.message || JSON.stringify(resetResult));

    // If cooldown is active, do not wait for new IP, retain current IP
    if (resetResult.code === 0 || resetResult.message?.includes('quá nhanh')) {
      const waitSec = resetResult.data?.remaining_time || 60;
      console.warn(`[ProxyManager] ⚠️ Reset on cooldown (${waitSec}s remaining). Continuing with current IP: ${oldIp}`);
      return { success: false, newIp: oldIp || undefined, message: resetResult.message };
    }

    if (!waitForReconnection) {
      return { success: true, message: resetResult.message };
    }

    // Wait for mobile dongle to disconnect and obtain new IP (typically 5-12 seconds)
    console.log('[ProxyManager] Waiting for 4G connection to settle with new IP...');
    const startTime = Date.now();
    let newIp: string | null = null;

    // Wait initial 4s before polling
    await new Promise((r) => setTimeout(r, 4000));

    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      newIp = await this.getCurrentIp(6000);
      if (newIp && newIp !== oldIp) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[ProxyManager] ✅ New 4G IP acquired: ${newIp} (took ${elapsed}s)`);
        return { success: true, newIp };
      }
      console.log(`[ProxyManager] Waiting for new IP... (attempt ${attempt}/10)`);
    }

    return {
      success: !!newIp,
      newIp: newIp || undefined,
      message: newIp ? 'IP obtained (may be same)' : 'Timeout waiting for new IP',
    };
  }

  /**
   * Launch Chrome Stable with CDP and MProxy
   */
  public async launchChromeWithProxy(port = 9222, profileDir = 'C:\\chrome_bot_profile'): Promise<boolean> {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const proxyServer = this.getProxyServerString();

    console.log(`[ProxyManager] Launching Chrome CDP on port ${port} with proxy ${proxyServer}...`);
    const proc = spawn(
      chromePath,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        `--proxy-server=${proxyServer}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
      ],
      { detached: true, stdio: 'ignore' }
    );
    proc.unref();

    // Poll until CDP is available
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const ok = await new Promise<boolean>((resolve) => {
        http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
          resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
      });
      if (ok) {
        console.log(`[ProxyManager] Chrome CDP is ready on port ${port}!`);
        return true;
      }
    }

    console.warn(`[ProxyManager] Chrome CDP on port ${port} did not respond within timeout.`);
    return false;
  }
}
