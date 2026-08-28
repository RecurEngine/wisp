export interface AgentCapabilities {
  readonly canReadVault: boolean;
  readonly canWriteVault: boolean;
  readonly canUseNetwork: boolean;
  readonly canRecordAudio: boolean;
}

export const MOBILE_AGENT_CAPABILITIES: AgentCapabilities = Object.freeze({
  canReadVault: true,
  canWriteVault: true,
  canUseNetwork: true,
  canRecordAudio: true
});
