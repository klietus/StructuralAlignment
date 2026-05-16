export interface PromptFile {
  filename: string
  path: string
}

export interface PromptEntry {
  id: number
  name: string
  description: string
  prompt: string
}

export interface EntropyDataPoint {
  timestamp: number
  testId: number
  format: 'symbolic' | 'control'
  tokenIndex: number
  logprob: number
  cumulativeEntropy: number
  incrementalEntropy: number
}

export interface FormatComponents {
  triads: boolean
  macro: boolean
  facets: boolean
  linked_patterns: boolean
  lattice: boolean
  persona: boolean
  symbol_id: boolean
  activation_conditions: boolean
  failure_mode: boolean
  kind: boolean
  domain_invariants: boolean
  system_invariants: boolean
}

export interface LMStudioConfig {
  url: string
  model: string
  temperature: number
  maxTokens: number
  topP: number
}

export interface TestResult {
  testId: number
  format: 'symbolic' | 'control'
  promptLength: number
  responseLength: number
  totalEntropy: number
  avgEntropyPerToken: number
  maxEntropy: number
  minEntropy: number
  medianEntropy: number
  logprobs: any
  timestamp: number
}

// Type declaration for the electron API exposed via contextBridge
interface ElectronAPI {
  'get-prompt-files': () => Promise<PromptFile[]>
  'read-prompt': (filePath: string) => Promise<PromptEntry>
  'read-seed-domain': () => Promise<any>
  'send-to-lmstudio': (params: {
    url: string
    prompt: string
    model: string
    options?: Record<string, any>
  }) => Promise<any>
  'send-chat-to-lmstudio': (params: {
    url: string
    messages: Array<{ role: string; content: string }>
    model: string
    options?: Record<string, any>
  }) => Promise<any>
  'calculate-entropy': (logprobsData: any) => Promise<EntropyDataPoint[]>
  'save-entropy-tsd': (results: EntropyDataPoint[]) => Promise<string>
  'read-entropy-tsd': () => Promise<EntropyDataPoint[] | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
