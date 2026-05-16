import { useState, useCallback, useEffect, useRef } from 'react'
import type { PromptEntry, LMStudioConfig, FormatComponents, TestResult, EntropyDataPoint } from './preload-api'

const DATA_DIR = '/data'

const SYSTEM_INVARIANTS = [
  'non-coercion', 'reality-alignment', 'no-silent-mutation', 'auditability',
  'explicit-choice', 'baseline-integrity', 'drift-detection', 'agency'
]

const DEFAULT_FORMAT_COMPONENTS: FormatComponents = {
  triads: true,
  macro: true,
  facets: true,
  linked_patterns: true,
  lattice: true,
  persona: true,
  symbol_id: true,
  activation_conditions: true,
  failure_mode: true,
  kind: true,
  domain_invariants: true,
  system_invariants: true
}

const DEFAULT_LMSTUDIO_CONFIG: LMStudioConfig = {
  url: 'http://localhost:1234',
  model: 'local-model',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95
}

const SYSTEM_PROMPT_BASE = `You are an analytical assistant. Analyze the following request with precision and depth. Provide a detailed, structured response. Respond in markdown format.`

const SYSTEM_PROMPT_SYMBOLIC = `You are a symbolic analysis assistant. Bind your response to your active symbol catalog. Analyze the following request with precision and depth. Provide a detailed, structured response. Respond in markdown format.`

interface RunResult {
  id: string
  timestamp: number
  promptId: number
  format: 'control' | 'symbolic'
  promptText: string
  responseText: string
  result: TestResult
  entropyData: EntropyDataPoint[]
}

async function loadPromptFiles(): Promise<Array<{ filename: string; path: string }>> {
  const res = await fetch('/data/prompts/')
  if (res.ok) {
    const files = await res.json()
    return files.map((f: string) => ({ filename: f, path: `/data/prompts/${f}` }))
  }
  const files = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']
  return files.map(f => ({ filename: `${f}.json`, path: `/data/prompts/${f}.json` }))
}

async function loadPrompt(path: string): Promise<PromptEntry> {
  const res = await fetch(path)
  return await res.json()
}

async function loadSeedDomain(): Promise<any> {
  const res = await fetch('/data/seed/narrative_psychology.json')
  if (!res.ok) return null
  return await res.json()
}

async function sendToLMStudio(config: LMStudioConfig, messages: Array<{ role: string; content: string }>): Promise<any> {
  const url = config.url.endsWith('/') ? config.url : config.url + '/'
  const res = await fetch(url + 'v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      input: messages.map(m => ({ role: m.role, content: [{ type: 'input_text', text: m.content }] })),
      temperature: config.temperature,
      max_output_tokens: config.maxTokens,
      top_p: config.topP,
      include: ['message.output_text.logprobs'],
      top_logprobs: 5,
      reasoning: { effort: 'none' }
    })
  })
  if (!res.ok) throw new Error(`LMStudio API error: ${res.status} ${await res.text()}`)
  return await res.json()
}

function calculateEntropy(response: any, format: 'control' | 'symbolic'): EntropyDataPoint[] {
  const results: EntropyDataPoint[] = []
  const timestamp = Date.now()
  let tokenLogprobs: number[] = []

  // Parse /v1/responses format: output[].content[].logprobs
  const output = response?.output || []
  let responseText = ''
  for (const item of output) {
    if (item?.type === 'message' && item?.content) {
      for (const content of item.content) {
        if (content?.type === 'output_text') {
          if (content?.logprobs) {
            tokenLogprobs = content.logprobs.map((e: any) => e.logprob ?? 0)
            console.log(`[Entropy] ${format}: got ${tokenLogprobs.length} logprobs, range [${Math.min(...tokenLogprobs).toFixed(3)}, ${Math.max(...tokenLogprobs).toFixed(3)}]`)
          }
          if (!responseText && content?.text) responseText = content.text
        }
      }
    }
  }

  if (tokenLogprobs.length === 0) {
    console.warn(`[Entropy] ${format}: no logprobs — response text: ${responseText.length} chars, keys:`, response ? Object.keys(response) : 'null')
    if (responseText.length === 0) {
      console.warn('[Entropy] ' + format + ': empty response — no entropy data')
      return results
    }
    const charFreq: Record<string, number> = {}
    for (const ch of responseText) charFreq[ch] = (charFreq[ch] || 0) + 1
    const total = responseText.length
    for (let i = 0; i < responseText.length; i++) {
      const p = charFreq[responseText[i]] / total
      tokenLogprobs.push(Math.log2(p))
    }
  }

  let cumulativeEntropy = 0
  for (let i = 0; i < tokenLogprobs.length; i++) {
    const logprob = tokenLogprobs[i]
    const incremental = -logprob
    cumulativeEntropy += incremental
    results.push({
      testId: 0, format: format as 'control' | 'symbolic', tokenIndex: i,
      logprob, cumulativeEntropy, incrementalEntropy: incremental, timestamp
    })
  }
  console.log(`[Entropy] ${format}: total=${cumulativeEntropy.toFixed(2)} bits, avg=${(cumulativeEntropy / tokenLogprobs.length).toFixed(4)} bits/tok, tokens=${tokenLogprobs.length}`)
  return results
}

