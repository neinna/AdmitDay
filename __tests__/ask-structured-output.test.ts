import type Anthropic from '@anthropic-ai/sdk'
import { buildAskRequest, buildAnswerResult, ASK_OUTPUT_SCHEMA } from '../lib/ask'
import type { SearchResult } from '../lib/rag'

const results = [
  { dbn: '01M001', name: 'School One', score: 0.9, chunk: 'c', matchedChunkType: 't' },
] as unknown as SearchResult[]

function fakeMessage(text: string): Anthropic.Message {
  return {
    model: 'm',
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'text', text }],
  } as unknown as Anthropic.Message
}

describe('structured ask output (issue #673)', () => {
  it('sends a json_schema output_config', () => {
    const request = buildAskRequest('q', 'ctx') as unknown as {
      output_config: { format: { type: string; schema: typeof ASK_OUTPUT_SCHEMA } }
    }
    expect(request.output_config.format.type).toBe('json_schema')
    expect(request.output_config.format.schema.required).toEqual(['off_topic', 'picks'])
    expect(request.output_config.format.schema.properties.picks.items.required).toEqual([
      'dbn',
      'reason',
    ])
  })

  it('parses a structured pick', () => {
    const out = buildAnswerResult(
      fakeMessage('{"off_topic":false,"picks":[{"dbn":"01M001","reason":"x"}]}'),
      'q',
      results
    )
    expect(out.reasons).toEqual([{ dbn: '01M001', reason: 'x' }])
    expect(out.guardrail).toBe('none')
  })

  it('drops an unknown DBN', () => {
    const out = buildAnswerResult(
      fakeMessage('{"off_topic":false,"picks":[{"dbn":"99X999","reason":"x"}]}'),
      'q',
      results
    )
    expect(out.reasons).toEqual([])
  })

  it('maps off_topic true to the off_topic guardrail', () => {
    const out = buildAnswerResult(fakeMessage('{"off_topic":true,"picks":[]}'), 'q', results)
    expect(out.guardrail).toBe('off_topic')
    expect(out.sources).toEqual([])
  })

  it('still parses line-format text through the fallback', () => {
    const out = buildAnswerResult(fakeMessage('01M001 | near transit'), 'q', results)
    expect(out.reasons).toEqual([{ dbn: '01M001', reason: 'near transit' }])
  })
})
