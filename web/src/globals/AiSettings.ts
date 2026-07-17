import type { GlobalConfig } from 'payload'

import { adminOnly, anyone } from '../access'

// Runtime LLM switching from the admin panel (brief requirement: "swap LLMs =
// config change" — this makes it a dropdown, no redeploy). The AI service reads
// this global via REST and falls back to the LLM_MODEL env var when unset.
export const AiSettings: GlobalConfig = {
  slug: 'ai-settings',
  label: 'AI Settings',
  access: {
    // The model id is not a secret; the AI service reads it without a session
    read: anyone,
    update: adminOnly,
  },
  fields: [
    {
      name: 'llmModel',
      label: 'LLM model',
      type: 'select',
      defaultValue: '',
      options: [
        { label: 'Server default (LLM_MODEL env)', value: '' },
        // Free tiers, researched 2026-07: Groq is the best free option
        // (14,400 req/day, ~320 tok/s, commercial use OK) — needs GROQ_API_KEY.
        { label: 'Groq · Llama 3.3 70B (best free: fast + generous quota)', value: 'groq/llama-3.3-70b-versatile' },
        { label: 'Groq · Llama 3.1 8B (fastest, lighter quality)', value: 'groq/llama-3.1-8b-instant' },
        { label: 'Gemini · Flash Lite (works on current key, high quota)', value: 'gemini/gemini-flash-lite-latest' },
        { label: 'Gemini · Flash (best quality on current key, ~20 req/day)', value: 'gemini/gemini-flash-latest' },
        { label: 'Mistral · Small (needs MISTRAL_API_KEY, training opt-in)', value: 'mistral/mistral-small-latest' },
        { label: 'Cerebras · GPT-OSS 120B (fastest throughput, volatile catalog)', value: 'cerebras/gpt-oss-120b' },
      ],
      admin: {
        description:
          'Model used by all AI features (summaries, chat, snippets). The provider API key must be set in the AI service .env (GROQ_API_KEY, GEMINI_API_KEY, …).',
      },
    },
    {
      name: 'customModel',
      label: 'Custom model override',
      type: 'text',
      admin: {
        description:
          'Optional. Any LiteLLM model id (provider/model), overrides the dropdown. Example: ollama/llama3.1',
      },
    },
  ],
}
