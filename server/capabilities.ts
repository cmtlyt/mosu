export interface Capability {
  name: string;
  description: string;
  endpoint: string;
  enabled: boolean;
}

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  public register(capability: Capability): void {
    this.capabilities.set(capability.name, capability);
  }

  public get(name: string): Capability | undefined {
    return this.capabilities.get(name);
  }

  public getAll(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  public isEnabled(name: string): boolean {
    const capability = this.capabilities.get(name);
    return capability?.enabled ?? false;
  }
}

export const capabilityRegistry = new CapabilityRegistry();
