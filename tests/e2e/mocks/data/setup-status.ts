export interface SetupStatus {
  configured: boolean;
  steps: {
    masterKey: { done: boolean };
    linearProject: { done: boolean };
    openaiKey: { done: boolean };
    githubToken: { done: boolean };
  };
}

const DEFAULTS: SetupStatus = {
  configured: true,
  steps: {
    masterKey: { done: true },
    linearProject: { done: true },
    openaiKey: { done: true },
    githubToken: { done: true },
  },
};

export function buildSetupStatus(overrides?: Partial<SetupStatus>): SetupStatus {
  return { ...DEFAULTS, ...overrides };
}

export function buildSetupUnconfigured(): SetupStatus {
  return {
    configured: false,
    steps: {
      masterKey: { done: false },
      linearProject: { done: false },
      openaiKey: { done: false },
      githubToken: { done: false },
    },
  };
}
