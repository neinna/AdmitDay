/**
 * __tests__/ask-build-request.test.ts
 *
 * Issue #450: buildAskRequest() is the single place lib/ask.ts's production
 * path and evals/run-ask-eval.ts's batch path both build the Anthropic
 * request from. If a future edit to production (model, max_tokens, thinking,
 * system prompt) doesn't go through this function, these assertions catch
 * the drift.
 */

import { buildAskRequest } from '../lib/ask'

describe('buildAskRequest (issue #450)', () => {
  it('returns the exact model, max_tokens and thinking setting used in production', () => {
    const request = buildAskRequest('What schools are good?', 'some school context')

    expect(request.model).toBe('claude-sonnet-5')
    expect(request.max_tokens).toBe(1500)
    expect(request.thinking).toEqual({ type: 'disabled' })
  })

  it('uses the production system prompt', () => {
    const request = buildAskRequest('What schools are good?', 'some school context')

    expect(request.system).toContain('You are an experienced NYC high school admissions consultant.')
    expect(request.system).toContain('output exactly one line in the form DBN | reason')
  })

  it('embeds the school context and the question into a single user message', () => {
    const request = buildAskRequest('Which schools teach robotics?', 'CONTEXT_MARKER_12345')

    expect(request.messages).toHaveLength(1)
    const [message] = request.messages
    expect(message.role).toBe('user')
    expect(message.content).toContain('CONTEXT_MARKER_12345')
    expect(message.content).toContain('<question>Which schools teach robotics?</question>')
  })
})
