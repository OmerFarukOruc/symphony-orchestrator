import { type Static } from "@sinclair/typebox";
export declare const ErrorEnvelopeSchema: import("@sinclair/typebox").TObject<{
  error: import("@sinclair/typebox").TObject<{
    code: import("@sinclair/typebox").TString;
    message: import("@sinclair/typebox").TString;
  }>;
}>;
export declare const RuntimeResponseSchema: import("@sinclair/typebox").TObject<{
  version: import("@sinclair/typebox").TString;
  workflow_path: import("@sinclair/typebox").TString;
  data_dir: import("@sinclair/typebox").TString;
  feature_flags: import("@sinclair/typebox").TRecord<
    import("@sinclair/typebox").TString,
    import("@sinclair/typebox").TBoolean
  >;
  provider_summary: import("@sinclair/typebox").TString;
}>;
export declare const RefreshResponseSchema: import("@sinclair/typebox").TObject<{
  queued: import("@sinclair/typebox").TBoolean;
  coalesced: import("@sinclair/typebox").TBoolean;
  requested_at: import("@sinclair/typebox").TString;
}>;
export declare const TokenTotalsSchema: import("@sinclair/typebox").TObject<{
  input_tokens: import("@sinclair/typebox").TNumber;
  output_tokens: import("@sinclair/typebox").TNumber;
  total_tokens: import("@sinclair/typebox").TNumber;
  seconds_running: import("@sinclair/typebox").TNumber;
}>;
export declare const RuntimeIssueViewSchema: import("@sinclair/typebox").TObject<{
  issueId: import("@sinclair/typebox").TString;
  identifier: import("@sinclair/typebox").TString;
  title: import("@sinclair/typebox").TString;
  state: import("@sinclair/typebox").TString;
  workspaceKey: import("@sinclair/typebox").TUnion<
    [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
  >;
  workspacePath: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  message: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>;
  status: import("@sinclair/typebox").TString;
  updatedAt: import("@sinclair/typebox").TString;
  attempt: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>;
  error: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>;
  priority: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
  >;
  labels: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
  >;
  startedAt: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  lastEventAt: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
  model: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  reasoningEffort: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  modelSource: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  configuredModel: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  configuredReasoningEffort: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  configuredModelSource: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
  url: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  description: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  blockedBy: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
  >;
  branchName: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  pullRequestUrl: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  nextRetryDueAt: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  createdAt: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
}>;
export declare const RuntimeEventSchema: import("@sinclair/typebox").TObject<{
  at: import("@sinclair/typebox").TString;
  issue_id: import("@sinclair/typebox").TUnion<
    [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
  >;
  issue_identifier: import("@sinclair/typebox").TUnion<
    [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
  >;
  session_id: import("@sinclair/typebox").TUnion<
    [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
  >;
  event: import("@sinclair/typebox").TString;
  message: import("@sinclair/typebox").TString;
  content: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
  >;
  metadata: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
}>;
export declare const WorkflowColumnSchema: import("@sinclair/typebox").TObject<{
  key: import("@sinclair/typebox").TString;
  label: import("@sinclair/typebox").TString;
  kind: import("@sinclair/typebox").TString;
  terminal: import("@sinclair/typebox").TBoolean;
  count: import("@sinclair/typebox").TNumber;
  issues: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      issueId: import("@sinclair/typebox").TString;
      identifier: import("@sinclair/typebox").TString;
      title: import("@sinclair/typebox").TString;
      state: import("@sinclair/typebox").TString;
      workspaceKey: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      workspacePath: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      message: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      status: import("@sinclair/typebox").TString;
      updatedAt: import("@sinclair/typebox").TString;
      attempt: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
      >;
      error: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      priority: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
      >;
      labels: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
      >;
      startedAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      lastEventAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
      model: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      reasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModel: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredReasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
      url: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      description: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      blockedBy: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
      >;
      branchName: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      pullRequestUrl: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      nextRetryDueAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      createdAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
    }>
  >;
}>;
export declare const RuntimeStateResponseSchema: import("@sinclair/typebox").TObject<{
  generated_at: import("@sinclair/typebox").TString;
  counts: import("@sinclair/typebox").TObject<{
    running: import("@sinclair/typebox").TNumber;
    retrying: import("@sinclair/typebox").TNumber;
  }>;
  queued: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      issueId: import("@sinclair/typebox").TString;
      identifier: import("@sinclair/typebox").TString;
      title: import("@sinclair/typebox").TString;
      state: import("@sinclair/typebox").TString;
      workspaceKey: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      workspacePath: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      message: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      status: import("@sinclair/typebox").TString;
      updatedAt: import("@sinclair/typebox").TString;
      attempt: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
      >;
      error: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      priority: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
      >;
      labels: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
      >;
      startedAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      lastEventAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
      model: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      reasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModel: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredReasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
      url: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      description: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      blockedBy: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
      >;
      branchName: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      pullRequestUrl: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      nextRetryDueAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      createdAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
    }>
  >;
  running: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      issueId: import("@sinclair/typebox").TString;
      identifier: import("@sinclair/typebox").TString;
      title: import("@sinclair/typebox").TString;
      state: import("@sinclair/typebox").TString;
      workspaceKey: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      workspacePath: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      message: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      status: import("@sinclair/typebox").TString;
      updatedAt: import("@sinclair/typebox").TString;
      attempt: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
      >;
      error: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      priority: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
      >;
      labels: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
      >;
      startedAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      lastEventAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
      model: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      reasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModel: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredReasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
      url: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      description: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      blockedBy: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
      >;
      branchName: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      pullRequestUrl: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      nextRetryDueAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      createdAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
    }>
  >;
  retrying: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      issueId: import("@sinclair/typebox").TString;
      identifier: import("@sinclair/typebox").TString;
      title: import("@sinclair/typebox").TString;
      state: import("@sinclair/typebox").TString;
      workspaceKey: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      workspacePath: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      message: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      status: import("@sinclair/typebox").TString;
      updatedAt: import("@sinclair/typebox").TString;
      attempt: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
      >;
      error: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      priority: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
      >;
      labels: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
      >;
      startedAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      lastEventAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
      model: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      reasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModel: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredReasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
      url: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      description: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      blockedBy: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
      >;
      branchName: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      pullRequestUrl: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      nextRetryDueAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      createdAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
    }>
  >;
  completed: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      issueId: import("@sinclair/typebox").TString;
      identifier: import("@sinclair/typebox").TString;
      title: import("@sinclair/typebox").TString;
      state: import("@sinclair/typebox").TString;
      workspaceKey: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      workspacePath: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      message: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      status: import("@sinclair/typebox").TString;
      updatedAt: import("@sinclair/typebox").TString;
      attempt: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
      >;
      error: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      priority: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
      >;
      labels: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
      >;
      startedAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      lastEventAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
      model: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      reasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModel: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredReasoningEffort: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      configuredModelSource: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
      url: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      description: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      blockedBy: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
      >;
      branchName: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      pullRequestUrl: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      nextRetryDueAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      createdAt: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
    }>
  >;
  workflow_columns: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      key: import("@sinclair/typebox").TString;
      label: import("@sinclair/typebox").TString;
      kind: import("@sinclair/typebox").TString;
      terminal: import("@sinclair/typebox").TBoolean;
      count: import("@sinclair/typebox").TNumber;
      issues: import("@sinclair/typebox").TArray<
        import("@sinclair/typebox").TObject<{
          issueId: import("@sinclair/typebox").TString;
          identifier: import("@sinclair/typebox").TString;
          title: import("@sinclair/typebox").TString;
          state: import("@sinclair/typebox").TString;
          workspaceKey: import("@sinclair/typebox").TUnion<
            [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
          >;
          workspacePath: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          message: import("@sinclair/typebox").TUnion<
            [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
          >;
          status: import("@sinclair/typebox").TString;
          updatedAt: import("@sinclair/typebox").TString;
          attempt: import("@sinclair/typebox").TUnion<
            [import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]
          >;
          error: import("@sinclair/typebox").TUnion<
            [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
          >;
          priority: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TNumber, import("@sinclair/typebox").TNull]>
          >;
          labels: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>
          >;
          startedAt: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          lastEventAt: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          tokenUsage: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
          model: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          reasoningEffort: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          modelSource: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          configuredModel: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          configuredReasoningEffort: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          configuredModelSource: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          modelChangePending: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
          url: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          description: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          blockedBy: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
          >;
          branchName: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          pullRequestUrl: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          nextRetryDueAt: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
          createdAt: import("@sinclair/typebox").TOptional<
            import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
          >;
        }>
      >;
    }>
  >;
  codex_totals: import("@sinclair/typebox").TObject<{
    input_tokens: import("@sinclair/typebox").TNumber;
    output_tokens: import("@sinclair/typebox").TNumber;
    total_tokens: import("@sinclair/typebox").TNumber;
    seconds_running: import("@sinclair/typebox").TNumber;
  }>;
  rate_limits: import("@sinclair/typebox").TUnknown;
  recent_events: import("@sinclair/typebox").TArray<
    import("@sinclair/typebox").TObject<{
      at: import("@sinclair/typebox").TString;
      issue_id: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      issue_identifier: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      session_id: import("@sinclair/typebox").TUnion<
        [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
      >;
      event: import("@sinclair/typebox").TString;
      message: import("@sinclair/typebox").TString;
      content: import("@sinclair/typebox").TOptional<
        import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]>
      >;
      metadata: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
    }>
  >;
  stall_events: import("@sinclair/typebox").TOptional<
    import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>
  >;
  system_health: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnknown>;
}>;
export declare const AbortResponseSchema: import("@sinclair/typebox").TObject<{
  ok: import("@sinclair/typebox").TBoolean;
  status: import("@sinclair/typebox").TString;
  already_stopping: import("@sinclair/typebox").TBoolean;
  requested_at: import("@sinclair/typebox").TString;
}>;
export declare const AttemptListResponseSchema: import("@sinclair/typebox").TObject<{
  attempts: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TUnknown>;
  current_attempt_id: import("@sinclair/typebox").TUnion<
    [import("@sinclair/typebox").TString, import("@sinclair/typebox").TNull]
  >;
}>;
export declare const OpenApiDocumentSchema: import("@sinclair/typebox").TObject<{
  openapi: import("@sinclair/typebox").TString;
  info: import("@sinclair/typebox").TObject<{
    title: import("@sinclair/typebox").TString;
    version: import("@sinclair/typebox").TString;
  }>;
  paths: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TUnknown>;
}>;
export type ErrorEnvelope = Static<typeof ErrorEnvelopeSchema>;
export type RuntimeResponse = Static<typeof RuntimeResponseSchema>;
export type RefreshResponse = Static<typeof RefreshResponseSchema>;
export type RuntimeStateResponse = Static<typeof RuntimeStateResponseSchema>;
export type AbortResponse = Static<typeof AbortResponseSchema>;
export type AttemptListResponse = Static<typeof AttemptListResponseSchema>;
export type OpenApiDocument = Static<typeof OpenApiDocumentSchema>;
//# sourceMappingURL=contracts.d.ts.map
