// Ambient declarations for the Claude Code Workflow runtime dialect.
// moonshot.js runs inside an async function scope with these injected —
// this file exists only so `tsc --checkJs` (and editors) know about them.
// No import/export: these are deliberately global.

interface WorkflowAgentOptions {
  label?: string;
  phase?: string;
  schema?: object;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  isolation?: 'worktree';
  agentType?: string;
}

/** Spawn a subagent; resolves to its structured output (with schema) or final text. Null if skipped/dead. */
declare function agent(prompt: string, opts?: WorkflowAgentOptions): Promise<any>;
/** Run thunks concurrently; barrier — failed thunks resolve to null. */
declare function parallel(thunks: Array<() => Promise<any>>): Promise<any[]>;
/** Run each item through all stages independently, no barrier between stages. */
declare function pipeline(
  items: any[],
  ...stages: Array<(prev: any, item: any, index: number) => any>
): Promise<any[]>;
/** Start a new progress-display phase. */
declare function phase(title: string): void;
/** Emit a progress message to the user. */
declare function log(message: string): void;
/** Run another workflow inline (one level deep only). */
declare function workflow(nameOrRef: string | { scriptPath: string }, args?: any): Promise<any>;
/** Token budget from a "+500k"-style directive; total is null if none set. */
declare const budget: { total: number | null; spent(): number; remaining(): number };
/** Workflow input, verbatim; some callers deliver it as a JSON-encoded string. */
declare const args: any;