function buildSymbolicDomainInjection(seedData: any, components: FormatComponents, selectedIds?: Set<string>): string {
  if (!seedData?.symbols) return ''
  const TOPOLOGY_MAP: Record<string, string> = {
    'inductive': '♻️', 'deductive': '⬇️', 'bidirectional': '⇄',
    'invariant': '🔒', 'energy': '⚡'
  }
  const CLOSURE_MAP: Record<string, string> = {
    'loop': '➰', 'branch': '🌿', 'collapse': '💥',
    'constellation': '✨', 'synthesis': '⚗️'
  }
  const KIND_MAP: Record<string, string> = {
    'pattern': '🧩', 'persona': '👤', 'data': '💾'
  }

  function getTriadDisplay(sym: any): string {
    let triadArr: string[] = []
    if (Array.isArray(sym.triad)) {
      triadArr = sym.triad
    } else if (typeof sym.triad === 'string') {
      triadArr = (sym.triad as string).split(',').map(t => t.trim())
    }
    return `[${triadArr.slice(0, 3).join(', ')}]`
  }

  function formatSymbolRow(sym: any, headers: string[]): string {
    const fields: string[] = []

    if (headers.includes('ID') && sym.id) fields.push(sym.id)
    if (headers.includes('Kind')) {
      let kindDisplay = KIND_MAP[sym.kind || 'pattern'] || (sym.kind || 'pattern')
      if (sym.kind === 'lattice') {
        const topKey = sym.lattice?.topology || 'inductive'
        const top = TOPOLOGY_MAP[topKey] || topKey
        const cloKey = sym.lattice?.closure || 'loop'
        const clo = CLOSURE_MAP[cloKey] || cloKey
        kindDisplay = `${top} ${clo}`
        if (components.linked_patterns && sym.linked_patterns?.length > 0) {
          const linkedTriads = sym.linked_patterns
            .map((link: any) => {
              const ext = seedData.symbols?.find((e: any) => e.id === link.id)
              return ext ? getTriadDisplay(ext) : null
            })
            .filter(Boolean)
          if (linkedTriads.length > 0) kindDisplay += ` (Links: ${linkedTriads.join(', ')})`
        }
      }
      fields.push(kindDisplay)
    }
    if (headers.includes('Triad')) {
      const triadDisplay = getTriadDisplay(sym)
      fields.push(triadDisplay !== '[]' ? triadDisplay : '')
    }
    if (headers.includes('Macro')) {
      const macro = (sym.macro || '').slice(0, 100).replace(/\n/g, ' ')
      fields.push(macro)
    }
    if (headers.includes('Facets') && sym.facets) {
      const facetParts: string[] = []
      if (sym.facets.function) facetParts.push(`function=${sym.facets.function}`)
      if (sym.facets.topology) facetParts.push(`topology=${sym.facets.topology}`)
      if (sym.facets.temporal) facetParts.push(`temporal=${sym.facets.temporal}`)
      if (sym.facets.commit) facetParts.push(`commit=${sym.facets.commit}`)
      if (sym.facets.gate?.length) facetParts.push(`gate=[${sym.facets.gate.join(', ')}]`)
      if (sym.facets.substrate?.length) facetParts.push(`substrate=[${sym.facets.substrate.join(', ')}]`)
      if (sym.facets.invariants?.length) facetParts.push(`invariants=[${sym.facets.invariants.join(', ')}]`)
      fields.push(facetParts.length > 0 ? facetParts.join('; ') : '')
    }
    if (headers.includes('Activation') && sym.activation_conditions?.length) {
      fields.push(sym.activation_conditions.join('; '))
    }
    if (headers.includes('Failure') && sym.failure_mode) {
      fields.push(sym.failure_mode)
    }

    return `| ${fields.join(' | ')} |`
  }

  let s = ''
  if (components.system_invariants) {
    s += `[SYSTEM_INVARIANTS]\n${SYSTEM_INVARIANTS.join('\n')}\n\n`
  }
  if (components.domain_invariants && seedData.meta?.invariants?.length) {
    s += `[DOMAIN_INVARIANTS]\n${seedData.meta.invariants.join('\n')}\n\n`
  }
  if (seedData.symbols?.length > 0) {
    s += `[SYMBOL_CATALOG]\n`
    // Build header from active toggles
    const headers: string[] = []
    if (components.symbol_id) headers.push('ID')
    if (components.kind) headers.push('Kind')
    if (components.triads) headers.push('Triad')
    if (components.macro) headers.push('Macro')
    if (components.facets) headers.push('Facets')
    if (components.activation_conditions) headers.push('Activation')
    if (components.failure_mode) headers.push('Failure')
    if (headers.length > 0) s += `| ${headers.join(' | ')} |\n`

    const uniqueSymbols = seedData.symbols
    uniqueSymbols.sort((a: any, b: any) => (a.id || '').localeCompare(b.id || ''))
    for (const sym of uniqueSymbols) {
      if (selectedIds && !selectedIds.has(sym.id)) continue
      s += formatSymbolRow(sym, headers) + '\n'
    }
  }
  return s
}

