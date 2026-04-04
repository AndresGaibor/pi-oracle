# Page Objects Method Call Reference

**Purpose:** Detailed mapping of ChatGPTPage method calls within ChatGPTJobRunner workflow

---

## Method Call Map

### 1. getAssistantMessages() — 2 call sites

#### Call Site 1: Baseline Count (Line 363)
```typescript
// ChatGPTJobRunner.ts:362-364
async sendPrompt(prompt: string): Promise<{ baselineAssistantCount: number }> {
    const baselineAssistantCount = (await this.chatGPT.getAssistantMessages(browserActions)).length;
    await this.logFn(`Assistant response count before send: ${baselineAssistantCount}`);
```

**Purpose:** Count existing assistant messages before sending new prompt  
**Return usage:** `.length` property to get count  
**Error handling:** None — assumes successful call

---

#### Call Site 2: Wait Loop (Line 421)
```typescript
// ChatGPTJobRunner.ts:417-427
async waitForChatCompletion(baselineAssistantCount: number): Promise<...> {
    // ...
    while (Date.now() < timeoutAt) {
        await this.heartbeatFn();
        const snapshot = await browser.snapshotText();
        const messages = await this.chatGPT.getAssistantMessages(browserActions);
        const targetMessage = messages[baselineAssistantCount];
        const targetText = targetMessage?.text || "";
        // ...
    }
```

**Purpose:** Poll for new assistant messages in completion loop  
**Return usage:** Array indexed to get specific message at baseline index  
**Error handling:** None — assumes successful call  
**Polling interval:** `this.job.config.worker.pollMs`

---

### 2. clickComposer() — 1 call site

#### Call Site: Pre-Type (Line 367)
```typescript
// ChatGPTJobRunner.ts:366-370
async sendPrompt(prompt: string): Promise<{ baselineAssistantCount: number }> {
    // ...
    // Click composer
    await this.chatGPT.clickComposer(browserActions);

    // Type prompt via JS
    await this.chatGPT.typePrompt(browserActions, prompt);
```

**Purpose:** Focus composer textbox before typing  
**Return usage:** None — void return  
**Error handling:** Throws if composer not found in snapshot  
**Execution order:** Always precedes typePrompt

---

### 3. typePrompt() — 1 call site

#### Call Site: Text Input (Line 370)
```typescript
// ChatGPTJobRunner.ts:366-370
async sendPrompt(prompt: string): Promise<{ baselineAssistantCount: number }> {
    // ...
    // Click composer
    await this.chatGPT.clickComposer(browserActions);

    // Type prompt via JS
    await this.chatGPT.typePrompt(browserActions, prompt);

    // Click send
    await this.chatGPT.clickSend(browserActions);
```

**Purpose:** Type user prompt into composer textbox  
**Return usage:** Boolean return not checked  
**Input:** User prompt string  
**Error handling:** None — return value ignored  
**Execution order:** Always after clickComposer, before clickSend

---

### 4. clickSend() — 1 call site

#### Call Site: Submit Prompt (Line 373)
```typescript
// ChatGPTJobRunner.ts:366-373
async sendPrompt(prompt: string): Promise<{ baselineAssistantCount: number }> {
    // ...
    // Click composer
    await this.chatGPT.clickComposer(browserActions);

    // Type prompt via JS
    await this.chatGPT.typePrompt(browserActions, prompt);

    // Click send
    await this.chatGPT.clickSend(browserActions);

    return { baselineAssistantCount };
```

**Purpose:** Click send button to dispatch prompt  
**Return usage:** None — void return  
**Error handling:** Throws if send button not found in snapshot  
**Execution order:** Always last in sendPrompt sequence

---

## Call Flow Diagram

```
ChatGPTJobRunner.sendPrompt()
│
├─ getAssistantMessages()
│  └─ Returns: Array<{ text: string }>
│
├─ clickComposer()
│  └─ Returns: void
│
├─ typePrompt(prompt)
│  └─ Returns: boolean (unused)
│
├─ clickSend()
│  └─ Returns: void
│
└─ return { baselineAssistantCount }
   │
   └─── continues to waitForChatCompletion()
        │
        └─ getAssistantMessages() [polling]
           └─ Returns: Array<{ text: string }>
```

---

## Error Handling Summary

| Method | Error Condition | Handler | Result |
|--------|-----------------|---------|--------|
| clickComposer | Textbox not in snapshot | Throws Error | Halts sendPrompt |
| typePrompt | Textbox not found in DOM | Silent fail | Returns false (unused) |
| clickSend | Button not in snapshot | Throws Error | Halts sendPrompt |
| getAssistantMessages | Any exception | Propagates | Halts calling function |

---

## State Dependencies

### Before sendPrompt()
- Composer must be visible (checked by clickComposer)
- Send button must be visible (checked by clickSend)

### After sendPrompt()
- One new assistant message should appear (verified by waitForChatCompletion)
- URL should stabilize to conversation URL (verified by waitForStableChatUrl)

### During waitForChatCompletion()
- getAssistantMessages polled every `pollMs` milliseconds
- Loop timeout: `completionTimeoutMs`
- Completion condition: Target message text is stable + "Copy response" button visible

---

## Performance Characteristics

| Method | Cost | Polling Frequency | Caching |
|--------|------|-------------------|---------|
| clickComposer | ~50ms (snapshot → clickRef) | Once per prompt | None |
| typePrompt | ~20ms (JS evaluation) | Once per prompt | None |
| clickSend | ~50ms (snapshot → clickRef) | Once per prompt | None |
| getAssistantMessages | ~100ms (JS evaluation) | Every `pollMs` | None |

**Total sendPrompt execution:** ~200-300ms  
**Total waitForChatCompletion:** 30-180 seconds (user dependent)

---

## Code Quality Notes

### ✅ Strengths
- Clear sequential ordering
- No concurrent calls to same method
- Error propagation handled at JobRunner level
- Separation of concerns (actions vs orchestration)

### ⚠️ Observations
- typePrompt return value is ignored (could be logged on failure)
- No retry logic on transient failures
- All methods assume browser still connected

---

## Related Files

| File | Purpose |
|------|---------|
| `extensions/oracle/pages/chatgpt/chatgpt.page.ts` | ChatGPTPage class definition |
| `extensions/oracle/pages/chatgpt/chatgpt.actions.ts` | Action implementations |
| `extensions/oracle/pages/chatgpt/chatgpt.assertions.ts` | Assertion implementations |
| `extensions/oracle/pages/chatgpt/chatgpt.selectors.ts` | Selector definitions |
| `extensions/oracle/lib/ChatGPTJobRunner.ts` | JobRunner (this caller) |
| `extensions/oracle/lib/browser.ts` | Browser abstraction layer |

---

**End of Reference**
