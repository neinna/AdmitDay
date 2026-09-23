import * as fs from 'fs'
import * as path from 'path'

/**
 * __tests__/find-ask-textarea.test.ts
 *
 * Issue #325 — the /find ask box becomes a multi-line, auto-growing
 * textarea with an always-visible character counter and a notice when a
 * paste gets clipped to MAX_QUESTION_LENGTH. Source-text assertions
 * against app/find/FindClient.tsx, following __tests__/account-delete-ui.test.ts's
 * convention for .tsx files that aren't otherwise unit-testable in this
 * repo's node Jest environment.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('/find ask box is a multi-line textarea (issue #325)', () => {
  it('replaces the single-line input with a textarea', () => {
    expect(src).not.toMatch(/<input\s+type="text"/)
    expect(src).toContain('<textarea')
  })

  it('starts at 3 rows and caps growth before switching to scroll', () => {
    const textareaIdx = src.indexOf('<textarea')
    const closeIdx = src.indexOf('/>', textareaIdx)
    const textareaTag = src.slice(textareaIdx, closeIdx)
    expect(textareaTag).toContain('rows={3}')
    expect(textareaTag).toContain('max-h-[11rem]')
    expect(textareaTag).toContain('overflow-y-auto')
  })

  it('keeps the aria-label, placeholder, disabled-while-loading, and maxLength', () => {
    const textareaIdx = src.indexOf('<textarea')
    const closeIdx = src.indexOf('/>', textareaIdx)
    const textareaTag = src.slice(textareaIdx, closeIdx)
    expect(textareaTag).toContain(`aria-label="Describe what you're looking for"`)
    expect(textareaTag).toContain('placeholder="Strong CS, a soccer team, small classes"')
    expect(textareaTag).toContain('disabled={askLoading}')
    expect(textareaTag).toContain('maxLength={MAX_QUESTION_LENGTH}')
  })

  it('keeps the bordered container, the › accent glyph, and the Ask button', () => {
    expect(src).toContain('border border-border-strong')
    expect(src).toContain('font-mono text-[13px] text-accent')
    expect(src).toContain('›')
    expect(src).toMatch(/<Button type="submit" disabled=\{askLoading\}>\s*Ask/)
  })

  it('auto-grows the textarea height from its scrollHeight as askText changes', () => {
    const effectIdx = src.indexOf("el.style.height = 'auto'")
    expect(effectIdx).toBeGreaterThan(-1)
    const effectBody = src.slice(effectIdx, effectIdx + 250)
    expect(effectBody).toContain('el.style.height = `${el.scrollHeight}px`')
    expect(effectBody).toContain('[askText]')
  })
})

describe('Enter submits, Shift+Enter inserts a newline (issue #325)', () => {
  it('handleAskKeyDown only submits on a plain Enter, not Shift+Enter or mid-composition', () => {
    const fnIdx = src.indexOf('function handleAskKeyDown')
    const fnBody = src.slice(fnIdx, src.indexOf('\n  }', fnIdx))
    expect(fnBody).toContain("e.key === 'Enter'")
    expect(fnBody).toContain('!e.shiftKey')
    expect(fnBody).toContain('!e.nativeEvent.isComposing')
    expect(fnBody).toContain('e.preventDefault()')
    expect(fnBody).toContain('requestSubmit()')
  })

  it('wires the textarea to handleAskKeyDown', () => {
    const textareaIdx = src.indexOf('<textarea')
    const closeIdx = src.indexOf('/>', textareaIdx)
    expect(src.slice(textareaIdx, closeIdx)).toContain('onKeyDown={handleAskKeyDown}')
  })
})

describe('the character counter always renders (issue #325)', () => {
  it('is not gated behind a near-limit condition anymore', () => {
    expect(src).not.toMatch(/MAX_QUESTION_LENGTH - askText\.length <= 50\s*&&/)
  })

  it('renders "{length} / {MAX_QUESTION_LENGTH}" unconditionally, so it shows at 0 and at every length', () => {
    expect(src).toContain('{askText.length} / {MAX_QUESTION_LENGTH}')
  })

  it('turns a warning color only once <= 50 characters remain', () => {
    const counterIdx = src.indexOf('{askText.length} / {MAX_QUESTION_LENGTH}')
    const blockStart = src.lastIndexOf('<p', counterIdx)
    const blockEnd = src.indexOf('</p>', counterIdx)
    const block = src.slice(blockStart, blockEnd)
    expect(block).toContain('MAX_QUESTION_LENGTH - askText.length <= 50')
    expect(block).toContain('text-red-700')
    expect(block).toContain('text-faint')
  })

  it('scopes aria-live to the near-limit state instead of announcing every keystroke', () => {
    const counterIdx = src.indexOf('{askText.length} / {MAX_QUESTION_LENGTH}')
    const blockStart = src.lastIndexOf('<p', counterIdx)
    const blockEnd = src.indexOf('</p>', counterIdx)
    const block = src.slice(blockStart, blockEnd)
    expect(block).toContain('aria-live={MAX_QUESTION_LENGTH - askText.length <= 50 ? \'polite\' : undefined}')
  })
})

describe('an over-limit paste is clipped and announced, not silently dropped (issue #325)', () => {
  it('handleAskPaste computes the post-paste value itself instead of trusting maxLength', () => {
    const fnIdx = src.indexOf('function handleAskPaste')
    expect(fnIdx).toBeGreaterThan(-1)
    const fnBody = src.slice(fnIdx, src.indexOf('\n  }', fnIdx))
    expect(fnBody).toContain('e.clipboardData.getData')
    expect(fnBody).toContain('nextValue.length > MAX_QUESTION_LENGTH')
  })

  it('blocks the native insert and sets the trimmed flag when the paste would overflow', () => {
    const fnIdx = src.indexOf('function handleAskPaste')
    const overflowIdx = src.indexOf('nextValue.length > MAX_QUESTION_LENGTH', fnIdx)
    const elseIdx = src.indexOf('} else {', overflowIdx)
    const overflowBranch = src.slice(overflowIdx, elseIdx)
    expect(overflowBranch).toContain('e.preventDefault()')
    expect(overflowBranch).toContain('setAskText(nextValue.slice(0, MAX_QUESTION_LENGTH))')
    expect(overflowBranch).toContain('setPasteWasTrimmed(true)')
  })

  it('clears the trimmed flag on a paste that fits, and on the next real edit', () => {
    const fnIdx = src.indexOf('function handleAskPaste')
    const elseIdx = src.indexOf('} else {', fnIdx)
    const elseBranch = src.slice(elseIdx, src.indexOf('\n  }', elseIdx))
    expect(elseBranch).toContain('setPasteWasTrimmed(false)')

    const changeFnIdx = src.indexOf('function handleAskChange')
    const changeFnBody = src.slice(changeFnIdx, src.indexOf('\n  }', changeFnIdx))
    expect(changeFnBody).toContain('setPasteWasTrimmed(false)')
  })

  it('does not clear the flag from the onChange that the browser would fire for its own truncation', () => {
    // The paste handler prevents the browser's own insert on overflow (asserted
    // above), so no native input/onChange event fires for that same paste —
    // onChange only clearing the flag is therefore safe and does not race it.
    const pasteFnIdx = src.indexOf('function handleAskPaste')
    const pasteFnBody = src.slice(pasteFnIdx, src.indexOf('\n  function handleAskKeyDown', pasteFnIdx))
    const preventDefaultCount = (pasteFnBody.match(/e\.preventDefault\(\)/g) ?? []).length
    expect(preventDefaultCount).toBe(1)
  })

  it('renders the trimmed notice near the counter', () => {
    expect(src).toContain('Pasted text was trimmed to')
    const noticeIdx = src.indexOf('Pasted text was trimmed to')
    const counterIdx = src.indexOf('{askText.length} / {MAX_QUESTION_LENGTH}')
    expect(counterIdx).toBeGreaterThan(-1)
    expect(Math.abs(noticeIdx - counterIdx)).toBeLessThan(600)
    expect(src.slice(Math.max(0, noticeIdx - 120), noticeIdx)).toContain('pasteWasTrimmed &&')
  })

  it('wires the textarea to handleAskPaste', () => {
    const textareaIdx = src.indexOf('<textarea')
    const closeIdx = src.indexOf('/>', textareaIdx)
    expect(src.slice(textareaIdx, closeIdx)).toContain('onPaste={handleAskPaste}')
  })
})