export default function App() {
  const [lmConfig, setLmConfig] = useState<LMStudioConfig>(DEFAULT_LMSTUDIO_CONFIG)
  const [formatComponents, setFormatComponents] = useState<FormatComponents>({ ...DEFAULT_FORMAT_COMPONENTS })
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<number>>(new Set())
  const [activePrompt, setActivePrompt] = useState<PromptEntry | null>(null)
  const [results, setResults] = useState<TestResult[]>([])
  const [entropyData, setEntropyData] = useState<EntropyDataPoint[]>([])
  const [runHistory, setRunHistory] = useState<RunResult[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [progress, setProgress] = useState(0)
  const [totalTests, setTotalTests] = useState(0)
  const [completedTests, setCompletedTests] = useState(0)
  const [currentTestName, setCurrentTestName] = useState('')
  const [tsdPath, setTsdPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seedData, setSeedData] = useState<any>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedSymbolIds, setSelectedSymbolIds] = useState<Set<string>>(new Set())
  const abortRef = useRef(false)
  const liveEntropyRef = useRef<EntropyDataPoint[]>([])

  useEffect(() => {
    loadPromptFiles().then(async files => {
      const loadedPrompts: PromptEntry[] = []
      for (const file of files) {
        try { loadedPrompts.push(await loadPrompt(file.path)) } catch { }
      }
      setPrompts(loadedPrompts)
      setSelectedPromptIds(new Set(loadedPrompts.map(p => p.id)))
      setLoading(false)
    }).catch(() => setLoading(false))
    loadSeedDomain().then(data => {
      setSeedData(data)
      if (data?.symbols) {
        setSelectedSymbolIds(new Set(data.symbols.map((s: any) => s.id)))
      }
    }).catch(() => { })
  }, [])

  const toggleFormatComponent = (key: keyof FormatComponents) => {
    setFormatComponents(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePromptSelection = (id: number) => {
    setSelectedPromptIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const selectAllPrompts = () => setSelectedPromptIds(new Set(prompts.map(p => p.id)))
  const deselectAllPrompts = () => setSelectedPromptIds(new Set())

  const toggleSymbolSelection = (id: string) => {
    setSelectedSymbolIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const selectAllSymbols = () => {
    if (!seedData?.symbols) return
    setSelectedSymbolIds(new Set(seedData.symbols.map((s: any) => s.id)))
  }
  const deselectAllSymbols = () => setSelectedSymbolIds(new Set())

  const buildPrompt = (promptEntry: PromptEntry, format: 'control' | 'symbolic'): string => {
    if (format === 'control') return SYSTEM_PROMPT_BASE
    let systemPrompt = SYSTEM_PROMPT_SYMBOLIC
    if (seedData) systemPrompt += buildSymbolicDomainInjection(seedData, formatComponents, selectedSymbolIds)
    return systemPrompt
  }

  const runTest = async (promptEntry: PromptEntry, format: 'control' | 'symbolic') => {
    const systemContent = buildPrompt(promptEntry, format)
    const messages = [
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: promptEntry.prompt }
    ]
    const response = await sendToLMStudio(lmConfig, messages)

    let responseText = ''
    const output = response?.output || []
    for (const item of output) {
      if (item?.type === 'message' && item?.content) {
        for (const content of item.content) {
          if (content?.type === 'output_text' && content?.text) responseText = content.text
        }
      }
    }

    if (!response?.output?.[0]) {
      throw new Error(`No response from LMStudio. Response: ${JSON.stringify(response).slice(0, 500)}`)
    }

    const entropyPoints = calculateEntropy(response, format)
    const logprobs = entropyPoints.map(p => p.incrementalEntropy)
    const totalEntropy = logprobs.reduce((a, b) => a + b, 0)
    const avgEntropy = logprobs.length > 0 ? totalEntropy / logprobs.length : 0
    const maxEntropy = logprobs.length > 0 ? Math.max(...logprobs) : 0
    const minEntropy = logprobs.length > 0 ? Math.min(...logprobs) : 0
    const sorted = [...logprobs].sort((a, b) => a - b)
    const medianEntropy = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0
    const fullPrompt = `${systemContent}\n\n---\n\nUser Request: ${promptEntry.prompt}`
    const result: TestResult = {
      testId: promptEntry.id, format, promptLength: fullPrompt.length,
      responseLength: responseText.length,
      totalEntropy, avgEntropyPerToken: avgEntropy, maxEntropy, minEntropy, medianEntropy,
      logprobs: null, timestamp: Date.now()
    }
    return { result, entropyPoints, responseText }
  }

  const runAllTests = async () => {
    if (prompts.length === 0) return
    setIsRunning(true); setError(null); setResults([]); setEntropyData([]); setRunHistory([]); liveEntropyRef.current = []
    abortRef.current = false
    const formats: ('control' | 'symbolic')[] = ['control', 'symbolic']
    const testsToRun: Array<{ prompt: PromptEntry; format: 'control' | 'symbolic' }> = []
    for (const prompt of prompts) if (selectedPromptIds.has(prompt.id)) for (const format of formats) testsToRun.push({ prompt, format })
    setTotalTests(testsToRun.length); setCompletedTests(0)
    const allResults: TestResult[] = []; const allEntropy: EntropyDataPoint[] = []; const allRuns: RunResult[] = []

    for (let i = 0; i < testsToRun.length; i++) {
      if (abortRef.current) break
      const { prompt, format } = testsToRun[i]
      setCurrentTestName(`${prompt.name} (${format})`)
      setProgress(((i) / testsToRun.length) * 100); setCompletedTests(i)
      try {
        const { result, entropyPoints, responseText } = await runTest(prompt, format)
        allResults.push(result)
        const runEntropy = entropyPoints.map(p => ({ ...p, testId: prompt.id, format }))
        allEntropy.push(...runEntropy)
        liveEntropyRef.current = [...allEntropy]
        setResults([...allResults]); setEntropyData([...allEntropy])
        const runId = `${Date.now()}-${i}`
        allRuns.push({ id: runId, timestamp: Date.now(), promptId: prompt.id, format, promptText: buildPrompt(prompt, format), responseText, result, entropyData: runEntropy })
        setRunHistory([...allRuns])
      } catch (e) { setError(`Test ${prompt.id} (${format}) failed: ${e instanceof Error ? e.message : String(e)}`) }
    }
    setProgress(100); setCompletedTests(testsToRun.length); setCurrentTestName(''); setIsRunning(false)
  }

  const abortTests = () => { abortRef.current = true }

  const downloadResults = () => {
    const data = {
      timestamp: new Date().toISOString(), lmConfig, formatComponents, runHistory,
      aggregate: { symbolic: results.filter(r => r.format === 'symbolic'), control: results.filter(r => r.format === 'control') }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `formatentropy-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const loadAndAnalyzeResults = async () => {
    const files = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20']
    const runHistories: RunResult[] = []
    for (const f of files) {
      try {
        const res = await fetch(`/data/results/formatentropy-${f}.json`)
        if (res.ok) {
          const data = await res.json()
          if (data.runHistory) runHistories.push(...data.runHistory)
        }
      } catch {}
    }
    // Also try numbered files
    for (let i = 1; i <= 100; i++) {
      const key = `${i.toString().padStart(3, '0')}`
      const exists = files.includes(key)
      if (!exists) {
        try {
          const res = await fetch(`/data/results/formatentropy-${i}.json`)
          if (res.ok) {
            const data = await res.json()
            if (data.runHistory) runHistories.push(...data.runHistory)
          }
        } catch {}
      }
    }
    
    // Group by promptId
    const byPrompt = new Map<number, RunResult[]>()
    for (const run of runHistories) {
      if (!byPrompt.has(run.promptId)) byPrompt.set(run.promptId, [])
      byPrompt.get(run.promptId)!.push(run)
    }
    
    // Analyze each prompt
    const analysis: any[] = []
    for (const [promptId, runs] of byPrompt) {
      const controlRuns = runs.filter(r => r.format === 'control')
      const symbolicRuns = runs.filter(r => r.format === 'symbolic')
      
      const controlAvgEntropy = controlRuns.length > 0 ? controlRuns.reduce((s, r) => s + r.result.avgEntropyPerToken, 0) / controlRuns.length : 0
      const symbolicAvgEntropy = symbolicRuns.length > 0 ? symbolicRuns.reduce((s, r) => s + r.result.avgEntropyPerToken, 0) / symbolicRuns.length : 0
      const controlAvgResponse = controlRuns.length > 0 ? controlRuns.reduce((s, r) => s + r.result.responseLength, 0) / controlRuns.length : 0
      const symbolicAvgResponse = symbolicRuns.length > 0 ? symbolicRuns.reduce((s, r) => s + r.result.responseLength, 0) / symbolicRuns.length : 0
      const controlAvgPrompt = controlRuns.length > 0 ? controlRuns.reduce((s, r) => s + r.result.promptLength, 0) / controlRuns.length : 0
      const symbolicAvgPrompt = symbolicRuns.length > 0 ? symbolicRuns.reduce((s, r) => s + r.result.promptLength, 0) / symbolicRuns.length : 0
      
      // Direction flip: positive = symbolic has lower entropy (compression benefit), negative = symbolic has higher
      const entropyDiff = symbolicAvgEntropy - controlAvgEntropy
      const responseDiff = symbolicAvgResponse - controlAvgResponse
      const promptDiff = symbolicAvgPrompt - controlAvgPrompt
      const pctChange = controlAvgEntropy > 0 ? (entropyDiff / controlAvgEntropy) * 100 : 0
      
      analysis.push({
        promptId,
        runs: runs.length,
        controlRuns: controlRuns.length,
        symbolicRuns: symbolicRuns.length,
        controlAvgEntropy,
        symbolicAvgEntropy,
        entropyDiff,
        pctChange,
        controlAvgResponse,
        symbolicAvgResponse,
        responseDiff,
        controlAvgPrompt,
        symbolicAvgPrompt,
        promptDiff,
        direction: entropyDiff > 0.001 ? '↑ symbolic higher' : entropyDiff < -0.001 ? '↓ symbolic lower' : '→ no change'
      })
    }
    
    // Sort by entropy difference
    analysis.sort((a, b) => a.pctChange - b.pctChange)
    
    setAnalysisData({ byPrompt: analysis, totalRuns: runHistories.length, totalPrompts: byPrompt.size })
    setShowAnalysis(true)
  }

  const symbolicResults = results.filter(r => r.format === 'symbolic')
  const controlResults = results.filter(r => r.format === 'control')
  const symbolicAvg = symbolicResults.length > 0 ? symbolicResults.reduce((a, b) => a + b.avgEntropyPerToken, 0) / symbolicResults.length : 0
  const controlAvg = controlResults.length > 0 ? controlResults.reduce((a, b) => a + b.avgEntropyPerToken, 0) / controlResults.length : 0
  const symbolicTotal = symbolicResults.reduce((a, b) => a + b.totalEntropy, 0)
  const controlTotal = controlResults.reduce((a, b) => a + b.totalEntropy, 0)
  const reduction = controlAvg > 0 ? ((controlAvg - symbolicAvg) / controlAvg) * 100 : 0
  const symbolicEntropy = entropyData.filter(d => d.format === 'symbolic')
  const controlEntropy = entropyData.filter(d => d.format === 'control')
  
  // Shared max for normalized Y-axis
  const allEntropy = [...symbolicEntropy, ...controlEntropy]
  const sharedMaxEntropy = allEntropy.length > 0 ? Math.max(...allEntropy.map(d => Math.abs(d.incrementalEntropy)), 0.001) : 1
  const selectedRun = runHistory.find(r => r.id === selectedRunId) || null

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#c8c8d0] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e0e0e0]">FormatEntropy</h1>
          <p className="text-sm text-[#888898]">Shannon entropy measurement for SignalZero symbolic format compression</p>
        </div>
        <div className="flex items-center gap-3">
          {seedData && <span className="text-xs text-[#686880]">{seedData.meta?.name} ({seedData.symbols?.length || 0} symbols)</span>}
          {isRunning && <span className="text-xs text-[#4a6fa5] animate-pulse">{currentTestName}</span>}
          <button onClick={downloadResults} disabled={runHistory.length === 0} className="bg-[#2a2a3e] hover:bg-[#3a3a4e] disabled:opacity-30 text-xs px-3 py-1.5 rounded transition-colors">
            ↓ Download JSON
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-20 text-[#686880]">Loading prompts...</div>}

      {!loading && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-3 space-y-4">
            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">LMStudio</h2>
              <div className="space-y-3">
                <div><label className="text-xs text-[#686880]">URL</label>
                  <input type="text" value={lmConfig.url} onChange={e => setLmConfig({ ...lmConfig, url: e.target.value })}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#c8c8d0] mt-1" placeholder="http://localhost:1234" /></div>
                <div><label className="text-xs text-[#686880]">Model</label>
                  <input type="text" value={lmConfig.model} onChange={e => setLmConfig({ ...lmConfig, model: e.target.value })}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#c8c8d0] mt-1" placeholder="local-model" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-[#686880]">Temp</label>
                    <input type="number" value={lmConfig.temperature} onChange={e => setLmConfig({ ...lmConfig, temperature: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#c8c8d0] mt-1" step={0.1} min={0} max={2} /></div>
                  <div><label className="text-xs text-[#686880]">Max Tok</label>
                    <input type="number" value={lmConfig.maxTokens} onChange={e => setLmConfig({ ...lmConfig, maxTokens: parseInt(e.target.value) || 0 })}
                      className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#c8c8d0] mt-1" step={256} /></div>
                </div>
                <div><label className="text-xs text-[#686880]">Top P</label>
                  <input type="number" value={lmConfig.topP} onChange={e => setLmConfig({ ...lmConfig, topP: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#c8c8d0] mt-1" step={0.05} min={0} max={1} /></div>
              </div>
            </div>

            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">Components</h2>
              <div className="flex gap-2 mb-2">
                <button onClick={() => setFormatComponents({ ...DEFAULT_FORMAT_COMPONENTS })} className="text-[#686880] hover:text-[#a0a0b8] text-xs">All</button>
                <button onClick={() => setFormatComponents(Object.fromEntries(Object.keys(DEFAULT_FORMAT_COMPONENTS).map(k => [k, false])) as FormatComponents)} className="text-[#686880] hover:text-[#a0a0b8] text-xs">None</button>
              </div>
              <div className="space-y-1">
                {Object.entries(formatComponents).map(([key, value]) => (
                  <label key={key} className="format-checkbox text-xs">
                    <input type="checkbox" checked={value} onChange={() => setFormatComponents(prev => ({ ...prev, [key]: !prev[key as keyof FormatComponents] }))} />
                    <span className="text-[#a0a0b8]">{key === 'system_invariants' ? 'System Invariants' : key === 'domain_invariants' ? 'Domain Invariants' : key.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            {seedData && seedData.symbols && seedData.symbols.length > 0 && (
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[#a0a0b8]">Symbols ({selectedSymbolIds.size}/{seedData.symbols.length})</h2>
                  <div className="flex gap-2">
                    <button onClick={selectAllSymbols} className="text-[#686880] hover:text-[#a0a0b8] text-xs">All</button>
                    <button onClick={deselectAllSymbols} className="text-[#686880] hover:text-[#a0a0b8] text-xs">None</button>
                  </div>
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {seedData.symbols
                    .sort((a: any, b: any) => (a.id || '').localeCompare(b.id || ''))
                    .map((sym: any) => (
                      <div key={sym.id} className="flex items-start gap-2 px-2 py-1 rounded text-xs hover:bg-[#1a1a2e] cursor-pointer"
                        onClick={() => toggleSymbolSelection(sym.id)}>
                        <input type="checkbox" checked={selectedSymbolIds.has(sym.id)}
                          onChange={() => toggleSymbolSelection(sym.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-3 h-3 accent-[#4a6fa5] mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[#a0a0b8] font-mono text-[10px]">{sym.id}</span>
                            <span className="text-[#484860] text-[9px]">{sym.triad}</span>
                          </div>
                          <div className="text-[10px] text-[#686880] truncate">{sym.name || sym.role || ''}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#a0a0b8]">Prompts ({prompts.length})</h2>
                <div className="flex gap-2">
                  <button onClick={selectAllPrompts} className="text-[#686880] hover:text-[#a0a0b8] text-xs">All</button>
                  <button onClick={deselectAllPrompts} className="text-[#686880] hover:text-[#a0a0b8] text-xs">None</button>
                </div>
              </div>
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {prompts.map(prompt => (
                  <div key={prompt.id} onClick={() => setActivePrompt(prompt)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${selectedPromptIds.has(prompt.id) ? 'bg-[#1a1a2e] text-[#a0a0b8]' : 'text-[#484860]'
                      } ${activePrompt?.id === prompt.id ? 'border border-[#4a6fa5]' : 'border border-transparent'}`}>
                    <input type="checkbox" checked={selectedPromptIds.has(prompt.id)}
                      onChange={() => togglePromptSelection(prompt.id)} onClick={e => e.stopPropagation()}
                      className="w-3 h-3 accent-[#4a6fa5]" />
                    <span className="truncate">{prompt.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">Run</h2>
              <div className="space-y-2">
                <button onClick={runAllTests} disabled={isRunning || selectedPromptIds.size === 0}
                  className="w-full bg-[#4a6fa5] hover:bg-[#5a7fb5] disabled:bg-[#2a2a3e] disabled:text-[#484860] text-white text-sm py-2 rounded transition-colors">
                  {isRunning ? `Running: ${currentTestName || '...'}` : `Run All (${selectedPromptIds.size} prompts)`}
                </button>
                {isRunning && <button onClick={abortTests} className="w-full bg-[#a54a4a] hover:bg-[#b55a5a] text-white text-sm py-2 rounded transition-colors">Abort</button>}
                {isRunning && (
                  <div><div className="text-xs text-[#686880] mb-1">{completedTests}/{totalTests} complete</div>
                    <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div></div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-6 space-y-4">
            {activePrompt && (
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[#a0a0b8]">{activePrompt.name}</h2>
                  <span className="text-xs text-[#686880]">{activePrompt.description}</span>
                </div>
                <div className="mb-3"><div className="text-xs font-medium text-[#686880] mb-1">User Request</div>
                  <div className="prompt-preview text-xs text-[#e0e0e0]">{activePrompt.prompt}</div></div>
                {seedData && (
                  <>
                    <div className="mb-3"><div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-[#7eb8da]">Symbolic Injection</span>
                      <span className="text-xs text-[#484860]">({buildSymbolicDomainInjection(seedData, formatComponents, selectedSymbolIds).length} chars)</span>
                    </div>
                      <div className="prompt-preview text-xs text-[#7eb8da] max-h-[180px] overflow-y-auto">{buildSymbolicDomainInjection(seedData, formatComponents, selectedSymbolIds)}</div></div>
                  </>
                )}
              </div>
            )}

            {runHistory.length > 0 && (
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-[#a0a0b8]">Run History ({runHistory.length})</h2>
                  <button onClick={() => setShowPromptPreview(!showPromptPreview)} className="text-xs text-[#686880] hover:text-[#a0a0b8]">
                    {showPromptPreview ? 'Hide' : 'Show'} Prompt Text</button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {runHistory.map(run => {
                    const prompt = prompts.find(p => p.id === run.promptId)
                    return (
                      <div key={run.id} onClick={() => setSelectedRunId(run.id)}
                        className={`result-card p-3 cursor-pointer flex items-center justify-between ${selectedRunId === run.id ? 'border-[#4a6fa5]' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${run.format === 'symbolic' ? 'bg-[#1a2a3a] text-[#7eb8da]' : 'bg-[#2a1a12] text-[#a0522d]'}`}>{run.format}</span>
                          <span className="text-xs text-[#a0a0b8]">{prompt?.name || `#${run.promptId}`}</span>
                          <span className="text-xs text-[#686880] font-mono">{run.result.avgEntropyPerToken.toFixed(4)} bits/tok</span>
                          <span className="text-xs text-[#686880]">{run.result.responseLength} chars</span>
                        </div>
                        <span className="text-[#484860] text-[10px]">{new Date(run.timestamp).toLocaleTimeString()}</span>
                      </div>
                    )
                  })}
                </div>
                {selectedRun && (
                  <div className="mt-3 pt-3 border-t border-[#2a2a3e]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#a0a0b8]">Run Detail</span>
                      <button onClick={() => {
                        const blob = new Blob([selectedRun.promptText], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `prompt-${selectedRun.promptId}-${selectedRun.format}.txt`; a.click()
                        URL.revokeObjectURL(url)
                      }} className="text-xs text-[#4a6fa5] hover:text-[#7eb8da]">↓ Download Prompt</button>
                    </div>
                    {showPromptPreview && <div className="prompt-preview text-xs text-[#a0a0b0] max-h-[150px] overflow-y-auto mb-2">{selectedRun.promptText}</div>}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-[#686880]">Response:</span>
                      <button onClick={() => {
                        const blob = new Blob([selectedRun.responseText], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `response-${selectedRun.promptId}-${selectedRun.format}.txt`; a.click()
                        URL.revokeObjectURL(url)
                      }} className="text-xs text-[#4a6fa5] hover:text-[#7eb8da]">↓ Download</button>
                    </div>
                    <div className="prompt-preview text-xs text-[#4ade80] max-h-[200px] overflow-y-auto mb-2">{selectedRun.responseText || '(empty)'}</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-[#1a1a2e] rounded p-2"><div className="text-lg font-mono font-bold text-[#7eb8da]">{selectedRun.result.avgEntropyPerToken.toFixed(4)}</div><div className="text-[10px] text-[#686880]">Avg Entropy</div></div>
                      <div className="bg-[#1a1a2e] rounded p-2"><div className="text-lg font-mono font-bold text-[#a0a0b8]">{selectedRun.result.totalEntropy.toFixed(2)}</div><div className="text-[10px] text-[#686880]">Total Entropy</div></div>
                      <div className="bg-[#1a1a2e] rounded p-2"><div className="text-lg font-mono font-bold text-[#a0a0b8]">{selectedRun.result.responseLength}</div><div className="text-[10px] text-[#686880]">Response Length</div></div>
                      <div className="bg-[#1a1a2e] rounded p-2"><div className="text-lg font-mono font-bold text-[#a0a0b8]">{selectedRun.result.promptLength}</div><div className="text-[10px] text-[#686880]">Prompt Length</div></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {results.length > 0 && (
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
                <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">Results</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-[#2a2a3e]">
                      <th className="text-left py-2 px-2 text-[#686880]">ID</th>
                      <th className="text-left py-2 px-2 text-[#686880]">Name</th>
                      <th className="text-left py-2 px-2 text-[#686880]">Format</th>
                      <th className="text-right py-2 px-2 text-[#686880]">Avg Entropy</th>
                      <th className="text-right py-2 px-2 text-[#686880]">Total</th>
                      <th className="text-right py-2 px-2 text-[#686880]">Max</th>
                      <th className="text-right py-2 px-2 text-[#686880]">Tokens</th>
                      <th className="text-right py-2 px-2 text-[#686880]">Prompt</th>
                    </tr></thead>
                    <tbody>
                      {results.map(r => (
                        <tr key={`${r.testId}-${r.format}`} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]">
                          <td className="py-2 px-2 text-[#686880]">#{r.testId}</td>
                          <td className="py-2 px-2 text-[#a0a0b8]">{prompts.find(p => p.id === r.testId)?.name || `#${r.testId}`}</td>
                          <td className="py-2 px-2"><span className={`px-2 py-0.5 rounded text-xs ${r.format === 'symbolic' ? 'bg-[#1a2a3a] text-[#7eb8da]' : 'bg-[#2a1a12] text-[#a0522d]'}`}>{r.format}</span></td>
                          <td className="py-2 px-2 text-right font-mono"><span className={r.format === 'symbolic' ? 'text-[#7eb8da]' : 'text-[#a0522d]'}>{r.avgEntropyPerToken.toFixed(4)}</span></td>
                          <td className="py-2 px-2 text-right font-mono"><span className={r.format === 'symbolic' ? 'text-[#7eb8da]' : 'text-[#a0522d]'}>{r.totalEntropy.toFixed(2)}</span></td>
                          <td className="py-2 px-2 text-right font-mono text-[#686880]">{r.maxEntropy.toFixed(4)}</td>
                          <td className="py-2 px-2 text-right font-mono text-[#686880]">{r.responseLength}</td>
                          <td className="py-2 px-2 text-right font-mono text-[#686880]">{r.promptLength}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {symbolicResults.length > 0 && controlResults.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#2a2a3e]">
                    <h3 className="text-sm font-semibold text-[#a0a0b8] mb-3">Aggregate Comparison</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="result-card symbolic"><div className="text-xs text-[#7eb8da] mb-1">Symbolic Format</div>
                        <div className="text-lg font-mono font-bold text-[#7eb8da]">{symbolicAvg.toFixed(4)}</div>
                        <div className="text-xs text-[#686880]">avg bits/token · Total: {symbolicTotal.toFixed(2)} bits</div></div>
                      <div className="result-card control"><div className="text-xs text-[#a0522d] mb-1">Control (system prompt only)</div>
                        <div className="text-lg font-mono font-bold text-[#a0522d]">{controlAvg.toFixed(4)}</div>
                        <div className="text-xs text-[#686880]">avg bits/token · Total: {controlTotal.toFixed(2)} bits</div></div>
                    </div>
                    <div className="mt-3 text-center">
                      <span className={`text-lg font-bold ${reduction > 0 ? 'text-[#4a6fa5]' : 'text-[#a54a4a]'}`}>
                        {reduction > 0 ? '↓' : '↑'} {Math.abs(reduction).toFixed(1)}% entropy {reduction > 0 ? 'reduction' : 'increase'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="col-span-3 space-y-4">
            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#a0a0b8]">Live Entropy Stream</h2>
                <span className="text-[10px] text-[#686880]">{entropyData.length} data points</span>
              </div>
              {entropyData.length > 0 ? (
                <div className="space-y-4">
              <div>
                <div className="text-xs text-[#7eb8da] mb-2 text-center">Symbolic Format</div>
                <div className="chart-container p-3"><EntropyChart symbolicData={symbolicEntropy} controlData={[]} sharedMax={sharedMaxEntropy} /></div>
              </div>
              <div>
                <div className="text-xs text-[#a0522d] mb-2 text-center">Control Format</div>
                <div className="chart-container p-3"><EntropyChart symbolicData={[]} controlData={controlEntropy} sharedMax={sharedMaxEntropy} /></div>
              </div>
            </div>
              ) : <div className="text-center py-8 text-xs text-[#484860]">No data yet — run a test to see live entropy curves</div>}
            </div>

            {results.length > 0 && (
              <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
                <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">Per-Prompt Comparison</h2>
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {(() => {
                    const groups = new Map<number, { symbolic?: TestResult; control?: TestResult }>()
                    results.forEach(r => { const g = groups.get(r.testId) || {}; g[r.format] = r; groups.set(r.testId, g) })
                    return Array.from(groups.entries()).sort(([a], [b]) => a - b).map(([id, g]) => {
                      const sym = g.symbolic, ctrl = g.control
                      const prompt = prompts.find(p => p.id === id)
                      if (!sym || !ctrl) return null
                      const diff = ctrl.avgEntropyPerToken > 0 ? ((ctrl.avgEntropyPerToken - sym.avgEntropyPerToken) / ctrl.avgEntropyPerToken) * 100 : 0
                      const barWidth = Math.min(Math.abs(diff) * 5, 100)
                      return (
                        <div key={id} className="result-card p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[#a0a0b8]">{prompt?.name || `#${id}`}</span>
                            <span className={`text-xs font-mono ${diff > 0 ? 'text-[#4a6fa5]' : 'text-[#a54a4a]'}`}>{diff > 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[#7eb8da] text-xs font-mono">{sym.avgEntropyPerToken.toFixed(3)}</span>
                            <div className="flex-1 h-2 bg-[#1a1a2e] rounded overflow-hidden">
                              <div className={`h-full rounded ${diff > 0 ? 'bg-[#4a6fa5]' : 'bg-[#a54a4a]'}`} style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="text-[#a0522d] text-xs font-mono">{ctrl.avgEntropyPerToken.toFixed(3)}</span>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-lg p-4">
              <h2 className="text-sm font-semibold text-[#a0a0b8] mb-3">TSD Export</h2>
              {tsdPath ? <div className="text-xs text-[#686880] break-all">{tsdPath}</div> : <div className="text-xs text-[#484860]">No data exported yet</div>}
            </div>

            {error && (
              <div className="bg-[#1a1212] border border-[#4a2a2a] rounded-lg p-4">
                <h2 className="text-sm font-semibold text-[#a54a4a] mb-2">Error</h2>
                <pre className="text-xs text-[#a0522d] whitespace-pre-wrap break-all">{error}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EntropyChart({ symbolicData, controlData, sharedMax }: { symbolicData: EntropyDataPoint[]; controlData: EntropyDataPoint[]; sharedMax: number }) {
  const hasData = symbolicData.length > 0 || controlData.length > 0
  if (!hasData) return <div className="text-center py-4 text-xs text-[#484860]">No data</div>
  const allData = symbolicData.length > 0 ? symbolicData : controlData
  const maxToken = Math.max(...allData.map(d => d.tokenIndex), 1)
  const W = 300, H = 200, P = 10
  const cW = W - P * 2, cH = H - P * 2
  const data = symbolicData.length > 0 ? symbolicData : controlData
  const color = symbolicData.length > 0 ? '#7eb8da' : '#a0522d'
  const buildPath = (data: EntropyDataPoint[]) => {
    if (data.length === 0) return ''
    return data.map((d, i) => {
      const x = P + (d.tokenIndex / maxToken) * cW
      const y = P + cH - (Math.abs(d.incrementalEntropy) / sharedMax) * cH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }
  return (
    <svg width={W} height={H} className="block">
      {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={P} y1={P + cH * (1 - f)} x2={W - P} y2={P + cH * (1 - f)} stroke="#2a2a3e" strokeWidth={0.5} />)}
      {data.length > 0 && <path d={buildPath(data)} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
      <text x={W / 2} y={H - 1} fill="#686880" fontSize={7} textAnchor="middle">Token position →</text>
      <text x={3} y={H / 2} fill="#686880" fontSize={7} textAnchor="middle" transform={`rotate(-90, 3, ${H / 2})`}>Entropy per token →</text>
    </svg>
  )
}
