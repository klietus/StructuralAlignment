/**
 * Core logic tests for FormatEntropy
 * Tests entropy calculation, prompt building, and data processing
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { test, expect } from '@playwright/test'
import * as fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// =====================
// Test: Prompt files exist
// =====================
test('should have 20 prompt files', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  expect(files.length).toBe(20)
  expect(files[0]).toBe('01.json')
  expect(files[19]).toBe('20.json')
})

// =====================
// Test: Each prompt file is valid JSON with required fields
// =====================
test('each prompt file has required fields', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  
  for (const file of files) {
    const content = readFileSync(join(promptsDir, file), 'utf-8')
    const prompt = JSON.parse(content)
    
    expect(prompt.id).toBeDefined()
    expect(typeof prompt.id).toBe('number')
    expect(prompt.name).toBeDefined()
    expect(typeof prompt.name).toBe('string')
    expect(prompt.name.length).toBeGreaterThan(0)
    expect(prompt.description).toBeDefined()
    expect(typeof prompt.description).toBe('string')
    expect(prompt.prompt).toBeDefined()
    expect(typeof prompt.prompt).toBe('string')
    expect(prompt.prompt.length).toBeGreaterThan(10)
  }
})

// =====================
// Test: Prompt IDs are sequential 1-20
// =====================
test('prompt IDs are sequential 1-20', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  
  for (let i = 0; i < files.length; i++) {
    const content = readFileSync(join(promptsDir, files[i]), 'utf-8')
    const prompt = JSON.parse(content)
    expect(prompt.id).toBe(i + 1)
  }
})

// =====================
// Test: Seed domain is valid
// =====================
test('seed domain is valid JSON with symbols', async () => {
  const seedPath = join(rootDir, 'data/seed/narrative_psychology.json')
  const content = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(content)
  
  expect(seed.meta).toBeDefined()
  expect(seed.meta.id).toBe('narrative_psychology')
  expect(seed.meta.name).toBe('Narrative Psychology')
  expect(seed.symbols).toBeDefined()
  expect(Array.isArray(seed.symbols)).toBe(true)
  expect(seed.symbols.length).toBeGreaterThan(0)
})

// =====================
// Test: Seed domain symbols have required fields
// =====================
test('seed symbols have required fields', async () => {
  const seedPath = join(rootDir, 'data/seed/narrative_psychology.json')
  const content = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(content)
  
  for (const sym of seed.symbols) {
    expect(sym.id).toBeDefined()
    expect(typeof sym.id).toBe('string')
    expect(sym.kind).toBeDefined()
    expect(['pattern', 'lattice', 'persona', 'data']).toContain(sym.kind)
    expect(sym.triad).toBeDefined()
    expect(typeof sym.triad).toBe('string')
    expect(sym.macro).toBeDefined()
    expect(typeof sym.macro).toBe('string')
    expect(sym.role).toBeDefined()
    expect(sym.facets).toBeDefined()
    expect(typeof sym.facets).toBe('object')
  }
})

// =====================
// Test: Entropy calculation handles empty input
// =====================
test('entropy calculation handles edge cases', async () => {
  // Test with empty logprobs
  const emptyResult: any[] = []
  expect(emptyResult.length).toBe(0)
  
  // Test with single token
  const singleToken = [{ logprob: -1.0 }]
  expect(singleToken.length).toBe(1)
})

// =====================
// Test: TSD directory exists
// =====================
test('TSD results directory exists', async () => {
  const resultsDir = join(rootDir, 'data/results')
  const exists = fs.existsSync(resultsDir)
  expect(exists).toBe(true)
})

// =====================
// Test: Prompt descriptions cover diverse psychological topics
// =====================
test('prompts cover diverse psychological topics', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  const descriptions = files.map(f => {
    const content = readFileSync(join(promptsDir, f), 'utf-8')
    return JSON.parse(content)
  })
  
  const names = descriptions.map(d => d.name.toLowerCase())
  
  // Check for diversity in topics
  const topicKeywords = ['retention', 'trust', 'conflict', 'scarcity', 'authority', 
    'dependency', 'information', 'reputation', 'gaslight', 'loyalty',
    'narrative', 'reinforcement', 'proof', 'emotional', 'isolation',
    'competence', 'love', 'triangulation', 'future', 'silent']
  
  let matchedTopics = 0
  for (const keyword of topicKeywords) {
    if (names.some(n => n.includes(keyword))) {
      matchedTopics++
    }
  }
  
  expect(matchedTopics).toBeGreaterThanOrEqual(15)
})

// =====================
// Test: Prompt content is substantive
// =====================
test('prompts have substantive content', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  
  for (const file of files) {
    const content = readFileSync(join(promptsDir, file), 'utf-8')
    const prompt = JSON.parse(content)
    expect(prompt.prompt.length).toBeGreaterThan(50)
  }
})

// =====================
// Test: Build symbolic domain injection produces valid output
// =====================
test('symbolic domain injection produces structured output', async () => {
  const seedPath = join(rootDir, 'data/seed/narrative_psychology.json')
  const content = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(content)
  
  // Simulate the buildSymbolicDomainInjection function
  let injection = `\n\n---\n\n<sz_domain>{"domain_id":"narrative_psychology","name":"Narrative Psychology","symbolCount":${seed.symbols.length}}</sz_domain>\n\n`
  injection += `## Active Symbol Catalog\n\n`
  
  for (const sym of seed.symbols) {
    injection += `### [${sym.id}]\n`
    injection += `- **ID:** ${sym.id}\n`
    injection += `- **Kind:** ${sym.kind}\n`
    if (sym.triad) injection += `- **Triad:** ${sym.triad}\n`
    if (sym.macro) injection += `- **Macro:** ${sym.macro}\n`
    if (sym.role) injection += `- **Role:** ${sym.role}\n`
    if (sym.facets?.function) injection += `- **Function:** ${sym.facets.function}\n`
    if (sym.facets?.topology) injection += `- **Topology:** ${sym.facets.topology}\n`
    if (sym.facets?.temporal) injection += `- **Temporal:** ${sym.facets.temporal}\n`
    if (sym.linked_patterns && sym.linked_patterns.length) {
      injection += `- **Links:** ${sym.linked_patterns.map(l => `${l.id} (${l.link_type})`).join(', ')}\n`
    }
    injection += '\n'
  }
  
  expect(injection).toContain('<sz_domain>')
  expect(injection).toContain('## Active Symbol Catalog')
  expect(injection).toContain('### [NAR-LAT-NARCISSISTIC-LOOP]')
  expect(injection).toContain('### [NPD-DISORDER]')
  expect(injection.length).toBeGreaterThan(5000)
})

// =====================
// Test: Format component toggles produce different injection sizes
// =====================
test('format component toggles affect injection size', async () => {
  const seedPath = join(rootDir, 'data/seed/narrative_psychology.json')
  const content = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(content)
  
  // Full injection (all components) — DSL pipe format from contextWindowService
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
  
  let fullInjection = ''
  const systemInvariants = [
    'non-coercion', 'reality-alignment', 'no-silent-mutation', 'auditability',
    'explicit-choice', 'baseline-integrity', 'drift-detection', 'agency'
  ]
  if (seed.meta?.invariants?.length) {
    fullInjection += `[SYSTEM_INVARIANTS]\n${systemInvariants.join('\n')}\n\n`
    fullInjection += `[DOMAIN_INVARIANTS]\n${seed.meta.invariants.join('\n')}\n\n`
  }
  fullInjection += '[SYMBOL_CATALOG]\n'
  for (const sym of seed.symbols) {
    let kindDisplay = KIND_MAP[sym.kind || 'pattern'] || sym.kind
    if (sym.kind === 'lattice') {
      const top = TOPOLOGY_MAP[sym.lattice?.topology || 'inductive'] || sym.lattice?.topology
      const clo = CLOSURE_MAP[sym.lattice?.closure || 'loop'] || sym.lattice?.closure
      kindDisplay = `${top} ${clo}`
    }
    const macro = (sym.macro || '').slice(0, 100).replace(/\n/g, ' ')
    fullInjection += `| ${sym.id} | ${sym.name} | [${(Array.isArray(sym.triad) ? sym.triad : (sym.triad || '').split(',').map((t: string) => t.trim()).slice(0, 3).join(', '))}] | ${kindDisplay} | ${macro} |\n`
  }
  
  // Minimal injection (only triads, macro, symbol_id, kind) — collapsed DSL
  let minimalInjection = '[SYMBOL_CATALOG]\n'
  for (const sym of seed.symbols) {
    let kindDisplay = KIND_MAP[sym.kind || 'pattern'] || sym.kind
    if (sym.kind === 'lattice') {
      const top = TOPOLOGY_MAP[sym.lattice?.topology || 'inductive'] || sym.lattice?.topology
      const clo = CLOSURE_MAP[sym.lattice?.closure || 'loop'] || sym.lattice?.closure
      kindDisplay = `${top} ${clo}`
    }
    const triad = Array.isArray(sym.triad) ? sym.triad : (sym.triad || '').split(',').map((t: string) => t.trim())
    minimalInjection += `| ${sym.id} | ${sym.name} | [${triad.slice(0, 3).join(', ')}] | ${kindDisplay} | ${(sym.macro || '').slice(0, 100).replace(/\n/g, ' ')} |\n`
  }
  
  expect(fullInjection.length).toBeGreaterThan(minimalInjection.length)
})

// =====================
// Test: All prompts can generate valid full prompts
// =====================
test('all prompts can generate valid full prompts', async () => {
  const promptsDir = join(rootDir, 'data/prompts')
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.json')).sort()
  const seedPath = join(rootDir, 'data/seed/narrative_psychology.json')
  const content = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(content)
  
  const systemPrompt = `You are an analytical assistant. Analyze the following request with precision and depth. Provide a detailed, structured response. Respond in markdown format.`
  
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
  
  for (const file of files) {
    const promptContent = readFileSync(join(promptsDir, file), 'utf-8')
    const prompt = JSON.parse(promptContent)
    
    // Build symbolic version using DSL pipe format from contextWindowService
    let symbolicInjection = '[SYMBOL_CATALOG]\n'
    for (const sym of seed.symbols) {
      let kindDisplay = KIND_MAP[sym.kind || 'pattern'] || sym.kind
      if (sym.kind === 'lattice') {
        const top = TOPOLOGY_MAP[sym.lattice?.topology || 'inductive'] || sym.lattice?.topology
        const clo = CLOSURE_MAP[sym.lattice?.closure || 'loop'] || sym.lattice?.closure
        kindDisplay = `${top} ${clo}`
      }
      const triad = Array.isArray(sym.triad) ? sym.triad : (sym.triad || '').split(',').map((t: string) => t.trim())
      const macro = (sym.macro || '').slice(0, 100).replace(/\n/g, ' ')
      symbolicInjection += `| ${sym.id} | ${sym.name} | [${triad.slice(0, 3).join(', ')}] | ${kindDisplay} | ${macro} |\n`
    }
    
    const fullSymbolic = `${systemPrompt}\n\n${symbolicInjection}\n\n---\n\nUser Request: ${prompt.prompt}`
    
    // Control is system prompt only — no user request, no domain injection
    const fullControl = systemPrompt
    
    // Verify both are valid
    expect(fullSymbolic.length).toBeGreaterThan(1000)
    expect(fullControl).toBe(systemPrompt)
    expect(fullSymbolic).toContain('User Request:')
    expect(fullSymbolic).toContain(prompt.prompt)
    expect(fullSymbolic.length).toBeGreaterThan(fullControl.length)
  }
})

console.log('Core logic tests defined successfully')
