import { Injectable } from '@nestjs/common';

const ONLINE_WINDOW_MS = 60_000;

/**
 * Tracks which support agents are online per tenant using a last-heartbeat timestamp map
 * (with Redis/in-memory compatibility). The agent inbox WebSocket gateway calls `heartbeat()`
 * when an agent joins or interacts with the tenant inbox.
 */
@Injectable()
export class PresenceService {
  private readonly tenantAgents = new Map<string, Map<string, number>>();

  async heartbeat(tenantId: string, agentId: string): Promise<void> {
    let agents = this.tenantAgents.get(tenantId);
    if (!agents) {
      agents = new Map<string, number>();
      this.tenantAgents.set(tenantId, agents);
    }
    agents.set(agentId, Date.now());
  }

  async goOffline(tenantId: string, agentId: string): Promise<void> {
    this.tenantAgents.get(tenantId)?.delete(agentId);
  }

  async onlineCount(tenantId: string): Promise<number> {
    const agents = this.tenantAgents.get(tenantId);
    if (!agents) return 0;

    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    for (const [agentId, lastSeen] of agents.entries()) {
      if (lastSeen < cutoff) {
        agents.delete(agentId);
      }
    }
    return agents.size;
  }
}
